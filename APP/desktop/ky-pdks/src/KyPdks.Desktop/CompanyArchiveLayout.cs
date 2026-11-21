using System.Collections.ObjectModel;

namespace KyPdks.Desktop;

/// <summary>
/// One canonical on-disk structure for every company. The existing Hakan Emp
/// folder names are the standard; there is no 00..99 renaming or migration.
/// Selecting a root is a local user decision; cloud OAuth and tenant binding
/// remain separate and must be verified by KY ERP.
/// </summary>
public static class CompanyArchiveLayout
{
    public const string Version = "KYERP_COMPANY_ARCHIVE_HAKAN_EMP_V1";

    public static IReadOnlyList<string> ExistingCompanyFolders { get; } =
        Array.AsReadOnly(new[]
        {
            "FIRMA YEDEKLERI",
            "KY-ISNET-BELGELER",
            "HKN E-FATURA",
            "DDM E-İRSALİYE",
            "DTF",
            "OTOMASYON",
            "gelen dosyalar",
            "modeller",
            "yerleşim dosyaları",
            "görsel",
            "giden desenler",
            "KESİMDEN GELEN İRSALİYE"
        });

    // Absent from the original root. Added without moving or changing any
    // existing files. These folders remain unindexed until module authorizations
    // and (for HR/PDKS) cloud + Windows privacy boundaries are separately set.
    public static IReadOnlyList<string> ModuleExtensionFolders { get; } =
        Array.AsReadOnly(new[] { "MUHASEBE", "İMALAT", "BOYAHANE", "İK", "PDKS", "RAPORLAR" });

    // Keep the İşNet portal's real four-direction tree. The tenant-named
    // branches and year/model folders are generated from verified documents,
    // not speculatively from this empty layout.
    public static IReadOnlyList<string> ExistingArchiveSubfolders { get; } =
        Array.AsReadOnly(new[]
        {
            "KY-ISNET-BELGELER/GELEN-FATURA",
            "KY-ISNET-BELGELER/GIDEN-FATURA",
            "KY-ISNET-BELGELER/GELEN-IRSALIYE",
            "KY-ISNET-BELGELER/GIDEN-IRSALIYE",
            "KY-ISNET-BELGELER/_DURUM",
            "OTOMASYON/DTF_IZLEME",
            "OTOMASYON/PSD_ONIZLEME"
        });

    public static IReadOnlyDictionary<string, string> ModulePaths { get; } =
        new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["E_BELGE"] = "KY-ISNET-BELGELER",
            ["DOCUMENT"] = "KY-ISNET-BELGELER",
            ["HKN_PDF_LEGACY"] = "HKN E-FATURA",
            ["DDM_PDF_LEGACY"] = "DDM E-İRSALİYE",
            ["DESEN"] = "giden desenler",
            ["DESEN_LAYOUT"] = "yerleşim dosyaları",
            ["MODEL"] = "modeller",
            ["MODEL_IMAGE"] = "görsel",
            ["DTF"] = "DTF",
            ["IMALAT_CUTTING_DISPATCH"] = "KESİMDEN GELEN İRSALİYE",
            ["IMALAT"] = "İMALAT",
            ["BOYAHANE"] = "BOYAHANE",
            ["MUHASEBE"] = "MUHASEBE",
            ["IK"] = "İK",
            ["PDKS"] = "PDKS",
            ["REPORTS"] = "RAPORLAR",
            ["INBOX"] = "gelen dosyalar",
            ["AUTOMATION"] = "OTOMASYON",
            ["BACKUP_LEGACY"] = "FIRMA YEDEKLERI",
        });

    public static IReadOnlyList<string> StandardPaths { get; } =
        Array.AsReadOnly(ExistingCompanyFolders.Concat(ModuleExtensionFolders)
            .Concat(ExistingArchiveSubfolders).ToArray());

    private static string Resolve(string validatedRoot, string relativePath)
    {
        var segments = relativePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 || segments.Any(s => s is "." or ".." ||
               s.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0))
            throw new UnauthorizedAccessException("Geçersiz standart klasör yolu.");
        var current = validatedRoot;
        foreach (var segment in segments)
        {
            current = Path.Combine(current, segment);
            if (File.Exists(current))
                throw new IOException("Klasör yolunda dosya çakışması: " + relativePath);
            if (Directory.Exists(current) &&
                (new DirectoryInfo(current).Attributes & FileAttributes.ReparsePoint) != 0)
                throw new UnauthorizedAccessException("Bağlantı/junction dizini ayrı izin gerektirir: " + relativePath);
        }
        var target = Path.GetFullPath(current);
        var prefix = validatedRoot + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new UnauthorizedAccessException("Klasör firma ana kökünün dışına çıkıyor.");
        return target;
    }

    public static IReadOnlyList<string> MissingPaths(string approvedRoot)
    {
        var root = LocalFolderService.ValidateRoot(approvedRoot);
        var missing = new List<string>();
        foreach (var relative in StandardPaths)
        {
            var target = Resolve(root, relative);
            if (File.Exists(target))
                throw new IOException("Standart klasör adıyla çakışan bir dosya var: " + relative);
            if (Directory.Exists(target))
            {
                if ((new DirectoryInfo(target).Attributes & FileAttributes.ReparsePoint) != 0)
                    throw new UnauthorizedAccessException("Bağlantı/junction klasörü ayrı onay gerektirir: " + relative);
                continue;
            }
            missing.Add(relative);
        }
        return missing.AsReadOnly();
    }

    public static (int Existing, int Created) EnsureMissingPaths(string approvedRoot)
    {
        var root = LocalFolderService.ValidateRoot(approvedRoot);
        var missing = MissingPaths(root);
        foreach (var relative in missing)
        {
            var target = Resolve(root, relative);
            Directory.CreateDirectory(target);
        }
        return (StandardPaths.Count - missing.Count, missing.Count);
    }
}
