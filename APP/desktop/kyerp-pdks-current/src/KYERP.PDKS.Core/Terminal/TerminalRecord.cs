using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace KYERP.PDKS.Core.Terminal;

public sealed record TerminalRecord(
    string EmployeeCode,
    DateTime OccurredAt,
    int EventCode,
    string TerminalCode,
    string SourceLineHash)
{
    private static readonly string[] DateFormats = ["ddMMyy", "ddMMyyyy", "yyyyMMdd"];

    public static bool TryParse(string? line, out TerminalRecord? record, out string? error)
    {
        record = null;
        error = null;
        if (string.IsNullOrWhiteSpace(line)) { error = "Boş terminal satırı."; return false; }
        var parts = line.Trim().Split(',', StringSplitOptions.TrimEntries);
        if (parts.Length != 5) { error = "Terminal satırı 5 alandan oluşmalıdır."; return false; }

        string employeeCode;
        try { employeeCode = PdksValidation.EmployeeCode(parts[0]); }
        catch (ArgumentException exception) { error = exception.Message; return false; }

        if (!TimeOnly.TryParseExact(parts[1], "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        { error = "Terminal saat alanı HH:mm biçiminde olmalıdır."; return false; }
        if (!DateOnly.TryParseExact(parts[2], DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        { error = "Terminal tarih alanı desteklenen biçimde değil."; return false; }
        if (!int.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out var eventCode) || eventCode < 0)
        { error = "Terminal olay kodu geçersiz."; return false; }
        if (parts[4].Length == 0) { error = "Terminal kodu zorunludur."; return false; }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(line.Trim()))).ToLowerInvariant();
        record = new TerminalRecord(employeeCode, date.ToDateTime(time), eventCode, parts[4], hash);
        return true;
    }
}
