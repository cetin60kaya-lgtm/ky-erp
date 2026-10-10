using System.Globalization;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;

namespace KyPdks.Unified;

internal static class FirebirdSchemaProbe
{
    private static readonly string[] CoreTables =
    [
        "KIMLIK", "GIRCIK", "GRUP", "SERVIS", "DONEM", "OZELIZIN",
        "AVANS", "AVTUR", "PUANTAJ", "UCRETLER", "ODEME",
    ];

    internal static async Task<string> RunAsync(CancellationToken cancellationToken = default)
    {
        var dbPath = ResolveDatabasePath()
            ?? throw new InvalidOperationException("FDB_PATH_NOT_READY");
        if (!File.Exists(dbPath)) throw new FileNotFoundException("Firebird veri dosyası bulunamadı.", dbPath);
        var password = Read("KY_PDKS_DB_PASSWORD");
        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("FDB_PASSWORD_REQUIRED");

        var builder = new FbConnectionStringBuilder
        {
            Database = dbPath,
            UserID = Read("KY_PDKS_DB_USER", "SYSDBA"),
            Password = password,
            DataSource = Read("KY_PDKS_DB_HOST", "127.0.0.1"),
            Port = int.TryParse(Read("KY_PDKS_DB_PORT", "3050"), out var port) ? port : 3050,
            Dialect = 3,
            Charset = Read("KY_PDKS_DB_CHARSET", "NONE"),
            Pooling = false,
        };

        await using var connection = new FbConnection(builder.ToString());
        await connection.OpenAsync(cancellationToken);

        var allRelations = new List<string>();
        await using (var command = new FbCommand(
            @"select trim(rdb$relation_name) from rdb$relations
              where coalesce(rdb$system_flag,0)=0 and rdb$view_blr is null
              order by rdb$relation_name", connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
                allRelations.Add(reader.GetString(0).Trim());

        var relevant = allRelations
            .Where(name => CoreTables.Contains(name, StringComparer.OrdinalIgnoreCase) ||
                name.Contains("TATIL", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("IZIN", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("MESA", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("VARD", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("PLAN", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var tables = new List<object>();
        foreach (var table in relevant)
        {
            var columns = new List<object>();
            await using var command = new FbCommand(
                @"select trim(rf.rdb$field_name) as column_name
                  from rdb$relation_fields rf
                  where trim(rf.rdb$relation_name)=@T
                  order by rf.rdb$field_position", connection);
            command.Parameters.AddWithValue("@T", table);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                columns.Add(new { name = reader[0]?.ToString()?.Trim() });
            tables.Add(new { name = table, columns });
        }

        var triggers = new List<object>();
        await using (var command = new FbCommand(
            @"select trim(rdb$trigger_name) as trigger_name,
                     trim(rdb$relation_name) as relation_name,
                     rdb$trigger_inactive
              from rdb$triggers
              where coalesce(rdb$system_flag,0)=0
              order by rdb$relation_name,rdb$trigger_name", connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
            while (await reader.ReadAsync(cancellationToken))
            {
                var relation = reader["RELATION_NAME"]?.ToString()?.Trim() ?? "";
                if (!relevant.Contains(relation, StringComparer.OrdinalIgnoreCase)) continue;
                triggers.Add(new
                {
                    name = reader["TRIGGER_NAME"]?.ToString()?.Trim(),
                    relation,
                    inactive = Number(reader["RDB$TRIGGER_INACTIVE"]) != 0,
                });
            }

        var lookups = new Dictionary<string, List<Dictionary<string, object?>>>(StringComparer.OrdinalIgnoreCase);
        var columnMap = tables
            .Select(item => JsonSerializer.SerializeToElement(item))
            .ToDictionary(
                item => item.GetProperty("name").GetString() ?? "",
                item => item.GetProperty("columns").EnumerateArray()
                    .Select(column => column.GetProperty("name").GetString() ?? "")
                    .ToHashSet(StringComparer.OrdinalIgnoreCase),
                StringComparer.OrdinalIgnoreCase);
        foreach (var table in new[] { "GRUP", "SERVIS", "AVTUR", "DONEM" })
        {
            if (!columnMap.TryGetValue(table, out var cols)) continue;
            string? sql = null;
            if (table is "GRUP" or "SERVIS")
            {
                if (cols.Contains("KOD") && cols.Contains("AD"))
                    sql = $"select first 100 KOD,AD from {table} order by KOD";
            }
            else if (table == "AVTUR")
            {
                if (cols.Contains("KOD") && cols.Contains("TUR") && cols.Contains("ISARET"))
                    sql = "select first 100 KOD,TUR,ISARET from AVTUR order by KOD";
                else if (cols.Contains("KOD") && cols.Contains("TUR"))
                    sql = "select first 100 KOD,TUR from AVTUR order by KOD";
            }
            else if (table == "DONEM" &&
                new[] { "KOD", "AD", "BASTAR", "BITTAR", "GRUP" }.All(cols.Contains))
            {
                sql = "select first 30 KOD,AD,BASTAR,BITTAR,GRUP from DONEM order by BASTAR desc,KOD";
            }
            if (sql is null) continue;

            var rows = new List<Dictionary<string, object?>>();
            await using var command = new FbCommand(sql, connection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++)
                    row[reader.GetName(i)] = reader.IsDBNull(i) ? null : JsonSafe(reader.GetValue(i));
                rows.Add(row);
            }
            lookups[table] = rows;
        }

        var report = new
        {
            generatedAt = DateTimeOffset.Now,
            source = "LIVE_READ_ONLY_SCHEMA",
            databaseFile = Path.GetFileName(dbPath),
            firebirdServer = builder.DataSource,
            tables,
            triggers,
            configurationLookups = lookups,
            personalRowsRead = false,
            writesPerformed = false,
        };
        return JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
    }

    private static object JsonSafe(object value) => value switch
    {
        DateTime date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        decimal number => number,
        short number => number,
        int number => number,
        long number => number,
        _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "",
    };

    private static int Number(object value) =>
        value is DBNull ? 0 : Convert.ToInt32(value, CultureInfo.InvariantCulture);

    private static string? ResolveDatabasePath()
    {
        var direct = Read("KY_PDKS_DB_PATH");
        if (!string.IsNullOrWhiteSpace(direct)) return direct;
        var root = Read("KY_PDKS_COMPANY_ROOT");
        return string.IsNullOrWhiteSpace(root)
            ? null
            : Path.Combine(root, "DATA", "KY_PDKS_DATA.FDB");
    }

    private static string Read(string name, string fallback = "")
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
        try { value = Environment.GetEnvironmentVariable(name, EnvironmentVariableTarget.User); }
        catch { value = null; }
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }
}
