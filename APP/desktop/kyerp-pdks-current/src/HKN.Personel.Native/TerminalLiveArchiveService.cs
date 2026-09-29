using System.Globalization;
using System.Text;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record LiveArchiveStats(int RecordCount, int EmployeeCount, DateTime? FirstAt, DateTime? LastAt, string TnfPath, string RawFolder);

internal static class TerminalLiveArchiveService
{
    public const int RecommendedRetentionDays = 365;

    static string Root => Path.Combine(CompanyDataPaths.Terminal, "CanliArsiv");
    static string RawRoot => Path.Combine(Root, "Ham");
    static string TnfRoot => Path.Combine(Root, "TNF");

    public static string LiveTnfPath(int year)
    {
        Ensure();
        return Path.Combine(TnfRoot, $"CANLI_TR{year}.Tnf");
    }

    public static void Ensure()
    {
        CompanyDataPaths.Ensure();
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(RawRoot);
        Directory.CreateDirectory(TnfRoot);
    }

    public static void Append(IEnumerable<TerminalDevicePunch> punches)
    {
        Ensure();
        foreach (var yearGroup in punches.GroupBy(x => x.OccurredAt.Year))
        {
            var tnf = LiveTnfPath(yearGroup.Key);
            var known = File.Exists(tnf)
                ? new HashSet<string>(File.ReadLines(tnf), StringComparer.Ordinal)
                : new HashSet<string>(StringComparer.Ordinal);
            var lines = yearGroup
                .Select(x => new TnfRecord(x.EmployeeCode, TimeOnly.FromDateTime(x.OccurredAt), DateOnly.FromDateTime(x.OccurredAt)).ToString())
                .Where(known.Add)
                .ToArray();
            if (lines.Length > 0) File.AppendAllLines(tnf, lines, Encoding.ASCII);
        }

        foreach (var dayGroup in punches.GroupBy(x => x.OccurredAt.Date))
        {
            var folder = Path.Combine(RawRoot, dayGroup.Key.ToString("yyyy", CultureInfo.InvariantCulture), dayGroup.Key.ToString("MM", CultureInfo.InvariantCulture));
            Directory.CreateDirectory(folder);
            var path = Path.Combine(folder, dayGroup.Key.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + ".raw");
            var known = File.Exists(path)
                ? new HashSet<string>(File.ReadLines(path), StringComparer.Ordinal)
                : new HashSet<string>(StringComparer.Ordinal);
            var lines = dayGroup.Select(x => $"{x.EmployeeCode}|{x.OccurredAt:O}|{x.InOut}|{x.VerifyMode}|{x.EventCode}|{x.TerminalNumber}")
                .Where(known.Add).ToArray();
            if (lines.Length > 0) File.AppendAllLines(path, lines, Encoding.UTF8);
        }
    }

    public static int SeedFromCanonicalTnf(DateTime from, DateTime to)
    {
        Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        var added = 0;
        foreach (var file in Directory.GetFiles(CompanyDataPaths.Tnf, "TR*.Tnf"))
        {
            foreach (var line in File.ReadLines(file))
            {
                if (!TryParseTnfDate(line, out var day)) continue;
                if (day < from.Date || day > to.Date) continue;
                var yearPath = LiveTnfPath(day.Year);
                var known = File.Exists(yearPath)
                    ? new HashSet<string>(File.ReadLines(yearPath), StringComparer.Ordinal)
                    : new HashSet<string>(StringComparer.Ordinal);
                if (!known.Add(line)) continue;
                File.AppendAllLines(yearPath, [line], Encoding.ASCII);
                added++;
            }
        }
        return added;
    }

    public static LiveArchiveStats GetStats(DateTime from, DateTime to)
    {
        Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        var records = new List<(string Code, DateTime At)>();
        for (var y = from.Year; y <= to.Year; y++)
        {
            var path = LiveTnfPath(y);
            if (!File.Exists(path)) continue;
            foreach (var line in File.ReadLines(path))
            {
                if (!TryParseTnf(line, out var code, out var at)) continue;
                if (at.Date < from.Date || at.Date > to.Date) continue;
                records.Add((code, at));
            }
        }
        return new(records.Count, records.Select(x => x.Code).Distinct(StringComparer.Ordinal).Count(),
            records.Count == 0 ? null : records.Min(x => x.At), records.Count == 0 ? null : records.Max(x => x.At),
            LiveTnfPath(to.Year), RawRoot);
    }

    public static int DeleteRange(DateTime from, DateTime to)
    {
        Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        var removed = 0;
        foreach (var file in Directory.GetFiles(TnfRoot, "CANLI_TR*.Tnf"))
        {
            var lines = File.ReadAllLines(file);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                if (TryParseTnfDate(line, out var day) && day >= from.Date && day <= to.Date) { removed++; continue; }
                keep.Add(line);
            }
            File.WriteAllLines(file, keep, Encoding.ASCII);
        }

        foreach (var file in Directory.GetFiles(RawRoot, "*.raw", SearchOption.AllDirectories))
        {
            if (!DateTime.TryParseExact(Path.GetFileNameWithoutExtension(file), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) continue;
            if (day.Date < from.Date || day.Date > to.Date) continue;
            try { File.Delete(file); } catch { }
        }
        return removed;
    }

    public static int ClearAll()
    {
        Ensure();
        var count = Directory.GetFiles(TnfRoot, "*.Tnf", SearchOption.TopDirectoryOnly).Sum(x => File.ReadLines(x).Count());
        try { if (Directory.Exists(Root)) Directory.Delete(Root, true); } catch { }
        Ensure();
        return count;
    }

    static bool TryParseTnfDate(string line, out DateTime day)
    {
        day = default;
        var p = line.Split(',');
        if (p.Length < 3) return false;
        return DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out day);
    }

    static bool TryParseTnf(string line, out string code, out DateTime at)
    {
        code = string.Empty; at = default;
        var p = line.Split(',');
        if (p.Length < 3) return false;
        code = p[0].Trim();
        if (!DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return false;
        if (!TimeSpan.TryParseExact(p[1].Trim(), "hh\\:mm", CultureInfo.InvariantCulture, out var time)) return false;
        at = day.Date.Add(time);
        return true;
    }
}
