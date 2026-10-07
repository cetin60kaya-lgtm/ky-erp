using System.Data;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class Program
{
    static int assertions;
    static readonly DateTime Day = new(2026, 1, 1);
    static readonly TnfFormat Format = new();
    static Dictionary<string, EmploymentRule> People => new() { ["00039"] = new("00039", "Fixture", new(2020, 1, 1), null, true) };
    static DbMovement Db(int id = 1, string time = "08:23", string tur = "", string side = "Giriş") => new(id, "00039", Day, side, time, tur);
    static TnfMovement Tnf(int index = 0, string time = "08:23", string card = "00039") => new(index, Format.Build(card, Day, time), card, Day, time);
    static DataTable Compare(List<DbMovement> db, List<TnfMovement> tnf, Dictionary<string, EmploymentRule>? people = null)
        => SyncEngine.Compare(db, tnf, people ?? People, Format, CancellationToken.None);
    static int Count(DataTable table, string operation) => table.AsEnumerable().Count(row => row.Field<string>("İşlem") == operation);
    static void Check(bool condition, string name)
    {
        if (!condition) throw new InvalidOperationException("FAIL: " + name);
        assertions++;
        Console.WriteLine("PASS " + name);
    }

    [STAThread]
    static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        try
        {
            Check(Count(Compare([Db()], [Tnf()]), "YOK") == 1, "exact match");
            Check(SyncEngine.ActiveStatus("Çalışanlar") == true, "Turkish dotless i active status");
            Check(SyncEngine.ActiveStatus("İşten Ayrılanlar") == false, "Turkish dotless i passive status");
            Check(Count(Compare([Db()], []), "TNF EKLE") == 1, "missing terminal");
            Check(Count(Compare([], [Tnf()]), "TNF SİL FAZLA") == 1, "extra terminal including unknown card");
            Check(Count(Compare([Db()], [Tnf(time: "08:24")]), "TNF DÜZELT") == 1, "unique time mismatch");
            Check(Count(Compare([Db(tur: "E")], [Tnf()]), "TNF SİL E") == 1, "E excluded");
            Check(Count(Compare([Db(tur: "E")], []), "YOK") == 1, "E absence compatible");
            Check(Count(Compare([Db(tur:"E")], [Tnf(),Tnf(1)]),"TNF SİL E")==2, "unambiguous E side removes duplicate TNF counterparts");
            Check(Count(Compare([Db(time:"",tur:"E")], []),"YOK")==1, "E absence does not require a fabricated DB clock");
            Check(Count(Compare([], [Tnf(),Tnf(1,"19:00")]),"TNF SİL FAZLA")==2, "DB empty multiple TNF never becomes review");
            Check(Count(Compare([Db(),Db(2,tur:"E",side:"Çıkış")], []),"TNF EKLE")==0, "identical normal and E clock collision never exports an E-identical missing line");
            Check(Count(Compare([Db(time:"08:23:30")], []),"İNCELE")==1, "seconds cannot silently round into canonical DB minutes");
            var duplicateTnf = Compare([Db()], [Tnf(), Tnf(1)]);
            Check(Count(duplicateTnf, "YOK") == 1 && Count(duplicateTnf, "TNF SİL FAZLA") == 1 && Count(duplicateTnf, "İNCELE") == 0, "unique DB safely anchors exact duplicate TNF");
            var duplicateMismatch = Compare([Db()], [Tnf(time: "08:02"), Tnf(1, "08:24")]);
            Check(Count(duplicateMismatch, "TNF DÜZELT") == 1 && Count(duplicateMismatch, "TNF SİL FAZLA") == 1 && Count(duplicateMismatch, "İNCELE") == 0, "unique DB safely corrects closest mismatching TNF and removes surplus same-side line");
            Check(Count(Compare([Db(), Db(2)], [Tnf()]), "İNCELE") == 2, "duplicate DB is never auto corrected");
            var twoWrongTnf = Compare([Db()], [Tnf(time: "08:24"), Tnf(1, "08:25")]);
            Check(Count(twoWrongTnf, "TNF DÜZELT") == 1 && Count(twoWrongTnf, "TNF SİL FAZLA") == 1 && Count(twoWrongTnf, "İNCELE") == 0, "single DB auto-resolves multiple same-side TNF by closest clock");
            Check(Count(Compare([Db(), Db(2, "19:00", side: "Çıkış")], [Tnf(), Tnf(1, "19:00")]), "YOK") == 2, "two sides exact");
            Check(Count(Compare([Db(), Db(2, "19:00", "E", "Çıkış")], [Tnf(time: "08:24"), Tnf(1, "19:01")]), "TNF SİL E") == 1, "unique mismatching E safe while separate normal side preserved");
            Check(Count(Compare([Db(time: "")], []), "İNCELE") == 1, "blank DB time needs review");
            Check(Count(Compare([Db()], [Tnf() with { Standard = false }]), "İNCELE") == 1, "unexpected TNF type needs review");
            Check(Count(Compare([Db()], [], new()), "TNF EKLE") == 1, "DB source needs no personnel status to export missing");
            var alignment = Compare([Db(), Db(2, "18:56", side: "Çıkış")], [Tnf(time: "08:38"), Tnf(1, "18:56")]);
            Check(alignment.Rows.Count == 2 && alignment.Rows[0].Field<string>("Taraf") == "Giriş" && alignment.Rows[0].Field<string>("TNF Saat") == "08:38", "mismatch aligns to missing side");
            Check(Count(Compare([Db()], [Tnf(time: "18:00")]), "TNF DÜZELT") == 1, "single DB and TNF match without fabricating a clock");
            Check(Count(alignment, "TNF DÜZELT") == 1 && Count(alignment, "YOK") == 1, "opposite side stays compatible");
            Check(Count(Compare([Db(), Db(2,"18:00",side:"Çıkış")], [Tnf(time:"08:38"), Tnf(1,"18:38")]), "TNF DÜZELT") == 2, "two unique time differences align by side");
            var surplus = Compare([Db(),Db(2,"18:00",side:"Çıkış")], [Tnf(),Tnf(1,"18:00"),Tnf(2,"18:10")]);
            Check(Count(surplus,"YOK") == 2 && Count(surplus,"TNF SİL FAZLA") == 1, "unique exact DB anchor distinguishes distinct surplus from matching exit");
            var multi = Compare([Db(), Db(2, "08:30")], [Tnf(), Tnf(1, "08:30")]);
            Check(multi.Rows.Count == 2 && Count(multi, "İNCELE") == 2, "multiple same side always reviewed");
            Check(Compare([Db(time: "20:00")], [Tnf(time: "20:00")]).Rows[0].Field<string>("Taraf") == "Giriş", "night entry follows DB side");
            var absent = new DbTnfSyncControl.PairView(Compare([Db()], []).Rows[0]);
            Check(absent.DbTime == "08:23" && absent.TnfTime == "BOŞ", "missing counterpart shown as BOS");
            absent.Selected = true;
            Check(absent.Row.Field<bool>("Seç"), "checkbox writes original row");
            Check(SyncEngine.ActiveStatus("çALıŞıYOR") == true && SyncEngine.ActiveStatus("çıktı") == false, "mixed case Turkish");
            var kemalRule = new EmploymentRule("00056", "Synthetic", new(2026,5,18), null, true);
            Check(kemalRule.Evaluate(new(2026,6,1)).Reason is null, "May hire makes June valid");
            Check(kemalRule.Evaluate(new(2026,5,17)).Certain, "before hire invalid");
            var rehire = new EmploymentRule("00039", "Fixture", new(2026, 6, 1), new(2026, 3, 1), true);
            Check(rehire.Evaluate(new(2026, 2, 1)).Reason is null, "rehire old history preserved");
            Check(rehire.Evaluate(new(2026, 3, 1)).Reason is null, "old exit boundary valid");
            Check(rehire.Evaluate(new(2026, 3, 2)).Certain, "rehire gap invalid");
            Check(rehire.Evaluate(new(2026, 6, 1)).Reason is null, "rehire entry boundary valid");
            var passive = new EmploymentRule("00039", "Fixture", new(2026, 1, 1), new(2026, 2, 1), false);
            Check(passive.Evaluate(new(2026, 2, 2)).Certain, "passive after exit invalid");
            Check(passive.Evaluate(new(2026, 1, 1)).Reason is null, "hire day valid");
            Check((passive with { Hire = new(2026, 3, 1) }).Evaluate(Day).Certain == false, "contradictory dates never cleaned");
            Check((rehire with { Active = null }).Evaluate(new(2026,4,1)).Certain, "clear rehire gap derives from dates even without status");
            var boundedUnknown = new EmploymentRule("00056", "Synthetic", new(2026,5,18), new(2026,8,4), null);
            Check(boundedUnknown.Evaluate(new(2026,6,1)).Reason is null, "bounded employment valid despite empty DB status");
            Check(boundedUnknown.Evaluate(new(2026,8,5)).Certain, "known exit makes later movement certainly invalid despite empty status");
            var departedActive = new EmploymentRule("00053", "Fixture", new(2025,6,11), new(2025,7,2), true, RawStatus: "Çalışanlar");
            Check(departedActive.EffectiveStatus(Day) == "PASİF / ÇIKIŞ YAPMIŞ", "exit overrides stale active DB label");
            Check(departedActive.StatusNote(Day).Contains("ÇELİŞKİSİ"), "status and dates contradiction disclosed separately");
            Check(departedActive.Evaluate(Day).Certain, "stale active label does not hide certain invalid date");
            Check((departedActive with { Exit = null, Active = false }).EffectiveStatus(Day) == "AKTİF", "hire without exit determines effective active regardless DB label");
            var departedPeople = new Dictionary<string, EmploymentRule> { ["00053"] = departedActive };
            var departedRows = Compare([], [Tnf(card:"00053")], departedPeople);
            Check(Count(departedRows,"TNF SİL FAZLA") == 1, "TNF only after exit safely deletes without DB write");
            Check(Count(Compare([], [Tnf() with { Date = new(2019,1,1) }]), "TNF SİL FAZLA") == 1, "TNF only before hire safely deletes");
            Check(Count(Compare([Db()], [Tnf()], new() { ["00039"] = departedActive with { Card="00039" } }),"YOK") == 1, "personnel dates cannot override normal DB source movement");
            Check(Count(Compare([], [Tnf(card:"00053"), Tnf(1,card:"00053")], departedPeople),"TNF SİL FAZLA") == 2, "DB empty duplicate TNF are all safe surplus");
            var anchoredEarly = Compare([Db()], [Tnf(time:"08:22"),Tnf(1)]);
            Check(Count(anchoredEarly,"YOK")==1 && Count(anchoredEarly,"TNF SİL FAZLA")==1 && anchoredEarly.Rows[0].Field<string>("TNF Saat")=="08:23", "exact anchor is paired first even when surplus time precedes it");
            Check(Count(Compare([Db(tur:"E")], [Tnf(time:"08:24")]),"TNF SİL E") == 1, "unique E counterpart excluded even with different time");
            Check(departedActive.Evaluate(new(2025,7,2)).Reason is null && departedActive.Evaluate(new(2025,6,10)).Certain, "employment boundaries remain inclusive");
            Check((departedActive with { Ambiguous=true }).Evaluate(Day).Certain == false, "multiple personnel definitions do not infer new hire");
            Check(Format.TryParse("00039,08:23,010126,1,001", 0, out var parsed) && parsed.Date == Day && parsed.Time == "08:23", "TNF canonical parser");
            Check(!Format.TryParse("00039;08:23,010126,1,001", 0, out _), "broken TNF separator rejected");
            Check(Count(Compare([Db()], [], new() { ["00039"] = departedActive with { Card="00039" } }),"TNF EKLE") == 1, "normal DB source preserved even beyond personnel exit");
            Check(!Format.TryParse("00039,28:23,010126,1,001", 0, out _), "invalid clock rejected");
            var overflow = false;
            try { Format.Build("123456", Day, "08:23"); } catch (FormatException) { overflow = true; }
            Check(overflow, "card never truncated");
            using var cancellation = new CancellationTokenSource();
            cancellation.Cancel();
            var cancelled = false;
            try { SyncEngine.Compare([Db()], [Tnf()], People, Format, cancellation.Token); } catch (OperationCanceledException) { cancelled = true; }
            Check(cancelled, "comparison cancellation");
            var largeDb = Enumerable.Range(1, 100000).Select(index => Db(index) with { Card = (index / 365 + 1).ToString("D5"), Date = Day.AddDays(index % 365) }).ToList();
            var largeTnf = largeDb.Select((movement, index) => new TnfMovement(index, Format.Build(movement.Card, movement.Date, movement.Time), movement.Card, movement.Date, movement.Time)).ToList();
            var largePeople = largeDb.Select(movement => movement.Card).Distinct().ToDictionary(card => card, card => new EmploymentRule(card, "Fixture", new(2020, 1, 1), null, true));
            var timer = Stopwatch.StartNew();
            var large = Compare(largeDb, largeTnf, largePeople);
            Check(large.Rows.Count == 100000, "100000 groups compared");
            Console.WriteLine($"SYNTHETIC_COMPARE_MS={timer.ElapsedMilliseconds}");
            var late = Db() with { Date = new DateTime(2026, 12, 30) };
            Check(Count(Compare([Db(), late], [Tnf()]), "TNF EKLE") == 1, "late DB date beyond final TNF retained");
            Check(Count(Compare([Db(), late], []), "TNF EKLE") == 2, "empty TNF still detects full-year DB");
            var listing = SyncEngine.ListTerminal([Tnf(), Tnf(1)], People, CancellationToken.None);
            Check(listing.Rows.Count == 2 && listing.Rows[0].Field<string>("Durum") == "TNF LİSTE", "terminal listing preserves physical duplicate rows");
            Rev23OneClickExactSync();
            WorkTimeTests.Run(Check);
            SeparatedWorkflowTests.Run(Check, args.Length == 2 ? args[0] : null, args.Length == 2 ? args[1] : null);
            MonthlyTests.Run(Check, args.Length == 2 ? args[0] : null, args.Length == 2 ? args[1] : null);
            if (args.Length == 2)
            {
                FixtureCorrections();
                LiveReadOnly(args[0], args[1]);
            }
            Console.WriteLine($"ASSERTIONS={assertions} ALL PASSED");
            return 0;
        }
        catch (Exception exception) { Console.Error.WriteLine(exception); return 1; }
    }

    static void Rev23OneClickExactSync()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var directory = Path.Combine(Path.GetTempPath(), "HKN_REV23_SYNC_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "REV23.GDB");
        var tnfPath = Path.Combine(directory, "TR2026.Tnf");
        var options = PdksOptions.FromEnvironment() with { DatabasePath = dbPath, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey" };
        var connectionString = new FirebirdSql.Data.FirebirdClient.FbConnectionStringBuilder
        {
            Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort,
            UserID = options.DatabaseUser, Password = options.DatabasePassword, Dialect = 1, Charset = "WIN1254", Pooling = false
        }.ToString();
        FirebirdSql.Data.FirebirdClient.FbConnection.CreateDatabase(connectionString);
        var database = new FirebirdDatabase(options);
        database.Execute("create table DURUM(KOD varchar(10), AD varchar(60))");
        database.Execute("create table KIMLIK(PKNO varchar(5), AD varchar(30), SOYAD varchar(30), IGTARIH timestamp, ICTARIH timestamp, DURUM varchar(10))");
        database.Execute("create table GIRCIK(SIRA integer, PKNO varchar(5), GTARIH timestamp, GSAAT varchar(5), GTUR varchar(1), GDAKIKA integer, CTARIH timestamp, CSAAT varchar(5), CTUR varchar(1), CDAKIKA integer)");
        database.Execute("insert into DURUM values('A','Aktif')");
        database.Execute("insert into KIMLIK values('00048','ALI','AKKAYA','2025-02-22',null,'A')");
        void Pair(int id, DateTime day, string entry, string exit) => database.Execute(
            "insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR) values(@I,'00048',@D,@G,'',@D,@C,'')",
            new FirebirdSql.Data.FirebirdClient.FbParameter("@I", id),
            new FirebirdSql.Data.FirebirdClient.FbParameter("@D", day),
            new FirebirdSql.Data.FirebirdClient.FbParameter("@G", entry),
            new FirebirdSql.Data.FirebirdClient.FbParameter("@C", exit));
        Pair(1, new(2026,9,29), "08:32", "18:57");
        Pair(2, new(2026,9,30), "08:27", "18:55");
        Pair(3, new(2026,9,1), "08:25", "18:58");
        database.Execute("insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GTUR) values(4,'00048','2026-09-28','08:30','E')");

        var originalLines = new[]
        {
            Format.Build("00048", new(2026,9,28), "08:30"),
            Format.Build("00048", new(2026,9,29), "08:02"),
            Format.Build("00048", new(2026,9,29), "08:23"),
            Format.Build("00048", new(2026,9,29), "18:57"),
            Format.Build("00048", new(2026,9,30), "08:05"),
            Format.Build("00048", new(2026,9,30), "08:30"),
            Format.Build("00048", new(2026,9,30), "18:55"),
            Format.Build("00099", new(2026,9,29), "09:00")
        };
        File.WriteAllLines(tnfPath, originalLines);
        var originalBytes = File.ReadAllBytes(tnfPath);
        var request = new AuditRequest(tnfPath, new(2026,9,1), new(2026,10,1), "", Format, true);
        var before = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(Count(before.Table, "İNCELE") == 0, "REV24 exact audit has no interpretation/review for valid DB movements");
        Check(Count(before.Table, "TNF SİL E") == 1, "REV24 exact audit removes E counterpart");
        Check(Count(before.Table, "TNF EKLE") == 4, "REV24 exact audit adds every DB-normal movement missing from TNF");
        Check(Count(before.Table, "TNF SİL FAZLA") == 5, "REV24 exact audit deletes every TNF row without exact DB-normal counterpart");
        Check(Count(before.Table, "TNF DÜZELT") == 0, "REV24 wrong clocks are delete-plus-add, not interpreted");

        var result = SyncEngine.DirectSyncSourceAsync(database, before, CancellationToken.None).GetAwaiter().GetResult();
        Check(File.Exists(result.BackupPath) && File.ReadAllBytes(result.BackupPath).SequenceEqual(originalBytes), "REV24 one-click backup preserves original TNF bytes");
        var after = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(after.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"), "REV24 one-click final TNF is DB-exact with zero remaining operations");
        var finalLines = File.ReadAllLines(tnfPath);
        Check(finalLines.Contains(Format.Build("00048", new(2026,9,29), "08:32")) &&
              finalLines.Contains(Format.Build("00048", new(2026,9,30), "08:27")) &&
              !finalLines.Contains(Format.Build("00048", new(2026,9,28), "08:30")) &&
              !finalLines.Contains(Format.Build("00099", new(2026,9,29), "09:00")),
              "REV24 one-click corrects clocks, removes E and deletes DB-less TNF");
        Check(finalLines.Contains(Format.Build("00048", new(2026,9,1), "08:25")) &&
              finalLines.Contains(Format.Build("00048", new(2026,9,1), "18:58")),
              "REV24 one-click adds missing DB normal entry and exit into same TNF");

        database.Execute("insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GTUR) values(5,'00048','2026-09-29','08:40','')");
        var duplicateDb = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(Count(duplicateDb.Table, "İNCELE") == 0 && Count(duplicateDb.Table, "TNF EKLE") == 1,
            "REV24 exact mode treats every normal DB movement as source truth without side interpretation");
        SyncEngine.DirectSyncSourceAsync(database, duplicateDb, CancellationToken.None).GetAwaiter().GetResult();
        var duplicateDbAfter = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(duplicateDbAfter.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"),
            "REV24 exact mode mirrors duplicate/multiple DB normal movements literally into TNF");
    }

    static void FixtureCorrections()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var directory = Path.Combine(@"D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST", "REV20_FIXTURE_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "SYNTHETIC.GDB");
        var path = Path.Combine(directory, "TR2026.Tnf");
        var options = PdksOptions.FromEnvironment() with { DatabasePath = dbPath, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey" };
        var connectionString = new FirebirdSql.Data.FirebirdClient.FbConnectionStringBuilder
        {
            Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort,
            UserID = options.DatabaseUser, Password = options.DatabasePassword, Dialect = 1, Charset = "WIN1254", Pooling = false
        }.ToString();
        FirebirdSql.Data.FirebirdClient.FbConnection.CreateDatabase(connectionString);
        var database = new FirebirdDatabase(options);
        database.Execute("create table DURUM(KOD varchar(10), AD varchar(60))");
        database.Execute("create table KIMLIK(PKNO varchar(5), AD varchar(30), SOYAD varchar(30), IGTARIH timestamp, ICTARIH timestamp, DURUM varchar(10))");
        database.Execute("create table GIRCIK(SIRA integer, PKNO varchar(5), GTARIH timestamp, GSAAT varchar(5), GTUR varchar(1), GDAKIKA integer, CTARIH timestamp, CSAAT varchar(5), CTUR varchar(1), CDAKIKA integer)");
        database.Execute("insert into DURUM values('A','Aktif')");
        database.Execute("insert into DURUM values('P','Pasif')");
        database.Execute("insert into KIMLIK values('00039','Synthetic','Fixture','2020-01-01',null,'A')");
        database.Execute("insert into KIMLIK values('00040','Synthetic','Passive','2026-01-01','2026-02-01','P')");
        database.Execute("insert into KIMLIK values('00053','Synthetic','Departed','2025-06-11','2025-07-02','A')");
        void Insert(int id, string card, DateTime date, string tur = "") => database.Execute(
            "insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GTUR) values(@Id,@Card,@Date,'08:23',@Tur)",
            new FirebirdSql.Data.FirebirdClient.FbParameter("@Id", id), new FirebirdSql.Data.FirebirdClient.FbParameter("@Card", card),
            new FirebirdSql.Data.FirebirdClient.FbParameter("@Date", date), new FirebirdSql.Data.FirebirdClient.FbParameter("@Tur", tur));
        Insert(1,"00039",Day); Insert(2,"00039",Day.AddDays(1)); Insert(3,"00039",Day.AddDays(2),"E");
        Insert(4,"00039",Day.AddDays(3)); Insert(5,"00039",new(2026,12,30));
        Insert(6,"00039",Day.AddDays(5)); Insert(7,"00039",Day.AddDays(5));
        Insert(8,"00040",new(2026,2,2)); Insert(9,"00040",new(2026,2,3));
        File.WriteAllLines(path, [Format.Build("00039",Day,"08:24"), Format.Build("00039",Day.AddDays(2),"08:23"),
            Format.Build("00039",Day.AddDays(3),"08:23"), Format.Build("00039",Day.AddDays(3),"08:23"),
            Format.Build("00039",Day.AddDays(4),"08:23"), Format.Build("00039",Day.AddDays(5),"08:23"),
            Format.Build("00040",new(2026,2,2),"08:23"), Format.Build("00040",new(2026,2,3),"08:23")]);
        var request = new AuditRequest(path, Day, Day.AddYears(1), "", Format);
        AuditSnapshot Read(AuditRequest input) => SyncEngine.ReadAsync(database,input,CancellationToken.None).GetAwaiter().GetResult();
        var snapshot = Read(request);
        var original = File.ReadAllBytes(path);
        var safe = snapshot.Table.AsEnumerable().Where(row => row.Field<string>("İşlem") is "TNF EKLE" or "TNF SİL E" or "TNF SİL FAZLA" or "TNF DÜZELT").ToArray();
        var outputs = SyncEngine.ApplyAsync(database,snapshot,safe,CancellationToken.None).GetAwaiter().GetResult();
        Check(original.SequenceEqual(File.ReadAllBytes(outputs.BackupPath)), "fixture backup preserves exact original bytes");
        Check(original.SequenceEqual(File.ReadAllBytes(path)), "original TNF never modified");
        var corrected = Read(request with { Path=outputs.CorrectedPath });
        Check(Count(corrected.Table,"TNF SİL FAZLA")==0 && Count(corrected.Table,"TNF SİL E")==0 && Count(corrected.Table,"TNF DÜZELT")==0, "all safe excess E and time errors resolved in corrected output");
        Check(Count(corrected.Table,"TNF EKLE")==2, "missing records remain separate from corrected original");
        var missingLines = File.ReadAllLines(outputs.MissingPath);
        Check(missingLines.Length==2 && missingLines.Contains("00039,08:23,020126,1,001") && missingLines.Contains("00039,08:23,301226,1,001"), "missing file uses exact DB card date clock and canonical columns");
        Check(missingLines.Distinct().Count()==missingLines.Length && !missingLines.Contains(Format.Build("00039",Day.AddDays(2),"08:23")), "missing output has no duplicates and never emits E");
        Check(File.ReadAllLines(outputs.CorrectedPath).Contains("00039,08:23,010126,1,001"), "time corrected to exact DB clock");
        Check(Count(corrected.Table,"İNCELE")==Count(snapshot.Table,"İNCELE"), "ambiguous records untouched");
        Check(snapshot.Db.SequenceEqual(corrected.Db), "all fixture DB movement fields stay unchanged after output generation");
        Check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH is not null"))==9, "output workflow leaves fixture DB untouched including invalid employment dates");
        Check(Directory.GetFiles(Path.Combine(directory,"_YEDEK")).Length==1, "one backup for whole batch");
        Check(!Directory.GetFiles(directory,"*.tmp",SearchOption.AllDirectories).Any(), "no temporary files survive atomic publication");
        var originalLines=File.ReadAllLines(path);
        File.AppendAllLines(path,["00039,23:59,311226,1,001"]);
        var staleFileRejected=false;
        try { SyncEngine.WriteOutputsAsync(snapshot,[],[],CancellationToken.None).GetAwaiter().GetResult(); }
        catch(InvalidOperationException) { staleFileRejected=true; }
        Check(staleFileRejected && Directory.GetFiles(Path.Combine(directory,"_YEDEK")).Length==1, "changed TNF is rejected before any backup or publication");
        File.WriteAllBytes(path,original);
        var rejected = false;
        try { SyncEngine.ApplyAsync(database,snapshot,[snapshot.Table.AsEnumerable().First(row=>row.Field<string>("İşlem")=="İNCELE")],CancellationToken.None).GetAwaiter().GetResult(); }
        catch(InvalidOperationException) { rejected=true; }
        Check(rejected && original.SequenceEqual(File.ReadAllBytes(path)), "review cannot enter output plan");
        var repeated = SyncEngine.PrepareOutputs(snapshot,safe.Concat(safe).ToArray(),CancellationToken.None);
        Check(repeated.Missing.SequenceEqual(missingLines), "same selected row never produces duplicate missing line");
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var cancelRejected = false;
        try { SyncEngine.WriteOutputsAsync(snapshot,repeated.Corrected,repeated.Missing,cancelled.Token).GetAwaiter().GetResult(); }
        catch(OperationCanceledException) { cancelRejected=true; }
        Check(cancelRejected && Directory.GetFiles(Path.Combine(directory,"_YEDEK")).Length==1, "cancellation publishes nothing and preserves source");
        database.Execute("update GIRCIK set GSAAT='08:25' where SIRA=1");
        rejected=false;
        try { SyncEngine.ApplyAsync(database,snapshot,safe,CancellationToken.None).GetAwaiter().GetResult(); }
        catch(InvalidOperationException) { rejected=true; }
        Check(rejected && original.SequenceEqual(File.ReadAllBytes(path)), "stale DB snapshot cannot generate incorrect outputs");
        File.AppendAllLines(path,[Format.Build("00053",Day,"08:23")]);
        var personSnapshot=Read(request);
        var personRows=personSnapshot.Table.AsEnumerable().Where(row=>row.Field<string>("Kart No")=="00053").ToArray();
        var personOutput=SyncEngine.ApplyAsync(database,personSnapshot,personRows,CancellationToken.None).GetAwaiter().GetResult();
        Check(!File.ReadAllLines(personOutput.CorrectedPath).Any(line=>line.StartsWith("00053")) && File.ReadAllLines(path).Any(line=>line.StartsWith("00053")), "person output removes surplus but original still retains person");
        Check(Read(request with { Path=personOutput.CorrectedPath,Card="00053" }).Db.Count==0, "TNF only person read remains read only");
        var firstCorrectedBytes=File.ReadAllBytes(outputs.CorrectedPath);
        var correctedFresh=Read(request with { Path=outputs.CorrectedPath });
        var nextRows=correctedFresh.Table.AsEnumerable().Where(SyncEngine.SafeOperation).ToArray();
        var nextOutput=SyncEngine.ApplyAsync(database,correctedFresh,nextRows,CancellationToken.None).GetAwaiter().GetResult();
        Check(Path.GetDirectoryName(nextOutput.CorrectedPath)==Path.GetDirectoryName(outputs.CorrectedPath), "repeated person/output processing never nests output directories");
        Check(Path.GetFileName(nextOutput.CorrectedPath).Length==Path.GetFileName(outputs.CorrectedPath).Length && firstCorrectedBytes.SequenceEqual(File.ReadAllBytes(outputs.CorrectedPath)), "repeated output names remain short and previous corrected file is immutable");
        Console.WriteLine("REV20_FIXTURE_OUTPUT_TESTS_PASSED");
    }

    static void LiveReadOnly(string dbPath, string tnfPath)
    {
        var options = PdksOptions.FromEnvironment() with { DatabasePath = dbPath, DatabaseUser = "SYSDBA", DatabasePassword = "masterkey" };
        var database = new FirebirdDatabase(options);
        var request = new AuditRequest(tnfPath, Day, Day.AddYears(1), "", Format);
        var before = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(tnfPath)));
        var total = Stopwatch.StartNew();
        var result = Task.Run(() => SyncEngine.ReadAsync(database, request, CancellationToken.None)).GetAwaiter().GetResult();
        Console.WriteLine($"LIVE db_query_ms={result.DbMilliseconds} tnf_read_parse_ms={result.TnfMilliseconds} compare_ms={result.CompareMilliseconds} total_without_grid_ms={total.ElapsedMilliseconds} db_events={result.Db.Count} cards={result.People.Count} rows={result.Table.Rows.Count}");
        foreach (var group in result.Table.AsEnumerable().GroupBy(row => row.Field<string>("İşlem"))) Console.WriteLine($"LIVE {group.Key}={group.Count()}");
        foreach (var group in result.Table.AsEnumerable().GroupBy(row => row.Field<string>("Durum"))) Console.WriteLine($"LIVE_STATUS {group.Key}={group.Count()}");
        Console.WriteLine($"LIVE_RULES active={result.People.Values.Count(rule => rule.Active == true)} passive={result.People.Values.Count(rule => rule.Active == false)} unknown={result.People.Values.Count(rule => rule.Active is null)} missing_hire={result.People.Values.Count(rule => rule.Hire is null)} contradictory={result.People.Values.Count(rule => rule.Ambiguous)}");
        using (var connection = database.OpenConnection())
        using (var transaction = connection.BeginTransaction(new FirebirdSql.Data.FirebirdClient.FbTransactionOptions { TransactionBehavior = FirebirdSql.Data.FirebirdClient.FbTransactionBehavior.Read | FirebirdSql.Data.FirebirdClient.FbTransactionBehavior.Concurrency }))
        using (var command = new FirebirdSql.Data.FirebirdClient.FbCommand("select KOD,AD from DURUM", connection, transaction))
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read()) Console.WriteLine($"STATUS_DEFINITION code={reader["KOD"]} label={reader["AD"]}");
            transaction.Rollback();
        }
        if (result.People.TryGetValue("00056", out var target))
        {
            Console.WriteLine($"LIVE_TARGET_00056 active={target.Active} hire={target.Hire:yyyy-MM-dd} exit={target.Exit:yyyy-MM-dd} ambiguous={target.Ambiguous} statuscode=[{target.StatusCode}]");
            Check(target.Hire == new DateTime(2026,5,18) && target.Evaluate(new(2026,6,1)).Reason is null, "live 00056 June valid with real DB metadata");
        }
        else Check(false, "live 00056 found");
        foreach (var card in new[] { "00053", "00003" })
        {
            var cardRows = result.Table.AsEnumerable().Where(row => row.Field<string>("Kart No") == card).ToArray();
            var rule = result.People.GetValueOrDefault(card);
            Console.WriteLine($"LIVE_TARGET_{card} raw_status={rule?.RawStatus} hire={rule?.Hire:yyyy-MM-dd} exit={rule?.Exit:yyyy-MM-dd} effective={rule?.EffectiveStatus(request.End.AddDays(-1))} db_events={result.Db.Count(movement => movement.Card==card)} tnf_events={cardRows.Count(row => row.Field<int>("TnfIndex")>=0)} safe_extra={cardRows.Count(row => row.Field<string>("İşlem")=="TNF SİL FAZLA")} review={cardRows.Count(row => row.Field<string>("İşlem")=="İNCELE")}");
            Check(rule is not null, "requested live card metadata loaded " + card);
            if (card == "00053")
            {
                Check(rule!.Exit is not null && rule.EffectiveStatus(request.End.AddDays(-1)).StartsWith("PASİF"), "live 00053 is effectively departed");
                Check(cardRows.Length>0, "live 00053 movements remain visible with DB as source");
                var historicalStart = new DateTime(2025, 6, 1);
                var historicalEnd = new DateTime(2025, 8, 1);
                var currentOnly = Convert.ToInt64(database.Scalar("select count(*) from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where g.PKNO='00053' and (k.ICTARIH is null or k.ICTARIH>=@TODAY) and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))", new FirebirdSql.Data.FirebirdClient.FbParameter("@TODAY", DateTime.Today), new FirebirdSql.Data.FirebirdClient.FbParameter("@A", historicalStart), new FirebirdSql.Data.FirebirdClient.FbParameter("@B", historicalEnd)) ?? 0);
                var periodAware = Convert.ToInt64(database.Scalar("select count(*) from GIRCIK g inner join KIMLIK k on k.PKNO=g.PKNO where g.PKNO='00053' and k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A) and ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))", new FirebirdSql.Data.FirebirdClient.FbParameter("@A", historicalStart), new FirebirdSql.Data.FirebirdClient.FbParameter("@B", historicalEnd)) ?? 0);
                Console.WriteLine($"HISTORICAL_00053 current_filter={currentOnly} period_filter={periodAware}");
                Check(periodAware > currentOnly && periodAware > 0, "departed personnel historical movements remain visible in selected period");
            }
        }
        using var owner = new ProbeForm(database, tnfPath);
        using var control = new DbTnfSyncControl(owner);
        owner.Controls.Add(control);
        using var heartbeat = new System.Windows.Forms.Timer { Interval = 25 };
        var clock = Stopwatch.StartNew();
        var last = clock.ElapsedMilliseconds;
        long maximum = 0;
        var ticks = 0;
        heartbeat.Tick += (_, _) => { var now = clock.ElapsedMilliseconds; maximum = Math.Max(maximum, now - last); last = now; ticks++; };
        heartbeat.Start();
        Exception? uiFailure = null;
        owner.Shown += async (_, _) =>
        {
            try
            {
            var firstAudit = control.RunAuditAsync(true);
            var activeCancellation = typeof(DbTnfSyncControl).GetField("cancellation", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control);
            await control.RunAuditAsync(true);
            Check(ReferenceEquals(activeCancellation, typeof(DbTnfSyncControl).GetField("cancellation", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)), "second concurrent audit rejected");
            await firstAudit;
            await Task.Delay(100);
            Console.WriteLine($"UI grid_bind_ms={control.LastGridMilliseconds} total_ms={control.LastTotalMilliseconds} max_heartbeat_gap_ms={maximum} ticks={ticks}");
            SyncEngine.Log($"readonly_ui_probe max_heartbeat_gap_ms={maximum} ticks={ticks}");
            Check(control.LastSnapshot is not null && control.LastSnapshot.Request.Start == Day && control.LastSnapshot.Request.End == Day.AddYears(1), "full 2026 coverage in actual control");
            Check(maximum < 2000 && ticks > 0, "UI responds within two seconds");
            var dbGrid = (DataGridView)typeof(DbTnfSyncControl).GetField("dbGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            var tnfGrid = (DataGridView)typeof(DbTnfSyncControl).GetField("tnfGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            Check(dbGrid.RowCount == tnfGrid.RowCount && dbGrid.RowCount > 0, "live paired grids aligned");
            Check(Enumerable.Range(0,dbGrid.RowCount).All(index => ReferenceEquals(dbGrid.Rows[index].DataBoundItem,tnfGrid.Rows[index].DataBoundItem)), "all paired row identities equal");
            var searchBox = (TextBox)typeof(DbTnfSyncControl).GetField("search", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            searchBox.Text = "00053";
            var departedPairs = ((BindingSource)dbGrid.DataSource!).List.Cast<DbTnfSyncControl.PairView>().ToArray();
            Check(departedPairs.Length > 0 && departedPairs.Any(pair=>pair.Safe), "TNF only person remains visible and actionable");
            var unselectedPlan = control.PlanVisibleCorrections(false);
            Check(unselectedPlan.Length > 0 && unselectedPlan.All(row=>row.Field<string>("Kart No")=="00053"), "bulk person plan needs no checkbox and cannot include other card");
            Check(control.PlanVisibleCorrections(true).Length==0, "checkbox plan still requires explicit selection");
            Check(unselectedPlan.Length==departedPairs.Count(pair=>pair.Safe), "bulk person plan includes every safe visible operation");
            Check(DbTnfSyncControl.CorrectionSummary(unselectedPlan).Contains("Fazla TNF:"), "confirmation gives operation count summary");
            var globalPlan = control.PlanAllCorrections();
            Check(globalPlan.Length == control.LastSnapshot!.Table.AsEnumerable().Count(SyncEngine.SafeOperation) && globalPlan.Select(row => row.Field<string>("Kart No")).Distinct().Count() > 1,
                "REV21 global TNF plan includes all snapshot people despite visible person filter");
            Check(DbTnfSyncControl.CorrectionSummary(globalPlan, 0, true, 12).Contains("İşlenecek Personel: Tüm ay / 12 kişi"), "REV21 global confirmation displays whole-month scope rather than selected person");
            var personLabel = (Label)typeof(DbTnfSyncControl).GetField("personnelSummary", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            Check(personLabel.Text.Contains("DB Durumu (DURUM.AD)") && personLabel.Text.Contains("Efektif Durum: PASİF") && personLabel.Text.Contains("ÇELİŞKİSİ"), "summary separates raw status effective status and date contradiction");
            searchBox.Text = "00003";
            Check(dbGrid.RowCount==tnfGrid.RowCount && Enumerable.Range(0,dbGrid.RowCount).All(index=>ReferenceEquals(dbGrid.Rows[index].DataBoundItem,tnfGrid.Rows[index].DataBoundItem)), "live 00003 entry exit and E alignment preserved");
            searchBox.Text = "00056";
            var targetRows = ((BindingSource)dbGrid.DataSource!).List.Cast<DbTnfSyncControl.PairView>().ToArray();
            Check(targetRows.Length > 0 && targetRows.All(pair => pair.Row.Field<string>("Kart No") == "00056"), "person selection limits both panes to selected card");
            Check(targetRows.Where(pair => pair.Date.EndsWith(".06.2026")).All(pair => !pair.Detail.Contains("DURUM ALANI")), "June target UI does not show unknown employment warning");
            var juneRow = Array.FindIndex(targetRows, pair => pair.Date.EndsWith(".06.2026"));
            if (juneRow >= 0) dbGrid.FirstDisplayedScrollingRowIndex = juneRow;
            Check(dbGrid.FirstDisplayedScrollingRowIndex == tnfGrid.FirstDisplayedScrollingRowIndex, "scroll positions synchronized");
            var uiSummary = (Label)typeof(DbTnfSyncControl).GetField("summary", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            Check(uiSummary.Visible && uiSummary.Text.Contains("Eksik="), "global counts remain visible");
            using (var image = new System.Drawing.Bitmap(owner.Width,owner.Height)) { owner.DrawToBitmap(image, new System.Drawing.Rectangle(0,0,owner.Width,owner.Height)); image.Save("D:/Googledrive/KYERP-PDKS-MASAUSTU/08_TEST/REV20_UI_READONLY.png"); }
            var fullSnapshot = control.LastSnapshot!;
            var safeRows=fullSnapshot.Table.AsEnumerable().Where(SyncEngine.SafeOperation).ToArray();
            var planClock=Stopwatch.StartNew();
            var livePlan=SyncEngine.PrepareOutputs(fullSnapshot,safeRows,CancellationToken.None);
            planClock.Stop();
            Check(livePlan.Missing.All(line=>Format.TryParse(line,0,out _)), "live missing plan has only canonical TNF lines; no write performed");
            Check(safeRows.All(row=>row.Field<string>("Tür")!="E" || row.Field<string>("İşlem")=="TNF SİL E"), "live E never produces a missing line");
            var parsedPlan=livePlan.Corrected.Select((line,index)=>Format.TryParse(line,index,out var movement)?movement:null).Where(movement=>movement is not null).Cast<TnfMovement>().Where(movement=>movement.Date>=fullSnapshot.Request.Start && movement.Date<fullSnapshot.Request.End).ToList();
            var planCheck=Compare(fullSnapshot.Db,parsedPlan,fullSnapshot.People);
            Console.WriteLine($"REV20_POST_PLAN missing={Count(planCheck,"TNF EKLE")} surplus={Count(planCheck,"TNF SİL FAZLA")} time={Count(planCheck,"TNF DÜZELT")} e={Count(planCheck,"TNF SİL E")} review={Count(planCheck,"İNCELE")}");
            Check(Count(planCheck,"TNF SİL FAZLA")==0 && Count(planCheck,"TNF DÜZELT")==0 && Count(planCheck,"TNF SİL E")==0, "live memory-only output plan reaches zero safe surplus time and E errors");
            Check(dbGrid.Columns.Cast<DataGridViewColumn>().All(column=>column is not DataGridViewCheckBoxColumn), "simplified grids contain no selection checkbox");
            var buttons=Descendants(control).OfType<Button>().Where(button=>button.Text!="İptal").Select(button=>button.Text).ToArray();
            Check(buttons.Length==7 && buttons.Contains("BU AYI KONTROL ET") && buttons.Contains("DB GÜVENLİLERİ DÜZELT") && buttons.Contains("DB EKSİKLERİ TAMAMLA") && buttons.Contains("TNF'Yİ DB'YE GÖRE DÜZELT") && buttons.Contains("SON TAM KONTROL") && buttons.Contains("ÇIKTI DOSYALARINI AÇ") && buttons.Contains("BU PERSONELİ DB'YE GÖRE DÜZELT"), "REV21 six monthly actions and separate person TNF action; DB and TNF stages clearly separated");
            Console.WriteLine($"REV20_READONLY_PLAN safe={safeRows.Length} missing={livePlan.Missing.Length} corrected_lines={livePlan.Corrected.Length} plan_ms={planClock.ElapsedMilliseconds}");
            await control.RunAuditAsync(true, true);
            var grid = (DataGridView)typeof(DbTnfSyncControl).GetField("dbGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            var other = (DataGridView)typeof(DbTnfSyncControl).GetField("tnfGrid", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            var listed = ((BindingSource)grid.DataSource!).List.Cast<DbTnfSyncControl.PairView>().ToArray();
            Check(grid.RowCount == other.RowCount && listed.Length > 0, "paired TNF listing aligned");
            Check(control.LastSnapshot is null && listed.Any(row => row.Status == "TNF LİSTE"), "actual TNF listing disables correction snapshot");
            var cancelledAudit = control.RunAuditAsync(true);
            ((CancellationTokenSource)typeof(DbTnfSyncControl).GetField("cancellation", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!).Cancel();
            await cancelledAudit;
            Check(!control.IsBusy && control.LastSnapshot is null, "actual control cancellation clears unsafe snapshot");
            var monthPicker = (ComboBox)typeof(DbTnfSyncControl).GetField("month", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            monthPicker.SelectedIndex = 5;
            searchBox.Text = "";
            maximum = 0;
            last = clock.ElapsedMilliseconds;
            await control.RunAuditAsync(false);
            await Task.Delay(100);
            Check(control.LastSnapshot is not null && control.LastSnapshot.Request.Start==new DateTime(2026,5,1) && control.LastSnapshot.Request.End==new DateTime(2026,6,1), "REV25 selected-month exact UI audits the full requested month without a second interpretation engine");
            Check(maximum < 2000, "REV21 monthly DB/TNF UI heartbeat stays below two seconds");
            Console.WriteLine($"REV25_EXACT_UI grid_bind_ms={control.LastGridMilliseconds} total_ms={control.LastTotalMilliseconds} max_heartbeat_gap_ms={maximum}");
            using (var image = new System.Drawing.Bitmap(owner.Width,owner.Height)) { owner.DrawToBitmap(image, new System.Drawing.Rectangle(0,0,owner.Width,owner.Height)); image.Save("D:/Googledrive/KYERP-PDKS-MASAUSTU/08_TEST/REV21_UI_READONLY.png"); }
            }
            catch (Exception exception) { uiFailure = exception; }
            finally { owner.Close(); }
        };
        Application.Run(owner);
        if (uiFailure is not null) throw new InvalidOperationException("UI probe failed", uiFailure);
        Check(before == Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(tnfPath))), "live TNF untouched");
        using var main = new MainForm();
        var tabs = (TabControl)typeof(MainForm).GetField("tabs", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(main)!;
        var tabNames = tabs.TabPages.Cast<TabPage>().Select(page => page.Text).ToArray();
        var expectedTabs = new[] { "Personel", "Giriş-Çıkış", "Kayıt Düzeltme", "E İşlemleri", "Bordro", "Ödeme / Avans", "DB - TNF Eşitle", "TNF Hazırla" };
        Check(tabNames.SequenceEqual(expectedTabs), "REV25 single-owner simple menu has only the eight production workflows");
        Check(!tabNames.Any(name => name is "Toplu İşlem" or "AYLIK KONTROL" or "TNF DÜZENLE"), "REV25 legacy duplicate workflow tabs are gone");
        Check(typeof(PasswordGateForm).GetField("Expected", BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null) is byte[] { Length: 32 }, "original password gate retained with embedded private verifier");
    }

    static IEnumerable<Control> Descendants(Control parent)
    {
        foreach (Control child in parent.Controls)
        {
            yield return child;
            foreach (var descendant in Descendants(child)) yield return descendant;
        }
    }

    sealed class ProbeForm : Form
    {
        readonly FirebirdDatabase db;
        readonly TextBox tnfPath;
        public ProbeForm(FirebirdDatabase database, string path)
        {
            db = database;
            tnfPath = new TextBox { Text = path };
            Opacity = 0;
            ShowInTaskbar = false;
            Width = 1400;
            Height = 850;
        }
    }
}
