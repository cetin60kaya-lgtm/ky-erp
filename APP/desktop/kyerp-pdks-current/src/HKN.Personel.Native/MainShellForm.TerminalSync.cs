namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly System.Windows.Forms.Timer terminalAutoTimer = new() { Interval = 60000 };
    bool terminalAutoBusy;
    DateTime terminalLastProbeUtc = DateTime.MinValue;
    DateTime terminalLastLiveSyncUtc = DateTime.MinValue;

    void InitializeTerminalAutoSync()
    {
        terminalAutoTimer.Tick += async (_, _) => await CheckTerminalAutoSyncAsync();
        terminalAutoTimer.Start();
        FormClosed += (_, _) => terminalAutoTimer.Stop();
        _ = CheckTerminalAutoSyncAsync(true);
    }

    async Task CheckTerminalAutoSyncAsync(bool forceProbe = false)
    {
        if (terminalAutoBusy || IsDisposed) return;
        terminalAutoBusy = true;
        try
        {
            if (forceProbe || DateTime.UtcNow - terminalLastProbeUtc >= TimeSpan.FromMinutes(2))
            {
                terminalLastProbeUtc = DateTime.UtcNow;
                var device = await TerminalDeviceClient.ReadAsync(false);
                if (!IsDisposed)
                {
                    if (device.Connected)
                    {
                        leadStatus.Text = $"Kart cihazı bağlı • {device.DeviceTime:HH:mm:ss} • yeni {device.NewLogCount}";
                        leadStatus.ForeColor = Color.FromArgb(42, 112, 70);
                    }
                    else
                    {
                        leadStatus.Text = "Kart cihazı: " + device.Message;
                        leadStatus.ForeColor = Color.FromArgb(181, 91, 34);
                    }
                }
            }

            var settings = TerminalSyncService.LoadSettings();
            if (!settings.Enabled) return;
            if (!forceProbe && DateTime.UtcNow - terminalLastLiveSyncUtc < TimeSpan.FromMinutes(5)) return;

            terminalLastLiveSyncUtc = DateTime.UtcNow;
            var now = DateTime.Now;
            var bucketMinute = (now.Minute / 5) * 5;
            var key = $"LIVE|{now:yyyyMMddHH}|{bucketMinute:00}";
            var state = TerminalSyncService.ReadState();
            if (string.Equals(state?.ScheduleKey, key, StringComparison.Ordinal)) return;

            var result = await TerminalSyncService.SyncAsync("Otomatik canlı", key);
            if (!IsDisposed)
            {
                leadStatus.Text = result.ReadCount == 0 ? "Canlı kart kontrolü • " + result.Message : $"Canlı kart • okunan {result.ReadCount} • +{result.Inserted}/{result.Updated}";
                leadStatus.ForeColor = result.Skipped == 0 ? Color.FromArgb(42, 112, 70) : Color.FromArgb(181, 91, 34);
            }
        }
        finally { terminalAutoBusy = false; }
    }
}
