using KyPdks.Desktop;
using Xunit;

namespace KyPdks.Tests;

public sealed class CompanyArchiveLayoutTests
{
    [Fact]
    public void ModuleSectionFoldersAreCanonicalAndLegacyIsPreserved()
    {
        Assert.Contains("DESEN", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("MUHASEBE", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("YÖNETİM", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.DoesNotContain("KY-ISNET-BELGELER", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Equal("KY-ISNET-BELGELER", CompanyArchiveLayout.ModulePaths["LEGACY_ISNET"]);
        Assert.DoesNotContain("00_SISTEM", CompanyArchiveLayout.StandardPaths);
        Assert.Equal("DESEN/Giden Desenler", CompanyArchiveLayout.ModulePaths["DESEN"]);
    }

    [Fact]
    public void AddsOnlyMissingPathsAndDoesNotTouchExistingArchive()
    {
        var root = Path.Combine(Path.GetTempPath(), "kyerp-archive-layout-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "modeller"));
        var file = Path.Combine(root, "modeller", "ORIGINAL.ai");
        File.WriteAllText(file, "keep-original");
        try
        {
            var first = CompanyArchiveLayout.EnsureMissingPaths(root);
            Assert.True(first.Created > 0);
            Assert.Equal("keep-original", File.ReadAllText(file));
            Assert.True(Directory.Exists(Path.Combine(root, "MUHASEBE", "e-Belgeler", "Gelen e-Fatura")));
            Assert.False(Directory.Exists(Path.Combine(root, "KY-ISNET-BELGELER")));
            Assert.True(Directory.Exists(Path.Combine(root, "DESEN", "Görseller")));
            Assert.Equal(0, CompanyArchiveLayout.EnsureMissingPaths(root).Created);
            Assert.Empty(CompanyArchiveLayout.MissingPaths(root));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void FilenameCollisionStopsBeforeAnyFolderCreation()
    {
        var root = Path.Combine(Path.GetTempPath(), "kyerp-archive-layout-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "DESEN"), "not-a-folder");
        try
        {
            Assert.Throws<IOException>(() => CompanyArchiveLayout.EnsureMissingPaths(root));
            Assert.False(Directory.Exists(Path.Combine(root, "MUHASEBE")));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void NoDiskRootOrUnapprovedPathTraversal()
    {
        Assert.Throws<InvalidOperationException>(() =>
            CompanyArchiveLayout.MissingPaths(Path.GetPathRoot(Path.GetTempPath())!));
        Assert.All(CompanyArchiveLayout.StandardPaths,
            path => Assert.DoesNotContain("..", path));
    }
}
