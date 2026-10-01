using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;

namespace HKN.Personel.Native;

internal sealed record TerminalNativeProbeResult(
    bool Connected,
    DateTime? DeviceTime,
    int BytesRead,
    string Message);

internal static partial class TerminalNative5001Client
{
    const int NativePort = 5001;

    public static async Task<TerminalNativeProbeResult> ProbeAsync(
        string ip,
        bool captureRaw = false,
        CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(ip, NativePort, timeout.Token);
            using var stream = client.GetStream();
            var buffer = new byte[12 * 1024];
            var total = 0;
            var idleUntil = DateTime.UtcNow.AddMilliseconds(700);
            while (total < buffer.Length && DateTime.UtcNow < idleUntil)
            {
                if (!stream.DataAvailable)
                {
                    await Task.Delay(80, timeout.Token);
                    continue;
                }
                var read = await stream.ReadAsync(buffer.AsMemory(total), timeout.Token);
                if (read <= 0) break;
                total += read;
                idleUntil = DateTime.UtcNow.AddMilliseconds(250);
            }

            if (total < 4 || buffer[0] != 0x5D || buffer[1] != 0x55)
                return new(false, null, total, "KY Native 5001 yanıtı beklenen çerçevede değil.");

            var text = Encoding.ASCII.GetString(buffer, 0, total);
            DateTime? deviceTime = null;
            var match = DeviceClockRegex().Match(text);
            if (match.Success && DateTime.TryParseExact(
                match.Value, "yyyy-MM-dd HH:mm:ss",
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var parsed))
                deviceTime = parsed;

            var msg = deviceTime.HasValue
                ? $"KY Native bağlı • {ip}:{NativePort} • cihaz saati {deviceTime:dd.MM.yyyy HH:mm:ss}"
                : $"KY Native bağlı • {ip}:{NativePort} • {total:N0} bayt durum verisi";
            if (captureRaw && total > 0)
            {
                CompanyDataPaths.Ensure();
                var captureDir = Path.Combine(CompanyDataPaths.Logs, "TerminalNative");
                Directory.CreateDirectory(captureDir);
                var capturePath = Path.Combine(captureDir, $"native_{DateTime.Now:yyyyMMdd_HHmmss_fff}.bin");
                await File.WriteAllBytesAsync(capturePath, buffer.AsMemory(0, total).ToArray(), cancellationToken);
                msg += $" • ham örnek: {Path.GetFileName(capturePath)}";
            }
            return new(true, deviceTime, total, msg);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(false, null, 0, $"KY Native {ip}:{NativePort} zaman aşımı.");
        }
        catch (Exception ex)
        {
            return new(false, null, 0, "KY Native bağlantı hatası: " + ex.GetBaseException().Message);
        }
    }

    [GeneratedRegex(@"20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", RegexOptions.CultureInvariant)]
    private static partial Regex DeviceClockRegex();
}
