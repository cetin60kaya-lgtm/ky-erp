using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record TnfReconciliationResult(
    DateTime From,
    DateTime To,
    int FdbNormalRecords,
    int TnfRecords,
    int MissingInTnf,
    int ExtraInTnf,
    int ManualERecords,
    bool ExactMatch,
    string Message);

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

    internal static TnfReconciliationResult AlignDay(FirebirdDatabase db, DateTime day) =>
        AlignRange(db, day.Date, day.Date);

    internal static TnfReconciliationResult AlignMonth(FirebirdDatabase db, int year, int month)
    {
        var from = new DateTime(year, month, 1);
        return AlignRange(db, from, from.AddMonths(1).AddDays(-1));
    }

    internal static TnfReconciliationResult AlignRange(FirebirdDatabase db, DateTime from, DateTime to)
    {
        CompanyDataPaths.Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        from = from.Date; to = to.Date;

        var expected = BuildExpected(db, from, to, out var manualE);
        foreach (var year in Enumerable.Range(from.Year, to.Year - from.Year + 1))
        {
            var yearStart = new DateTime(year, 1, 1);
            var yearEnd = yearStart.AddYears(1).AddDays(-1);
            var rangeStart = from > yearStart ? from : yearStart;
            var rangeEnd = to < yearEnd ? to : yearEnd;
            if (rangeStart > rangeEnd) continue;

            var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{year}.Tnf");
            if (!File.Exists(path)) File.WriteAllText(path, string.Empty, Encoding.ASCII);
            var backup = Path.Combine(CompanyDataPaths.Backup, $"TNF_SYNC_TR{year}_{DateTime.Now:yyyyMMdd_HHmmss_fff}.Tnf");
            File.Copy(path, backup, true);

            try
            {
                var lines = File.ReadAllLines(path).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
                lines.RemoveAll(line => TryKey(line, out var key) && key.Day >= rangeStart && key.Day <= rangeEnd);
                lines.AddRange(expected.Where(line =>
                {
                    var p = line.Split(',');
                    return p.Length >= 3 && TryParseTnfDay(p[2], out var d) && d.Year == year;
                }));
                var sorted = lines.Distinct(StringComparer.Ordinal).OrderBy(LineKey).ToArray();
                var tmp = path + ".sync.tmp";
                File.WriteAllLines(tmp, sorted, Encoding.ASCII);
                File.Move(tmp, path, true);
            }
            catch
            {
                File.Copy(backup, path, true);
                throw;
            }
        }

        var result = AuditRange(db, from, to);
        WriteReconciliationAudit(result, "ESITLE");
        return result;
    }

    internal static TnfReconciliationResult AuditRange(FirebirdDatabase db, DateTime from, DateTime to)
    {
        CompanyDataPaths.Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        from = from.Date; to = to.Date;

        var expected = BuildExpected(db, from, to, out var manualE);
        var actual = new HashSet<string>(StringComparer.Ordinal);
        foreach (var year in Enumerable.Range(from.Year, to.Year - from.Year + 1))
        {
            var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{year}.Tnf");
            if (!File.Exists(path)) continue;
            foreach (var line in File.ReadLines(path).Where(x => !string.IsNullOrWhiteSpace(x)))
            {
                if (!TryKey(line, out var key) || key.Day < from || key.Day > to) continue;
                actual.Add(line.Trim());
            }
        }

        var missing = expected.Except(actual, StringComparer.Ordinal).Count();
        var extra = actual.Except(expected, StringComparer.Ordinal).Count();
        var ok = missing == 0 && extra == 0;
        var message = ok
            ? $"{from:dd.MM.yyyy}-{to:dd.MM.yyyy}: DATA ↔ TNF dakika bazında TAM UYUMLU. Normal={expected.Count}, E={manualE}."
            : $"{from:dd.MM.yyyy}-{to:dd.MM.yyyy}: DATA ↔ TNF farkı var. DATA={expected.Count}, TNF={actual.Count}, TNF eksik={missing}, TNF fazla={extra}, E={manualE}.";
        return new(from, to, expected.Count, actual.Count, missing, extra, manualE, ok, message);
    }

    static HashSet<string> BuildExpected(FirebirdDatabase db, DateTime from, DateTime to, out int manualE)
    {
        var expected = new HashSet<string>(StringComparer.Ordinal);
        manualE = 0;
        var next = to.AddDays(1);
        var rows = db.Query(@"select PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
            where (GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B) order by SIRA",
            new FbParameter("@A", from), new FbParameter("@B", next));
        foreach (System.Data.DataRow row in rows.Rows)
        {
            AddExpectedSide(expected, row, "G", from, to, ref manualE);
            AddExpectedSide(expected, row, "C", from, to, ref manualE);
        }
        return expected;
    }

    static void AddExpectedSide(HashSet<string> expected, System.Data.DataRow row, string prefix, DateTime from, DateTime to, ref int manualE)
    {
        if (row[prefix + "TARIH"] == DBNull.Value || row[prefix + "SAAT"] == DBNull.Value) return;
        var day = Convert.ToDateTime(row[prefix + "TARIH"]).Date;
        if (day < from || day > to) return;
        var tur = Convert.ToString(row[prefix + "TUR"])?.Trim() ?? string.Empty;
        if (string.Equals(tur, "E", StringComparison.OrdinalIgnoreCase))
        {
            manualE++;
            return;
        }
        var time = Convert.ToString(row[prefix + "SAAT"])?.Trim() ?? string.Empty;
        if (!TimeSpan.TryParse(time, out var parsed)) return;
        var card = (Convert.ToString(row["PKNO"]) ?? string.Empty).Trim().PadLeft(5, '0');
        expected.Add($"{card},{parsed.Hours:00}:{parsed.Minutes:00},{day:ddMMyy},1,001");
    }

    static void WriteReconciliationAudit(TnfReconciliationResult result, string action)
    {
        var dir = Path.Combine(CompanyDataPaths.Audit, "ESITLEME");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"TNF_ESITLEME_{result.From:yyyy}.csv");
        if (!File.Exists(path))
            File.WriteAllText(path, "ZAMAN;ISLEM;BASLANGIC;BITIS;DATA_NORMAL;TNF;TNF_EKSIK;TNF_FAZLA;E;SONUC" + Environment.NewLine, Encoding.UTF8);
        File.AppendAllText(path,
            $"{DateTime.Now:yyyy-MM-dd HH:mm:ss};{action};{result.From:yyyy-MM-dd};{result.To:yyyy-MM-dd};{result.FdbNormalRecords};{result.TnfRecords};{result.MissingInTnf};{result.ExtraInTnf};{result.ManualERecords};{(result.ExactMatch ? "UYUMLU" : "FARK")}{Environment.NewLine}",
            Encoding.UTF8);
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
        if (!TryParseTnfDay(p[2], out var day)) return false;
        key = (p[0].Trim().PadLeft(5, '0'), day.Date);
        return true;
    }

    static (DateTime Day, TimeSpan Time, string Card, string Raw) LineKey(string line)
    {
        var p = line.Split(',');
        if (p.Length >= 3 && TryParseTnfDay(p[2], out var day)
            && TimeSpan.TryParse(p[1].Trim(), out var time))
            return (day.Date, time, p[0].Trim(), line);
        return (DateTime.MaxValue, TimeSpan.MaxValue, line, line);
    }

    static bool TryParseTnfDay(string value, out DateTime day)
    {
        day = default;
        var token = value.Trim();
        if (token.Length != 6 || token.Any(ch => !char.IsDigit(ch))) return false;
        if (!int.TryParse(token.AsSpan(0,2), NumberStyles.None, CultureInfo.InvariantCulture, out var d) ||
            !int.TryParse(token.AsSpan(2,2), NumberStyles.None, CultureInfo.InvariantCulture, out var m) ||
            !int.TryParse(token.AsSpan(4,2), NumberStyles.None, CultureInfo.InvariantCulture, out var y))
            return false;
        try
        {
            day = new DateTime(2000 + y, m, d);
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }
}
