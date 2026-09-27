using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

public sealed record DesktopCacheEntry(
    string ResourceKey,
    string Tenant,
    string ModuleCode,
    string PayloadJson,
    string ContentType,
    int HttpStatus,
    string UpdatedAt);

public sealed record DesktopOutboxEntry(
    string Id,
    string Tenant,
    string ModuleCode,
    string Method,
    string Endpoint,
    string PayloadJson,
    string IdempotencyKey,
    string Status,
    int Attempts,
    string LastError,
    string CreatedAt,
    string UpdatedAt);

/// <summary>
/// KY ERP Masaüstü için yerel çalışma kopyasıdır.
/// D1'in yerine geçmez. Yalnız API GET cache, offline outbox ve sync state tutar.
/// PDKS ham kart kuyruğu kendi pdks.db dosyasında kalır.
/// </summary>
public sealed class DesktopOfflineStore
{
    private readonly string _root;
    private readonly string _database;

    public string Root => _root;
    public string Database => _database;

    public DesktopOfflineStore(string? rootOverride = null)
    {
        _root = string.IsNullOrWhiteSpace(rootOverride)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "Desktop")
            : Path.GetFullPath(rootOverride);
        var data = Path.Combine(_root, "Data");
        Directory.CreateDirectory(data);
        Directory.CreateDirectory(Path.Combine(_root, "Logs"));
        Directory.CreateDirectory(Path.Combine(_root, "Backup"));
        _database = Path.Combine(data, "desktop.db");
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection($"Data Source={_database};Cache=Shared;Mode=ReadWriteCreate");
        connection.Open();
        using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;";
        pragma.ExecuteNonQuery();
        return connection;
    }

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        CREATE TABLE IF NOT EXISTS desktop_cache(
          resource_key TEXT NOT NULL PRIMARY KEY,
          tenant TEXT NOT NULL DEFAULT '',
          module_code TEXT NOT NULL DEFAULT '',
          payload_json TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'application/json',
          http_status INTEGER NOT NULL DEFAULT 200,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_desktop_cache_module ON desktop_cache(tenant,module_code,updated_at);

        CREATE TABLE IF NOT EXISTS desktop_outbox(
          id TEXT NOT NULL PRIMARY KEY,
          tenant TEXT NOT NULL DEFAULT '',
          module_code TEXT NOT NULL DEFAULT '',
          method TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_desktop_outbox_idem ON desktop_outbox(idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_desktop_outbox_status ON desktop_outbox(status,created_at);

        CREATE TABLE IF NOT EXISTS desktop_sync_state(
          state_key TEXT NOT NULL PRIMARY KEY,
          state_value TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL
        );
        """;
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task SaveCacheAsync(string resourceKey, string tenant, string moduleCode, string payloadJson,
        string contentType = "application/json", int httpStatus = 200, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(resourceKey) || string.IsNullOrWhiteSpace(payloadJson)) return;
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        INSERT INTO desktop_cache(resource_key,tenant,module_code,payload_json,content_type,http_status,updated_at)
        VALUES($key,$tenant,$module,$payload,$type,$status,$now)
        ON CONFLICT(resource_key) DO UPDATE SET
          tenant=excluded.tenant,
          module_code=excluded.module_code,
          payload_json=excluded.payload_json,
          content_type=excluded.content_type,
          http_status=excluded.http_status,
          updated_at=excluded.updated_at;
        """;
        command.Parameters.AddWithValue("$key", resourceKey);
        command.Parameters.AddWithValue("$tenant", tenant ?? "");
        command.Parameters.AddWithValue("$module", moduleCode ?? "");
        command.Parameters.AddWithValue("$payload", payloadJson);
        command.Parameters.AddWithValue("$type", string.IsNullOrWhiteSpace(contentType) ? "application/json" : contentType);
        command.Parameters.AddWithValue("$status", httpStatus);
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<DesktopCacheEntry?> GetCacheAsync(string resourceKey, CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        SELECT resource_key,tenant,module_code,payload_json,content_type,http_status,updated_at
        FROM desktop_cache WHERE resource_key=$key LIMIT 1;
        """;
        command.Parameters.AddWithValue("$key", resourceKey);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new DesktopCacheEntry(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetInt32(5), reader.GetString(6));
    }

    public async Task<IReadOnlyList<DesktopCacheEntry>> GetRecentCacheAsync(int limit = 100, CancellationToken ct = default)
    {
        var result = new List<DesktopCacheEntry>();
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        SELECT resource_key,tenant,module_code,payload_json,content_type,http_status,updated_at
        FROM desktop_cache ORDER BY updated_at DESC LIMIT $limit;
        """;
        command.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 1000));
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new DesktopCacheEntry(
                reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetInt32(5), reader.GetString(6)));
        }
        return result;
    }

    public async Task<DesktopOutboxEntry> EnqueueAsync(string tenant, string moduleCode, string method,
        string endpoint, string payloadJson, string? idempotencyKey = null, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        var entry = new DesktopOutboxEntry(
            Guid.NewGuid().ToString("N"), tenant ?? "", moduleCode ?? "", method.Trim().ToUpperInvariant(),
            endpoint.Trim(), string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson,
            string.IsNullOrWhiteSpace(idempotencyKey) ? Guid.NewGuid().ToString("N") : idempotencyKey.Trim(),
            "PENDING", 0, "", now, now);

        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        INSERT OR IGNORE INTO desktop_outbox
        (id,tenant,module_code,method,endpoint,payload_json,idempotency_key,status,attempts,last_error,created_at,updated_at)
        VALUES($id,$tenant,$module,$method,$endpoint,$payload,$idem,'PENDING',0,'',$created,$updated);
        """;
        command.Parameters.AddWithValue("$id", entry.Id);
        command.Parameters.AddWithValue("$tenant", entry.Tenant);
        command.Parameters.AddWithValue("$module", entry.ModuleCode);
        command.Parameters.AddWithValue("$method", entry.Method);
        command.Parameters.AddWithValue("$endpoint", entry.Endpoint);
        command.Parameters.AddWithValue("$payload", entry.PayloadJson);
        command.Parameters.AddWithValue("$idem", entry.IdempotencyKey);
        command.Parameters.AddWithValue("$created", entry.CreatedAt);
        command.Parameters.AddWithValue("$updated", entry.UpdatedAt);
        await command.ExecuteNonQueryAsync(ct);
        return entry;
    }

    public async Task<IReadOnlyList<DesktopOutboxEntry>> GetPendingAsync(int limit = 200, CancellationToken ct = default)
    {
        var result = new List<DesktopOutboxEntry>();
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        SELECT id,tenant,module_code,method,endpoint,payload_json,idempotency_key,status,attempts,last_error,created_at,updated_at
        FROM desktop_outbox WHERE status IN ('PENDING','ERROR') ORDER BY created_at LIMIT $limit;
        """;
        command.Parameters.AddWithValue("$limit", Math.Clamp(limit, 1, 1000));
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(ReadOutbox(reader));
        }
        return result;
    }

    public async Task MarkOutboxAsync(string id, bool success, string error = "", CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        UPDATE desktop_outbox
        SET status=$status, attempts=attempts+1, last_error=$error, updated_at=$now
        WHERE id=$id;
        """;
        command.Parameters.AddWithValue("$status", success ? "SYNCED" : "ERROR");
        command.Parameters.AddWithValue("$error", error ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        command.Parameters.AddWithValue("$id", id);
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<int> PendingCountAsync(CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM desktop_outbox WHERE status IN ('PENDING','ERROR');";
        return Convert.ToInt32(await command.ExecuteScalarAsync(ct));
    }

    public async Task SetStateAsync(string key, string value, CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = """
        INSERT INTO desktop_sync_state(state_key,state_value,updated_at) VALUES($key,$value,$now)
        ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at;
        """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value ?? "");
        command.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToString("O"));
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<string> GetStateAsync(string key, CancellationToken ct = default)
    {
        await using var connection = Open();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT state_value FROM desktop_sync_state WHERE state_key=$key LIMIT 1;";
        command.Parameters.AddWithValue("$key", key);
        var value = await command.ExecuteScalarAsync(ct);
        return value?.ToString() ?? "";
    }

    private static DesktopOutboxEntry ReadOutbox(SqliteDataReader reader) => new(
        reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
        reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
        reader.GetInt32(8), reader.GetString(9), reader.GetString(10), reader.GetString(11));
}
