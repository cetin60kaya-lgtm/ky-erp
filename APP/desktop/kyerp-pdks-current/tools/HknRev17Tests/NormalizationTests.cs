using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class NormalizationTests
{
    internal static void Run(Action<bool, string> check)
    {
        var directory = Path.Combine(@"D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST", "REV21_NORMALIZE_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "SYNTHETIC.GDB");
        var tnfPath = Path.Combine(directory, "TR2026.Tnf");
        var options = PdksOptions.FromEnvironment() with { DatabasePath = dbPath, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey", DatabaseCharset = "UTF8" };
        var connectionSettings = new FbConnectionStringBuilder { Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort, UserID = options.DatabaseUser, Password = options.DatabasePassword, Charset = "UTF8", Dialect = 1 };
        FbConnection.CreateDatabase(connectionSettings.ToString());
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
            "insert into KIMLIK values ('00056','SENTETIK','NORMAL','1','2026-05-01',null,'1')",
            "insert into GIRCIK values (1,'00056','2026-05-25','08:23',503,'','2026-05-25','18:51',1131,'','000')",
            "insert into GIRCIK values (2,'00056','2026-05-25','19:00',1140,'',null,null,null,null,'000')",
            "insert into GIRCIK values (3,'00056','2026-05-04','08:30',510,'','2026-05-04','19:00',1140,'','000')",
            "insert into GIRCIK values (4,'00056','2026-05-04','08:30',510,'',null,null,null,null,'000')",
            "insert into GIRCIK values (5,'00056','2026-05-05','08:25',505,'',null,null,null,null,'000')",
            "insert into GIRCIK values (6,'00056','2026-05-06','08:25',505,'E',null,null,null,null,'000')",
            "insert into GIRCIK values (7,'00056','2026-05-07','18:56',1136,'','2026-05-07','08:33',513,'','000')",
            "insert into GIRCIK values (8,'00056','2026-05-08','08:50',530,'N','2026-05-08','18:10',1090,'N','000')",
            "insert into GIRCIK values (9,'00056','2026-05-12','08:20',500,'','2026-05-12','18:55',1135,'','000')",
            "insert into GIRCIK values (10,'00056','2026-05-12','08:32',512,'',null,null,null,null,'000')",
            "insert into GIRCIK values (11,'00056','2026-05-13','08:20',500,'','2026-05-13','12:00',720,'','000')",
            "insert into GIRCIK values (12,'00056','2026-05-13','13:00',780,'','2026-05-13','19:00',1140,'','000')",
            "insert into GIRCIK values (13,'00056','2026-05-14','08:25',505,'',null,null,null,null,'000')",
            "insert into GIRCIK values (14,'00056','2026-04-30','08:50',530,'','2026-05-15','18:20',1100,'','000')",
            "insert into OZELIZIN values ('00056','2026-05-14')",
            "insert into PERTIMESHIFT values ('00056','2026-05-13','2026-05-13')" }) database.Execute(sql);
        for (var day = new DateTime(2026, 5, 1); day < new DateTime(2026, 6, 1); day = day.AddDays(1))
            database.Execute("insert into PLANA values (@DAY,'1','1')", new FbParameter("@DAY", day));
        File.WriteAllText(tnfPath, "00056,08:30,040526,1,001\n00056,08:30,040526,1,001\n00056,08:25,060526,1,001\n00056,19:00,250526,1,001\n00999,09:00,040526,1,001\n00056,09:00,010426,1,001\nBROKEN\n");
        var original = File.ReadAllBytes(tnfPath);
        var request = new AuditRequest(tnfPath, new(2026, 5, 1), new(2026, 6, 1), "", new());
        AuditSnapshot Read() => SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        var sync = Read();
        var snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var plan = MonthlyDbNormalization.Plan(snapshot, true, "", CancellationToken.None);
        check(plan.Operations.Any(operation => operation.Id == 2 && operation.Kind == "FAZLA TARAF") && !plan.Operations.Any(operation => operation.Id == 1), "REV21 normalize Irfan removes 19:00, retains 08:23/18:51");
        check(plan.Operations.Any(operation => operation.Id == 4 && operation.Kind == "MÜKERRER") && !plan.Operations.Any(operation => operation.Id == 3), "REV21 normalize exact duplicate keeps first SIRA");
        check(plan.Operations.Any(operation => operation.Day.Day == 5 && operation.Kind == "EKLE" && operation.Side == "Çıkış") && !plan.Operations.Any(operation => operation.Id == 5), "REV21 normalize retains 08:25 and generates exit only");
        check(plan.Operations.Count(operation => operation.Id == 7 && operation.Kind == "TARAF DÜZELT") == 2 && plan.Operations.Where(operation => operation.Id == 7).All(operation => operation.NewTime == operation.Time), "REV21 normalize swaps incorrect sides without changing valid clocks");
        check(plan.Operations.Count(operation => operation.Id == 8 && operation.Kind == "SAAT DÜZELT") == 2, "REV21 normalize explicitly adjusts real out-of-range clocks");
        check(plan.Operations.Any(operation => operation.Id == 9 && operation.Side == "Giriş" && operation.Kind == "FAZLA TARAF") && !plan.Operations.Any(operation => operation.Id == 10), "REV21 normalize selects closest in-band entry 08:32");
        check(plan.Operations.Count(operation => operation.Day.Day == 11 && operation.Kind == "EKLE") == 2, "REV21 normalize absent normal weekday receives pair under cleanup consent");
        check(!plan.Operations.Any(operation => operation.Day.Day is 6 or 13 or 14 or 19 || operation.Day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday), "REV21 normalize E shift leave holiday weekend never produce pairs");
        check(!snapshot.Issues.Any(issue => issue.Day.Day == 6 && issue.Kind.StartsWith("EKSİK")), "REV21 E day missing counter remains zero");
        check(plan.Operations.Where(operation => operation.Kind == "EKLE" || MonthlyDbNormalization.IsReplacement(operation)).All(operation => MonthlyDbNormalization.InRange(operation.Kind == "EKLE" ? operation.Side : operation.NewSide, operation.Kind == "EKLE" ? operation.Time : operation.NewTime)), "REV21 all generated and adjusted clocks obey exact ranges");
        var generated = plan.Operations.Where(operation => operation.Kind == "EKLE").GroupBy(operation => operation.Side).ToArray();
        check(generated.All(group => group.Select(operation => operation.Time).Distinct().Count() > 1 && group.Zip(group.Skip(1)).All(pair => pair.First.Time != pair.Second.Time)), "REV21 natural distribution avoids repeated consecutive generated minutes");
        MonthlyDbNormalization.Validate(snapshot, plan.Operations);
        bool Rejected(MonthlyIssue[] operations)
        {
            try { MonthlyDbWriter.ValidatePlan(snapshot, operations, true); return false; }
            catch (InvalidOperationException) { return true; }
        }
        var partial = plan.Operations.Where(operation => operation.Day.Day == 11).Take(1).ToArray();
        check(Rejected(partial), "REV21 partial day normalization rejected before backup/write");
        var tampered = plan.Operations.Select(operation => operation.Day.Day == 11 && operation.Side == "Giriş" ? operation with { Time = "08:50" } : operation).ToArray();
        check(Rejected(tampered), "REV21 tampered generation range rejected");
        var locked = snapshot with { LockedCards = ["00056"] };
        check(MonthlyDbNormalization.Plan(locked, true, "", CancellationToken.None).Operations.Length == 0, "REV21 locked personnel unchanged");
        var rehire = snapshot with { People = new() { ["00056"] = new("00056", "fixture", new(2026,5,18), new(2025,7,2), true) } };
        check(MonthlyDbNormalization.Plan(rehire, true, "", CancellationToken.None).Operations.Where(operation => operation.Kind == "EKLE").All(operation => operation.Day >= new DateTime(2026,5,18)), "REV21 rehire gap never generates attendance");
        check(MonthlyDbNormalization.Plan(snapshot, true, "00999", CancellationToken.None).Operations.Length == 0, "REV21 selected personnel cannot affect another card");
        database.Execute("alter table GIRCIK add constraint NORM_FAILURE check (GTARIH <> '2026-05-11')");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var before = snapshot.Fingerprint;
        var failed = false;
        try { SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot, plan.Operations, CancellationToken.None, true).GetAwaiter().GetResult(); }
        catch (FbException) { failed = true; }
        check(failed && MonthlyDbAudit.Read(database, Read(), CancellationToken.None).Fingerprint == before, "REV21 real midbatch constraint failure rolls back deletion correction and generation together");
        check(original.SequenceEqual(File.ReadAllBytes(tnfPath)) && !File.Exists(Path.Combine(directory,"TR2026_DUZELTILMIS.Tnf")), "REV21 rollback does not publish staged TNF or overwrite original");
        database.Execute("alter table GIRCIK drop constraint NORM_FAILURE");
        sync = Read();
        snapshot = MonthlyDbAudit.Read(database, sync, CancellationToken.None);
        var result = SyncEngine.CompleteDbAndTnfAsync(database, sync, snapshot, plan.Operations, CancellationToken.None, true).GetAwaiter().GetResult();
        check(File.Exists(result.Backup) && new FileInfo(result.Backup).Length > 0 && File.Exists(result.Backup + ".rows.json"), "REV21 normalization actual gbak and full before-row dump created");
        check(original.SequenceEqual(File.ReadAllBytes(tnfPath)) && Directory.GetFiles(Path.Combine(directory,"_YEDEK"),"*.Tnf").Length > 0, "REV21 normalization preserves original and backs up TNF before publication");
        var actual = MonthlyDbAudit.Read(database, Read(), CancellationToken.None);
        var movements = MonthlyDbAudit.Movements(actual.Records, request);
        MonthlyDbNormalization.VerifyResult(snapshot, plan.Operations, movements);
        check(movements.Where(movement => movement.Id == 8).All(movement => movement.Tur == "N"), "REV21 clock correction preserves original non-E movement type");
        var normalized = movements.Where(movement => plan.NormalDays.Contains((movement.Card,movement.Date))).GroupBy(movement => (movement.Card,movement.Date)).ToArray();
        check(normalized.All(group => group.Count() == 2 && group.Count(movement => movement.Side == "Giriş") == 1 && group.Count(movement => movement.Side == "Çıkış") == 1 && group.All(movement => MonthlyDbNormalization.InRange(movement.Side,movement.Time))), "REV21 actual DB every eligible normal day has exactly one entry and one exit");
        check(Convert.ToString(database.Scalar("select GSAAT from GIRCIK where SIRA=14"))!.Trim() == "08:50" && Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA in (11,12)")) == 2, "REV21 opposite out-of-month side and explicit genuine shift preserved");
        var corrected = File.ReadAllLines(result.Outputs.CorrectedPath);
        var missing = File.ReadAllLines(result.Outputs.MissingPath);
        var touched = plan.Operations.Select(operation => (operation.Card,operation.Day)).ToHashSet();
        var expectedLines = movements.Where(movement => touched.Contains((movement.Card,movement.Date)) && movement.Tur != "E").Select(movement => request.Format.Build(movement.Card,movement.Date,movement.Time)).ToHashSet(StringComparer.Ordinal);
        check(expectedLines.All(line => corrected.Count(candidate => candidate == line) == 1 && !missing.Contains(line)), "REV21 corrected TNF contains identical committed DB clocks once, not duplicated in missing output");
        check(!corrected.Contains("00056,08:25,060526,1,001") && !missing.Contains("00056,08:25,060526,1,001") && corrected.Contains("BROKEN") && corrected.Contains("00056,09:00,010426,1,001"), "REV21 E TNF removed, malformed line and outside month preserved");
        var verification = SyncEngine.ReadAsync(database, request with { Path = result.Outputs.CorrectedPath }, CancellationToken.None).GetAwaiter().GetResult();
        check(!verification.Table.AsEnumerable().Any(row => row.Field<string>("Kart No") == "00056" && touched.Contains(("00056",DateTime.ParseExact(row.Field<string>("Tarih")!,"dd.MM.yyyy",System.Globalization.CultureInfo.InvariantCulture))) && SyncEngine.SafeOperation(row)), "REV21 normalized days reread DB/TNF has no safe mismatch");
        check(MonthlyDbNormalization.Plan(actual, true, "", CancellationToken.None).Operations.Length == 0, "REV21 repeated normalization idempotent, no clock churn");
        check(!actual.Issues.Any(issue => plan.NormalDays.Contains((issue.Card,issue.Day)) && issue.Kind is "MÜKERRER" or "FAZLA TARAF" or "EKSİK GİRİŞ" or "EKSİK ÇIKIŞ" or "HİÇ BASMAMIŞ"), "REV21 monthly counters recalculated after cleanup");
        Console.WriteLine($"REV21_NORMALIZATION_WRITES_PASSED operations={plan.Operations.Length} normal_days={plan.NormalDays.Count} tnf_exact_lines={expectedLines.Count}");
    }
}
