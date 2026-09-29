using System.Globalization;

namespace KYERP.PDKS.Core.Leave;

public static class LeavePayrollArea
{
    public const int Unpaid = 4;
    public const int Paid = 5;

    public static int Validate(int value) => value is Unpaid or Paid
        ? value
        : throw new ArgumentException("İzin bordro alanı yalnız Ücretsiz İzin (4) veya Ücretli İzin (5) olabilir.");
}

public sealed record HourlyLeaveDuration(string StartTime, string EndTime, int Minutes);

public static class LeaveEntryValidator
{
    public const int FullDayMinutes = 450;
    public const string FullDayDuration = "07:30";

    public static HourlyLeaveDuration ValidateHourly(DateTime startDate, string startTime, DateTime endDate, string endTime)
    {
        if(startDate.Date!=endDate.Date)throw new ArgumentException("Saatlik izin başlangıç ve bitiş tarihi aynı gün olmalıdır.");
        if(!DateTime.TryParseExact(startTime.Trim(),"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out var start))
            throw new ArgumentException("Başlangıç saati HH:mm biçiminde olmalıdır.");
        if(!DateTime.TryParseExact(endTime.Trim(),"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out var end))
            throw new ArgumentException("Bitiş saati HH:mm biçiminde olmalıdır.");
        var minutes=(int)(end.TimeOfDay-start.TimeOfDay).TotalMinutes;
        if(minutes<=0)throw new ArgumentException("Saatlik izin bitiş saati başlangıç saatinden sonra olmalıdır.");
        return new HourlyLeaveDuration(start.ToString("HH:mm"),end.ToString("HH:mm"),minutes);
    }
}

public static class AnnualLeaveDateExpander
{
    public static IReadOnlyList<DateTime> Expand(DateTime startInclusive, DateTime returnDateExclusive)
    {
        if(returnDateExclusive.Date<=startInclusive.Date)throw new ArgumentException("Yıllık izin işbaşı tarihi başlangıç tarihinden sonra olmalıdır.");
        return Enumerable.Range(0,(returnDateExclusive.Date-startInclusive.Date).Days)
            .Select(offset=>startInclusive.Date.AddDays(offset)).Where(date=>date.DayOfWeek!=DayOfWeek.Sunday).Distinct().ToArray();
    }
}

public static class FullDayLeaveDateExpander
{
    public static IReadOnlyList<DateTime> Expand(DateTime startInclusive, DateTime endInclusive)
    {
        if(endInclusive.Date<startInclusive.Date)throw new ArgumentException("İzin bitiş tarihi başlangıç tarihinden önce olamaz.");
        return Enumerable.Range(0,(endInclusive.Date-startInclusive.Date).Days+1)
            .Select(offset=>startInclusive.Date.AddDays(offset)).Distinct().ToArray();
    }
}
