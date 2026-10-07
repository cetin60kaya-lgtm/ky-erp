using System.Data;
using System.Reflection;
using QuickDataTool;

internal static class WorkTimeTests
{
    internal static void Run(Action<bool, string> check)
    {
        var policy = WorkTimePolicy.Default;
        check(!policy.FromDatabase && policy.Entry == 510 && policy.EntryEarly == 495 && policy.EntryLate == 525 && policy.Exit == 1140 && policy.ExitEarly == 1110 && policy.ExitLate == 1170 && policy.DayRollover == 420 && policy.DayEnd == 420 && policy.NormalStart == 510 && policy.NormalEnd == 1140 && policy.DailyWork == 450, "REV21 exact fallback all eleven settings");
        foreach (var minute in new[] { 495, 510, 525 }) check(policy.ClassifyEntry(minute) == "NORMAL", $"REV21 inclusive entry boundary {minute}");
        foreach (var minute in new[] { 1110, 1140, 1170 }) check(policy.ClassifyExit(minute) == "NORMAL", $"REV21 inclusive exit boundary {minute}");
        check(policy.ClassifyEntry(494) == "ERKEN GELİŞ" && !WorkTimePolicy.IsError(policy.ClassifyEntry(494)), "REV21 early arrival never error or penalty");
        check(policy.ClassifyEntry(526) == "GEÇ GİRİŞ", "REV21 late starts after upper boundary");
        check(policy.ClassifyEntry(513) == "NORMAL" && policy.ClassifyEntry(520) == "NORMAL" && policy.ClassifyEntry(530) == "GEÇ GİRİŞ", "REV21 requested 08:33 08:40 and 08:50 classification");
        check(policy.ClassifyExit(1136) == "NORMAL" && policy.ClassifyExit(1145) == "NORMAL", "REV21 requested 18:56 and 19:05 classification");
        check(policy.ClassifyExit(1109) == "ERKEN ÇIKIŞ" && policy.ClassifyExit(1171) == "GEÇ ÇIKIŞ / mesai adayı", "REV21 departure boundaries and overtime candidate");
        var day = new DateTime(2026, 5, 4);
        var request = new AuditRequest("SYNTHETIC.Tnf", day, day.AddDays(1), "", new());
        var personnel = new Dictionary<string, EmploymentRule> { ["00001"] = new("00001", "Fixture", day.AddYears(-1), null, true) };
        var schedules = new List<DailySchedule> { new("00001", day, "08:30", "19:00") };
        foreach (var eSide in new[] { "Giriş", "Çıkış" })
        {
            var eMoves = new List<DbMovement> { new(1, "00001", day, eSide, eSide == "Giriş" ? "08:30" : "19:00", "E"),
                new(1, "00001", day, eSide == "Giriş" ? "Çıkış" : "Giriş", eSide == "Giriş" ? "19:00" : "08:30", "") };
            var eIssues = MonthlyDbAudit.Analyze(request, eMoves, personnel, schedules, [], [], CancellationToken.None, policy);
            check(eIssues.Count(issue => issue.Kind == "E KAYIT") == 1 && !eIssues.Any(issue => issue.Kind.StartsWith("EKSİK")), "REV21 E side never counted as missing " + eSide);
        }
        var extraMoves = new List<DbMovement> { new(1,"00001",day,"Giriş","08:23",""), new(1,"00001",day,"Çıkış","18:51",""), new(2,"00001",day,"Giriş","19:00","") };
        var shiftIssues = MonthlyDbAudit.Analyze(request, extraMoves, personnel, schedules, [], [], CancellationToken.None, policy, [("00001",day)]);
        check(!shiftIssues.Any(issue => issue.Safe) && shiftIssues.Any(issue => issue.Kind == "İNCELE"), "REV21 explicit second shift override never safe-delete isolated entry");
        foreach (var entry in new[] { "08:14", "08:15", "08:30", "08:45", "08:46" })
        {
            var movements = new List<DbMovement> { new(1, "00001", day, "Giriş", entry, ""), new(1, "00001", day, "Çıkış", "18:30", "") };
            var issues = MonthlyDbAudit.Analyze(request, movements, personnel, schedules, [], [], CancellationToken.None, policy);
            check(issues.Any(issue => issue.Kind == "GEÇ GİRİŞ") == (entry == "08:46") && !issues.Any(issue => issue.Kind == "ERKEN ÇIKIŞ") && movements[0].Time == entry, "REV21 monthly entry classification preserves actual " + entry);
        }
        foreach (var exit in new[] { "18:29", "18:30", "19:00", "19:30", "19:31" })
        {
            var movements = new List<DbMovement> { new(1, "00001", day, "Giriş", "08:30", ""), new(1, "00001", day, "Çıkış", exit, "") };
            var issues = MonthlyDbAudit.Analyze(request, movements, personnel, schedules, [], [], CancellationToken.None, policy);
            check(issues.Any(issue => issue.Kind == "ERKEN ÇIKIŞ") == (exit == "18:29") && issues.Any(issue => issue.Kind == "GEÇ ÇIKIŞ / mesai adayı") == (exit == "19:31") && movements[1].Time == exit, "REV21 monthly exit classification preserves actual " + exit);
        }
        var table = new DataTable();
        foreach (var field in new[] { "AD", "IGIRISS", "EGTOL", "GGTOL", "DCIKISS", "ECTOL", "GCTOL", "GDSAAT", "GUNBIT", "BASLAMAS1", "BITISS1", "MAKSURE1" }) table.Columns.Add(field);
        table.Rows.Add("hafta içi", "510", "510", "525", "1140", "1110", "1170", "420", "1860", "510", "1140", "450");
        var databasePolicy = WorkTimePolicy.Parse(table);
        check(databasePolicy.FromDatabase && databasePolicy.EntryEarly == 510 && databasePolicy.DayEnd == 420 && databasePolicy.Information.Contains("Kaynak: Hedef DB"), "REV21 real schema numeric minutes extended day end and Turkish normalization");
        check(databasePolicy.ClassifyEntry(503) == "ERKEN GELİŞ" && !WorkTimePolicy.IsError(databasePolicy.ClassifyEntry(503)), "REV21 DB early boundary wins over fallback without penalty");
        table.Rows[0]["EGTOL"] = "08:15";
        check(WorkTimePolicy.Parse(table).EntryEarly == 495, "REV21 clock string settings supported");
        table.Rows[0]["GGTOL"] = "08:00";
        check(WorkTimePolicy.Parse(table) == policy, "REV21 contradictory DB settings fail to complete fallback");
        table.Rows[0]["GGTOL"] = "08:45";
        table.Rows.Add(table.Rows[0].ItemArray);
        check(WorkTimePolicy.Parse(table) == policy, "REV21 ambiguous weekday plans never guessed");
        check(WorkTimePolicy.Parse(new DataTable()) == policy && policy.Information.Contains("Kaynak: Sabit Varsayılan"), "REV21 missing schema and explicit fallback source");
        table.Rows.RemoveAt(1);
        table.Rows[0]["MAKSURE1"] = DBNull.Value;
        check(WorkTimePolicy.Parse(table) == policy, "REV21 incomplete settings never claim DB source");
        table.Rows[0]["MAKSURE1"] = "450";
        table.Rows[0]["IGIRISS"] = table.Rows[0]["BASLAMAS1"] = "540";
        table.Rows[0]["EGTOL"] = "525";
        table.Rows[0]["GGTOL"] = "555";
        var custom = WorkTimePolicy.Parse(table);
        check(custom.FromDatabase && custom.Entry == 540 && custom.ClassifyEntry(555) == "NORMAL" && custom.ClassifyEntry(556) == "GEÇ GİRİŞ", "REV21 nonfallback DB hours drive classification");
        var settings = CompletionSettings.For(custom, false, true, false, false);
        check(settings.Entry == custom.Entry && settings.EntryMin == custom.EntryEarly && settings.ExitMax == custom.ExitLate, "REV21 completion references use same DB policy");
        using var main = new MainForm();
        main.SetWorkHours(custom);
        check(main.WorkHours == custom, "REV25 shell keeps the DB work-time policy as the single source");
        var records = new DataTable();
        foreach (var column in new[] { "SIRA","PKNO","GTARIH","GSAAT","GTUR","CTARIH","CSAAT","CTUR" }) records.Columns.Add(column);
        var snapshot = new DbRecordSnapshot(day, day.AddDays(1), ["00001"], [day], records,
            [new DbRecordPerson("00001","Fixture")], [], "TEST") { WorkHours = custom };
        var plan = DbRecordService.Plan(snapshot, CancellationToken.None).Single();
        check(MonthlyDbAudit.Clock(plan.Entry, out var generatedEntry) && generatedEntry >= custom.EntryEarly && generatedEntry <= custom.EntryLate &&
              MonthlyDbAudit.Clock(plan.Exit, out var generatedExit) && generatedExit >= custom.ExitEarly && generatedExit <= custom.ExitLate,
              "REV25 DB-first record generation obeys the shared Hedef time ranges");
    }
}
