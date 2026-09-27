using System.Text;
using KyPdks.Shared;
using Xunit;

namespace KyPdks.Tests;

public class PdksWorkflowTests
{
    [Fact]
    public async Task Manual_Import_Parses_Deduplicates_And_Rejects_Invalid_Lines()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-import-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            await store.InitializeAsync();
            var importer = new PunchImportService(store);
            var file = Path.Combine(root, "kart.txt");
            await File.WriteAllLinesAsync(file, new[]
            {
                "00004,08:35,140826,1,001",
                "00004,19:00,140826,1,001",
                "BOZUK SATIR",
            }, Encoding.UTF8);

            var first = await importer.ImportFilesAsync(new[] { file }, "utf-8");
            Assert.Equal(1, first.Files);
            Assert.Equal(2, first.Parsed);
            Assert.Equal(2, first.Added);
            Assert.Equal(0, first.Duplicate);
            Assert.Equal(1, first.Rejected);

            var second = await importer.ImportFilesAsync(new[] { file }, "utf-8");
            Assert.Equal(0, second.Added);
            Assert.Equal(2, second.Duplicate);
            Assert.Equal(1, second.Rejected);

            var snapshot = await store.SnapshotAsync();
            Assert.Equal(2, snapshot.PendingCount);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }

    [Fact]
    public async Task Default_Shift_Uses_0835_And_1850_As_Normal_Boundaries()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-shift-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            var attendance = new AttendanceStore(paths);
            await store.InitializeAsync();
            await attendance.InitializeAsync();

            var person = new CachedPerson("emp-1", "00004", "TEST PERSONEL", "Genel", "Personel", "VAR", "Aktif", "00004", "2026-01-01", "");
            await store.CachePeopleAsync(new[] { person });

            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 14, 8, 35, 0), "TEST", "1", "in-normal")));
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 14, 18, 50, 0), "TEST", "2", "out-normal")));
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 17, 8, 36, 0), "TEST", "3", "in-late")));
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 17, 18, 49, 0), "TEST", "4", "out-early")));

            var rows = await attendance.BuildMonthAsync(2026, 8);
            var normal = rows.Single(x => x.Date == "2026-08-14");
            Assert.Equal("CALISTI", normal.Status);
            Assert.Equal(0, normal.LateMinutes);
            Assert.Equal(0, normal.EarlyMinutes);

            var boundary = rows.Single(x => x.Date == "2026-08-17");
            Assert.Equal(1, boundary.LateMinutes);
            Assert.Equal(1, boundary.EarlyMinutes);

            var weekend = rows.Single(x => x.Date == "2026-08-15");
            Assert.Equal("HAFTA_SONU", weekend.Status);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }

    [Fact]
    public async Task Erp_Cache_Remains_Canonical_For_Attendance_Result()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-cache-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            var attendance = new AttendanceStore(paths);
            await store.InitializeAsync();
            await attendance.InitializeAsync();

            var person = new CachedPerson("emp-1", "00004", "TEST PERSONEL", "Genel", "Personel", "VAR", "Aktif", "00004", "2026-01-01", "");
            await store.CachePeopleAsync(new[] { person });
            await attendance.CacheEmployeeMonthAsync(person.Id, 2026, 8, new[]
            {
                new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                    "2026-08-18", "CALISTI", "08:35", "18:50", 5, 10, 0, false, 2, "ERP canonical hesap", "ERP")
            });

            var row = (await attendance.BuildMonthAsync(2026, 8)).Single(x => x.Date == "2026-08-18");
            Assert.Equal("CALISTI", row.Status);
            Assert.Equal(5, row.LateMinutes);
            Assert.Equal(10, row.EarlyMinutes);
            Assert.Equal("ERP_CACHE", row.DataSource);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }

    [Fact]
    public async Task Punch_Before_Hire_Date_Is_Not_Counted_As_Worked()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-period-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            var attendance = new AttendanceStore(paths);
            await store.InitializeAsync();
            await attendance.InitializeAsync();

            var person = new CachedPerson("emp-1", "00004", "TEST PERSONEL", "Genel", "Personel", "VAR", "Aktif", "00004", "2026-08-10", "");
            await store.CachePeopleAsync(new[] { person });
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 5, 8, 30, 0), "TEST", "1", "before-hire-in")));
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 5, 19, 0, 0), "TEST", "2", "before-hire-out")));

            var rows = await attendance.BuildMonthAsync(2026, 8);
            var row = rows.Single(x => x.Date == "2026-08-05");
            Assert.Equal("DONEM_DISI", row.Status);
            Assert.Equal(2, row.EventCount);
            Assert.Equal(0, AttendanceStore.BuildTimesheet(rows).Single().WorkedDays);
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }
}
