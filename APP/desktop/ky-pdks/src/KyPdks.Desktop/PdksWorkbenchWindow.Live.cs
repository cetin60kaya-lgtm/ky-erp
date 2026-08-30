using System.Globalization;
using System.Windows.Threading;

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
        _liveTimer.Start();
        ApplyWorkbenchRoleGuard();
    }

    protected override void OnClosed(EventArgs e)
    {
        _liveTimer.Stop();
        base.OnClosed(e);
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
