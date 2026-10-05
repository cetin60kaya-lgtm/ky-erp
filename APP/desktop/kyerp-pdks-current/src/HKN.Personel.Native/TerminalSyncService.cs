using System.Globalization;
using System.Text;
using System.Text.Json;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record TerminalSyncState(DateTime? LastAt, int ReadCount, int Inserted, int Updated, int Duplicates, int Skipped, bool DeviceCleared, string Message, string? ScheduleKey);
internal sealed record TerminalSyncSettings(bool Enabled, string[] Times)
{
    public static TerminalSyncSettings Default => new(true, ["08:50"]);
}

internal static class TerminalSyncService
{
    static readonly SemaphoreSlim Gate = new(1, 1);
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string SettingsFile => Path.Combine(CompanyDataPaths.Config, "terminal-sync.json");
    static string StateFile => Path.Combine(CompanyDataPaths.Config, "terminal-sync-state.json");
    static string LiveStateFile => Path.Combine(CompanyDataPaths.Config, "terminal-live-state.json");

    public static TerminalSyncSettings LoadSettings()
    {
        CompanyDataPaths.Ensure();
        try { return File.Exists(SettingsFile) ? JsonSerializer.Deserialize<TerminalSyncSettings>(File.ReadAllText(SettingsFile)) ?? TerminalSyncSettings.Default : TerminalSyncSettings.Default; }
        catch { return TerminalSyncSettings.Default; }
    }

    public static void SaveSettings(TerminalSyncSettings value)
    {
        var times = value.Times.Select(x => x.Trim()).Where(IsTime).Distinct().OrderBy(x => x).ToArray();
        if (times.Length == 0) times = ["08:50"];
        File.WriteAllText(SettingsFile, JsonSerializer.Serialize(value with { Times = times }, Json));
    }

    public static TerminalSyncState? ReadState()
    {
        try { return File.Exists(StateFile) ? JsonSerializer.Deserialize<TerminalSyncState>(File.ReadAllText(StateFile)) : null; }
        catch { return null; }
    }

    public static TerminalSyncState? ReadLiveState()
    {
        try { return File.Exists(LiveStateFile) ? JsonSerializer.Deserialize<TerminalSyncState>(File.ReadAllText(LiveStateFile)) : null; }
        catch { return null; }
    }

    public static async Task<TerminalSyncState> CaptureLiveAsync(string source, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try
        {
            CompanyDataPaths.Ensure();
            var snapshot = await TerminalDeviceClient.ReadAsync(true, ct);
            if (!snapshot.Connected)
                return SaveLive(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Canlı kontrol cihaz bağlantısı başarısız: " + snapshot.Message, null));
            var punches = snapshot.Punches.OrderBy(x => x.OccurredAt).ToArray();
            if (punches.Length == 0)
                return SaveLive(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Canlı kontrol: cihaz bağlı, yeni fiziksel kart kaydı yok. Ana FDB/TNF değiştirilmedi.", null));
            BackupPunches(punches);
            DeviceEvidenceArchiveService.SaveRead(punches, source + " • CANLI OKUMA");
            AppendLive(punches);
            var added = TerminalLiveArchiveService.Append(punches);
            return SaveLive(new(DateTime.Now, punches.Length, added, 0, punches.Length - added, 0, false, $"{source}: {punches.Length} fiziksel kayıt okundu; canlı arşive {added} yeni kayıt eklendi. Ana FDB/TNF değiştirilmedi.", null));
        }
        catch (Exception ex)
        {
            return SaveLive(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Canlı kontrol hatası: " + ex.Message + " Ana FDB/TNF değiştirilmedi.", null));
        }
        finally { Gate.Release(); }
    }

    public static async Task<TerminalSyncState> SyncAsync(string source, string? scheduleKey = null, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try
        {
            CompanyDataPaths.Ensure();
            var deviceSettings = TerminalDeviceSettingsStore.Load();
            var snapshot = await TerminalDeviceClient.ReadAsync(true, ct);
            if (!snapshot.Connected)
                return Save(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Cihaz bağlantısı başarısız: " + snapshot.Message, scheduleKey));

            var punches = snapshot.Punches.OrderBy(x => x.OccurredAt).ToArray();
            if (punches.Length == 0)
                return Save(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Aktarılacak veri yok. Cihazda kayıt bulunamadı; cihazdan hiçbir şey silinmedi.", scheduleKey));

            // Physical terminal data is source evidence. Keep both a short live cache and a durable live TNF/raw archive.
            if (deviceSettings.BackupBeforeTransfer) BackupPunches(punches);
            DeviceEvidenceArchiveService.SaveRead(punches, source + " • SENKRON OKUMA");
            AppendLive(punches);
            TerminalLiveArchiveService.Append(punches);
            AppendTnf(punches);

            var records = punches.Select(ToRecord).ToArray();
            var imported = new AttendanceImportService(new FirebirdDatabase(PdksOptions.FromEnvironment())).Import(records, deviceSettings.ToleranceMinutes);
            var accounted = imported.Inserted + imported.Updated + imported.Duplicates;
            if (imported.Skipped != 0 || accounted != punches.Length)
            {
                var validation = $"{source}: doğrulama başarısız; okunan={punches.Length}, işlenen={accounted}, atlanan={imported.Skipped}. Cihaz kayıtları KORUNDU.";
                return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, false, validation, scheduleKey));
            }

            await PdksCloudAgent.EnqueueTerminalSyncAsync(punches, imported, ct);
            _ = PdksCloudAgent.RunOnceAsync(ct);

            var deviceCleared = false;
            var cleanupMessage = "Cihaz kayıtları KORUNDU.";
            if (deviceSettings.DeleteAfterValidatedTransfer)
            {
                var clear = await TerminalDeviceClient.ClearLogsAsync(ct);
                if (!clear.Success)
                {
                    var warning = $"{source}: {punches.Length} kayıt CANLI TNF + TNF + FDB doğrulandı; ancak cihaz logları temizlenemedi: {clear.Message}";
                    return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, false, warning, scheduleKey));
                }

                var verify = await TerminalDeviceClient.ReadAsync(false, ct);
                deviceCleared = verify.Connected;
                cleanupMessage = deviceCleared
                    ? "Doğrulama başarılı; cihaz logları temizlendi."
                    : "Cihaz logları temizlendi; son bağlantı doğrulaması alınamadı.";
            }

            var finalMessage = $"{source}: {punches.Length} kayıt CANLI TNF + TNF + FDB doğrulandı. {cleanupMessage}";
            return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, deviceCleared, finalMessage, scheduleKey));
        }
        catch (Exception ex)
        {
            return Save(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Eşitleme hatası: " + ex.Message + " Cihaz kayıtları silinmedi.", scheduleKey));
        }
        finally { Gate.Release(); }
    }

    public static void ClearLive()
    {
        CompanyDataPaths.Ensure();
        File.WriteAllText(CompanyDataPaths.LiveFile, string.Empty, Encoding.UTF8);
        HideLive();
    }

    static void BackupPunches(IEnumerable<TerminalDevicePunch> punches)
    {
        try
        {
            Directory.CreateDirectory(CompanyDataPaths.Backup);
            var path = Path.Combine(CompanyDataPaths.Backup, $"TERMINAL_{DateTime.Now:yyyyMMdd_HHmmss}.txt");
            var lines = punches.Select(p => $"{p.EmployeeCode}|{p.OccurredAt:O}|{p.InOut}|{p.VerifyMode}|{p.EventCode}|{p.TerminalNumber}");
            File.WriteAllLines(path, lines, Encoding.UTF8);
        }
        catch { }
    }

    static void AppendLive(IEnumerable<TerminalDevicePunch> punches)
    {
        var existing = File.Exists(CompanyDataPaths.LiveFile) ? new HashSet<string>(File.ReadLines(CompanyDataPaths.LiveFile), StringComparer.Ordinal) : new(StringComparer.Ordinal);
        var add = punches.Select(x => $"{x.EmployeeCode}|{x.OccurredAt:s}|{x.InOut}|{x.VerifyMode}|{x.EventCode}|{x.TerminalNumber}").Where(existing.Add).ToArray();
        if (add.Length > 0) File.AppendAllLines(CompanyDataPaths.LiveFile, add, Encoding.UTF8);
        HideLive();
    }

    static void HideLive()
    {
        try { File.SetAttributes(CompanyDataPaths.LiveFile, File.GetAttributes(CompanyDataPaths.LiveFile) | FileAttributes.Hidden); }
        catch { }
    }

    static void AppendTnf(IEnumerable<TerminalDevicePunch> punches)
    {
        foreach (var group in punches.GroupBy(x => x.OccurredAt.Year))
        {
            var path = Path.Combine(CompanyDataPaths.Tnf, $"TR{group.Key}.Tnf");
            var known = File.Exists(path) ? new HashSet<string>(File.ReadLines(path), StringComparer.Ordinal) : new(StringComparer.Ordinal);
            var lines = group.Select(x => new TnfRecord(x.EmployeeCode, TimeOnly.FromDateTime(x.OccurredAt), DateOnly.FromDateTime(x.OccurredAt)).ToString()).Where(known.Add).ToArray();
            if (lines.Length > 0) File.AppendAllLines(path, lines, Encoding.ASCII);
        }
    }

    static ProfiledTerminalRecord ToRecord(TerminalDevicePunch p)
    {
        var src = $"DEVICE|{p.EmployeeCode}|{p.OccurredAt:s}|{p.InOut}|{p.VerifyMode}|{p.EventCode}|{p.TerminalNumber}";
        return new(p.EmployeeCode, p.OccurredAt, p.EventCode.ToString(CultureInfo.InvariantCulture), p.TerminalNumber.ToString("000", CultureInfo.InvariantCulture), TerminalDirection.Unknown, src);
    }

    static TerminalSyncState Save(TerminalSyncState state)
    {
        CompanyDataPaths.Ensure();
        File.WriteAllText(StateFile, JsonSerializer.Serialize(state, Json));
        return state;
    }

    static TerminalSyncState SaveLive(TerminalSyncState state)
    {
        CompanyDataPaths.Ensure();
        File.WriteAllText(LiveStateFile, JsonSerializer.Serialize(state, Json));
        return state;
    }

    static bool IsTime(string s) => TimeOnly.TryParseExact(s, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
}
