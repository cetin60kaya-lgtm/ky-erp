using System.Globalization;

namespace KYERP.PDKS.Core.Terminal;

public enum TerminalDirection { Entry, Exit, Unknown }

public sealed record ProfiledTerminalRecord(
    string EmployeeCode, DateTime OccurredAt, string EventCode, string TerminalCode,
    TerminalDirection Direction, string SourceFingerprint);

public static class ProfiledTerminalParser
{
    public static ProfiledTerminalRecord Parse(TerminalTransferProfile profile, string line)
    {
        profile.Validate();
        if (profile.FormatType == TerminalFormatType.Tnf)
        {
            var value = TnfRecord.Parse(line);
            return Create(profile, value.EmployeeCode, value.Date.ToString(profile.DateFormat, CultureInfo.InvariantCulture),
                value.Time.ToString(profile.TimeFormat, CultureInfo.InvariantCulture), TnfRecord.EventCode, TnfRecord.TerminalCode, line);
        }

        if (profile.FormatType == TerminalFormatType.FixedWidth)
        {
            var employee = profile.EmployeeCode!.Read(line, "Kart No");
            var date = profile.Day!.Read(line, "Gün") + profile.Month!.Read(line, "Ay") + profile.Year!.Read(line, "Yıl");
            var time = profile.Hour!.Read(line, "Saat") + ":" + profile.Minute!.Read(line, "Dakika");
            return Create(profile, employee, date, time, profile.EventCode!.Read(line, "Olay"), profile.TerminalCode!.Read(line, "Terminal"), line);
        }

        var columns = line.Split(profile.Separator, StringSplitOptions.None);
        string Column(FieldSlice? field, string name)
        {
            if (field is null || field.Start < 0 || field.Start >= columns.Length) throw new FormatException($"{name} kolon indeksi geçersiz.");
            return columns[field.Start].Trim();
        }
        var dateValue = Column(profile.Day, "Tarih");
        var timeValue = Column(profile.Hour, "Saat");
        return Create(profile, Column(profile.EmployeeCode, "Kart No"), dateValue, timeValue,
            Column(profile.EventCode, "Olay"), Column(profile.TerminalCode, "Terminal"), line);
    }

    private static ProfiledTerminalRecord Create(TerminalTransferProfile profile, string employee, string date, string time, string eventCode, string terminalCode, string source)
    {
        employee = PdksValidation.EmployeeCode(employee);
        if (!DateOnly.TryParseExact(date, profile.DateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate))
            throw new FormatException($"Tarih {profile.DateFormat} biçiminde değil.");
        if (!TimeOnly.TryParseExact(time, profile.TimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedTime))
            throw new FormatException($"Saat {profile.TimeFormat} biçiminde değil.");
        var direction = profile.EntryCodeMapping.ContainsKey(eventCode) ? TerminalDirection.Entry :
            profile.ExitCodeMapping.ContainsKey(eventCode) ? TerminalDirection.Exit : TerminalDirection.Unknown;
        var fingerprint = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{profile.Id:N}|{source}"))).ToLowerInvariant();
        return new ProfiledTerminalRecord(employee, parsedDate.ToDateTime(parsedTime), eventCode, terminalCode, direction, fingerprint);
    }
}
