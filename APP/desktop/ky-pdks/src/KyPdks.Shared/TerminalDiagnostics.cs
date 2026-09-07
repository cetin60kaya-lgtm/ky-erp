using System.Globalization;
using System.Net.Sockets;

namespace KyPdks.Shared;

public sealed record TerminalTcpProbe(
    bool Reachable,
    string Host,
    int Port,
    long ElapsedMs,
    string Message);

public sealed record HedefFileProbe(
    bool Exists,
    string Path,
    long SizeBytes,
    DateTimeOffset? LastWriteAt,
    int TotalLines,
    int ParsedLines,
    int RejectedLines,
    int DuplicateLines,
    RawPunch? LastPunch,
    string Message);

public static class TerminalDiagnostics
{
    public static async Task<TerminalTcpProbe> ProbeTcpAsync(string host, int port, int timeoutMs = 1500, CancellationToken ct = default)
    {
        host = (host ?? "").Trim();
        port = Math.Clamp(port, 1, 65535);
        if (host.Length == 0) return new(false, host, port, 0, "IP/host boş.");

        var started = DateTimeOffset.UtcNow;
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct);
        linked.CancelAfter(Math.Clamp(timeoutMs, 250, 10000));
        try
        {
            using var client = new TcpClient();
            await client.ConnectAsync(host, port, linked.Token);
            var elapsed = Math.Max(0, (long)(DateTimeOffset.UtcNow - started).TotalMilliseconds);
            return new(true, host, port, elapsed, $"TCP bağlantısı açık · {host}:{port} · {elapsed} ms");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            var elapsed = Math.Max(0, (long)(DateTimeOffset.UtcNow - started).TotalMilliseconds);
            return new(false, host, port, elapsed, $"TCP zaman aşımı · {host}:{port}");
        }
        catch (Exception error)
        {
            var elapsed = Math.Max(0, (long)(DateTimeOffset.UtcNow - started).TotalMilliseconds);
            return new(false, host, port, elapsed, $"TCP bağlantısı kurulamadı · {host}:{port} · {error.Message}");
        }
    }

    public static async Task<HedefFileProbe> InspectHedefFileAsync(string path, CancellationToken ct = default)
    {
        path = (path ?? "").Trim();
        if (path.Length == 0) return new(false, path, 0, null, 0, 0, 0, 0, null, "timerecords yolu boş.");
        if (!File.Exists(path)) return new(false, path, 0, null, 0, 0, 0, 0, null, $"Dosya bulunamadı · {path}");

        var info = new FileInfo(path);
        var total = 0;
        var parsed = 0;
        var rejected = 0;
        var duplicate = 0;
        RawPunch? lastPunch = null;
        var fingerprints = new HashSet<string>(StringComparer.Ordinal);

        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var reader = new StreamReader(stream, detectEncodingFromByteOrderMarks: true);
            while (!reader.EndOfStream)
            {
                ct.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line)) continue;
                total++;
                if (!PunchParser.TryParse(line, Path.GetFileName(path), out var punch) || punch is null)
                {
                    rejected++;
                    continue;
                }

                parsed++;
                if (!fingerprints.Add(punch.Fingerprint)) duplicate++;
                if (lastPunch is null || punch.EventAt > lastPunch.EventAt) lastPunch = punch;
            }

            var message = $"timerecords hazır · satır={total} · okunan={parsed} · tekrar={duplicate} · tanınmayan={rejected}";
            return new(true, path, info.Length, new DateTimeOffset(info.LastWriteTime), total, parsed, rejected, duplicate, lastPunch, message);
        }
        catch (Exception error)
        {
            return new(true, path, info.Length, new DateTimeOffset(info.LastWriteTime), total, parsed, rejected, duplicate, lastPunch,
                $"timerecords okunamadı · {error.Message}");
        }
    }

    public static string FormatPunch(RawPunch? punch)
        => punch is null ? "Kayıt yok" : $"{punch.CardNo} · {punch.EventAt.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("tr-TR"))}";
}
