using System.Globalization;
using System.Text;
using Microsoft.Data.Sqlite;

namespace KyPdks.Shared;

// Local error center intentionally omits raw punches, employee identifiers,
// API error bodies, passwords and credentials.
public sealed record PdksIncident(string At, string Category, string Summary);
public sealed record PdksDiagnostics(
    int PendingCount, int SyncedCount, int ErrorCount, bool AgentOnline,
    string AgentMode, int RejectedFiles, string LastBackup,
    IReadOnlyList<PdksIncident> Incidents);

public sealed class PdksManagementCenter(PdksPaths paths)
{
    public static bool CanCreateBackup(string? role) =>
        role?.Trim().ToUpperInvariant() is "SUPER_ADMIN" or "ADMIN" or "COMPANY_ADMIN";

    public async Task<PdksDiagnostics> ReadAsync(CancellationToken ct = default)
    {
        var state = await new LocalPdksStore(paths).SnapshotAsync(ct);
        var incidents = new List<PdksIncident>();
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = paths.Database, Mode = SqliteOpenMode.ReadOnly, Pooling = false,
        }.ToString();
        await using (var db = new SqliteConnection(connectionString))
        {
            await db.OpenAsync(ct);
            await using (var cmd = db.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT COALESCE(received_at,''),COALESCE(work_date,''),COALESCE(event_time,'')
                    FROM raw_punches WHERE sync_state='ERROR'
                    ORDER BY received_at DESC LIMIT 15;
                    """;
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                    incidents.Add(new PdksIncident(reader.GetString(0), "KART",
                        "Kart D1 senkron hatası · " + reader.GetString(1) + " " + reader.GetString(2)));
            }
            await using (var cmd = db.CreateCommand())
            {
                cmd.CommandText = """
                    SELECT COALESCE(finished_at,started_at),COALESCE(status,''),rejected_count
                    FROM sync_history
                    WHERE UPPER(status) IN ('ERROR','FAILED','PARTIAL') OR rejected_count>0
                    ORDER BY started_at DESC LIMIT 10;
                    """;
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                    incidents.Add(new PdksIncident(reader.GetString(0), "SENKRON",
                        "Senkron sorunu · reddedilen: " +
                        reader.GetInt32(2).ToString(CultureInfo.InvariantCulture)));
            }
        }
        // Filename/body may contain sensitive data. Only count rejected files.
        var rejectCount = Directory.Exists(paths.Reject)
            ? Directory.EnumerateFiles(paths.Reject).Take(10001).Count() : 0;
        var lastBackup = Directory.Exists(paths.Backup)
            ? Directory.EnumerateFiles(paths.Backup, "KY-PDKS-*.db")
                .Select(x => new FileInfo(x)).OrderByDescending(x => x.LastWriteTimeUtc)
                .FirstOrDefault()?.Name ?? "Yok" : "Yok";
        return new PdksDiagnostics(
            state.PendingCount, state.SyncedCount, state.ErrorCount,
            state.AgentOnline, state.AgentMode, rejectCount, lastBackup,
            incidents.OrderByDescending(x => x.At, StringComparer.Ordinal).Take(20).ToArray());
    }

    public static string ToSafeText(PdksDiagnostics state, string? role)
    {
        var result = new StringBuilder();
        result.AppendLine("KY PDKS · anonim teknik özet (yerel DB, D1 yedeği değil)");
        result.AppendLine("Rol: " + (role?.Trim().ToUpperInvariant() switch {
            "SUPER_ADMIN" => "SUPER_ADMIN", "ADMIN" => "ADMIN",
            "COMPANY_ADMIN" => "COMPANY_ADMIN", "DENETIM" => "DENETIM",
            "IK" => "IK", _ => "Diğer",
        }));
        result.AppendLine("Agent: " + (state.AgentOnline ? "Bağlı" : "Bağlantı yok"));
        result.AppendLine("Bekleyen: " + state.PendingCount);
        result.AppendLine("Gönderilen: " + state.SyncedCount);
        result.AppendLine("Hatalı: " + state.ErrorCount);
        result.AppendLine("Reddedilen dosya: " + state.RejectedFiles);
        result.AppendLine("Son yedek: " + (state.LastBackup == "Yok" ? "Yok" : "Mevcut"));
        foreach (var incident in state.Incidents)
            result.AppendLine("Olay: " + (incident.Category == "KART" ? "KART" : "SENKRON"));
        return result.ToString();
    }
}
