using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow
{
    private async Task EnsureAgentDeviceEnrollmentAsync()
    {
        if (string.IsNullOrWhiteSpace(_token) || _serverAudit || !CanWrite) return;

        var credentials = new MachineCredentialStore(_paths);
        using var api = new PdksMachineApiClient();
        var current = credentials.Load();
        if (current is not null
            && string.Equals(current.DeviceLabel, _paths.DeviceLabel, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(current.DeviceId)
            && !string.IsNullOrWhiteSpace(current.Secret))
        {
            try
            {
                await api.HeartbeatAsync(current, _lifetime.Token);
                await _store.TouchStateAsync("d1_sync", "D1 cihaz yetkisi hazır", _lifetime.Token);
                return;
            }
            catch
            {
                credentials.Clear();
            }
        }

        var enrolled = await api.EnrollAsync(_token, _paths, "", _lifetime.Token);
        credentials.Save(enrolled);
        await _store.TouchStateAsync("d1_sync", "D1 cihaz yetkisi oluşturuldu · Agent otomatik sync aktif", _lifetime.Token);
        StatusText.Text = "Windows Agent D1'e yetkilendirildi. Uygulama kapalıyken de kart senkronu devam eder.";
    }
}