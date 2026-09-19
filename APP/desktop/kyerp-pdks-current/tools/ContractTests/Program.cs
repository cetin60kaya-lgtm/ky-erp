using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Sync;
using KYERP.PDKS.Core.Terminal;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Operations;
using KYERP.PDKS.Core.Reports;
using KYERP.PDKS.Core.Definitions;

var failures = new List<string>();
Run("environment overrides", () =>
{
    using var scope = new EnvironmentScope(new Dictionary<string, string?>
    {
        ["KY_PDKS_RUNTIME_ROOT"] = @"C:\PDKS-RUNTIME",
        ["KY_PDKS_DB_PATH"] = @"C:\PDKS-DATA\TEST.GDB",
        ["KY_PDKS_DB_HOST"] = "db.internal",
        ["KY_PDKS_DB_PORT"] = "4050",
        ["KY_PDKS_DB_USER"] = "pdks_user",
        ["KY_PDKS_DB_PASSWORD"] = "test-only",
        ["KY_PDKS_REPORT_ROOT"] = @"C:\PDKS-REPORTS",
        ["KY_PDKS_PERSONEL_EXE"] = @"C:\PDKS\Personel.exe",
        ["KY_PDKS_API_BASE_URL"] = "https://api.example.test/",
        ["KY_PDKS_TENANT_ID"] = "tenant-a",
        ["KY_PDKS_COMPANY_ID"] = "company-a",
        ["KY_PDKS_WORKPLACE_ID"] = "workplace-a"
    });
    var value = PdksOptions.FromEnvironment();
    Equal(@"C:\PDKS-DATA\TEST.GDB", value.DatabasePath);
    Equal("db.internal", value.DatabaseHost);
    Equal(4050, value.DatabasePort);
    Equal(@"C:\PDKS-REPORTS\report.fr3", value.ReportPath("report.fr3"));
    Equal("tenant-a", value.TenantId);
});

Run("missing password fails closed", () =>
{
    using var scope = new EnvironmentScope(new Dictionary<string, string?> { ["KY_PDKS_DB_PASSWORD"] = null });
    try { PdksOptions.FromEnvironment().ValidateDatabase(); }
    catch (InvalidOperationException) { return; }
    throw new Exception("Eksik parola kabul edildi.");
});

Run("employee validation", () =>
{
    Equal("01234", PdksValidation.EmployeeCode(" 01234 "));
    Throws(() => PdksValidation.EmployeeCode("12A34"));
    Throws(() => PdksValidation.RequiredText(" ", "Adı"));
    PdksValidation.EmploymentDates(new DateTime(2026, 1, 1), new DateTime(2026, 1, 2));
    Throws(() => PdksValidation.EmploymentDates(new DateTime(2026, 1, 2), new DateTime(2026, 1, 1)));
});

Run("attendance and money validation", () =>
{
    PdksValidation.AttendanceRange(new DateTime(2026, 1, 1, 23, 0, 0), new DateTime(2026, 1, 2, 7, 0, 0));
    Throws(() => PdksValidation.AttendanceRange(DateTime.Today, DateTime.Today));
    Equal(125.50m, PdksValidation.ParseMoney("125,50", "Miktar"));
    Throws(() => PdksValidation.ParseMoney("0", "Miktar"));
});

Run("tenant scoped durable outbox", () =>
{
    var root = Path.Combine(Path.GetTempPath(), "kyerp-pdks-contract-" + Guid.NewGuid().ToString("N"));
    try
    {
        var options = new PdksOptions("test.gdb", "localhost", 3050, "test", "test", "WIN1254", ".", ".", "personel.exe", "tenant-a", "company-a", "workplace-a", new Uri("https://api.example.test"));
        var envelope = SyncEnvelope.Create(options, "attendance", "upsert", "row-1", new { employeeId = "01234" }, new DateTimeOffset(2026, 1, 1, 8, 0, 0, TimeSpan.Zero));
        var outbox = new FileOutbox(root);
        outbox.EnqueueAsync(envelope).GetAwaiter().GetResult();
        outbox.EnqueueAsync(envelope).GetAwaiter().GetResult();
        var pending = outbox.ReadPending();
        Equal(1, pending.Count);
        Equal(envelope.IdempotencyKey, pending[0].IdempotencyKey);
        outbox.MarkFailed(envelope.Id,"temporary",DateTimeOffset.UtcNow.AddHours(-2));
        pending=outbox.ReadPending();Equal(1,pending[0].AttemptCount);Equal("temporary",pending[0].LastError);
        outbox.MarkCompleted(envelope.Id);
        Equal(0, outbox.ReadPending().Count);
    }
    finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
});

Run("terminal record parsing and duplicate guard", () =>
{
    var result = TerminalRecordFile.Parse([
        "01234,08:30,190926,1,001",
        "01234,08:30,190926,1,001",
        "abc,08:30,190926,1,001"
    ]);
    Equal(1, result.Records.Count);
    Equal(new DateTime(2026, 9, 19, 8, 30, 0), result.Records[0].OccurredAt);
    Equal(1, result.DuplicateCount);
    Equal(1, result.Errors.Count);
});

Run("strict TNF v1 import export", () =>
{
    var records = TnfFile.Parse(["00003,08:28,250526,1,001"]);
    Equal("00003,08:28,250526,1,001", TnfFile.Export(records));
    ThrowsFormat(() => TnfFile.Parse(["KartNo,Saat,GGAAYY,1,001"]));
    ThrowsFormat(() => TnfFile.Parse(["00003,250526,08:28,1,001"]));
    ThrowsFormat(() => TnfFile.Parse(["00003,08:28,250526,2,001"]));
    ThrowsFormat(() => TnfFile.Parse(["00003,08:28,250526,1,002"]));
    ThrowsFormat(() => TnfFile.Parse(["00003,08:28,250526,1,001", ""]));
    ThrowsFormat(() => TnfFile.Parse(["00003,08:28,250526,1,001", "00003,08:28,250526,1,001"]));
});

Run("profile driven fixed and delimited parsing", () =>
{
    var baseProfile = new TerminalTransferProfile
    {
        Id=Guid.NewGuid(), Name="Fixed", TenantId="t", CompanyId="c", WorkplaceId="w", DeviceId="d",
        FormatType=TerminalFormatType.FixedWidth, EmployeeCode=new(0,5), Day=new(5,2), Month=new(7,2), Year=new(9,2),
        Hour=new(11,2), Minute=new(13,2), EventCode=new(15,1), TerminalCode=new(16,3), DateFormat="ddMMyy", TimeFormat="HH:mm",
        EntryCodeMapping=new(){{"1","ENTRY"}}, ExitCodeMapping=new(){{"2","EXIT"}}
    };
    var fixedRecord=ProfiledTerminalParser.Parse(baseProfile,"0000325052608281001");
    Equal(new DateTime(2026,5,25,8,28,0),fixedRecord.OccurredAt);
    Equal(TerminalDirection.Entry,fixedRecord.Direction);
    var delimited=baseProfile with { Id=Guid.NewGuid(), Name="Delimited", FormatType=TerminalFormatType.Delimited, Separator=";", EmployeeCode=new(0,1), Day=new(1,1), Hour=new(2,1), EventCode=new(3,1), TerminalCode=new(4,1) };
    var delimitedRecord=ProfiledTerminalParser.Parse(delimited,"00003;250526;08:28;2;009");
    Equal(TerminalDirection.Exit,delimitedRecord.Direction);
});

Run("profile store protects canonical preset", () =>
{
    var root=Path.Combine(Path.GetTempPath(),"kyerp-profile-"+Guid.NewGuid().ToString("N"));
    try
    {
        var options=new PdksOptions("db","host",3050,"u","p","WIN1254",".",".","p.exe","t","c","w",null);
        var store=new TerminalProfileStore(Path.Combine(root,"profiles.json"),options);
        var canonical=store.Load().Single();
        Equal(true,canonical.IsCanonical);
        var copy=canonical.Copy("Özel TNF") with { IsDefault=true };
        store.Save([canonical with { IsDefault=false },copy]);
        var loaded=store.Load();
        Equal(2,loaded.Count); Equal(1,loaded.Count(item=>item.IsDefault));
        var imported=store.Import(store.Export(canonical));
        Equal(false,imported.IsCanonical);
    }
    finally { if(Directory.Exists(root))Directory.Delete(root,true); }
});

Run("terminal code mapping text", () =>
{
    var mapping=TerminalCodeMappingText.Parse("01=ENTRY; 02=TURNSTILE\n03=MANUAL","Giriş kodları");
    Equal(3,mapping.Count);Equal("TURNSTILE",mapping["02"]);
    Equal("01=ENTRY; 02=TURNSTILE; 03=MANUAL",TerminalCodeMappingText.Format(mapping));
    Throws(()=>TerminalCodeMappingText.Parse("01", "Giriş kodları"));
    Throws(()=>TerminalCodeMappingText.Parse("01=A;01=B", "Giriş kodları"));
});

Run("organization definition reference whitelist", () =>
{
    Equal("KIMLIK.GRUP",DefinitionUsageGuard.ReferenceFields(OrganizationDefinitionKind.Group)[0]);
    Equal("DONEM.GRUP",DefinitionUsageGuard.ReferenceFields(OrganizationDefinitionKind.Group)[1]);
    Equal(1,DefinitionUsageGuard.ReferenceFields(OrganizationDefinitionKind.Department).Count);
    var message=DefinitionUsageGuard.BlockMessage([new("KIMLIK.GRUP",2),new("DONEM.GRUP",3)]);
    Equal(true,message.Contains("KIMLIK.GRUP: 2 kayıt"));Equal(true,message.Contains("DONEM.GRUP: 3 kayıt"));
});

Run("period definition validation", () =>
{
    PeriodDefinitionGuard.Validate(new DateTime(2026,9,1),new DateTime(2026,9,30),1);
    PeriodDefinitionGuard.Validate(new DateTime(2026,9,1),new DateTime(2026,9,1),1);
    Equal(true,PeriodDefinitionGuard.IsExactDuplicate(1,new DateTime(2026,9,1),new DateTime(2026,9,30,23,0,0),1,new DateTime(2026,9,1,12,0,0),new DateTime(2026,9,30)));
    Equal(false,PeriodDefinitionGuard.IsExactDuplicate(1,new DateTime(2026,9,1),new DateTime(2026,9,30),2,new DateTime(2026,9,1),new DateTime(2026,9,30)));
    Equal(false,PeriodDefinitionGuard.IsExactDuplicate(1,new DateTime(2026,9,1),new DateTime(2026,9,30),1,new DateTime(2026,9,15),new DateTime(2026,10,15)));
    Throws(()=>PeriodDefinitionGuard.Validate(new DateTime(2026,9,2),new DateTime(2026,9,1),1));
    Throws(()=>PeriodDefinitionGuard.Validate(new DateTime(2026,9,1),new DateTime(2026,9,2),0));
});

Run("payroll calculation", () =>
{
    var result=PayrollCalculator.Calculate(new PayrollInput(30000m,30m,600,60,1000m,500m,250m));
    Equal(1000m,result.DailyRate);Equal(133.33m,result.HourlyRate);Equal(2000m,result.Overtime50Pay);
    Equal(266.67m,result.Overtime100Pay);Equal(32516.67m,result.NetPay);
    Throws(()=>PayrollCalculator.Calculate(new PayrollInput(-1,0,0,0,0,0,0)));
});

Run("daily operation summary", () =>
{
    var summary=DailyOperationCalculator.Calculate([
        new("00001",DateTime.Today.AddHours(8),DateTime.Today.AddHours(17),true,"GÜNDÜZ"),
        new("00002",DateTime.Today.AddHours(20),null,true,"GECE"),new("00003",null,null,true,"GÜNDÜZ")]);
    Equal(3,summary.Expected);Equal(2,summary.Arrived);Equal(1,summary.Missing);Equal(1,summary.OpenRecords);Equal(1,summary.NightShift);
});

Run("PDF and Excel report export", () =>
{
    var root=Path.Combine(Path.GetTempPath(),"kyerp-report-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
    try
    {
        var report=new ReportTable("Puantaj Özet",["Kart No","Ad Soyad","Tutar"],[["00003","Çağrı Şen","1.250,50"]]);
        var xlsx=Path.Combine(root,"report.xlsx");var pdf=Path.Combine(root,"report.pdf");ReportExporter.ExportExcel(xlsx,report);ReportExporter.ExportPdf(pdf,report);
        Equal("PK",System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(xlsx),0,2));
        Equal("%PDF",System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(pdf),0,4));
    }
    finally {if(Directory.Exists(root))Directory.Delete(root,true);}
});

if (failures.Count > 0)
{
    Console.Error.WriteLine(string.Join(Environment.NewLine, failures));
    return 1;
}

Console.WriteLine("KYERP PDKS CONTRACT TESTS OK");
return 0;

void Run(string name, Action test)
{
    try { test(); Console.WriteLine($"PASS {name}"); }
    catch (Exception exception) { failures.Add($"FAIL {name}: {exception.Message}"); }
}

static void Equal<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new Exception($"Beklenen '{expected}', gelen '{actual}'.");
}

static void Throws(Action action)
{
    try { action(); }
    catch (ArgumentException) { return; }
    throw new Exception("Beklenen validation hatası oluşmadı.");
}

static void ThrowsFormat(Action action)
{
    try { action(); }
    catch (FormatException) { return; }
    throw new Exception("Beklenen format hatası oluşmadı.");
}

sealed class EnvironmentScope : IDisposable
{
    private readonly Dictionary<string, string?> original = new();
    public EnvironmentScope(IReadOnlyDictionary<string, string?> values)
    {
        foreach (var item in values)
        {
            original[item.Key] = Environment.GetEnvironmentVariable(item.Key);
            Environment.SetEnvironmentVariable(item.Key, item.Value);
        }
    }
    public void Dispose()
    {
        foreach (var item in original) Environment.SetEnvironmentVariable(item.Key, item.Value);
    }
}
