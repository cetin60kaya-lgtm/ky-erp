namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly System.Windows.Forms.Timer terminalAutoTimer = new() { Interval = 60000 };
    bool terminalAutoBusy;
    DateTime terminalLastProbeUtc = DateTime.MinValue;

    void InitializeTerminalAutoSync()
    {
        terminalAutoTimer.Tick += async (_, _) => await CheckTerminalAutoSyncAsync();
        Shown += async (_, _) =>
        {
            if (IsDisposed) return;
            terminalAutoTimer.Start();
            await CheckTerminalAutoSyncAsync(true);
        };
        FormClosed += (_, _) => terminalAutoTimer.Stop();
    }

    async Task CheckTerminalAutoSyncAsync(bool force = false)
    {
        if (terminalAutoBusy || IsDisposed || !Visible) return;
        terminalAutoBusy = true;
        try
        {
            var settings = TerminalSyncService.LoadSettings();
            if (settings.Enabled)
            {
                var now = DateTime.Now;
                var key = $"LIVE|{now:yyyyMMddHHmm}";
                var previous = TerminalSyncService.ReadState();
                if (!force && string.Equals(previous?.ScheduleKey, key, StringComparison.Ordinal)) return;

                var result = await TerminalSyncService.SyncAsync("Otomatik canlı", key);
                if (IsDisposed) return;

                if (result.ReadCount == 0)
                {
                    leadStatus.Text = result.Message.Contains("Aktarılacak veri yok", StringComparison.OrdinalIgnoreCase)
                        ? "Kart cihazı bağlı • yeni kayıt yok"
                        : ShortTerminalMessage(result.Message);
                    leadStatus.ForeColor = result.Message.Contains("başarısız", StringComparison.OrdinalIgnoreCase) ||
                                           result.Message.Contains("hata", StringComparison.OrdinalIgnoreCase)
                        ? Color.FromArgb(181, 91, 34)
                        : Color.FromArgb(42, 112, 70);
                }
                else
                {
                    leadStatus.Text = $"Kart cihazı • {result.ReadCount} okundu • +{result.Inserted}/{result.Updated}";
                    leadStatus.ForeColor = result.Skipped == 0 ? Color.FromArgb(42, 112, 70) : Color.FromArgb(181, 91, 34);
                }
                return;
            }

            // Sync disabled: do a lightweight connection probe only every two minutes.
            if (!force && DateTime.UtcNow - terminalLastProbeUtc < TimeSpan.FromMinutes(2)) return;
            terminalLastProbeUtc = DateTime.UtcNow;
            var device = await TerminalDeviceClient.ReadAsync(false);
            if (IsDisposed) return;
            leadStatus.Text = device.Connected
                ? $"Kart cihazı bağlı • {device.DeviceTime:HH:mm:ss} • yeni {Math.Max(0, device.NewLogCount)}"
                : "Kart cihazı: " + ShortTerminalMessage(device.Message);
            leadStatus.ForeColor = device.Connected ? Color.FromArgb(42, 112, 70) : Color.FromArgb(181, 91, 34);
        }
        catch (Exception ex)
        {
            if (!IsDisposed)
            {
                leadStatus.Text = "Kart cihazı: " + ShortTerminalMessage(ex.Message);
                leadStatus.ForeColor = Color.FromArgb(181, 91, 34);
            }
        }
        finally
        {
            terminalAutoBusy = false;
        }
    }

    static string ShortTerminalMessage(string? text)
    {
        var value = (text ?? string.Empty).Replace("\r", " ").Replace("\n", " ").Trim();
        if (value.Length <= 72) return value;
        return value[..69] + "...";
    }
}
