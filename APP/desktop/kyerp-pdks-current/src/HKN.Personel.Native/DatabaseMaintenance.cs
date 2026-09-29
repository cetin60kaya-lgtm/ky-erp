using System.Diagnostics;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record HedefRefreshStageResult(string SourceDatabase, string CurrentBackup, string SourceBackup, string StagedDatabase, int PersonnelCount, int MovementCount);

internal static class DatabaseMaintenance
{
    static string GbakPath
    {
        get
        {
            string[] candidates =
            [
                @"C:\Program Files (x86)\Firebird\Firebird_2_5\bin\gbak.exe",
                @"C:\Program Files\Firebird\Firebird_2_5\bin\gbak.exe"
            ];
            return candidates.FirstOrDefault(File.Exists) ?? throw new FileNotFoundException("Firebird gbak.exe bulunamadı.");
        }
    }

    public static string BackupNow()
    {
        CompanyDataPaths.Ensure();
        var o = PdksOptions.FromEnvironment();
        var dest = Path.Combine(CompanyDataPaths.Backup, $"KY_PDKS_{DateTime.Now:yyyyMMdd_HHmmss}.gbk");
        Run(o, "-b", "-g", "-v", $"{o.DatabaseHost}:{o.DatabasePath}", dest);
        return dest;
    }

    public static HedefRefreshStageResult PrepareHedefLiveRefresh(string? sourceDatabase = null)
    {
        CompanyDataPaths.Ensure();
        var o = PdksOptions.FromEnvironment();
        var source = sourceDatabase;
        if (string.IsNullOrWhiteSpace(source))
            source = Environment.GetEnvironmentVariable("KY_PDKS_HEDEF_DB");
        if (string.IsNullOrWhiteSpace(source))
            source = @"D:\Hedef500\Hedef500\Data\DATABASE.GDB";
        source = Path.GetFullPath(source);

        if (!File.Exists(source))
            throw new FileNotFoundException("Hedef DATABASE.GDB bulunamadı.", source);
        if (string.Equals(Path.GetFullPath(o.DatabasePath), source, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Hedef kaynak veritabanı ile KY PDKS çalışma veritabanı aynı dosya olamaz.");

        // Never copy an open Firebird database file directly. First take service-level gbak images.
        var currentBackup = BackupNow();
        var sourceBackup = Path.Combine(CompanyDataPaths.Backup, $"HEDEF_DATABASE_{DateTime.Now:yyyyMMdd_HHmmss}.gbk");
        Run(o, "-b", "-g", "-v", $"{o.DatabaseHost}:{source}", sourceBackup);

        var staged = Path.Combine(CompanyDataPaths.Data, $"KY_PDKS_HEDEF_STAGE_{DateTime.Now:yyyyMMdd_HHmmss}.FDB");
        Run(o, "-c", "-v", sourceBackup, $"{o.DatabaseHost}:{staged}");

        var testOptions = o with { DatabasePath = staged };
        int personnel;
        int movements;
        using (var c = new FirebirdDatabase(testOptions).OpenConnection())
        {
            using var personnelCmd = c.CreateCommand();
            personnelCmd.CommandText = "select count(*) from KIMLIK";
            personnel = Convert.ToInt32(personnelCmd.ExecuteScalar());

            using var movementCmd = c.CreateCommand();
            movementCmd.CommandText = "select count(*) from GIRCIK";
            movements = Convert.ToInt32(movementCmd.ExecuteScalar());

            using var periodCmd = c.CreateCommand();
            periodCmd.CommandText = "select count(*) from DONEM";
            _ = periodCmd.ExecuteScalar();
        }

        if (personnel <= 0)
            throw new InvalidOperationException("Hedef veritabanı doğrulandı ancak KIMLIK tablosunda personel bulunamadı. Geçiş iptal edildi.");

        File.WriteAllText(CompanyDataPaths.PendingRestoreMarker, staged);
        return new(source, currentBackup, sourceBackup, staged, personnel, movements);
    }

    public static string PrepareRestore(string backupFile)
    {
        if (!File.Exists(backupFile)) throw new FileNotFoundException("Yedek dosyası bulunamadı.", backupFile);
        CompanyDataPaths.Ensure();
        var o = PdksOptions.FromEnvironment();
        var staged = Path.Combine(CompanyDataPaths.Data, $"KY_PDKS_RESTORE_{DateTime.Now:yyyyMMdd_HHmmss}.FDB");
        Run(o, "-c", "-v", backupFile, $"{o.DatabaseHost}:{staged}");

        var testOptions = o with { DatabasePath = staged };
        using (var c = new FirebirdDatabase(testOptions).OpenConnection())
        using (var cmd = c.CreateCommand())
        {
            cmd.CommandText = "select count(*) from KIMLIK";
            _ = cmd.ExecuteScalar();
        }
        File.WriteAllText(CompanyDataPaths.PendingRestoreMarker, staged);
        return staged;
    }

    public static void EnsureDailyBackup()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var prefix = $"KY_PDKS_{DateTime.Today:yyyyMMdd}_";
            if (Directory.GetFiles(CompanyDataPaths.Backup, prefix + "*.gbk").Length > 0) return;
            _ = BackupNow();
        }
        catch { }
    }

    public static IReadOnlyList<string> ListBackups()
    {
        CompanyDataPaths.Ensure();
        return Directory.GetFiles(CompanyDataPaths.Backup, "*.gbk")
            .OrderByDescending(File.GetLastWriteTime).ToArray();
    }

    static void Run(PdksOptions o, params string[] args)
    {
        var psi = new ProcessStartInfo(GbakPath)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var arg in args) psi.ArgumentList.Add(arg);
        psi.Environment["ISC_USER"] = o.DatabaseUser;
        psi.Environment["ISC_PASSWORD"] = o.RequireDatabasePassword();
        using var p = Process.Start(psi) ?? throw new InvalidOperationException("gbak başlatılamadı.");
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0)
            throw new InvalidOperationException("Firebird yedekleme/geri yükleme başarısız.\n" + stderr + "\n" + stdout);
    }
}
