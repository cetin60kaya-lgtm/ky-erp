using System.Globalization;
using System.Text.RegularExpressions;

namespace KyPdks.Shared;

public static class PunchParser
{
    private static readonly string[] DateFormats =
    {
        "ddMMyy", "ddMMyyyy", "dd.MM.yyyy", "dd-MM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd", "yyyy/MM/dd",
    };

    private static readonly string[] TimeFormats = { @"hh\:mm", @"hh\:mm\:ss" };

    public static bool TryParse(string? source, string sourceRef, out RawPunch? punch)
    {
        punch = null;
        var line = (source ?? "").Trim().TrimStart('\uFEFF');
        if (line.Length == 0) return false;

        var parts = Split(line);
        if (parts.Length < 2) return false;

        var cardIndex = Array.FindIndex(parts, IsCard);
        if (cardIndex < 0) return false;
        var card = NormalizeCard(parts[cardIndex]);
        if (card.Length == 0) return false;

        // KY ERP/Hedef: KartNo,Saat,GGAAYY,1,001
        if (cardIndex + 2 < parts.Length && TryTime(parts[cardIndex + 1], out var compactTime) && TryDate(parts[cardIndex + 2], out var compactDate))
        {
            punch = new RawPunch(card, compactDate.Date.Add(compactTime), "IMPORT_FILE", sourceRef, line);
            return true;
        }

        // KartNo,Tarih,Saat veya KartNo;Tarih;Saat
        if (cardIndex + 2 < parts.Length && TryDate(parts[cardIndex + 1], out var date) && TryTime(parts[cardIndex + 2], out var time))
        {
            punch = new RawPunch(card, date.Date.Add(time), "IMPORT_FILE", sourceRef, line);
            return true;
        }

        // Tarih,Saat,KartNo
        if (cardIndex >= 2 && TryDate(parts[cardIndex - 2], out date) && TryTime(parts[cardIndex - 1], out time))
        {
            punch = new RawPunch(card, date.Date.Add(time), "IMPORT_FILE", sourceRef, line);
            return true;
        }

        // Cihazların yaygın tek alanlı çıktıları: 00004 2026-08-30 08:28[:14]
        var free = Regex.Match(line, @"(?<!\d)(?<card>\d{1,10})\s+[-|,;\t ]*\s*(?<date>\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}[.\-/]\d{2}[.\-/]\d{2}|\d{6,8})\s+(?<time>\d{1,2}:\d{2}(?::\d{2})?)(?!\d)");
        if (free.Success && IsCard(free.Groups["card"].Value) && TryDate(free.Groups["date"].Value, out date) && TryTime(free.Groups["time"].Value, out time))
        {
            punch = new RawPunch(NormalizeCard(free.Groups["card"].Value), date.Date.Add(time), "TERMINAL_LINE", sourceRef, line);
            return true;
        }

        return false;
    }

    public static string NormalizeCard(string value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length == 0) return "";
        return digits.Length <= 5 ? digits.PadLeft(5, '0') : digits;
    }

    private static string[] Split(string line) => line
        .Split(new[] { ',', ';', '\t', '|' }, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

    private static bool IsCard(string value)
    {
        var clean = (value ?? "").Trim();
        return Regex.IsMatch(clean, @"^\d{1,10}$");
    }

    private static bool TryDate(string value, out DateTime date)
    {
        var clean = (value ?? "").Trim();
        return DateTime.TryParseExact(clean, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    private static bool TryTime(string value, out TimeSpan time)
    {
        var clean = (value ?? "").Trim();
        if (TimeSpan.TryParseExact(clean, TimeFormats, CultureInfo.InvariantCulture, out time)) return time >= TimeSpan.Zero && time < TimeSpan.FromDays(1);
        if (TimeSpan.TryParse(clean, CultureInfo.InvariantCulture, out time)) return time >= TimeSpan.Zero && time < TimeSpan.FromDays(1);
        return false;
    }
}
