namespace KYERP.PDKS.Core.Operations;

public sealed record DailyAttendance(string EmployeeCode, DateTime? Entry, DateTime? Exit, bool Expected, string Shift);
public sealed record DailyOperationSummary(int Expected, int Arrived, int Missing, int OpenRecords, int DayShift, int NightShift);

public static class DailyOperationCalculator
{
    public static DailyOperationSummary Calculate(IEnumerable<DailyAttendance> rows)
    {
        var values=rows.ToArray();
        return new DailyOperationSummary(
            values.Count(item=>item.Expected),values.Count(item=>item.Entry.HasValue),
            values.Count(item=>item.Expected&&!item.Entry.HasValue),values.Count(item=>item.Entry.HasValue&&!item.Exit.HasValue),
            values.Count(item=>item.Entry.HasValue&&!item.Shift.Equals("GECE",StringComparison.OrdinalIgnoreCase)),
            values.Count(item=>item.Entry.HasValue&&item.Shift.Equals("GECE",StringComparison.OrdinalIgnoreCase)));
    }
}
