using System.Collections.ObjectModel;

namespace KyPdks.Desktop;

/// <summary>
/// Optional Windows companion only. The same company cloud root is the sole
/// archive; file-hub cloud binding is authoritative for browser-only users.
/// Legacy paths are kept if present; this class NEVER migrates physical files.
/// </summary>
public static class CompanyArchiveLayout
{
    public const string Version = "KYERP_COMPANY_ARCHIVE_SECTIONS_V2_20261122";
    public static IReadOnlyList<string> ExistingCompanyFolders { get; } =
        Array.AsReadOnly(new[]
        {
            "DESEN", "MUHASEBE", "BOYAHANE", "İK", "İMALAT",
            "DENETİM", "FORMLAR", "YÖNETİM", "OTOMASYON", "gelen dosyalar"
        });

    public static IReadOnlyList<string> ModuleExtensionFolders { get; } =
        Array.AsReadOnly(new[]
        {
            "DESEN/Modeller", "DESEN/Görseller", "DESEN/Giden Desenler",
            "DESEN/Yerleşim Dosyaları", "DESEN/DTF",
            "MUHASEBE/e-Belgeler",
            "MUHASEBE/Sahadan Gelen İrsaliye", "MUHASEBE/Çek ve Ödemeler",
            "MUHASEBE/Cari ve Gider Evrakları", "MUHASEBE/Vergi ve KDV",
            "BOYAHANE/Model Formları", "BOYAHANE/Reçeteler", "BOYAHANE/Kalite",
            "İK/Personel Evrakları", "İK/Bordro ve Ödemeler", "İK/İzin ve Puantaj",
            "İMALAT/İş Emirleri", "İMALAT/Sevkiyat",
            "DENETİM/Denetim Evrakları", "DENETİM/MSDS", "DENETİM/TDS",
            "DENETİM/Periyodik Bakımlar", "DENETİM/Standartlar",
            "FORMLAR/Yemek", "FORMLAR/Temizlik", "FORMLAR/Genel",
            "YÖNETİM/Firma Yedekleri", "YÖNETİM/Loglar",
            "YÖNETİM/Sistem Raporları", "YÖNETİM/Firma Belgeleri"
        });

    public static IReadOnlyList<string> ExistingArchiveSubfolders { get; } =
        Array.AsReadOnly(new[]
        {
            "MUHASEBE/e-Belgeler/Gelen e-Fatura",
            "MUHASEBE/e-Belgeler/Giden e-Fatura",
            "MUHASEBE/e-Belgeler/Gelen e-İrsaliye",
            "MUHASEBE/e-Belgeler/Giden e-İrsaliye",
            "DENETİM/Denetim Evrakları/Disney",
            "DENETİM/Denetim Evrakları/FAMA"
        });

    public static IReadOnlyDictionary<string, string> ModulePaths { get; } =
        new ReadOnlyDictionary<string, string>(new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["E_BELGE"] = "MUHASEBE/e-Belgeler",
            ["DOCUMENT"] = "MUHASEBE/e-Belgeler",
            ["DESEN"] = "DESEN/Giden Desenler",
            ["DESEN_LAYOUT"] = "DESEN/Yerleşim Dosyaları",
            ["MODEL"] = "DESEN/Modeller",
            ["MODEL_IMAGE"] = "DESEN/Görseller",
            ["DTF"] = "DESEN/DTF",
            ["IMALAT_CUTTING_DISPATCH"] = "MUHASEBE/Sahadan Gelen İrsaliye",
            ["IMALAT"] = "İMALAT",
            ["BOYAHANE"] = "BOYAHANE",
            ["MUHASEBE"] = "MUHASEBE",
            ["IK"] = "İK",
            ["PDKS"] = "İK/İzin ve Puantaj",
            ["DENETIM"] = "DENETİM",
            ["FORMLAR"] = "FORMLAR",
            ["YONETIM"] = "YÖNETİM",
            ["INBOX"] = "gelen dosyalar",
            ["AUTOMATION"] = "OTOMASYON",
            ["LEGACY_ISNET"] = "KY-ISNET-BELGELER",
            ["LEGACY_HKN_PDF"] = "HKN E-FATURA",
            ["LEGACY_DDM_PDF"] = "DDM E-İRSALİYE",
            ["LEGACY_CUTTING"] = "KESİMDEN GELEN İRSALİYE",
            ["LEGACY_BACKUP"] = "FIRMA YEDEKLERI",
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
        if (CloudArchiveProbe.Available && CloudArchiveProbe.IsCloudPath(root))
            return CloudArchiveProbe.Inspect(root, StandardPaths).MissingPaths;
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
        if (CloudArchiveProbe.Available && CloudArchiveProbe.IsCloudPath(root))
        {
            // Called only after the explicit user-facing Yes and optional
            // Create Missing Folders checkbox.
            var result = CloudArchiveProbe.Ensure(root, StandardPaths);
            return (StandardPaths.Count - result.MissingPaths.Count, result.MissingPaths.Count);
        }
        var missing = MissingPaths(root);
        foreach (var relative in missing)
        {
            var target = Resolve(root, relative);
            Directory.CreateDirectory(target);
        }
        return (StandardPaths.Count - missing.Count, missing.Count);
    }
}
