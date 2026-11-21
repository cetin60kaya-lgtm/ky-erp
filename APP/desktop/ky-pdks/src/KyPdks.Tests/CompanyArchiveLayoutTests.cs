using KyPdks.Desktop;
using Xunit;

namespace KyPdks.Tests;

public sealed class CompanyArchiveLayoutTests
{
    [Fact]
    public void ExistingHakanEmpFolderNamesRemainCanonical()
    {
        Assert.Contains("modeller", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("görsel", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("yerleşim dosyaları", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("KY-ISNET-BELGELER", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.Contains("HKN E-FATURA", CompanyArchiveLayout.ExistingCompanyFolders);
        Assert.DoesNotContain("00_SISTEM", CompanyArchiveLayout.StandardPaths);
        Assert.Equal("giden desenler", CompanyArchiveLayout.ModulePaths["DESEN"]);
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
            Assert.True(Directory.Exists(Path.Combine(root, "KY-ISNET-BELGELER", "GELEN-FATURA")));
            Assert.True(Directory.Exists(Path.Combine(root, "görsel")));
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
        File.WriteAllText(Path.Combine(root, "görsel"), "not-a-folder");
        try
        {
            Assert.Throws<IOException>(() => CompanyArchiveLayout.EnsureMissingPaths(root));
            Assert.False(Directory.Exists(Path.Combine(root, "modeller")));
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
