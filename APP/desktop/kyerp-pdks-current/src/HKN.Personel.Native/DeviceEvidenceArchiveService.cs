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

            var dailyTnf = CompanyDataPaths.DeviceDailyTnf(stamp.Date);
            MergeDaily(dailyTnf, readLines);

            var rawPath = Path.Combine(
                CompanyDataPaths.DeviceRawFolder(stamp),
                $"CIHAZ_HAM_{stamp:yyyy-MM-dd_HH-mm-ss}.raw");
            File.WriteAllLines(rawPath, punches.Select(ToRaw), Encoding.UTF8);

            var hash = Sha256(readTnf);
            var manifest = Path.Combine(readFolder, $"CIHAZ_OKUMA_{stamp:yyyy-MM-dd_HH-mm-ss}_BILGI.txt");
            File.WriteAllText(manifest,
                $"KY PDKS CİHAZ OKUMA KAYDI{Environment.NewLine}" +
                $"Firma={CompanyDataPaths.CompanyName}{Environment.NewLine}" +
                $"İşlem={operation}{Environment.NewLine}" +
                $"OkumaZamanı={stamp:yyyy-MM-dd HH:mm:ss}{Environment.NewLine}" +
                $"KayıtSayısı={punches.Length}{Environment.NewLine}" +
                $"TNF={Path.GetFileName(readTnf)}{Environment.NewLine}" +
                $"GünlükTNF={Path.GetFileName(dailyTnf)}{Environment.NewLine}" +
                $"Ham={Path.GetFileName(rawPath)}{Environment.NewLine}" +
                $"SHA256={hash}{Environment.NewLine}" +
                $"TNFFormat=KartNo,HH:mm,GGAAYY,1,001{Environment.NewLine}",
                Encoding.UTF8);

            AppendAudit(stamp, operation, punches.Length, readTnf, hash);
            return new(punches.Length, readTnf, dailyTnf, rawPath, manifest, hash);
        }
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
