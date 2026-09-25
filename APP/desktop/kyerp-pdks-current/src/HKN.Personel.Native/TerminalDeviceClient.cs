using System.Diagnostics;
using System.Globalization;

namespace HKN.Personel.Native;

internal sealed record TerminalDevicePunch(
    string EmployeeCode, DateTime OccurredAt, int InOut, int VerifyMode, int EventCode, int TerminalNumber);

internal sealed record TerminalDeviceSnapshot(
    bool Connected, string Message, DateTime? DeviceTime, int NewLogCount, int UserCount, int CardCount,
    IReadOnlyList<TerminalDevicePunch> Punches)
{
    public static TerminalDeviceSnapshot Offline(string message) =>
        new(false, message, null, -1, -1, -1, Array.Empty<TerminalDevicePunch>());
}

internal static class TerminalDeviceClient
{
    public static async Task<TerminalDeviceSnapshot> ReadAsync(bool readPunches, CancellationToken cancellationToken = default)
    {
        var bridge = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_BRIDGE") ?? Path.Combine(AppContext.BaseDirectory, "KYERP.TerminalBridge.exe");
        if (!File.Exists(bridge)) return TerminalDeviceSnapshot.Offline("Terminal köprüsü bulunamadı.");
        var ip = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_IP") ?? "192.168.1.224";
        var port = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_PORT") ?? "5005";
        var machine = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_MACHINE") ?? "1";
        var psi = new ProcessStartInfo(bridge)
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true,
            RedirectStandardError = true, WorkingDirectory = AppContext.BaseDirectory
        };
        psi.ArgumentList.Add(readPunches ? "read" : "status");
        psi.ArgumentList.Add(ip); psi.ArgumentList.Add(port); psi.ArgumentList.Add(machine);
        try
        {
            using var process = Process.Start(psi);
            if (process is null) return TerminalDeviceSnapshot.Offline("Terminal köprüsü başlatılamadı.");
            var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(7));
            await process.WaitForExitAsync(timeout.Token);
            var output = await outputTask;
            var error = await errorTask;
            return Parse(output, error);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return TerminalDeviceSnapshot.Offline("Kart cihazı 7 saniye içinde yanıt vermedi.");
        }
        catch (Exception ex) { return TerminalDeviceSnapshot.Offline(ex.Message); }
    }

    static TerminalDeviceSnapshot Parse(string output, string error)
    {
        DateTime? deviceTime = null; var newLogs = -1; var users = -1; var cards = -1;
        var punches = new List<TerminalDevicePunch>();
        foreach (var raw in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var p = raw.Split('|');
            if (p.Length >= 3 && p[0] == "STATUS" && p[1] == "ERROR")
                return TerminalDeviceSnapshot.Offline(string.Join(" ", p.Skip(2)));
            if (p.Length >= 6 && p[0] == "STATUS" && p[1] == "OK")
            {
                if (DateTime.TryParseExact(p[2], "s", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)) deviceTime = dt;
                int.TryParse(p[3], out newLogs); int.TryParse(p[4], out users); int.TryParse(p[5], out cards);
                continue;
            }
            if (p.Length >= 7 && p[0] == "LOG" &&
                DateTime.TryParseExact(p[2], "s", CultureInfo.InvariantCulture, DateTimeStyles.None, out var at))
            {
                int.TryParse(p[3], out var inout); int.TryParse(p[4], out var verify);
                int.TryParse(p[5], out var evt); int.TryParse(p[6], out var terminal);
                punches.Add(new TerminalDevicePunch(p[1], at, inout, verify, evt, terminal));
            }
        }
        if (deviceTime is null)
        {
            var message = string.IsNullOrWhiteSpace(error) ? "Kart cihazından geçerli yanıt alınamadı." : error.Trim();
            return TerminalDeviceSnapshot.Offline(message);
        }
        return new TerminalDeviceSnapshot(true, "Bağlı", deviceTime, newLogs, users, cards, punches);
    }
}
