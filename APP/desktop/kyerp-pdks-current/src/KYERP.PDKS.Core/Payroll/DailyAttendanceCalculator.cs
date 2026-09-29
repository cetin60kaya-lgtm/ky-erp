namespace KYERP.PDKS.Core.Payroll;

public sealed record DailyAttendanceInput(
    DateTime WorkDate,
    int ExpectedStartMinutes,
    int ExpectedEndMinutes,
    int ExpectedWorkMinutes,
    DateTime? FirstEntry,
    DateTime? LastExit,
    int PaidLeaveMinutes = 0,
    int UnpaidLeaveMinutes = 0,
    bool IsHoliday = false);

public sealed record DailyAttendanceResult(
    string Status,
    string Entry,
    string Exit,
    int NormalMinutes,
    int Overtime50Minutes,
    int Overtime100Minutes,
    int UnpaidLeaveMinutes,
    int AbsenceMinutes,
    int LateMinutes,
    int EarlyExitMinutes,
    int ShortfallMinutes)
{
    public short NormalDay => (short)(NormalMinutes > 0 ? 1 : 0);
    public short Overtime50Day => (short)(Overtime50Minutes > 0 ? 1 : 0);
    public short Overtime100Day => (short)(Overtime100Minutes > 0 ? 1 : 0);
    public short UnpaidLeaveDay => (short)(UnpaidLeaveMinutes > 0 ? 1 : 0);
    public short AbsenceDay => (short)(AbsenceMinutes > 0 ? 1 : 0);
    public short LateDay => (short)(LateMinutes > 0 ? 1 : 0);
    public short EarlyExitDay => (short)(EarlyExitMinutes > 0 ? 1 : 0);
    public short ShortfallDay => (short)(ShortfallMinutes > 0 ? 1 : 0);

    public static string AsTime(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
}

public static class DailyAttendanceCalculator
{
    public static DailyAttendanceResult Calculate(DailyAttendanceInput input)
    {
        if (input.ExpectedStartMinutes is < 0 or >= 1440 || input.ExpectedEndMinutes is < 0 or >= 1440)
            throw new ArgumentOutOfRangeException(nameof(input), "Plan saatleri gün içinde olmalıdır.");
        if (input.ExpectedWorkMinutes < 0 || input.PaidLeaveMinutes < 0 || input.UnpaidLeaveMinutes < 0)
            throw new ArgumentOutOfRangeException(nameof(input), "Puantaj süreleri negatif olamaz.");
        if (input.FirstEntry.HasValue && !input.LastExit.HasValue)
        {
            var openRecordExpectedEntry = input.WorkDate.Date.AddMinutes(input.ExpectedStartMinutes);
            var openRecordLate = Math.Max(0, checked((int)Math.Round((input.FirstEntry.Value - openRecordExpectedEntry).TotalMinutes)));
            return Result("AÇIK KAYIT", input.FirstEntry, late: openRecordLate, shortfall: input.ExpectedWorkMinutes);
        }
        if (!input.FirstEntry.HasValue && input.LastExit.HasValue)
            throw new ArgumentException("Çıkış kaydı giriş olmadan hesaplanamaz.", nameof(input));

        var isHoliday = input.IsHoliday || input.ExpectedWorkMinutes == 0;
        if (input.FirstEntry is null)
        {
            if (isHoliday) return Result("TATİL");
            var paid = Math.Min(input.ExpectedWorkMinutes, input.PaidLeaveMinutes);
            var unpaid = Math.Min(Math.Max(0, input.ExpectedWorkMinutes - paid), input.UnpaidLeaveMinutes);
            var absence = Math.Max(0, input.ExpectedWorkMinutes - paid - unpaid);
            var status = absence > 0 ? "DEVAMSIZ" : paid > 0 ? "ÜCRETLİ İZİN" : "ÜCRETSİZ İZİN";
            return Result(status, normal: paid, unpaid: unpaid, absence: absence, shortfall: absence);
        }

        var entry = input.FirstEntry.Value;
        var exit = input.LastExit!.Value;
        if (exit <= entry) throw new ArgumentException("Çıkış zamanı girişten sonra olmalıdır.", nameof(input));
        var worked = checked((int)Math.Round((exit - entry).TotalMinutes));
        if (isHoliday)
            return Result("TATİL ÇALIŞMASI", entry, exit, overtime100: worked);

        var expectedEntry = input.WorkDate.Date.AddMinutes(input.ExpectedStartMinutes);
        var expectedExit = input.WorkDate.Date.AddMinutes(input.ExpectedEndMinutes);
        if (input.ExpectedEndMinutes < input.ExpectedStartMinutes) expectedExit = expectedExit.AddDays(1);
        var late = Math.Max(0, checked((int)Math.Round((entry - expectedEntry).TotalMinutes)));
        var early = Math.Max(0, checked((int)Math.Round((expectedExit - exit).TotalMinutes)));
        var normal = Math.Min(input.ExpectedWorkMinutes, worked + input.PaidLeaveMinutes);
        var overtime = Math.Max(0, checked((int)Math.Round((expectedEntry - entry).TotalMinutes)))+
            Math.Max(0, checked((int)Math.Round((exit - expectedExit).TotalMinutes)));
        var unpaidLeave = Math.Min(input.ExpectedWorkMinutes, input.UnpaidLeaveMinutes);
        var uncovered = Math.Max(late + early, input.ExpectedWorkMinutes - worked);
        var shortfall = Math.Max(0, uncovered - input.PaidLeaveMinutes - unpaidLeave);
        return Result("ÇALIŞTI", entry, exit, normal, overtime, unpaid: unpaidLeave, late: late, early: early, shortfall: shortfall);
    }

    static DailyAttendanceResult Result(string status, DateTime? entry = null, DateTime? exit = null,
        int normal = 0, int overtime50 = 0, int overtime100 = 0, int unpaid = 0,
        int absence = 0, int late = 0, int early = 0, int shortfall = 0) =>
        new(status, entry?.ToString("HH:mm") ?? "", exit?.ToString("HH:mm") ?? "", normal,
            overtime50, overtime100, unpaid, absence, late, early, shortfall);
}