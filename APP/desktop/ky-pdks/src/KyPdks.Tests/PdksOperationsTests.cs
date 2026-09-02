using KyPdks.Shared;
using Xunit;

namespace KyPdks.Tests;

public class PdksOperationsTests
{
    [Fact]
    public async Task Local_Legacy_Operations_Do_Not_Override_D1_Or_Offline_Attendance()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-ops-" + Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new PdksPaths(root);
            var store = new LocalPdksStore(paths);
            var operations = new PdksOperationsStore(paths);
            var attendance = new AttendanceStore(paths);

            await store.InitializeAsync();
            await operations.InitializeAsync();
            await attendance.InitializeAsync();

            var person = new CachedPerson(
                "emp-1", "00004", "ÇETİN KAYA", "Genel", "Personel", "VAR", "Aktif", "00004", "2026-01-01", "");
            await store.CachePeopleAsync(new[] { person });

            // Eski yerel workbench kayıtları hâlâ okunabilir/persist edilir; ancak AttendanceStore için iş kuralı kaynağı değildir.
            await operations.SaveGroupAsync(new WorkGroupRow("SHIFT-A", "Erken Mesai", "08:00", "18:00", 5, 0, true), "TEST");
            await operations.AssignGroupAsync(person.Id, "SHIFT-A", "TEST");
            await operations.SaveLeaveAsync(person.Id, "2026-08-10", "2026-08-11", "YILLIK_IZIN", "Test izin", "TEST");
            await operations.SaveHolidayAsync("2026-08-30", "Zafer Bayramı", false, "TEST");
            await operations.SaveAdvanceAsync(person.Id, "2026-08-12", 1000m, "Test avans", "TEST");

            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 13, 8, 10, 0), "TEST", "in", "raw-in")));
            Assert.True(await store.AddAsync(new RawPunch("00004", new DateTime(2026, 8, 13, 18, 30, 0), "TEST", "out", "raw-out")));

            var rows = await attendance.BuildMonthAsync(2026, 8);
            var localLeave = rows.Single(x => x.EmployeeId == person.Id && x.Date == "2026-08-10");
            var localHoliday = rows.Single(x => x.EmployeeId == person.Id && x.Date == "2026-08-30");
            var worked = rows.Single(x => x.EmployeeId == person.Id && x.Date == "2026-08-13");

            Assert.Equal("KART_YOK", localLeave.Status);
            Assert.Equal("HAFTA_SONU", localHoliday.Status);
            Assert.Equal("CALISTI", worked.Status);
            Assert.Equal("08:10", worked.Entry);
            Assert.Equal("18:30", worked.Exit);
            Assert.Equal(0, worked.LateMinutes);
            Assert.Equal(20, worked.EarlyMinutes);
            Assert.Equal(0, worked.OvertimeMinutes);
            Assert.Equal("OFFLINE_RAW", worked.DataSource);

            var timesheet = AttendanceStore.BuildTimesheet(rows).Single(x => x.EmployeeId == person.Id);
            Assert.True(timesheet.WorkedDays >= 1);
            Assert.Equal(0, timesheet.AnnualLeaveDays);

            var advances = await operations.GetAdvancesAsync();
            Assert.Single(advances);
            Assert.Equal(1000m, advances[0].Amount);

            var departments = await operations.GetDepartmentsAsync();
            Assert.Contains(departments, x => x.Department == "Genel" && x.PersonCount == 1);

            await operations.SetPeriodStatusAsync(2026, 8, "CLOSED", "Test kapanış", "TEST");
            var period = (await operations.GetPeriodsAsync()).Single(x => x.Year == 2026 && x.Month == 8);
            Assert.Equal("CLOSED", period.Status);

            Assert.NotEmpty(await operations.GetAuditAsync());
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }
}
