namespace KYERP.PDKS.Core.Payroll;

public static class TimesheetViewFilter
{
    public static string Build(int selectedIndex) => selectedIndex switch
    {
        1 => "NC <> 0",
        2 => "M50 <> 0 OR M100 <> 0",
        3 => "DEVAMSIZLIK <> 0",
        4 => "GEC_KALMA <> 0",
        5 => "EKSIK_SURE <> 0",
        _ => string.Empty
    };
}
