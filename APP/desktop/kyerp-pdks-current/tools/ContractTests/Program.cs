using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Sync;

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
        outbox.MarkCompleted(envelope.Id);
        Equal(0, outbox.ReadPending().Count);
    }
    finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
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
