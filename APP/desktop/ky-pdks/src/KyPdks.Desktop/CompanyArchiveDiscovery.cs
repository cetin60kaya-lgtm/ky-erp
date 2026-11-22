using System.IO;

namespace KyPdks.Desktop;

/// <summary>
/// Discover existing company archive candidates without Windows shell dialogs.
/// Scanning is bounded to cloud sync roots and immediate company directories.
/// No grants, file content reads, directory creation, or cross-tenant mutation.
/// </summary>
public static class CompanyArchiveDiscovery
{
    private static readonly string[] EvidenceFolders =
        { "KY-ISNET-BELGELER", "MUHASEBE", "DESEN", "BOYAHANE", "İMALAT", "YÖNETİM" };

    private static readonly string[] CloudRootEnvironment =
        { "OneDrive", "OneDriveCommercial", "OneDriveConsumer" };

    private static bool IsCloudFolder(string name) =>
        name.Equals("GoogleDrive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Google Drive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("OneDrive", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith("OneDrive - ", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("DriveFS", StringComparison.OrdinalIgnoreCase);

    private static bool IsCloudAccountContainer(string name) =>
        name.Equals("My Drive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("MyDrive", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Shared drives", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Ortak drive'lar", StringComparison.OrdinalIgnoreCase) ||
        name.StartsWith("Drive'", StringComparison.OrdinalIgnoreCase) ||
        name.Equals("Google Drive", StringComparison.OrdinalIgnoreCase);

    private static IEnumerable<string> SafeChildren(string parent)
    {
        try
        {
            if (!Directory.Exists(parent)) return Array.Empty<string>();
            return Directory.EnumerateDirectories(parent).Take(256).ToArray();
        }
        catch (IOException) { return Array.Empty<string>(); }
        catch (UnauthorizedAccessException) { return Array.Empty<string>(); }
    }

    private static bool IsExistingCompanyArchive(string candidate)
    {
        try
        {
            // A shortcut/junction itself must never become a company grant root.
            var info = new DirectoryInfo(candidate);
            if (!info.Exists || (info.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            var evidence = EvidenceFolders.Count(name => Directory.Exists(Path.Combine(candidate, name)));
            return evidence >= 2;
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    /// <summary>Find only existing candidates immediately under a cloud root
    /// or its My Drive/Drive'ım account container. No arbitrary disk walk.</summary>
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

    public static IReadOnlyList<string> FindExistingCompanyRoots()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var env in CloudRootEnvironment)
        {
            var value = Environment.GetEnvironmentVariable(env);
            if (!string.IsNullOrWhiteSpace(value) && Directory.Exists(value)) roots.Add(value);
        }

        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady) continue;
                if (drive.VolumeLabel.Contains("Google Drive", StringComparison.OrdinalIgnoreCase))
                    roots.Add(drive.RootDirectory.FullName);
                foreach (var child in SafeChildren(drive.RootDirectory.FullName))
                {
                    if (IsCloudFolder(Path.GetFileName(child))) roots.Add(child);
                }
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }

        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in roots)
        {
            foreach (var candidate in FindWithinCloudRoot(root)) candidates.Add(candidate);
        }
        return candidates.OrderBy(path => path, StringComparer.OrdinalIgnoreCase).ToArray();
    }
}
