using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using KyPdks.Shared;
using Microsoft.Win32;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow : Window
{
    private readonly PdksPaths _paths = new();
    private readonly LocalPdksStore _store;
    private readonly AttendanceStore _attendance;
    private readonly PdksOperationsStore _operations;
    private readonly ConfigStore _configStore;
    private readonly SecureSessionStore _sessionStore;
    private readonly ErpApiClient _erp = new();
    private readonly PunchImportService _importer;
    private readonly CancellationTokenSource _lifetime = new();
    private CancellationTokenSource? _approvalCts;
    private AuthFlow? _authFlow;
    private string _token = "";
    private string _role = "";
    private string _userName = "";
    private bool _busy;
    private IReadOnlyList<CachedPerson> _people = Array.Empty<CachedPerson>();
    private IReadOnlyList<AttendanceDayRow> _attendanceRows = Array.Empty<AttendanceDayRow>();
    private IReadOnlyList<TimesheetRow> _timesheet = Array.Empty<TimesheetRow>();
    private IReadOnlyList<AdvanceRow> _advances = Array.Empty<AdvanceRow>();

    private bool CanWrite => !string.IsNullOrWhiteSpace(_token)
        && !string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);

    public PdksWorkbenchWindow()
    {
        InitializeComponent();
        _store = new LocalPdksStore(_paths);
        _attendance = new AttendanceStore(_paths);
        _operations = new PdksOperationsStore(_paths);
        _configStore = new ConfigStore(_paths);
        _sessionStore = new SecureSessionStore(_paths);
        _importer = new PunchImportService(_store);
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await _store.InitializeAsync(_lifetime.Token);
            await _operations.InitializeAsync(_lifetime.Token);
            await _attendance.InitializeAsync(_lifetime.Token);
            InitializeEditors();
            DeviceText.Text = _paths.DeviceLabel;
            await RestoreSessionAsync();
            await RefreshAllAsync();
            StatusText.Text = "PDKS hazır. Günlük işlem akışından devam edin.";
        }
        catch (Exception error)
        {
            StatusText.Text = $"Başlatma hatası: {error.Message}";
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _approvalCts?.Cancel();
        _lifetime.Cancel();
        _erp.Dispose();
    }

    private void InitializeEditors()
    {
        var months = CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames
            .Take(12).Select((name, index) => new MonthOption(index + 1, name)).ToArray();
        MonthCombo.ItemsSource = months;
        MonthCombo.SelectedValue = DateTime.Today.Month;
        YearCombo.ItemsSource = Enumerable.Range(DateTime.Today.Year - 4, 6).Reverse().ToArray();
        YearCombo.SelectedItem = DateTime.Today.Year;

        var today = DateTime.Today;
        CorrectionDatePicker.SelectedDate = today;
        LeaveStartPicker.SelectedDate = today;
        LeaveEndPicker.SelectedDate = today;
        AdvanceDatePicker.SelectedDate = today;
        CorrectionStatusCombo.SelectedIndex = 0;
        LeaveTypeCombo.SelectedIndex = 0;
        MfaProviderCombo.SelectedIndex = 0;
    }

    private (int Year, int Month) SelectedPeriod()
    {
        var year = YearCombo.SelectedItem is int y ? y : DateTime.Today.Year;
        var month = MonthCombo.SelectedValue is int m ? m : DateTime.Today.Month;
        return (year, month);
    }

    private async Task RestoreSessionAsync()
    {
        var session = _sessionStore.Load();
        if (session is null || !session.IsUsable)
        {
            if (session is not null) _sessionStore.Clear();
            SetLoggedOutUi();
            return;
        }

        _token = session.Token;
        _role = session.Role;
        _userName = session.UserName;
        SetLoggedInUi(session.FullName, session.UserName, session.Role, false);
        try
        {
            var me = await _erp.GetMeAsync(_token, _lifetime.Token);
            _role = string.IsNullOrWhiteSpace(me.Role) ? session.Role : me.Role;
            _userName = string.IsNullOrWhiteSpace(me.UserName) ? session.UserName : me.UserName;
            var fullName = string.IsNullOrWhiteSpace(me.FullName) ? session.FullName : me.FullName;
            _sessionStore.Save(_token, _userName, fullName, _role);
            SetLoggedInUi(fullName, _userName, _role, true);
            await RefreshPeopleFromErpAsync(false);
        }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            ClearSession("ERP oturumu sona erdi. Yeniden giriş yapın.");
        }
        catch (Exception error)
        {
            ErpStateText.Text = "ERP: Çevrimdışı";
            LoginNoticeText.Text = $"Yerel çalışma aktif. ERP erişimi: {error.Message}";
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        var identity = UsernameBox.Text.Trim();
        var password = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(identity) || string.IsNullOrEmpty(password))
        {
            LoginNoticeText.Text = "Kullanıcı adı/e-posta ve parola zorunludur.";
            return;
        }

        await BusyAsync("KY ERP hesabı doğrulanıyor...", async () =>
        {
            var flow = await _erp.LoginAsync(identity, password, _paths.DeviceLabel, _lifetime.Token);
            PasswordBox.Clear();
            await HandleAuthFlowAsync(flow);
        });
    }

    private async void MfaButton_Click(object sender, RoutedEventArgs e)
    {
        if (_authFlow is null || _busy) return;
        await BusyAsync("MFA doğrulanıyor...", async () =>
        {
            var provider = SelectedTag(MfaProviderCombo);
            var flow = await _erp.VerifyMfaAsync(_authFlow, MfaCodeBox.Text, provider, _lifetime.Token);
            MfaCodeBox.Clear();
            await HandleAuthFlowAsync(flow);
        });
    }

    private async Task HandleAuthFlowAsync(AuthFlow flow)
    {
        _authFlow = flow;
        var stage = (flow.Stage ?? "").Trim().ToUpperInvariant();
        switch (stage)
        {
            case "AUTHENTICATED":
                if (string.IsNullOrWhiteSpace(flow.Token)) throw new InvalidOperationException("ERP geçerli oturum tokenı döndürmedi.");
                _approvalCts?.Cancel();
                _token = flow.Token;
                _role = flow.Role;
                _userName = flow.UserName;
                _sessionStore.Save(flow.Token, flow.UserName, flow.FullName, flow.Role);
                SetLoggedInUi(flow.FullName, flow.UserName, flow.Role, true);
                await RefreshPeopleFromErpAsync(true);
                LoginNoticeText.Text = "ERP bağlantısı hazır.";
                break;
            case "MFA_REQUIRED":
            case "MFA_LEGACY_REQUIRED":
                LoginPanel.Visibility = Visibility.Collapsed;
                MfaPanel.Visibility = Visibility.Visible;
                SelectTag(MfaProviderCombo, string.Equals(flow.Provider, "MICROSOFT", StringComparison.OrdinalIgnoreCase) ? "MICROSOFT" : "GOOGLE");
                LoginNoticeText.Text = "Authenticator uygulamasındaki 6 haneli kodu girin.";
                break;
            case "APPROVAL_PENDING":
                LoginPanel.Visibility = Visibility.Collapsed;
                MfaPanel.Visibility = Visibility.Collapsed;
                LoginNoticeText.Text = string.IsNullOrWhiteSpace(flow.Message) ? "Giriş onayı bekleniyor..." : flow.Message;
                _approvalCts?.Cancel();
                _approvalCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
                _ = PollApprovalAsync(flow, _approvalCts.Token);
                break;
            case "MFA_SETUP":
                LoginNoticeText.Text = "Authenticator kurulumu KY ERP web güvenlik ekranından tamamlanmalı.";
                break;
            default:
                LoginNoticeText.Text = string.IsNullOrWhiteSpace(flow.Message) ? $"Giriş tamamlanamadı: {flow.Stage}" : flow.Message;
                break;
        }
    }

    private async Task PollApprovalAsync(AuthFlow flow, CancellationToken ct)
    {
        var current = flow;
        var until = DateTimeOffset.Now.AddMinutes(10);
        while (!ct.IsCancellationRequested && DateTimeOffset.Now < until)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(3), ct);
                current = await _erp.CheckApprovalAsync(current, ct);
                if (string.Equals(current.Stage, "APPROVAL_PENDING", StringComparison.OrdinalIgnoreCase))
                {
                    LoginNoticeText.Text = string.IsNullOrWhiteSpace(current.Message) ? "Giriş onayı bekleniyor..." : current.Message;
                    continue;
                }
                await HandleAuthFlowAsync(current);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception error) { LoginNoticeText.Text = $"Onay kontrolü: {error.Message}"; }
        }
        LoginPanel.Visibility = Visibility.Visible;
        LoginNoticeText.Text = "Giriş onayı süresi doldu. Yeniden giriş yapın.";
    }

    private async void LogoutButton_Click(object sender, RoutedEventArgs e)
    {
        var token = _token;
        ClearSession("Oturum kapatıldı. Agent kart toplamaya devam eder.");
        try { if (!string.IsNullOrWhiteSpace(token)) await _erp.LogoutAsync(token, _lifetime.Token); } catch { }
    }

    private void SetLoggedInUi(string fullName, string userName, string role, bool online)
    {
        LoginPanel.Visibility = Visibility.Collapsed;
        MfaPanel.Visibility = Visibility.Collapsed;
        AccountPanel.Visibility = Visibility.Visible;
        AccountText.Text = string.IsNullOrWhiteSpace(fullName) ? userName : fullName;
        RoleText.Text = $"{userName} · {role}";
        ErpStateText.Text = online ? "ERP: Bağlı" : "ERP: Çevrimdışı oturum";
        SetWriteControls();
    }

    private void SetLoggedOutUi()
    {
        LoginPanel.Visibility = Visibility.Visible;
        MfaPanel.Visibility = Visibility.Collapsed;
        AccountPanel.Visibility = Visibility.Collapsed;
        ErpStateText.Text = "ERP: Oturum yok";
        SetWriteControls();
    }

    private void ClearSession(string message)
    {
        _approvalCts?.Cancel();
        _sessionStore.Clear();
        _token = "";
        _role = "";
        _userName = "";
        _authFlow = null;
        SetLoggedOutUi();
        LoginNoticeText.Text = message;
    }

    private void SetWriteControls()
    {
        var enabled = CanWrite;
        ProcessButton.IsEnabled = enabled;
        ClosePeriodButton.IsEnabled = enabled;
        CorrectionSaveButton.IsEnabled = enabled;
        LeaveSaveButton.IsEnabled = enabled;
        AdvanceSaveButton.IsEnabled = enabled;
    }

    private async Task RefreshPeopleFromErpAsync(bool refreshAttendance)
    {
        if (string.IsNullOrWhiteSpace(_token)) throw new InvalidOperationException("Önce KY ERP hesabıyla giriş yapın.");
        _people = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
        await _store.CachePeopleAsync(_people, _lifetime.Token);
        BindPeople();
        if (refreshAttendance)
        {
            var (year, month) = SelectedPeriod();
            await RefreshErpAttendanceCacheAsync(year, month);
        }
    }

    private void BindPeople()
    {
        CorrectionPersonCombo.ItemsSource = _people;
        LeavePersonCombo.ItemsSource = _people;
        AdvancePersonCombo.ItemsSource = _people;
        PersonCountText.Text = _people.Count.ToString(CultureInfo.InvariantCulture);
    }

    private async Task RefreshErpAttendanceCacheAsync(int year, int month)
    {
        if (string.IsNullOrWhiteSpace(_token) || _people.Count == 0) return;
        using var gate = new SemaphoreSlim(4);
        var tasks = _people.Select(async person =>
        {
            await gate.WaitAsync(_lifetime.Token);
            try
            {
                var days = await _erp.GetAttendanceMonthAsync(_token, person, year, month, _lifetime.Token);
                await _attendance.CacheEmployeeMonthAsync(person.Id, year, month, days, _lifetime.Token);
            }
            finally { gate.Release(); }
        });
        await Task.WhenAll(tasks);
    }

    private async Task RefreshAllAsync()
    {
        _people = await _store.GetPeopleAsync(_lifetime.Token);
        BindPeople();
        var (year, month) = SelectedPeriod();
        _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
        _timesheet = AttendanceStore.BuildTimesheet(_attendanceRows);
        _advances = await _operations.GetAdvancesAsync(_lifetime.Token);
        AttendanceGrid.ItemsSource = _attendanceRows.OrderByDescending(x => x.Date).ThenBy(x => x.FullName).ToArray();
        TimesheetGrid.ItemsSource = _timesheet;
        var snapshot = await _store.SnapshotAsync(_lifetime.Token);
        PunchGrid.ItemsSource = snapshot.Rows;
        PunchCountText.Text = snapshot.TodayCount.ToString(CultureInfo.InvariantCulture);
        PendingCountText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
        AgentStateText.Text = snapshot.AgentOnline ? $"Agent: Çalışıyor · {snapshot.AgentMode}" : "Agent: Bağlantı yok";
        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var relevant = _attendanceRows.Where(x => string.CompareOrdinal(x.Date, today) <= 0).ToArray();
        MissingCountText.Text = relevant.Count(IsMissing).ToString(CultureInfo.InvariantCulture);
        WorkedCountText.Text = relevant.Count(x => x.Status is "CALISTI" or "EKSIK_BASIM").ToString(CultureInfo.InvariantCulture);
        var periods = await _operations.GetPeriodsAsync(_lifetime.Token);
        var period = periods.FirstOrDefault(x => x.Year == year && x.Month == month);
        PeriodStateText.Text = string.Equals(period?.Status, "CLOSED", StringComparison.OrdinalIgnoreCase) ? "KAPALI" : "AÇIK";
        PeriodStateText.Foreground = string.Equals(period?.Status, "CLOSED", StringComparison.OrdinalIgnoreCase)
            ? System.Windows.Media.Brushes.Firebrick : System.Windows.Media.Brushes.ForestGreen;
    }

    private async void ImportCardsButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        var dialog = new OpenFileDialog
        {
            Title = "Kart hareket dosyalarını seçin",
            Filter = "Kart dosyaları|*.txt;*.csv;*.dat;*.log|Tüm dosyalar|*.*",
            Multiselect = true,
        };
        if (dialog.ShowDialog(this) != true) return;

        await BusyAsync("Kart dosyaları okunuyor...", async () =>
        {
            var config = _configStore.Load();
            var result = await _importer.ImportFilesAsync(dialog.FileNames, config.LineEncoding, _lifetime.Token);
            if (result.Errors.Count > 0)
            {
                var rejectFile = Path.Combine(_paths.Reject, $"manual-import-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
                await File.WriteAllLinesAsync(rejectFile, result.Errors, new UTF8Encoding(true), _lifetime.Token);
            }
            await _operations.AuditAsync("MANUAL_IMPORT", _paths.DeviceLabel,
                $"Dosya {result.Files}, okunan {result.Parsed}, yeni {result.Added}, tekrar {result.Duplicate}, red {result.Rejected}", _userName, _lifetime.Token);
            StatusText.Text = $"Bilgi aktar tamamlandı · yeni {result.Added} · tekrar {result.Duplicate} · okunamayan {result.Rejected}";
            await RefreshAllAsync();
            if (CanWrite && result.Added > 0 && config.AutoSync) await SyncPendingAsync();
        });
    }

    private async void RefreshPeopleButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("ERP personeli yenileniyor...", async () =>
        {
            await RefreshPeopleFromErpAsync(false);
            await RefreshAllAsync();
            StatusText.Text = $"ERP personeli yenilendi · {_people.Count} SGK'lı kartlı personel.";
        });
    }

    private async void ProcessPunchesButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Bekleyen kartlar ERP'ye işleniyor...", SyncPendingAsync);
    }

    private async Task SyncPendingAsync()
    {
        if (!CanWrite) throw new InvalidOperationException("Kart senkronu için yazma yetkili ERP hesabı gerekir.");
        if (SecureSessionStore.JwtExpiry(_token) <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 10)
            throw new InvalidOperationException("ERP oturumunun süresi doldu. Yeniden giriş yapın.");

        await RefreshPeopleFromErpAsync(false);
        var byCard = _people.ToDictionary(x => x.CardNo, StringComparer.OrdinalIgnoreCase);
        var pending = await _store.GetPendingAsync(1000, _lifetime.Token);
        if (pending.Count == 0)
        {
            StatusText.Text = "İşlenecek bekleyen kart yok.";
            return;
        }

        var valid = new List<PunchRow>();
        var invalid = new List<PunchRow>();
        foreach (var row in pending)
        {
            if (!byCard.TryGetValue(row.CardNo, out var person)) { invalid.Add(row); continue; }
            if ((!string.IsNullOrWhiteSpace(person.StartDate) && string.CompareOrdinal(row.WorkDate, person.StartDate) < 0)
                || (!string.IsNullOrWhiteSpace(person.ExitDate) && string.CompareOrdinal(row.WorkDate, person.ExitDate) > 0))
            { invalid.Add(row); continue; }
            valid.Add(row);
        }

        if (invalid.Count > 0)
            await _store.MarkLocalErrorAsync(invalid, "SGK=VAR + kart/personel veya çalışma dönemi eşleşmesi yok.", _lifetime.Token);

        if (valid.Count > 0)
        {
            var historyId = await _store.StartSyncHistoryAsync(valid.Count, _lifetime.Token);
            try
            {
                var result = await _erp.SyncPunchesAsync(_token, valid, _paths.DeviceLabel, _lifetime.Token);
                await _store.ApplySyncResultAsync(valid, result, _lifetime.Token);
                await _store.FinishSyncHistoryAsync(historyId, result.AcceptedCount, result.RejectedCount, "OK", "", _lifetime.Token);
                await _operations.AuditAsync("ERP_SYNC", _paths.DeviceLabel,
                    $"Kabul {result.AcceptedCount}, red {result.RejectedCount}, yerel kontrol {invalid.Count}", _userName, _lifetime.Token);
                StatusText.Text = $"Kart işleme tamamlandı · ERP kabul {result.AcceptedCount} · red {result.RejectedCount} · kontrol {invalid.Count}";
            }
            catch (Exception error)
            {
                await _store.FinishSyncHistoryAsync(historyId, 0, 0, "FAILED", error.Message, CancellationToken.None);
                throw;
            }
        }
        else StatusText.Text = $"{invalid.Count} kart personel/dönem kontrolü bekliyor.";

        var (year, month) = SelectedPeriod();
        await RefreshErpAttendanceCacheAsync(year, month);
        await RefreshAllAsync();
    }

    private async void CalculateAttendanceButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Puantaj yeniden hesaplanıyor...", async () =>
        {
            var (year, month) = SelectedPeriod();
            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            await RefreshAllAsync();
            ShowAllDays();
            StatusText.Text = $"{month:D2}/{year} puantajı hesaplandı · {_timesheet.Count} personel.";
        });
    }

    private async void FindMissingButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Eksik günler bulunuyor...", async () =>
        {
            var (year, month) = SelectedPeriod();
            _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
            var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var missing = _attendanceRows.Where(x => string.CompareOrdinal(x.Date, today) <= 0 && IsMissing(x))
                .OrderByDescending(x => x.Date).ThenBy(x => x.FullName).ToArray();
            ShowAttendanceGrid(missing, "Kontrol Gereken Günler", $"{missing.Length} eksik/tek basım/kart yok kaydı bulundu. Satırı seçip soldan düzeltin.");
            MissingCountText.Text = missing.Length.ToString(CultureInfo.InvariantCulture);
            StatusText.Text = missing.Length == 0 ? "Eksik kayıt yok." : $"{missing.Length} kayıt kontrol bekliyor.";
        });
    }

    private async void ClosePeriodWorkflowButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Dönem kapanış kontrolü yapılıyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Dönem kapatma için yazma yetkisi gerekir.");
            var (year, month) = SelectedPeriod();
            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
            var periodEnd = new DateTime(year, month, DateTime.DaysInMonth(year, month));
            var limit = periodEnd < DateTime.Today ? periodEnd : DateTime.Today;
            var limitText = limit.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var missing = _attendanceRows.Where(x => string.CompareOrdinal(x.Date, limitText) <= 0 && IsMissing(x)).ToArray();
            if (missing.Length > 0)
            {
                ShowAttendanceGrid(missing, "Dönem Kapanamaz", $"Önce {missing.Length} kontrol kaydını düzeltin.");
                throw new InvalidOperationException($"Dönem kapatılmadı: {missing.Length} eksik/kart yok kaydı var.");
            }
            await _operations.SetPeriodStatusAsync(year, month, "CLOSED", "İşlem Merkezi kontrollü kapanış", _userName, _lifetime.Token);
            await RefreshAllAsync();
            StatusText.Text = $"{month:D2}/{year} dönemi kontrol edilerek kapatıldı.";
        });
    }

    private async void ExportPayrollWorkflowButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Bordro aktarımı hazırlanıyor...", async () =>
        {
            var (year, month) = SelectedPeriod();
            _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
            _timesheet = AttendanceStore.BuildTimesheet(_attendanceRows);
            _advances = await _operations.GetAdvancesAsync(_lifetime.Token);
            var prefix = $"{year:D4}-{month:D2}-";
            var advances = _advances.Where(x => x.Date.StartsWith(prefix, StringComparison.Ordinal))
                .GroupBy(x => x.EmployeeId).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
            var reportDir = Path.Combine(_paths.Root, "Reports");
            Directory.CreateDirectory(reportDir);
            var path = Path.Combine(reportDir, $"KY-PDKS-BORDRO-{year:D4}-{month:D2}-{DateTime.Now:yyyyMMdd-HHmmss}.csv");
            var lines = new List<string> { "Kod;Personel;Bolum;Kart;Calisilan;YillikIzin;Izin;EksikBasim;KartYok;GecDk;ErkenDk;FazlaDk;Avans" };
            foreach (var row in _timesheet)
            {
                lines.Add(CsvLine(row.PersonnelCode, row.FullName, row.Department, row.CardNo, row.WorkedDays, row.AnnualLeaveDays,
                    row.LeaveDays, row.MissingPunchDays, row.NoPunchDays, row.LateMinutes, row.EarlyMinutes, row.OvertimeMinutes,
                    advances.TryGetValue(row.EmployeeId, out var amount) ? amount.ToString("0.00", CultureInfo.InvariantCulture) : "0.00"));
            }
            await File.WriteAllLinesAsync(path, lines, new UTF8Encoding(true), _lifetime.Token);
            await _operations.AuditAsync("PAYROLL_EXPORT", $"{year:D4}-{month:D2}", path, _userName, _lifetime.Token);
            StatusText.Text = $"Bordro aktarımı hazır: {path}";
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
        });
    }

    private async void BackupWorkflowButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Yerel PDKS yedeği alınıyor...", async () =>
        {
            var path = await _store.BackupAsync(_lifetime.Token);
            await _operations.AuditAsync("BACKUP", _paths.DeviceLabel, path, _userName, _lifetime.Token);
            StatusText.Text = $"Yedek hazır: {path}";
        });
    }

    private void AttendanceGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (AttendanceGrid.SelectedItem is not AttendanceDayRow row) return;
        CorrectionPersonCombo.SelectedItem = _people.FirstOrDefault(x => x.Id == row.EmployeeId);
        if (DateTime.TryParseExact(row.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) CorrectionDatePicker.SelectedDate = date;
        CorrectionInBox.Text = string.IsNullOrWhiteSpace(row.Entry) ? "08:30" : row.Entry;
        CorrectionOutBox.Text = string.IsNullOrWhiteSpace(row.Exit) ? "19:00" : row.Exit;
        CorrectionNoteBox.Text = string.IsNullOrWhiteSpace(row.Note) ? "PDKS düzeltme" : row.Note;
        SelectTag(CorrectionStatusCombo, row.Status is "KART_YOK" or "EKSIK_BASIM" or "IZIN" or "YILLIK_IZIN" ? row.Status : "CALISTI");
    }

    private async void SaveCorrectionButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (CorrectionPersonCombo.SelectedItem is not CachedPerson person || CorrectionDatePicker.SelectedDate is not DateTime date)
        { StatusText.Text = "Düzeltme için personel ve tarih seçin."; return; }
        await BusyAsync("Gün düzeltmesi ERP'ye kaydediliyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Düzeltme için yazma yetkili ERP hesabı gerekir.");
            await EnsurePeriodOpenAsync(date);
            var entry = NormalizeOptionalTime(CorrectionInBox.Text);
            var exit = NormalizeOptionalTime(CorrectionOutBox.Text);
            var status = SelectedTag(CorrectionStatusCombo);
            var late = string.IsNullOrEmpty(entry) ? 0 : Math.Max(0, Minutes(entry) - Minutes("08:35"));
            var early = string.IsNullOrEmpty(exit) ? 0 : Math.Max(0, Minutes("18:50") - Minutes(exit));
            var overtime = string.IsNullOrEmpty(exit) ? 0 : Math.Max(0, Minutes(exit) - Minutes("19:00"));
            await _erp.SaveDayOverrideAsync(_token, person, date.ToString("yyyy-MM-dd"), status, entry, exit, late, early, overtime,
                status == "EKSIK_BASIM", CorrectionNoteBox.Text, _lifetime.Token);
            await _operations.AuditAsync("DAY_OVERRIDE", person.Id, $"{date:yyyy-MM-dd} {entry}-{exit} {status}", _userName, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, date.Year, date.Month);
            await RefreshAllAsync();
            StatusText.Text = $"{person.FullName} · {date:dd.MM.yyyy} düzeltildi.";
        });
    }

    private async void SaveLeaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (LeavePersonCombo.SelectedItem is not CachedPerson person || LeaveStartPicker.SelectedDate is not DateTime start || LeaveEndPicker.SelectedDate is not DateTime end)
        { StatusText.Text = "İzin için personel ve tarihleri seçin."; return; }
        await BusyAsync("İzin kaydediliyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("İzin kaydı için yazma yetkisi gerekir.");
            if (end < start) throw new InvalidOperationException("İzin bitiş tarihi başlangıçtan önce olamaz.");
            await EnsureRangeOpenAsync(start, end);
            var type = SelectedTag(LeaveTypeCombo);
            await _erp.SaveLeaveAsync(_token, person, start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"), type, LeaveNoteBox.Text, _userName, _lifetime.Token);
            await _operations.SaveLeaveAsync(person.Id, start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"), type, LeaveNoteBox.Text, _userName, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, start.Year, start.Month);
            if (start.Year != end.Year || start.Month != end.Month) await RefreshOnePersonMonthAsync(person, end.Year, end.Month);
            await RefreshAllAsync();
            StatusText.Text = $"{person.FullName} izin kaydı ERP + PDKS'ye işlendi.";
        });
    }

    private async void SaveAdvanceButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (AdvancePersonCombo.SelectedItem is not CachedPerson person || AdvanceDatePicker.SelectedDate is not DateTime date)
        { StatusText.Text = "Avans için personel ve tarih seçin."; return; }
        if (!decimal.TryParse(AdvanceAmountBox.Text.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var amount) || amount <= 0)
        { StatusText.Text = "Geçerli bir avans tutarı girin."; return; }
        await BusyAsync("Avans kaydediliyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Avans kaydı için yazma yetkisi gerekir.");
            await EnsurePeriodOpenAsync(date);
            await _erp.SaveAdvanceAsync(_token, person, date.ToString("yyyy-MM-dd"), amount, AdvanceNoteBox.Text, _lifetime.Token);
            await _operations.SaveAdvanceAsync(person.Id, date.ToString("yyyy-MM-dd"), amount, AdvanceNoteBox.Text, _userName, _lifetime.Token);
            AdvanceAmountBox.Clear();
            await RefreshAllAsync();
            StatusText.Text = $"{person.FullName} · {amount:N2} TL avans ERP + PDKS'ye işlendi.";
        });
    }

    private async Task RefreshOnePersonMonthAsync(CachedPerson person, int year, int month)
    {
        var days = await _erp.GetAttendanceMonthAsync(_token, person, year, month, _lifetime.Token);
        await _attendance.CacheEmployeeMonthAsync(person.Id, year, month, days, _lifetime.Token);
    }

    private async Task EnsurePeriodOpenAsync(DateTime date)
    {
        var period = (await _operations.GetPeriodsAsync(_lifetime.Token)).FirstOrDefault(x => x.Year == date.Year && x.Month == date.Month);
        if (string.Equals(period?.Status, "CLOSED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"{date:MM/yyyy} dönemi kapalı. Önce Detay Yönetim > Dönemler'den açın.");
    }

    private async Task EnsureRangeOpenAsync(DateTime start, DateTime end)
    {
        for (var cursor = new DateTime(start.Year, start.Month, 1); cursor <= new DateTime(end.Year, end.Month, 1); cursor = cursor.AddMonths(1))
            await EnsurePeriodOpenAsync(cursor);
    }

    private void ShowAllDaysButton_Click(object sender, RoutedEventArgs e) => ShowAllDays();

    private void ShowAllDays()
    {
        ShowAttendanceGrid(_attendanceRows.OrderByDescending(x => x.Date).ThenBy(x => x.FullName).ToArray(),
            "Aylık Giriş / Çıkış Kontrolü", "Kart hareketleri ve hesaplanan günlük durumlar");
    }

    private void ShowTimesheetButton_Click(object sender, RoutedEventArgs e)
    {
        AttendanceGrid.Visibility = Visibility.Collapsed;
        PunchGrid.Visibility = Visibility.Collapsed;
        TimesheetGrid.Visibility = Visibility.Visible;
        GridTitleText.Text = "Puantaj Sonuçları";
        GridSubtitleText.Text = "Personel bazında aylık çalışma, izin, eksik basım ve süre toplamları";
    }

    private async void ShowPunchesButton_Click(object sender, RoutedEventArgs e)
    {
        var snapshot = await _store.SnapshotAsync(_lifetime.Token);
        PunchGrid.ItemsSource = snapshot.Rows;
        AttendanceGrid.Visibility = Visibility.Collapsed;
        TimesheetGrid.Visibility = Visibility.Collapsed;
        PunchGrid.Visibility = Visibility.Visible;
        GridTitleText.Text = "Ham Kart Hareketleri";
        GridSubtitleText.Text = "Terminal/dosya kaynağından gelen değiştirilmeyen ham kayıtlar";
    }

    private void ShowAttendanceGrid(IEnumerable<AttendanceDayRow> rows, string title, string subtitle)
    {
        AttendanceGrid.ItemsSource = rows;
        AttendanceGrid.Visibility = Visibility.Visible;
        TimesheetGrid.Visibility = Visibility.Collapsed;
        PunchGrid.Visibility = Visibility.Collapsed;
        GridTitleText.Text = title;
        GridSubtitleText.Text = subtitle;
    }

    private void OpenAdministrationButton_Click(object sender, RoutedEventArgs e)
    {
        var window = new MainWindow { Owner = this };
        window.Show();
    }

    private async Task BusyAsync(string message, Func<Task> action)
    {
        if (_busy) return;
        _busy = true;
        StatusText.Text = message;
        try { await action(); }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            ClearSession("ERP oturumu sona erdi. Yerel veriler korunuyor.");
            StatusText.Text = "ERP oturumu sona erdi. Yeniden giriş yapın.";
        }
        catch (Exception error) { StatusText.Text = error.Message; }
        finally { _busy = false; SetWriteControls(); }
    }

    private static bool IsMissing(AttendanceDayRow row) => row.MissingPunch || row.Status is "KART_YOK" or "EKSIK_BASIM" or "DEVAMSIZ";

    private static string NormalizeOptionalTime(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var clean = value.Trim();
        if (!TimeSpan.TryParse(clean, CultureInfo.InvariantCulture, out var time) || time < TimeSpan.Zero || time >= TimeSpan.FromDays(1))
            throw new InvalidOperationException($"Saat geçersiz: {value}");
        return $"{(int)time.TotalHours:D2}:{time.Minutes:D2}";
    }

    private static int Minutes(string value)
    {
        var parts = value.Split(':');
        return parts.Length >= 2 && int.TryParse(parts[0], out var h) && int.TryParse(parts[1], out var m) ? h * 60 + m : 0;
    }

    private static string CsvLine(params object?[] values) => string.Join(';', values.Select(value =>
    {
        var text = value?.ToString() ?? "";
        if (text.Contains(';') || text.Contains('"') || text.Contains('\n') || text.Contains('\r')) return $"\"{text.Replace("\"", "\"\"")}\"";
        return text;
    }));

    private static string SelectedTag(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";

    private static void SelectTag(ComboBox combo, string tag)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
        {
            if (!string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) continue;
            combo.SelectedItem = item;
            return;
        }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private sealed record MonthOption(int Value, string Name);
}
