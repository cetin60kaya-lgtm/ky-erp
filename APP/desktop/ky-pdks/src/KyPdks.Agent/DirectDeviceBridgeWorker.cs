using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using KyPdks.Shared;

sealed class DirectDeviceBridgeWorker(
    LocalPdksStore store,
    PdksPaths paths,
    ConfigStore configStore,
    TextFileLog fileLog,
    ILogger<DirectDeviceBridgeWorker> logger) : BackgroundService
{
    private Process? _bridge;
    private string _signature = "";
    private DateTime _lastStateWrite = DateTime.MinValue;
    private readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        Directory.CreateDirectory(paths.DeviceQueue);
        Directory.CreateDirectory(paths.DeviceArchive);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var config = configStore.Load();
                try
                {
                    if (config.NormalizedMode != "FP_CLOCK_DIRECT")
                    {
                        StopBridge();
                        await Task.Delay(1000, stoppingToken);
                        continue;
                    }

                    EnsureBridge(config);
                    await ImportQueueAsync(config, stoppingToken);
                    await ImportBridgeStateAsync(config, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception error)
                {
                    var message = $"FP_CLOCK doğrudan cihaz hatası: {error.Message}";
                    await store.TouchStateAsync("terminal_state", message, stoppingToken);
                    await store.TouchStateAsync("last_message", message, stoppingToken);
                    await fileLog.WriteAsync("WARN", message, stoppingToken);
                    logger.LogWarning(error, "FP_CLOCK bridge worker failed");
                    StopBridge();
                }

                await Task.Delay(750, stoppingToken);
            }
        }
        finally { StopBridge(); }
    }

    private void EnsureBridge(PdksConfig config)
    {
        var bridgeExe = Path.Combine(AppContext.BaseDirectory, "DeviceBridge", "KY.PDKS.DeviceBridge.x86.exe");
        if (!File.Exists(bridgeExe))
            throw new FileNotFoundException("KY.PDKS.DeviceBridge.x86.exe bulunamadı.", bridgeExe);

        var signature = $"{config.TcpHost}|{config.TcpPort}|{config.DeviceNo}|{config.CommKey}|{config.ScanIntervalMs}";
        if (_bridge is { HasExited: false } && string.Equals(_signature, signature, StringComparison.Ordinal))
            return;

        StopBridge();
        var info = new ProcessStartInfo
        {
            FileName = bridgeExe,
            WorkingDirectory = Path.GetDirectoryName(bridgeExe)!,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        info.ArgumentList.Add("--ip"); info.ArgumentList.Add(config.TcpHost);
        info.ArgumentList.Add("--port"); info.ArgumentList.Add(config.TcpPort.ToString(CultureInfo.InvariantCulture));
        info.ArgumentList.Add("--device"); info.ArgumentList.Add(config.DeviceNo.ToString(CultureInfo.InvariantCulture));
        info.ArgumentList.Add("--key"); info.ArgumentList.Add(config.CommKey.ToString(CultureInfo.InvariantCulture));
        info.ArgumentList.Add("--scan"); info.ArgumentList.Add(config.ScanIntervalMs.ToString(CultureInfo.InvariantCulture));
        info.ArgumentList.Add("--queue"); info.ArgumentList.Add(paths.DeviceQueue);
        info.ArgumentList.Add("--state"); info.ArgumentList.Add(paths.DeviceBridgeStateFile);

        var process = new Process { StartInfo = info, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
                _ = fileLog.WriteAsync("DEVICE", e.Data);
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
                _ = fileLog.WriteAsync("DEVICE_ERR", e.Data);
        };
        if (!process.Start()) throw new InvalidOperationException("FP_CLOCK bridge başlatılamadı.");
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        _bridge = process;
        _signature = signature;
        _ = fileLog.WriteAsync("INFO", $"FP_CLOCK bridge başlatıldı · PID={process.Id} · {config.TcpHost}:{config.TcpPort}");
    }

    private async Task ImportQueueAsync(PdksConfig config, CancellationToken ct)
    {
        foreach (var file in Directory.EnumerateFiles(paths.DeviceQueue, "*.json").OrderBy(File.GetCreationTimeUtc).Take(500))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var json = await File.ReadAllTextAsync(file, ct);
                var dto = JsonSerializer.Deserialize<DevicePunchDto>(json, _json)
                    ?? throw new InvalidDataException("Bridge punch JSON boş.");
                if (!DateTime.TryParse(dto.EventAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at))
                    throw new InvalidDataException("Bridge punch zamanı geçersiz.");
                var card = PunchParser.NormalizeCard(dto.CardNo ?? "");
                if (string.IsNullOrWhiteSpace(card)) throw new InvalidDataException("Bridge kart numarası boş.");

                var direction = PdksDirection.Apply(config.Direction, dto.Direction ?? "AUTO");
                var raw = $"FP_CLOCK|verify={dto.VerifyMode}|inout={dto.Inout}|event={dto.EventCode}|machine={dto.MachineNo}";
                var punch = new RawPunch(card, at, "FP_CLOCK_DIRECT", $"FP_CLOCK:{config.DeviceNo}", raw, direction);
                var inserted = await store.AddAsync(punch, ct);

                if (inserted)
                {
                    var message = $"Kart {punch.CardNo} · {punch.WorkDate} {punch.EventTime[..5]} · {punch.Direction} · FP_CLOCK";
                    await store.TouchStateAsync("last_terminal_punch", message, ct);
                    await store.TouchStateAsync("last_message", message, ct);
                    await fileLog.WriteAsync("PUNCH", message, ct);
                }

                var archive = Path.Combine(paths.DeviceArchive, Path.GetFileName(file));
                File.Move(file, archive, true);
            }
            catch (Exception error)
            {
                var reject = Path.Combine(paths.Reject, "fpclock-" + Path.GetFileName(file));
                try { File.Move(file, reject, true); } catch { }
                await fileLog.WriteAsync("ERROR", $"FP_CLOCK queue okunamadı · {Path.GetFileName(file)} · {error.Message}", ct);
            }
        }
    }

    private async Task ImportBridgeStateAsync(PdksConfig config, CancellationToken ct)
    {
        if (!File.Exists(paths.DeviceBridgeStateFile)) return;
        var last = File.GetLastWriteTimeUtc(paths.DeviceBridgeStateFile);
        if (last <= _lastStateWrite) return;
        _lastStateWrite = last;

        string json;
        try
        {
            using var stream = new FileStream(paths.DeviceBridgeStateFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream);
            json = await reader.ReadToEndAsync(ct);
        }
        catch (IOException) { return; }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var connected = Bool(root, "connected");
        var deviceTime = Text(root, "deviceTime");
        var error = Text(root, "error");
        var users = Number(root, "userCount");
        var cards = Number(root, "cardCount");
        var logs = Number(root, "timeLogCount");
        var lastPunch = Text(root, "lastPunch");

        var state = connected
            ? $"FP_CLOCK bağlı · {config.TcpHost}:{config.TcpPort} · saat={deviceTime} · kullanıcı={users} · kart={cards} · cihaz log={logs}"
            : $"FP_CLOCK bağlantı bekliyor · {error}";
        await store.TouchStateAsync("terminal_state", state, ct);
        await store.TouchStateAsync("fpclock_device_time", deviceTime, ct);
        await store.TouchStateAsync("fpclock_user_count", users.ToString(CultureInfo.InvariantCulture), ct);
        await store.TouchStateAsync("fpclock_card_count", cards.ToString(CultureInfo.InvariantCulture), ct);
        await store.TouchStateAsync("fpclock_log_count", logs.ToString(CultureInfo.InvariantCulture), ct);
        if (!string.IsNullOrWhiteSpace(lastPunch))
            await store.TouchStateAsync("fpclock_last_punch", lastPunch, ct);
    }

    private void StopBridge()
    {
        try
        {
            if (_bridge is { HasExited: false }) _bridge.Kill(entireProcessTree: true);
        }
        catch { }
        try { _bridge?.Dispose(); } catch { }
        _bridge = null;
        _signature = "";
    }

    private static string Text(JsonElement root, string name)
        => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static bool Bool(JsonElement root, string name)
        => root.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True;
    private static int Number(JsonElement root, string name)
        => root.TryGetProperty(name, out var value) && value.TryGetInt32(out var result) ? result : -1;

    private sealed class DevicePunchDto
    {
        public string? CardNo { get; set; }
        public string? EventAt { get; set; }
        public string? Direction { get; set; }
        public int VerifyMode { get; set; }
        public int Inout { get; set; }
        public int EventCode { get; set; }
        public int MachineNo { get; set; }
        public int EnrollMachineNo { get; set; }
        public string? Source { get; set; }
    }
}
