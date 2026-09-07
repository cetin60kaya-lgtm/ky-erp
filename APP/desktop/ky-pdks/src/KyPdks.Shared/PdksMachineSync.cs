using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KyPdks.Shared;

public sealed record PdksMachineCredential(
    string DeviceId,
    string Secret,
    string Company,
    string DeviceLabel,
    string MachineName,
    DateTimeOffset SavedAt);

public sealed record PdksAssistantResult(
    string Action,
    string Summary,
    bool Preview,
    bool Committed);

public sealed class MachineCredentialStore
{
    private readonly string _path;
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("KYERP-PDKS-MACHINE-SYNC-V1");
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public MachineCredentialStore(PdksPaths paths)
    {
        _path = Path.Combine(paths.Root, "device.credential.bin");
    }

    public void Save(PdksMachineCredential credential)
    {
        var clear = JsonSerializer.SerializeToUtf8Bytes(credential, Json);
        var encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.LocalMachine);
        var temp = _path + ".tmp";
        File.WriteAllBytes(temp, encrypted);
        File.Move(temp, _path, true);
    }

    public PdksMachineCredential? Load()
    {
        try
        {
            if (!File.Exists(_path)) return null;
            var encrypted = File.ReadAllBytes(_path);
            var clear = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.LocalMachine);
            return JsonSerializer.Deserialize<PdksMachineCredential>(clear, Json);
        }
        catch { return null; }
    }

    public void Clear()
    {
        try { if (File.Exists(_path)) File.Delete(_path); } catch { }
    }
}

public sealed class PdksMachineApiClient : IDisposable
{
    private readonly HttpClient _http;

    public PdksMachineApiClient(string baseAddress = "https://api.kyerp.net")
    {
        _http = new HttpClient { BaseAddress = new Uri(baseAddress.TrimEnd('/')), Timeout = TimeSpan.FromSeconds(30) };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("KY-PDKS-Agent/1.9.0");
    }

    public async Task<PdksMachineCredential> EnrollAsync(string userToken, PdksPaths paths, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/ik/personnel-control/device/enroll")
        {
            Content = JsonContent.Create(new { deviceLabel = paths.DeviceLabel, machineName = Environment.MachineName }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", userToken);
        using var response = await _http.SendAsync(request, ct);
        var root = await ReadAsync(response, ct);
        var data = Unwrap(root);
        return new PdksMachineCredential(
            Text(data, "deviceId"), Text(data, "secret"), Text(data, "company"),
            Text(data, "deviceLabel"), Text(data, "machineName"), DateTimeOffset.Now);
    }

    public async Task<SyncResult> SyncAsync(PdksMachineCredential credential, IReadOnlyList<PunchRow> punches, string deviceLabel, CancellationToken ct = default)
    {
        if (punches.Count == 0) return new SyncResult(new HashSet<string>(), new Dictionary<string, string>(), 0, 0);
        var rows = punches.Select(row => new
        {
            localId = row.Id,
            cardNo = row.CardNo,
            workDate = row.WorkDate,
            eventTime = row.EventTime.Length >= 5 ? row.EventTime[..5] : row.EventTime,
            direction = string.IsNullOrWhiteSpace(row.Direction) ? "AUTO" : row.Direction,
            source = deviceLabel,
            note = $"KY PDKS Agent · {row.Source}{(string.IsNullOrWhiteSpace(row.SourceRef) ? "" : $" · {row.SourceRef}")}",
        }).ToArray();

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/pdks-device/time-events/import")
        {
            Content = JsonContent.Create(new { source = deviceLabel, rows }),
        };
        request.Headers.Add("X-KYERP-PDKS-Device", credential.DeviceId);
        request.Headers.Add("X-KYERP-PDKS-Secret", credential.Secret);
        using var response = await _http.SendAsync(request, ct);
        var root = await ReadAsync(response, ct);
        var data = Unwrap(root);
        var rejected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (data.TryGetProperty("rejected", out var rejectedNode) && rejectedNode.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in rejectedNode.EnumerateArray())
            {
                var localId = Text(item, "localId");
                if (!string.IsNullOrWhiteSpace(localId)) rejected[localId] = Text(item, "reason");
            }
        }
        var acceptedIds = punches.Where(row => !rejected.ContainsKey(row.Id)).Select(row => row.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return new SyncResult(acceptedIds, rejected, Number(data, "acceptedCount", acceptedIds.Count), Number(data, "rejectedCount", rejected.Count));
    }

    public async Task HeartbeatAsync(PdksMachineCredential credential, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/pdks-device/heartbeat") { Content = JsonContent.Create(new { }) };
        request.Headers.Add("X-KYERP-PDKS-Device", credential.DeviceId);
        request.Headers.Add("X-KYERP-PDKS-Secret", credential.Secret);
        using var response = await _http.SendAsync(request, ct);
        _ = await ReadAsync(response, ct);
    }

    public async Task<PdksAssistantResult> AssistantAsync(string token, string command, bool commit, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/ik/personnel-control/assistant/command")
        {
            Content = JsonContent.Create(new { command, commit }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request, ct);
        var root = await ReadAsync(response, ct);
        var data = Unwrap(root);
        return new PdksAssistantResult(Text(data, "action"), Text(data, "summary"), Bool(data, "preview"), Bool(data, "committed"));
    }

    private static async Task<JsonElement> ReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var raw = await response.Content.ReadAsStringAsync(ct);
        using var document = string.IsNullOrWhiteSpace(raw) ? JsonDocument.Parse("{}") : JsonDocument.Parse(raw);
        var root = document.RootElement.Clone();
        if (!response.IsSuccessStatusCode || (root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False))
        {
            var message = root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object
                ? Text(error, "message") : $"KY ERP API hatası: {(int)response.StatusCode}";
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(message) ? "KY ERP işlemi tamamlanamadı." : message);
        }
        return root;
    }

    private static JsonElement Unwrap(JsonElement root)
        => root.TryGetProperty("data", out var data) ? data : root;

    private static string Text(JsonElement node, string name)
        => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value)
            ? value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString() : "";

    private static int Number(JsonElement node, string name, int fallback)
        => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : fallback;

    private static bool Bool(JsonElement node, string name)
        => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value)
            && (value.ValueKind == JsonValueKind.True || (value.ValueKind == JsonValueKind.String && bool.TryParse(value.GetString(), out var b) && b));

    public void Dispose() => _http.Dispose();
}
