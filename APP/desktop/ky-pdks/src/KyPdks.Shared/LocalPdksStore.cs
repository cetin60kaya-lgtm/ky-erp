using System.Globalization;
using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

public sealed class LocalPdksStore(PdksPaths paths)
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
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                PRAGMA foreign_keys=ON;
                PRAGMA busy_timeout=5000;
                CREATE TABLE IF NOT EXISTS raw_punches (
                  id TEXT PRIMARY KEY,
                  fingerprint TEXT NOT NULL UNIQUE,
                  card_no TEXT NOT NULL,
                  event_at TEXT NOT NULL,
                  work_date TEXT NOT NULL,
                  event_time TEXT NOT NULL,
                  direction TEXT NOT NULL DEFAULT 'AUTO',
                  source TEXT NOT NULL,
                  source_ref TEXT,
                  raw_line TEXT,
                  sync_state TEXT NOT NULL DEFAULT 'PENDING',
                  sync_error TEXT,
                  received_at TEXT NOT NULL,
                  synced_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_raw_punches_pending ON raw_punches(sync_state,work_date,event_time);
                CREATE INDEX IF NOT EXISTS idx_raw_punches_card_date ON raw_punches(card_no,work_date,event_time);
                CREATE TABLE IF NOT EXISTS agent_state (
                  state_key TEXT PRIMARY KEY,
                  state_value TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS people_cache (
                  employee_id TEXT PRIMARY KEY,
                  personnel_code TEXT,
                  full_name TEXT NOT NULL,
                  department TEXT,
                  title TEXT,
                  sgk_status TEXT NOT NULL,
                  status TEXT,
                  card_no TEXT NOT NULL UNIQUE,
                  start_date TEXT,
                  exit_date TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_people_cache_name ON people_cache(full_name);
                CREATE TABLE IF NOT EXISTS sync_history (
                  id TEXT PRIMARY KEY,
                  started_at TEXT NOT NULL,
                  finished_at TEXT,
                  sent_count INTEGER NOT NULL DEFAULT 0,
                  accepted_count INTEGER NOT NULL DEFAULT 0,
                  rejected_count INTEGER NOT NULL DEFAULT 0,
                  status TEXT NOT NULL,
                  message TEXT
                );
                """;
            await command.ExecuteNonQueryAsync(ct);
        }

        // V1'in ilk deneme DB'si direction alanı olmadan oluşmuş olabilir.
        var columns = await TableColumnsAsync(connection, "raw_punches", ct);
        if (!columns.Contains("direction", StringComparer.OrdinalIgnoreCase))
        {
            await using var alter = connection.CreateCommand();
            alter.CommandText = "ALTER TABLE raw_punches ADD COLUMN direction TEXT NOT NULL DEFAULT 'AUTO'";
            await alter.ExecuteNonQueryAsync(ct);
        }
    }

    public async Task<bool> AddAsync(RawPunch punch, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT OR IGNORE INTO raw_punches
              (id,fingerprint,card_no,event_at,work_date,event_time,direction,source,source_ref,raw_line,sync_state,received_at)
            VALUES
              ($id,$fingerprint,$card,$eventAt,$workDate,$eventTime,$direction,$source,$sourceRef,$rawLine,'PENDING',$receivedAt);
            """;
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("$fingerprint", punch.Fingerprint);
        command.Parameters.AddWithValue("$card", punch.CardNo);
        command.Parameters.AddWithValue("$eventAt", punch.EventAt.ToString("O", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("$workDate", punch.WorkDate);
        command.Parameters.AddWithValue("$eventTime", punch.EventTime);
        command.Parameters.AddWithValue("$direction", string.IsNullOrWhiteSpace(punch.Direction) ? "AUTO" : punch.Direction.Trim().ToUpperInvariant());
        command.Parameters.AddWithValue("$source", punch.Source);
        command.Parameters.AddWithValue("$sourceRef", punch.SourceRef ?? "");
        command.Parameters.AddWithValue("$rawLine", punch.RawLine ?? "");
        command.Parameters.AddWithValue("$receivedAt", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        return await command.ExecuteNonQueryAsync(ct) > 0;
    }

    public async Task TouchStateAsync(string key, string value, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO agent_state(state_key,state_value,updated_at) VALUES($key,$value,$now)
            ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task CachePeopleAsync(IEnumerable<CachedPerson> people, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var safe = people
            .Where(p => !string.IsNullOrWhiteSpace(p.CardNo)
                && !IsPassiveStatus(p.Status))
            .GroupBy(p => p.CardNo.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToArray();

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using (var clear = connection.CreateCommand())
        {
            clear.Transaction = (SqliteTransaction)transaction;
            clear.CommandText = "DELETE FROM people_cache";
            await clear.ExecuteNonQueryAsync(ct);
        }
        foreach (var person in safe)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = """
                INSERT INTO people_cache
                  (employee_id,personnel_code,full_name,department,title,sgk_status,status,card_no,start_date,exit_date,updated_at)
                VALUES($id,$code,$name,$department,$title,$sgk,$status,$card,$start,$exit,$now);
                """;
            command.Parameters.AddWithValue("$id", person.Id);
            command.Parameters.AddWithValue("$code", person.PersonnelCode ?? "");
            command.Parameters.AddWithValue("$name", person.FullName ?? "");
            command.Parameters.AddWithValue("$department", person.Department ?? "");
            command.Parameters.AddWithValue("$title", person.Title ?? "");
            command.Parameters.AddWithValue("$sgk", person.SgkStatus ?? "");
            command.Parameters.AddWithValue("$status", person.Status ?? "Aktif");
            command.Parameters.AddWithValue("$card", person.CardNo.Trim());
            command.Parameters.AddWithValue("$start", person.StartDate ?? "");
            command.Parameters.AddWithValue("$exit", person.ExitDate ?? "");
            command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
            await command.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        await TouchStateAsync("people_cache_count", safe.Length.ToString(CultureInfo.InvariantCulture), ct);
    }

    private static bool IsPassiveStatus(string? value)
    {
        var status = (value ?? "").Trim();
        return status.Contains("PAS", StringComparison.OrdinalIgnoreCase)
            || status.Contains("CIK", StringComparison.OrdinalIgnoreCase)
            || status.Contains("AYRIL", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<IReadOnlyList<CachedPerson>> GetPeopleAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<CachedPerson>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT employee_id,personnel_code,full_name,department,title,sgk_status,status,card_no,start_date,exit_date FROM people_cache ORDER BY full_name COLLATE NOCASE";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new CachedPerson(
                reader.GetString(0), reader.IsDBNull(1) ? "" : reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? "" : reader.GetString(3), reader.IsDBNull(4) ? "" : reader.GetString(4),
                reader.GetString(5), reader.IsDBNull(6) ? "" : reader.GetString(6), reader.GetString(7),
                reader.IsDBNull(8) ? "" : reader.GetString(8), reader.IsDBNull(9) ? "" : reader.GetString(9)));
        }
        return rows;
    }

    public async Task<HashSet<string>> GetAllowedCardSetAsync(CancellationToken ct = default)
    {
        var people = await GetPeopleAsync(ct);
        return people.Select(p => p.CardNo).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public async Task<List<PunchRow>> GetPendingAsync(int limit = 500, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var rows = new List<PunchRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT p.id,p.card_no,p.work_date,p.event_time,p.direction,p.source,COALESCE(p.source_ref,''),p.sync_state,COALESCE(p.sync_error,''),
                   COALESCE(pc.full_name,''),COALESCE(pc.personnel_code,''),COALESCE(pc.department,'')
              FROM raw_punches p LEFT JOIN people_cache pc ON pc.card_no=p.card_no
             WHERE p.sync_state IN ('PENDING','ERROR')
             ORDER BY p.event_at LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 5000));
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) rows.Add(ReadPunch(reader));
        return rows;
    }

    public async Task ApplySyncResultAsync(IReadOnlyList<PunchRow> sent, SyncResult result, CancellationToken ct = default)
    {
        if (sent.Count == 0) return;
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        foreach (var row in sent)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            if (result.Rejected.TryGetValue(row.Id, out var reason))
            {
                command.CommandText = "UPDATE raw_punches SET sync_state='ERROR',sync_error=$error WHERE id=$id";
                command.Parameters.AddWithValue("$error", reason);
            }
            else
            {
                command.CommandText = "UPDATE raw_punches SET sync_state='SYNCED',sync_error=NULL,synced_at=$now WHERE id=$id";
                command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
            }
            command.Parameters.AddWithValue("$id", row.Id);
            await command.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    public async Task MarkLocalErrorAsync(IEnumerable<PunchRow> rows, string message, CancellationToken ct = default)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        foreach (var row in rows)
        {
            await using var command = connection.CreateCommand();
            command.Transaction = (SqliteTransaction)transaction;
            command.CommandText = "UPDATE raw_punches SET sync_state='ERROR',sync_error=$error WHERE id=$id";
            command.Parameters.AddWithValue("$error", message);
            command.Parameters.AddWithValue("$id", row.Id);
            await command.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }

    public async Task<LocalSnapshot> SnapshotAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);

        async Task<int> CountAsync(string where, object? value = null)
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"SELECT COUNT(*) FROM raw_punches WHERE {where}";
            if (value is not null) command.Parameters.AddWithValue("$value", value);
            return Convert.ToInt32(await command.ExecuteScalarAsync(ct) ?? 0, CultureInfo.InvariantCulture);
        }

        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var pending = await CountAsync("sync_state='PENDING'");
        var synced = await CountAsync("sync_state='SYNCED'");
        var errors = await CountAsync("sync_state='ERROR'");
        var todayCount = await CountAsync("work_date=$value", today);

        var rows = new List<PunchRow>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT p.id,p.card_no,p.work_date,p.event_time,p.direction,p.source,COALESCE(p.source_ref,''),p.sync_state,COALESCE(p.sync_error,''),
                       COALESCE(pc.full_name,''),COALESCE(pc.personnel_code,''),COALESCE(pc.department,'')
                  FROM raw_punches p LEFT JOIN people_cache pc ON pc.card_no=p.card_no
                 ORDER BY p.event_at DESC LIMIT 500;
                """;
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) rows.Add(ReadPunch(reader));
        }

        var state = new Dictionary<string, (string Value, DateTimeOffset Updated)>(StringComparer.OrdinalIgnoreCase);
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT state_key,COALESCE(state_value,''),updated_at FROM agent_state";
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var updated = DateTimeOffset.MinValue;
                DateTimeOffset.TryParse(reader.GetString(2), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out updated);
                state[reader.GetString(0)] = (reader.GetString(1), updated);
            }
        }

        var agentOnline = state.TryGetValue("heartbeat", out var heartbeat) && DateTimeOffset.Now - heartbeat.Updated < TimeSpan.FromSeconds(15);
        var mode = state.TryGetValue("capture_mode", out var modeState) ? modeState.Value : "-";
        var message = state.TryGetValue("last_message", out var messageState) ? messageState.Value : "";
        return new LocalSnapshot(pending, synced, errors, todayCount, agentOnline, mode, message, rows.FirstOrDefault(), rows);
    }

    public async Task<string> BackupAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var target = Path.Combine(paths.Backup, $"KY-PDKS-{DateTime.Now:yyyyMMdd-HHmmss}.db");
        await using var source = new SqliteConnection(ConnectionString);
        await source.OpenAsync(ct);
        await using var destination = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = target, Mode = SqliteOpenMode.ReadWriteCreate }.ToString());
        await destination.OpenAsync(ct);
        source.BackupDatabase(destination);
        await TouchStateAsync("last_backup", target, ct);
        return target;
    }

    public async Task<string> StartSyncHistoryAsync(int sent, CancellationToken ct = default)
    {
        var id = Guid.NewGuid().ToString("N");
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO sync_history(id,started_at,sent_count,status) VALUES($id,$now,$sent,'RUNNING')";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("$sent", sent);
        await command.ExecuteNonQueryAsync(ct);
        return id;
    }

    public async Task FinishSyncHistoryAsync(string id, int accepted, int rejected, string status, string message, CancellationToken ct = default)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = "UPDATE sync_history SET finished_at=$now,accepted_count=$accepted,rejected_count=$rejected,status=$status,message=$message WHERE id=$id";
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("$accepted", accepted);
        command.Parameters.AddWithValue("$rejected", rejected);
        command.Parameters.AddWithValue("$status", status);
        command.Parameters.AddWithValue("$message", message ?? "");
        await command.ExecuteNonQueryAsync(ct);
    }

    private static PunchRow ReadPunch(SqliteDataReader reader) => new(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
        reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8), reader.GetString(9), reader.GetString(10), reader.GetString(11));

    private static async Task<List<string>> TableColumnsAsync(SqliteConnection connection, string table, CancellationToken ct)
    {
        var columns = new List<string>();
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info({table})";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) columns.Add(reader.GetString(1));
        return columns;
    }
}
