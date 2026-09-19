using System.Globalization;

namespace KYERP.PDKS.Core.Terminal;

public sealed record TnfRecord(string EmployeeCode, TimeOnly Time, DateOnly Date)
{
    public const string EventCode = "1";
    public const string TerminalCode = "001";

    public static TnfRecord Parse(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) throw new FormatException("TNF boş satır içeremez.");
        var parts = line.Split(',', StringSplitOptions.None);
        if (parts.Length != 5) throw new FormatException("TNF satırı tam 5 alan içermelidir.");
        if (parts.Any(value => value != value.Trim())) throw new FormatException("TNF alanlarında başta veya sonda boşluk olamaz.");
        string employeeCode;
        try { employeeCode = PdksValidation.EmployeeCode(parts[0]); }
        catch (ArgumentException exception) { throw new FormatException(exception.Message, exception); }
        if (!TimeOnly.TryParseExact(parts[1], "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
            throw new FormatException("TNF saat alanı kesin HH:mm biçiminde olmalıdır.");
        if (!DateOnly.TryParseExact(parts[2], "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            throw new FormatException("TNF tarih alanı kesin ddMMyy biçiminde olmalıdır.");
        if (parts[3] != EventCode) throw new FormatException("TNF 4. alanı kesin 1 olmalıdır.");
        if (parts[4] != TerminalCode) throw new FormatException("TNF 5. alanı kesin 001 olmalıdır.");
        return new TnfRecord(employeeCode, time, date);
    }

    public override string ToString() => $"{EmployeeCode},{Time.ToString(@"HH\:mm", CultureInfo.InvariantCulture)},{Date.ToString("ddMMyy", CultureInfo.InvariantCulture)},{EventCode},{TerminalCode}";
}
