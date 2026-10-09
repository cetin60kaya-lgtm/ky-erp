using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KyPdks.Unified;

internal sealed record UnifiedJournalSnapshot(
    string JournalId,
    string CommandId,
    string OutboxId,
    string CommandPayloadSha256,
    string DeliveryHash,
    string State,
    DateTimeOffset CreatedAt);

/// <summary>
/// An immutable, per-command receive record and an optional durable local receipt.
/// The local receipt is written before any Cloud ACK. Restarted/overlapping Agents
/// must replay this exact receipt, never apply a second local operation.
/// No Firebird, TNF, terminal or production data is touched by this store.
/// </summary>
internal static class UnifiedJournalStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    internal static string JournalId(string company, string commandId)
    {
        if (string.IsNullOrWhiteSpace(company) || string.IsNullOrWhiteSpace(commandId))
            throw new InvalidOperationException("JOURNAL_IDENTITY_REQUIRED");
        var raw = Encoding.UTF8.GetBytes(company.Trim().ToLowerInvariant() + "|" + commandId.Trim());
        return Convert.ToHexString(SHA256.HashData(raw)).ToLowerInvariant();
    }

    internal static async Task<(string JournalPath, UnifiedJournalSnapshot Snapshot)> ReceiveAsync(
        string companyRoot,
        string company,
        string commandId,
        string outboxId,
        string commandPayloadSha256,
        string deliveryHash,
        CancellationToken cancellationToken = default)
    {
        if (!IsSha256(commandPayloadSha256) || !IsSha256(deliveryHash) ||
            string.IsNullOrWhiteSpace(outboxId))
            throw new InvalidOperationException("JOURNAL_FINGERPRINT_INVALID");
        var id = JournalId(company, commandId);
        var dir = Path.Combine(companyRoot, "SISTEM", "SyncJournal");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, id + ".received.json");
        var snapshot = new UnifiedJournalSnapshot(id, commandId, outboxId,
            commandPayloadSha256, deliveryHash, "RECEIVED_VERIFIED", DateTimeOffset.UtcNow);
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(snapshot, JsonOptions));
        try
        {
            await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write,
                FileShare.None, 4096, FileOptions.WriteThrough);
            await output.WriteAsync(bytes, cancellationToken);
            await output.FlushAsync(cancellationToken);
            return (path, snapshot);
        }
        catch (IOException) when (File.Exists(path))
        {
            // The delivery hash can change on a new signed lease. The immutable
            // command hash, company-specific filename and outbox ID cannot.
            var raw = await File.ReadAllTextAsync(path, cancellationToken);
            var existing = JsonSerializer.Deserialize<UnifiedJournalSnapshot>(raw)
                ?? throw new InvalidOperationException("JOURNAL_CORRUPTED");
            if (existing.JournalId != id || existing.CommandId != commandId ||
                existing.OutboxId != outboxId ||
                !StringComparer.OrdinalIgnoreCase.Equals(existing.CommandPayloadSha256, commandPayloadSha256))
                throw new InvalidOperationException("JOURNAL_REPLAY_CONFLICT");
            return (path, existing);
        }
    }

    internal static async Task<JsonElement?> ReadAppliedReceiptAsync(
        string journalPath, string commandId, string outboxId, string commandPayloadSha256,
        CancellationToken cancellationToken = default)
    {
        var path = journalPath + ".applied.json";
        if (!File.Exists(path)) return null;
        using var document = JsonDocument.Parse(await File.ReadAllTextAsync(path, cancellationToken));
        var receipt = document.RootElement;
        if (receipt.ValueKind != JsonValueKind.Object ||
            Property(receipt, "commandId") != commandId ||
            Property(receipt, "outboxId") != outboxId ||
            !StringComparer.OrdinalIgnoreCase.Equals(Property(receipt, "commandPayloadSha256"),commandPayloadSha256) ||
            Property(receipt, "journalId") != Path.GetFileName(journalPath).Split('.')[0] ||
            string.IsNullOrWhiteSpace(Property(receipt, "appliedAt")) ||
            !IsSha256(Property(receipt, "policySha256")) ||
            !IsSha256(Property(receipt, "fdbEvidenceSha256")) ||
            !IsSha256(Property(receipt, "evidenceSha256")) ||
            !receipt.TryGetProperty("sourceValidated", out var sourceProof) ||
            sourceProof.ValueKind != JsonValueKind.True ||
            !receipt.TryGetProperty("fdbValidated", out var firebirdProof) ||
            firebirdProof.ValueKind != JsonValueKind.True ||
            !receipt.TryGetProperty("tnfTouched", out var tnfProof) ||
            tnfProof.ValueKind != JsonValueKind.False)
            throw new InvalidOperationException("JOURNAL_APPLIED_RECEIPT_CONFLICT");
        var digest=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            Property(receipt, "policySha256") + "|" + Property(receipt, "fdbEvidenceSha256")
        ))).ToLowerInvariant();
        if(!StringComparer.OrdinalIgnoreCase.Equals(digest,Property(receipt,"evidenceSha256")))
            throw new InvalidOperationException("JOURNAL_COMBINED_EVIDENCE_HASH_INVALID");
        await VerifyLocalPolicyProofAsync(journalPath, receipt, cancellationToken);
        return receipt.Clone();
    }

    private static async Task VerifyLocalPolicyProofAsync(
        string journalPath, JsonElement receipt, CancellationToken cancellationToken)
    {
        // Receipt replay is admissible only while the actual immutable
        // locally-applied policy bytes still exist and match its SHA-256.
        var root = Path.GetFullPath(Path.Combine(
            Path.GetDirectoryName(journalPath)!, "..", ".."));
        var policyRoot = Path.Combine(root, "SISTEM", "UnifiedPolicies");
        var hash = Property(receipt, "policySha256");
        foreach (var scope in new[] { "personnel-groups", "employee-personnel-groups", "holidays" })
        {
            var dir = Path.Combine(policyRoot, scope);
            if (!Directory.Exists(dir)) continue;
            foreach (var file in Directory.EnumerateFiles(dir, "*.json", SearchOption.TopDirectoryOnly))
            {
                var bytes = await File.ReadAllBytesAsync(file, cancellationToken);
                var actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
                if (!StringComparer.OrdinalIgnoreCase.Equals(hash, actual)) continue;
                using var source = JsonDocument.Parse(bytes);
                var value = source.RootElement;
                if (Property(value, "commandId") != Property(receipt, "commandId") ||
                    Property(value, "outboxId") != Property(receipt, "outboxId") ||
                    !StringComparer.OrdinalIgnoreCase.Equals(
                        Property(value, "commandPayloadSha256"),
                        Property(receipt, "commandPayloadSha256")))
                    throw new InvalidOperationException("JOURNAL_POLICY_PROOF_IDENTITY_MISMATCH");
                return;
            }
        }
        throw new InvalidOperationException("JOURNAL_POLICY_EVIDENCE_MISSING");
    }

    internal static async Task SaveAppliedReceiptAsync(
        string journalPath, JsonElement receipt, CancellationToken cancellationToken = default)
    {
        var destination = journalPath + ".applied.json";
        if (receipt.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException("JOURNAL_RECEIPT_INVALID");
        var existing = await ReadAppliedReceiptAsync(journalPath,
            Property(receipt, "commandId"),
            Property(receipt, "outboxId"),
            Property(receipt, "commandPayloadSha256"), cancellationToken);
        var payload = JsonSerializer.Serialize(receipt, JsonOptions);
        if (existing is not null)
        {
            if (!StringComparer.Ordinal.Equals(JsonSerializer.Serialize(existing.Value, JsonOptions), payload))
                throw new InvalidOperationException("JOURNAL_APPLIED_RECEIPT_EXISTS");
            return;
        }
        var temp = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        await File.WriteAllTextAsync(temp, payload, new UTF8Encoding(false), cancellationToken);
        try { File.Move(temp, destination, false); }
        catch (IOException) when (File.Exists(destination))
        {
            var other = await ReadAppliedReceiptAsync(journalPath,
                Property(receipt, "commandId"), Property(receipt, "outboxId"),
                Property(receipt, "commandPayloadSha256"), cancellationToken);
            if (other is null) throw;
            // Concurrent writer already persisted a matching identity.
            if (!StringComparer.Ordinal.Equals(
                JsonSerializer.Serialize(other.Value, JsonOptions), payload))
                throw new InvalidOperationException("JOURNAL_CONCURRENT_RECEIPT_CONFLICT");
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    internal static async Task SelfTestAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-journal-" + Guid.NewGuid().ToString("N"));
        try
        {
            var a = new string('a',64);
            var b = new string('b',64);
            var first = await ReceiveAsync(root,"company-1","command-1","outbox-1",a,b);
            var second = await ReceiveAsync(root,"company-1","command-1","outbox-1",a,new string('c',64));
            if (first.JournalPath != second.JournalPath ||
                first.Snapshot.CreatedAt != second.Snapshot.CreatedAt)
                throw new InvalidOperationException("JOURNAL_DUPLICATE_CREATED");
            try
            {
                await ReceiveAsync(root,"company-1","command-1","outbox-1",new string('d',64),b);
                throw new InvalidOperationException("JOURNAL_CONFLICT_NOT_REJECTED");
            }
            catch (InvalidOperationException error) when(error.Message=="JOURNAL_REPLAY_CONFLICT") { }

            var policyDir=Path.Combine(root,"SISTEM","UnifiedPolicies","holidays");
            Directory.CreateDirectory(policyDir);
            var fact=JsonSerializer.SerializeToUtf8Bytes(new
            {
                commandId="command-1", outboxId="outbox-1", commandPayloadSha256=a,
            });
            var policyHash=Convert.ToHexString(SHA256.HashData(fact)).ToLowerInvariant();
            var combined=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                policyHash+"|"+b))).ToLowerInvariant();
            var policyPath=Path.Combine(policyDir,"fixture.json");
            await File.WriteAllBytesAsync(policyPath,fact);
            using var parsed = JsonSerializer.SerializeToDocument(new
            {
                journalId=first.Snapshot.JournalId,
                commandId="command-1",outboxId="outbox-1",commandPayloadSha256=a,
                appliedAt="2026-10-08T00:00:00Z",policySha256=policyHash,
                fdbEvidenceSha256=b,evidenceSha256=combined,
                sourceValidated=true,fdbValidated=true,tnfTouched=false,
            });
            await SaveAppliedReceiptAsync(first.JournalPath, parsed.RootElement);
            var replay = await ReadAppliedReceiptAsync(first.JournalPath,"command-1","outbox-1",a);
            if (replay is null || Property(replay.Value,"journalId")!=first.Snapshot.JournalId)
                throw new InvalidOperationException("JOURNAL_RECEIPT_REPLAY_FAILED");
            await SaveAppliedReceiptAsync(first.JournalPath, parsed.RootElement);
            try
            {
                await ReadAppliedReceiptAsync(first.JournalPath,"command-1","outbox-1",b);
                throw new InvalidOperationException("JOURNAL_REPLAY_SHA_NOT_ENFORCED");
            }
            catch (InvalidOperationException error) when(error.Message=="JOURNAL_APPLIED_RECEIPT_CONFLICT") { }
            await File.WriteAllTextAsync(policyPath,"TAMPERED_POLICY_BYTES");
            try
            {
                await ReadAppliedReceiptAsync(first.JournalPath,"command-1","outbox-1",a);
                throw new InvalidOperationException("JOURNAL_MODIFIED_POLICY_NOT_REJECTED");
            }
            catch (InvalidOperationException error) when(error.Message=="JOURNAL_POLICY_EVIDENCE_MISSING") { }
            File.Delete(policyPath);
            try
            {
                await ReadAppliedReceiptAsync(first.JournalPath,"command-1","outbox-1",a);
                throw new InvalidOperationException("JOURNAL_MISSING_POLICY_NOT_REJECTED");
            }
            catch (InvalidOperationException error) when(error.Message=="JOURNAL_POLICY_EVIDENCE_MISSING") { }
        }
        finally {try{ Directory.Delete(root,true); }catch{}}
    }

    private static string Property(JsonElement node,string key)=>
        node.ValueKind==JsonValueKind.Object && node.TryGetProperty(key,out var v) &&
        v.ValueKind==JsonValueKind.String ? v.GetString()??"" : "";

    private static bool IsSha256(string value)=>
        value.Length==64 && value.All(c=> c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F');
}
