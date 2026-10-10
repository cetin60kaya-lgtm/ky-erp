using System.Text.Json;
using System.Text.RegularExpressions;

namespace KyPdks.Unified;

/// <summary>
/// Same-origin, GET-only aggregate diagnostics for the existing WebView2 host.
/// No secrets, cards, names, command IDs, paths, raw error messages or mutations.
/// Never equate a heartbeat with proven physical-terminal presence.
/// </summary>
internal static class UnifiedLocalDiagnostics
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private const string Schema = "KY_PDKS_LOCAL_DIAGNOSTICS_V1";
    private static readonly Regex Code = new(@"^[A-Z][A-Z0-9_]{2,69}$", RegexOptions.Compiled);

    internal static string ReadJson(string? companyRoot, DateTimeOffset? clock = null)
    {
        var now = clock ?? DateTimeOffset.UtcNow;
        var lastCompleted = (string?)null;
        var lastResult = "NOT_CONFIGURED";
        var heartbeat = "UNKNOWN";
        var received = 0;
        var applied = 0;
        var pending = 0;
        var errors = 0;
        // Source root must come from the existing, authorized Agent configuration,
        // never from the URL query string or arbitrary browser-provided file path.
        if (!string.IsNullOrWhiteSpace(companyRoot) && Directory.Exists(companyRoot))
        {
            var health = Path.Combine(companyRoot, "SISTEM", "AgentState", "unified-agent-health.json");
            try
            {
                if (File.Exists(health) && new FileInfo(health).Length is > 0 and < 65536)
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(health));
                    var root = doc.RootElement;
                    if (root.ValueKind == JsonValueKind.Object)
                    {
                        var rawResult = Value(root, "result");
                        // Error strings can contain user data or upstream response text.
                        lastResult = NormalizeCode(rawResult);
                        var rawAt = Value(root, "lastCompletedAt");
                        if (DateTimeOffset.TryParse(rawAt, out var at))
                        {
                            lastCompleted = at.ToUniversalTime().ToString("O");
                            var pollText = Value(root, "pollMinutes");
                            var mins = int.TryParse(pollText, out var parsed) ? Math.Clamp(parsed, 5, 60) : 5;
                            var age = now - at;
                            heartbeat = age >= TimeSpan.Zero && age <= TimeSpan.FromMinutes(mins * 2 + 2)
                                ? "RECENT" : "STALE";
                        }
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                lastResult = "LOCAL_HEALTH_UNREADABLE";
            }
            var journal = Path.Combine(companyRoot, "SISTEM", "SyncJournal");
            if (Directory.Exists(journal))
            {
                try
                {
                    foreach (var receive in Directory.EnumerateFiles(journal, "*.received.json",
                        SearchOption.TopDirectoryOnly).Take(501))
                    {
                        if (File.GetAttributes(receive).HasFlag(FileAttributes.ReparsePoint)) continue;
                        received++;
                        var receipt = receive + ".applied.json";
                        if (File.Exists(receipt)) applied++;
                        var state = Path.ChangeExtension(receive, ".state.json");
                        var ack = false;
                        if (File.Exists(state) && new FileInfo(state).Length is > 0 and < 65536)
                        {
                            try
                            {
                                using var document = JsonDocument.Parse(File.ReadAllText(state));
                                var code = Value(document.RootElement, "state");
                                ack = code is "CLOUD_ACK_CONFIRMED" or "CLOUD_ACK_REPLAYED";
                                if (code is "LOCAL_VERIFY_BLOCKED" or "LOCAL_COMMAND_REJECTED")
                                    errors++;
                            }
                            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
                            {
                                errors++;
                            }
                        }
                        if (File.Exists(receipt) && !ack) pending++;
                    }
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    errors++;
                }
            }
        }
        return JsonSerializer.Serialize(new
        {
            schema = Schema, scope = "LOCAL_ONLY", liveWritesEnabled = false,
            heartbeat, lastCompletedAt = lastCompleted, lastResult,
            received, applied, pendingAcks = pending, localErrors = errors,
        }, Json);
    }

    private static string Value(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty(name, out var element)) return "";
        return element.ValueKind == JsonValueKind.String ? element.GetString() ?? "" :
            element.ValueKind == JsonValueKind.Number ? element.ToString() : "";
    }
    private static string NormalizeCode(string value)
    {
        var code = value.Trim().ToUpperInvariant();
        if (code.StartsWith("CLOUD_ERROR:", StringComparison.Ordinal)) return "CLOUD_ERROR";
        if (code.StartsWith("AGENT_ERROR:", StringComparison.Ordinal)) return "AGENT_ERROR";
        if (code.StartsWith("SIGNED_DELIVERY_INVALID:", StringComparison.Ordinal))
            return "SIGNED_DELIVERY_INVALID";
        return Code.IsMatch(code) ? code : "RESULT_REDACTED";
    }

    internal static void SelfTest()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-health-" + Guid.NewGuid().ToString("N"));
        try
        {
            var state = Path.Combine(root, "SISTEM", "AgentState");
            var journal = Path.Combine(root, "SISTEM", "SyncJournal");
            Directory.CreateDirectory(state);
            Directory.CreateDirectory(journal);
            File.WriteAllText(Path.Combine(state, "unified-agent-health.json"),
                "{\"result\":\"AGENT_ERROR:Bearer PERSONAL_TOKEN name@example.com\",\"pollMinutes\":5," +
                "\"lastCompletedAt\":\"2026-10-10T12:00:00+00:00\"}");
            var path = Path.Combine(journal, new string('a', 64) + ".received.json");
            File.WriteAllText(path, "{\"secret\":\"DO_NOT_OUTPUT\",\"cardNo\":\"00334\"}");
            File.WriteAllText(path + ".applied.json", "{\"secret\":\"DO_NOT_OUTPUT\"}");
            File.WriteAllText(Path.ChangeExtension(path, ".state.json"),
                "{\"state\":\"LOCAL_APPLIED_ACK_PENDING\",\"secret\":\"DO_NOT_OUTPUT\"}");
            var parsed = ReadJson(root, new DateTimeOffset(2026,10,10,12,1,0,TimeSpan.Zero));
            using var doc = JsonDocument.Parse(parsed);
            var value = doc.RootElement;
            if (Value(value, "heartbeat") != "RECENT" ||
                Value(value, "lastResult") != "AGENT_ERROR" ||
                value.GetProperty("received").GetInt32() != 1 ||
                value.GetProperty("pendingAcks").GetInt32() != 1 ||
                parsed.Contains("PERSONAL_TOKEN", StringComparison.Ordinal) ||
                parsed.Contains("DO_NOT_OUTPUT", StringComparison.Ordinal) ||
                parsed.Contains("00334", StringComparison.Ordinal))
                throw new InvalidOperationException("PDKS_LOCAL_DIAGNOSTICS_SELFTEST_FAILED");
            var stale = ReadJson(root, new DateTimeOffset(2026,10,11,12,0,0,TimeSpan.Zero));
            if (!stale.Contains("\"heartbeat\":\"STALE\"", StringComparison.Ordinal))
                throw new InvalidOperationException("PDKS_LOCAL_HEARTBEAT_STALE_TEST_FAILED");
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }
}
