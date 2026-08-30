using System.Globalization;
using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

public sealed record PdksPeriodRow(int Year, int Month, string Status, string Note, string Label);
public sealed record WorkGroupRow(string Id, string Name, string EntryTime, string ExitTime, int LateTolerance, int EarlyTolerance, bool Active);
public sealed record HolidayRow(string Id, string Date, string Name, bool HalfDay);
public sealed record LeaveRow(string Id, string EmployeeId, string FullName, string StartDate, string EndDate, string Type, string Note);
public sealed record AdvanceRow(string Id, string EmployeeId, string FullName, string Date, decimal Amount, string Note);
public sealed record DepartmentRow(string Department, int PersonCount);
public sealed record AuditRow(string Id, string EventType, string EntityId, string Description, string Actor, string CreatedAt);

public sealed class PdksOperationsStore(PdksPaths paths)
{
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

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS pdks_periods (
              year INTEGER NOT NULL,
              month INTEGER NOT NULL,
              status TEXT NOT NULL DEFAULT 'OPEN',
              note TEXT,
              updated_at TEXT NOT NULL,
              PRIMARY KEY(year,month)
            );
            CREATE TABLE IF NOT EXISTS work_groups (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              entry_time TEXT NOT NULL,
              exit_time TEXT NOT NULL,
              late_tolerance INTEGER NOT NULL DEFAULT 0,
              early_tolerance INTEGER NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS employee_groups (
              employee_id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS holidays_local (
              id TEXT PRIMARY KEY,
              work_date TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              half_day INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS leaves_local (
              id TEXT PRIMARY KEY,
              employee_id TEXT NOT NULL,
              start_date TEXT NOT NULL,
              end_date TEXT NOT NULL,
              leave_type TEXT NOT NULL,
              note TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_leaves_local_dates ON leaves_local(start_date,end_date,employee_id);
            CREATE TABLE IF NOT EXISTS advances_local (
              id TEXT PRIMARY KEY,
              employee_id TEXT NOT NULL,
              advance_date TEXT NOT NULL,
              amount REAL NOT NULL,
              note TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_advances_local_date ON advances_local(advance_date,employee_id);
            CREATE TABLE IF NOT EXISTS voided_events (
              event_id TEXT PRIMARY KEY,
              reason TEXT,
              actor TEXT,
              voided_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pdks_audit_log (
              id TEXT PRIMARY KEY,
              event_type TEXT NOT NULL,
              entity_id TEXT,
              description TEXT NOT NULL,
              actor TEXT,
              created_at TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync(ct);

        await using var seed = connection.CreateCommand();
        seed.CommandText = """
            INSERT OR IGNORE INTO work_groups(id,name,entry_time,exit_time,late_tolerance,early_tolerance,active,updated_at)
            VALUES('NORMAL','Normal Mesai','08:30','19:00',0,0,1,$now);
            INSERT OR IGNORE INTO pdks_periods(year,month,status,note,updated_at)
            VALUES($year,$month,'OPEN','',$now);
            """;
        seed.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        seed.Parameters.AddWithValue("$year", DateTime.Today.Year);
        seed.Parameters.AddWithValue("$month", DateTime.Today.Month);
        await seed.ExecuteNonQueryAsync(ct);
    }

    public async Task<IReadOnlyList<PdksPeriodRow>> GetPeriodsAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<PdksPeriodRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT year,month,status,COALESCE(note,'') FROM pdks_periods ORDER BY year DESC,month DESC";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var year = reader.GetInt32(0);
            var month = reader.GetInt32(1);
            rows.Add(new PdksPeriodRow(year, month, reader.GetString(2), reader.GetString(3), $"{month:D2}/{year}"));
        }
        return rows;
    }

    public async Task SetPeriodStatusAsync(int year, int month, string status, string note, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        status = string.Equals(status, "CLOSED", StringComparison.OrdinalIgnoreCase) ? "CLOSED" : "OPEN";
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO pdks_periods(year,month,status,note,updated_at) VALUES($year,$month,$status,$note,$now)
            ON CONFLICT(year,month) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$year", year);
        command.Parameters.AddWithValue("$month", month);
        command.Parameters.AddWithValue("$status", status);
        command.Parameters.AddWithValue("$note", note ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("PERIOD", $"{year:D4}-{month:D2}", $"Dönem {status}", actor, ct);
    }

    public async Task<IReadOnlyList<WorkGroupRow>> GetGroupsAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<WorkGroupRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,name,entry_time,exit_time,late_tolerance,early_tolerance,active FROM work_groups ORDER BY active DESC,name COLLATE NOCASE";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            rows.Add(new WorkGroupRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetInt32(4), reader.GetInt32(5), reader.GetInt32(6) != 0));
        return rows;
    }

    public async Task SaveGroupAsync(WorkGroupRow row, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        if (string.IsNullOrWhiteSpace(row.Name)) throw new InvalidOperationException("Çalışma grubu adı zorunludur.");
        var id = string.IsNullOrWhiteSpace(row.Id) ? Guid.NewGuid().ToString("N") : row.Id.Trim();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO work_groups(id,name,entry_time,exit_time,late_tolerance,early_tolerance,active,updated_at)
            VALUES($id,$name,$entry,$exit,$late,$early,$active,$now)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,entry_time=excluded.entry_time,exit_time=excluded.exit_time,
              late_tolerance=excluded.late_tolerance,early_tolerance=excluded.early_tolerance,active=excluded.active,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$name", row.Name.Trim());
        command.Parameters.AddWithValue("$entry", NormalizeTime(row.EntryTime, "08:30"));
        command.Parameters.AddWithValue("$exit", NormalizeTime(row.ExitTime, "19:00"));
        command.Parameters.AddWithValue("$late", Math.Max(0, row.LateTolerance));
        command.Parameters.AddWithValue("$early", Math.Max(0, row.EarlyTolerance));
        command.Parameters.AddWithValue("$active", row.Active ? 1 : 0);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("GROUP", id, $"Çalışma grubu kaydedildi: {row.Name}", actor, ct);
    }

    public async Task AssignGroupAsync(string employeeId, string groupId, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO employee_groups(employee_id,group_id,updated_at) VALUES($employee,$group,$now)
            ON CONFLICT(employee_id) DO UPDATE SET group_id=excluded.group_id,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$employee", employeeId);
        command.Parameters.AddWithValue("$group", groupId);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("GROUP_ASSIGN", employeeId, $"Personel çalışma grubuna atandı: {groupId}", actor, ct);
    }

    public async Task<IReadOnlyList<HolidayRow>> GetHolidaysAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<HolidayRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,work_date,name,half_day FROM holidays_local ORDER BY work_date DESC";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) rows.Add(new HolidayRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3) != 0));
        return rows;
    }

    public async Task SaveHolidayAsync(string date, string name, bool halfDay, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var normalizedDate = NormalizeDate(date);
        if (string.IsNullOrWhiteSpace(name)) throw new InvalidOperationException("Tatil adı zorunludur.");
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO holidays_local(id,work_date,name,half_day,updated_at) VALUES($id,$date,$name,$half,$now)
            ON CONFLICT(work_date) DO UPDATE SET name=excluded.name,half_day=excluded.half_day,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("$date", normalizedDate);
        command.Parameters.AddWithValue("$name", name.Trim());
        command.Parameters.AddWithValue("$half", halfDay ? 1 : 0);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("HOLIDAY", normalizedDate, $"Tatil kaydedildi: {name}", actor, ct);
    }

    public async Task<IReadOnlyList<LeaveRow>> GetLeavesAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<LeaveRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT l.id,l.employee_id,COALESCE(p.full_name,''),l.start_date,l.end_date,l.leave_type,COALESCE(l.note,'')
              FROM leaves_local l LEFT JOIN people_cache p ON p.employee_id=l.employee_id
             ORDER BY l.start_date DESC,p.full_name COLLATE NOCASE;
            """;
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            rows.Add(new LeaveRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6)));
        return rows;
    }

    public async Task SaveLeaveAsync(string employeeId, string startDate, string endDate, string type, string note, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        if (string.IsNullOrWhiteSpace(employeeId)) throw new InvalidOperationException("Personel seçin.");
        var start = NormalizeDate(startDate);
        var end = NormalizeDate(endDate);
        if (string.CompareOrdinal(end, start) < 0) throw new InvalidOperationException("İzin bitiş tarihi başlangıçtan önce olamaz.");
        var normalizedType = string.Equals(type, "YILLIK_IZIN", StringComparison.OrdinalIgnoreCase) ? "YILLIK_IZIN" : "IZIN";
        var id = Guid.NewGuid().ToString("N");
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO leaves_local(id,employee_id,start_date,end_date,leave_type,note,updated_at) VALUES($id,$employee,$start,$end,$type,$note,$now)";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$employee", employeeId);
        command.Parameters.AddWithValue("$start", start);
        command.Parameters.AddWithValue("$end", end);
        command.Parameters.AddWithValue("$type", normalizedType);
        command.Parameters.AddWithValue("$note", note ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("LEAVE", id, $"İzin kaydedildi: {start} - {end} / {normalizedType}", actor, ct);
    }

    public async Task<IReadOnlyList<AdvanceRow>> GetAdvancesAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<AdvanceRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT a.id,a.employee_id,COALESCE(p.full_name,''),a.advance_date,a.amount,COALESCE(a.note,'')
              FROM advances_local a LEFT JOIN people_cache p ON p.employee_id=a.employee_id
             ORDER BY a.advance_date DESC,p.full_name COLLATE NOCASE;
            """;
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            rows.Add(new AdvanceRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetDecimal(4), reader.GetString(5)));
        return rows;
    }

    public async Task SaveAdvanceAsync(string employeeId, string date, decimal amount, string note, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        if (string.IsNullOrWhiteSpace(employeeId)) throw new InvalidOperationException("Personel seçin.");
        if (amount <= 0) throw new InvalidOperationException("Avans tutarı sıfırdan büyük olmalıdır.");
        var id = Guid.NewGuid().ToString("N");
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO advances_local(id,employee_id,advance_date,amount,note,updated_at) VALUES($id,$employee,$date,$amount,$note,$now)";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$employee", employeeId);
        command.Parameters.AddWithValue("$date", NormalizeDate(date));
        command.Parameters.AddWithValue("$amount", amount);
        command.Parameters.AddWithValue("$note", note ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("ADVANCE", id, $"Avans kaydedildi: {amount:N2}", actor, ct);
    }

    public async Task<IReadOnlyList<DepartmentRow>> GetDepartmentsAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<DepartmentRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT CASE WHEN TRIM(COALESCE(department,''))='' THEN 'Genel' ELSE department END,COUNT(*) FROM people_cache GROUP BY CASE WHEN TRIM(COALESCE(department,''))='' THEN 'Genel' ELSE department END ORDER BY 1 COLLATE NOCASE";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) rows.Add(new DepartmentRow(reader.GetString(0), reader.GetInt32(1)));
        return rows;
    }

    public async Task VoidEventAsync(string eventId, string reason, string actor, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        if (string.IsNullOrWhiteSpace(eventId)) throw new InvalidOperationException("Kart hareketi seçin.");
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT OR REPLACE INTO voided_events(event_id,reason,actor,voided_at) VALUES($id,$reason,$actor,$now)";
        command.Parameters.AddWithValue("$id", eventId);
        command.Parameters.AddWithValue("$reason", string.IsNullOrWhiteSpace(reason) ? "Manuel iptal" : reason.Trim());
        command.Parameters.AddWithValue("$actor", actor ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
        await AuditAsync("VOID_EVENT", eventId, $"Kart hareketi yerel hesaplamadan çıkarıldı: {reason}", actor, ct);
    }

    public async Task<IReadOnlyList<AuditRow>> GetAuditAsync(int limit = 300, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<AuditRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT id,event_type,COALESCE(entity_id,''),description,COALESCE(actor,''),created_at FROM pdks_audit_log ORDER BY created_at DESC LIMIT $limit";
        command.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 2000));
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) rows.Add(new AuditRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5)));
        return rows;
    }

    public async Task AuditAsync(string eventType, string entityId, string description, string actor, CancellationToken ct = default)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO pdks_audit_log(id,event_type,entity_id,description,actor,created_at) VALUES($id,$type,$entity,$description,$actor,$now)";
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("$type", eventType ?? "INFO");
        command.Parameters.AddWithValue("$entity", entityId ?? "");
        command.Parameters.AddWithValue("$description", description ?? "");
        command.Parameters.AddWithValue("$actor", actor ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
    }

    private static string NormalizeDate(string value)
    {
        if (DateTime.TryParse(value, CultureInfo.GetCultureInfo("tr-TR"), DateTimeStyles.None, out var tr)) return tr.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var iso)) return iso.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        throw new InvalidOperationException("Tarih geçersiz. Örnek: 30.08.2026");
    }

    private static string NormalizeTime(string value, string fallback)
    {
        return TimeSpan.TryParse(value, CultureInfo.InvariantCulture, out var time) ? $"{(int)time.TotalHours:D2}:{time.Minutes:D2}" : fallback;
    }
}
