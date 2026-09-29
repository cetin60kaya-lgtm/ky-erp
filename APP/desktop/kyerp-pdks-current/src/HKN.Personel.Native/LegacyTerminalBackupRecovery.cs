using System.Globalization;
using System.Text;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record LegacyBackupRecoveryResult(bool Success, string Message, string? SourceFile, int ReadCount, int Inserted, int Updated, int Duplicates, int Skipped);

internal static class LegacyTerminalBackupRecovery
{
    public static LegacyBackupRecoveryResult RecoverLatest()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var options = PdksOptions.FromEnvironment();
            var candidates = new[]
            {
                Path.Combine(options.RuntimeRoot, "Terminal Bilgi Aktar", "backup"),
                @"D:\Hedef500\Hedef500\Terminal Bilgi Aktar\backup"
            };

            var latest = candidates
                .Where(Directory.Exists)
                .SelectMany(folder => Directory.EnumerateFiles(folder, "*.txt", SearchOption.TopDirectoryOnly))
                .Select(path => new { Path = path, Date = ParseLegacyDate(Path.GetFileNameWithoutExtension(path)) })
                .Where(x => x.Date.HasValue)
                .OrderByDescending(x => x.Date)
                .ThenByDescending(x => File.GetLastWriteTimeUtc(x.Path))
                .FirstOrDefault();

            if (latest is null)
                return new(false, "Hedef terminal yedek klasöründe tarihli kayıt dosyası bulunamadı.", null, 0, 0, 0, 0, 0);

            var rawLines = File.ReadLines(latest.Path)
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            if (rawLines.Length == 0)
                return new(true, "Son Hedef yedeği bulundu ancak içinde kart kaydı yok.", latest.Path, 0, 0, 0, 0, 0);

            var profile = TerminalTransferProfile.CreateCanonicalTnf(options);
            var parsed = new List<ProfiledTerminalRecord>();
            var invalid = 0;
            foreach (var line in rawLines)
            {
                try { parsed.Add(ProfiledTerminalParser.Parse(profile, line)); }
                catch { invalid++; }
            }
            if (parsed.Count == 0)
                return new(false, $"Yedek dosyası okundu ancak geçerli TNF kart kaydı bulunamadı. Geçersiz satır: {invalid}.", latest.Path, rawLines.Length, 0, 0, 0, invalid);

            BackupSource(latest.Path);
            MergeCanonicalTnf(parsed);

            var imported = new AttendanceImportService(new FirebirdDatabase(options)).Import(parsed, 5);
            var msg = $"Hedef yedeği kurtarıldı: {Path.GetFileName(latest.Path)} • okunan {parsed.Count} • yeni {imported.Inserted} • güncellenen {imported.Updated} • mükerrer {imported.Duplicates} • atlanan {imported.Skipped}. Fiziksel cihaz kaydına dokunulmadı.";
            return new(imported.Skipped == 0, msg, latest.Path, parsed.Count, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped + invalid);
        }
        catch (Exception ex)
        {
            return new(false, "Hedef yedek kurtarma hatası: " + ex.GetBaseException().Message, null, 0, 0, 0, 0, 0);
        }
    }

    static DateTime? ParseLegacyDate(string name)
    {
        var parts = name.Split('&');
        if (parts.Length != 3) return null;
        if (!int.TryParse(parts[0], out var day) || !int.TryParse(parts[1], out var month) || !int.TryParse(parts[2], out var year)) return null;
        try { return new DateTime(year, month, day); }
        catch { return null; }
    }

    static void BackupSource(string path)
    {
        try
        {
            Directory.CreateDirectory(CompanyDataPaths.Backup);
            var target = Path.Combine(CompanyDataPaths.Backup, $"HEDEF_YEDEK_{DateTime.Now:yyyyMMdd_HHmmss}_{Path.GetFileName(path)}");
            File.Copy(path, target, true);
        }
        catch { }
    }

    static void MergeCanonicalTnf(IEnumerable<ProfiledTerminalRecord> records)
    {
        foreach (var group in records.GroupBy(x => x.OccurredAt.Year))
        {
            var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{group.Key}.Tnf");
            var known = File.Exists(path) ? new HashSet<string>(File.ReadLines(path), StringComparer.Ordinal) : new(StringComparer.Ordinal);
            var add = group
                .OrderBy(x => x.OccurredAt)
                .Select(x => new TnfRecord(x.EmployeeCode, TimeOnly.FromDateTime(x.OccurredAt), DateOnly.FromDateTime(x.OccurredAt)).ToString())
                .Where(known.Add)
                .ToArray();
            if (add.Length > 0) File.AppendAllLines(path, add, Encoding.ASCII);
        }
    }
}
