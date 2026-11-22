using System.IO;

namespace KyPdks.Desktop;

/// <summary>
/// Bounded, read-only enumeration of existing cloud company archive roots.
/// The shell folder picker is NEVER needed for the company archive.
/// No machine-specific absolute paths, file mutation or permission grant.
/// </summary>
public static class CompanyArchiveDiscovery
{
    private static readonly string[] EvidenceFolders =
        { "KY-ISNET-BELGELER", "MUHASEBE", "DESEN", "BOYAHANE", "İMALAT", "YÖNETİM" };

    private static readonly string[] KnownCloudDirectoryNames =
        { "Googledrive", "Google Drive", "DriveFS", "OneDrive" };

    private static readonly string[] CloudRootEnvironment =
        { "OneDrive", "OneDriveCommercial", "OneDriveConsumer" };

    private static bool IsCloudFolder(string name) =>
        KnownCloudDirectoryNames.Any(known =>
            name.Equals(known, StringComparison.OrdinalIgnoreCase)) ||
        name.StartsWith("OneDrive - ", StringComparison.OrdinalIgnoreCase);

    private static bool IsCloudAccountContainer(string name) =>
        name.Equals("My Drive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("MyDrive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Shared drives", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Ortak drive'lar", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith("Drive'", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Google Drive", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<string> SafeChildren(string parent)
    {
        try
        {
            return Directory.Exists(parent)
                ? Directory.EnumerateDirectories(parent).Take(512).ToArray()
                : Array.Empty<string>();
        }
        catch (IOException) { return Array.Empty<string>(); }
        catch (UnauthorizedAccessException) { return Array.Empty<string>(); }
    }

    private static bool IsExistingCompanyArchive(string candidate)
    {
        try
        {
            // Do not approve a mount/junction itself as a company root.
            var info = new DirectoryInfo(candidate);
            if (!info.Exists || (info.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            return EvidenceFolders.Count(folder => Directory.Exists(Path.Combine(candidate, folder))) >= 2;
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    /// <summary>
    /// Two-tier enumeration only: cloud mount and optional account container.
    /// No recursive disk search, no reads of document bodies.
    /// </summary>
    public static IReadOnlyList<string> FindWithinCloudRoot(string cloudRoot)
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var child in SafeChildren(cloudRoot))
        {
            if (IsExistingCompanyArchive(child)) found.Add(LocalFolderService.ValidateRoot(child));
            if (!IsCloudAccountContainer(Path.GetFileName(child))) continue;
            foreach (var company in SafeChildren(child))
            {
                if (IsExistingCompanyArchive(company))
                    found.Add(LocalFolderService.ValidateRoot(company));
            }
        }
        return found.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    /// <summary>
    /// Probe well-known cloud mount DIRECTORY NAMES directly on each drive.
    /// Older logic only enumerated the drive root and could return no roots when
    /// a shell mount was temporarily unavailable during enumeration. This
    /// fallback is generic: no X/DESEN/company-specific absolute path.
    /// </summary>
    public static IReadOnlyList<string> FindCloudRootsOnDrive(string driveRoot)
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!Directory.Exists(driveRoot)) return Array.Empty<string>();

        // Direct existence probes do not rely on shell enumeration, index order,
        // volume label, or Google Drive junction being selectable in Explorer.
        foreach (var name in KnownCloudDirectoryNames)
        {
            var path = Path.Combine(driveRoot, name);
            if (Directory.Exists(path)) roots.Add(path);
        }

        // Company-specific OneDrive directories may be dynamically named.
        foreach (var folder in SafeChildren(driveRoot))
        {
            if (IsCloudFolder(Path.GetFileName(folder))) roots.Add(folder);
        }
        return roots.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    /// <summary>
    /// Returns only candidate paths and number of roots examined. Numbers are
    /// suitable for on-screen diagnostics without exposing private filenames.
    /// </summary>
    public static (IReadOnlyList<string> Candidates, int RootsChecked)
        FindExistingCompanyRootsWithDiagnostics()
    {
        var finalRootsChecked = 0;
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var env in CloudRootEnvironment)
            {
                var value = Environment.GetEnvironmentVariable(env);
                if (!string.IsNullOrWhiteSpace(value) && Directory.Exists(value)) roots.Add(value);
            }

            var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(profile))
                foreach (var path in FindCloudRootsOnDrive(profile)) roots.Add(path);

            foreach (var drive in DriveInfo.GetDrives())
            {
                try
                {
                    var driveRoot = drive.RootDirectory.FullName;
                    if (!Directory.Exists(driveRoot)) continue;
                    foreach (var path in FindCloudRootsOnDrive(driveRoot)) roots.Add(path);

                    // A Google Drive virtual volume may be mounted as a drive.
                    try
                    {
                        if (drive.IsReady &&
                            drive.VolumeLabel.Contains("Google Drive", StringComparison.OrdinalIgnoreCase))
                            roots.Add(driveRoot);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }

            finalRootsChecked = roots.Count;
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var root in roots)
            {
                foreach (var path in FindWithinCloudRoot(root)) candidates.Add(path);
            }
            if (candidates.Count != 0)
                return (candidates.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray(),
                    finalRootsChecked);

            // Cloud mount may still be initializing after Desktop starts.
            if (attempt == 0) Thread.Sleep(300);
        }
        return (Array.Empty<string>(), finalRootsChecked);
    }

    public static IReadOnlyList<string> FindExistingCompanyRoots() =>
        FindExistingCompanyRootsWithDiagnostics().Candidates;
}
