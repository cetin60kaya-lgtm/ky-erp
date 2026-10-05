namespace HKN.Personel.Native;

internal static class CompanyDataPaths
{
    public const string CompanyName = "Hakan Emprime";

    public static string WorkspaceRoot
    {
        get
        {
            var configured = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT")
                ?? Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT", EnvironmentVariableTarget.User);
            if (!string.IsNullOrWhiteSpace(configured)) return configured.Trim();
            if (Directory.Exists(@"D:\Googledrive")) return @"D:\Googledrive\KYERP-PDKS-MASAUSTU";
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP-PDKS-MASAUSTU");
        }
    }

    // Kullanıcıya görünen sade, kalıcı klasör standardı.
    public static string Root => WorkspaceRoot;
    public static string Data => Path.Combine(WorkspaceRoot, "DATA");
    public static string Tnf => Path.Combine(WorkspaceRoot, "TNF");
    public static string Device => Path.Combine(WorkspaceRoot, "CİHAZ");
    public static string Audit => Path.Combine(WorkspaceRoot, "DENETİM");
    public static string Backup => Path.Combine(WorkspaceRoot, "YEDEK");
    public static string Reports => Path.Combine(WorkspaceRoot, "RAPOR");
    public static string Logs => Path.Combine(WorkspaceRoot, "LOG");
    public static string SystemData => Path.Combine(WorkspaceRoot, "SISTEM");
    public static string Terminal => Path.Combine(SystemData, "Terminal");
    public static string Import => Path.Combine(SystemData, "Import");
    public static string Config => Path.Combine(SystemData, "Config");
    public static string Archive => Path.Combine(Backup, "ARSIV");

    public static string Database => Path.Combine(Data, "KY_PDKS_DATA.FDB");
    public static string LiveFile => Path.Combine(Terminal, "live.dat");
    public static string PendingRestoreMarker => Path.Combine(Config, "pending-restore.txt");
    public static string CurrentTnf => Path.Combine(Tnf, $"TR{DateTime.Today.Year}.Tnf");

    public static string DeviceDayFolder(DateTime day) =>
        Path.Combine(Device, day.ToString("yyyy"), day.ToString("MM"), day.ToString("dd"));

    public static string DeviceReadTnf(DateTime at) =>
        Path.Combine(DeviceDayFolder(at), $"CIHAZ_OKUMA_{at:yyyy-MM-dd_HH-mm-ss}.Tnf");

    public static string DeviceDailyTnf(DateTime day) =>
        Path.Combine(DeviceDayFolder(day), $"GUNLUK_{day:yyyy-MM-dd}.Tnf");

    public static string DeviceRawFolder(DateTime day) =>
        Path.Combine(DeviceDayFolder(day), "HAM");

    public static void Ensure()
    {
        Directory.CreateDirectory(WorkspaceRoot);
        MigrateLegacyLayout();

        foreach (var path in new[] { Data, Tnf, Device, Audit, Backup, Reports, Logs, SystemData, Terminal, Import, Config, Archive })
            Directory.CreateDirectory(path);

        try { File.SetAttributes(SystemData, File.GetAttributes(SystemData) | FileAttributes.Hidden); } catch { }

        var legacyDatabase = Path.Combine(Data, "DATABASE.GDB");
        if (!File.Exists(Database) && File.Exists(legacyDatabase)) File.Copy(legacyDatabase, Database, false);
        MigratePreviousLocalLayout();
        ApplyFolderBranding();

        var profile = Path.Combine(Config, "company.txt");
        File.WriteAllText(profile,
            $"Firma={CompanyName}{Environment.NewLine}" +
            $"Workspace={WorkspaceRoot}{Environment.NewLine}" +
            $"DATA={Data}{Environment.NewLine}" +
            $"TNF={Tnf}{Environment.NewLine}" +
            $"CIHAZ={Device}{Environment.NewLine}" +
            $"DENETIM={Audit}{Environment.NewLine}");
    }

    static void MigrateLegacyLayout()
    {
        CopyDirectoryIfExists(Path.Combine(WorkspaceRoot, "03_DATA", CompanyName), Data, "*.FDB");
        CopyDirectoryIfExists(Path.Combine(WorkspaceRoot, "03_DATA", CompanyName), Data, "*.GDB");
        CopyDirectoryIfExists(Path.Combine(WorkspaceRoot, "04_TNF", CompanyName), Tnf, "*.Tnf");
        CopyDirectoryIfExists(Path.Combine(WorkspaceRoot, "05_BACKUP", CompanyName), Backup, "*");
        CopyDirectoryIfExists(Path.Combine(WorkspaceRoot, "09_LOG", CompanyName), Logs, "*");

        var oldDb = Path.Combine(WorkspaceRoot, "03_DATA", CompanyName, "KY_PDKS_DATA.FDB");
        if (!File.Exists(Database) && File.Exists(oldDb)) File.Copy(oldDb, Database, false);
    }

    static void CopyDirectoryIfExists(string source, string destination, string pattern)
    {
        if (!Directory.Exists(source)) return;
        Directory.CreateDirectory(destination);
        try
        {
            foreach (var file in Directory.EnumerateFiles(source, pattern, SearchOption.TopDirectoryOnly))
            {
                var target = Path.Combine(destination, Path.GetFileName(file));
                if (!File.Exists(target)) File.Copy(file, target, false);
            }
        }
        catch { }
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

    static void ApplyFolderBranding()
    {
        var iconSource = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(iconSource) || !File.Exists(iconSource)) return;
        foreach (var folder in new[] { Data, Tnf, Device, Audit, Backup, Reports, Logs })
        {
            try
            {
                Directory.CreateDirectory(folder);
                var ini = Path.Combine(folder, "desktop.ini");
                File.WriteAllText(ini,
                    "[.ShellClassInfo]" + Environment.NewLine +
                    $"IconResource={iconSource},0" + Environment.NewLine +
                    "InfoTip=KY PDKS çalışma klasörü" + Environment.NewLine);
                File.SetAttributes(ini, FileAttributes.Hidden | FileAttributes.System);
                var attrs = File.GetAttributes(folder);
                File.SetAttributes(folder, attrs | FileAttributes.ReadOnly);
            }
            catch { }
        }
    }

    public static void PinEnvironment()
    {
        Ensure();
        Environment.SetEnvironmentVariable("KY_PDKS_COMPANY_ROOT", WorkspaceRoot, EnvironmentVariableTarget.Process);
        Environment.SetEnvironmentVariable("KY_PDKS_COMPANY_ROOT", WorkspaceRoot, EnvironmentVariableTarget.User);
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
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(WorkspaceRoot) { UseShellExecute = true });
    }
}
