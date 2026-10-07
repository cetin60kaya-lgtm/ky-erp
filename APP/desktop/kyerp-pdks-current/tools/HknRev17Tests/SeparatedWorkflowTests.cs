using System.Data;
using System.Reflection;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class SeparatedWorkflowTests
{
    internal static void Run(Action<bool,string> check, string? liveDb, string? liveTnf)
    {
        var directory = Path.Combine("D:/Googledrive/KYERP-PDKS-MASAUSTU/08_TEST", "REV25_CORE_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "CORE.GDB");
        var options = PdksOptions.FromEnvironment() with
        {
            DatabasePath = dbPath,
            DatabaseUser = "SYSDBA",
            DatabasePassword = "masterkey",
            DatabaseCharset = "UTF8"
        };
        var cs = new FbConnectionStringBuilder
        {
            Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort,
            UserID = options.DatabaseUser, Password = options.DatabasePassword,
            Dialect = 1, Charset = "UTF8", Pooling = false
        }.ToString();
        FbConnection.CreateDatabase(cs);
        var db = new FirebirdDatabase(options);

        foreach (var sql in new[]
        {
            "create table DURUM(KOD varchar(20),AD varchar(100))",
            "create table KIMLIK(PKNO varchar(5),AD varchar(50),SOYAD varchar(50),IGTARIH date,ICTARIH date,DURUM varchar(20))",
            @"create table GIRCIK(
                SIRA integer not null primary key, PKNO varchar(5),
                GTARIH date,GSAAT varchar(8),GDAKIKA integer,GTUR varchar(1),
                CTARIH date,CSAAT varchar(8),CDAKIKA integer,CTUR varchar(1),MKOD varchar(3))",
            @"create table PUANBILGI(
                AD varchar(40),IGIRISS varchar(8),EGTOL varchar(8),GGTOL varchar(8),
                DCIKISS varchar(8),ECTOL varchar(8),GCTOL varchar(8),GDSAAT varchar(8),
                GUNBIT varchar(8),BASLAMAS1 varchar(8),BITISS1 varchar(8),MAKSURE1 varchar(8))",
            "insert into DURUM values('1','Çalışanlar')",
            "insert into KIMLIK values('00056','TEST','PERSONEL','2025-01-01',null,'1')",
            "insert into PUANBILGI values('HAFTAICI','510','500','515','1140','1130','1145','420','1860','510','1140','450')",
            "insert into GIRCIK values(1,'00056','2026-11-02','08:25',505,'','2026-11-02','18:55',1135,'','000')",
            "insert into GIRCIK values(2,'00056','2026-11-02','08:30',510,'',null,null,null,null,'000')",
            "insert into GIRCIK values(3,'00056','2026-11-03','07:20',440,'',null,null,null,null,'000')",
            "insert into GIRCIK values(4,'00056',null,null,null,null,'2026-11-04','20:10',1210,'','000')",
            "insert into GIRCIK values(5,'00056','2026-11-05','18:55',1135,'','2026-11-05','08:33',513,'','000')",
            "insert into GIRCIK values(6,'00056','2026-11-06','08:30',510,'E',null,null,null,null,'000')"
        }) db.Execute(sql);

        var policy = WorkTimePolicy.Read(db, CancellationToken.None);
        check(policy.FromDatabase && policy.EntryEarly == 500 && policy.EntryLate == 515 &&
              policy.ExitEarly == 1130 && policy.ExitLate == 1145,
              "REV25 shared work-time policy is read from Hedef DB");

        var repairDays = Enumerable.Range(2, 6).Select(day => new DateTime(2026,11,day)).ToArray();
        var repair = DbRecordService.Read(db, ["00056"], repairDays, CancellationToken.None, mode: DbRecordMode.RepairAll);
        check(repair.Changes.Any(c => c.Operation == "SİL") &&
              repair.Changes.Any(c => c.Operation == "DÜZELT") &&
              repair.Changes.Any(c => c.Operation == "EKLE"),
              "REV25 one-shot repair previews missing, reversed/out-of-range and surplus changes together");
        check(repair.Changes.Where(c => c.Operation != "SİL").All(c =>
              DbRecordService.InRange(repair.WorkHours, c.Side, c.NewTime)),
              "REV25 one-shot repair generates only clocks inside shared DB policy");
        check(repair.Changes.Where(c => c.Day == new DateTime(2026,11,6) && c.Side == "Giriş").Count() == 0,
              "REV25 E side is protected from automatic normal repair");

        var missingTnf = Path.Combine(directory, "TR2026.Tnf");
        check(!File.Exists(missingTnf), "REV25 fixture starts without TNF");
        var backup = DbRecordService.ApplyAsync(db, repair, missingTnf, CancellationToken.None).GetAwaiter().GetResult();
        check(File.Exists(backup) && File.Exists(missingTnf), "REV25 repair takes DB backup and creates missing TNF");
        var repaired = DbRecordService.Read(db, ["00056"], repairDays, CancellationToken.None, mode: DbRecordMode.RepairAll);
        check(repaired.Changes.Length == 0, "REV25 one-shot repair is idempotent after apply");

        var exact = SyncEngine.ReadAsync(db,
            new AuditRequest(missingTnf, new DateTime(2026,11,2), new DateTime(2026,11,8), "", new TnfFormat(), true),
            CancellationToken.None).GetAwaiter().GetResult();
        check(exact.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"),
              "REV25 repair leaves selected DB/TNF scope exactly aligned");
        check(!File.ReadAllLines(missingTnf).Any(line => line == "00056,08:30,061126,1,001"),
              "REV25 E movement is never written to TNF");

        var addEntryDay = new DateTime(2026,11,10);
        db.Execute("insert into GIRCIK(SIRA,PKNO,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD) values(10010,'00056',@D,'18:55',1135,'','000')",
            new FbParameter("@D", addEntryDay));
        var addEntry = DbRecordService.Read(db, ["00056"], [addEntryDay], CancellationToken.None, mode: DbRecordMode.AddEntry);
        check(addEntry.Changes.Length == 1 && addEntry.Changes[0].Side == "Giriş" && addEntry.Changes[0].Operation == "EKLE",
              "REV25 Giriş Ekle changes only missing entry side");
        DbRecordService.ApplyAsync(db, addEntry, missingTnf, CancellationToken.None).GetAwaiter().GetResult();
        check(DbRecordService.Read(db, ["00056"], [addEntryDay], CancellationToken.None, mode: DbRecordMode.AddEntry).Changes.Length == 0,
              "REV25 Giriş Ekle is idempotent");

        var addExitDay = new DateTime(2026,11,11);
        db.Execute("insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values(10011,'00056',@D,'08:30',510,'','000')",
            new FbParameter("@D", addExitDay));
        var addExit = DbRecordService.Read(db, ["00056"], [addExitDay], CancellationToken.None, mode: DbRecordMode.AddExit);
        check(addExit.Changes.Length == 1 && addExit.Changes[0].Side == "Çıkış",
              "REV25 Çıkış Ekle changes only missing exit side");
        DbRecordService.ApplyAsync(db, addExit, missingTnf, CancellationToken.None).GetAwaiter().GetResult();

        var addBothDay = new DateTime(2026,11,14);
        var addBoth = DbRecordService.Read(db, ["00056"], [addBothDay], CancellationToken.None, mode: DbRecordMode.AddBoth);
        check(addBoth.Changes.Length == 2 && addBoth.Changes.All(c => c.Operation == "EKLE"),
              "REV25 Giriş + Çıkış Ekle creates exactly two missing sides");
        DbRecordService.ApplyAsync(db, addBoth, missingTnf, CancellationToken.None).GetAwaiter().GetResult();

        var staleDay = new DateTime(2026,11,16);
        var stale = DbRecordService.Read(db, ["00056"], [staleDay], CancellationToken.None, mode: DbRecordMode.AddBoth);
        db.Execute("insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values(10016,'00056',@D,'08:31',511,'','000')",
            new FbParameter("@D", staleDay));
        var rejected = false;
        try { DbRecordService.ApplyAsync(db, stale, missingTnf, CancellationToken.None).GetAwaiter().GetResult(); }
        catch (InvalidOperationException) { rejected = true; }
        check(rejected, "REV25 stale preview is rejected before write");

        RunUi(db, missingTnf, check);

        if (!string.IsNullOrWhiteSpace(liveDb) && !string.IsNullOrWhiteSpace(liveTnf) &&
            File.Exists(liveDb) && File.Exists(liveTnf))
        {
            var live = new FirebirdDatabase(options with { DatabasePath = liveDb });
            var request = new AuditRequest(liveTnf, new DateTime(DateTime.Today.Year,1,1), new DateTime(DateTime.Today.Year + 1,1,1), "", new TnfFormat(), true);
            var beforeHash = Convert.ToString(live.Scalar("select count(*) from GIRCIK"));
            var audit = SyncEngine.ReadAsync(live, request, CancellationToken.None).GetAwaiter().GetResult();
            var afterHash = Convert.ToString(live.Scalar("select count(*) from GIRCIK"));
            check(beforeHash == afterHash && audit.Table.Rows.Count >= 0, "REV25 optional live audit is read-only");
        }
    }

    static void RunUi(FirebirdDatabase db, string tnfPath, Action<bool,string> check)
    {
        using var main = new MainForm();
        typeof(MainForm).GetField("db", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(main, db);
        ((TextBox)typeof(MainForm).GetField("tnfPath", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(main)!).Text = tnfPath;

        var tabs = (TabControl)typeof(MainForm).GetField("tabs", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(main)!;
        var expected = new[] { "Personel", "Giriş-Çıkış", "Kayıt Düzeltme", "E İşlemleri", "Bordro", "Ödeme / Avans", "DB - TNF Eşitle" };
        check(tabs.TabPages.Cast<TabPage>().Select(p => p.Text).SequenceEqual(expected),
              "REV25 main menu has one owner and exactly seven production workflows");

        using var record = new DbRecordControl(main);
        var operation = (ComboBox)typeof(DbRecordControl).GetField("operation", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(record)!;
        check(operation.Items.Cast<string>().SequenceEqual(new[]
        {
            "TAM DÜZELT (ÖNERİLEN)", "Giriş Ekle", "Çıkış Ekle", "Giriş + Çıkış Ekle"
        }) && operation.SelectedIndex == 0,
        "REV25 record repair defaults to one-shot full repair and only four intentional modes");

        using var exact = new DbTnfSyncControl(main);
        IEnumerable<Control> Descendants(Control root) =>
            root.Controls.Cast<Control>().SelectMany(child => Descendants(child).Prepend(child));
        var buttons = Descendants(exact).OfType<Button>().Select(button => button.Text).ToArray();
        check(buttons.Count(text => text == "TEK ATIŞ KONTROL + DÜZELT") == 1 &&
              !buttons.Any(text => text.Contains("GÜVENLİ") || text.Contains("AYLIK") || text.Contains("ÇIKTIYI")),
              "REV25 DB-TNF UI has one correction action and no legacy write paths");
    }
}
