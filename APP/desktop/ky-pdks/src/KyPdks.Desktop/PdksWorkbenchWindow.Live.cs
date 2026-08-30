using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow
{
    private readonly DispatcherTimer _liveTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private bool _liveRefreshRunning;
    private string _scopeToken = "";
    private bool _serverAudit;

    protected override void OnContentRendered(EventArgs e)
    {
        base.OnContentRendered(e);
        _liveTimer.Tick -= LiveTimer_Tick;
        _liveTimer.Tick += LiveTimer_Tick;
        MonthCombo.SelectionChanged -= PeriodCombo_SelectionChanged;
        MonthCombo.SelectionChanged += PeriodCombo_SelectionChanged;
        YearCombo.SelectionChanged -= PeriodCombo_SelectionChanged;
        YearCombo.SelectionChanged += PeriodCombo_SelectionChanged;

        ClosePeriodButton.Click -= ClosePeriodWorkflowButton_Click;
        ClosePeriodButton.Click += SafeClosePeriodButton_Click;
        PayrollButton.Click -= ExportPayrollWorkflowButton_Click;
        PayrollButton.Click += SafePayrollButton_Click;
        CorrectionSaveButton.Click -= SaveCorrectionButton_Click;
        CorrectionSaveButton.Click += SafeCorrectionButton_Click;

        _liveTimer.Start();
        ApplyWorkbenchRoleGuard();
        _ = EnsureDefaultNormalShiftAsync();
        _ = RefreshServerScopeAsync();
    }

    protected override void OnClosed(EventArgs e)
    {
        _liveTimer.Stop();
        base.OnClosed(e);
    }

    private async void PeriodCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_busy || !IsLoaded) return;
        await BusyAsync("Seçilen dönem yükleniyor...", async () =>
        {
            await RefreshAllAsync();
            ShowAllDays();
            var (year, month) = SelectedPeriod();
            StatusText.Text = $"{month:D2}/{year} dönemi yüklendi.";
        });
    }

    private async Task EnsureDefaultNormalShiftAsync()
    {
        try
        {
            var normal = (await _operations.GetGroupsAsync(_lifetime.Token))
                .FirstOrDefault(x => string.Equals(x.Id, "NORMAL", StringComparison.OrdinalIgnoreCase));
            if (normal is null) return;
            if (!string.Equals(normal.EntryTime, "08:30", StringComparison.Ordinal)
                || !string.Equals(normal.ExitTime, "19:00", StringComparison.Ordinal)
                || normal.LateTolerance != 0 || normal.EarlyTolerance != 0) return;
            await _operations.SaveGroupAsync(normal with { LateTolerance = 5, EarlyTolerance = 10 }, "SYSTEM", _lifetime.Token);
        }
        catch { }
    }

    private async Task RefreshServerScopeAsync()
    {
        if (string.IsNullOrWhiteSpace(_token))
        {
            _scopeToken = "";
            _serverAudit = false;
            ApplyWorkbenchRoleGuard();
            return;
        }
        if (string.Equals(_scopeToken, _token, StringComparison.Ordinal)) return;
        try
        {
            var profile = await PdksScopeClient.GetAsync(_token, _lifetime.Token);
            _scopeToken = _token;
            _serverAudit = profile.Audit;
            if (_serverAudit)
            {
                _role = "DENETIM";
                RoleText.Text = $"{_userName} · DENETİM / SALT OKUNUR";
            }
        }
        catch
        {
            _serverAudit = string.Equals(_userName, "denetim", StringComparison.OrdinalIgnoreCase)
                || string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);
        }
        ApplyWorkbenchRoleGuard();
    }

    private async void LiveTimer_Tick(object? sender, EventArgs e)
    {
        if (_liveRefreshRunning || _busy || _lifetime.IsCancellationRequested) return;
        _liveRefreshRunning = true;
        try
        {
            await RefreshServerScopeAsync();
            var snapshot = await _store.SnapshotAsync(_lifetime.Token);
            PunchCountText.Text = snapshot.TodayCount.ToString(CultureInfo.InvariantCulture);
            PendingCountText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
            AgentStateText.Text = snapshot.AgentOnline ? $"Agent: Çalışıyor · {snapshot.AgentMode}" : "Agent: Bağlantı yok";
            if (PunchGrid.Visibility == Visibility.Visible) PunchGrid.ItemsSource = snapshot.Rows;
            ApplyWorkbenchRoleGuard();
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch { }
        finally { _liveRefreshRunning = false; }
    }

    private void ApplyWorkbenchRoleGuard()
    {
        var audit = _serverAudit || string.Equals(_userName, "denetim", StringComparison.OrdinalIgnoreCase)
            || string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);
        var write = CanWrite && !audit;
        ImportButton.IsEnabled = write;
        ProcessButton.IsEnabled = write;
        ClosePeriodButton.IsEnabled = write;
        BackupButton.IsEnabled = write;
        CorrectionSaveButton.IsEnabled = write;
        LeaveSaveButton.IsEnabled = write;
        AdvanceSaveButton.IsEnabled = write;
        PeopleButton.IsEnabled = !string.IsNullOrWhiteSpace(_token);
        PayrollButton.IsEnabled = write;
        PayrollButton.Visibility = audit ? Visibility.Collapsed : Visibility.Visible;

        foreach (var expander in FindVisualChildren<Expander>(this))
        {
            if (string.Equals(expander.Header?.ToString(), "Hızlı Avans", StringComparison.OrdinalIgnoreCase))
                expander.Visibility = audit ? Visibility.Collapsed : Visibility.Visible;
        }
        foreach (var button in FindVisualChildren<Button>(this))
        {
            if (string.Equals(button.Content?.ToString(), "Detay Yönetim", StringComparison.OrdinalIgnoreCase))
                button.IsEnabled = !audit;
        }
    }

    private async void SafeClosePeriodButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Dönem kapanış kontrolü yapılıyor...", async () =>
        {
            if (_serverAudit || !CanWrite) throw new InvalidOperationException("Dönem kapatma için yazma yetkisi gerekir.");
            var (year, month) = SelectedPeriod();
            var periodEnd = new DateTime(year, month, DateTime.DaysInMonth(year, month));
            if (periodEnd > DateTime.Today)
                throw new InvalidOperationException($"{month:D2}/{year} dönemi henüz tamamlanmadı. Son gün {periodEnd:dd.MM.yyyy}.");

            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
            var endText = periodEnd.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var missing = _attendanceRows.Where(x => string.CompareOrdinal(x.Date, endText) <= 0 && IsMissing(x)).ToArray();
            if (missing.Length > 0)
            {
                ShowAttendanceGrid(missing, "Dönem Kapanamaz", $"Önce {missing.Length} kontrol kaydını düzeltin.");
                throw new InvalidOperationException($"Dönem kapatılmadı: {missing.Length} eksik/kart yok kaydı var.");
            }

            var backup = await _store.BackupAsync(_lifetime.Token);
            await _operations.SetPeriodStatusAsync(year, month, "CLOSED", $"Kontrollü kapanış · yedek {Path.GetFileName(backup)}", _userName, _lifetime.Token);
            await RefreshAllAsync();
            StatusText.Text = $"{month:D2}/{year} dönemi kapatıldı · kapanış yedeği alındı.";
        });
    }

    private async void SafePayrollButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Bordro aktarımı kontrol ediliyor...", async () =>
        {
            if (_serverAudit || !CanWrite) throw new InvalidOperationException("Bordro aktarımı için yazma yetkisi gerekir.");
            var (year, month) = SelectedPeriod();
            var period = (await _operations.GetPeriodsAsync(_lifetime.Token)).FirstOrDefault(x => x.Year == year && x.Month == month);
            if (!string.Equals(period?.Status, "CLOSED", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Bordro aktarımı için önce dönemi eksiksiz kontrol edip kapatın.");

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

    private async void SafeCorrectionButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (CorrectionPersonCombo.SelectedItem is not CachedPerson person || CorrectionDatePicker.SelectedDate is not DateTime date)
        {
            StatusText.Text = "Düzeltme için personel ve tarih seçin.";
            return;
        }
        await BusyAsync("Gün düzeltmesi ERP'ye kaydediliyor...", async () =>
        {
            if (_serverAudit || !CanWrite) throw new InvalidOperationException("Düzeltme için yazma yetkisi gerekir.");
            await EnsurePeriodOpenAsync(date);
            var status = SelectedTag(CorrectionStatusCombo);
            var working = status is "CALISTI" or "EKSIK_BASIM";
            var entry = working ? NormalizeOptionalTime(CorrectionInBox.Text) : "";
            var exit = working ? NormalizeOptionalTime(CorrectionOutBox.Text) : "";
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

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject root) where T : DependencyObject
    {
        if (root is null) yield break;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is T typed) yield return typed;
            foreach (var descendant in FindVisualChildren<T>(child)) yield return descendant;
        }
    }
}
