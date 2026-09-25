using System.Globalization;
using System.Text.RegularExpressions;

namespace KYERP.PDKS.Core;

public static partial class PdksValidation
{
    [GeneratedRegex("^[0-9]{5}$", RegexOptions.CultureInvariant)]
    private static partial Regex EmployeeCodePattern();

    public static string EmployeeCode(string? value)
    {
        var result = value?.Trim() ?? string.Empty;
        if (!EmployeeCodePattern().IsMatch(result))
            throw new ArgumentException("Kart No tam olarak 5 rakam olmalıdır.");
        return result;
    }

    public static string RequiredText(string? value, string fieldName, int maxLength = 100)
    {
        var result = value?.Trim() ?? string.Empty;
        if (result.Length == 0) throw new ArgumentException($"{fieldName} zorunludur.");
        if (result.Length > maxLength) throw new ArgumentException($"{fieldName} en fazla {maxLength} karakter olabilir.");
        return result;
    }

    public static void EmploymentDates(DateTime start, DateTime? end)
    {
        if (end.HasValue && end.Value.Date < start.Date)
            throw new ArgumentException("İşten çıkış tarihi işe giriş tarihinden önce olamaz.");
    }

    public static void AttendanceRange(DateTime entrance, DateTime exit)
    {
        if (exit <= entrance) throw new ArgumentException("Çıkış zamanı giriş zamanından sonra olmalıdır.");
    }

    public static int PositiveMinutes(int minutes, string fieldName = "Süre")
    {
        if (minutes <= 0) throw new ArgumentException($"{fieldName} sıfırdan büyük olmalıdır.");
        return minutes;
    }

    public static decimal PositiveMoney(decimal amount, string fieldName = "Miktar")
    {
        if (amount <= 0) throw new ArgumentException($"{fieldName} sıfırdan büyük olmalıdır.");
        return decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
    }

    public static decimal ParseMoney(string? value, string fieldName)
    {
        var text = value?.Trim() ?? string.Empty;
        if (!decimal.TryParse(text, NumberStyles.Number, new CultureInfo("tr-TR"), out var amount) &&
            !decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out amount))
            throw new ArgumentException($"{fieldName} geçersiz.");
        return PositiveMoney(amount, fieldName);
    }
}
