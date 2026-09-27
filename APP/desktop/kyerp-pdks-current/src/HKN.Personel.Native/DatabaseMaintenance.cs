using System.Diagnostics;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

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
    public static string PrepareRestore(string backupFile)
    {
        if (!File.Exists(backupFile)) throw new FileNotFoundException("Yedek dosyası bulunamadı.", backupFile);
        CompanyDataPaths.Ensure();
        var o = PdksOptions.FromEnvironment();
        var staged = Path.Combine(CompanyDataPaths.Data, $"DATABASE_RESTORE_{DateTime.Now:yyyyMMdd_HHmmss}.GDB");
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
