using KyPdks.Shared;

namespace KyPdks.Tests;

public class PdksCoreTests
{
    [Fact]
    public void Parses_KyErp_Card_Export_Format()
    {
        Assert.True(PunchParser.TryParse("00004,08:28,300826,1,001", "sample.txt", out var punch));
        Assert.NotNull(punch);
        Assert.Equal("00004", punch!.CardNo);
        Assert.Equal("2026-08-30", punch.WorkDate);
        Assert.Equal("08:28", punch.ApiEventTime);
    }

    [Theory]
    [InlineData("00004,30.08.2026,18:57", "00004", "2026-08-30", "18:57")]
    [InlineData("00004;2026-08-30;08:29:14", "00004", "2026-08-30", "08:29")]
    [InlineData("4 2026-08-30 08:30:02", "00004", "2026-08-30", "08:30")]
    public void Parses_Common_Terminal_Formats(string line, string card, string date, string time)
    {
        Assert.True(PunchParser.TryParse(line, "terminal", out var punch));
        Assert.Equal(card, punch!.CardNo);
        Assert.Equal(date, punch.WorkDate);
        Assert.Equal(time, punch.ApiEventTime);
    }

    [Fact]
    public void Fingerprint_Deduplicates_Same_Physical_Punch_From_Different_Sources()
    {
        var at = new DateTime(2026, 8, 30, 8, 28, 14);
        var file = new RawPunch("00004", at, "FILE", "a.txt", "00004,08:28,300826");
        var tcp = new RawPunch("00004", at, "TCP_CLIENT", "10.0.0.5", "00004 2026-08-30 08:28:14");
        Assert.Equal(file.Fingerprint, tcp.Fingerprint);
    }

    [Fact]
    public async Task Local_Store_Keeps_One_Copy_And_Survives_Backup()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            await store.InitializeAsync();
            var punch = new RawPunch("00004", new DateTime(2026, 8, 30, 8, 28, 14), "FILE", "sample", "raw");
            Assert.True(await store.AddAsync(punch));
            Assert.False(await store.AddAsync(punch));
            var snapshot = await store.SnapshotAsync();
            Assert.Equal(1, snapshot.PendingCount);
            var backup = await store.BackupAsync();
            Assert.True(File.Exists(backup));
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }
}
