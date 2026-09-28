using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed record CompanyLicenseState(
    string CompanyId,
    DateTime ValidUntilUtc,
    DateTime LastSeenUtc,
    int Rotation,
    string LicenseId);

internal static class CompanyLicenseGuard
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = false };
    static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP", "PDKS", "licenses");

    public static string CompanyId => BuildCompanyId();
    public static string LicensePath => Path.Combine(Root, CompanyId + ".kyl");

    public static bool EnsureAccess(out CompanyLicenseState state, out string message)
    {
        Directory.CreateDirectory(Root);
        state = Load() ?? CreateInitial();
        var now = DateTime.UtcNow;
        if (now > state.ValidUntilUtc)
        {
            message = $"Firma kullanım süresi {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy HH:mm} tarihinde sona erdi. Veri silinmedi; uygulama erişimi kilitlendi. Super Admin lisansı yenilediğinde erişim tekrar açılır.";
            return false;
        }
        state = state with { LastSeenUtc = now, Rotation = state.Rotation + 1 };
        Save(state);
        message = $"Lisans aktif • {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihine kadar";
        return true;
    }

    public static CompanyLicenseState? Load()
    {
        try
        {
            if (!File.Exists(LicensePath)) return null;
            var payload = Convert.FromBase64String(File.ReadAllText(LicensePath).Trim());
            if (payload.Length < 29) return null;
            var nonce = payload[..12];
            var tag = payload[12..28];
            var cipher = payload[28..];
            var plain = new byte[cipher.Length];
            using var aes = new AesGcm(DeriveKey(), 16);
            aes.Decrypt(nonce, cipher, tag, plain, Encoding.UTF8.GetBytes(CompanyId));
            return JsonSerializer.Deserialize<CompanyLicenseState>(plain, Json);
        }
        catch { return null; }
    }

    public static CompanyLicenseState Renew(int days)
    {
        var now = DateTime.UtcNow;
        var current = Load();
        var baseDate = current is not null && current.ValidUntilUtc > now ? current.ValidUntilUtc : now;
        var next = (current ?? CreateInitial(false)) with
        {
            ValidUntilUtc = baseDate.AddDays(Math.Max(1, days)),
            LastSeenUtc = now,
            Rotation = (current?.Rotation ?? 0) + 1
        };
        Save(next);
        return next;
    }

    static CompanyLicenseState CreateInitial(bool persist = true)
    {
        var days = 30;
        if (int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_BOOTSTRAP_DAYS"), out var configured))
            days = Math.Clamp(configured, 1, 3650);
        var state = new CompanyLicenseState(CompanyId, DateTime.UtcNow.AddDays(days), DateTime.UtcNow, 1, Guid.NewGuid().ToString("N"));
        if (persist) Save(state);
        return state;
    }

    static void Save(CompanyLicenseState state)
    {
        Directory.CreateDirectory(Root);
        var plain = JsonSerializer.SerializeToUtf8Bytes(state, Json);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(DeriveKey(), 16);
        aes.Encrypt(nonce, plain, cipher, tag, Encoding.UTF8.GetBytes(CompanyId));
        var payload = nonce.Concat(tag).Concat(cipher).ToArray();
        File.WriteAllText(LicensePath, Convert.ToBase64String(payload));
    }

    static byte[] DeriveKey()
    {
        var master = Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_MASTER");
        if (string.IsNullOrWhiteSpace(master))
            master = $"KYERP-PDKS|{Environment.MachineName}|{Environment.UserDomainName}";
        return SHA256.HashData(Encoding.UTF8.GetBytes(master + "|" + CompanyId));
    }

    static string BuildCompanyId()
    {
        var basis = CompanyBranding.Load().ReportHeader + "|" + (Environment.GetEnvironmentVariable("KY_PDKS_DB") ?? Environment.GetEnvironmentVariable("KY_PDKS_FDB") ?? "LOCAL");
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(basis)))[..20];
    }
}

internal sealed class CompanyLicenseCenterForm : Form
{
    readonly Label status = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 11f), TextAlign = ContentAlignment.MiddleLeft };
    public CompanyLicenseCenterForm()
    {
        Text = "Super Admin • Firma Lisans ve Veri Erişim Kilidi";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(680, 300);
        Font = new Font("Segoe UI", 9f);
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(22) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        root.Controls.Add(new Label { Text = "Firma Bazlı Lisans / Veri Erişim Kilidi", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 17f, FontStyle.Bold), ForeColor = Color.FromArgb(27,44,68), TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        root.Controls.Add(status, 0, 1);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        foreach (var days in new[] { 30, 90, 365 }) { var b = new Button { Text = $"+{days} Gün", Width = 130, Height = 36 }; b.Click += (_,_) => { CompanyLicenseGuard.Renew(days); RefreshState(); }; bar.Controls.Add(b); }
        root.Controls.Add(bar, 0, 2);
        root.Controls.Add(new Label { Text = "Not: Süre dolunca veri silinmez/bozulmaz; yalnız uygulama erişimi kilitlenir. TNF bu lisans kilidinin dışındadır.", Dock = DockStyle.Fill, ForeColor = Color.FromArgb(90,90,90), TextAlign = ContentAlignment.MiddleLeft }, 0, 3);
        Controls.Add(root);
        Shown += (_,_) => RefreshState();
    }
    void RefreshState()
    {
        var s = CompanyLicenseGuard.Load();
        status.Text = s is null ? $"Firma Kimliği: {CompanyLicenseGuard.CompanyId}\r\nLisans kaydı henüz oluşturulmadı." : $"Firma Kimliği: {s.CompanyId}\r\nGeçerlilik: {s.ValidUntilUtc.ToLocalTime():dd.MM.yyyy HH:mm}\r\nSon doğrulama: {s.LastSeenUtc.ToLocalTime():dd.MM.yyyy HH:mm}\r\nAnahtar rotasyonu: {s.Rotation}";
    }
}
