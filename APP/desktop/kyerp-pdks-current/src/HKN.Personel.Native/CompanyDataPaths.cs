namespace HKN.Personel.Native;

internal static class CompanyDataPaths
{
    public const string CompanyName = "Hakan Emprime";

    public static string WorkspaceRoot
    {
        get
        {
            var configured = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT", EnvironmentVariableTarget.User)
                ?? Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT");
            if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
            if (Directory.Exists(@"D:\Googledrive")) return @"D:\Googledrive\KYERP-PDKS-MASAUSTU";
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP-PDKS-MASAUSTU");
        }
    }

    public static string Root => Path.Combine(WorkspaceRoot, "03_DATA", CompanyName);
    public static string Data => Root;
    public static string SystemData => Path.Combine(Root, ".system");
    public static string Tnf => Path.Combine(WorkspaceRoot, "04_TNF", CompanyName);
    public static string Backup => Path.Combine(WorkspaceRoot, "05_BACKUP", CompanyName);
    public static string Reports => Path.Combine(Root, "Reports");
    public static string Terminal => Path.Combine(SystemData, "Terminal");
    public static string Archive => Path.Combine(Backup, "ARCHIVE");
    public static string Logs => Path.Combine(WorkspaceRoot, "09_LOG", CompanyName);
    public static string Import => Path.Combine(WorkspaceRoot, "TEMP", "Import", CompanyName);
    public static string Config => Path.Combine(SystemData, "Config");
    public static string Database => Path.Combine(Data, "KY_PDKS_DATA.FDB");
    public static string LiveFile => Path.Combine(Terminal, "live.dat");
    public static string PendingRestoreMarker => Path.Combine(Config, "pending-restore.txt");
    public static string CurrentTnf => Path.Combine(Tnf, $"TR{DateTime.Today.Year}.Tnf");

    public static void Ensure()
    {
        foreach (var path in new[] { WorkspaceRoot, Root, Data, SystemData, Tnf, Backup, Reports, Terminal, Archive, Logs, Import, Config })
            Directory.CreateDirectory(path);

        try { File.SetAttributes(SystemData, File.GetAttributes(SystemData) | FileAttributes.Hidden); } catch { }

        var legacyDatabase = Path.Combine(Data, "DATABASE.GDB");
        if (!File.Exists(Database) && File.Exists(legacyDatabase)) File.Copy(legacyDatabase, Database, false);
        MigratePreviousLocalLayout();

        var profile = Path.Combine(Config, "company.txt");
        if (!File.Exists(profile))
            File.WriteAllText(profile, $"Firma={CompanyName}{Environment.NewLine}Workspace={WorkspaceRoot}{Environment.NewLine}VeriKoku={Root}{Environment.NewLine}");
    }

    static void MigratePreviousLocalLayout()
    {
        var previousRoot = Path.Combine(@"D:\KYERP\PDKS-DATA", CompanyName);
        if (!Directory.Exists(previousRoot)) return;
        var previousDb = Path.Combine(previousRoot, "Data", "KY_PDKS_DATA.FDB");
        if (!File.Exists(Database) && File.Exists(previousDb)) File.Copy(previousDb, Database, false);
        var previousTnf = Path.Combine(previousRoot, "TNF");
        if (Directory.Exists(previousTnf))
            foreach (var file in Directory.EnumerateFiles(previousTnf, "*.Tnf"))
            {
                var destination = Path.Combine(Tnf, Path.GetFileName(file));
                if (!File.Exists(destination)) File.Copy(file, destination, false);
            }
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
