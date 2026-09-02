using System.Globalization;
using System.IO.Ports;
using System.Net;
using System.Net.Sockets;
using System.Text;
using KyPdks.Shared;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "KYERP.PDKS.Agent");
builder.Services.AddSingleton<PdksPaths>();
builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<LocalPdksStore>();
builder.Services.AddSingleton<TextFileLog>();
builder.Services.AddHostedService<HeartbeatWorker>();
builder.Services.AddHostedService<FileImportWorker>();
builder.Services.AddHostedService<TerminalCaptureWorker>();
builder.Services.AddHostedService<ErpSyncWorker>();
builder.Services.AddHostedService<MaintenanceWorker>();
await builder.Build().RunAsync();

sealed class TextFileLog(PdksPaths paths)
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task WriteAsync(string level, string message, CancellationToken ct = default)
    {
        var acquired = false;
        try
        {
            await _gate.WaitAsync(ct);
            acquired = true;
            var path = Path.Combine(paths.Logs, $"agent-{DateTime.Today:yyyyMMdd}.log");
            await File.AppendAllTextAsync(path, $"{DateTimeOffset.Now:O}\t{level}\t{message}{Environment.NewLine}", new UTF8Encoding(false), ct);
        }
        catch { }
        finally { if (acquired) _gate.Release(); }
    }
}

sealed class HeartbeatWorker(LocalPdksStore store, ConfigStore configStore, TextFileLog fileLog, ILogger<HeartbeatWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        await fileLog.WriteAsync("INFO", "KY PDKS Agent başladı.", stoppingToken);
        logger.LogInformation("KY PDKS Agent started");
        while (!stoppingToken.IsCancellationRequested)
        {
            var config = configStore.Load();
            await store.TouchStateAsync("heartbeat", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture), stoppingToken);
            await store.TouchStateAsync("capture_mode", config.NormalizedMode, stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}

sealed class FileImportWorker(LocalPdksStore store, PdksPaths paths, ConfigStore configStore, TextFileLog fileLog, ILogger<FileImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            var config = configStore.Load();
            try
            {
                if (config.NormalizedMode == "HEDEF_TR500") await ScanHedefAsync(config, stoppingToken);
                if (config.FileImportEnabled) await ScanImportFolderAsync(config, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                await store.TouchStateAsync("last_message", $"Dosya aktarım hatası: {error.Message}", stoppingToken);
                await fileLog.WriteAsync("ERROR", $"Dosya aktarım hatası: {error}", stoppingToken);
                logger.LogError(error, "PDKS file scan failed");
            }
            await Task.Delay(config.ScanIntervalMs, stoppingToken);
        }
    }

    private async Task ScanHedefAsync(PdksConfig config, CancellationToken ct)
    {
        var file = config.HedefReadFile;
        if (string.IsNullOrWhiteSpace(file) || !File.Exists(file))
        {
            await store.TouchStateAsync("terminal_state", $"Hedef/TR500 bekleniyor · {file}", ct);
            return;
        }

        string[] lines;
        try
        {
            var encoding = ResolveEncoding(config.LineEncoding);
            using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, encoding, detectEncodingFromByteOrderMarks: true);
            var list = new List<string>();
            while (!reader.EndOfStream)
            {
                ct.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(ct);
                if (!string.IsNullOrWhiteSpace(line)) list.Add(line);
            }
            lines = list.ToArray();
        }
        catch (IOException)
        {
            await store.TouchStateAsync("terminal_state", $"Hedef/TR500 dosyası kullanımda · {file}", ct);
            return;
        }

        var accepted = 0;
        var duplicate = 0;
        var rejected = 0;
        foreach (var line in lines)
        {
            if (!PunchParser.TryParse(line, Path.GetFileName(file), out var parsed) || parsed is null)
            {
                rejected++;
                continue;
            }
            var punch = parsed with { Source = "HEDEF_TR500", SourceRef = file };
            if (await store.AddAsync(punch, ct)) accepted++; else duplicate++;
        }

        var message = $"Hedef/TR500 · {Path.GetFileName(file)} · yeni={accepted}, tekrar={duplicate}, tanınmayan={rejected}";
        await store.TouchStateAsync("terminal_state", $"Hedef/TR500 bağlı · {file}", ct);
        await store.TouchStateAsync("last_import", message, ct);
        if (accepted > 0)
        {
            await store.TouchStateAsync("last_message", message, ct);
            await fileLog.WriteAsync("PUNCH", message, ct);
            logger.LogInformation("{Message}", message);
        }
    }

    private async Task ScanImportFolderAsync(PdksConfig config, CancellationToken ct)
    {
        var files = Directory.EnumerateFiles(paths.Import)
            .Where(path => new[] { ".txt", ".csv", ".dat", ".log" }.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
            .OrderBy(File.GetCreationTimeUtc)
            .ToArray();

        foreach (var file in files)
        {
            ct.ThrowIfCancellationRequested();
            if (!await IsReadyAsync(file, ct)) continue;
            var accepted = 0;
            var duplicate = 0;
            var rejected = new List<string>();
            var encoding = ResolveEncoding(config.LineEncoding);
            foreach (var line in await File.ReadAllLinesAsync(file, encoding, ct))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (!PunchParser.TryParse(line, Path.GetFileName(file), out var parsed) || parsed is null)
                {
                    rejected.Add(line);
                    continue;
                }
                var punch = parsed with { Source = "FILE", SourceRef = Path.GetFileName(file) };
                if (await store.AddAsync(punch, ct)) accepted++; else duplicate++;
            }

            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmssfff", CultureInfo.InvariantCulture);
            if (rejected.Count > 0)
            {
                var rejectPath = Path.Combine(paths.Reject, $"{stamp}_{Path.GetFileNameWithoutExtension(file)}_REJECT.txt");
                await File.WriteAllLinesAsync(rejectPath, rejected, new UTF8Encoding(false), ct);
            }
            var archivePath = Path.Combine(paths.Archive, $"{stamp}_{Path.GetFileName(file)}");
            File.Move(file, archivePath, true);
            var message = $"{Path.GetFileName(file)}: alınan={accepted}, tekrar={duplicate}, reddedilen={rejected.Count}";
            await store.TouchStateAsync("last_import", message, ct);
            await store.TouchStateAsync("last_message", message, ct);
            await fileLog.WriteAsync("INFO", message, ct);
            logger.LogInformation("{Message}", message);
        }
    }

    private static Encoding ResolveEncoding(string name)
    {
        try { return Encoding.GetEncoding(string.IsNullOrWhiteSpace(name) ? "windows-1254" : name); }
        catch { return new UTF8Encoding(false); }
    }

    private static async Task<bool> IsReadyAsync(string file, CancellationToken ct)
    {
        try
        {
            var first = new FileInfo(file).Length;
            await Task.Delay(250, ct);
            var second = new FileInfo(file).Length;
            if (first != second) return false;
            using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None);
            return stream.Length >= 0;
        }
        catch { return false; }
    }
}

sealed class TerminalCaptureWorker(LocalPdksStore store, PdksPaths paths, ConfigStore configStore, TextFileLog fileLog, ILogger<TerminalCaptureWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            var config = configStore.Load();
            try
            {
                switch (config.NormalizedMode)
                {
                    case "TCP_SERVER": await RunTcpServerAsync(config, stoppingToken); break;
                    case "TCP_CLIENT": await RunTcpClientAsync(config, stoppingToken); break;
                    case "SERIAL": await RunSerialAsync(config, stoppingToken); break;
                    case "HEDEF_TR500":
                        await store.TouchStateAsync("terminal_state", $"Hedef/TR500 dosya köprüsü · {config.HedefReadFile}", stoppingToken);
                        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
                        break;
                    default:
                        await store.TouchStateAsync("terminal_state", "Dosya modu", stoppingToken);
                        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
                        break;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                var message = $"{config.NormalizedMode} bağlantı hatası: {error.Message}";
                await store.TouchStateAsync("terminal_state", message, stoppingToken);
                await store.TouchStateAsync("last_message", message, stoppingToken);
                await fileLog.WriteAsync("WARN", message, stoppingToken);
                logger.LogWarning(error, "Terminal capture connection failed");
                await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
        }
    }

    private async Task RunTcpServerAsync(PdksConfig config, CancellationToken ct)
    {
        var listener = new TcpListener(IPAddress.Any, config.TcpPort);
        listener.Start();
        await StateAsync($"TCP sunucu dinliyor · 0.0.0.0:{config.TcpPort}", ct);
        try
        {
            while (!ct.IsCancellationRequested && configStore.Load().NormalizedMode == "TCP_SERVER")
            {
                using var client = await listener.AcceptTcpClientAsync(ct);
                var remote = client.Client.RemoteEndPoint?.ToString() ?? "TCP";
                await StateAsync($"TCP cihaz bağlı · {remote}", ct);
                await ConsumeStreamAsync(client.GetStream(), "TCP_SERVER", remote, config, ct);
            }
        }
        finally { listener.Stop(); }
    }

    private async Task RunTcpClientAsync(PdksConfig config, CancellationToken ct)
    {
        using var client = new TcpClient();
        await StateAsync($"TCP cihaza bağlanıyor · {config.TcpHost}:{config.TcpPort}", ct);
        await client.ConnectAsync(config.TcpHost, config.TcpPort, ct);
        await StateAsync($"TCP cihaz bağlı · {config.TcpHost}:{config.TcpPort}", ct);
        await ConsumeStreamAsync(client.GetStream(), "TCP_CLIENT", $"{config.TcpHost}:{config.TcpPort}", config, ct);
    }

    private async Task RunSerialAsync(PdksConfig config, CancellationToken ct)
    {
        using var port = new SerialPort(config.SerialPort, config.SerialBaud)
        {
            NewLine = "\n",
            ReadTimeout = 2000,
            WriteTimeout = 2000,
            DtrEnable = true,
            RtsEnable = true,
        };
        port.Open();
        await StateAsync($"Seri cihaz bağlı · {config.SerialPort} / {config.SerialBaud}", ct);
        using var reader = new StreamReader(port.BaseStream, ResolveEncoding(config.LineEncoding), false, 1024, leaveOpen: true);
        while (!ct.IsCancellationRequested && configStore.Load().NormalizedMode == "SERIAL")
        {
            var line = await reader.ReadLineAsync(ct);
            if (line is null) break;
            await CaptureLineAsync(line, "SERIAL", $"{config.SerialPort}:{config.SerialBaud}", ct);
        }
    }

    private async Task ConsumeStreamAsync(Stream stream, string source, string sourceRef, PdksConfig config, CancellationToken ct)
    {
        using var reader = new StreamReader(stream, ResolveEncoding(config.LineEncoding), false, 2048, leaveOpen: true);
        while (!ct.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line is null) break;
            await CaptureLineAsync(line, source, sourceRef, ct);
        }
    }

    private async Task CaptureLineAsync(string line, string source, string sourceRef, CancellationToken ct)
    {
        if (!PunchParser.TryParse(line, sourceRef, out var parsed) || parsed is null)
        {
            var reject = Path.Combine(paths.Reject, $"terminal-{DateTime.Today:yyyyMMdd}.log");
            await File.AppendAllTextAsync(reject, $"{DateTimeOffset.Now:O}\t{sourceRef}\t{line}{Environment.NewLine}", new UTF8Encoding(false), ct);
            await store.TouchStateAsync("last_message", $"Terminal satırı tanınmadı · {sourceRef}", ct);
            return;
        }
        var punch = parsed with { Source = source, SourceRef = sourceRef };
        var inserted = await store.AddAsync(punch, ct);
        if (inserted)
        {
            var message = $"Kart {punch.CardNo} · {punch.WorkDate} {punch.EventTime[..5]} · {source}";
            await store.TouchStateAsync("last_terminal_punch", message, ct);
            await store.TouchStateAsync("last_message", message, ct);
            await fileLog.WriteAsync("PUNCH", message, ct);
        }
    }

    private async Task StateAsync(string value, CancellationToken ct)
    {
        await store.TouchStateAsync("terminal_state", value, ct);
        await store.TouchStateAsync("last_message", value, ct);
    }

    private static Encoding ResolveEncoding(string name)
    {
        try { return Encoding.GetEncoding(string.IsNullOrWhiteSpace(name) ? "windows-1254" : name); }
        catch { return new UTF8Encoding(false); }
    }
}

sealed class MaintenanceWorker(LocalPdksStore store, TextFileLog fileLog, ILogger<MaintenanceWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var backup = await store.BackupAsync(stoppingToken);
                await fileLog.WriteAsync("BACKUP", backup, stoppingToken);
                logger.LogInformation("PDKS backup created {Backup}", backup);
            }
            catch (Exception error)
            {
                await fileLog.WriteAsync("ERROR", $"Yedek hatası: {error.Message}", stoppingToken);
            }
            await Task.Delay(TimeSpan.FromHours(12), stoppingToken);
        }
    }
}
