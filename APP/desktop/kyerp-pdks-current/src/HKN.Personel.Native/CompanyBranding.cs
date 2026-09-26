using System.Data;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal sealed record CompanyBranding(
    int? Code,
    string Name,
    string Address,
    string City,
    string District,
    string Phone,
    string Ssk,
    string Branch,
    string LogoPath)
{
    public static CompanyBranding Current { get; private set; } = Empty;
    public static CompanyBranding Empty => new(null, "Firma tanımlanmadı", "", "", "", "", "", "", "");

    public string Location => string.Join(" / ", new[] { District, City }.Where(x => !string.IsNullOrWhiteSpace(x)));
    public string ReportHeader => string.IsNullOrWhiteSpace(Branch) ? Name : $"{Name} • {Branch}";

    static string Env(string name) =>
        Environment.GetEnvironmentVariable(name)?.Trim() ?? string.Empty;

    public static CompanyBranding Load()
    {
        var overrideName = Env("KY_PDKS_COMPANY_NAME");
        var overrideBranch = Env("KY_PDKS_COMPANY_BRANCH");
        var overrideLogo = Env("KY_PDKS_COMPANY_LOGO");
        try
        {
            var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
            var table = db.Query(@"select first 1 KOD,AD,ADRES,TEL1,IL,ILCE,SSK,AKTIF from FIRMA
                order by case when AKTIF='E' or AKTIF='1' then 0 else 1 end, KOD");
            if (table.Rows.Count == 0)
                return Current = Empty with
                {
                    Name = string.IsNullOrWhiteSpace(overrideName) ? Empty.Name : overrideName,
                    Branch = overrideBranch,
                    LogoPath = overrideLogo
                };

            var row = table.Rows[0];
            string S(string name) => row.Table.Columns.Contains(name) && row[name] != DBNull.Value
                ? Convert.ToString(row[name])?.Trim() ?? ""
                : "";
            int? code = row["KOD"] == DBNull.Value ? null : Convert.ToInt32(row["KOD"]);
            var dbName = S("AD");
            Current = new CompanyBranding(
                code,
                string.IsNullOrWhiteSpace(overrideName) ? dbName : overrideName,
                S("ADRES"), S("IL"), S("ILCE"), S("TEL1"), S("SSK"),
                overrideBranch, overrideLogo);
            return Current;
        }
        catch
        {
            Current = Empty with
            {
                Name = string.IsNullOrWhiteSpace(overrideName) ? Empty.Name : overrideName,
                Branch = overrideBranch,
                LogoPath = overrideLogo
            };
            return Current;
        }
    }

    public static string DecorateTitle(string title)
    {
        var company = Current.ReportHeader;
        if (string.IsNullOrWhiteSpace(company) || Current.Name == Empty.Name) return title;
        if (title.StartsWith(company + " • ", StringComparison.OrdinalIgnoreCase)) return title;
        return $"{company} • {title}";
    }

    public static ReportTable Decorate(ReportTable report) =>
        report with { Title = DecorateTitle(report.Title) };
}
