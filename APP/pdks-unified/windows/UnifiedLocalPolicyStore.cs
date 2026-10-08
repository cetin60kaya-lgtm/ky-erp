using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace KyPdks.Unified;

internal sealed record UnifiedPolicyApplied(
    string JournalId,
    string CommandId,
    string OutboxId,
    string CommandPayloadSha256,
    string PolicySha256,
    string AppliedAt,
    string PolicyKind,
    bool Replayed);

/// <summary>
/// Non-FDB administrative policies owned by KY PDKS. Two allowlisted operations
/// are safely mirrored as immutable policy facts. This is NOT punch evidence,
/// payroll approval, a Firebird migration or a replacement for TNF.
/// </summary>
internal static class UnifiedLocalPolicyStore
{
    internal static bool Supports(string action) =>
        action is "personnel-group" or "holiday";

    internal static async Task<UnifiedPolicyApplied> ApplyAsync(
        string companyRoot,
        string action,
        JsonElement commandData,
        string journalId,
        string commandId,
        string outboxId,
        string commandPayloadSha256,
        CancellationToken cancellationToken = default)
    {
        if (!Supports(action)) throw new InvalidOperationException("POLICY_ACTION_NOT_ALLOWLISTED");
        if (commandData.ValueKind!=JsonValueKind.Object)
            throw new InvalidOperationException("POLICY_DATA_REQUIRED");
        if (string.IsNullOrWhiteSpace(commandId) || string.IsNullOrWhiteSpace(outboxId) ||
            commandPayloadSha256.Length!=64 || commandPayloadSha256.Any(ch=>!Uri.IsHexDigit(ch)))
            throw new InvalidOperationException("POLICY_COMMAND_PROOF_MISSING");

        string scope,key;
        if (action=="personnel-group")
        {
            var code=Text(commandData,"code");
            var name=Text(commandData,"name");
            var category=Text(commandData,"personnelClass");
            var reason=Text(commandData,"reason");
            if (code.Length is < 2 or > 40 || name.Length is < 2 or > 150 ||
                reason.Length is < 8 or > 900 ||
                category is not ("BLUE_COLLAR" or "WHITE_COLLAR" or "CUSTOM") ||
                !commandData.TryGetProperty("requirePunch",out var requirePunch) ||
                requirePunch.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new InvalidOperationException("PERSONNEL_GROUP_POLICY_INVALID");
            scope="personnel-groups";
            key=commandPayloadSha256;
        }
        else
        {
            var date=Text(commandData,"date");
            var name=Text(commandData,"name");
            var reason=Text(commandData,"note");
            if (!DateTime.TryParseExact(date,"yyyy-MM-dd",CultureInfo.InvariantCulture,
                    DateTimeStyles.None,out var parsed) ||
                parsed.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)!=date ||
                name.Length is < 2 or > 150 || reason.Length is < 8 or > 900 ||
                !commandData.TryGetProperty("halfDay",out var halfDay) ||
                halfDay.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                throw new InvalidOperationException("HOLIDAY_POLICY_INVALID");
            scope="holidays";
            key=date;
        }

        var directory=Path.Combine(companyRoot,"SISTEM","UnifiedPolicies",scope);
        Directory.CreateDirectory(directory);
        var destination=Path.Combine(directory,key+".json");
        var candidate=new
        {
            version=1,
            source="SIGNED_CLOUD_ADMIN_COMMAND",
            action,
            commandId,
            outboxId,
            commandPayloadSha256,
            journalId,
            // No fabricated employee punches, no transformed date/amount.
            commandData=commandData.Clone(),
        };
        var canonical=JsonSerializer.Serialize(candidate);
        var bytes=Encoding.UTF8.GetBytes(canonical);
        var candidateHash=Hash(bytes);
        var replayed=false;
        var recordHash=candidateHash;
        try
        {
            // No in-place overwrite. Crash before commit leaves no target.
            // Crash after move and before ACK is detected by the replay path.
            var temp=destination+"."+Guid.NewGuid().ToString("N")+".tmp";
            try
            {
                await File.WriteAllBytesAsync(temp,bytes,cancellationToken);
                File.Move(temp,destination,false);
            }
            finally {if(File.Exists(temp))File.Delete(temp);}
        }
        catch (IOException) when (File.Exists(destination))
        {
            // For the same command the exact payload remains immutable.
            // A different command attempting a holiday on the same date is a
            // conflict and is not silently accepted or overwritten.
            var previous=await File.ReadAllBytesAsync(destination,cancellationToken);
            recordHash=Hash(previous);
            if (!StringComparer.OrdinalIgnoreCase.Equals(recordHash,candidateHash))
                throw new InvalidOperationException("LOCAL_POLICY_CONFLICT");
            replayed=true;
        }
        var verified=Hash(await File.ReadAllBytesAsync(destination,cancellationToken));
        if(!StringComparer.OrdinalIgnoreCase.Equals(verified,candidateHash))
            throw new InvalidOperationException("LOCAL_POLICY_FILE_HASH_MISMATCH");
        return new(journalId,commandId,outboxId,commandPayloadSha256,
            verified,DateTimeOffset.UtcNow.ToString("O"),scope,replayed);
    }

    internal static async Task SelfTestAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"ky-pdks-policy-"+Guid.NewGuid().ToString("N"));
        try
        {
            using var group=JsonDocument.Parse(
                "{\"code\":\"ADMIN_01\",\"name\":\"Idari Personel\",\"personnelClass\":\"WHITE_COLLAR\",\"requirePunch\":false,\"reason\":\"Onaylı personel grubu testi\"}");
            using var holiday=JsonDocument.Parse(
                "{\"date\":\"2026-10-29\",\"name\":\"Cumhuriyet Bayramı\",\"halfDay\":false,\"note\":\"İşletme tam gün kapalıdır\"}");
            var hash=new string('a',64);
            var first=await ApplyAsync(root,"personnel-group",group.RootElement,"j","command-1","outbox-1",hash);
            var replay=await ApplyAsync(root,"personnel-group",group.RootElement,"j","command-1","outbox-1",hash);
            if(first.Replayed || !replay.Replayed || first.PolicySha256!=replay.PolicySha256)
                throw new InvalidOperationException("POLICY_IDEMPOTENCY_TEST_FAILED");
            var normal=await ApplyAsync(root,"holiday",holiday.RootElement,"j2","command-2","outbox-2",new string('b',64));
            if(normal.Replayed) throw new InvalidOperationException("POLICY_HOLIDAY_TEST_FAILED");
            try
            {
                await ApplyAsync(root,"holiday",holiday.RootElement,"j3","command-3","outbox-3",new string('c',64));
                throw new InvalidOperationException("POLICY_CONFLICT_NOT_REJECTED");
            }
            catch(InvalidOperationException error) when(error.Message=="LOCAL_POLICY_CONFLICT") {}
        }
        finally {try { Directory.Delete(root,true); }catch{}}
    }

    private static string Text(JsonElement json,string key)=>
        json.TryGetProperty(key,out var value) && value.ValueKind==JsonValueKind.String
            ? value.GetString()?.Trim()??"" : "";

    private static string Hash(byte[] bytes)=>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
