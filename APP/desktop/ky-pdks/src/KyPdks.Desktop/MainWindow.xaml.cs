using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class MainWindow : Window
{
    private readonly PdksPaths _paths = new();
    private readonly LocalPdksStore _store;
    private readonly AttendanceStore _attendance;
    private readonly PdksOperationsStore _operations;
    private readonly ConfigStore _configStore;
    private readonly SecureSessionStore _sessionStore;
    private readonly ErpApiClient _erp = new();
    private readonly DispatcherTimer _refreshTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer _autoSyncTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private readonly CancellationTokenSource _lifetime = new();
    private CancellationTokenSource? _approvalCts;
    private AuthFlow? _authFlow;
    private string _token = "";
    private string _role = "";
    private string _userName = "";
    private bool _syncing;
    private bool _periodLoading;
    private DateTimeOffset _nextAutoSync = DateTimeOffset.MinValue;
    private IReadOnlyList<CachedPerson> _people = Array.Empty<CachedPerson>();
    private IReadOnlyList<AttendanceDayRow> _attendanceRows = Array.Empty<AttendanceDayRow>();
    private IReadOnlyList<TimesheetRow> _timesheet = Array.Empty<TimesheetRow>();
    private IReadOnlyList<WorkGroupRow> _groups = Array.Empty<WorkGroupRow>();
    private IReadOnlyList<AdvanceRow> _advances = Array.Empty<AdvanceRow>();

    private bool CanWrite => !string.IsNullOrWhiteSpace(_token) && !string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);

    public MainWindow()
    {
        InitializeComponent();
        _store = new LocalPdksStore(_paths);
        _attendance = new AttendanceStore(_paths);
        _operations = new PdksOperationsStore(_paths);
        _configStore = new ConfigStore(_paths);
        _sessionStore = new SecureSessionStore(_paths);
        _refreshTimer.Tick += async (_, _) => await SafeRefreshAsync();
        _autoSyncTimer.Tick += async (_, _) => await AutoSyncTickAsync();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await _store.InitializeAsync(_lifetime.Token);
            await _operations.InitializeAsync(_lifetime.Token);
            await _attendance.InitializeAsync(_lifetime.Token);
            DeviceText.Text = $"Cihaz: {_paths.DeviceLabel}";
            DeviceIdText.Text = _paths.DeviceLabel;
            DatabasePathText.Text = _paths.Database;
            InitializePeriodSelectors();
            InitializeEditors();
            LoadSettings();
            await LoadCachedPeopleAsync();
            await RefreshOperationsAsync();
            await RestoreSessionAsync();
            await RefreshLocalAsync();
            SetWriteControls();
            _refreshTimer.Start();
            _autoSyncTimer.Start();
        }
        catch (Exception error)
        {
            NoticeText.Text = $"Başlatma hatası: {error.Message}";
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _refreshTimer.Stop();
        _autoSyncTimer.Stop();
        _approvalCts?.Cancel();
        _lifetime.Cancel();
        _erp.Dispose();
    }

    private void InitializePeriodSelectors()
    {
        var months = CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames
            .Take(12)
            .Select((name, index) => new MonthOption(index + 1, name))
            .ToArray();
        MonthCombo.ItemsSource = months;
        MonthCombo.SelectedValue = DateTime.Today.Month;
        YearCombo.ItemsSource = Enumerable.Range(DateTime.Today.Year - 4, 6).Reverse().ToArray();
        YearCombo.SelectedItem = DateTime.Today.Year;
    }

    private void InitializeEditors()
    {
        var today = DateTime.Today;
        ManualDatePicker.SelectedDate = today;
        OverrideDatePicker.SelectedDate = today;
        LeaveStartPicker.SelectedDate = today;
        LeaveEndPicker.SelectedDate = today;
        HolidayDatePicker.SelectedDate = today;
        AdvanceDatePicker.SelectedDate = today;
        ManualDirectionCombo.SelectedIndex = 0;
        OverrideStatusCombo.SelectedIndex = 0;
        LeaveTypeCombo.SelectedIndex = 0;
    }

    private (int Year, int Month) SelectedPeriod()
    {
        var year = YearCombo.SelectedItem is int y ? y : DateTime.Today.Year;
        var month = MonthCombo.SelectedValue is int m ? m : DateTime.Today.Month;
        return (year, month);
    }

    private async void ReloadPeriodButton_Click(object sender, RoutedEventArgs e)
    {
        if (_periodLoading) return;
        try
        {
            _periodLoading = true;
            var (year, month) = SelectedPeriod();
            NoticeText.Text = $"{month:D2}/{year} PDKS dönemi yükleniyor...";
            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{month:D2}/{year} dönemi hazır.";
        }
        catch (Exception error) { NoticeText.Text = $"Dönem yüklenemedi: {error.Message}"; }
        finally { _periodLoading = false; }
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
        SetLoggedInUi(session.FullName, session.UserName, session.Role, online: false);
        try
        {
            var me = await _erp.GetMeAsync(_token, _lifetime.Token);
            var fullName = string.IsNullOrWhiteSpace(me.FullName) ? session.FullName : me.FullName;
            var userName = string.IsNullOrWhiteSpace(me.UserName) ? session.UserName : me.UserName;
            var role = string.IsNullOrWhiteSpace(me.Role) ? session.Role : me.Role;
            _role = role;
            _userName = userName;
            _sessionStore.Save(_token, userName, fullName, role);
            SetLoggedInUi(fullName, userName, role, online: true);
            await RefreshPeopleFromErpAsync(refreshAttendance: true);
            _nextAutoSync = DateTimeOffset.Now;
        }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            ClearSession("ERP oturumunun süresi doldu. Yeniden giriş yapın.");
        }
        catch
        {
            ErpStateText.Text = "ERP: Çevrimdışı";
            NoticeText.Text = "ERP bağlantısı yok; yerel kart toplama ve mevcut PDKS önbelleği çalışmaya devam ediyor.";
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        var identity = UsernameBox.Text.Trim();
        var password = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(identity) || string.IsNullOrEmpty(password))
        {
            NoticeText.Text = "Kullanıcı adı/e-posta ve parola zorunludur.";
            return;
        }
        try
        {
            LoginButton.IsEnabled = false;
            NoticeText.Text = "KY ERP hesabı doğrulanıyor...";
            var flow = await _erp.LoginAsync(identity, password, _paths.DeviceLabel, _lifetime.Token);
            PasswordBox.Clear();
            await HandleAuthFlowAsync(flow);
        }
        catch (Exception error) { NoticeText.Text = error.Message; }
        finally { LoginButton.IsEnabled = true; }
    }

    private async void MfaButton_Click(object sender, RoutedEventArgs e)
    {
        if (_authFlow is null) return;
        try
        {
            var provider = SelectedTag(MfaProviderCombo);
            NoticeText.Text = "Authenticator kodu doğrulanıyor...";
            var flow = await _erp.VerifyMfaAsync(_authFlow, MfaCodeBox.Text, provider, _lifetime.Token);
            MfaCodeBox.Clear();
            await HandleAuthFlowAsync(flow);
        }
        catch (Exception error) { NoticeText.Text = error.Message; }
    }

    private async Task HandleAuthFlowAsync(AuthFlow flow)
    {
        _authFlow = flow;
        var stage = (flow.Stage ?? "").Trim().ToUpperInvariant();
        switch (stage)
        {
            case "AUTHENTICATED":
                if (string.IsNullOrWhiteSpace(flow.Token)) throw new InvalidOperationException("KY ERP geçerli oturum tokenı döndürmedi.");
                _approvalCts?.Cancel();
                _token = flow.Token;
                _role = flow.Role;
                _userName = flow.UserName;
                _sessionStore.Save(flow.Token, flow.UserName, flow.FullName, flow.Role);
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                SetLoggedInUi(flow.FullName, flow.UserName, flow.Role, online: true);
                NoticeText.Text = "Bu bilgisayar KY ERP hesabıyla doğrulandı.";
                await RefreshPeopleFromErpAsync(refreshAttendance: true);
                _nextAutoSync = DateTimeOffset.Now;
                if (CanWrite) await SyncNowAsync(manual: false);
                break;
            case "MFA_REQUIRED":
            case "MFA_LEGACY_REQUIRED":
                MfaPanel.Visibility = Visibility.Visible;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                SelectProvider(flow.Provider);
                MfaProviderText.Text = string.IsNullOrWhiteSpace(flow.Provider) ? "Authenticator kodunu girin" : $"{flow.Provider} doğrulaması";
                NoticeText.Text = "ERP hesabının MFA doğrulamasını tamamlayın.";
                break;
            case "MFA_SETUP":
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                NoticeText.Text = "Authenticator kurulumu KY ERP web güvenlik ekranından tamamlanmalı.";
                break;
            case "APPROVAL_PENDING":
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Visible;
                ApprovalText.Text = string.IsNullOrWhiteSpace(flow.Message) ? "ERP giriş onayı bekleniyor..." : flow.Message;
                _approvalCts?.Cancel();
                _approvalCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
                _ = PollApprovalAsync(flow, _approvalCts.Token);
                break;
            default:
                NoticeText.Text = string.IsNullOrWhiteSpace(flow.Message) ? $"Giriş aşaması tamamlanamadı: {flow.Stage}" : flow.Message;
                break;
        }
    }

    private async Task PollApprovalAsync(AuthFlow initial, CancellationToken ct)
    {
        var current = initial;
        var expires = DateTimeOffset.Now.AddMinutes(10);
        while (!ct.IsCancellationRequested && DateTimeOffset.Now < expires)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(3.5), ct);
                current = await _erp.CheckApprovalAsync(current, ct);
                if (string.Equals(current.Stage, "APPROVAL_PENDING", StringComparison.OrdinalIgnoreCase))
                {
                    ApprovalText.Text = string.IsNullOrWhiteSpace(current.Message) ? "Onay bekleniyor..." : current.Message;
                    continue;
                }
                await HandleAuthFlowAsync(current);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception error) { ApprovalText.Text = $"Onay kontrolü: {error.Message}"; }
        }
        ApprovalPanel.Visibility = Visibility.Collapsed;
        NoticeText.Text = "Giriş onayı süresi doldu. Yeniden giriş yapın.";
    }

    private async void LogoutButton_Click(object sender, RoutedEventArgs e)
    {
        var token = _token;
        ClearSession("Oturum kapatıldı. Yerel Agent kart toplamaya devam eder.");
        try { if (!string.IsNullOrWhiteSpace(token)) await _erp.LogoutAsync(token, _lifetime.Token); } catch { }
    }

    private void SetLoggedInUi(string fullName, string username, string role, bool online)
    {
        LoginPanel.Visibility = Visibility.Collapsed;
        AuthenticatedPanel.Visibility = Visibility.Visible;
        AccountNameText.Text = string.IsNullOrWhiteSpace(fullName) ? username : fullName;
        AccountRoleText.Text = $"{username} · {role}";
        ActivationStateText.Text = "Cihaz doğrulandı · ERP hesabına bağlı";
        ErpStateText.Text = online ? "ERP: Bağlı" : "ERP: Çevrimdışı oturum";
        SetWriteControls();
        if (string.Equals(role, "DENETIM", StringComparison.OrdinalIgnoreCase))
            NoticeText.Text = "DENETİM modu: yalnız SGK'lı kart personeli görünür; bütün değiştirme işlemleri kapalıdır.";
    }

    private void SetLoggedOutUi()
    {
        LoginPanel.Visibility = Visibility.Visible;
        AuthenticatedPanel.Visibility = Visibility.Collapsed;
        MfaPanel.Visibility = Visibility.Collapsed;
        ApprovalPanel.Visibility = Visibility.Collapsed;
        ActivationStateText.Text = "ERP hesabıyla giriş bekleniyor";
        ErpStateText.Text = "ERP: Oturum yok";
        SetWriteControls();
    }

    private void SetWriteControls()
    {
        var enabled = CanWrite;
        SyncButton.IsEnabled = enabled;
        ManualEventPanel.IsEnabled = enabled;
        OverridePanel.IsEnabled = enabled;
        PeriodWritePanel.IsEnabled = enabled;
        GroupWritePanel.IsEnabled = enabled;
        LeaveWritePanel.IsEnabled = enabled;
        HolidayWritePanel.IsEnabled = enabled;
        AdvanceWritePanel.IsEnabled = enabled;
        SaveSettingsButton.IsEnabled = enabled;
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
        NoticeText.Text = message;
    }

    private async Task LoadCachedPeopleAsync()
    {
        _people = await _store.GetPeopleAsync(_lifetime.Token);
        BindPeople();
    }

    private void BindPeople()
    {
        PeopleGrid.ItemsSource = _people;
        PeopleInfoText.Text = _people.Count > 0 ? $"{_people.Count} SGK'lı + kartlı personel" : "ERP ile ilk bağlantıda SGK'lı kart personeli alınacak.";
        ManualPersonCombo.ItemsSource = _people;
        OverridePersonCombo.ItemsSource = _people;
        AssignPersonCombo.ItemsSource = _people;
        LeavePersonCombo.ItemsSource = _people;
        AdvancePersonCombo.ItemsSource = _people;
    }

    private async Task RefreshPeopleFromErpAsync(bool refreshAttendance)
    {
        if (string.IsNullOrWhiteSpace(_token)) return;
        _people = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
        await _store.CachePeopleAsync(_people, _lifetime.Token);
        BindPeople();
        if (refreshAttendance)
        {
            var (year, month) = SelectedPeriod();
            await RefreshErpAttendanceCacheAsync(year, month);
        }
        await RefreshOperationsAsync();
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

    private async Task RefreshOperationsAsync()
    {
        var (year, month) = SelectedPeriod();
        _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
        _timesheet = AttendanceStore.BuildTimesheet(_attendanceRows);
        _groups = await _operations.GetGroupsAsync(_lifetime.Token);
        _advances = await _operations.GetAdvancesAsync(_lifetime.Token);

        DailyGrid.ItemsSource = _attendanceRows.OrderByDescending(x => x.Date).ThenBy(x => x.FullName).ToArray();
        PuantajGrid.ItemsSource = _attendanceRows.OrderBy(x => x.Date).ThenBy(x => x.FullName).ToArray();
        MissingGrid.ItemsSource = _attendanceRows
            .Where(x => x.MissingPunch || x.Status is "KART_YOK" or "EKSIK_BASIM" or "DEVAMSIZ")
            .OrderByDescending(x => x.Date).ThenBy(x => x.FullName).ToArray();
        TimesheetGrid.ItemsSource = _timesheet;
        PeriodGrid.ItemsSource = await _operations.GetPeriodsAsync(_lifetime.Token);
        GroupGrid.ItemsSource = _groups;
        AssignGroupCombo.ItemsSource = _groups.Where(x => x.Active).ToArray();
        DepartmentGrid.ItemsSource = await _operations.GetDepartmentsAsync(_lifetime.Token);
        LeaveGrid.ItemsSource = await _operations.GetLeavesAsync(_lifetime.Token);
        HolidayGrid.ItemsSource = await _operations.GetHolidaysAsync(_lifetime.Token);
        AdvanceGrid.ItemsSource = _advances;
        AuditGrid.ItemsSource = await _operations.GetAuditAsync(300, _lifetime.Token);
        PayrollGrid.ItemsSource = BuildPayrollPreview(year, month);
        RefreshDashboard();
    }

    private IReadOnlyList<PayrollPreviewRow> BuildPayrollPreview(int year, int month)
    {
        var prefix = $"{year:D4}-{month:D2}-";
        var advanceMap = _advances.Where(x => x.Date.StartsWith(prefix, StringComparison.Ordinal))
            .GroupBy(x => x.EmployeeId).ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        return _timesheet.Select(x => new PayrollPreviewRow(
            x.EmployeeId, x.FullName, x.WorkedDays, x.AnnualLeaveDays, x.LeaveDays, x.NoPunchDays,
            x.MissingPunchDays, x.LateMinutes, x.OvertimeMinutes,
            advanceMap.TryGetValue(x.EmployeeId, out var amount) ? amount : 0m)).ToArray();
    }

    private void RefreshDashboard()
    {
        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var todayRows = _attendanceRows.Where(x => x.Date == today).ToArray();
        WorkedTodayText.Text = todayRows.Count(x => x.Status is "CALISTI" or "EKSIK_BASIM").ToString(CultureInfo.InvariantCulture);
        MissingTodayText.Text = todayRows.Count(x => x.MissingPunch || x.Status is "KART_YOK" or "EKSIK_BASIM" or "DEVAMSIZ").ToString(CultureInfo.InvariantCulture);
    }

    private async Task SafeRefreshAsync()
    {
        try { await RefreshLocalAsync(); }
        catch (Exception error) { LocalStatusText.Text = $"Yerel DB okunamadı: {error.Message}"; }
    }

    private async Task RefreshLocalAsync()
    {
        var snapshot = await _store.SnapshotAsync(_lifetime.Token);
        TodayCountText.Text = snapshot.TodayCount.ToString(CultureInfo.InvariantCulture);
        PendingBigText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
        SyncedCountText.Text = snapshot.SyncedCount.ToString(CultureInfo.InvariantCulture);
        ErrorCountText.Text = snapshot.ErrorCount.ToString(CultureInfo.InvariantCulture);
        AgentStateText.Text = snapshot.AgentOnline ? $"Agent: Çalışıyor · {snapshot.AgentMode}" : "Agent: Bağlantı yok";
        TerminalStateText.Text = $"Terminal durumu: {snapshot.LastAgentMessage}";
        LocalStatusText.Text = snapshot.AgentOnline
            ? $"Yerel DB sağlam · Agent aktif · bekleyen {snapshot.PendingCount}"
            : $"Yerel DB sağlam · Agent heartbeat alınamadı · bekleyen {snapshot.PendingCount}";
        OverviewPunchGrid.ItemsSource = snapshot.Rows.Take(100).ToArray();
        LivePunchGrid.ItemsSource = snapshot.Rows;
    }

    private async void RefreshLocalButton_Click(object sender, RoutedEventArgs e) => await SafeRefreshAsync();
    private async void SyncButton_Click(object sender, RoutedEventArgs e) => await SyncNowAsync(manual: true);

    private async Task AutoSyncTickAsync()
    {
        if (_syncing || !CanWrite) return;
        var config = _configStore.Load();
        if (!config.AutoSync || DateTimeOffset.Now < _nextAutoSync) return;
        await SyncNowAsync(manual: false);
    }

    private async Task SyncNowAsync(bool manual)
    {
        if (_syncing) return;
        if (!CanWrite)
        {
            if (manual) NoticeText.Text = "Bu kullanıcı kart verisi yazamaz. PDKS yazma yetkili ERP hesabıyla giriş yapın.";
            return;
        }
        if (SecureSessionStore.JwtExpiry(_token) <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 10)
        {
            ClearSession("ERP oturumu sona erdi. Kartlar yerelde güvende; yeniden giriş yapın.");
            return;
        }

        _syncing = true;
        SyncButton.IsEnabled = false;
        string historyId = "";
        try
        {
            if (manual) NoticeText.Text = "ERP personeli ve kart hareketleri senkronize ediliyor...";
            await RefreshPeopleFromErpAsync(refreshAttendance: false);
            var byCard = _people.ToDictionary(person => person.CardNo, StringComparer.OrdinalIgnoreCase);
            var pending = await _store.GetPendingAsync(500, _lifetime.Token);
            if (pending.Count == 0)
            {
                NoticeText.Text = "Senkron bekleyen kart hareketi yok.";
                return;
            }

            var invalid = new List<PunchRow>();
            var valid = new List<PunchRow>();
            foreach (var row in pending)
            {
                if (!byCard.TryGetValue(row.CardNo, out var person)) { invalid.Add(row); continue; }
                if ((!string.IsNullOrWhiteSpace(person.StartDate) && string.CompareOrdinal(row.WorkDate, person.StartDate) < 0) ||
                    (!string.IsNullOrWhiteSpace(person.ExitDate) && string.CompareOrdinal(row.WorkDate, person.ExitDate) > 0))
                { invalid.Add(row); continue; }
                valid.Add(row);
            }
            if (invalid.Count > 0)
                await _store.MarkLocalErrorAsync(invalid, "SGK=VAR + kartlı personel veya çalışma dönemi eşleşmesi yok.", _lifetime.Token);
            if (valid.Count == 0)
            {
                NoticeText.Text = $"{invalid.Count} kart hareketi personel/dönem kontrolü bekliyor.";
                return;
            }

            historyId = await _store.StartSyncHistoryAsync(valid.Count, _lifetime.Token);
            var result = await _erp.SyncPunchesAsync(_token, valid, _paths.DeviceLabel, _lifetime.Token);
            await _store.ApplySyncResultAsync(valid, result, _lifetime.Token);
            await _store.FinishSyncHistoryAsync(historyId, result.AcceptedCount, result.RejectedCount, "OK", "", _lifetime.Token);
            await _operations.AuditAsync("ERP_SYNC", _paths.DeviceLabel, $"ERP senkron: kabul {result.AcceptedCount}, red {result.RejectedCount}", _userName, _lifetime.Token);
            NoticeText.Text = $"ERP senkron tamamlandı · kabul {result.AcceptedCount} · reddedilen {result.RejectedCount} · yerel kontrol {invalid.Count}";
            ErpStateText.Text = "ERP: Bağlı";
            var (year, month) = SelectedPeriod();
            await RefreshErpAttendanceCacheAsync(year, month);
            await RefreshOperationsAsync();
            await RefreshLocalAsync();
        }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            if (!string.IsNullOrWhiteSpace(historyId)) await _store.FinishSyncHistoryAsync(historyId, 0, 0, "AUTH_REQUIRED", error.Message, CancellationToken.None);
            ClearSession("ERP oturumu sona erdi. Yerel kartlar silinmedi; yeniden giriş yapın.");
        }
        catch (Exception error)
        {
            if (!string.IsNullOrWhiteSpace(historyId)) await _store.FinishSyncHistoryAsync(historyId, 0, 0, "FAILED", error.Message, CancellationToken.None);
            ErpStateText.Text = "ERP: Çevrimdışı";
            NoticeText.Text = $"Senkron yapılamadı; kartlar yerelde güvende. {error.Message}";
        }
        finally
        {
            _syncing = false;
            SyncButton.IsEnabled = CanWrite;
            _nextAutoSync = DateTimeOffset.Now.AddSeconds(_configStore.Load().SyncIntervalSeconds);
        }
    }

    private async void AddManualEventButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (ManualPersonCombo.SelectedItem is not CachedPerson person) { NoticeText.Text = "Personel seçin."; return; }
        if (ManualDatePicker.SelectedDate is not DateTime date) { NoticeText.Text = "Tarih seçin."; return; }
        try
        {
            var time = NormalizeTimeText(ManualTimeBox.Text);
            await _erp.AddTimeEventAsync(_token, person, date.ToString("yyyy-MM-dd"), time, SelectedTag(ManualDirectionCombo), ManualNoteBox.Text, _lifetime.Token);
            await _operations.AuditAsync("MANUAL_EVENT", person.Id, $"Manuel kart: {date:yyyy-MM-dd} {time}", _userName, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, date.Year, date.Month);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{person.FullName} manuel kart hareketi ERP'ye kaydedildi.";
        }
        catch (Exception error) { NoticeText.Text = $"Kart hareketi kaydedilemedi: {error.Message}"; }
    }

    private async void SaveOverrideButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (OverridePersonCombo.SelectedItem is not CachedPerson person) { NoticeText.Text = "Personel seçin."; return; }
        if (OverrideDatePicker.SelectedDate is not DateTime date) { NoticeText.Text = "Tarih seçin."; return; }
        try
        {
            var entry = NormalizeOptionalTime(OverrideInBox.Text);
            var exit = NormalizeOptionalTime(OverrideOutBox.Text);
            var late = entry.Length == 0 ? 0 : Math.Max(0, Minutes(entry) - Minutes("08:30"));
            var early = exit.Length == 0 ? 0 : Math.Max(0, Minutes("19:00") - Minutes(exit));
            var overtime = exit.Length == 0 ? 0 : Math.Max(0, Minutes(exit) - Minutes("19:00"));
            var status = SelectedTag(OverrideStatusCombo);
            await _erp.SaveDayOverrideAsync(_token, person, date.ToString("yyyy-MM-dd"), status, entry, exit, late, early, overtime,
                string.Equals(status, "EKSIK_BASIM", StringComparison.OrdinalIgnoreCase), OverrideNoteBox.Text, _lifetime.Token);
            await _operations.AuditAsync("DAY_OVERRIDE", person.Id, $"Gün düzeltme: {date:yyyy-MM-dd} {entry}-{exit} {status}", _userName, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, date.Year, date.Month);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{person.FullName} {date:dd.MM.yyyy} gün düzeltmesi ERP'ye kaydedildi.";
        }
        catch (Exception error) { NoticeText.Text = $"Gün düzeltmesi kaydedilemedi: {error.Message}"; }
    }

    private async Task RefreshOnePersonMonthAsync(CachedPerson person, int year, int month)
    {
        var days = await _erp.GetAttendanceMonthAsync(_token, person, year, month, _lifetime.Token);
        await _attendance.CacheEmployeeMonthAsync(person.Id, year, month, days, _lifetime.Token);
    }

    private void MissingGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (MissingGrid.SelectedItem is not AttendanceDayRow row) return;
        OverridePersonCombo.SelectedItem = _people.FirstOrDefault(x => x.Id == row.EmployeeId);
        if (DateTime.TryParseExact(row.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) OverrideDatePicker.SelectedDate = date;
        OverrideInBox.Text = row.Entry;
        OverrideOutBox.Text = row.Exit;
        OverrideNoteBox.Text = row.Note;
        SelectTag(OverrideStatusCombo, row.Status);
    }

    private async void OpenPeriodButton_Click(object sender, RoutedEventArgs e) => await SetPeriodStatusAsync("OPEN");
    private async void ClosePeriodButton_Click(object sender, RoutedEventArgs e) => await SetPeriodStatusAsync("CLOSED");

    private async Task SetPeriodStatusAsync(string status)
    {
        if (!CanWrite) return;
        try
        {
            var (year, month) = SelectedPeriod();
            await _operations.SetPeriodStatusAsync(year, month, status, PeriodNoteBox.Text, _userName, _lifetime.Token);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{month:D2}/{year} dönemi {(status == "CLOSED" ? "kapatıldı" : "açıldı")}.";
        }
        catch (Exception error) { NoticeText.Text = $"Dönem işlemi başarısız: {error.Message}"; }
    }

    private void GroupGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (GroupGrid.SelectedItem is not WorkGroupRow row) return;
        GroupNameBox.Text = row.Name;
        GroupEntryBox.Text = row.EntryTime;
        GroupExitBox.Text = row.ExitTime;
        GroupLateBox.Text = row.LateTolerance.ToString(CultureInfo.InvariantCulture);
        GroupEarlyBox.Text = row.EarlyTolerance.ToString(CultureInfo.InvariantCulture);
        GroupActiveCheck.IsChecked = row.Active;
    }

    private async void SaveGroupButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        try
        {
            var id = GroupGrid.SelectedItem is WorkGroupRow selected ? selected.Id : "";
            var row = new WorkGroupRow(id, GroupNameBox.Text.Trim(), NormalizeTimeText(GroupEntryBox.Text), NormalizeTimeText(GroupExitBox.Text),
                ParseInt(GroupLateBox.Text, 0), ParseInt(GroupEarlyBox.Text, 0), GroupActiveCheck.IsChecked == true);
            await _operations.SaveGroupAsync(row, _userName, _lifetime.Token);
            GroupGrid.SelectedItem = null;
            await RefreshOperationsAsync();
            NoticeText.Text = "Çalışma grubu kaydedildi.";
        }
        catch (Exception error) { NoticeText.Text = $"Grup kaydedilemedi: {error.Message}"; }
    }

    private async void AssignGroupButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (AssignPersonCombo.SelectedItem is not CachedPerson person || AssignGroupCombo.SelectedItem is not WorkGroupRow group)
        { NoticeText.Text = "Personel ve grup seçin."; return; }
        try
        {
            await _operations.AssignGroupAsync(person.Id, group.Id, _userName, _lifetime.Token);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{person.FullName} → {group.Name} atandı.";
        }
        catch (Exception error) { NoticeText.Text = $"Grup ataması başarısız: {error.Message}"; }
    }

    private async void SaveLeaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (LeavePersonCombo.SelectedItem is not CachedPerson person || LeaveStartPicker.SelectedDate is not DateTime start || LeaveEndPicker.SelectedDate is not DateTime end)
        { NoticeText.Text = "Personel ve izin tarihlerini seçin."; return; }
        try
        {
            await _operations.SaveLeaveAsync(person.Id, start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"), SelectedTag(LeaveTypeCombo), LeaveNoteBox.Text, _userName, _lifetime.Token);
            await RefreshOperationsAsync();
            NoticeText.Text = $"{person.FullName} izin kaydı oluşturuldu.";
        }
        catch (Exception error) { NoticeText.Text = $"İzin kaydedilemedi: {error.Message}"; }
    }

    private async void SaveHolidayButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (HolidayDatePicker.SelectedDate is not DateTime date) { NoticeText.Text = "Tatil tarihi seçin."; return; }
        try
        {
            await _operations.SaveHolidayAsync(date.ToString("yyyy-MM-dd"), HolidayNameBox.Text, HolidayHalfCheck.IsChecked == true, _userName, _lifetime.Token);
            await RefreshOperationsAsync();
            NoticeText.Text = "Tatil kaydedildi.";
        }
        catch (Exception error) { NoticeText.Text = $"Tatil kaydedilemedi: {error.Message}"; }
    }

    private async void SaveAdvanceButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        if (AdvancePersonCombo.SelectedItem is not CachedPerson person || AdvanceDatePicker.SelectedDate is not DateTime date)
        { NoticeText.Text = "Personel ve avans tarihi seçin."; return; }
        if (!decimal.TryParse(AdvanceAmountBox.Text.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var amount))
        { NoticeText.Text = "Avans tutarı geçersiz."; return; }
        try
        {
            await _operations.SaveAdvanceAsync(person.Id, date.ToString("yyyy-MM-dd"), amount, AdvanceNoteBox.Text, _userName, _lifetime.Token);
            AdvanceAmountBox.Clear();
            await RefreshOperationsAsync();
            NoticeText.Text = $"{person.FullName} avansı kaydedildi.";
        }
        catch (Exception error) { NoticeText.Text = $"Avans kaydedilemedi: {error.Message}"; }
    }

    private async void ExportAttendanceButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = ReportPath("GIRIS_CIKIS");
            var lines = new List<string> { "Tarih;Kod;Personel;Kart;Bolum;Durum;Giris;Cikis;GecDk;ErkenDk;FazlaDk;Kaynak;Not" };
            lines.AddRange(_attendanceRows.Select(x => CsvLine(x.Date, x.PersonnelCode, x.FullName, x.CardNo, x.Department, x.Status, x.Entry, x.Exit, x.LateMinutes, x.EarlyMinutes, x.OvertimeMinutes, x.DataSource, x.Note)));
            await File.WriteAllLinesAsync(path, lines, new UTF8Encoding(true), _lifetime.Token);
            NoticeText.Text = $"Giriş/çıkış raporu: {path}";
        }
        catch (Exception error) { NoticeText.Text = $"Rapor oluşturulamadı: {error.Message}"; }
    }

    private async void ExportTimesheetButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = ReportPath("PUANTAJ_SONUC");
            var lines = new List<string> { "Kod;Personel;Bolum;Kart;Calisilan;YillikIzin;Izin;EksikBasim;KartYok;GecGun;GecDk;ErkenDk;FazlaDk" };
            lines.AddRange(_timesheet.Select(x => CsvLine(x.PersonnelCode, x.FullName, x.Department, x.CardNo, x.WorkedDays, x.AnnualLeaveDays, x.LeaveDays, x.MissingPunchDays, x.NoPunchDays, x.LateDays, x.LateMinutes, x.EarlyMinutes, x.OvertimeMinutes)));
            await File.WriteAllLinesAsync(path, lines, new UTF8Encoding(true), _lifetime.Token);
            NoticeText.Text = $"Puantaj raporu: {path}";
        }
        catch (Exception error) { NoticeText.Text = $"Rapor oluşturulamadı: {error.Message}"; }
    }

    private async void ExportPayrollButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var (year, month) = SelectedPeriod();
            var rows = BuildPayrollPreview(year, month);
            var path = ReportPath("BORDRO_AKTARIM");
            var lines = new List<string> { "Personel;Calisilan;YillikIzin;Izin;KartYok;EksikBasim;GecDk;FazlaDk;Avans" };
            lines.AddRange(rows.Select(x => CsvLine(x.FullName, x.WorkedDays, x.AnnualLeaveDays, x.LeaveDays, x.NoPunchDays, x.MissingPunchDays, x.LateMinutes, x.OvertimeMinutes, x.AdvanceAmount.ToString("0.00", CultureInfo.InvariantCulture))));
            await File.WriteAllLinesAsync(path, lines, new UTF8Encoding(true), _lifetime.Token);
            NoticeText.Text = $"Bordro aktarım dosyası: {path}";
        }
        catch (Exception error) { NoticeText.Text = $"Bordro aktarımı oluşturulamadı: {error.Message}"; }
    }

    private void OpenReportsButton_Click(object sender, RoutedEventArgs e) => OpenFolder(Path.Combine(_paths.Root, "Reports"));

    private string ReportPath(string prefix)
    {
        var dir = Path.Combine(_paths.Root, "Reports");
        Directory.CreateDirectory(dir);
        var (year, month) = SelectedPeriod();
        return Path.Combine(dir, $"KY-PDKS-{prefix}-{year:D4}-{month:D2}-{DateTime.Now:yyyyMMdd-HHmmss}.csv");
    }

    private static string CsvLine(params object?[] values) => string.Join(';', values.Select(Csv));
    private static string Csv(object? value)
    {
        var text = Convert.ToString(value, CultureInfo.GetCultureInfo("tr-TR")) ?? "";
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Contains(';') || text.Contains('"') ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }

    private void LoadSettings()
    {
        var config = _configStore.Load();
        SelectTag(SourceModeCombo, config.NormalizedMode);
        TcpHostBox.Text = config.TcpHost;
        TcpPortBox.Text = config.TcpPort.ToString(CultureInfo.InvariantCulture);
        SerialPortBox.Text = config.SerialPort;
        SelectContent(SerialBaudCombo, config.SerialBaud.ToString(CultureInfo.InvariantCulture));
        EncodingBox.Text = config.LineEncoding;
        FileImportCheck.IsChecked = config.FileImportEnabled;
        AutoSyncCheck.IsChecked = config.AutoSync;
        SyncIntervalBox.Text = config.SyncIntervalSeconds.ToString(CultureInfo.InvariantCulture);
    }

    private void SaveSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        try
        {
            var current = _configStore.Load();
            current.SourceMode = SelectedTag(SourceModeCombo);
            current.TcpHost = TcpHostBox.Text.Trim();
            current.TcpPort = ParseInt(TcpPortBox.Text, current.TcpPort);
            current.SerialPort = SerialPortBox.Text.Trim();
            current.SerialBaud = ParseInt(SelectedContent(SerialBaudCombo), current.SerialBaud);
            current.LineEncoding = EncodingBox.Text.Trim();
            current.FileImportEnabled = FileImportCheck.IsChecked == true;
            current.AutoSync = AutoSyncCheck.IsChecked == true;
            current.SyncIntervalSeconds = ParseInt(SyncIntervalBox.Text, current.SyncIntervalSeconds);
            _configStore.Save(current);
            _nextAutoSync = DateTimeOffset.Now;
            _ = _operations.AuditAsync("TERMINAL_SETTINGS", _paths.DeviceLabel, $"Terminal ayarları: {current.NormalizedMode}", _userName, CancellationToken.None);
            NoticeText.Text = "Terminal ve senkron ayarları kaydedildi. Kaynak tipi değiştiyse Agent'ı yeniden başlatın.";
        }
        catch (Exception error) { NoticeText.Text = $"Ayarlar kaydedilemedi: {error.Message}"; }
    }

    private async void BackupButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = await _store.BackupAsync(_lifetime.Token);
            await _operations.AuditAsync("BACKUP", _paths.DeviceLabel, $"Yerel yedek: {path}", _userName, _lifetime.Token);
            NoticeText.Text = $"Yerel PDKS yedeği oluşturuldu: {path}";
            AuditGrid.ItemsSource = await _operations.GetAuditAsync(300, _lifetime.Token);
        }
        catch (Exception error) { NoticeText.Text = $"Yedek alınamadı: {error.Message}"; }
    }

    private void RestartAgentButton_Click(object sender, RoutedEventArgs e)
    {
        if (!CanWrite) return;
        try
        {
            var info = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c sc stop \"KYERP.PDKS.Agent\" & timeout /t 2 /nobreak >nul & sc start \"KYERP.PDKS.Agent\"",
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            Process.Start(info);
            NoticeText.Text = "Kart Agent servisi yeniden başlatılıyor.";
        }
        catch (Win32Exception) { NoticeText.Text = "Agent yeniden başlatma işlemi iptal edildi."; }
        catch (Exception error) { NoticeText.Text = $"Agent yeniden başlatılamadı: {error.Message}"; }
    }

    private void OpenImportButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Import);
    private void OpenArchiveButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Archive);
    private void OpenDataButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Root);
    private void OpenWebButton_Click(object sender, RoutedEventArgs e) => Process.Start(new ProcessStartInfo("https://kyerp.net") { UseShellExecute = true });

    private static void OpenFolder(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{path}\"") { UseShellExecute = true });
    }

    private static string NormalizeTimeText(string value)
    {
        var text = (value ?? "").Trim();
        if (TimeOnly.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var time) || TimeOnly.TryParse(text, out time)) return time.ToString("HH:mm", CultureInfo.InvariantCulture);
        throw new InvalidOperationException("Saat geçersiz. Örnek: 08:30");
    }

    private static string NormalizeOptionalTime(string value) => string.IsNullOrWhiteSpace(value) ? "" : NormalizeTimeText(value);
    private static int Minutes(string value)
    {
        var parts = value.Split(':');
        return parts.Length >= 2 && int.TryParse(parts[0], out var h) && int.TryParse(parts[1], out var m) ? h * 60 + m : 0;
    }

    private static string SelectedTag(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
    private static string SelectedContent(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "";
    private static int ParseInt(string value, int fallback) => int.TryParse(value, out var result) ? result : fallback;

    private static void SelectTag(ComboBox combo, string tag)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
            if (string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) { combo.SelectedItem = item; return; }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private static void SelectContent(ComboBox combo, string content)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
            if (string.Equals(item.Content?.ToString(), content, StringComparison.OrdinalIgnoreCase)) { combo.SelectedItem = item; return; }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private void SelectProvider(string provider)
    {
        var normalized = (provider ?? "").Trim().ToUpperInvariant();
        SelectTag(MfaProviderCombo, normalized == "MICROSOFT" ? "MICROSOFT" : "GOOGLE");
    }

    private sealed record MonthOption(int Value, string Name);
    private sealed record PayrollPreviewRow(
        string EmployeeId,
        string FullName,
        int WorkedDays,
        int AnnualLeaveDays,
        int LeaveDays,
        int NoPunchDays,
        int MissingPunchDays,
        int LateMinutes,
        int OvertimeMinutes,
        decimal AdvanceAmount);
}
