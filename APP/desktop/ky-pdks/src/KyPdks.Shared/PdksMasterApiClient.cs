using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed record PdksWorkGroup(
    string Id,
    string Code,
    string Name,
    string EntryTime,
    string ExitTime,
    int LateTolerance,
    int EarlyTolerance,
    bool Active);

public sealed record PdksService(
    string Id,
    string Code,
    string Name,
    string RouteNote,
    bool Active);

public sealed record PdksMasterAssignment(string EmployeeId, string TargetId);

public sealed record PdksMasterSnapshot(
    IReadOnlyList<PdksWorkGroup> Groups,
    IReadOnlyList<PdksService> Services,
    IReadOnlyList<PdksMasterAssignment> GroupAssignments,
    IReadOnlyList<PdksMasterAssignment> ServiceAssignments,
    bool Audit);

public sealed class PdksMasterApiClient : IDisposable
{
    private readonly HttpClient _http;

    public PdksMasterApiClient(string baseAddress = "https://api.kyerp.net")
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(baseAddress.TrimEnd('/')),
            Timeout = TimeSpan.FromSeconds(30),
        };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("KY-PDKS-Windows/1.3");
    }

    public async Task<PdksMasterSnapshot> GetAsync(string token, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Get, "/api/ik/personnel-control/pdks-masters", null, token, ct);
        var data = Unwrap(document.RootElement);
        return new PdksMasterSnapshot(
            ReadGroups(data),
            ReadServices(data),
            ReadAssignments(data, "groupAssignments", "groupId"),
            ReadAssignments(data, "serviceAssignments", "serviceId"),
            Bool(data, "audit"));
    }

    public async Task SaveWorkGroupAsync(string token, PdksWorkGroup group, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/work-groups", new
        {
            id = string.IsNullOrWhiteSpace(group.Id) ? null : group.Id,
            code = group.Code,
            name = group.Name,
            entryTime = group.EntryTime,
            exitTime = group.ExitTime,
            lateTolerance = group.LateTolerance,
            earlyTolerance = group.EarlyTolerance,
            active = group.Active,
        }, token, ct);
    }

    public async Task AssignWorkGroupAsync(string token, string employeeId, string groupId, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Post,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(employeeId)}/work-group",
            new { groupId }, token, ct);
    }

    public async Task SaveServiceAsync(string token, PdksService service, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Post, "/api/ik/personnel-control/services", new
        {
            id = string.IsNullOrWhiteSpace(service.Id) ? null : service.Id,
            code = service.Code,
            name = service.Name,
            routeNote = service.RouteNote,
            active = service.Active,
        }, token, ct);
    }

    public async Task AssignServiceAsync(string token, string employeeId, string serviceId, CancellationToken ct = default)
    {
        using var document = await SendAsync(HttpMethod.Post,
            $"/api/ik/personnel-control/people/{Uri.EscapeDataString(employeeId)}/service",
            new { serviceId }, token, ct);
    }

    private async Task<JsonDocument> SendAsync(HttpMethod method, string path, object? body, string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        JsonDocument document;
        try { document = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw); }
        catch { throw new InvalidOperationException($"KY ERP geçersiz yanıt döndürdü (HTTP {(int)response.StatusCode})."); }
        if (!response.IsSuccessStatusCode || IsFailure(document.RootElement))
        {
            var message = ErrorMessage(document.RootElement) ?? $"KY ERP isteği başarısız (HTTP {(int)response.StatusCode}).";
            document.Dispose();
            throw new InvalidOperationException(message);
        }
        return document;
    }

    private static IReadOnlyList<PdksWorkGroup> ReadGroups(JsonElement data)
    {
        if (!data.TryGetProperty("groups", out var rows) || rows.ValueKind != JsonValueKind.Array) return Array.Empty<PdksWorkGroup>();
        return rows.EnumerateArray().Select(row => new PdksWorkGroup(
            Text(row, "id"), Text(row, "code"), Text(row, "name"),
            Text(row, "entryTime", "entry_time"), Text(row, "exitTime", "exit_time"),
            Number(row, "lateTolerance", "late_tolerance"), Number(row, "earlyTolerance", "early_tolerance"),
            Bool(row, "active"))).ToArray();
    }

    private static IReadOnlyList<PdksService> ReadServices(JsonElement data)
    {
        if (!data.TryGetProperty("services", out var rows) || rows.ValueKind != JsonValueKind.Array) return Array.Empty<PdksService>();
        return rows.EnumerateArray().Select(row => new PdksService(
            Text(row, "id"), Text(row, "code"), Text(row, "name"), Text(row, "routeNote", "route_note"), Bool(row, "active"))).ToArray();
    }

    private static IReadOnlyList<PdksMasterAssignment> ReadAssignments(JsonElement data, string property, string targetProperty)
    {
        if (!data.TryGetProperty(property, out var rows) || rows.ValueKind != JsonValueKind.Array) return Array.Empty<PdksMasterAssignment>();
        return rows.EnumerateArray().Select(row => new PdksMasterAssignment(
            Text(row, "employeeId", "employee_id"), Text(row, targetProperty))).ToArray();
    }

    private static JsonElement Unwrap(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out var data) ? data : root;

    private static bool IsFailure(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False;

    private static string? ErrorMessage(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) return null;
        if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object)
        {
            var message = Text(error, "message");
            if (!string.IsNullOrWhiteSpace(message)) return message;
        }
        var direct = Text(root, "message");
        return string.IsNullOrWhiteSpace(direct) ? null : direct;
    }

    private static string Text(JsonElement node, params string[] names)
    {
        if (node.ValueKind != JsonValueKind.Object) return "";
        foreach (var name in names)
        {
            if (!node.TryGetProperty(name, out var value)) continue;
            return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
        }
        return "";
    }

    private static int Number(JsonElement node, params string[] names)
    {
        foreach (var name in names)
        {
            if (!node.TryGetProperty(name, out var value)) continue;
            if (value.TryGetInt32(out var number)) return number;
            if (int.TryParse(value.ToString(), out number)) return number;
        }
        return 0;
    }

    private static bool Bool(JsonElement node, string name)
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(name, out var value)) return false;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Number => value.TryGetInt32(out var n) && n != 0,
            JsonValueKind.String => value.GetString() is string s && (s == "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase)),
            _ => false,
        };
    }

    public void Dispose() => _http.Dispose();
}
