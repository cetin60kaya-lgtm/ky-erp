using System.Net.Http.Headers;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed record PdksScopeProfile(string Scope, bool Audit, string UserName, string Role);

public static class PdksScopeClient
{
    public static async Task<PdksScopeProfile> GetAsync(string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return new PdksScopeProfile("", false, "", "");
        using var http = new HttpClient
        {
            BaseAddress = new Uri("https://api.kyerp.net"),
            Timeout = TimeSpan.FromSeconds(20),
        };
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var response = await http.GetAsync("/api/ik/personnel-control/profile", ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"PDKS yetki profili alınamadı (HTTP {(int)response.StatusCode}).");
        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
        var root = document.RootElement;
        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out var data)) root = data;
        var scope = Text(root, "scope");
        var username = Text(root, "username");
        var role = Text(root, "role");
        var audit = Bool(root, "audit") || string.Equals(scope, "AUDIT", StringComparison.OrdinalIgnoreCase)
            || string.Equals(username, "denetim", StringComparison.OrdinalIgnoreCase);
        return new PdksScopeProfile(scope, audit, username, role);
    }

    private static string Text(JsonElement root, string name)
        => root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var value)
            ? value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString()
            : "";

    private static bool Bool(JsonElement root, string name)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(name, out var value)) return false;
        return value.ValueKind == JsonValueKind.True || (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var result) && result);
    }
}
