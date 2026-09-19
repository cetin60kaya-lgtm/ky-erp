namespace KYERP.PDKS.Core;

public sealed record PdksOptions(
    string DatabasePath,
    string DatabaseHost,
    int DatabasePort,
    string DatabaseUser,
    string DatabasePassword,
    string DatabaseCharset,
    string RuntimeRoot,
    string ReportRoot,
    string PersonelExecutable,
    string? TenantId,
    string? CompanyId,
    string? WorkplaceId,
    Uri? ApiBaseUri)
{
    public static PdksOptions FromEnvironment()
    {
        var runtimeRoot = Value("KY_PDKS_RUNTIME_ROOT", @"D:\Hedef500\Hedef500");
        var databasePath = Value("KY_PDKS_DB_PATH", Path.Combine(runtimeRoot, "Data", "DATABASE.GDB"));
        var reportRoot = Value("KY_PDKS_REPORT_ROOT", Path.Combine(runtimeRoot, "Report"));
        var personelExecutable = Value("KY_PDKS_PERSONEL_EXE", Path.Combine(runtimeRoot, "HKN.Personel.Native.exe"));
        var api = Environment.GetEnvironmentVariable("KY_PDKS_API_BASE_URL");

        return new PdksOptions(
            databasePath,
            Value("KY_PDKS_DB_HOST", "127.0.0.1"),
            IntValue("KY_PDKS_DB_PORT", 3050),
            Value("KY_PDKS_DB_USER", "SYSDBA"),
            Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD") ?? string.Empty,
            Value("KY_PDKS_DB_CHARSET", "WIN1254"),
            runtimeRoot,
            reportRoot,
            personelExecutable,
            NullIfBlank(Environment.GetEnvironmentVariable("KY_PDKS_TENANT_ID")),
            NullIfBlank(Environment.GetEnvironmentVariable("KY_PDKS_COMPANY_ID")),
            NullIfBlank(Environment.GetEnvironmentVariable("KY_PDKS_WORKPLACE_ID")),
            Uri.TryCreate(api, UriKind.Absolute, out var apiUri) ? apiUri : null);
    }

    public string RequireDatabasePassword()
    {
        if (string.IsNullOrWhiteSpace(DatabasePassword))
            throw new InvalidOperationException("KY_PDKS_DB_PASSWORD ortam değişkeni tanımlı değil.");
        return DatabasePassword;
    }

    public void ValidateDatabase()
    {
        RequireDatabasePassword();
        if (string.IsNullOrWhiteSpace(DatabasePath)) throw new InvalidOperationException("PDKS veritabanı yolu tanımlı değil.");
        if (string.IsNullOrWhiteSpace(DatabaseHost)) throw new InvalidOperationException("PDKS veritabanı sunucusu tanımlı değil.");
        if (DatabasePort is < 1 or > 65535) throw new InvalidOperationException("PDKS veritabanı portu geçersiz.");
    }

    public string ReportPath(string fileName) => Path.Combine(ReportRoot, fileName);

    private static string Value(string name, string fallback) =>
        NullIfBlank(Environment.GetEnvironmentVariable(name)) ?? fallback;

    private static int IntValue(string name, int fallback) =>
        int.TryParse(Environment.GetEnvironmentVariable(name), out var value) ? value : fallback;

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
