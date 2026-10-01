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
            Check(Count(Compare([Db()], [Tnf(), Tnf(1)]), "İNCELE") == 2, "duplicate TNF requires review");
            Check(Count(Compare([Db(), Db(2)], [Tnf()]), "İNCELE") == 2, "duplicate DB is never auto corrected");
            Check(Count(Compare([Db()], [Tnf(time: "08:24"), Tnf(1, "08:25")]), "İNCELE") == 2, "ambiguous time correspondence");
            Check(Count(Compare([Db(), Db(2, "19:00", side: "Çıkış")], [Tnf(), Tnf(1, "19:00")]), "YOK") == 2, "two sides exact");
            Check(Count(Compare([Db(), Db(2, "19:00", "E", "Çıkış")], [Tnf(time: "08:24"), Tnf(1, "19:01")]), "TNF SİL E") == 1, "unique mismatching E safe while separate normal side preserved");
            Check(Count(Compare([Db(time: "")], []), "İNCELE") == 1, "blank DB time needs review");
            Check(Count(Compare([Db()], [Tnf() with { Standard = false }]), "İNCELE") == 1, "unexpected TNF type needs review");
            Check(Count(Compare([Db()], [], new()), "İNCELE") == 1, "missing personnel needs review");
            var alignment = Compare([Db(), Db(2, "18:56", side: "Çıkış")], [Tnf(time: "08:38"), Tnf(1, "18:56")]);
            Check(alignment.Rows.Count == 2 && alignment.Rows[0].Field<string>("Taraf") == "Giriş" && alignment.Rows[0].Field<string>("TNF Saat") == "08:38", "mismatch aligns to missing side");
            Check(Count(Compare([Db()], [Tnf(time: "18:00")]), "İNCELE") == 2, "opposite time band never guessed");
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
            Check(Count(departedRows,"TNF SİL FAZLA") == 1 && departedRows.Rows[0].Field<string>("Durum")!.Contains("GEÇERSİZ"), "TNF only after exit safely deletes without DB write");
            Check(Count(Compare([], [Tnf() with { Date = new(2019,1,1) }]), "TNF SİL FAZLA") == 1, "TNF only before hire safely deletes");
            Check(Count(Compare([Db()], [Tnf()], new() { ["00039"] = departedActive with { Card="00039" } }),"TNF SİL FAZLA") == 1, "certain invalid TNF can be removed while invalid DB is retained");
            Check(Count(Compare([], [Tnf(card:"00053"), Tnf(1,card:"00053")], departedPeople),"İNCELE") == 2, "duplicate departed TNF remains review");
            var anchoredEarly = Compare([Db()], [Tnf(time:"08:22"),Tnf(1)]);
            Check(Count(anchoredEarly,"YOK")==1 && Count(anchoredEarly,"TNF SİL FAZLA")==1 && anchoredEarly.Rows[0].Field<string>("TNF Saat")=="08:23", "exact anchor is paired first even when surplus time precedes it");
            Check(Count(Compare([Db(tur:"E")], [Tnf(time:"08:24")]),"TNF SİL E") == 1, "unique E counterpart excluded even with different time");
            Check(departedActive.Evaluate(new(2025,7,2)).Reason is null && departedActive.Evaluate(new(2025,6,10)).Certain, "employment boundaries remain inclusive");
            Check((departedActive with { Ambiguous=true }).Evaluate(Day).Certain == false, "multiple personnel definitions do not infer new hire");
            Check(Format.TryParse("00039,08:23,010126,1,001", 0, out var parsed) && parsed.Date == Day && parsed.Time == "08:23", "TNF canonical parser");
            Check(!Format.TryParse("00039;08:23,010126,1,001", 0, out _), "broken TNF separator rejected");
            Check(Count(Compare([Db()], [], new() { ["00039"] = departedActive with { Card="00039" } }),"GEÇERSİZ DB") == 1, "certain invalid DB is not labelled review and requires explicit cleanup");
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

    static void FixtureCorrections()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var directory = Path.Combine(@"D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST", "REV18_FIXTURE_" + Guid.NewGuid().ToString("N"));
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
        var backup = SyncEngine.ApplyAsync(database,snapshot,safe,false,CancellationToken.None).GetAwaiter().GetResult();
        Check(original.SequenceEqual(File.ReadAllBytes(backup)), "fixture backup preserves original bytes");
        var corrected = Read(request);
        Check(corrected.Table.AsEnumerable().All(row => row.Field<string>("İşlem") is "YOK" or "İNCELE" or "GEÇERSİZ DB"), "selected safe fixture errors corrected");
        Check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH is not null")) == 9, "standard corrections leave fixture DB untouched");
        var beforeReview = File.ReadAllBytes(path);
        var rejected = false;
        try { SyncEngine.ApplyAsync(database,corrected,[corrected.Table.AsEnumerable().First(row => row.Field<string>("İşlem") == "İNCELE")],false,CancellationToken.None).GetAwaiter().GetResult(); }
        catch (InvalidOperationException) { rejected = true; }
        Check(rejected && beforeReview.SequenceEqual(File.ReadAllBytes(path)), "review selection never auto changed");
        File.AppendAllLines(path, [Format.Build("00040",new(2026,2,2),"08:23"), Format.Build("00040",new(2026,2,3),"08:23")]);
        var personRequest = request with { Card = "00040" };
        var personSnapshot = Read(personRequest);
        var selected = personSnapshot.Table.AsEnumerable().Where(row => row.Field<string>("Tarih") == "02.02.2026").ToArray();
        SyncEngine.ApplyAsync(database,personSnapshot,selected,true,CancellationToken.None).GetAwaiter().GetResult();
        Check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA=8 and GTARIH is null")) == 1, "selected invalid fixture DB side cleared");
        Check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where SIRA=9 and GTARIH is not null")) == 1, "unselected invalid fixture DB side preserved");
        var dumps = Directory.GetFiles(Path.Combine(directory, "_YEDEK"), "*.GIRCIK.json");
        Check(dumps.Length == 1 && File.ReadAllText(dumps[0]).Contains("GSAAT") && File.ReadAllText(dumps[0]).Contains("SIRA"), "DB row dump created");
        Check(!File.ReadAllLines(path).Contains(Format.Build("00040",new(2026,2,2),"08:23")) && File.ReadAllLines(path).Contains(Format.Build("00040",new(2026,2,3),"08:23")), "only selected invalid fixture TNF removed");
        var stale = Read(personRequest);
        database.Execute("update KIMLIK set DURUM='A' where PKNO='00040'");
        var beforeStale = File.ReadAllBytes(path);
        rejected = false;
        try { SyncEngine.ApplyAsync(database,stale,stale.Table.AsEnumerable().ToArray(),true,CancellationToken.None).GetAwaiter().GetResult(); }
        catch (InvalidOperationException) { rejected = true; }
        Check(rejected && beforeStale.SequenceEqual(File.ReadAllBytes(path)), "changed personnel status rejects stale cleanup");
        var departedLine = Format.Build("00053", Day, "08:23");
        File.AppendAllLines(path, [departedLine]);
        var departedSnapshot = Read(request);
        Check(departedSnapshot.People.TryGetValue("00053",out var departed) && departed.RawStatus == "Aktif" && departed.EffectiveStatus(Day).StartsWith("PASİF"), "single query loads metadata for TNF only card");
        var departedSelection = departedSnapshot.Table.AsEnumerable().Where(row => row.Field<string>("Kart No") == "00053").ToArray();
        Check(departedSelection.Length == 1 && departedSelection[0].Field<string>("İşlem") == "TNF SİL FAZLA", "TNF only stale active fixture is safely actionable");
        var beforeOthers = File.ReadAllLines(path).Where(line => !line.StartsWith("00053")).ToArray();
        var dbBeforePerson = Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH is not null"));
        SyncEngine.ApplyAsync(database,departedSnapshot,departedSelection,false,CancellationToken.None).GetAwaiter().GetResult();
        Check(!File.ReadAllLines(path).Contains(departedLine) && beforeOthers.SequenceEqual(File.ReadAllLines(path)), "person correction removes only selected TNF card");
        Check(Convert.ToInt32(database.Scalar("select count(*) from GIRCIK where GTARIH is not null")) == dbBeforePerson, "person bulk correction leaves DB untouched");
        var personOnly = Read(request with { Card="00053" });
        Check(personOnly.People.ContainsKey("00053") && personOnly.Table.Rows.Count == 0 && personOnly.Db.Count == 0, "person refresh retains metadata after last surplus removed");
        Console.WriteLine("FIXTURE_ONLY_WRITE_TESTS_PASSED");
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
                Check(cardRows.Any(row => row.Field<string>("İşlem")=="TNF SİL FAZLA"), "live 00053 exposes safe surplus TNF");
            }
        }
        ApplicationConfiguration.Initialize();
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
            Check(DbTnfSyncControl.CorrectionSummary(unselectedPlan).Contains("Fazla:"), "confirmation gives operation count summary");
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
            var safeSelection = (Task)typeof(DbTnfSyncControl).GetMethod("SelectVisibleAsync", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(control, [true])!;
            await safeSelection;
            Check(targetRows.All(pair => pair.Selected == pair.Safe), "bulk selection excludes review and compatible rows");
            await (Task)typeof(DbTnfSyncControl).GetMethod("SelectVisibleAsync", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(control, [false])!;
            Check(targetRows.All(pair => !pair.Selected), "clear checkboxes leaves no hidden selection");
            var uiSummary = (Label)typeof(DbTnfSyncControl).GetField("summary", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(control)!;
            Check(uiSummary.Visible && uiSummary.Text.Contains("Eksik="), "global counts remain visible");
            using (var image = new System.Drawing.Bitmap(owner.Width,owner.Height)) { owner.DrawToBitmap(image, new System.Drawing.Rectangle(0,0,owner.Width,owner.Height)); image.Save("D:/Googledrive/KYERP-PDKS-MASAUSTU/08_TEST/REV18_UI_READONLY.png"); }
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
            }
            catch (Exception exception) { uiFailure = exception; }
            finally { owner.Close(); }
        };
        Application.Run(owner);
        if (uiFailure is not null) throw new InvalidOperationException("UI probe failed", uiFailure);
        Check(before == Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(tnfPath))), "live TNF untouched");
        using var main = new MainForm();
        var tabs = (TabControl)typeof(MainForm).GetField("tabs", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(main)!;
        Check(tabs.TabPages.Count >= 7, "REV15 main modules construct");
        Check(typeof(PasswordGateForm).GetField("Expected", BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null) is byte[] { Length: 32 }, "original password gate retained with embedded private verifier");
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
