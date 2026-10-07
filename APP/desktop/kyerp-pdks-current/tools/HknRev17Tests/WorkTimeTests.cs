using System.Data;
using QuickDataTool;

internal static class WorkTimeTests
{
    internal static void Run(Action<bool, string> check)
    {
        var fallback = WorkTimePolicy.Default;
        check(!fallback.FromDatabase &&
              fallback.Entry == 510 && fallback.EntryEarly == 495 && fallback.EntryLate == 525 &&
              fallback.Exit == 1140 && fallback.ExitEarly == 1110 && fallback.ExitLate == 1170 &&
              fallback.DailyWork == 450,
              "REV25 fallback work-time policy is complete");

        foreach (var minute in new[] { 495, 510, 525 })
            check(fallback.ClassifyEntry(minute) == "NORMAL", $"REV25 entry boundary {minute} inclusive");
        foreach (var minute in new[] { 1110, 1140, 1170 })
            check(fallback.ClassifyExit(minute) == "NORMAL", $"REV25 exit boundary {minute} inclusive");

        check(fallback.ClassifyEntry(494) == "ERKEN GELİŞ" &&
              fallback.ClassifyEntry(526) == "GEÇ GİRİŞ" &&
              fallback.ClassifyExit(1109) == "ERKEN ÇIKIŞ" &&
              fallback.ClassifyExit(1171) == "GEÇ ÇIKIŞ / mesai adayı",
              "REV25 classification respects policy edges");

        var table = new DataTable();
        foreach (var field in new[] { "AD", "IGIRISS", "EGTOL", "GGTOL", "DCIKISS", "ECTOL", "GCTOL", "GDSAAT", "GUNBIT", "BASLAMAS1", "BITISS1", "MAKSURE1" })
            table.Columns.Add(field);
        table.Rows.Add("hafta içi", "540", "525", "555", "1140", "1110", "1170", "420", "1860", "540", "1140", "450");
        var custom = WorkTimePolicy.Parse(table);
        check(custom.FromDatabase && custom.Entry == 540 && custom.EntryEarly == 525 && custom.EntryLate == 555 &&
              custom.ExitEarly == 1110 && custom.ExitLate == 1170 && custom.DailyWork == 450,
              "REV25 Hedef DB work-time policy parses numeric minute schema");

        table.Rows[0]["EGTOL"] = "08:45";
        table.Rows[0]["GGTOL"] = "09:15";
        check(WorkTimePolicy.Parse(table).EntryEarly == 525 && WorkTimePolicy.Parse(table).EntryLate == 555,
              "REV25 Hedef DB work-time policy accepts HH:mm schema values");

        table.Rows[0]["GGTOL"] = "08:00";
        check(WorkTimePolicy.Parse(table) == fallback,
              "REV25 contradictory work-time policy fails closed to safe fallback");
        table.Rows[0]["GGTOL"] = "09:15";
        table.Rows.Add(table.Rows[0].ItemArray);
        check(WorkTimePolicy.Parse(table) == fallback,
              "REV25 ambiguous HAFTAICI definitions are never guessed");
        table.Rows.RemoveAt(1);

        using var main = new MainForm();
        main.SetWorkHours(custom);
        check(main.WorkHours == custom, "REV25 shell holds one shared DB work-time policy");

        var records = new DataTable();
        records.Columns.Add("SIRA", typeof(int));
        records.Columns.Add("PKNO", typeof(string));
        records.Columns.Add("GTARIH", typeof(DateTime));
        records.Columns.Add("GSAAT", typeof(string));
        records.Columns.Add("GTUR", typeof(string));
        records.Columns.Add("CTARIH", typeof(DateTime));
        records.Columns.Add("CSAAT", typeof(string));
        records.Columns.Add("CTUR", typeof(string));

        var start = new DateTime(2026, 5, 4);
        var days = Enumerable.Range(0, 12).Select(offset => start.AddDays(offset)).ToArray();
        var snapshot = new DbRecordSnapshot(start, days[^1].AddDays(1), ["00001"], days, records,
            [new DbRecordPerson("00001", "Fixture")], "TEST", DbRecordMode.RepairAll) { WorkHours = custom };
        var changes = DbRecordService.PlanChanges(snapshot, CancellationToken.None);

        var entries = changes.Where(change => change.Side == "Giriş" && change.Operation == "EKLE")
            .OrderBy(change => change.Day).ToArray();
        var exits = changes.Where(change => change.Side == "Çıkış" && change.Operation == "EKLE")
            .OrderBy(change => change.Day).ToArray();
        check(entries.Length == days.Length && exits.Length == days.Length &&
              entries.All(item => MonthlyDbAudit.Clock(item.NewTime, out var minute) && minute >= custom.EntryEarly && minute <= custom.EntryLate) &&
              exits.All(item => MonthlyDbAudit.Clock(item.NewTime, out var minute) && minute >= custom.ExitEarly && minute <= custom.ExitLate),
              "REV25 DB-first generation always obeys shared Hedef ranges");

        check(entries.Zip(entries.Skip(1)).All(pair => pair.First.NewTime != pair.Second.NewTime) &&
              exits.Zip(exits.Skip(1)).All(pair => pair.First.NewTime != pair.Second.NewTime),
              "REV25 naturally generated consecutive days do not repeat the same minute");

        var preserved = records.NewRow();
        preserved["SIRA"] = 1;
        preserved["PKNO"] = "00001";
        preserved["GTARIH"] = start;
        preserved["GSAAT"] = "09:00";
        preserved["GTUR"] = "";
        preserved["CTARIH"] = start;
        preserved["CSAAT"] = "19:00";
        preserved["CTUR"] = "";
        records.Rows.Add(preserved);
        var withReal = snapshot with { Records = records, Days = [start] };
        var realChanges = DbRecordService.PlanChanges(withReal, CancellationToken.None);
        check(realChanges.Length == 0,
              "REV25 valid real DB clocks are preserved exactly");
    }
}
