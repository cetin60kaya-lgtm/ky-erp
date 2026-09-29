namespace HKN.Personel.Native;

internal static class CompanyDataPaths
{
    public const string CompanyName = "Hakan Emprime";

    public static string Root
    {
        get
        {
            var configured = Environment.GetEnvironmentVariable("KY_PDKS_COMPANY_ROOT");
            if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
            var baseRoot = Directory.Exists(@"D:\") ? @"D:\KYERP\PDKS-DATA" :
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP", "PDKS-DATA");
            return Path.Combine(baseRoot, CompanyName);
        }
    }

    public static string Data => Path.Combine(Root, "Data");
    public static string Tnf => Path.Combine(Root, "TNF");
    public static string Backup => Path.Combine(Root, "Backup");
    public static string Reports => Path.Combine(Root, "Reports");
    public static string Terminal => Path.Combine(Root, "Terminal");
    public static string Archive => Path.Combine(Root, "Archive");
    public static string Logs => Path.Combine(Root, "Logs");
    public static string Import => Path.Combine(Root, "Import");
    public static string Config => Path.Combine(Root, "Config");
    public static string Database => Path.Combine(Data, "KY_PDKS_DATA.FDB");
    public static string LiveFile => Path.Combine(Terminal, "live.dat");
    public static string PendingRestoreMarker => Path.Combine(Config, "pending-restore.txt");
    public static string CurrentTnf => Path.Combine(Tnf, $"TR{DateTime.Today.Year}.Tnf");

    public static void Ensure()
    {
        foreach (var path in new[] { Root, Data, Tnf, Backup, Reports, Terminal, Archive, Logs, Import, Config })
            Directory.CreateDirectory(path);

        var legacyDatabase = Path.Combine(Data, "DATABASE.GDB");
        if (!File.Exists(Database) && File.Exists(legacyDatabase)) File.Copy(legacyDatabase, Database, false);

        var profile = Path.Combine(Config, "company.txt");
        if (!File.Exists(profile))
            File.WriteAllText(profile, $"Firma={CompanyName}{Environment.NewLine}VeriKoku={Root}{Environment.NewLine}");
    }

    public static void PinEnvironment()
    {
        Ensure();
        Environment.SetEnvironmentVariable("KY_PDKS_COMPANY_ROOT", Root, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("KY_PDKS_COMPANY_ROOT", Root, EnvironmentVariableTarget.User);
        if (!File.Exists(Database)) return;
        Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH", Database, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH", Database, EnvironmentVariableTarget.User);
    }

    public static void ApplyPendingRestore()
    {
        Ensure();
        if (!File.Exists(PendingRestoreMarker)) return;
        var staged = File.ReadAllText(PendingRestoreMarker).Trim();
        if (string.IsNullOrWhiteSpace(staged) || !File.Exists(staged))
        {
            File.Delete(PendingRestoreMarker);
            return;
        }

        if (File.Exists(Database))
        {
            var archived = Path.Combine(Archive, $"KY_PDKS_before_restore_{DateTime.Now:yyyyMMdd_HHmmss}.FDB");
            File.Move(Database, archived, true);
        }
        File.Move(staged, Database, true);
        File.Delete(PendingRestoreMarker);
    }

    public static void OpenRoot()
    {
        Ensure();
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(Root) { UseShellExecute = true });
    }
}
