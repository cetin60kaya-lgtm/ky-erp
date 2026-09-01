using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

public sealed class AuditTempExporter(PdksPaths paths)
{
    public async Task<string> ExportYearAsync(ErpApiClient erp, string token, int year, CancellationToken ct = default)
    {
        if (year < 2000 || year > 2200) throw new InvalidOperationException("Denetim yılı geçersiz.");
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Yıllık TEMP için KY ERP oturumu gerekir.");

        var people = await erp.GetPdksPeopleAsync(token, ct);
        var root = Path.Combine(paths.Root, "TEMP", "DENETIM", year.ToString(CultureInfo.InvariantCulture));
        Directory.CreateDirectory(root);

        var personLines = new List<string> { Csv("PERSONEL_KODU", "AD_SOYAD", "KART_NO", "BOLUM", "GOREV", "ISE_GIRIS", "ISTEN_CIKIS", "DURUM") };
        foreach (var person in people.OrderBy(p => p.PersonnelCode).ThenBy(p => p.FullName))
            personLines.Add(Csv(person.PersonnelCode, person.FullName, person.CardNo, person.Department, person.Title, person.StartDate, person.ExitDate, person.Status));
        await File.WriteAllLinesAsync(Path.Combine(root, $"{year}_PERSONEL.csv"), personLines, new UTF8Encoding(true), ct);

        var attendanceLines = new List<string> { Csv("PERSONEL_KODU", "AD_SOYAD", "KART_NO", "BOLUM", "TARIH", "DURUM", "GIRIS", "CIKIS", "GEC_DK", "ERKEN_DK", "FAZLA_DK", "BASIM", "NOT") };
        var summary = new Dictionary<string, TimesheetRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var person in people)
        {
            var allDays = new List<AttendanceDayRow>();
            for (var month = 1; month <= 12; month++)
            {
                ct.ThrowIfCancellationRequested();
                var days = await erp.GetAttendanceMonthAsync(token, person, year, month, ct);
                allDays.AddRange(days);
                foreach (var row in days)
                    attendanceLines.Add(Csv(row.PersonnelCode, row.FullName, row.CardNo, row.Department, row.Date, row.Status, row.Entry, row.Exit,
                        row.LateMinutes, row.EarlyMinutes, row.OvertimeMinutes, row.EventCount, row.Note));
            }
            var ts = AttendanceStore.BuildTimesheet(allDays).FirstOrDefault();
            if (ts is not null) summary[person.Id] = ts;
        }
        await File.WriteAllLinesAsync(Path.Combine(root, $"{year}_PUANTAJ.csv"), attendanceLines, new UTF8Encoding(true), ct);

        var summaryLines = new List<string> { Csv("PERSONEL_KODU", "AD_SOYAD", "KART_NO", "BOLUM", "CALISTI", "YILLIK_IZIN", "IZIN", "EKSIK_BASIM", "KART_YOK", "GEC_GUN", "GEC_DK", "ERKEN_DK", "FAZLA_DK") };
        foreach (var person in people.OrderBy(p => p.PersonnelCode).ThenBy(p => p.FullName))
        {
            if (!summary.TryGetValue(person.Id, out var row)) continue;
            summaryLines.Add(Csv(row.PersonnelCode, row.FullName, row.CardNo, row.Department, row.WorkedDays, row.AnnualLeaveDays, row.LeaveDays,
                row.MissingPunchDays, row.NoPunchDays, row.LateDays, row.LateMinutes, row.EarlyMinutes, row.OvertimeMinutes));
        }
        await File.WriteAllLinesAsync(Path.Combine(root, $"{year}_AYLIK_OZET.csv"), summaryLines, new UTF8Encoding(true), ct);

        await WriteLocalRawPunchesAsync(root, year, ct);

        var manifest = new[]
        {
            "KY ERP PDKS DENETIM TEMP",
            $"YIL={year}",
            $"URETIM={DateTimeOffset.Now:O}",
            "ANA_KAYNAK=KY ERP D1 / personnel-control",
            "YEREL_KAYNAK=Yalniz ham kart tamponu",
            "KAPSAM=SGK VAR + kartli personel",
            "FINANS=HARIC",
            "UYARI=Bu klasor ana veri degildir; D1 verisinden yeniden uretilebilir salt-okunur denetim snapshotidir.",
        };
        await File.WriteAllLinesAsync(Path.Combine(root, "MANIFEST.txt"), manifest, new UTF8Encoding(true), ct);
        return root;
    }

    private async Task WriteLocalRawPunchesAsync(string root, int year, CancellationToken ct)
    {
        var lines = new List<string> { Csv("PERSONEL_KODU", "AD_SOYAD", "KART_NO", "TARIH", "SAAT", "YON", "KAYNAK", "ERP_DURUM") };
        var connectionString = new SqliteConnectionStringBuilder { DataSource = paths.Database, Mode = SqliteOpenMode.ReadOnly, Cache = SqliteCacheMode.Shared }.ToString();
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT COALESCE(pc.personnel_code,''),COALESCE(pc.full_name,''),p.card_no,p.work_date,p.event_time,p.direction,p.source,p.sync_state
              FROM raw_punches p
              LEFT JOIN people_cache pc ON pc.card_no=p.card_no
             WHERE p.work_date >= $start AND p.work_date <= $end
               AND pc.employee_id IS NOT NULL
             ORDER BY p.work_date,p.event_time,p.card_no;
            """;
        command.Parameters.AddWithValue("$start", $"{year:D4}-01-01");
        command.Parameters.AddWithValue("$end", $"{year:D4}-12-31");
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            lines.Add(Csv(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7)));
        await File.WriteAllLinesAsync(Path.Combine(root, $"{year}_HAM_KART.csv"), lines, new UTF8Encoding(true), ct);
    }

    private static string Csv(params object?[] cells) => string.Join(';', cells.Select(cell =>
    {
        var value = Convert.ToString(cell, CultureInfo.InvariantCulture) ?? "";
        return value.Contains(';') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }));
}
