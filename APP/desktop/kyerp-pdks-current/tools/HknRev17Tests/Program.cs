using System.Data;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
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
        => SyncEngine.CompareExact(db, tnf, people ?? People, CancellationToken.None);
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
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            Check(Count(Compare([Db()], [Tnf()]), "YOK") == 1, "REV25 exact DB/TNF match");
            Check(Count(Compare([Db()], []), "TNF EKLE") == 1, "REV25 DB normal movement missing from TNF is added");
            Check(Count(Compare([], [Tnf()]), "TNF SİL FAZLA") == 1, "REV25 TNF row without DB counterpart is removed");

            var wrongClock = Compare([Db()], [Tnf(time: "08:24")]);
            Check(Count(wrongClock, "TNF EKLE") == 1 && Count(wrongClock, "TNF SİL FAZLA") == 1 &&
                  Count(wrongClock, "TNF DÜZELT") == 0,
                  "REV25 clock mismatch is literal delete-plus-add, never interpreted");

            Check(Count(Compare([Db(tur: "E")], [Tnf()]), "TNF SİL E") == 1,
                "REV25 E movement counterpart is removed from TNF");
            Check(Count(Compare([Db(tur: "E")], []), "YOK") == 1,
                "REV25 E movement absent from TNF is correct");

            var duplicateDb = Compare([Db(), Db(2)], [Tnf()]);
            Check(Count(duplicateDb, "YOK") == 1 && Count(duplicateDb, "TNF EKLE") == 1,
                "REV25 duplicate DB normal movement multiplicity is mirrored exactly");
            var duplicateTnf = Compare([Db()], [Tnf(), Tnf(1)]);
            Check(Count(duplicateTnf, "YOK") == 1 && Count(duplicateTnf, "TNF SİL FAZLA") == 1,
                "REV25 duplicate TNF surplus is removed exactly");

            Check(Count(Compare([Db(time: "")], []), "İNCELE") == 1,
                "REV25 invalid DB clock blocks automatic projection");
            var nonStandard = Compare([Db()], [Tnf() with { Standard = false }]);
            Check(Count(nonStandard, "TNF DÜZELT") == 1,
                "REV25 noncanonical TNF representation is canonicalized");

            var twoSides = Compare(
                [Db(), Db(2, "19:00", side: "Çıkış")],
                [Tnf(), Tnf(1, "19:00")]);
            Check(Count(twoSides, "YOK") == 2, "REV25 entry and exit exact pair stays unchanged");

            var absent = new DbTnfSyncControl.PairView(Compare([Db()], []).Rows[0]);
            Check(absent.DbTime == "08:23" && absent.TnfTime == "BOŞ",
                "REV25 missing TNF counterpart is displayed clearly");

            Check(SyncEngine.ActiveStatus("Çalışanlar") == true &&
                  SyncEngine.ActiveStatus("İşten Ayrılanlar") == false &&
                  SyncEngine.ActiveStatus("çALıŞıYOR") == true,
                  "REV25 Turkish personnel status normalization");

            var departed = new EmploymentRule("00039", "Fixture", new(2025,6,11), new(2025,7,2), true, RawStatus: "Çalışanlar");
            Check(departed.EffectiveStatus(Day) == "PASİF / ÇIKIŞ YAPMIŞ" &&
                  departed.StatusNote(Day).Contains("ÇELİŞKİSİ") &&
                  departed.Evaluate(Day).Certain,
                  "REV25 employment dates override stale status labels for display/validation");

            Check(Format.TryParse("00039,08:23,010126,1,001", 0, out var parsed) &&
                  parsed.Date == Day && parsed.Time == "08:23",
                  "REV25 canonical TNF parser");
            Check(!Format.TryParse("00039;08:23,010126,1,001", 0, out _) &&
                  !Format.TryParse("00039,28:23,010126,1,001", 0, out _),
                  "REV25 broken TNF syntax and invalid clocks are rejected");
            var overflow = false;
            try { Format.Build("123456", Day, "08:23"); } catch (FormatException) { overflow = true; }
            Check(overflow, "REV25 card numbers are never silently truncated");

            using var cancellation = new CancellationTokenSource();
            cancellation.Cancel();
            var cancelled = false;
            try { SyncEngine.CompareExact([Db()], [Tnf()], People, cancellation.Token); }
            catch (OperationCanceledException) { cancelled = true; }
            Check(cancelled, "REV25 exact comparison supports cancellation");

            var largeDb = Enumerable.Range(1, 100000)
                .Select(index => Db(index) with { Card = (index / 365 + 1).ToString("D5"), Date = Day.AddDays(index % 365) })
                .ToList();
            var largeTnf = largeDb.Select((movement, index) =>
                new TnfMovement(index, Format.Build(movement.Card, movement.Date, movement.Time),
                    movement.Card, movement.Date, movement.Time)).ToList();
            var largePeople = largeDb.Select(movement => movement.Card).Distinct()
                .ToDictionary(card => card, card => new EmploymentRule(card, "Fixture", new(2020,1,1), null, true));
            var timer = Stopwatch.StartNew();
            var large = SyncEngine.CompareExact(largeDb, largeTnf, largePeople, CancellationToken.None);
            Check(large.Rows.Count == 100000 && large.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"),
                "REV25 exact engine compares 100000 DB/TNF movements");
            Console.WriteLine($"REV25_EXACT_COMPARE_MS={timer.ElapsedMilliseconds}");

            var listing = SyncEngine.ListTerminal([Tnf(), Tnf(1)], People, CancellationToken.None);
            Check(listing.Rows.Count == 2 && listing.Rows[0].Field<string>("Durum") == "TNF LİSTE",
                "REV25 TNF listing preserves physical duplicate rows");

            Rev25OneClickExactSync();
            Rev25ExactProjectionEdgeCases();
            WorkTimeTests.Run(Check);
            SeparatedWorkflowTests.Run(Check, args.Length == 2 ? args[0] : null, args.Length == 2 ? args[1] : null);
            PayrollOverrideTests.Run(Check);
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

    static void Rev25OneClickExactSync()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var directory = Path.Combine(Path.GetTempPath(), "HKN_REV25_SYNC_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var dbPath = Path.Combine(directory, "REV25.GDB");
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
        Check(Count(before.Table, "İNCELE") == 0, "REV25 exact audit has no interpretation/review for valid DB movements");
        Check(Count(before.Table, "TNF SİL E") == 1, "REV25 exact audit removes E counterpart");
        Check(Count(before.Table, "TNF EKLE") == 4, "REV25 exact audit adds every DB-normal movement missing from TNF");
        Check(Count(before.Table, "TNF SİL FAZLA") == 5, "REV25 exact audit deletes every TNF row without exact DB-normal counterpart");
        Check(Count(before.Table, "TNF DÜZELT") == 0, "REV25 wrong clocks are delete-plus-add, not interpreted");

        var result = SyncEngine.DirectSyncSourceAsync(database, before, CancellationToken.None).GetAwaiter().GetResult();
        Check(File.Exists(result.BackupPath) && File.ReadAllBytes(result.BackupPath).SequenceEqual(originalBytes), "REV25 one-click backup preserves original TNF bytes");
        var after = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(after.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"), "REV25 one-click final TNF is DB-exact with zero remaining operations");
        var finalLines = File.ReadAllLines(tnfPath);
        Check(finalLines.Contains(Format.Build("00048", new(2026,9,29), "08:32")) &&
              finalLines.Contains(Format.Build("00048", new(2026,9,30), "08:27")) &&
              !finalLines.Contains(Format.Build("00048", new(2026,9,28), "08:30")) &&
              !finalLines.Contains(Format.Build("00099", new(2026,9,29), "09:00")),
              "REV25 one-click corrects clocks, removes E and deletes DB-less TNF");
        Check(finalLines.Contains(Format.Build("00048", new(2026,9,1), "08:25")) &&
              finalLines.Contains(Format.Build("00048", new(2026,9,1), "18:58")),
              "REV25 one-click adds missing DB normal entry and exit into same TNF");

        database.Execute("insert into GIRCIK(SIRA,PKNO,GTARIH,GSAAT,GTUR) values(5,'00048','2026-09-29','08:40','')");
        var duplicateDb = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(Count(duplicateDb.Table, "İNCELE") == 0 && Count(duplicateDb.Table, "TNF EKLE") == 1,
            "REV25 exact mode treats every normal DB movement as source truth without side interpretation");
        SyncEngine.DirectSyncSourceAsync(database, duplicateDb, CancellationToken.None).GetAwaiter().GetResult();
        var duplicateDbAfter = SyncEngine.ReadAsync(database, request, CancellationToken.None).GetAwaiter().GetResult();
        Check(duplicateDbAfter.Table.AsEnumerable().All(row => row.Field<string>("İşlem") == "YOK"),
            "REV25 exact mode mirrors duplicate/multiple DB normal movements literally into TNF");
    }

    static void Rev25ExactProjectionEdgeCases()
    {
        var request = new AuditRequest("TR2026.Tnf", new DateTime(2026,1,1), new DateTime(2027,1,1), "", Format, true);
        var outside = Format.Build("00039", new DateTime(2025,12,31), "19:00");
        var malformed = "BOZUK-SATIR";
        var lines = new[] { outside, malformed, "", Format.Build("00039", new DateTime(2026,1,2), "07:00") };
        var db = new List<DbMovement>
        {
            new(1,"00039",new DateTime(2026,1,2),"Giriş","08:25",""),
            new(2,"00039",new DateTime(2026,1,2),"Giriş","08:25",""),
            new(3,"00039",new DateTime(2026,1,2),"Çıkış","18:55",""),
            new(4,"00039",new DateTime(2026,1,2),"Giriş","09:00","E")
        };
        var snap = new AuditSnapshot(request, SyncEngine.CompareExact(db, [], People, CancellationToken.None), db, People,
            lines, new UTF8Encoding(false), "", "", 0, 0, 0);
        var output = SyncEngine.BuildExactProjection(snap, CancellationToken.None);
        Check(output.Contains(outside), "REV25 exact projection preserves valid TNF rows outside selected year");
        Check(!output.Contains(malformed) && !output.Any(string.IsNullOrWhiteSpace), "REV25 exact projection removes malformed and blank TNF rows");
        var duplicate = Format.Build("00039", new DateTime(2026,1,2), "08:25");
        Check(output.Count(line => line == duplicate) == 2, "REV25 exact projection preserves DB duplicate multiplicity exactly");
        Check(output.Contains(Format.Build("00039", new DateTime(2026,1,2), "18:55")) &&
              !output.Contains(Format.Build("00039", new DateTime(2026,1,2), "09:00")),
              "REV25 exact projection includes normal DB sides and excludes E");
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
            Check(departedPairs.Length > 0 && departedPairs.All(pair => pair.Row.Field<string>("Kart No") == "00053"),
                "REV25 person filter changes only the visible comparison, not the global exact plan");
            var globalPlan = control.PlanAllCorrections();
            Check(globalPlan.Length == control.LastSnapshot!.Table.AsEnumerable().Count(SyncEngine.SafeOperation) &&
                  globalPlan.Select(row => row.Field<string>("Kart No")).Where(card => !string.IsNullOrWhiteSpace(card)).Distinct().Count() > 1,
                "REV25 one-shot plan always includes every safe operation in the audited scope");
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
            Check(buttons.Length==3 && buttons.Contains("KONTROL ET") && buttons.Contains("TEK ATIŞ KONTROL + DÜZELT") && buttons.Contains("TÜM PERSONELİ GÖSTER"),
                "REV25 DB-TNF screen has read-only control, single exact correction and explicit show-all filter");
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
            Check(maximum < 2000, "REV25 monthly DB/TNF UI heartbeat stays below two seconds");
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
        var expectedTabs = new[] { "Personel", "Giriş-Çıkış", "Kayıt Düzeltme", "E İşlemleri", "Bordro", "Ödeme / Avans", "DB - TNF Eşitle" };
        Check(tabNames.SequenceEqual(expectedTabs), "REV25 single-owner simple menu has only the seven production workflows");
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
