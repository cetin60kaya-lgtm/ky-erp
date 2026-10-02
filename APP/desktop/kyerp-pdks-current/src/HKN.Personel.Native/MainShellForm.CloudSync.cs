namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly System.Windows.Forms.Timer cloudSyncTimer = new() { Interval = 30000 };
    bool cloudSyncBusy;

    void InitializeCloudSync()
    {
        cloudSyncTimer.Tick += async (_, _) => await CheckCloudSyncAsync();
        cloudSyncTimer.Start();
        FormClosed += (_, _) => cloudSyncTimer.Stop();
        _ = CheckCloudSyncAsync();
    }

    async Task CheckCloudSyncAsync()
    {
        if (cloudSyncBusy || IsDisposed) return;
        cloudSyncBusy = true;
        try
        {
            var result = await PdksCloudAgent.RunOnceAsync() ?? string.Empty;
            if (IsDisposed || terminalAutoBusy || string.IsNullOrWhiteSpace(result)) return;

            // Cloud is optional for local work. Missing cloud credentials must never replace
            // the physical card-device health shown to the operator.
            if (result.Contains("anahtar", StringComparison.OrdinalIgnoreCase) ||
                result.Contains("yapılandır", StringComparison.OrdinalIgnoreCase) ||
                result.Contains("yapilandir", StringComparison.OrdinalIgnoreCase))
                return;

            if (!shellActivityText.StartsWith("Kart cihazı", StringComparison.OrdinalIgnoreCase))
                SetShellActivity(result, null);
        }
        finally { cloudSyncBusy = false; }
    }
}
