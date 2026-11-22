using KyPdks.Desktop;
using Xunit;

namespace KyPdks.Tests;

public sealed class CompanyArchiveDiscoveryTests
{
    [Fact]
    public void FindsExistingCompanyUnderTurkishDriveMountWithoutShellPicker()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-cloud-discovery-" + Guid.NewGuid().ToString("N"));
        var company = Path.Combine(root, "Drive'ım", "Hakan Emp");
        Directory.CreateDirectory(Path.Combine(company, "KY-ISNET-BELGELER"));
        Directory.CreateDirectory(Path.Combine(company, "MUHASEBE"));
        try
        {
            var result = CompanyArchiveDiscovery.FindWithinCloudRoot(root);
            Assert.Single(result);
            Assert.Equal(Path.GetFullPath(company), result[0]);
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void DoesNotInventOrGrantUnrelatedCompanyDirectories()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-cloud-discovery-" + Guid.NewGuid().ToString("N"));
        var empty = Path.Combine(root, "Drive'ım", "Empty Company");
        Directory.CreateDirectory(empty);
        Directory.CreateDirectory(Path.Combine(root, "Drive'ım", "KYERP", "MUHASEBE"));
        try
        {
            Assert.Empty(CompanyArchiveDiscovery.FindWithinCloudRoot(root));
            Assert.True(Directory.Exists(empty));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void OptionalRealMountedCloudRootProbe()
    {
        // Used only for an explicitly configured local Windows acceptance run.
        // CI runs without this variable and never reads user archive contents.
        var cloudRoot = Environment.GetEnvironmentVariable("KYERP_TEST_CLOUD_DISCOVERY_ROOT");
        if (string.IsNullOrWhiteSpace(cloudRoot)) return;
        Assert.True(Directory.Exists(cloudRoot), "The requested existing cloud mount is unavailable.");
        var direct = CompanyArchiveDiscovery.FindWithinCloudRoot(cloudRoot);
        Assert.NotEmpty(direct);
        var discoveredFromWindows = CompanyArchiveDiscovery.FindExistingCompanyRoots();
        Assert.True(direct.Any(candidate =>
            discoveredFromWindows.Contains(candidate, StringComparer.OrdinalIgnoreCase)),
            "Global auto-discovery must locate the same real cloud archive.");
    }

    [Fact]
    public void DirectCloudFolderProbeWorksWithoutVolumeLabelOrShellPicker()
    {
        var fakeDrive = Path.Combine(Path.GetTempPath(), "ky-drive-probe-" + Guid.NewGuid().ToString("N"));
        var cloud = Path.Combine(fakeDrive, "Googledrive");
        var company = Path.Combine(cloud, "Drive'ım", "Hakan Emp");
        Directory.CreateDirectory(Path.Combine(company, "MUHASEBE"));
        Directory.CreateDirectory(Path.Combine(company, "DESEN"));
        try
        {
            Assert.Contains(cloud, CompanyArchiveDiscovery.FindCloudRootsOnDrive(fakeDrive));
            Assert.Contains(company, CompanyArchiveDiscovery.FindWithinCloudRoot(cloud));
        }
        finally { Directory.Delete(fakeDrive, recursive: true); }
    }

    [Fact]
    public void UnknownFoldersNeverBecomeCloudRoots()
    {
        var fakeDrive = Path.Combine(Path.GetTempPath(), "ky-drive-probe-" + Guid.NewGuid().ToString("N"));
        var unrelated = Path.Combine(fakeDrive, "Unrelated");
        Directory.CreateDirectory(unrelated);
        try { Assert.Empty(CompanyArchiveDiscovery.FindCloudRootsOnDrive(fakeDrive)); }
        finally { Directory.Delete(fakeDrive, recursive: true); }
    }

    [Fact]
    public void ExistingVerifiedHintIsOnlyAcceptedInsideAnActualCloudRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-hint-probe-" + Guid.NewGuid().ToString("N"));
        var company = Path.Combine(root, "Googledrive", "Drive'ım", "Hakan Emp");
        var outside = Path.Combine(root, "NotCloud", "Hakan Emp");
        foreach (var parent in new[] { company, outside })
        {
            Directory.CreateDirectory(Path.Combine(parent, "MUHASEBE"));
            Directory.CreateDirectory(Path.Combine(parent, "DESEN"));
        }
        try
        {
            Assert.Equal(Path.GetFullPath(company),
                CompanyArchiveDiscovery.ValidateArchiveHint(company));
            Assert.Null(CompanyArchiveDiscovery.ValidateArchiveHint(outside));
            Assert.Null(CompanyArchiveDiscovery.ValidateArchiveHint(
                Path.Combine(root, "Googledrive", "Drive'ım", "Missing Company")));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void MultipleExistingArchivesRequireExplicitSelection()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-cloud-discovery-" + Guid.NewGuid().ToString("N"));
        try
        {
            foreach (var name in new[] { "Firma A", "Firma B" })
            {
                var company = Path.Combine(root, "Drive'ım", name);
                Directory.CreateDirectory(Path.Combine(company, "MUHASEBE"));
                Directory.CreateDirectory(Path.Combine(company, "DESEN"));
            }
            var result = CompanyArchiveDiscovery.FindWithinCloudRoot(root);
            Assert.Equal(2, result.Count);
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
