using System.Globalization;
using System.Text;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record TerminalUserAuditRow(
    int DeviceUserId,
    string DeviceName,
    string Credentials,
    int Privilege,
    bool Enabled,
    string SystemCardNo,
    string SystemName,
    bool ExistsInSystem,
    bool ActiveInSystem)
{
    public string Status => !ExistsInSystem ? "EŞLEŞMEDİ" : ActiveInSystem ? "EŞLEŞTİ" : "PASİF PERSONEL";
}

internal sealed record TerminalMaintenanceResult(bool Success, string Message, int Affected = 0, int Archived = 0);

internal static class TerminalMaintenanceService
{
    public static async Task<IReadOnlyList<TerminalUserAuditRow>> AuditUsersAsync(CancellationToken ct = default)
    {
        var deviceUsers = await TerminalDeviceClient.ReadUsersAsync(ct);
        var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
        var people = db.Query("select PKNO,AD,SOYAD,ICTARIH from KIMLIK");
        var map = new Dictionary<string, (string CardNo,string Name,bool Active)>(StringComparer.Ordinal);
        foreach (System.Data.DataRow row in people.Rows)
        {
            var raw = Convert.ToString(row["PKNO"], CultureInfo.InvariantCulture) ?? string.Empty;
            var key = NormalizeCode(raw);
            if (key.Length == 0) continue;
            var ad = people.Columns.Contains("AD") ? Convert.ToString(row["AD"], CultureInfo.CurrentCulture) ?? string.Empty : string.Empty;
            var soyad = people.Columns.Contains("SOYAD") ? Convert.ToString(row["SOYAD"], CultureInfo.CurrentCulture) ?? string.Empty : string.Empty;
            var name = (ad.Trim() + " " + soyad.Trim()).Trim();
            var active = !people.Columns.Contains("ICTARIH") || row["ICTARIH"] == DBNull.Value;
            map[key] = (raw.Trim(), name, active);
        }

        return deviceUsers.Select(user =>
        {
            var key = NormalizeCode(user.UserId.ToString(CultureInfo.InvariantCulture));
            var found = map.TryGetValue(key, out var person);
            return new TerminalUserAuditRow(
                user.UserId,
                user.Name,
                user.CredentialSummary,
                user.Privilege,
                user.Enabled,
                found ? person.CardNo : key,
                found ? person.Name : string.Empty,
                found,
                found && person.Active);
        }).OrderBy(x => x.DeviceUserId).ToArray();
    }

    public static async Task<TerminalMaintenanceResult> DeleteUnmatchedUsersAsync(CancellationToken ct = default)
    {
        var audit = await AuditUsersAsync(ct);
        var unmatched = audit.Where(x => !x.ExistsInSystem).ToArray();
        if (unmatched.Length == 0)
            return new(true, "Cihazda sistemle eşleşmeyen kullanıcı bulunamadı.");

        var deleted = new List<string>();
        var failed = new List<int>();
        foreach (var row in unmatched)
        {
            ct.ThrowIfCancellationRequested();
            var result = await TerminalDeviceClient.DeleteUserAsync(row.DeviceUserId, ct);
            if (result.Success) deleted.Add(row.DeviceUserId.ToString(CultureInfo.InvariantCulture));
            else failed.Add(row.DeviceUserId);
        }

        var liveRemoved = deleted.Count == 0 ? 0 : TerminalLiveArchiveService.DeleteEmployeeCodes(deleted);
        var ok = failed.Count == 0;
        var message = ok
            ? $"{deleted.Count} eşleşmeyen cihaz kullanıcısı silindi. Canlı arşivden {liveRemoved} eşleşmeyen satır temizlendi."
            : $"{deleted.Count} kullanıcı silindi; {failed.Count} kullanıcı silinemedi: {string.Join(", ", failed)}. Canlı arşivden {liveRemoved} satır temizlendi.";
        return new(ok, message, deleted.Count, liveRemoved);
    }

    public static async Task<TerminalMaintenanceResult> MoveCardAsync(int oldUserId, int newUserId, CancellationToken ct = default)
    {
        if (oldUserId <= 0 || newUserId <= 0) return new(false, "Eski ve yeni sicil numarası sıfırdan büyük olmalıdır.");
        if (oldUserId == newUserId) return new(true, "Kart zaten aynı sicil numarasına bağlı.");
        var result = await TerminalDeviceClient.MoveCardAsync(oldUserId, newUserId, ct);
        if (!result.Success) return new(false, "Kart taşıma başarısız: " + result.Message);
        return new(true, $"Kart eşleşmesi {oldUserId} → {newUserId} olarak taşındı. Geçmiş giriş/çıkış logları değiştirilmedi.", 1);
    }

    public static async Task<TerminalMaintenanceResult> SyncAndClearLogsAsync(CancellationToken ct = default)
    {
        var sync = await TerminalSyncService.SyncAsync("Cihaz temizliği öncesi güvenli aktarım", null, ct);
        var failed = sync.Message.Contains("hata", StringComparison.OrdinalIgnoreCase) ||
                     sync.Message.Contains("başarısız", StringComparison.OrdinalIgnoreCase) ||
                     sync.Skipped != 0;
        if (failed)
            return new(false, "Cihaz logları silinmedi. Önce aktarım doğrulaması tamamlanmalı. " + sync.Message, 0, sync.ReadCount);

        if (sync.DeviceCleared)
            return new(true, $"Cihaz logları güvenli biçimde aktarıldı ve temizlendi. Önce {sync.ReadCount} kayıt CANLI TNF + TNF + FDB üzerinde doğrulandı.", sync.ReadCount, sync.ReadCount);

        var clear = await TerminalDeviceClient.ClearLogsAsync(ct);
        if (!clear.Success) return new(false, "Kayıtlar aktarıldı ancak cihaz logları temizlenemedi: " + clear.Message, 0, sync.ReadCount);

        var status = await TerminalDeviceClient.ReadAsync(false, ct);
        return new(status.Connected, status.Connected
            ? $"Cihaz logları güvenli biçimde aktarıldı ve temizlendi. Önce {sync.ReadCount} kayıt doğrulandı."
            : "Loglar temizlendi ancak son bağlantı doğrulaması alınamadı: " + status.Message,
            sync.ReadCount, sync.ReadCount);
    }

    public static async Task<TerminalMaintenanceResult> ArchiveAndClearLogsAsync(CancellationToken ct = default)
    {
        var snapshot = await TerminalDeviceClient.ReadAsync(true, ct);
        if (!snapshot.Connected) return new(false, snapshot.Message);
        var punches = snapshot.Punches.OrderBy(x => x.OccurredAt).ToArray();
        var archived = 0;
        if (punches.Length > 0)
        {
            archived = TerminalLiveArchiveService.Append(punches);
            SavePunchSnapshot(punches, "CIHAZ_LOG_SIFIRLAMA");
        }

        var clear = await TerminalDeviceClient.ClearLogsAsync(ct);
        if (!clear.Success) return new(false, "Cihaz logları temizlenemedi: " + clear.Message, 0, archived);
        return new(true, $"Cihaz logları sıfırlandı. Silmeden önce {punches.Length} fiziksel kayıt ham/canlı arşive alındı.", punches.Length, archived);
    }

    public static async Task<TerminalMaintenanceResult> ClearUsersAsync(CancellationToken ct = default)
    {
        var users = await TerminalDeviceClient.ReadUsersAsync(ct);
        SaveUserInventory(users);
        var result = await TerminalDeviceClient.ClearUsersAsync(ct);
        if (!result.Success) return new(false, "Cihaz kullanıcıları sıfırlanamadı: " + result.Message, 0, users.Count);
        var status = await TerminalDeviceClient.ReadAsync(false, ct);
        var message = $"Cihaz kullanıcı/kart kayıtları sıfırlandı. İşlem öncesi {users.Count} kullanıcı envanteri arşivlendi.";
        if (status.Connected && status.UserCount > 0) message += $" Cihaz {status.UserCount} kullanıcı bildiriyor; model bazı kimlik türlerini ayrı tutuyor olabilir.";
        return new(true, message, users.Count, users.Count);
    }

    public static TerminalMaintenanceResult ClearLiveExceptLastWeek()
    {
        var keepFrom = DateTime.Today.AddDays(-6);
        var removed = TerminalLiveArchiveService.DeleteBefore(keepFrom);
        return new(true,
            $"Canlı arşiv temizlendi. {keepFrom:dd.MM.yyyy} ve sonrası (son 7 takvim günü) korundu; {removed} canlı arşiv satırı kaldırıldı. Ana TNF/FDB değişmedi.",
            removed);
    }

    public static TerminalMaintenanceResult ClearAllLive()
    {
        var removed = TerminalLiveArchiveService.ClearAll();
        TerminalSyncService.ClearLive();
        return new(true,
            $"Canlı arşiv tamamen sıfırlandı; {removed} CANLI TNF kaydı temizlendi. Ana TNF/FDB ve cihaz verisi değişmedi.",
            removed);
    }

    static void SavePunchSnapshot(IEnumerable<TerminalDevicePunch> punches, string prefix)
    {
        CompanyDataPaths.Ensure();
        Directory.CreateDirectory(CompanyDataPaths.Backup);
        var path = Path.Combine(CompanyDataPaths.Backup, $"{prefix}_{DateTime.Now:yyyyMMdd_HHmmss}.txt");
        File.WriteAllLines(path, punches.Select(p =>
            $"{p.EmployeeCode}|{p.OccurredAt:O}|{p.InOut}|{p.VerifyMode}|{p.EventCode}|{p.TerminalNumber}"), Encoding.UTF8);
    }

    static void SaveUserInventory(IEnumerable<TerminalDeviceUser> users)
    {
        CompanyDataPaths.Ensure();
        Directory.CreateDirectory(CompanyDataPaths.Backup);
        var path = Path.Combine(CompanyDataPaths.Backup, $"CIHAZ_KULLANICI_ENVANTER_{DateTime.Now:yyyyMMdd_HHmmss}.txt");
        File.WriteAllLines(path, users.Select(u =>
            $"{u.UserId}|{u.Name}|{u.CredentialSummary}|Privilege={u.Privilege}|Enabled={u.Enabled}"), Encoding.UTF8);
    }

    internal static string NormalizeCode(string value)
    {
        var text = (value ?? string.Empty).Trim();
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)
            ? number.ToString("00000", CultureInfo.InvariantCulture)
            : text;
    }
}
