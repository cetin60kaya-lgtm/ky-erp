using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Hosting.WindowsServices;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "KY ERP PDKS Agent");
builder.Services.AddSingleton<PdksPaths>();
builder.Services.AddSingleton<LocalPdksStore>();
builder.Services.AddHostedService<CardCaptureWorker>();
await builder.Build().RunAsync();

sealed class PdksPaths
{
    public string Root { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "PDKS");
    public string Data => Path.Combine(Root, "Data");
    public string Import => Path.Combine(Root, "Import");
    public string Archive => Path.Combine(Root, "Archive");
    public string Logs => Path.Combine(Root, "Logs");
    public string Database => Path.Combine(Data, "pdks.db");

    public PdksPaths()
    {
        Directory.CreateDirectory(Data);
        Directory.CreateDirectory(Import);
        Directory.CreateDirectory(Archive);
        Directory.CreateDirectory(Logs);
    }
}

sealed record RawPunch(string CardNo, DateTime EventAt, string Source, string SourceRef, string RawLine)
{
    public string WorkDate => EventAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public string EventTime => EventAt.ToString("HH:mm", CultureInfo.InvariantCulture);
    public string Fingerprint
    {
        get
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{CardNo}|{EventAt:O}|{Source}|{SourceRef}|{RawLine}"));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}

sealed class LocalPdksStore(PdksPaths paths)
{
    private string ConnectionString => new SqliteConnectionStringBuilder
    {
        DataSource = paths.Database,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Shared,
    }.ToString();

    public async Task InitializeAsync(CancellationToken ct)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS raw_punches (
              id TEXT PRIMARY KEY,
              fingerprint TEXT NOT NULL UNIQUE,
              card_no TEXT NOT NULL,
              event_at TEXT NOT NULL,
              work_date TEXT NOT NULL,
              event_time TEXT NOT NULL,
              source TEXT NOT NULL,
              source_ref TEXT,
              raw_line TEXT,
              sync_state TEXT NOT NULL DEFAULT 'PENDING',
              sync_error TEXT,
              received_at TEXT NOT NULL,
              synced_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_raw_punches_pending ON raw_punches(sync_state, work_date, event_time);
            CREATE TABLE IF NOT EXISTS agent_state (
              state_key TEXT PRIMARY KEY,
              state_value TEXT,
              updated_at TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<bool> AddAsync(RawPunch punch, CancellationToken ct)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT OR IGNORE INTO raw_punches
              (id,fingerprint,card_no,event_at,work_date,event_time,source,source_ref,raw_line,sync_state,received_at)
            VALUES
              ($id,$fingerprint,$card,$eventAt,$workDate,$eventTime,$source,$sourceRef,$rawLine,'PENDING',$receivedAt);
            """;
        command.Parameters.AddWithValue("$id", Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("$fingerprint", punch.Fingerprint);
        command.Parameters.AddWithValue("$card", punch.CardNo);
        command.Parameters.AddWithValue("$eventAt", punch.EventAt.ToString("O", CultureInfo.InvariantCulture));
        command.Parameters.AddWithValue("$workDate", punch.WorkDate);
        command.Parameters.AddWithValue("$eventTime", punch.EventTime);
        command.Parameters.AddWithValue("$source", punch.Source);
        command.Parameters.AddWithValue("$sourceRef", punch.SourceRef);
        command.Parameters.AddWithValue("$rawLine", punch.RawLine);
        command.Parameters.AddWithValue("$receivedAt", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        return await command.ExecuteNonQueryAsync(ct) > 0;
    }

    public async Task TouchAsync(string key, string value, CancellationToken ct)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(ct);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO agent_state(state_key,state_value,updated_at) VALUES($key,$value,$now)
            ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        command.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
        await command.ExecuteNonQueryAsync(ct);
    }
}

sealed class CardCaptureWorker(LocalPdksStore store, PdksPaths paths, ILogger<CardCaptureWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await store.InitializeAsync(stoppingToken);
        logger.LogInformation("KY PDKS Agent started. Import={Import}", paths.Import);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ScanImportFolder(stoppingToken);
                await store.TouchAsync("heartbeat", DateTimeOffset.Now.ToString("O"), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogError(error, "PDKS import scan failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }

    private async Task ScanImportFolder(CancellationToken ct)
    {
        var files = Directory.EnumerateFiles(paths.Import)
            .Where(path => new[] { ".txt", ".csv", ".dat" }.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
            .OrderBy(path => File.GetCreationTimeUtc(path))
            .ToArray();

        foreach (var file in files)
        {
            ct.ThrowIfCancellationRequested();
            if (!await IsReadyAsync(file, ct)) continue;

            var imported = 0;
            var rejected = 0;
            foreach (var line in await File.ReadAllLinesAsync(file, ct))
            {
                if (TryParse(line, Path.GetFileName(file), out var punch))
                {
                    if (await store.AddAsync(punch!, ct)) imported++;
                }
                else if (!string.IsNullOrWhiteSpace(line))
                {
                    rejected++;
                }
            }

            var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmssfff", CultureInfo.InvariantCulture);
            var archived = Path.Combine(paths.Archive, $"{stamp}_{Path.GetFileName(file)}");
            File.Move(file, archived, true);
            await store.TouchAsync("last_import", $"{Path.GetFileName(file)}|ok={imported}|reject={rejected}", ct);
            logger.LogInformation("PDKS file imported: {File} accepted={Accepted} rejected={Rejected}", file, imported, rejected);
        }
    }

    private static async Task<bool> IsReadyAsync(string file, CancellationToken ct)
    {
        try
        {
            var first = new FileInfo(file).Length;
            await Task.Delay(250, ct);
            var second = new FileInfo(file).Length;
            if (first != second) return false;
            using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None);
            return stream.Length >= 0;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryParse(string source, string sourceRef, out RawPunch? punch)
    {
        punch = null;
        var line = source.Trim().TrimStart('\uFEFF');
        if (line.Length == 0) return false;
        var parts = line.Split(',', StringSplitOptions.TrimEntries);

        if (parts.Length >= 3 && /^\d{5}$/.IsMatch(parts[0]) && TimeSpan.TryParseExact(parts[1], @"hh\:mm", CultureInfo.InvariantCulture, out var time) &&
            DateTime.TryParseExact(parts[2], "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var compactDate))
        {
            punch = new RawPunch(parts[0], compactDate.Date.Add(time), "IMPORT_FILE", sourceRef, line);
            return true;
        }

        if (parts.Length >= 3 && /^\d{5}$/.IsMatch(parts[0]) &&
            DateTime.TryParseExact(parts[1], new[] { "dd.MM.yyyy", "dd-MM-yyyy", "yyyy-MM-dd" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) &&
            TimeSpan.TryParseExact(parts[2], @"hh\:mm", CultureInfo.InvariantCulture, out time))
        {
            punch = new RawPunch(parts[0], date.Date.Add(time), "IMPORT_FILE", sourceRef, line);
            return true;
        }

        return false;
    }
}

static class RegexExtensions
{
    public static bool IsMatch(this string pattern, string value) => System.Text.RegularExpressions.Regex.IsMatch(value, pattern);
}
