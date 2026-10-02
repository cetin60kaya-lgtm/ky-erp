using System.Data;
using System.Diagnostics;
using System.Reflection;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class SeparatedWorkflowTests
{
    internal static void Run(Action<bool, string> check, string? liveDb, string? liveTnf)
    {
        var directory = Path.Combine("D:/Googledrive/KYERP-PDKS-MASAUSTU/08_TEST", "REV21_SEPARATED_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "SYNTHETIC.GDB");
        var options = PdksOptions.FromEnvironment() with { DatabasePath = dbPath, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey", DatabaseCharset = "UTF8" };
        var settings = new FbConnectionStringBuilder { Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort, UserID = options.DatabaseUser, Password = options.DatabasePassword, Charset = "UTF8", Dialect = 1 };
        FbConnection.CreateDatabase(settings.ToString());
        var database = new FirebirdDatabase(options);
        foreach (var sql in new[] {
            "create table DURUM (KOD varchar(20), AD varchar(100))",
            "create table KIMLIK (PKNO varchar(20), AD varchar(100), SOYAD varchar(100), IGTARIH date, ICTARIH date, DURUM varchar(20))",
            "create table GIRCIK (SIRA integer not null primary key,PKNO varchar(20),GTARIH date,GSAAT varchar(8),GDAKIKA integer,GTUR varchar(1),CTARIH date,CSAAT varchar(8),CDAKIKA integer,CTUR varchar(1),MKOD varchar(3))",
            "insert into DURUM values ('1','Çalışanlar')",
            "insert into DURUM values ('2','Ayrılanlar')",
            "insert into KIMLIK values ('00056','TEST','NORMAL','2026-10-01',null,'1')",
            "insert into KIMLIK values ('00053','TEST','PASIF','2025-01-01','2025-07-02','2')",
            "insert into GIRCIK values (1,'00056','2026-09-01','08:20',500,'','2026-09-01','18:55',1135,'','000')",
            "insert into GIRCIK values (2,'00056','2026-09-01','08:30',510,'','2026-09-01','18:55',1135,'','000')",
            "insert into GIRCIK values (3,'00056','2026-09-02','07:20',440,'','2026-09-02','20:10',1210,'','000')",
            "insert into GIRCIK values (4,'00056','2026-09-03','08:25',505,'',null,null,null,null,'000')",
            "insert into GIRCIK values (5,'00056','2026-09-04','18:56',1136,'','2026-09-04','08:33',513,'','000')",
            "insert into GIRCIK values (6,'00056','2026-09-07','08:23',503,'','2026-09-07','18:51',1131,'','000')",
            "insert into GIRCIK values (7,'00056','2026-09-07','19:00',1140,'',null,null,null,null,'000')",
            "insert into GIRCIK values (8,'00056','2026-08-31','08:28',508,'','2026-09-08','18:40',1120,'','000')",
            "insert into GIRCIK values (9,'00056','2026-09-09','08:25',505,'E',null,null,null,null,'000')" }) database.Execute(sql);
        var days = Enumerable.Range(0, 30).Select(offset => new DateTime(2026, 9, 1).AddDays(offset)).Where(day => day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)).ToArray();
        var snapshot = DbRecordService.Read(database, ["00056", "00053"], days, CancellationToken.None);
        check(snapshot.Plan.Length == 44, "DB KAYIT September two persons 22 explicitly selected weekdays; no hire/passive blocking");
        var first = snapshot.Plan.Single(plan => plan.Card == "00056" && plan.Day.Day == 1);
        check(first.Entry == "08:30" && first.Exit == "18:55" && first.ExitId == 1, "DB KAYIT best entry and first exact duplicate keeper");
        check(snapshot.Plan.Single(plan => plan.Card == "00056" && plan.Day.Day == 3).Entry == "08:25", "DB KAYIT single entry preserved; exit generated only");
        var wrong = snapshot.Plan.Single(plan => plan.Card == "00056" && plan.Day.Day == 4);
        check(wrong.Entry == "08:33" && wrong.Exit == "18:56", "DB KAYIT wrong sides corrected without changing in-band clocks");
        var irfan = snapshot.Plan.Single(plan => plan.Card == "00056" && plan.Day.Day == 7);
        check(irfan.Entry == "08:23" && irfan.Exit == "18:51" && irfan.Operation.Contains("SİLİNECEK"), "DB KAYIT extra 19:00 entry removed; correct pair retained");
        check(snapshot.Plan.All(plan => MonthlyDbNormalization.InRange("Giriş", plan.Entry) && MonthlyDbNormalization.InRange("Çıkış", plan.Exit)), "DB KAYIT generated and corrected clocks all within inclusive bands");
        var absent = snapshot.Plan.Where(plan => plan.Card == "00053").ToArray();
        check(absent.Zip(absent.Skip(1)).All(pair => pair.First.Entry != pair.Second.Entry && pair.First.Exit != pair.Second.Exit), "DB KAYIT natural generated clocks do not repeat on consecutive selected days");
        var malicious = snapshot with { Plan = snapshot.Plan.Select((plan, index) => index == 0 ? plan with { EntryId = 98765 } : plan).ToArray() };
        try { DbRecordService.ApplyAsync(database, malicious, CancellationToken.None).GetAwaiter().GetResult(); check(false, "tampered plan rejected"); }
        catch (InvalidOperationException) { check(true, "DB KAYIT tampered keeper ID rejected before backup/write"); }
        var backup = DbRecordService.ApplyAsync(database, snapshot, CancellationToken.None).GetAwaiter().GetResult();
        var after = DbRecordService.Read(database, snapshot.Cards, days, CancellationToken.None);
        DbRecordService.Verify(snapshot, after);
        check(File.Exists(backup) && after.Plan.All(plan => plan.Operation == "UYUMLU"), "DB KAYIT gbak transaction committed; every selected day exactly one entry and exit; duplicates zero");
        check(database.Query("select GSAAT from GIRCIK where SIRA=8").Rows[0].Field<string>("GSAAT") == "08:28", "DB KAYIT unselected outside-month opposite side preserved");
        var weekend = DbRecordService.Read(database, ["00053"], [new DateTime(2026, 9, 5)], CancellationToken.None);
        DbRecordService.ApplyAsync(database, weekend, CancellationToken.None).GetAwaiter().GetResult();
        check(DbRecordService.Read(database, weekend.Cards, weekend.Days, CancellationToken.None).Plan[0].Operation == "UYUMLU", "DB KAYIT explicitly selected weekend allowed");
        database.Execute("create exception TEST_FAIL 'synthetic rollback'");
        database.Execute("create trigger TEST_ROLLBACK for GIRCIK active before insert position 0 as begin if (new.GTARIH is null) then exception TEST_FAIL; end");
        var blocked = DbRecordService.Read(database, ["00053"], [new DateTime(2026, 10, 2)], CancellationToken.None);
        try { DbRecordService.ApplyAsync(database, blocked, CancellationToken.None).GetAwaiter().GetResult(); check(false, "rollback expected"); }
        catch (FbException) { check(DbRecordService.Read(database, blocked.Cards, blocked.Days, CancellationToken.None).Fingerprint == blocked.Fingerprint, "DB KAYIT trigger failure rolls back entire transaction"); }
        database.Execute("drop trigger TEST_ROLLBACK");
        var tnfPath = Path.Combine(directory, "TR2026.Tnf");
        File.WriteAllText(tnfPath, "00056,08:20,010926,1,001\n00056,08:30,010926,1,001\n00056,08:30,010926,1,001\n00056,18:55,010926,1,001\n00999,09:00,010926,1,001\n");
        var coordinatedDay = new DateTime(2026, 10, 12);
        var coordinated = DbRecordService.Read(database, ["00053"], [coordinatedDay], CancellationToken.None);
        DbRecordService.ApplyAsync(database, coordinated, tnfPath, CancellationToken.None).GetAwaiter().GetResult();
        var coordinatedAfter = DbRecordService.Read(database, ["00053"], [coordinatedDay], CancellationToken.None);
        var coordinatedLines = File.ReadAllLines(tnfPath);
        check(coordinatedAfter.Plan.Single().Operation == "UYUMLU" && coordinatedLines.Count(line => line.StartsWith("00053,") && line.Contains(",121026,1,001")) == 2, "DB KAYIT one apply updates DB and main TNF together");
        check(coordinatedLines.Contains("00999,09:00,010926,1,001"), "DB KAYIT coordinated TNF preserves unrelated lines");
        var bytes = File.ReadAllBytes(tnfPath);
        var request = new AuditRequest(tnfPath, new(2026, 9, 1), new(2026, 10, 1), "", new(), true);
        var sync = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        check(sync.Table.AsEnumerable().All(row => row.Field<string>("İşlem") != "İNCELE"), "TNF DÜZENLE duplicate TNF never REVIEW after prepared DB");
        var operations = sync.Table.AsEnumerable().Where(SyncEngine.SafeOperation).ToArray();
        var outputs = SyncEngine.ApplyAsync(database, sync, operations, CancellationToken.None).GetAwaiter().GetResult();
        var final = SyncEngine.ReadAsync(database, request with { Path = outputs.CorrectedPath }, CancellationToken.None).GetAwaiter().GetResult();
        check(final.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK") && outputs.MissingPath == "", "TNF DÜZENLE global month duplicates/surplus removed and all missing added to one exact output");
        check(File.ReadAllBytes(tnfPath).SequenceEqual(bytes) && final.DbHash == sync.DbHash, "TNF DÜZENLE original TNF and DB unchanged");
        check(File.ReadAllLines(outputs.CorrectedPath).Distinct().Count() == File.ReadAllLines(outputs.CorrectedPath).Length, "TNF DÜZENLE zero duplicate output lines");
        var noChanges = SyncEngine.ApplyAsync(database, final, [], CancellationToken.None).GetAwaiter().GetResult();
        check(File.Exists(noChanges.CorrectedPath), "TNF DÜZENLE already-compatible source still exports corrected copy");
        database.Execute("update GIRCIK set GTUR='E' where PKNO='00056' and GTARIH='2026-09-01'");
        var eSync = SyncEngine.ReadAsync(database, request with { Path = outputs.CorrectedPath }, CancellationToken.None).GetAwaiter().GetResult();
        check(eSync.Table.AsEnumerable().Count(row => row.Field<string>("İşlem") == "TNF SİL E") == 1, "TNF DÜZENLE E present removes TNF; not missing");
        var eOutput = SyncEngine.ApplyAsync(database, eSync, eSync.Table.AsEnumerable().Where(SyncEngine.SafeOperation).ToArray(), CancellationToken.None).GetAwaiter().GetResult();
        var eFinal = SyncEngine.ReadAsync(database, request with { Path = eOutput.CorrectedPath }, CancellationToken.None).GetAwaiter().GetResult();
        check(eFinal.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"), "TNF DÜZENLE E absent compatible; no missing E generated");
        var stale = DbRecordService.Read(database, ["00053"], [new DateTime(2026, 10, 5)], CancellationToken.None);
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values (9999,'00053','2026-10-05','08:33',513,'','000')");
        var changed = DbRecordService.Read(database, stale.Cards, stale.Days, CancellationToken.None).Fingerprint;
        try { DbRecordService.ApplyAsync(database, stale, CancellationToken.None).GetAwaiter().GetResult(); check(false, "stale rejected"); }
        catch (InvalidOperationException) { check(DbRecordService.Read(database, stale.Cards, stale.Days, CancellationToken.None).Fingerprint == changed, "DB KAYIT stale preview rejected without modifying intervening record"); }
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD) values (10000,'00053','2026-09-30','08:26',506,'','2026-10-06','08:27',507,'','000')");
        var crossDate = DbRecordService.Read(database, ["00053"], [new DateTime(2026, 10, 6)], CancellationToken.None);
        DbRecordService.ApplyAsync(database, crossDate, CancellationToken.None).GetAwaiter().GetResult();
        check(DbRecordService.Read(database, crossDate.Cards, crossDate.Days, CancellationToken.None).Plan[0].Operation == "UYUMLU" && database.Query("select GSAAT from GIRCIK where SIRA=10000").Rows[0].Field<string>("GSAAT") == "08:26", "DB KAYIT wrong side with other date outside scope relocates safely; outside side unchanged");
        var mismatch = SyncEngine.ReadAsync(database, request with { Path = eOutput.CorrectedPath }, CancellationToken.None).GetAwaiter().GetResult();
        var firstLine = mismatch.Lines.First(line => line.StartsWith("00053,") && line.Substring(12, 6) == "010926");
        var time = firstLine.Substring(6, 5);
        var shifted = firstLine.Remove(6, 5).Insert(6, time == "08:15" ? "08:16" : "08:15");
        File.WriteAllLines(tnfPath, mismatch.Lines.Select(line => line == firstLine ? shifted : line));
        var clockMismatch = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        check(clockMismatch.Table.AsEnumerable().Any(row => row.Field<string>("İşlem") == "TNF DÜZELT"), "TNF DÜZENLE unique clock mismatch directly corrected to exact DB minute");
        RunUi(database, check);
        RunOperationTests(database, check);
        RunComparisonUi(database, tnfPath, directory, check);
        if (liveDb is not null && liveTnf is not null)
        {
            var live = new FirebirdDatabase(options with { DatabasePath = liveDb });
            var fingerprint = DbRecordService.Read(live, ["00056", "00053"], days, CancellationToken.None).Fingerprint;
            var livePeople = DbRecordService.ReadPeople(live, CancellationToken.None);
            check(livePeople.Any(person => person.Card == "00056") && livePeople.Any(person => person.Card == "00053"), "LIVE READ ONLY DB and E personnel include 00056 and 00053");
            var liveResult = SyncEngine.ReadAsync(live, request with { Path = liveTnf }, CancellationToken.None).GetAwaiter().GetResult();
            Console.WriteLine($"REV21_EXACT_LIVE_READONLY db_ms={liveResult.DbMilliseconds} tnf_ms={liveResult.TnfMilliseconds} compare_ms={liveResult.CompareMilliseconds} rows={liveResult.Table.Rows.Count}");
            check(DbRecordService.Read(live, ["00056", "00053"], days, CancellationToken.None).Fingerprint == fingerprint, "LIVE READ ONLY selected DB records unchanged; no write test");
            RunComparisonUi(live, liveTnf, directory, check);
        }
    }

    sealed class ProbeForm : Form
    {
        readonly FirebirdDatabase db;
        readonly TextBox tnfPath;
        readonly TextBox dbPath = new();
        internal ProbeForm(FirebirdDatabase database, string path) { db = database; tnfPath = new() { Text = path }; Size = new(1600, 1000); StartPosition = FormStartPosition.Manual; Location = new(-30000, -30000); ShowInTaskbar = false; }
    }

    static void RunComparisonUi(FirebirdDatabase database, string path, string directory, Action<bool, string> check)
    {
        using var owner = new ProbeForm(database, path);
        using var control = new DbTnfSyncControl(owner, true);
        owner.Controls.Add(control);
        var timer = Stopwatch.StartNew();
        long last = 0, maximum = 0;
        using var heartbeat = new System.Windows.Forms.Timer { Interval = 25 };
        heartbeat.Tick += (_, _) => { maximum = Math.Max(maximum, timer.ElapsedMilliseconds - last); last = timer.ElapsedMilliseconds; };
        heartbeat.Start();
        Exception? failure = null;
        owner.Shown += async (_, _) =>
        {
            try
            {
                ((ComboBox)typeof(DbTnfSyncControl).GetField("month", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!).SelectedIndex = 9;
                await control.RunAuditAsync(false);
                maximum = Math.Max(maximum, timer.ElapsedMilliseconds - last);
                var dbGrid = (DataGridView)typeof(DbTnfSyncControl).GetField("dbGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
                var tnfGrid = (DataGridView)typeof(DbTnfSyncControl).GetField("tnfGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
                check(control.LastSnapshot?.Request.Exact == true && dbGrid.DataSource is BindingSource dbSource && tnfGrid.DataSource is BindingSource tnfSource && ReferenceEquals(dbSource.DataSource, tnfSource.DataSource), "TNF DÜZENLE actual mode SELECT-only audit uses identical aligned PairView binding");
                check(maximum < 2000, "TNF DÜZENLE actual-mode UI heartbeat below two seconds");
                Console.WriteLine($"REV21_SEPARATE_UI grid_bind_ms={control.LastGridMilliseconds} total_ms={control.LastTotalMilliseconds} max_heartbeat_gap_ms={maximum}");
                using var image = new System.Drawing.Bitmap(owner.Width, owner.Height);
                owner.DrawToBitmap(image, new(0, 0, owner.Width, owner.Height));
                image.Save(Path.Combine(directory, "TNF_SEPARATE_UI_" + Guid.NewGuid().ToString("N") + ".png"));
            }
            catch (Exception exception) { failure = exception; }
            finally { owner.Close(); }
        };
        Application.Run(owner);
        if (failure is not null) throw new InvalidOperationException("TNF separated UI failed", failure);
    }

    static void RunUi(FirebirdDatabase database, Action<bool, string> check)
    {
        using var main = new MainForm();
        object Field(object target, string name) => target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(target)!;
        typeof(MainForm).GetField("db", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(main, database);
        void Wait(Task task) { while (!task.IsCompleted) { Application.DoEvents(); Thread.Sleep(5); } task.GetAwaiter().GetResult(); }
        Wait(main.LoadEPeopleAsync());
        var list = (CheckedListBox)Field(main, "ePeopleList");
        check(list.Items.Count == 2 && list.Items.Cast<string>().Any(person => person.StartsWith("00053")), "E UI personnel populated including passive DB person");
        for (var index = 0; index < list.Items.Count; index++) list.SetItemChecked(index, list.Items[index].ToString()!.StartsWith("00056"));
        ((DateTimePicker)Field(main, "eEnd")).Value = new DateTime(2026, 9, 8);
        ((DateTimePicker)Field(main, "eStart")).Value = new DateTime(2026, 9, 8);
        ((ComboBox)Field(main, "eSide")).SelectedIndex = 1;
        var eDays = (CheckedListBox)Field(main, "eDayList");
        for (var index = 0; index < eDays.Items.Count; index++) eDays.SetItemChecked(index, true);
        var ePreview = (DataTable)typeof(MainForm).GetMethod("BuildBulkEPreview", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(main, null)!;
        check(ePreview.Rows.Count == 1 && ePreview.Rows[0].Field<string>("Tarih") == "08.09.2026" && ePreview.Rows[0].Field<string>("Taraf") == "Çıkış", "E preview exit-only period uses CTARIH, not other-month entry date");
        using var control = new DbRecordControl(main);
        Wait(control.LoadPeopleAsync());
        check(control.PersonCount == 2, "DB KAYIT UI personnel list populated");
        var operation = (ComboBox)Field(control, "operation");
        check(operation.Items.Cast<string>().SequenceEqual(new[] { "Giriş Ekle", "Çıkış Ekle", "Giriş + Çıkış Ekle", "Saat Düzelt", "Mükerrer Temizle", "Fazla Kayıt Temizle" }) &&
            ((DataGridView)Field(control, "preview")).Columns.Count == 7, "DB KAYIT only six operations and seven preview columns");
        var days = (CheckedListBox)Field(control, "days");
        check(days.CheckedItems.Count < days.Items.Count && days.CheckedItems.Count > 0, "DB KAYIT UI weekends initially unchecked; weekdays checked");
        using var tnf = new DbTnfSyncControl(main, true);
        IEnumerable<Control> Descendants(Control root) => root.Controls.Cast<Control>().SelectMany(child => Descendants(child).Prepend(child));
        var buttons = Descendants(tnf).OfType<Button>().Select(button => button.Text).ToArray();
        check(buttons.Contains("TNF'Yİ DB'YE GÖRE DÜZELT") && !buttons.Any(text => text.Contains("DB GÜVENLİ") || text.Contains("DB EKSİK")), "TNF UI separated; no DB write buttons reachable");
    }

    static void RunOperationTests(FirebirdDatabase database, Action<bool, string> check)
    {
        foreach (var sql in new[] {
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,CTARIH,CSAAT,MKOD) values (11001,'00056','2026-11-02','08:25','2026-11-02','18:55','000')",
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,MKOD) values (11002,'00056','2026-11-02','08:30','000')",
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,MKOD) values (11003,'00056','2026-11-03','07:20','000')",
            "insert into GIRCIK (SIRA,PKNO,CTARIH,CSAAT,MKOD) values (11004,'00056','2026-11-04','20:10','000')",
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,CTARIH,CSAAT,MKOD) values (11005,'00056','2026-11-05','18:55','2026-11-05','08:33','000')",
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GTUR,MKOD) values (11006,'00056','2026-11-06','08:30','E','000')",
            "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,CTARIH,CSAAT,MKOD) values (11007,'00056','2026-11-09','08:22','2026-12-01','18:54','000')" }) database.Execute(sql);
        var entryDay = new DateTime(2026, 11, 4);
        var exitDay = new DateTime(2026, 11, 3);
        DbRecordSnapshot Read(DbRecordMode mode, params DateTime[] days) => DbRecordService.Read(database, ["00056"], days, CancellationToken.None, mode: mode);
        void Apply(DbRecordSnapshot snapshot)
        {
            DbRecordService.ApplyAsync(database, snapshot, CancellationToken.None).GetAwaiter().GetResult();
            check(Read(snapshot.Mode, snapshot.Days).Changes.Length == 0, $"DB KAYIT {snapshot.Mode} recheck has no further changes");
        }
        var addEntry = Read(DbRecordMode.AddEntry, entryDay);
        check(addEntry.Changes.Length == 1 && addEntry.Changes[0].Side == "Giriş" && addEntry.Changes[0].Operation == "EKLE", "entry-only preview changes missing side");
        Apply(addEntry);
        check(database.Query("select CSAAT from GIRCIK where SIRA=11004").Rows[0].Field<string>("CSAAT") == "20:10", "entry-only retains real exit clock");
        var addExit = Read(DbRecordMode.AddExit, exitDay);
        check(addExit.Changes.Length == 1 && addExit.Changes[0].Side == "Çıkış", "exit-only preview changes missing side");
        Apply(addExit);
        check(database.Query("select GSAAT from GIRCIK where SIRA=11003").Rows[0].Field<string>("GSAAT") == "07:20", "exit-only retains real entry clock");
        var emptyDay = new DateTime(2026, 11, 7);
        var addBoth = Read(DbRecordMode.AddBoth, emptyDay);
        check(addBoth.Changes.Length == 2 && addBoth.Changes.All(change => change.Operation == "EKLE"), "manually selected weekend can preview both missing sides");
        Apply(addBoth);
        check(Read(DbRecordMode.AddBoth, new DateTime(2026, 11, 6)).Changes.Length == 1 &&
            Read(DbRecordMode.AddEntry, new DateTime(2026, 11, 6)).Changes.Length == 0, "E entry remains protected from normal entry creation");
        var fix = Read(DbRecordMode.CorrectTime, exitDay, entryDay, new DateTime(2026, 11, 5));
        check(fix.Changes.Any(change => change.ExistingTime == "07:20" && change.Side == "Giriş") &&
            fix.Changes.Any(change => change.ExistingTime == "20:10" && change.Side == "Çıkış") &&
            fix.Changes.Count(change => change.Day.Day == 5) == 2, "clock correction previews out-of-range clocks and reversed sides");
        Apply(fix);
        var duplicateDay = new DateTime(2026, 11, 2);
        var duplicates = Read(DbRecordMode.RemoveDuplicates, duplicateDay);
        check(duplicates.Changes.Length == 1 && duplicates.Changes[0].Operation == "SİL", "duplicate cleanup previews only surplus entry");
        Apply(duplicates);
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,MKOD) values (12000,'00056','2026-11-02','19:00','000')");
        var extra = Read(DbRecordMode.RemoveExtra, duplicateDay);
        check(extra.Changes.Length == 1 && extra.Changes[0].ExistingTime == "19:00", "surplus cleanup preserves best entry");
        Apply(extra);
        check(database.Query("select CSAAT from GIRCIK where SIRA=11007").Rows[0].Field<string>("CSAAT") == "18:54", "out-of-range opposite date side remains unchanged");
        var stale = Read(DbRecordMode.AddBoth, new DateTime(2026, 11, 10));
        database.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,MKOD) values (13000,'00056','2026-11-10','08:31','000')");
        try { DbRecordService.ApplyAsync(database, stale, CancellationToken.None).GetAwaiter().GetResult(); check(false, "operation stale preview must fail"); }
        catch (InvalidOperationException) { check(Read(DbRecordMode.AddBoth, new DateTime(2026, 11, 10)).Changes.Length == 1, "operation stale preview rejected without writes"); }
    }
}
