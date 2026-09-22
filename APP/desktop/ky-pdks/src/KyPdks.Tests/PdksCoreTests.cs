using KyPdks.Shared;
using Xunit;

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
    [InlineData("00048,08:29,070926,1,001", "00048", "2026-09-07", "08:29")]
    [InlineData("00000,11:02,070926,1,001", "00000", "2026-09-07", "11:02")]
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
    public void Workplace_Default_Profile_Matches_Hedef500_Terminal()
    {
        var config = new PdksConfig();
        config.Normalize();
        Assert.Equal("Cihaz1", config.DeviceName);
        Assert.Equal(1, config.DeviceNo);
        Assert.Equal(1, config.MachineNo);
        Assert.Equal("GIRIS", config.Direction);
        Assert.Equal("192.168.1.224", config.TcpHost);
        Assert.Equal(5005, config.TcpPort);
        Assert.Equal(38400, config.SerialBaud);
        Assert.EndsWith(@"Hedef500\Terminal Bilgi Aktar\timerecords.txt", config.HedefReadFile, StringComparison.OrdinalIgnoreCase);
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
    public async Task Hedef_File_Diagnostics_Reads_Real_Export_Format()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-file-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var file = Path.Combine(root, "timerecords.txt");
        try
        {
            await File.WriteAllLinesAsync(file, new[]
            {
                "00048,08:29,070926,1,001",
                "00047,08:29,070926,1,001",
                "00000,11:02,070926,1,001",
            });
            var probe = await TerminalDiagnostics.ProbeHedefFileAsync(file);
            Assert.True(probe.Exists);
            Assert.True(probe.Readable);
            Assert.Equal(3, probe.ParsedCount);
            Assert.Equal(0, probe.RejectedCount);
            Assert.NotNull(probe.LastPunch);
            Assert.Equal("00000", probe.LastPunch!.CardNo);
            Assert.Equal(new DateTime(2026, 9, 7, 11, 2, 0), probe.LastPunch.EventAt);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
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
