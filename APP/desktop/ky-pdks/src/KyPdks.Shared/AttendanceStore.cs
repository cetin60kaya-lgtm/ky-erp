using System.Globalization;
using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

public sealed class AttendanceStore(PdksPaths paths)
{
    private const string DefaultIn = "08:30";
    private const string DefaultOut = "19:00";
    private const int DefaultLateTolerance = 5;
    private const int DefaultEarlyTolerance = 10;

    private string ConnectionString => new SqliteConnectionStringBuilder
    {
        DataSource = paths.Database,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Shared,
        Pooling = true,
    }.ToString();

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        var baseStore = new LocalPdksStore(paths);
        await baseStore.InitializeAsync(ct);
        var operations = new PdksOperationsStore(paths);
        await operations.InitializeAsync(ct);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS attendance_cache (
              employee_id TEXT NOT NULL,
              work_date TEXT NOT NULL,
              status TEXT NOT NULL,
              entry_time TEXT,
              exit_time TEXT,
              late_minutes INTEGER NOT NULL DEFAULT 0,
              early_minutes INTEGER NOT NULL DEFAULT 0,
              overtime_minutes INTEGER NOT NULL DEFAULT 0,
              missing_punch INTEGER NOT NULL DEFAULT 0,
              event_count INTEGER NOT NULL DEFAULT 0,
              note TEXT,
              cached_at TEXT NOT NULL,
              PRIMARY KEY(employee_id,work_date)
            );
            CREATE INDEX IF NOT EXISTS idx_attendance_cache_date ON attendance_cache(work_date,employee_id);
            """;
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task CacheEmployeeMonthAsync(string employeeId, int year, int month, IEnumerable<AttendanceDayRow> days, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var prefix = $"{year:D4}-{month:D2}-%";
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(ct);
        await using (var clear = connection.CreateCommand())
        {
            clear.Transaction = transaction;
            clear.CommandText = "DELETE FROM attendance_cache WHERE employee_id=$employee AND work_date LIKE $prefix";
            clear.Parameters.AddWithValue("$employee", employeeId);
            clear.Parameters.AddWithValue("$prefix", prefix);
            await clear.ExecuteNonQueryAsync(ct);
        }
        foreach (var day in days)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO attendance_cache
                  (employee_id,work_date,status,entry_time,exit_time,late_minutes,early_minutes,overtime_minutes,missing_punch,event_count,note,cached_at)
                VALUES($employee,$date,$status,$entry,$exit,$late,$early,$overtime,$missing,$count,$note,$now)
                ON CONFLICT(employee_id,work_date) DO UPDATE SET
                  status=excluded.status,entry_time=excluded.entry_time,exit_time=excluded.exit_time,
                  late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,
                  missing_punch=excluded.missing_punch,event_count=excluded.event_count,note=excluded.note,cached_at=excluded.cached_at;
                """;
            command.Parameters.AddWithValue("$employee", employeeId);
            command.Parameters.AddWithValue("$date", day.Date);
            command.Parameters.AddWithValue("$status", day.Status ?? "");
            command.Parameters.AddWithValue("$entry", day.Entry ?? "");
            command.Parameters.AddWithValue("$exit", day.Exit ?? "");
            command.Parameters.AddWithValue("$late", day.LateMinutes);
            command.Parameters.AddWithValue("$early", day.EarlyMinutes);
            command.Parameters.AddWithValue("$overtime", day.OvertimeMinutes);
            command.Parameters.AddWithValue("$missing", day.MissingPunch ? 1 : 0);
            command.Parameters.AddWithValue("$count", day.EventCount);
            command.Parameters.AddWithValue("$note", day.Note ?? "");
            command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
            await command.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    public async Task<IReadOnlyList<AttendanceDayRow>> BuildMonthAsync(int year, int month, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var start = new DateTime(year, month, 1);
        var end = start.AddMonths(1).AddDays(-1);
        var startText = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var endText = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        var people = await LoadPeopleAsync(connection, ct);
        var cached = await LoadCachedAsync(connection, startText, endText, ct);
        var raw = await LoadRawAsync(connection, startText, endText, ct);
        var schedules = await LoadSchedulesAsync(connection, ct);
        var holidays = await LoadHolidaysAsync(connection, startText, endText, ct);
        var leaves = await LoadLeavesAsync(connection, startText, endText, ct);
        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var rows = new List<AttendanceDayRow>(people.Count * DateTime.DaysInMonth(year, month));

        foreach (var person in people)
        {
            var schedule = schedules.TryGetValue(person.Id, out var configured)
                ? configured
                : new Schedule(DefaultIn, DefaultOut, DefaultLateTolerance, DefaultEarlyTolerance);
            var expectedIn = Minutes(schedule.Entry) ?? Minutes(DefaultIn)!.Value;
            var expectedOut = Minutes(schedule.Exit) ?? Minutes(DefaultOut)!.Value;

            for (var date = start; date <= end; date = date.AddDays(1))
            {
                var day = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                var key = Key(person.Id, day);
                cached.TryGetValue(key, out var erp);
                raw.TryGetValue(Key(person.CardNo, day), out var rawTimes);
                rawTimes ??= new List<string>();
                rawTimes.Sort(StringComparer.Ordinal);
                var outside = (!string.IsNullOrWhiteSpace(person.StartDate) && string.CompareOrdinal(day, person.StartDate) < 0)
                    || (!string.IsNullOrWhiteSpace(person.ExitDate) && string.CompareOrdinal(day, person.ExitDate) > 0);
                var future = string.CompareOrdinal(day, today) > 0;

                if (rawTimes.Count > 0)
                {
                    var entry = rawTimes[0][..Math.Min(5, rawTimes[0].Length)];
                    var exit = rawTimes.Count > 1 ? rawTimes[^1][..Math.Min(5, rawTimes[^1].Length)] : "";
                    if (outside || future)
                    {
                        rows.Add(new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                            day, "DONEM_DISI", entry, exit, 0, 0, 0, false, rawTimes.Count,
                            "Çalışma dönemi dışındaki ham kart; puantaja dahil edilmedi.", "LOCAL_CONTROL"));
                        continue;
                    }

                    var late = Minutes(entry) is int inMin ? Math.Max(0, inMin - expectedIn - schedule.LateTolerance) : 0;
                    var early = Minutes(exit) is int outMin ? Math.Max(0, expectedOut - outMin - schedule.EarlyTolerance) : 0;
                    var overtime = Minutes(exit) is int overtimeMin ? Math.Max(0, overtimeMin - expectedOut) : 0;
                    rows.Add(new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                        day, rawTimes.Count > 1 ? "CALISTI" : "EKSIK_BASIM", entry, exit, late, early, overtime,
                        rawTimes.Count == 1, rawTimes.Count, erp?.Note ?? "", erp is null ? "LOCAL" : "LOCAL+ERP"));
                    continue;
                }

                if (!outside && !future && leaves.TryGetValue(key, out var leave))
                {
                    rows.Add(new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                        day, leave.Type, "", "", 0, 0, 0, false, 0, leave.Note, "LOCAL_OPERATION"));
                    continue;
                }

                if (!outside && !future && holidays.TryGetValue(day, out var holiday))
                {
                    rows.Add(new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                        day, "RESMI_TATIL", "", "", 0, 0, 0, false, 0, holiday, "LOCAL_OPERATION"));
                    continue;
                }

                if (erp is not null)
                {
                    var working = erp.Status is "CALISTI" or "EKSIK_BASIM";
                    var late = working && Minutes(erp.Entry) is int inMin ? Math.Max(0, inMin - expectedIn - schedule.LateTolerance) : 0;
                    var early = working && Minutes(erp.Exit) is int outMin ? Math.Max(0, expectedOut - outMin - schedule.EarlyTolerance) : 0;
                    var overtime = working && Minutes(erp.Exit) is int overtimeMin ? Math.Max(0, overtimeMin - expectedOut) : 0;
                    rows.Add(erp with
                    {
                        PersonnelCode = person.PersonnelCode,
                        FullName = person.FullName,
                        Department = person.Department,
                        CardNo = person.CardNo,
                        LateMinutes = late,
                        EarlyMinutes = early,
                        OvertimeMinutes = overtime,
                        DataSource = "ERP_CACHE",
                    });
                    continue;
                }

                var status = outside || future ? "DONEM_DISI"
                    : date.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday ? "HAFTA_SONU"
                    : "KART_YOK";
                rows.Add(new AttendanceDayRow(person.Id, person.PersonnelCode, person.FullName, person.Department, person.CardNo,
                    day, status, "", "", 0, 0, 0, false, 0, "", "LOCAL"));
            }
        }
        return rows;
    }

    public static IReadOnlyList<TimesheetRow> BuildTimesheet(IEnumerable<AttendanceDayRow> source)
    {
        return source.GroupBy(row => row.EmployeeId).Select(group =>
        {
            var first = group.First();
            return new TimesheetRow(first.EmployeeId, first.PersonnelCode, first.FullName, first.Department, first.CardNo,
                group.Count(row => row.Status is "CALISTI" or "EKSIK_BASIM"),
                group.Count(row => row.Status == "YILLIK_IZIN"),
                group.Count(row => row.Status == "IZIN"),
                group.Count(row => row.Status == "EKSIK_BASIM"),
                group.Count(row => row.Status is "KART_YOK" or "DEVAMSIZ"),
                group.Count(row => row.LateMinutes > 0),
                group.Sum(row => row.LateMinutes), group.Sum(row => row.EarlyMinutes), group.Sum(row => row.OvertimeMinutes));
        }).OrderBy(row => row.FullName, StringComparer.Create(new CultureInfo("tr-TR"), true)).ToArray();
    }

    private static async Task<List<CachedPerson>> LoadPeopleAsync(SqliteConnection connection, CancellationToken ct)
    {
        var people = new List<CachedPerson>();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT employee_id,personnel_code,full_name,department,title,sgk_status,status,card_no,start_date,exit_date FROM people_cache WHERE UPPER(sgk_status)='VAR' AND TRIM(card_no)<>'' ORDER BY full_name COLLATE NOCASE";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            people.Add(new CachedPerson(reader.GetString(0), Text(reader, 1), reader.GetString(2), Text(reader, 3), Text(reader, 4), reader.GetString(5), Text(reader, 6), reader.GetString(7), Text(reader, 8), Text(reader, 9)));
        return people;
    }

    private static async Task<Dictionary<string, AttendanceDayRow>> LoadCachedAsync(SqliteConnection connection, string start, string end, CancellationToken ct)
    {
        var result = new Dictionary<string, AttendanceDayRow>(StringComparer.OrdinalIgnoreCase);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT employee_id,work_date,status,entry_time,exit_time,late_minutes,early_minutes,overtime_minutes,missing_punch,event_count,note FROM attendance_cache WHERE work_date BETWEEN $start AND $end";
        command.Parameters.AddWithValue("$start", start);
        command.Parameters.AddWithValue("$end", end);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var employeeId = reader.GetString(0);
            var date = reader.GetString(1);
            result[Key(employeeId, date)] = new AttendanceDayRow(employeeId, "", "", "", "", date, reader.GetString(2),
                Text(reader, 3), Text(reader, 4), reader.GetInt32(5), reader.GetInt32(6), reader.GetInt32(7), reader.GetInt32(8) != 0,
                reader.GetInt32(9), Text(reader, 10), "ERP_CACHE");
        }
        return result;
    }

    private static async Task<Dictionary<string, List<string>>> LoadRawAsync(SqliteConnection connection, string start, string end, CancellationToken ct)
    {
        var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT p.card_no,p.work_date,p.event_time FROM raw_punches p
             WHERE p.work_date BETWEEN $start AND $end
               AND NOT EXISTS (SELECT 1 FROM voided_events v WHERE v.event_id=p.id)
             ORDER BY p.work_date,p.event_time;
            """;
        command.Parameters.AddWithValue("$start", start);
        command.Parameters.AddWithValue("$end", end);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var key = Key(reader.GetString(0), reader.GetString(1));
            if (!result.TryGetValue(key, out var list)) result[key] = list = new List<string>();
            list.Add(reader.GetString(2));
        }
        return result;
    }

    private static async Task<Dictionary<string, Schedule>> LoadSchedulesAsync(SqliteConnection connection, CancellationToken ct)
    {
        var result = new Dictionary<string, Schedule>(StringComparer.OrdinalIgnoreCase);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT eg.employee_id,w.entry_time,w.exit_time,w.late_tolerance,w.early_tolerance FROM employee_groups eg JOIN work_groups w ON w.id=eg.group_id WHERE w.active=1";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result[reader.GetString(0)] = new Schedule(reader.GetString(1), reader.GetString(2), reader.GetInt32(3), reader.GetInt32(4));
        return result;
    }

    private static async Task<Dictionary<string, string>> LoadHolidaysAsync(SqliteConnection connection, string start, string end, CancellationToken ct)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT work_date,name,half_day FROM holidays_local WHERE work_date BETWEEN $start AND $end";
        command.Parameters.AddWithValue("$start", start);
        command.Parameters.AddWithValue("$end", end);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result[reader.GetString(0)] = reader.GetInt32(2) != 0 ? $"{reader.GetString(1)} · Yarım gün" : reader.GetString(1);
        return result;
    }

    private static async Task<Dictionary<string, LocalLeave>> LoadLeavesAsync(SqliteConnection connection, string start, string end, CancellationToken ct)
    {
        var result = new Dictionary<string, LocalLeave>(StringComparer.OrdinalIgnoreCase);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT employee_id,start_date,end_date,leave_type,COALESCE(note,'') FROM leaves_local WHERE start_date<=$end AND end_date>=$start";
        command.Parameters.AddWithValue("$start", start);
        command.Parameters.AddWithValue("$end", end);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var employee = reader.GetString(0);
            if (!DateTime.TryParseExact(reader.GetString(1), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from)) continue;
            if (!DateTime.TryParseExact(reader.GetString(2), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to)) continue;
            var type = reader.GetString(3);
            var note = reader.GetString(4);
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                var day = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                if (string.CompareOrdinal(day, start) < 0 || string.CompareOrdinal(day, end) > 0) continue;
                result[Key(employee, day)] = new LocalLeave(type, note);
            }
        }
        return result;
    }

    private static string Text(SqliteDataReader reader, int index) => reader.IsDBNull(index) ? "" : reader.GetString(index);
    private static string Key(string first, string second) => $"{first}\u001f{second}";

    private static int? Minutes(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var parts = value.Split(':');
        return parts.Length >= 2 && int.TryParse(parts[0], out var h) && int.TryParse(parts[1], out var m) ? h * 60 + m : null;
    }

    private sealed record Schedule(string Entry, string Exit, int LateTolerance, int EarlyTolerance);
    private sealed record LocalLeave(string Type, string Note);
}
