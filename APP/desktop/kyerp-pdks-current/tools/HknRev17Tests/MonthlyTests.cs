using System.Data;
using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class MonthlyTests
{
    internal static void Run(Action<bool, string> check, string? liveDb = null, string? liveTnf = null)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var directory = Path.Combine(@"D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST", "REV21_FIXTURE_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "SYNTHETIC.GDB");
        var tnf = Path.Combine(directory, "TR2026.Tnf");
        File.WriteAllText(tnf, "00056,08:38,250526,1,001\n00999,09:00,040526,1,001\n");
        var options = PdksOptions.FromEnvironment() with { DatabasePath = path, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey", DatabaseCharset = "UTF8" };
        var cs = new FbConnectionStringBuilder { Database = path, DataSource = options.DatabaseHost, Port = options.DatabasePort, UserID = options.DatabaseUser, Password = options.DatabasePassword, Charset = "UTF8", Dialect = 1 };
        FbConnection.CreateDatabase(cs.ToString());
        var database = new FirebirdDatabase(options);
        foreach (var sql in new[] {
            "create table DURUM (KOD varchar(20), AD varchar(100))",
            "create table KIMLIK (PKNO varchar(20), AD varchar(100), SOYAD varchar(100), GRUP varchar(20), IGTARIH date, ICTARIH date, DURUM varchar(20))",
            "create table GIRCIK (SIRA integer not null primary key,PKNO varchar(20),GTARIH date,GSAAT varchar(8),GDAKIKA integer,GTUR varchar(1),CTARIH date,CSAAT varchar(8),CDAKIKA integer,CTUR varchar(1),MKOD varchar(3))",
            "create table PLANA (TARIH date,GKOD varchar(20),MTKOD varchar(20))",
            "create table PUANBILGI (KOD varchar(20),IGIRISS varchar(8),DCIKISS varchar(8))",
            "create table OZELIZIN (PKNO varchar(20),TARIH date)",
            "create table PERPLANTAT (PKNO varchar(20),TARIH date)",
            "create table PERPLANMES (PKNO varchar(20),TARIH date)",
            "create table PLANG (TARIH date,GKOD varchar(20),TTKOD varchar(20))",
            "create table PERTIMESHIFT (PKNO varchar(20),STARTDATE date,ENDDATE date)",
            "insert into DURUM values ('1','Çalışanlar')",
            "insert into PUANBILGI values ('1','08:30','19:00')",
            "insert into KIMLIK values ('00056','SENTETIK','PERSONEL','1','2026-05-01',null,'1')",
            "insert into GIRCIK values (1,'00056','2026-05-25','08:23',503,'','2026-05-25','18:51',1131,'','000')",
            "insert into GIRCIK values (2,'00056','2026-05-25','19:00',1140,'',null,null,null,null,'000')",
            "insert into GIRCIK values (3,'00056','2026-05-04','08:50',530,'',null,null,null,null,'000')",
            "insert into GIRCIK values (4,'00056','2026-05-05','08:20',500,'','2026-05-05','12:00',720,'','000')",
            "insert into GIRCIK values (5,'00056','2026-05-05','13:00',780,'','2026-05-05','19:00',1140,'','000')",
            "insert into GIRCIK values (6,'00056','2026-05-06','08:25',505,'E',null,null,null,null,'000')",
            "insert into GIRCIK values (7,'00056','2026-05-07','08:25',505,'','2026-05-07','18:20',1100,'','000')",
            "insert into GIRCIK values (8,'00056','2026-05-07','08:25',505,'',null,null,null,null,'000')",
            "insert into GIRCIK values (9,'00056','2026-05-08','08:25',505,'',null,null,null,null,'000')",
            "insert into GIRCIK values (10,'00056','2026-04-30','08:50',530,'','2026-05-07','18:20',1100,'','000')",
            "insert into GIRCIK values (11,'00056',null,null,null,null,'2026-05-14','18:20',1100,'','000')",
            "insert into OZELIZIN values ('00056','2026-05-08')",
            "insert into PERTIMESHIFT values ('00056','2026-05-05','2026-05-05')" }) database.Execute(sql);
        for (var day = new DateTime(2026, 5, 1); day < new DateTime(2026, 6, 1); day = day.AddDays(1))
            database.Execute("insert into PLANA values (@D,'1','1')", new FbParameter("@D", day));
        var request = new AuditRequest(tnf, new(2026, 5, 1), new(2026, 6, 1), "", new());
        AuditSnapshot Read() => SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        var sync = Read();
        var snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        check(snapshot.Issues.Any(issue => issue.Id == 2 && issue.Kind == "FAZLA TARAF" && issue.Safe), "REV21 paired normal day marks lone 19:00 extra with DB schedule evidence");
        check(snapshot.Issues.Any(issue => issue.Day.Day == 5 && issue.Kind == "İNCELE" && !issue.Safe), "REV21 two genuine shifts never safe-delete");
        check(snapshot.Issues.Any(issue => issue.Id == 8 && issue.Kind == "MÜKERRER" && issue.Safe), "REV21 exact duplicate removes surplus side only");
        check(snapshot.Issues.Any(issue => issue.Kind == "EKSİK ÇIKIŞ" && issue.Day.Day == 4), "REV21 missing exit detected");
        check(snapshot.Issues.Any(issue => issue.Kind == "HİÇ BASMAMIŞ" && issue.Day.Day == 11), "REV21 no attendance requires whole day consent");
        var single = MonthlyDbAudit.Complete(snapshot, new(false, true, false, false), "", CancellationToken.None);
        check(single.Length == 2 && single.Any(issue=>issue.Id==3 && issue.Time=="19:00") && single.Any(issue=>issue.Id==11 && issue.Side=="Giriş" && issue.Time=="08:30"), "REV21 entry-only and exit-only days complete only absent side; leave excluded");
        var all = MonthlyDbAudit.Complete(snapshot, new(false, true, true, true), "", CancellationToken.None);
        check(all.Length > single.Length, "REV21 whole day generation only after explicit setting");
        check(all.All(issue => issue.Day.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday && !MonthlyDbAudit.Holiday(issue.Day)), "REV21 weekends official holidays and eve excluded");
        check(all.All(issue => MonthlyDbAudit.Clock(issue.Time, out var minute) && (issue.Side == "Giriş" ? minute >= snapshot.WorkHours.EntryEarly && minute <= snapshot.WorkHours.EntryLate : minute >= snapshot.WorkHours.ExitEarly && minute <= snapshot.WorkHours.ExitLate)), "REV21 explicitly authorized missing generation uses shared policy bands");
        check(all.Select(issue => issue.Time).Distinct().Count() > 2, "REV21 natural distribution varies generated minutes across days");
        check(!all.Any(issue => issue.Day.Day is 5 or 6 or 8), "REV21 shifts E leave never generate");
        check(!MonthlyDbAudit.Complete(snapshot, new(true, true, true, false), "00999", CancellationToken.None).Any(), "REV21 selected personnel scope enforced");
        var safe = snapshot.Issues.Where(issue => issue.Safe && MonthlyDbAudit.SafeKinds.Contains(issue.Kind)).ToArray();
        var backup = MonthlyDbWriter.ApplyAsync(database, sync, snapshot, safe, CancellationToken.None).GetAwaiter().GetResult();
        check(File.Exists(backup) && new FileInfo(backup).Length > 0 && File.Exists(backup + ".rows.json"), "REV21 fixture actual gbak and row dump before transaction");
        check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA in (2,8)")) == 0, "REV21 fixture safe surplus removed");
        check(Convert.ToString(database.Scalar("select CSAAT from GIRCIK where SIRA=7"))!.Trim() == "18:20", "REV21 early real exit remains 18:20");
        check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA in (4,5)")) == 2, "REV21 genuine double shifts persist after repair");
        check(Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=10"))!.Trim()=="08:50" &&
            Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA=10 and GTARIH='2026-04-30' and CTARIH is null"))==1, "REV21 duplicate cleanup preserves opposite side outside selected month");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        single = MonthlyDbAudit.Complete(snapshot, new(false, true, false, false), "", CancellationToken.None);
        var originalTnf = File.ReadAllBytes(tnf);
        var staleRejected = false;
        try { SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot with { Fingerprint = "stale" }, single, CancellationToken.None).GetAwaiter().GetResult(); }
        catch (InvalidOperationException) { staleRejected = true; }
        check(staleRejected && !Directory.GetFiles(directory, "*.pending", SearchOption.AllDirectories).Any() &&
            Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA=3 and CSAAT is not null")) == 0,
            "REV21 staged TNF discarded and DB unchanged when transaction revalidation fails");
        var completion = SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot, single, CancellationToken.None).GetAwaiter().GetResult();
        check(single.All(issue => File.ReadAllLines(completion.Outputs.CorrectedPath).Contains($"{issue.Card},{issue.Time},{issue.Day:ddMMyy},1,001")),
            "REV21 missing entry and exit use exactly the same DB card date time in corrected TNF");
        check(single.All(issue => !File.ReadAllLines(completion.Outputs.MissingPath).Contains($"{issue.Card},{issue.Time},{issue.Day:ddMMyy},1,001")),
            "REV21 generated DB rows are not duplicated across corrected and missing outputs");
        check(originalTnf.SequenceEqual(File.ReadAllBytes(tnf)), "REV21 coordinated completion preserves original TNF bytes");
        var correctedRequest = request with { Path = completion.Outputs.CorrectedPath };
        var verified = SyncEngine.ReadAsync(database, correctedRequest, CancellationToken.None).GetAwaiter().GetResult();
        check(single.All(issue => verified.Table.AsEnumerable().Any(row => row.Field<string>("Kart No") == issue.Card && row.Field<string>("Tarih") == issue.Day.ToString("dd.MM.yyyy") &&
            row.Field<string>("Taraf") == issue.Side && row.Field<string>("DB Saat") == issue.Time && row.Field<string>("TNF Saat") == issue.Time && row.Field<string>("İşlem") == "YOK")),
            "REV21 post-commit readonly recheck confirms generated DB and TNF sides match");
        check(Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=3"))!.Trim() == "08:50", "REV21 real late entry stays 08:50 after completion");
        check(Convert.ToString(database.Scalar("select CSAAT from GIRCIK where SIRA=3"))!.Trim() == "19:00", "REV21 only missing exit filled");
        check(Convert.ToString(database.Scalar("select CSAAT from GIRCIK where SIRA=11"))!.Trim()=="18:20" &&
            Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=11"))!.Trim()=="08:30", "REV21 exit-only real early departure unchanged after missing entry generated");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        all = MonthlyDbAudit.Complete(snapshot, new(false, false, true, false), "", CancellationToken.None);
        var wholeCompletion = SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot, all, CancellationToken.None).GetAwaiter().GetResult();
        check(all.All(issue => File.ReadAllLines(wholeCompletion.Outputs.CorrectedPath).Contains($"{issue.Card},{issue.Time},{issue.Day:ddMMyy},1,001")),
            "REV21 explicitly approved whole days produce paired DB rows and identical TNF rows in one workflow");
        check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH='2026-05-11' and GSAAT='08:30' and CSAAT='19:00'")) == 1, "REV21 whole-day completion inserts one paired row");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var noCalendar = snapshot with { Excluded = new(snapshot.Excluded) { ("00056", new(2026, 5, 4)) } };
        check(!MonthlyDbAudit.Complete(noCalendar, new(false,true,true,false),"",CancellationToken.None).Any(issue=>issue.Day.Day==4), "REV21 calendar exclusion fail closed");
        var before = Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=3"));
        database.Execute("create trigger FIXTURE_GUARD for GIRCIK active before update as begin end");
        var triggerSync = Read();
        var guarded = MonthlyDbAudit.Read(database, triggerSync, CancellationToken.None);
        check(guarded.WritesBlocked, "REV21 unknown GIRCIK trigger prevents writes without disabling trigger");
        bool rejected = false;
        try { MonthlyDbWriter.ValidatePlan(guarded, all); } catch (InvalidOperationException) { rejected = true; }
        check(rejected && before == Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=3")), "REV21 blocked plan has no side effects");
        database.Execute("drop trigger FIXTURE_GUARD");
        var newDay = new DateTime(2026, 5, 12);
        database.Execute("delete from GIRCIK where GTARIH=@D", new FbParameter("@D", newDay));
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var stale = MonthlyDbAudit.Complete(snapshot, new(false,false,true,false),"",CancellationToken.None);
        database.Execute("insert into OZELIZIN values ('00056',@D)", new FbParameter("@D", newDay));
        rejected = false;
        try { MonthlyDbWriter.ApplyAsync(database, sync, snapshot, stale, CancellationToken.None).GetAwaiter().GetResult(); } catch (InvalidOperationException) { rejected = true; }
        check(rejected && Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH=@D", new FbParameter("@D",newDay))) == 0, "REV21 changed leave plan aborts batch before writes");
        database.Execute("delete from OZELIZIN where TARIH=@D", new FbParameter("@D", newDay));
        database.Execute("update GIRCIK set CTARIH=null,CSAAT=null,CDAKIKA=null,CTUR=null where GTARIH='2026-05-13'");
        database.Execute("alter table GIRCIK add constraint FIXTURE_FAIL check (GTARIH <> '2026-05-12' or GSAAT <> '08:30')");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var rollbackPlan = MonthlyDbAudit.Complete(snapshot, new(false,true,true,false), "", CancellationToken.None)
            .Where(issue => issue.Day.Day is 12 or 13).OrderByDescending(issue => issue.Day).ToArray();
        check(rollbackPlan.Any(issue=>issue.Day.Day==13) && rollbackPlan.Any(issue=>issue.Day.Day==12), "REV21 rollback fixture has earlier successful side then failing insertion");
        rejected = false;
        try { SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot, rollbackPlan, CancellationToken.None).GetAwaiter().GetResult(); } catch (FbException) { rejected = true; }
        check(rejected && Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH='2026-05-13' and CSAAT is not null"))==0 &&
            Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH='2026-05-12'"))==0, "REV21 actual mid-batch failure rolls back both successful side and partial insertion");
        database.Execute("alter table GIRCIK drop constraint FIXTURE_FAIL");
        check(!Directory.GetFiles(directory, "*.pending", SearchOption.AllDirectories).Any(), "REV21 real mid-batch DB rollback also discards staged TNF files");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var backupDirectory = Path.Combine(directory, "_YEDEK");
        var savedBackups = Path.Combine(directory, "_YEDEK_SAVED");
        Directory.Move(backupDirectory, savedBackups);
        try
        {
            File.WriteAllText(backupDirectory, "synthetic backup-path failure");
            rejected = false;
            try { MonthlyDbWriter.ApplyAsync(database, sync, snapshot, rollbackPlan, CancellationToken.None).GetAwaiter().GetResult(); } catch (IOException) { rejected = true; }
            check(rejected && Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH='2026-05-13' and CSAAT is not null"))==0, "REV21 backup failure blocks all DB writes");
        }
        finally { File.Delete(backupDirectory); Directory.Move(savedBackups, backupDirectory); }
        var originalPeople = snapshot.People;
        var rehire = new Dictionary<string, EmploymentRule> { ["00056"] = new("00056","fixture",new(2026,5,18),new(2025,7,2),true) };
        var rehireSnapshot = snapshot with { People = rehire };
        check(MonthlyDbAudit.Complete(rehireSnapshot,new(false,true,true,false),"",CancellationToken.None).All(issue=>issue.Day>=new DateTime(2026,5,18)), "REV21 rehire old history retained but never fabricated");
        check(MonthlyDbAudit.Holiday(new(2027,5,4)), "REV21 unverified holiday year prevents generation");
        var cancellation = new CancellationToken(true);
        rejected = false;
        try { MonthlyDbAudit.Analyze(request,MonthlyDbAudit.Movements(snapshot.Records,request),originalPeople,snapshot.Schedules,snapshot.Excluded,[],cancellation); } catch(OperationCanceledException) { rejected=true; }
        check(rejected, "REV21 monthly analysis cancellation works");
        Console.WriteLine("REV21_SYNTHETIC_WRITES_PASSED");
        NormalizationTests.Run(check);
        if (liveDb is null || liveTnf is null) return;
        options = options with { DatabasePath = liveDb, DatabaseCharset = "WIN1254" };
        database = new(options);
        request = request with { Path = liveTnf };
        var timer = Stopwatch.StartNew();
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database,sync,CancellationToken.None);
        Console.WriteLine($"REV21_LIVE_MAY db_query_ms={sync.DbMilliseconds} tnf_parse_ms={sync.TnfMilliseconds} compare_ms={sync.CompareMilliseconds} monthly_db_ms={snapshot.Milliseconds} total_ms={timer.ElapsedMilliseconds}");
        Console.WriteLine(MonthlyDbAudit.Summary(snapshot));
        Console.WriteLine(snapshot.WorkHours.Information);
        check(snapshot.WorkHours.FromDatabase && snapshot.WorkHours.Entry == 510 && snapshot.WorkHours.EntryEarly == 510 && snapshot.WorkHours.EntryLate == 525 && snapshot.WorkHours.ExitEarly == 1110 && snapshot.WorkHours.ExitLate == 1170 && snapshot.WorkHours.DayEnd == 420 && snapshot.WorkHours.DailyWork == 450, "REV21 live exact HAFTA ICI policy read without database writes");
        Console.WriteLine($"REV21_PLANS schedules={snapshot.Schedules.Count} people={snapshot.People.Count} excluded={snapshot.Excluded.Count}");
        foreach(var plan in snapshot.Schedules.Where(plan=>plan.Card=="00056" && plan.Day.Day==25)) Console.WriteLine($"REV21_PLAN_00056 entry={plan.Entry} exit={plan.Exit} excluded={snapshot.Excluded.Contains((plan.Card,plan.Day))}");
        foreach (var issue in snapshot.Issues.Where(issue=>issue.Card=="00056" && issue.Day.Day==25)) Console.WriteLine($"REV21_00056_25MAY kind={issue.Kind} safe={issue.Safe} id={issue.Id} side={issue.Side} time={issue.Time}");
        var liveIrfan = MonthlyDbAudit.Movements(snapshot.Records, request).Where(move => move.Card == "00056" && move.Date.Day == 25).ToArray();
        Console.WriteLine($"REV21_LIVE_00056_25MAY movements={string.Join(";", liveIrfan.Select(move => move.Side + " " + move.Time))}");
        var hasExtra = liveIrfan.Any(move => move.Side == "Giriş" && move.Time == "19:00");
        check(!hasExtra || snapshot.Issues.Any(issue=>issue.Card=="00056"&&issue.Day.Day==25&&issue.Kind=="FAZLA TARAF"&&issue.Safe), "REV21 live remaining 19:00 extra safely detected if present; SELECT only");
        var normalization = MonthlyDbNormalization.Plan(snapshot, true, "", CancellationToken.None);
        var irfanPlan = normalization.Operations.Where(issue => issue.Card == "00056" && issue.Day.Day == 25).ToArray();
        check((!hasExtra || irfanPlan.Any(issue => issue.Kind == "FAZLA TARAF" && issue.Time == "19:00")) && !irfanPlan.Any(issue => issue.Time is "08:23" or "18:51"), "REV21 live normalization preserves correct pair; synthetic test verifies extra deletion");
        if (normalization.Operations.Length > 0) MonthlyDbNormalization.Validate(snapshot, normalization.Operations);
        Console.WriteLine($"REV21_LIVE_NORMALIZATION_READONLY planned_operations={normalization.Operations.Length} normal_days={normalization.NormalDays.Count}");
        var generated = MonthlyDbAudit.Complete(snapshot,CompletionSettings.For(snapshot.WorkHours,false,true,true,false),"",CancellationToken.None);
        check(generated.All(issue=>!snapshot.LockedCards.Contains(issue.Card) && !snapshot.Excluded.Contains((issue.Card,issue.Day))), "REV21 live completion plan only; no DB writes");
        Console.WriteLine($"REV21_LIVE_READONLY completion_plan_sides={generated.Length} safe_cleanup_sides={snapshot.Issues.Count(issue=>issue.Safe)}");
        var mayFingerprint = snapshot.Fingerprint;
        request = request with { Start = new(2026,8,1), End = new(2026,9,1) };
        sync = Read();
        var august = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        check(new[] { "00002","00006","00008","00011","00059" }.All(august.LockedCards.Contains), "REV21 live historical August five-person lock recognized without changing trigger");
        check(!august.Issues.Any(issue=>issue.Safe && august.LockedCards.Contains(issue.Card)), "REV21 locked August cards never safe for DB writes");
        request = request with { Start = new(2026,5,1), End = new(2026,6,1) };
        sync = Read();
        check(MonthlyDbAudit.Read(database,sync,CancellationToken.None).Fingerprint==mayFingerprint, "REV21 live monthly DB metadata and movements unchanged after readonly tests");
    }
}
