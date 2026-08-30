using System.Globalization;
using System.Windows.Controls;
using System.Windows.Threading;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow
{
    private readonly DispatcherTimer _liveTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private bool _liveRefreshRunning;

    protected override void OnContentRendered(EventArgs e)
    {
        base.OnContentRendered(e);
        _liveTimer.Tick -= LiveTimer_Tick;
        _liveTimer.Tick += LiveTimer_Tick;
        MonthCombo.SelectionChanged -= PeriodCombo_SelectionChanged;
        MonthCombo.SelectionChanged += PeriodCombo_SelectionChanged;
        YearCombo.SelectionChanged -= PeriodCombo_SelectionChanged;
        YearCombo.SelectionChanged += PeriodCombo_SelectionChanged;
        _liveTimer.Start();
        ApplyWorkbenchRoleGuard();
        _ = EnsureDefaultNormalShiftAsync();
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

    private async void LiveTimer_Tick(object? sender, EventArgs e)
    {
        if (_liveRefreshRunning || _busy || _lifetime.IsCancellationRequested) return;
        _liveRefreshRunning = true;
        try
        {
            var snapshot = await _store.SnapshotAsync(_lifetime.Token);
            PunchCountText.Text = snapshot.TodayCount.ToString(CultureInfo.InvariantCulture);
            PendingCountText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
            AgentStateText.Text = snapshot.AgentOnline ? $"Agent: Çalışıyor · {snapshot.AgentMode}" : "Agent: Bağlantı yok";
            if (PunchGrid.Visibility == System.Windows.Visibility.Visible) PunchGrid.ItemsSource = snapshot.Rows;
            ApplyWorkbenchRoleGuard();
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch { }
        finally { _liveRefreshRunning = false; }
    }

    private void ApplyWorkbenchRoleGuard()
    {
        var write = CanWrite;
        ImportButton.IsEnabled = write;
        ProcessButton.IsEnabled = write;
        ClosePeriodButton.IsEnabled = write;
        PayrollButton.IsEnabled = write;
        BackupButton.IsEnabled = write;
        CorrectionSaveButton.IsEnabled = write;
        LeaveSaveButton.IsEnabled = write;
        AdvanceSaveButton.IsEnabled = write;
        PeopleButton.IsEnabled = !string.IsNullOrWhiteSpace(_token);
    }
}
