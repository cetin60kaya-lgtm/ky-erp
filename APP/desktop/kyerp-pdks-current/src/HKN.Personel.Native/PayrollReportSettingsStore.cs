using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed record PayrollReportSettings(
    string CompanyTitle,
    string GeneralTitle,
    string PersonalTitle,
    string WorkplaceRegistrationNo,
    string EmployeeSignatureCaption,
    string EmployerSignatureCaption,
    string FooterNote,
    bool ShowSignatureColumn,
    bool ShowEmployerSignature,
    bool ShowWorkplaceRegistration,
    bool UseA3ForGeneral,
    bool IncludeBankColumn)
{
    public static PayrollReportSettings Default => new(
        "Hakan Emprime",
        "Genel Maaş Bordrosu",
        "Kişisel Personel Bordrosu",
        "",
        "Personel İmza",
        "İşveren / Yetkili",
        "",
        true,
        true,
        false,
        true,
        true);
}

internal static class PayrollReportSettingsStore
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string FilePath => Path.Combine(CompanyDataPaths.Config, "payroll-report-settings.json");

    public static PayrollReportSettings Load()
    {
        CompanyDataPaths.Ensure();
        try
        {
            if (!File.Exists(FilePath)) return PayrollReportSettings.Default;
            return JsonSerializer.Deserialize<PayrollReportSettings>(File.ReadAllText(FilePath), Json) ?? PayrollReportSettings.Default;
        }
        catch
        {
            return PayrollReportSettings.Default;
        }
    }

    public static void Save(PayrollReportSettings value)
    {
        CompanyDataPaths.Ensure();
        var clean = value with
        {
            CompanyTitle = Clean(value.CompanyTitle, "Hakan Emprime"),
            GeneralTitle = Clean(value.GeneralTitle, "Genel Maaş Bordrosu"),
            PersonalTitle = Clean(value.PersonalTitle, "Kişisel Personel Bordrosu"),
            WorkplaceRegistrationNo = (value.WorkplaceRegistrationNo ?? "").Trim(),
            EmployeeSignatureCaption = Clean(value.EmployeeSignatureCaption, "Personel İmza"),
            EmployerSignatureCaption = Clean(value.EmployerSignatureCaption, "İşveren / Yetkili"),
            FooterNote = (value.FooterNote ?? "").Trim()
        };
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(clean, Json));
        File.Move(tmp, FilePath, true);
    }

    static string Clean(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
}
