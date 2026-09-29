using System.Diagnostics;
using System.Globalization;

namespace HKN.Personel.Native;

internal sealed record TerminalDevicePunch(string EmployeeCode, DateTime OccurredAt, int InOut, int VerifyMode, int EventCode, int TerminalNumber);
internal sealed record TerminalDeviceSnapshot(bool Connected, string Message, DateTime? DeviceTime, int NewLogCount, int UserCount, int CardCount, IReadOnlyList<TerminalDevicePunch> Punches)
{
    public static TerminalDeviceSnapshot Offline(string message) => new(false, message, null, -1, -1, -1, Array.Empty<TerminalDevicePunch>());
}
internal sealed record TerminalCommandResult(bool Success, string Message);

internal static class TerminalDeviceClient
{
    public static TerminalDeviceSettings Settings => TerminalDeviceSettingsStore.Load();
    public static Task<TerminalDeviceSnapshot> ReadAsync(bool readPunches, CancellationToken cancellationToken = default) => RunReadAsync(readPunches ? "read" : "status", cancellationToken);

    public static async Task<TerminalCommandResult> ExecuteAsync(string mode, CancellationToken cancellationToken = default)
    {
        var run = await RunBridgeAsync(mode, cancellationToken);
        foreach (var raw in run.Output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var p = raw.Split('|');
            if (p.Length >= 3 && p[0] == "ACTION") return new(p[1] == "OK", string.Join(" ", p.Skip(2)));
            if (p.Length >= 3 && p[0] == "STATUS" && p[1] == "ERROR") return new(false, string.Join(" ", p.Skip(2)));
        }
        return new(false, string.IsNullOrWhiteSpace(run.Error) ? "Cihaz komutundan yanıt alınamadı." : run.Error.Trim());
    }

    static async Task<TerminalDeviceSnapshot> RunReadAsync(string mode, CancellationToken ct)
    {
        var run = await RunBridgeAsync(mode, ct);
        return Parse(run.Output, run.Error);
    }

    static async Task<(string Output, string Error)> RunBridgeAsync(string mode, CancellationToken ct)
    {
        var bridge = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_BRIDGE") ?? Path.Combine(AppContext.BaseDirectory, "KYERP.TerminalBridge.exe");
        if (!File.Exists(bridge)) return ("STATUS|ERROR|Terminal köprüsü bulunamadı. Tam kurulum paketini kullanın.", "");

        var sdk = TerminalSdkLocator.Resolve();
        if (!sdk.CanAttemptConnection) return ("STATUS|ERROR|" + sdk.Message, "");

        var saved = TerminalDeviceSettingsStore.Load();
        var ip = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_IP") ?? saved.IpAddress;
        var port = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_PORT") ?? saved.IpPort.ToString(CultureInfo.InvariantCulture);
        var machine = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_MACHINE") ?? saved.MachineNo.ToString(CultureInfo.InvariantCulture);
        var workingDirectory = Directory.Exists(sdk.WorkingDirectory) ? sdk.WorkingDirectory : AppContext.BaseDirectory;

        var psi = new ProcessStartInfo(bridge)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workingDirectory
        };
        var existingPath = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        psi.Environment["PATH"] = workingDirectory + Path.PathSeparator + existingPath;
        psi.Environment["KY_PDKS_TERMINAL_SDK"] = workingDirectory;
        psi.ArgumentList.Add(mode);
        psi.ArgumentList.Add(ip);
        psi.ArgumentList.Add(port);
        psi.ArgumentList.Add(machine);

        try
        {
            using var process = Process.Start(psi);
            if (process is null) return ("STATUS|ERROR|Terminal köprüsü başlatılamadı.", "");
            var outputTask = process.StandardOutput.ReadToEndAsync(ct);
            var errorTask = process.StandardError.ReadToEndAsync(ct);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(12));
            await process.WaitForExitAsync(timeout.Token);
            return (await outputTask, await errorTask);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return ("STATUS|ERROR|Kart cihazı zaman aşımına uğradı. IP/port ve ağ erişimini kontrol edin.", "");
        }
        catch (Exception ex)
        {
            return ("STATUS|ERROR|" + FriendlyTerminalError(ex.GetBaseException().Message), "");
        }
    }

    static string FriendlyTerminalError(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return "Terminal SDK hatası.";
        if (message.Contains("entry point", StringComparison.OrdinalIgnoreCase) || message.Contains("giriş noktası", StringComparison.OrdinalIgnoreCase) || message.Contains("FM_RecordRead", StringComparison.OrdinalIgnoreCase))
            return "Terminal SDK sürümü uyumsuz. Hedef PDKS'nin çalışan FP_CLOCK.ocx / DLL seti kullanılmalı.";
        if (message.Contains("class not registered", StringComparison.OrdinalIgnoreCase) || message.Contains("80040154", StringComparison.OrdinalIgnoreCase))
            return "FP_CLOCK 32-bit ActiveX Windows'ta kayıtlı değil. Terminal Merkezi > Sürücüyü Onar işlemini kullanın.";
        return message.Replace("|", "/").Replace("\r", " ").Replace("\n", " ");
    }

    static TerminalDeviceSnapshot Parse(string output, string error)
    {
        DateTime? deviceTime = null;
        var newLogs = -1;
        var users = -1;
        var cards = -1;
        var punches = new List<TerminalDevicePunch>();
        foreach (var raw in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var p = raw.Split('|');
            if (p.Length >= 3 && p[0] == "STATUS" && p[1] == "ERROR") return TerminalDeviceSnapshot.Offline(string.Join(" ", p.Skip(2)));
            if (p.Length >= 6 && p[0] == "STATUS" && p[1] == "OK")
            {
                if (DateTime.TryParseExact(p[2], "s", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)) deviceTime = dt;
                int.TryParse(p[3], out newLogs);
                int.TryParse(p[4], out users);
                int.TryParse(p[5], out cards);
                continue;
            }
            if (p.Length >= 7 && p[0] == "LOG" && DateTime.TryParseExact(p[2], "s", CultureInfo.InvariantCulture, DateTimeStyles.None, out var at))
            {
                int.TryParse(p[3], out var inout);
                int.TryParse(p[4], out var verify);
                int.TryParse(p[5], out var evt);
                int.TryParse(p[6], out var terminal);
                punches.Add(new(p[1], at, inout, verify, evt, terminal));
            }
        }
        if (deviceTime is null) return TerminalDeviceSnapshot.Offline(string.IsNullOrWhiteSpace(error) ? "Kart cihazından geçerli yanıt alınamadı." : FriendlyTerminalError(error.Trim()));
        return new(true, "Bağlı", deviceTime, newLogs, users, cards, punches);
    }
}
