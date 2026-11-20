using System.IO;
using System.Security.Cryptography;
using System.Text.Json;

namespace KyPdks.Desktop;

/// <summary>
/// A local, per-Windows-user consent record. It never grants a remote cloud
/// service arbitrary disk access. KY File Agent must independently authorize
/// its tenant and connection before any cloud index or upload operation.
/// </summary>
public sealed class LocalFolderGrant
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string FullPath { get; set; } = "";
    public string Purpose { get; set; } = "GENERAL_READ";
    public string Company { get; set; } = "";
    public string Permission { get; set; } = "READ_ONLY";
    public DateTimeOffset ApprovedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed record LocalBackupResult(string SnapshotPath, int FileCount, long TotalBytes, string ManifestSha256);
public sealed record LocalFolderSummary(int FileCount, long TotalBytes);

public static class LocalFolderService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private static readonly StringComparison PathComparison = StringComparison.OrdinalIgnoreCase;
    private static readonly string ConfigRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KY ERP", "Desktop");
    public static string GrantsPath => Path.Combine(ConfigRoot, "folder-grants.json");

    public static IReadOnlyList<LocalFolderGrant> Load()
    {
        if (!File.Exists(GrantsPath)) return Array.Empty<LocalFolderGrant>();
        var all = JsonSerializer.Deserialize<List<LocalFolderGrant>>(File.ReadAllText(GrantsPath));
        return (all ?? new()).Where(g => g is not null && !string.IsNullOrWhiteSpace(g.FullPath)).ToArray();
    }

    public static LocalFolderGrant Grant(string selectedPath, string name, string purpose, string company)
    {
        var root = ValidateRoot(selectedPath);
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Klasör için açıklayıcı bir ad girin.");
        if (name.Length > 120) throw new InvalidOperationException("Klasör adı çok uzun.");
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "ACCOUNTING", "DOCUMENTS", "DESIGN", "CODE_READONLY", "FILE_HUB",
            "BACKUP_SOURCE", "BACKUP_DESTINATION", "FILE_HUB_WRITE", "GENERAL_READ",
        };
        if (!allowed.Contains(purpose)) throw new InvalidOperationException("Geçersiz izin amacı.");
        if (company.Length > 80 || company.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            throw new InvalidOperationException("Firma adı geçersiz.");
        var list = Load().ToList();
        if (list.Any(g => g.FullPath.Equals(root, PathComparison) && g.Purpose == purpose && g.Company == company))
            throw new InvalidOperationException("Bu klasör aynı firma ve amaç için zaten yetkilendirilmiş.");
        var grant = new LocalFolderGrant {
            Name = name.Trim(), FullPath = root, Purpose = purpose,
            Company = company.Trim(), Permission = purpose == "BACKUP_DESTINATION" ? "BACKUP_WRITE" : purpose == "FILE_HUB_WRITE" ? "FILE_HUB_WRITE" : "READ_ONLY"
        };
        list.Add(grant);
        Save(list);
        return grant;
    }

    public static void Revoke(string id)
    {
        var list = Load().Where(g => !string.Equals(g.Id, id, StringComparison.OrdinalIgnoreCase)).ToList();
        Save(list);
    }

    private static void Save(List<LocalFolderGrant> grants)
    {
        Directory.CreateDirectory(ConfigRoot);
        var tmp = GrantsPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            File.WriteAllText(tmp, JsonSerializer.Serialize(grants, JsonOptions));
            File.Move(tmp, GrantsPath, true);
        }
        finally { if (File.Exists(tmp)) File.Delete(tmp); }
    }

    public static string ValidateRoot(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) throw new InvalidOperationException("Klasör seçilmedi.");
        if (!Path.IsPathFullyQualified(input)) throw new InvalidOperationException("Klasör mutlak yol olmalıdır.");
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(input));
        if (!Directory.Exists(root)) throw new DirectoryNotFoundException("Seçili klasör mevcut değil.");
        if (root.Equals(Path.TrimEndingDirectorySeparator(Path.GetPathRoot(root) ?? ""), PathComparison))
            throw new InvalidOperationException("Disk veya paylaşım köküne sınırsız erişim verilemez. Alt klasör seçin.");
        // Approved Google Drive/OneDrive mounts can be junction ancestors.
        // The selected root itself must be a real directory; internal links are skipped.
        if ((new DirectoryInfo(root).Attributes & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("Doğrudan bağlantı/junction klasörü yerine içindeki alt klasörü seçin.");
        return root;
    }


    private static bool Inside(string root, string target) =>
        target.Equals(root, PathComparison) ||
        target.StartsWith(root + Path.DirectorySeparatorChar, PathComparison);

    private static IEnumerable<FileInfo> EnumerateSafeFiles(string root)
    {
        var folders = new Stack<DirectoryInfo>();
        folders.Push(new DirectoryInfo(root));
        while (folders.TryPop(out var dir)) {
            if ((dir.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Klasör içinde bağlantı bulundu; güvenli tarama durduruldu.");
            foreach (var item in dir.EnumerateFileSystemInfos()) {
                if ((item.Attributes & FileAttributes.ReparsePoint) != 0)
                    continue; // Never read files outside explicit approved root.
                if (item is DirectoryInfo sub) folders.Push(sub);
                else if (item is FileInfo file) {
                    if (!Inside(root, Path.GetFullPath(file.FullName)))
                        throw new InvalidOperationException("Dosya izinli klasör dışında.");
                    yield return file;
                }
            }
        }
    }

    public static LocalFolderSummary Inspect(LocalFolderGrant grant)
    {
        if (!Load().Any(g => g.Id == grant.Id)) throw new UnauthorizedAccessException("Klasör yetkisi kaldırılmış.");
        var root = ValidateRoot(grant.FullPath);
        int count = 0; long bytes = 0;
        foreach (var file in EnumerateSafeFiles(root)) { count++; bytes += file.Length; }
        return new LocalFolderSummary(count, bytes);
    }

    /// <summary>
    /// Manual, additive snapshot; never deletes/rewrites the source or an old backup.
    /// Requires distinct grants for read source and writable backup destination.
    /// Does NOT claim to back up Cloudflare D1 itself.
    /// </summary>
    public static async Task<LocalBackupResult> BackupAsync(
        LocalFolderGrant source, LocalFolderGrant destination, CancellationToken ct = default)
    {
        var approved = Load();
        if (!approved.Any(g => g.Id == source.Id) || !approved.Any(g => g.Id == destination.Id))
            throw new UnauthorizedAccessException("Kaynak veya hedef klasör yetkisi kaldırılmış.");
        if (destination.Purpose != "BACKUP_DESTINATION" || destination.Permission != "BACKUP_WRITE")
            throw new UnauthorizedAccessException("Hedef açıkça yedek yazma için onaylanmalı.");
        if (source.Id == destination.Id || !source.Company.Equals(destination.Company, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Kaynak ile hedef farklı olmalı ve aynı firmaya ait olmalı.");
        var sourcePath = ValidateRoot(source.FullPath);
        var destPath = ValidateRoot(destination.FullPath);
        if (Inside(sourcePath, destPath) || Inside(destPath, sourcePath))
            throw new InvalidOperationException("Yedek hedefi kaynak klasörün içinde veya üstünde olamaz.");

        static string SafeSegment(string value) {
            var chars = value.Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_').ToArray();
            var clean = new string(chars).Trim('_');
            return clean.Length == 0 ? "Firma" : clean[..Math.Min(clean.Length, 75)];
        }
        var snapshot = Path.Combine(destPath, "KYERP_YEDEK", SafeSegment(source.Company),
            SafeSegment(source.Purpose), SafeSegment(source.Name),
            DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8]);
        var fileRows = new List<object>(); int count = 0; long total = 0;
        Directory.CreateDirectory(snapshot);
        try {
            foreach (var file in EnumerateSafeFiles(sourcePath)) {
                ct.ThrowIfCancellationRequested();
                var relative = Path.GetRelativePath(sourcePath, file.FullName);
                if (relative.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(relative))
                    throw new InvalidOperationException("Kaynak klasör dışında dosya reddedildi.");
                var target = Path.GetFullPath(Path.Combine(snapshot, relative));
                if (!Inside(snapshot, target)) throw new InvalidOperationException("Yedek yolu izin dışına çıkıyor.");
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                var temp = target + ".kyerp-part-" + Guid.NewGuid().ToString("N");
                try {
                    await using (var input = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read,
                        1024*128, FileOptions.Asynchronous | FileOptions.SequentialScan))
                    await using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                        1024*128, FileOptions.Asynchronous)) {
                        await input.CopyToAsync(output, ct);
                        await output.FlushAsync(ct);
                    }
                    string hash;
                    await using (var verify = File.OpenRead(temp)) {
                        hash = Convert.ToHexString(await SHA256.HashDataAsync(verify, ct)).ToLowerInvariant();
                    }
                    File.Move(temp, target, false);
                    count++; total += file.Length;
                    fileRows.Add(new {relativePath=relative.Replace('\\','/'),sha256=hash,size=file.Length});
                } finally { if (File.Exists(temp)) File.Delete(temp); }
            }
            var manifest = new {
                schema="KYERP_LOCAL_BACKUP_V1", company=source.Company, sourceGrantId=source.Id,
                createdAt=DateTimeOffset.UtcNow, files=fileRows, fileCount=count, totalBytes=total,
                containsCloudD1=false,
            };
            var json=JsonSerializer.Serialize(manifest, JsonOptions);
            var manifestPath=Path.Combine(snapshot,"kyerp-backup-manifest.json");
            await File.WriteAllTextAsync(manifestPath,json,ct);
            var manifestHash=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
            return new LocalBackupResult(snapshot,count,total,manifestHash);
        }
        catch {
            // Fail closed. A partial snapshot is retained for operator review
            // rather than deleting evidence or touching unrelated backups.
            throw;
        }
    }
}
