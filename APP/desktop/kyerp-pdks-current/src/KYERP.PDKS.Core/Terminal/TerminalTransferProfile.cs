using System.Text;

namespace KYERP.PDKS.Core.Terminal;

public enum TerminalFormatType { FixedWidth, Delimited, Tnf }

public sealed record FieldSlice(int Start, int Length)
{
    public string Read(string line, string fieldName)
    {
        if (Start < 0 || Length < 1 || Start + Length > line.Length)
            throw new FormatException($"{fieldName} konumu örnek satır sınırları dışında.");
        return line.Substring(Start, Length);
    }
}

public sealed record TerminalTransferProfile
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string TenantId { get; init; }
    public required string CompanyId { get; init; }
    public required string WorkplaceId { get; init; }
    public required string DeviceId { get; init; }
    public required TerminalFormatType FormatType { get; init; }
    public string Separator { get; init; } = ",";
    public string Encoding { get; init; } = "utf-8";
    public FieldSlice? EmployeeCode { get; init; }
    public FieldSlice? Year { get; init; }
    public FieldSlice? Month { get; init; }
    public FieldSlice? Day { get; init; }
    public FieldSlice? Hour { get; init; }
    public FieldSlice? Minute { get; init; }
    public FieldSlice? EventCode { get; init; }
    public FieldSlice? TerminalCode { get; init; }
    public string DateFormat { get; init; } = "ddMMyy";
    public string TimeFormat { get; init; } = "HH:mm";
    public Dictionary<string, string> EntryCodeMapping { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> ExitCodeMapping { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public string? ProgramPath { get; init; }
    public string? TransferFilePath { get; init; }
    public bool IsDefault { get; init; }
    public bool IsCanonical { get; init; }

    public static TerminalTransferProfile CreateCanonicalTnf(PdksOptions options) => new()
    {
        Id = Guid.Parse("18d18a9c-6cf3-4bfd-b41f-c5c87901b001"), Name = "KYERP TNF v1",
        TenantId = options.TenantId ?? "*", CompanyId = options.CompanyId ?? "*",
        WorkplaceId = options.WorkplaceId ?? "*", DeviceId = "TNF-001",
        FormatType = TerminalFormatType.Tnf, Separator = ",", Encoding = "utf-8",
        DateFormat = "ddMMyy", TimeFormat = "HH:mm", IsDefault = true, IsCanonical = true,
        EntryCodeMapping = new() { ["1"] = "ENTRY" }
    };

    public TerminalTransferProfile Copy(string name) => this with
    {
        Id = Guid.NewGuid(), Name = PdksValidation.RequiredText(name, "Profil adı"), IsCanonical = false, IsDefault = false,
        EntryCodeMapping = new(EntryCodeMapping, StringComparer.OrdinalIgnoreCase),
        ExitCodeMapping = new(ExitCodeMapping, StringComparer.OrdinalIgnoreCase)
    };

    public void Validate()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        PdksValidation.RequiredText(Name, "Profil adı");
        PdksValidation.RequiredText(TenantId, "Tenant"); PdksValidation.RequiredText(CompanyId, "Firma");
        PdksValidation.RequiredText(WorkplaceId, "İşyeri"); PdksValidation.RequiredText(DeviceId, "Cihaz");
        try { _ = System.Text.Encoding.GetEncoding(Encoding); }
        catch (Exception exception) { throw new ArgumentException("Profil encoding değeri geçersiz.", exception); }
        if (FormatType == TerminalFormatType.Delimited && string.IsNullOrEmpty(Separator)) throw new ArgumentException("Delimited profil separator gerektirir.");
        if (FormatType == TerminalFormatType.FixedWidth && new[] { EmployeeCode, Year, Month, Day, Hour, Minute, EventCode, TerminalCode }.Any(x => x is null))
            throw new ArgumentException("FixedWidth profil bütün alan başlangıç/uzunluk değerlerini gerektirir.");
        if (IsCanonical && (FormatType != TerminalFormatType.Tnf || Name != "KYERP TNF v1")) throw new ArgumentException("Canonical TNF preset değiştirilemez.");
    }
}
