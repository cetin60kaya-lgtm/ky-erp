using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record DeviceEvidenceWriteResult(
    int RecordCount,
    string ReadTnfPath,
    string DailyTnfPath,
    string RawPath,
    string ManifestPath,
    string Sha256);

internal static class DeviceEvidenceArchiveService
{
    static readonly object Gate = new();

    public static DeviceEvidenceWriteResult SaveRead(IEnumerable<TerminalDevicePunch> source, string operation)
    {
        lock (Gate)
        {
            CompanyDataPaths.Ensure();
            var punches = source
                .OrderBy(x => x.OccurredAt)
                .GroupBy(Key, StringComparer.Ordinal)
                .Select(g => g.First())
                .ToArray();

            var stamp = DateTime.Now;
            var readFolder = CompanyDataPaths.DeviceDayFolder(stamp);
            Directory.CreateDirectory(readFolder);
            Directory.CreateDirectory(CompanyDataPaths.DeviceRawFolder(stamp));

            var readTnf = CompanyDataPaths.DeviceReadTnf(stamp);
            var readLines = punches
                .Select(ToTnf)
                .Distinct(StringComparer.Ordinal)
                .OrderBy(LineKey)
                .ToArray();
            File.WriteAllLines(readTnf, readLines, Encoding.ASCII);

            var dailyPaths = new List<string>();
            var rawPaths = new List<string>();
            foreach (var group in punches.GroupBy(x => x.OccurredAt.Date).OrderBy(x => x.Key))
            {
                var dailyTnf = CompanyDataPaths.DeviceDailyTnf(group.Key);
                Directory.CreateDirectory(Path.GetDirectoryName(dailyTnf)!);
                MergeDaily(dailyTnf, group.Select(ToTnf).Distinct(StringComparer.Ordinal));
                dailyPaths.Add(dailyTnf);

                var rawFolder = CompanyDataPaths.DeviceRawFolder(group.Key);
                Directory.CreateDirectory(rawFolder);
                var rawPath = Path.Combine(rawFolder, $"CIHAZ_HAM_{group.Key:yyyy-MM-dd}_{stamp:HH-mm-ss}.raw");
                File.WriteAllLines(rawPath, group.Select(ToRaw), Encoding.UTF8);
                rawPaths.Add(rawPath);
            }

            var primaryDaily = dailyPaths.FirstOrDefault() ?? CompanyDataPaths.DeviceDailyTnf(stamp.Date);
            var primaryRaw = rawPaths.FirstOrDefault() ?? Path.Combine(CompanyDataPaths.DeviceRawFolder(stamp), $"CIHAZ_HAM_{stamp:yyyy-MM-dd_HH-mm-ss}.raw");
            var hash = Sha256(readTnf);
            var manifest = Path.Combine(readFolder, $"CIHAZ_OKUMA_{stamp:yyyy-MM-dd_HH-mm-ss}_BILGI.txt");
            File.WriteAllText(manifest,
                $"KY PDKS CİHAZ OKUMA KAYDI{Environment.NewLine}" +
                $"Firma={CompanyDataPaths.CompanyName}{Environment.NewLine}" +
                $"İşlem={operation}{Environment.NewLine}" +
                $"OkumaZamanı={stamp:yyyy-MM-dd HH:mm:ss}{Environment.NewLine}" +
                $"KayıtSayısı={punches.Length}{Environment.NewLine}" +
                $"TNF={Path.GetFileName(readTnf)}{Environment.NewLine}" +
                $"GünlükTNF={string.Join(" | ", dailyPaths)}{Environment.NewLine}" +
                $"Ham={string.Join(" | ", rawPaths)}{Environment.NewLine}" +
                $"SHA256={hash}{Environment.NewLine}" +
                $"TNFFormat=KartNo,HH:mm,GGAAYY,1,001{Environment.NewLine}",
                Encoding.UTF8);

            AppendAudit(stamp, operation, punches.Length, readTnf, hash);
            return new(punches.Length, readTnf, primaryDaily, primaryRaw, manifest, hash);
        }
    }

    public static IReadOnlyList<TerminalDevicePunch> ReadDailyPunches(DateTime day)
    {
        CompanyDataPaths.Ensure();
        var path = CompanyDataPaths.DeviceDailyTnf(day.Date);
        if (!File.Exists(path)) return Array.Empty<TerminalDevicePunch>();
        var result = new List<TerminalDevicePunch>();
        foreach (var line in File.ReadLines(path))
        {
            try
            {
                var record = TnfRecord.Parse(line);
                var at = record.Date.ToDateTime(record.Time);
                if (at.Date != day.Date) continue;
                result.Add(new TerminalDevicePunch(record.EmployeeCode, at, 0, 0, 1, 1));
            }
            catch { }
        }
        return result.OrderBy(x => x.OccurredAt).ToArray();
    }

    static void MergeDaily(string path, IEnumerable<string> additions)
    {
        var lines = File.Exists(path)
            ? new HashSet<string>(File.ReadLines(path).Where(x => !string.IsNullOrWhiteSpace(x)), StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in additions) lines.Add(line);
        File.WriteAllLines(path, lines.OrderBy(LineKey), Encoding.ASCII);
    }

    static void AppendAudit(DateTime at, string operation, int count, string path, string hash)
    {
        var dir = Path.Combine(CompanyDataPaths.Audit, "CIHAZ_ISLEMLERI");
        Directory.CreateDirectory(dir);
        var csv = Path.Combine(dir, $"CIHAZ_ISLEMLERI_{at:yyyy}.csv");
        if (!File.Exists(csv))
            File.WriteAllText(csv, "ZAMAN;ISLEM;KAYIT;DOSYA;SHA256" + Environment.NewLine, Encoding.UTF8);
        var safeOperation = operation.Replace(';', ',');
        File.AppendAllText(csv,
            $"{at:yyyy-MM-dd HH:mm:ss};{safeOperation};{count};{path.Replace(';', ',')};{hash}{Environment.NewLine}",
            Encoding.UTF8);
    }

    static string Key(TerminalDevicePunch p) =>
        $"{p.EmployeeCode}|{p.OccurredAt:O}|{p.InOut}|{p.VerifyMode}|{p.EventCode}|{p.TerminalNumber}";

    static string ToTnf(TerminalDevicePunch p) =>
        new TnfRecord(
            p.EmployeeCode,
            TimeOnly.FromDateTime(p.OccurredAt),
            DateOnly.FromDateTime(p.OccurredAt)).ToString();

    static string ToRaw(TerminalDevicePunch p) =>
        $"{p.EmployeeCode}|{p.OccurredAt:O}|{p.InOut}|{p.VerifyMode}|{p.EventCode}|{p.TerminalNumber}";

    static (DateTime Day, TimeSpan Time, string Card, string Raw) LineKey(string line)
    {
        var p = line.Split(',');
        if (p.Length >= 3 &&
            DateTime.TryParseExact(p[2], "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) &&
            TimeSpan.TryParse(p[1], CultureInfo.InvariantCulture, out var time))
            return (day.Date, time, p[0], line);
        return (DateTime.MaxValue, TimeSpan.MaxValue, line, line);
    }

    static string Sha256(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }
}
