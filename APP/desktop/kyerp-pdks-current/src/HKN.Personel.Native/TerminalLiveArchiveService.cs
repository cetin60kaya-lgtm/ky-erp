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

    public static int Append(IEnumerable<TerminalDevicePunch> punches)
    {
        var physicalAdded = 0;
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
            if (lines.Length > 0)
            {
                File.AppendAllLines(path, lines, Encoding.UTF8);
                physicalAdded += lines.Length;
            }
        }
        return physicalAdded;
    }

    public static int SeedFromCanonicalTnf(DateTime from, DateTime to)
    {
        Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        var knownByYear = new Dictionary<int, HashSet<string>>();
        var pendingByYear = new Dictionary<int, List<string>>();
        var added = 0;

        foreach (var file in Directory.GetFiles(CompanyDataPaths.Tnf, "TR*.Tnf"))
        {
            foreach (var line in File.ReadLines(file))
            {
                if (!TryParseTnfDate(line, out var day)) continue;
                if (day < from.Date || day > to.Date) continue;
                if (!knownByYear.TryGetValue(day.Year, out var known))
                {
                    var yearPath = LiveTnfPath(day.Year);
                    known = File.Exists(yearPath)
                        ? new HashSet<string>(File.ReadLines(yearPath), StringComparer.Ordinal)
                        : new HashSet<string>(StringComparer.Ordinal);
                    knownByYear[day.Year] = known;
                    pendingByYear[day.Year] = [];
                }
                if (!known.Add(line)) continue;
                pendingByYear[day.Year].Add(line);
                added++;
            }
        }

        foreach (var pair in pendingByYear)
            if (pair.Value.Count > 0) File.AppendAllLines(LiveTnfPath(pair.Key), pair.Value, Encoding.ASCII);
        return added;
    }

    internal static IReadOnlyList<TerminalDevicePunch> ReadPhysicalPunches(DateTime from, DateTime to)
    {
        Ensure();
        if (to.Date < from.Date) (from, to) = (to, from);
        var result = new List<TerminalDevicePunch>();
        foreach (var file in Directory.GetFiles(RawRoot, "*.raw", SearchOption.AllDirectories))
        {
            if (!DateTime.TryParseExact(Path.GetFileNameWithoutExtension(file), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var fileDay)) continue;
            if (fileDay.Date < from.Date || fileDay.Date > to.Date) continue;
            foreach (var line in File.ReadLines(file))
            {
                var p = line.Split('|');
                if (p.Length < 6 || string.IsNullOrWhiteSpace(p[0])) continue;
                if (!DateTime.TryParse(p[1], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at)) continue;
                if (at.Date < from.Date || at.Date > to.Date) continue;
                _ = int.TryParse(p[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out var inOut);
                _ = int.TryParse(p[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out var verify);
                _ = int.TryParse(p[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out var evt);
                _ = int.TryParse(p[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out var terminal);
                result.Add(new TerminalDevicePunch(p[0].Trim(), at, inOut, verify, evt, terminal));
            }
        }
        return result
            .GroupBy(x => $"{x.EmployeeCode}|{x.OccurredAt:O}|{x.InOut}|{x.VerifyMode}|{x.EventCode}|{x.TerminalNumber}", StringComparer.Ordinal)
            .Select(x => x.First()).OrderBy(x => x.OccurredAt).ToArray();
    }

    public static LiveArchiveStats GetStats(DateTime from, DateTime to)
    {
        var records = ReadPhysicalPunches(from, to);
        return new(records.Count, records.Select(x => x.EmployeeCode).Distinct(StringComparer.Ordinal).Count(),
            records.Count == 0 ? null : records.Min(x => x.OccurredAt), records.Count == 0 ? null : records.Max(x => x.OccurredAt),
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

    public static int DeleteEmployeeCodes(IEnumerable<string> employeeCodes)
    {
        Ensure();
        var normalized = new HashSet<string>(
            employeeCodes.Where(x => !string.IsNullOrWhiteSpace(x)).Select(NormalizeCode),
            StringComparer.Ordinal);
        if (normalized.Count == 0) return 0;

        var removed = 0;
        foreach (var file in Directory.GetFiles(TnfRoot, "CANLI_TR*.Tnf"))
        {
            var lines = File.ReadAllLines(file);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                if (TryParseTnf(line, out var code, out _) && normalized.Contains(NormalizeCode(code)))
                {
                    removed++;
                    continue;
                }
                keep.Add(line);
            }
            File.WriteAllLines(file, keep, Encoding.ASCII);
        }

        foreach (var file in Directory.GetFiles(RawRoot, "*.raw", SearchOption.AllDirectories))
        {
            var lines = File.ReadAllLines(file);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                var p = line.Split('|');
                if (p.Length > 0 && normalized.Contains(NormalizeCode(p[0])))
                {
                    removed++;
                    continue;
                }
                keep.Add(line);
            }
            if (keep.Count == 0)
            {
                try { File.Delete(file); } catch { }
            }
            else File.WriteAllLines(file, keep, Encoding.UTF8);
        }

        if (File.Exists(CompanyDataPaths.LiveFile))
        {
            var lines = File.ReadAllLines(CompanyDataPaths.LiveFile);
            var keep = lines.Where(line =>
            {
                var p = line.Split('|');
                return p.Length == 0 || !normalized.Contains(NormalizeCode(p[0]));
            }).ToArray();
            File.WriteAllLines(CompanyDataPaths.LiveFile, keep, Encoding.UTF8);
            try { File.SetAttributes(CompanyDataPaths.LiveFile, File.GetAttributes(CompanyDataPaths.LiveFile) | FileAttributes.Hidden); } catch { }
        }
        return removed;
    }

    static string NormalizeCode(string value)
    {
        var text = value.Trim();
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            ? number.ToString("00000", CultureInfo.InvariantCulture)
            : text;
    }

    public static int DeleteBefore(DateTime keepFrom)
    {
        Ensure();
        keepFrom = keepFrom.Date;
        var removed = 0;

        foreach (var file in Directory.GetFiles(TnfRoot, "CANLI_TR*.Tnf"))
        {
            var lines = File.ReadAllLines(file);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                if (TryParseTnfDate(line, out var day) && day.Date < keepFrom)
                {
                    removed++;
                    continue;
                }
                keep.Add(line);
            }
            File.WriteAllLines(file, keep, Encoding.ASCII);
        }

        foreach (var file in Directory.GetFiles(RawRoot, "*.raw", SearchOption.AllDirectories))
        {
            var lines = File.ReadAllLines(file);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                var p = line.Split('|');
                if (p.Length > 1 &&
                    DateTime.TryParse(p[1], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at) &&
                    at.Date < keepFrom)
                {
                    removed++;
                    continue;
                }
                keep.Add(line);
            }
            if (keep.Count == 0)
            {
                try { File.Delete(file); } catch { }
            }
            else File.WriteAllLines(file, keep, Encoding.UTF8);
        }

        if (File.Exists(CompanyDataPaths.LiveFile))
        {
            var lines = File.ReadAllLines(CompanyDataPaths.LiveFile);
            var keep = new List<string>(lines.Length);
            foreach (var line in lines)
            {
                var p = line.Split('|');
                if (p.Length > 1 &&
                    DateTime.TryParse(p[1], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var at) &&
                    at.Date < keepFrom)
                {
                    removed++;
                    continue;
                }
                keep.Add(line);
            }
            File.WriteAllLines(CompanyDataPaths.LiveFile, keep, Encoding.UTF8);
            try { File.SetAttributes(CompanyDataPaths.LiveFile, File.GetAttributes(CompanyDataPaths.LiveFile) | FileAttributes.Hidden); } catch { }
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
