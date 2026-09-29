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
                return Save(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Aktarılacak veri yok.", scheduleKey));

            if (deviceSettings.BackupBeforeTransfer) BackupPunches(punches);
            AppendLive(punches);
            AppendTnf(punches);

            var records = punches.Select(ToRecord).ToArray();
            var imported = new AttendanceImportService(new FirebirdDatabase(PdksOptions.FromEnvironment())).Import(records, deviceSettings.ToleranceMinutes);
            var accounted = imported.Inserted + imported.Updated + imported.Duplicates;
            if (imported.Skipped != 0 || accounted != punches.Length)
            {
                var validation = $"{source}: doğrulama başarısız; okunan={punches.Length}, işlenen={accounted}, atlanan={imported.Skipped}. Terminal kayıtları SİLİNMEDİ.";
                return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, false, validation, scheduleKey));
            }

            if (!deviceSettings.DeleteAfterValidatedTransfer)
            {
                await PdksCloudAgent.EnqueueTerminalSyncAsync(punches, imported, ct);
                _ = PdksCloudAgent.RunOnceAsync(ct);
                var keepMessage = $"{source}: {punches.Length} kayıt TNF + FDB doğrulandı. Ayar gereği cihaz kayıtları silinmedi.";
                return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, false, keepMessage, scheduleKey));
            }

            var clear = await TerminalDeviceClient.ExecuteAsync("clearlogs", ct);
            if (clear.Success)
            {
                await PdksCloudAgent.EnqueueTerminalSyncAsync(punches, imported, ct);
                _ = PdksCloudAgent.RunOnceAsync(ct);
            }
            var msg = clear.Success
                ? $"{source}: {punches.Length} kayıt TNF + FDB doğrulandı, cihaz temizlendi ve bulut kuyruğuna alındı."
                : $"{source}: TNF + FDB doğrulandı; cihaz temizlenemedi, terminal kayıtları korundu: {clear.Message}";
            return Save(new(DateTime.Now, punches.Length, imported.Inserted, imported.Updated, imported.Duplicates, imported.Skipped, clear.Success, msg, scheduleKey));
        }
        catch (Exception ex)
        {
            return Save(new(DateTime.Now, 0, 0, 0, 0, 0, false, "Eşitleme hatası: " + ex.Message + " Terminal kayıtları silinmedi.", scheduleKey));
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

    static bool IsTime(string s) => TimeOnly.TryParseExact(s, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
}
