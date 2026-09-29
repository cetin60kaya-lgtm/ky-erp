using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Sync;

namespace HKN.Personel.Native;

internal static class PdksDesktopSnapshot
{
    internal static async Task QueuePersonnelIfChangedAsync(string outboxRoot, CancellationToken ct = default)
    {
        var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
        var table = db.Query("select PKNO,AD,SOYAD,IGTARIH,ICTARIH,MAAS from KIMLIK order by PKNO");
        var records = table.Rows.Cast<DataRow>().Select(row => new
        {
            code = Text(row["PKNO"]),
            cardNo = Text(row["PKNO"]),
            fullName = string.Join(" ", new[] { Text(row["AD"]), Text(row["SOYAD"]) }.Where(value => value.Length > 0)).Trim(),
            startDate = Date(row["IGTARIH"]),
            exitDate = Date(row["ICTARIH"]),
            salary = Decimal(row["MAAS"]),
            source = "KY_PDKS_DESKTOP",
            version = 1
        }).Where(row => row.code.Length == 5 && row.fullName.Length > 0).ToArray();

        var canonical = JsonSerializer.Serialize(records);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
        var id = DeterministicGuid(hash);
        var options = PdksOptions.FromEnvironment();
        var company = options.CompanyId ?? PdksCloudAgent.LoadCredential()?.Company ?? "mecit-hakan";
        var envelope = new SyncEnvelope(
            id,
            options.TenantId ?? "kyerp",
            company,
            options.WorkplaceId ?? "main",
            "PERSONNEL_SNAPSHOT",
            "UPSERT",
            $"personnel-snapshot:{hash}",
            DateTimeOffset.UtcNow,
            JsonSerializer.Serialize(new { snapshotHash = hash, records, deviceId = PdksCloudAgent.LoadCredential()?.DeviceId ?? Environment.MachineName, version = 1, syncStatus = "PENDING" }));
        await new FileOutbox(outboxRoot).EnqueueAsync(envelope, ct);
    }

    static Guid DeterministicGuid(string hash)
    {
        var bytes = Convert.FromHexString(hash[..32]);
        return new Guid(bytes);
    }

    static string Text(object value) => value is null or DBNull ? "" : Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? "";
    static string? Date(object value) => value is DateTime date ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;
    static decimal Decimal(object value)
    {
        if (value is null or DBNull) return 0m;
        try { return Convert.ToDecimal(value, CultureInfo.InvariantCulture); }
        catch { return 0m; }
    }
}
