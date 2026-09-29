using System.Globalization;
using KyPdks.Shared;

sealed class ErpSyncWorker(
    LocalPdksStore store,
    PdksPaths paths,
    ConfigStore configStore,
    TextFileLog fileLog,
    ILogger<ErpSyncWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        var credentialStore = new MachineCredentialStore(paths);
        using var api = new PdksMachineApiClient();
        var lastHeartbeat = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            var config = configStore.Load();
            try
            {
                if (!config.AutoSync)
                {
                    await store.TouchStateAsync("d1_sync", "Otomatik senkron kapalı", stoppingToken);
                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(10, config.SyncIntervalSeconds)), stoppingToken);
                    continue;
                }

                var credential = credentialStore.Load();
                if (credential is null || string.IsNullOrWhiteSpace(credential.DeviceId) || string.IsNullOrWhiteSpace(credential.Secret))
                {
                    await store.TouchStateAsync("d1_sync", "D1 cihaz yetkilendirmesi bekleniyor", stoppingToken);
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                    continue;
                }

                var pending = await store.GetPendingAsync(500, stoppingToken);
                if (pending.Count == 0)
                {
                    if (DateTimeOffset.Now - lastHeartbeat > TimeSpan.FromMinutes(1))
                    {
                        await api.HeartbeatAsync(credential, stoppingToken);
                        lastHeartbeat = DateTimeOffset.Now;
                        await store.TouchStateAsync("d1_sync", "D1 bağlı · kuyruk boş", stoppingToken);
                    }
                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(10, config.SyncIntervalSeconds)), stoppingToken);
                    continue;
                }

                var historyId = await store.StartSyncHistoryAsync(pending.Count, stoppingToken);
                try
                {
                    var result = await api.SyncAsync(credential, pending, paths.DeviceLabel, stoppingToken);
                    await store.ApplySyncResultAsync(pending, result, stoppingToken);
                    await store.FinishSyncHistoryAsync(historyId, result.AcceptedCount, result.RejectedCount, "OK", "Agent otomatik D1 sync", stoppingToken);
                    var message = $"D1 otomatik sync · kabul={result.AcceptedCount}, red={result.RejectedCount}";
                    await store.TouchStateAsync("d1_sync", message, stoppingToken);
                    await store.TouchStateAsync("last_sync", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture), stoppingToken);
                    await store.TouchStateAsync("last_message", message, stoppingToken);
                    await fileLog.WriteAsync("SYNC", message, stoppingToken);
                    logger.LogInformation("{Message}", message);
                    await Task.Delay(TimeSpan.FromSeconds(Math.Max(10, config.SyncIntervalSeconds)), stoppingToken);
                }
                catch (Exception error)
                {
                    await store.FinishSyncHistoryAsync(historyId, 0, pending.Count, "ERROR", error.Message, stoppingToken);
                    throw;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                var message = $"D1 otomatik sync bekliyor · {error.Message}";
                await store.TouchStateAsync("d1_sync", message, stoppingToken);
                await store.TouchStateAsync("last_message", message, stoppingToken);
                await fileLog.WriteAsync("WARN", message, stoppingToken);
                logger.LogWarning(error, "PDKS automatic D1 sync failed");
                if (error.Message.Contains("cihaz yetkisi geçersiz", StringComparison.OrdinalIgnoreCase))
                    credentialStore.Clear();
                await Task.Delay(TimeSpan.FromSeconds(Math.Max(10, config.SyncIntervalSeconds)), stoppingToken);
            }
        }
    }
}
