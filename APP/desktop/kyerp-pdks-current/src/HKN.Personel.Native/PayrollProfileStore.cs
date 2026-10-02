using System.Text.Json;
using System.Text;

namespace HKN.Personel.Native;

internal enum PekMode
{
    LegalAutomatic,
    Manual
}

internal sealed record PayrollProfile(
    string CardNo,
    decimal NetMonthlyEntitlement,
    PekMode PekMode,
    decimal ManualPekGross,
    DateTime UpdatedAtUtc,
    string UpdatedBy);

internal static class PayrollProfileStore
{
    static readonly object Gate = new();
    static string PathName => Path.Combine(CompanyDataPaths.Config, "payroll-profiles.json");

    public static PayrollProfile Load(string cardNo, decimal fallbackNetSalary)
    {
        var normalized = Normalize(cardNo);
        lock (Gate)
        {
            var all = ReadAll();
            if (all.TryGetValue(normalized, out var profile)) return profile;
        }
        return new PayrollProfile(normalized, Math.Max(0m, fallbackNetSalary), PekMode.LegalAutomatic, 0m, DateTime.MinValue, string.Empty);
    }

    public static void Save(PayrollProfile profile)
    {
        var normalized = Normalize(profile.CardNo);
        if (normalized.Length == 0) throw new InvalidOperationException("Kart numarası olmadan bordro profili kaydedilemez.");
        CompanyDataPaths.Ensure();
        lock (Gate)
        {
            var all = ReadAll();
            all[normalized] = profile with
            {
                CardNo = normalized,
                NetMonthlyEntitlement = decimal.Round(Math.Max(0m, profile.NetMonthlyEntitlement), 2),
                ManualPekGross = decimal.Round(Math.Max(0m, profile.ManualPekGross), 2),
                UpdatedAtUtc = DateTime.UtcNow,
                UpdatedBy = Environment.UserName
            };
            var json = JsonSerializer.Serialize(all, JsonOptions);
            var temp = PathName + ".tmp";
            File.WriteAllText(temp, json, new UTF8Encoding(false));
            File.Move(temp, PathName, true);
        }
        WriteAudit(normalized, profile);
    }

    static Dictionary<string, PayrollProfile> ReadAll()
    {
        CompanyDataPaths.Ensure();
        if (!File.Exists(PathName)) return new(StringComparer.OrdinalIgnoreCase);
        try
        {
            var result = JsonSerializer.Deserialize<Dictionary<string, PayrollProfile>>(File.ReadAllText(PathName), JsonOptions);
            return result is null
                ? new(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, PayrollProfile>(result, StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new(StringComparer.OrdinalIgnoreCase);
        }
    }

    static void WriteAudit(string cardNo, PayrollProfile profile)
    {
        try
        {
            var path = System.IO.Path.Combine(CompanyDataPaths.Logs, $"payroll-profile-{DateTime.Today:yyyy}.csv");
            var fresh = !File.Exists(path);
            using var writer = new StreamWriter(path, true, new UTF8Encoding(true));
            if (fresh) writer.WriteLine("Timestamp;WindowsUser;Card;NetEntitlement;PekMode;ManualPekGross");
            writer.WriteLine(string.Join(";",
                Csv(DateTime.Now.ToString("O")), Csv(Environment.UserName), Csv(cardNo),
                Csv(profile.NetMonthlyEntitlement.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)),
                Csv(profile.PekMode.ToString()),
                Csv(profile.ManualPekGross.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture))));
        }
        catch { }
    }

    static string Normalize(string? cardNo)
    {
        var text = (cardNo ?? string.Empty).Trim();
        return text.All(char.IsDigit) && text.Length > 0 ? text.PadLeft(5, '0') : text;
    }

    static string Csv(string value) => """ + value.Replace(""", """") + """;

    static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };
}
