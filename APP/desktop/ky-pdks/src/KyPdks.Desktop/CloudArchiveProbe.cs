using System.Text.Json;

namespace KyPdks.Desktop;

/// <summary>
/// Read-only inspection of real Google Drive paths by an isolated local Node
/// process. The WebView2 host can have Windows RedirectionTrust mitigation
/// enabled; it must not disable that mitigation to enumerate mounted volumes.
/// No shell invocation, user-supplied executable or network access.
/// </summary>
public static class CloudArchiveProbe
{
    public sealed record Result(string Root, int EvidenceCount, IReadOnlyList<string> MissingPaths,
        IReadOnlyList<string> Candidates, int RootsChecked, int Created);

    private static string NodeExe => Path.Combine(AppContext.BaseDirectory,
        "Integrations", "bin", "node.exe");
    private static string Script => Path.Combine(AppContext.BaseDirectory,
        "Integrations", "file-hub-agent", "archive-root-probe.mjs");

    public static bool Available => File.Exists(NodeExe) && File.Exists(Script) &&
        CloudArchiveTaskBridge.Available;

    public static bool IsCloudPath(string input)
    {
        if (string.IsNullOrWhiteSpace(input) || !Path.IsPathFullyQualified(input)) return false;
        var current = Path.GetDirectoryName(Path.GetFullPath(input));
        while (!string.IsNullOrWhiteSpace(current))
        {
            var name = Path.GetFileName(Path.TrimEndingDirectorySeparator(current));
            if (name.Equals("Googledrive", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("Google Drive", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("DriveFS", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("OneDrive", StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith("OneDrive - ", StringComparison.OrdinalIgnoreCase)) return true;
            var parent = Path.GetDirectoryName(current);
            if (parent is null || parent.Equals(current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
        return false;
    }

    private static Result Call(object input)
    {
        if (!Available) throw new InvalidOperationException(
            "KY ERP yerel bulut doğrulama bileşeni kurulu değil.");
        // The Task Scheduler service starts the trusted packaged helper under
        // this same interactive Windows user with LUA permissions. We never
        // weaken the WPF process' RedirectionGuard mitigation.
        var output = CloudArchiveTaskBridge.CallReadOnly(JsonSerializer.Serialize(input));
        using var parsed = JsonDocument.Parse(output);
        var json = parsed.RootElement;
        if (!json.TryGetProperty("ok", out var ok) || !ok.GetBoolean())
        {
            var message = json.TryGetProperty("error", out var err) ? err.GetString() : "Bilinmeyen klasör hatası";
            throw new IOException("Yerel bulut arşivi doğrulanamadı: " + message);
        }
        static int Number(JsonElement data, string property) =>
            data.TryGetProperty(property, out var item) ? item.GetInt32() : 0;
        static string[] Strings(JsonElement data, string property) =>
            data.TryGetProperty(property, out var item)
                ? item.EnumerateArray().Select(value => value.GetString() ?? "").ToArray()
                : Array.Empty<string>();
        return new Result(json.TryGetProperty("root", out var root) ? root.GetString() ?? "" : "",
            Number(json, "evidenceCount"), Strings(json, "missingPaths"),
            Strings(json, "candidates"), Number(json, "rootsChecked"), Number(json, "created"));
    }

    public static Result Inspect(string root, IReadOnlyList<string>? standardPaths = null) =>
        Call(new { action = "inspect", root, standardPaths = standardPaths ?? Array.Empty<string>() });
    public static Result Ensure(string root, IReadOnlyList<string> standardPaths) =>
        throw new UnauthorizedAccessException(
            "Bulut arşivine bu ekrandan dosya veya klasör yazılmaz.");
    public static Result Discover() => Call(new { action = "discover" });
}
