using System.Globalization;
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
        AccountPanel.IsVisibleChanged -= AccountPanel_IsVisibleChanged;
        AccountPanel.IsVisibleChanged += AccountPanel_IsVisibleChanged;

        // Bu üç işlem mevcut handler'ın güvenli D1 sürümüne yönlendirilir.
        ProcessButton.Click -= ProcessPunchesButton_Click;
        ProcessButton.Click += SafeProcessPunchesButton_Click;
        CalculateButton.Click -= CalculateAttendanceButton_Click;
        CalculateButton.Click += SafeCalculateAttendanceButton_Click;
        CorrectionSaveButton.Click -= SaveCorrectionButton_Click;
        CorrectionSaveButton.Click += SafeCorrectionButton_Click;

        // Eski yerel Detay Yönetim penceresine hiçbir çalışma yolu bırakılmaz.
        foreach (var button in FindVisualChildren<Button>(this))
        {
            if (!string.Equals(button.Content?.ToString(), "Detay Yönetim", StringComparison.OrdinalIgnoreCase)) continue;
            button.Click -= OpenAdministrationButton_Click;
            button.Click -= OpenPdksMasterButton_Click;
            button.Click += OpenPdksMasterButton_Click;
        }

        // Dönem, bordro, izin ve avans XAML'de doğrudan SingleData handler'larına bağlıdır.
        // Burada ikinci/local handler eklenmez.
        _liveTimer.Start();
        ApplyWorkbenchRoleGuard();
        _ = RefreshServerScopeAsync();
    }

    protected override void OnClosed(EventArgs e)
    {
        _liveTimer.Stop();
        base.OnClosed(e);
    }

    private async void AccountPanel_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (AccountPanel.Visibility == Visibility.Visible) await RefreshServerScopeAsync();
    }

    private async void PeriodCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_busy || !IsLoaded) return;
        await BusyAsync("Seçilen D1 dönemi yükleniyor...", async () =>
        {
            var (year, month) = SelectedPeriod();
            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            await RefreshSingleDataVisualAsync(year, month);
            ShowAllDays();
            StatusText.Text = $"{month:D2}/{year} · KY ERP D1 dönemi yüklendi.";
        });
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
            var profile = await _erp.GetPdksProfileAsync(_token, _lifetime.Token);
            _scopeToken = _token;
            _serverAudit = profile.Audit || string.Equals(profile.Scope, "AUDIT", StringComparison.OrdinalIgnoreCase);
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
            if (!PeriodStateText.Text.StartsWith("KAPALI", StringComparison.OrdinalIgnoreCase))
            {
                PeriodStateText.Text = "D1";
                PeriodStateText.Foreground = Brushes.SteelBlue;
            }
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
                button.IsEnabled = !audit && !string.IsNullOrWhiteSpace(_token);
        }
    }

    private async void SafeProcessPunchesButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("Bekleyen kartlar D1'e işleniyor...", async () =>
        {
            if (_serverAudit || !CanWrite) throw new InvalidOperationException("Kart işleme için yazma yetkisi gerekir.");
            await SyncPendingAsync();
        });
    }

    private async void SafeCalculateAttendanceButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        await BusyAsync("D1 puantajı yenileniyor...", async () =>
        {
            var (year, month) = SelectedPeriod();
            if (!string.IsNullOrWhiteSpace(_token)) await RefreshErpAttendanceCacheAsync(year, month);
            await RefreshSingleDataVisualAsync(year, month);
            ShowAllDays();
            StatusText.Text = $"{month:D2}/{year} D1 puantajı yenilendi · {_timesheet.Count} personel.";
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
        await BusyAsync("Gün düzeltmesi D1'e kaydediliyor...", async () =>
        {
            if (_serverAudit || !CanWrite) throw new InvalidOperationException("Düzeltme için yazma yetkisi gerekir.");
            var status = SelectedTag(CorrectionStatusCombo);
            var working = status is "CALISTI" or "EKSIK_BASIM";
            var entry = working ? NormalizeOptionalTime(CorrectionInBox.Text) : "";
            var exit = working ? NormalizeOptionalTime(CorrectionOutBox.Text) : "";
            var late = string.IsNullOrEmpty(entry) ? 0 : Math.Max(0, Minutes(entry) - Minutes("08:35"));
            var early = string.IsNullOrEmpty(exit) ? 0 : Math.Max(0, Minutes("18:50") - Minutes(exit));
            var overtime = string.IsNullOrEmpty(exit) ? 0 : Math.Max(0, Minutes(exit) - Minutes("19:00"));
            await _erp.SaveDayOverrideAsync(_token, person, date.ToString("yyyy-MM-dd"), status, entry, exit, late, early, overtime,
                status == "EKSIK_BASIM", CorrectionNoteBox.Text, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, date.Year, date.Month);
            await RefreshSingleDataVisualAsync(date.Year, date.Month);
            StatusText.Text = $"{person.FullName} · {date:dd.MM.yyyy} D1 üzerinde düzeltildi.";
        });
    }

    private async Task RefreshSingleDataVisualAsync(int year, int month)
    {
        _people = await _store.GetPeopleAsync(_lifetime.Token);
        BindPeople();
        _attendanceRows = await _attendance.BuildMonthAsync(year, month, _lifetime.Token);
        _timesheet = AttendanceStore.BuildTimesheet(_attendanceRows);
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
        PeriodStateText.Text = "D1";
        PeriodStateText.Foreground = Brushes.SteelBlue;
    }

    private static IEnumerable<T> FindVisualChildren<T>(DependencyObject root) where T : DependencyObject
    {
        if (root is null) yield break;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is T typed) yield return typed;
            foreach (var nested in FindVisualChildren<T>(child)) yield return nested;
        }
    }
}
