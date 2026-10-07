using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record SystemReadiness(int Personnel, int Movements, int TnfLines, bool TnfExists, string WorkHoursSource)
{
    internal string Summary => $"HAZIR • Personel {Personnel} • GIRCIK {Movements} • TNF {(TnfExists ? TnfLines + " satır" : "yok; eşitlemede üretilecek")} • Saat: {WorkHoursSource}";
}

internal static class SystemReadinessService
{
    private static readonly string[] RequiredTables = ["KIMLIK", "GIRCIK", "UCRETLER", "PUANTAJ", "ODEME", "AVANS"];

    internal static SystemReadiness Validate(FirebirdDatabase db, string? tnfPath, WorkTimePolicy policy)
    {
        var missing = new List<string>();
        foreach (var table in RequiredTables)
        {
            var count = Convert.ToInt32(db.Scalar(
                "select count(*) from rdb$relations where rdb$relation_name=@N",
                new FbParameter("@N", table)) ?? 0);
            if (count != 1) missing.Add(table);
        }

        if (missing.Count > 0)
            throw new InvalidOperationException("Hedef DB şeması eksik/uyumsuz. Bulunamayan tablolar: " + string.Join(", ", missing));

        var personnel = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK") ?? 0);
        var movements = Convert.ToInt32(db.Scalar("select count(*) from GIRCIK") ?? 0);

        var exists = !string.IsNullOrWhiteSpace(tnfPath) && File.Exists(tnfPath);
        var lines = 0;
        if (exists)
        {
            using var reader = new StreamReader(tnfPath!);
            while (reader.ReadLine() is not null) lines++;
        }

        return new(personnel, movements, lines, exists, policy.FromDatabase ? "Hedef DB" : "Varsayılan güvenli aralık");
    }
}
