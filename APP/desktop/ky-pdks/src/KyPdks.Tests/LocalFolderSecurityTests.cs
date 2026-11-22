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
    public void TurkishDotlessIFolderNameIsResolvedOnlyWhenItReallyExists()
    {
        var temp = Path.Combine(Path.GetTempPath(), "kyerp-tr-folder-" + Guid.NewGuid().ToString("N"));
        var actual = Path.Combine(temp, "Drive'ım", "Hakan Emp");
        var ascii = Path.Combine(temp, "Drive'im", "Hakan Emp");
        Directory.CreateDirectory(actual);
        try
        {
            Assert.False(Directory.Exists(ascii));
            var resolved = LocalFolderService.ResolveUserEnteredRoot(ascii);
            Assert.True(resolved.Corrected);
            Assert.Equal(Path.GetFullPath(actual), resolved.FullPath);
            Assert.Equal(actual, LocalFolderService.ValidateRoot(resolved.FullPath));
            Assert.True(Directory.Exists(actual));
            Assert.False(Directory.Exists(ascii)); // No fabricated alias folders.
        }
        finally { Directory.Delete(temp, recursive: true); }
    }

    [Fact]
    public void MissingCompanyFolderNeverGetsCreatedOrGuessed()
    {
        var temp = Path.Combine(Path.GetTempPath(), "kyerp-missing-folder-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(temp, "Drive'ım", "Other Company"));
        try
        {
            var input = Path.Combine(temp, "Drive'im", "Hakan Emp");
            Assert.Throws<DirectoryNotFoundException>(() => LocalFolderService.ResolveUserEnteredRoot(input));
            Assert.False(Directory.Exists(input));
        }
        finally { Directory.Delete(temp, recursive: true); }
    }

    [Fact]
    public void ExistingExactRootAndDriveRootSecurityRulesRemain()
    {
        var temp = Path.Combine(Path.GetTempPath(), "kyerp-valid-folder-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        try
        {
            var resolution = LocalFolderService.ResolveUserEnteredRoot(temp);
            Assert.False(resolution.Corrected);
            Assert.Equal(Path.GetFullPath(temp), resolution.FullPath);
            var diskRoot = Path.GetPathRoot(temp)!;
            Assert.Throws<InvalidOperationException>(() => LocalFolderService.ResolveUserEnteredRoot(diskRoot));
        }
        finally { Directory.Delete(temp); }
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