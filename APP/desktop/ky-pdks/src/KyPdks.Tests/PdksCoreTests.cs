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
    public void Parses_Real_Hedef500_Timerecords_Format()
    {
        Assert.True(PunchParser.TryParse("00048,08:29,070926,1,001", "timerecords.txt", out var punch));
        Assert.NotNull(punch);
        Assert.Equal("00048", punch!.CardNo);
        Assert.Equal("2026-09-07", punch.WorkDate);
        Assert.Equal("08:29", punch.ApiEventTime);
    }

    [Fact]
    public async Task Hedef_File_Probe_Counts_Parsed_Duplicates_And_Rejected_Lines()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-hedef-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var file = Path.Combine(root, "timerecords.txt");
        try
        {
            await File.WriteAllLinesAsync(file, new[]
            {
                "00057,08:29,070926,1,001",
                "00057,08:29,070926,1,001",
                "00048,08:30,070926,1,001",
                "bozuk-satir",
            });

            var result = await TerminalDiagnostics.InspectHedefFileAsync(file);

            Assert.True(result.Exists);
            Assert.Equal(4, result.TotalLines);
            Assert.Equal(3, result.ParsedLines);
            Assert.Equal(1, result.DuplicateLines);
            Assert.Equal(1, result.RejectedLines);
            Assert.Equal("00048", result.LastPunch!.CardNo);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }

    [Fact]
    public void New_Config_Uses_Workplace_Hedef500_Safe_Profile()
    {
        var config = new PdksConfig();
        config.Normalize();
        Assert.Equal("HEDEF_TR500", config.NormalizedMode);
        Assert.Equal("192.168.1.224", config.TcpHost);
        Assert.Equal(5005, config.TcpPort);
        Assert.Equal(38400, config.SerialBaud);
        Assert.Equal(@"C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt", config.HedefReadFile);
        Assert.False(config.DirectCommandsEnabled);
    }

    [Fact]
    public async Task People_Cache_Keeps_Active_Carded_Person_Regardless_Of_Sgk()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-people-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            await store.InitializeAsync();
            await store.CachePeopleAsync(new[]
            {
                new CachedPerson("1", "P1", "SGK Yok Aktif", "Baskı", "", "YOK", "AKTIF", "00041", "2026-01-01", ""),
                new CachedPerson("2", "P2", "SGK Var Aktif", "Baskı", "", "VAR", "AKTIF", "00042", "2026-01-01", ""),
                new CachedPerson("3", "P3", "Pasif", "Baskı", "", "VAR", "PASIF", "00043", "2026-01-01", ""),
            });

            var people = await store.GetPeopleAsync();

            Assert.Equal(2, people.Count);
            Assert.Contains(people, person => person.CardNo == "00041" && person.SgkStatus == "YOK");
            Assert.Contains(people, person => person.CardNo == "00042" && person.SgkStatus == "VAR");
            Assert.DoesNotContain(people, person => person.CardNo == "00043");
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
