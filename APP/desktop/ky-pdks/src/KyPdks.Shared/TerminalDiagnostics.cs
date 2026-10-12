using System.Diagnostics;
using System.Net.Sockets;
using System.Text;

namespace KyPdks.Shared;

public sealed record TerminalTcpProbeResult(bool Connected, string Host, int Port, long ElapsedMs, string Message);
public sealed record TerminalFileProbeResult(bool Exists, bool Readable, long SizeBytes, int ParsedCount, int RejectedCount, RawPunch? LastPunch, string Message);

public static class TerminalDiagnostics
{
    public static async Task<TerminalTcpProbeResult> ProbeTcpAsync(string host, int port, int timeoutMs = 2500, CancellationToken ct = default)
    {
        host = string.IsNullOrWhiteSpace(host) ? "127.0.0.1" : host.Trim();
        port = Math.Clamp(port, 1, 65535);
        timeoutMs = Math.Clamp(timeoutMs, 250, 15000);
        var sw = Stopwatch.StartNew();
        try
        {
            using var client = new TcpClient();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(timeoutMs);
            await client.ConnectAsync(host, port, timeout.Token);
            sw.Stop();
            return new(true, host, port, sw.ElapsedMilliseconds, $"TCP bağlantısı açık · {host}:{port} · {sw.ElapsedMilliseconds} ms");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            sw.Stop();
            return new(false, host, port, sw.ElapsedMilliseconds, $"TCP zaman aşımı · {host}:{port} · {timeoutMs} ms");
        }
        catch (Exception error)
        {
            sw.Stop();
            return new(false, host, port, sw.ElapsedMilliseconds, $"TCP bağlantısı kurulamadı · {host}:{port} · {error.Message}");
        }
    }

    public static async Task<TerminalFileProbeResult> ProbeHedefFileAsync(string file, string encodingName = "windows-1254", CancellationToken ct = default)
    {
        file = (file ?? "").Trim();
        if (file.Length == 0) return new(false, false, 0, 0, 0, null, "Hedef veri dosyası yolu boş.");
        if (!File.Exists(file)) return new(false, false, 0, 0, 0, null, $"Hedef veri dosyası bulunamadı · {file}");

        try
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            Encoding encoding;
            try { encoding = Encoding.GetEncoding(string.IsNullOrWhiteSpace(encodingName) ? "windows-1254" : encodingName); }
            catch { encoding = new UTF8Encoding(false); }

            var parsed = 0;
            var rejected = 0;
            RawPunch? last = null;
            using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            var size = stream.Length;
            using var reader = new StreamReader(stream, encoding, detectEncodingFromByteOrderMarks: true);
            while (!reader.EndOfStream)
            {
                ct.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line)) continue;
                if (PunchParser.TryParse(line, file, out var punch) && punch is not null)
                {
                    parsed++;
                    if (last is null || punch.EventAt > last.EventAt) last = punch;
                }
                else rejected++;
            }

            var lastText = last is null ? "son kart yok" : $"son kart {last.CardNo} · {last.EventAt:dd.MM.yyyy HH:mm:ss}";
            return new(true, true, size, parsed, rejected, last, $"Hedef dosyası okunuyor · kayıt={parsed} · tanınmayan={rejected} · {lastText}");
        }
        catch (Exception error)
        {
            return new(true, false, 0, 0, 0, null, $"Hedef veri dosyası okunamadı · {error.Message}");
        }
    }
}
