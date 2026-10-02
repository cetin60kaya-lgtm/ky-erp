using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal static class OperationalTnfSyncService
{
    internal static string AlignPersonDay(FirebirdDatabase db, string card, DateTime day) =>
        AlignPersonDays(db, [(card, day.Date)]).FirstOrDefault() ?? string.Empty;

    internal static IReadOnlyList<string> AlignPersonDays(FirebirdDatabase db, IEnumerable<(string Card, DateTime Day)> items)
    {
        CompanyDataPaths.Ensure();
        var keys = items.Select(x => (Card: x.Card.Trim().PadLeft(5, '0'), Day: x.Day.Date)).Distinct().ToArray();
        var backups = new List<string>();
        foreach (var yearGroup in keys.GroupBy(x => x.Day.Year))
        {
            var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{yearGroup.Key}.Tnf");
            if (!File.Exists(path)) File.WriteAllText(path, string.Empty, Encoding.ASCII);
            var backup = Path.Combine(CompanyDataPaths.Backup, $"TNF_SYNC_TR{yearGroup.Key}_{DateTime.Now:yyyyMMdd_HHmmss_fff}.Tnf");
            File.Copy(path, backup, true);
            try { AlignYear(db, path, yearGroup.ToArray()); backups.Add(backup); }
            catch { File.Copy(backup, path, true); throw; }
        }
        return backups;
    }

    static void AlignYear(FirebirdDatabase db, string path, IReadOnlyCollection<(string Card, DateTime Day)> keys)
    {
        var target = keys.ToHashSet();
        var lines = File.ReadAllLines(path).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        lines.RemoveAll(line => TryKey(line, out var key) && target.Contains(key));
        var expected = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in target)
        {
            var rows = db.Query(@"select PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
                where PKNO=@P and ((GTARIH>=@D and GTARIH<@N) or (CTARIH>=@D and CTARIH<@N)) order by SIRA",
                new FbParameter("@P", key.Card), new FbParameter("@D", key.Day), new FbParameter("@N", key.Day.AddDays(1)));
            foreach (System.Data.DataRow row in rows.Rows)
            {
                AddSide(expected, row, key.Card, key.Day, "G");
                AddSide(expected, row, key.Card, key.Day, "C");
            }
        }
        lines.AddRange(expected);
        var sorted = lines.Distinct(StringComparer.Ordinal).OrderBy(LineKey).ToArray();
        var tmp = path + ".sync.tmp";
        File.WriteAllLines(tmp, sorted, Encoding.ASCII);
        File.Move(tmp, path, true);
    }

    static void AddSide(HashSet<string> expected, System.Data.DataRow row, string card, DateTime day, string prefix)
    {
        if (row[prefix + "TARIH"] == DBNull.Value || row[prefix + "SAAT"] == DBNull.Value) return;
        var date = Convert.ToDateTime(row[prefix + "TARIH"]).Date;
        if (date != day) return;
        var tur = Convert.ToString(row[prefix + "TUR"])?.Trim() ?? string.Empty;
        if (string.Equals(tur, "E", StringComparison.OrdinalIgnoreCase)) return;
        var time = Convert.ToString(row[prefix + "SAAT"])?.Trim() ?? string.Empty;
        if (!TimeSpan.TryParse(time, out var parsed)) return;
        expected.Add($"{card},{parsed.Hours:00}:{parsed.Minutes:00},{day:ddMMyy},1,001");
    }

    static bool TryKey(string line, out (string Card, DateTime Day) key)
    {
        key = default;
        var p = line.Split(',');
        if (p.Length != 5 || p[0].Trim().Length == 0) return false;
        if (!DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return false;
        key = (p[0].Trim().PadLeft(5, '0'), day.Date);
        return true;
    }

    static (DateTime Day, TimeSpan Time, string Card, string Raw) LineKey(string line)
    {
        var p = line.Split(',');
        if (p.Length >= 3 && DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            && TimeSpan.TryParse(p[1].Trim(), out var time))
            return (day.Date, time, p[0].Trim(), line);
        return (DateTime.MaxValue, TimeSpan.MaxValue, line, line);
    }
}
