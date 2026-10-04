using System.Data;
using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal static class PdksCoreWorkGroups
{
    public static void Normalize(FirebirdDatabase db)
    {
        db.InTransaction((connection, transaction) =>
        {
            var groups = Query(connection, transaction, "select KOD,AD from GRUP order by KOD");
            var rows = groups.AsEnumerable()
                .Select(r => new GroupRow(Convert.ToInt32(r["KOD"]), Convert.ToString(r["AD"])?.Trim() ?? ""))
                .ToArray();

            var mesaili = rows.Where(x => Key(x.Name).StartsWith("MESAILI", StringComparison.Ordinal)).ToArray();
            var idari = rows.Where(x => Key(x.Name).StartsWith("IDARI", StringComparison.Ordinal)).ToArray();

            var mesailiMain = PickCanonical(mesaili, "MESAILI GRUP");
            var idariMain = PickCanonical(idari, "IDARI GRUP");

            if (mesailiMain is not null)
                foreach (var extra in mesaili.Where(x => x.Code != mesailiMain.Code))
                    Merge(connection, transaction, extra.Code, mesailiMain.Code);

            if (idariMain is not null)
                foreach (var extra in idari.Where(x => x.Code != idariMain.Code))
                    Merge(connection, transaction, extra.Code, idariMain.Code);

            return 0;
        });
    }

    public static DataTable CanonicalTable(FirebirdDatabase db)
    {
        var all = db.Query("select KOD,AD from GRUP order by KOD");
        var selected = all.AsEnumerable()
            .Where(r =>
            {
                var key = Key(Convert.ToString(r["AD"]) ?? "");
                return key == "MESAILI GRUP" || key == "IDARI GRUP";
            })
            .OrderBy(r => Key(Convert.ToString(r["AD"]) ?? "") == "MESAILI GRUP" ? 0 : 1)
            .ToArray();

        var table = all.Clone();
        foreach (var row in selected) table.ImportRow(row);
        return table;
    }

    static GroupRow? PickCanonical(IEnumerable<GroupRow> groups, string expected)
    {
        var array = groups.ToArray();
        return array.FirstOrDefault(x => Key(x.Name) == expected) ?? array.OrderBy(x => x.Code).FirstOrDefault();
    }

    static void Merge(FbConnection connection, FbTransaction transaction, int sourceGroup, int targetGroup)
    {
        Execute(connection, transaction, "update KIMLIK set GRUP=@T where GRUP=@S",
            new FbParameter("@T", targetGroup), new FbParameter("@S", sourceGroup));

        var periods = Query(connection, transaction,
            "select KOD,BASTAR,BITTAR from DONEM where GRUP=@S order by BASTAR",
            new FbParameter("@S", sourceGroup));

        foreach (DataRow period in periods.Rows)
        {
            var sourcePeriod = Convert.ToInt32(period["KOD"]);
            var start = Convert.ToDateTime(period["BASTAR"]).Date;
            var end = Convert.ToDateTime(period["BITTAR"]).Date;
            var targetPeriodObj = Scalar(connection, transaction,
                "select first 1 KOD from DONEM where GRUP=@T and BASTAR=@A and BITTAR=@B order by KOD",
                new FbParameter("@T", targetGroup), new FbParameter("@A", start), new FbParameter("@B", end));

            if (targetPeriodObj is not null && targetPeriodObj is not DBNull)
            {
                var targetPeriod = Convert.ToInt32(targetPeriodObj);
                Execute(connection, transaction, "update UCRETLER set DONEM=@T where DONEM=@S",
                    new FbParameter("@T", targetPeriod), new FbParameter("@S", sourcePeriod));
                Execute(connection, transaction, "delete from DONEM where KOD=@K", new FbParameter("@K", sourcePeriod));
            }
            else
            {
                Execute(connection, transaction, "update DONEM set GRUP=@T where KOD=@K",
                    new FbParameter("@T", targetGroup), new FbParameter("@K", sourcePeriod));
            }
        }

        Execute(connection, transaction, "delete from GRUP where KOD=@K", new FbParameter("@K", sourceGroup));
    }

    static DataTable Query(FbConnection connection, FbTransaction transaction, string sql, params FbParameter[] parameters)
    {
        using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
        using var adapter = new FbDataAdapter(command);
        var table = new DataTable();
        adapter.Fill(table);
        return table;
    }

    static object? Scalar(FbConnection connection, FbTransaction transaction, string sql, params FbParameter[] parameters)
    {
        using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
        return command.ExecuteScalar();
    }

    static int Execute(FbConnection connection, FbTransaction transaction, string sql, params FbParameter[] parameters)
    {
        using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
        return command.ExecuteNonQuery();
    }

    static string Key(string value)
    {
        var normalized = value.Trim().ToUpper(new CultureInfo("tr-TR")).Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(ch switch
            {
                'İ' => 'I',
                'I' => 'I',
                'Ş' => 'S',
                'Ğ' => 'G',
                'Ü' => 'U',
                'Ö' => 'O',
                'Ç' => 'C',
                _ => ch
            });
        }
        return string.Join(' ', sb.ToString().Normalize(NormalizationForm.FormC)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    sealed record GroupRow(int Code, string Name);
}
