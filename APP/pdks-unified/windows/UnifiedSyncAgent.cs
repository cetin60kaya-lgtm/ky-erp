using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KyPdks.Unified;

internal sealed record UnifiedAgentCredential(
    string DeviceId,
    string Secret,
    string Company,
    string SigningKey,
    string CompanyRoot);

internal static class UnifiedSyncAgent
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    private static readonly SemaphoreSlim Gate = new(1, 1);

    internal static async Task<string> RunOnceAsync(CancellationToken cancellationToken = default)
    {
        await Gate.WaitAsync(cancellationToken);
        try
        {
            var credential = LoadCredential();
            if (credential is null) return "AGENT_CONFIG_REQUIRED";

            using var http = new HttpClient
            {
                BaseAddress = new Uri(Read("KY_PDKS_API_BASE", "https://api.kyerp.net")),
                Timeout = TimeSpan.FromSeconds(25),
            };
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/pdks-unified/outbox/next");
            AddDeviceHeaders(request, credential);
            using var response = await http.SendAsync(request, cancellationToken);
            var root = await ParseResponseAsync(response, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return "CLOUD_ERROR:" + ErrorMessage(root, (int)response.StatusCode);
            if (!root.TryGetProperty("data", out var data) ||
                data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                return "NO_PENDING_COMMAND";

            var verified = VerifyDelivery(data, credential);
            if (!verified.Ok)
            {
                // Never ACK/RETRY a forged or untrusted unsigned envelope. Let its
                // server-side lease expire and keep the rejection in local diagnostics.
                return "SIGNED_DELIVERY_INVALID:" + verified.Message;
            }

            using var payloadDocument = JsonDocument.Parse(verified.CanonicalJson);
            var envelope = payloadDocument.RootElement.Clone();
            var outboxId = Text(envelope, "outboxId");
            var commandId = Text(envelope, "commandId");
            var action = Text(envelope, "action");
            var commandHash = Text(envelope, "commandPayloadSha256");
            var company = Text(envelope, "company");
            if (!string.Equals(company, credential.Company, StringComparison.OrdinalIgnoreCase))
            {
                await PostResultAsync(http, credential, data, "RETRY", "TENANT_MISMATCH", null, cancellationToken);
                return "TENANT_MISMATCH";
            }

            var localCardNo = "";
            DateTime? workDate = null;
            JsonElement commandData = default;
            if (envelope.TryGetProperty("payload", out var operationPayload) &&
                operationPayload.ValueKind == JsonValueKind.Object)
            {
                localCardNo = Text(operationPayload, "localCardNo");
                if (operationPayload.TryGetProperty("commandData", out var foundCommandData) &&
                    foundCommandData.ValueKind == JsonValueKind.Object)
                {
                    commandData = foundCommandData.Clone();
                    var date = Text(commandData, "date");
                    if (string.IsNullOrWhiteSpace(date)) date = Text(commandData, "startDate");
                    if (DateTime.TryParse(date, out var parsed)) workDate = parsed.Date;
                }
            }
            if (commandData.ValueKind != JsonValueKind.Object)
            {
                await PostResultAsync(http, credential, data, "RETRY",
                    "LOCAL_COMMAND_DATA_REQUIRED:" + action, null, cancellationToken);
                return "LOCAL_COMMAND_DATA_REQUIRED";
            }

            var plan = UnifiedLocalActionPlanner.Build(action, commandData);
            var journalId = Guid.NewGuid().ToString("N");
            var journalPath = WriteJournal(credential, journalId, new
            {
                journalId,
                state = "LOCAL_PLAN_FROZEN",
                receivedAt = DateTimeOffset.UtcNow,
                outboxId,
                commandId,
                action,
                deliveryHash = Text(data, "deliveryHash"),
                commandPayloadSha256 = commandHash,
                localCardNo,
                plan = plan.ToJournal(),
                commandData,
            });

            var evidence = await FirebirdTnfReadOnlyVerifier.VerifyAsync(localCardNo, workDate, cancellationToken);
            AppendJournalState(journalPath, new
            {
                journalId,
                state = evidence.Ready ? "LOCAL_READONLY_VERIFIED" : "LOCAL_VERIFY_BLOCKED",
                verifiedAt = DateTimeOffset.UtcNow,
                evidence,
            });
            if (!evidence.Ready)
            {
                await PostResultAsync(http, credential, data, "RETRY",
                    evidence.Code + ":" + evidence.Message, null, cancellationToken);
                return evidence.Code;
            }

            // Frozen plan is part of the journal. The plan itself controls whether an
            // action is proven safe enough to enter an apply handler; the environment
            // flag cannot override a plan that is not approved by source+copy-FDB tests.
            if (!plan.ApplySupported)
            {
                await PostResultAsync(http, credential, data, "RETRY",
                    "LOCAL_PLAN_NOT_APPLY_READY:" + action, null, cancellationToken);
                return "LOCAL_PLAN_NOT_APPLY_READY";
            }
            if (!string.Equals(Read("KY_PDKS_UNIFIED_APPLY_ENABLED"), "1", StringComparison.Ordinal))
            {
                await PostResultAsync(http, credential, data, "RETRY",
                    "LOCAL_APPLY_DISABLED_AFTER_SAFE_VERIFY", null, cancellationToken);
                return "LOCAL_READONLY_VERIFIED_WAITING_APPLY";
            }

            await PostResultAsync(http, credential, data, "RETRY",
                "LOCAL_ACTION_HANDLER_NOT_IMPLEMENTED:" + action, null, cancellationToken);
            return "LOCAL_ACTION_HANDLER_NOT_IMPLEMENTED";
        }
        catch (Exception error)
        {
            return "AGENT_ERROR:" + error.Message;
        }
        finally
        {
            Gate.Release();
        }
    }

    private static (bool Ok, string Message, string CanonicalJson) VerifyDelivery(
        JsonElement data,
        UnifiedAgentCredential credential)
    {
        try
        {
            if (!string.Equals(Text(data, "signatureAlg"), "HMAC-SHA256", StringComparison.Ordinal))
                return (false, "SIGNATURE_ALGORITHM", "");
            var encoded = Text(data, "signedPayload");
            var signature = Text(data, "signature");
            var canonicalBytes = Convert.FromBase64String(encoded);
            var actual = Convert.FromBase64String(signature);
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(credential.SigningKey));
            var expected = hmac.ComputeHash(canonicalBytes);
            if (!CryptographicOperations.FixedTimeEquals(expected, actual))
                return (false, "SIGNATURE_MISMATCH", "");
            var canonical = Encoding.UTF8.GetString(canonicalBytes);
            var hash = Convert.ToHexString(SHA256.HashData(canonicalBytes)).ToLowerInvariant();
            if (!string.Equals(hash, Text(data, "deliveryHash"), StringComparison.OrdinalIgnoreCase))
                return (false, "DELIVERY_HASH_MISMATCH", "");
            using var envelope = JsonDocument.Parse(canonical);
            var signed = envelope.RootElement;
            if (signed.ValueKind != JsonValueKind.Object ||
                Text(signed, "version") != "1" ||
                string.IsNullOrWhiteSpace(Text(signed, "outboxId")) ||
                string.IsNullOrWhiteSpace(Text(signed, "commandId")) ||
                string.IsNullOrWhiteSpace(Text(signed, "commandPayloadSha256")) ||
                !string.Equals(Text(signed, "outboxId"), Text(data, "outboxId"), StringComparison.Ordinal) ||
                !string.Equals(Text(signed, "commandId"), Text(data, "commandId"), StringComparison.Ordinal) ||
                !string.Equals(Text(signed, "leaseUntil"), Text(data, "leaseUntil"), StringComparison.Ordinal) ||
                !string.Equals(Text(signed, "deviceId"), credential.DeviceId, StringComparison.Ordinal) ||
                !string.Equals(Text(signed, "company"), credential.Company, StringComparison.OrdinalIgnoreCase))
                return (false, "SIGNED_ENVELOPE_BINDING_MISMATCH", "");
            if (!DateTimeOffset.TryParse(Text(signed, "leaseUntil"), out var leaseUntil) ||
                leaseUntil <= DateTimeOffset.UtcNow ||
                leaseUntil > DateTimeOffset.UtcNow.AddMinutes(6))
                return (false, "SIGNED_LEASE_EXPIRED_OR_INVALID", "");
            return (true, "OK", canonical);
        }
        catch (Exception error)
        {
            return (false, error.Message, "");
        }
    }

    private static async Task PostResultAsync(
        HttpClient http,
        UnifiedAgentCredential credential,
        JsonElement delivery,
        string status,
        string reason,
        object? localReceipt,
        CancellationToken cancellationToken)
    {
        var id = Text(delivery, "outboxId");
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"/api/auth/pdks-unified/outbox/{Uri.EscapeDataString(id)}/ack");
        AddDeviceHeaders(request, credential);
        request.Content = JsonContent.Create(new
        {
            status,
            reason,
            deliveryHash = Text(delivery, "deliveryHash"),
            localReceipt,
        });
        using var response = await http.SendAsync(request, cancellationToken);
        var root = await ParseResponseAsync(response, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ErrorMessage(root, (int)response.StatusCode));
    }

    private static UnifiedAgentCredential? LoadCredential()
    {
        var id = Read("KY_PDKS_DEVICE_ID");
        var secret = Read("KY_PDKS_DEVICE_SECRET");
        var company = Read("KY_PDKS_DEVICE_COMPANY");
        var signingKey = Read("KY_PDKS_UNIFIED_SYNC_KEY");
        var root = Read("KY_PDKS_COMPANY_ROOT");
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(secret) ||
            string.IsNullOrWhiteSpace(company) || string.IsNullOrWhiteSpace(signingKey) ||
            string.IsNullOrWhiteSpace(root)) return null;
        return new(id, secret, company.ToLowerInvariant(), signingKey, root);
    }

    private static string WriteJournal(UnifiedAgentCredential credential, string journalId, object value)
    {
        var dir = Path.Combine(credential.CompanyRoot, "SISTEM", "SyncJournal");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{DateTime.Now:yyyyMMdd_HHmmssfff}_{journalId}.json");
        AtomicWrite(path, JsonSerializer.Serialize(value, Json));
        return path;
    }

    private static void AppendJournalState(string path, object value)
    {
        var statePath = Path.ChangeExtension(path, ".state.json");
        AtomicWrite(statePath, JsonSerializer.Serialize(value, Json));
    }

    private static void AtomicWrite(string path, string content)
    {
        var temp = path + ".tmp";
        File.WriteAllText(temp, content, new UTF8Encoding(false));
        File.Move(temp, path, true);
    }

    private static async Task<JsonElement> ParseResponseAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw);
        return doc.RootElement.Clone();
    }

    private static string ErrorMessage(JsonElement root, int status)
    {
        if (root.TryGetProperty("error", out var error) &&
            error.TryGetProperty("message", out var message)) return message.GetString() ?? $"HTTP {status}";
        return $"HTTP {status}";
    }

    private static void AddDeviceHeaders(HttpRequestMessage request, UnifiedAgentCredential credential)
    {
        request.Headers.Add("X-KYERP-PDKS-Device", credential.DeviceId);
        request.Headers.Add("X-KYERP-PDKS-Secret", credential.Secret);
    }

    private static string Text(JsonElement node, string name)
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(name, out var value)) return "";
        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
    }

    private static string Read(string name, string fallback = "")
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        try
        {
            value = Environment.GetEnvironmentVariable(name, EnvironmentVariableTarget.User);
        }
        catch { value = null; }
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }
}
