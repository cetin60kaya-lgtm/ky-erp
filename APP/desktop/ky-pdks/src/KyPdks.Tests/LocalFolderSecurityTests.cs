using KyPdks.Desktop;
using Xunit;

namespace KyPdks.Tests;

public sealed class LocalFolderSecurityTests
{
    [Fact]
    public void RejectsDiskRootBeforeGrant()
    {
        var root = Path.GetPathRoot(Path.GetTempPath())!;
        Assert.Throws<InvalidOperationException>(() => LocalFolderService.ValidateRoot(root));
    }

    [Fact]
    public void AcceptsExplicitChildFolder()
    {
        var folder = Path.Combine(Path.GetTempPath(), "kyerp-safe-folder-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try { Assert.Equal(Path.GetFullPath(folder), LocalFolderService.ValidateRoot(folder)); }
        finally { Directory.Delete(folder); }
    }

    [Fact]
    public void NonApprovedFolderCannotBeSearched()
    {
        var folder = Path.Combine(Path.GetTempPath(), "kyerp-safe-folder-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var grant = new LocalFolderGrant { Id = Guid.NewGuid().ToString("N"), FullPath = folder, Company = "qa-only" };
            Assert.Throws<UnauthorizedAccessException>(() => LocalFolderService.Search(grant, "", 10));
        }
        finally { Directory.Delete(folder); }
    }
}