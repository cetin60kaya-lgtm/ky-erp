namespace HKN.Personel.Native;

/// <summary>
/// KY PDKS owns the product navigation. Every entry resolves to an existing
/// command in the real application; future features are not shown as working.
/// Ordering follows the daily operator's workflow, then HR, pay and audit.
/// </summary>
public static class PdksNavigationDesign
{
    public sealed record Section(string Title, params PdksCommandId[] Commands);

    public static readonly IReadOnlyList<Section> Sections =
    [
        new("GÜNLÜK OPERASYON",
            PdksCommandId.Home,
            PdksCommandId.LiveAttendance,
            PdksCommandId.EntryExit,
            PdksCommandId.AttendanceExceptions,
            PdksCommandId.AttendanceHistory,
            PdksCommandId.MonthlyAttendanceAdmin),
        new("PERSONEL & PLANLAMA",
            PdksCommandId.Personnel,
            PdksCommandId.Leave,
            PdksCommandId.Groups,
            PdksCommandId.ServiceRoutes,
            PdksCommandId.AnnualWorkPlan),
        new("PUANTAJ & ÖDEMELER",
            PdksCommandId.TimesheetMonthly,
            PdksCommandId.PayrollGeneral,
            PdksCommandId.PayrollPayments,
            PdksCommandId.PeriodControlCenter),
        new("CİHAZ & ANALİZ",
            PdksCommandId.TerminalCenter,
            PdksCommandId.Reports,
            PdksCommandId.DepartmentAttendanceAnalytics,
            PdksCommandId.AuditHistory)
    ];

    public static IReadOnlyList<PdksCommandId> AllMenuCommands =>
        Sections.SelectMany(x => x.Commands).ToArray();
}
