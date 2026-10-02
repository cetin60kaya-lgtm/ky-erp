using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed class CompanyLicenseState
{
    public string CompanyId { get; set; } = string.Empty;
    public DateTime ValidUntilUtc { get; set; }
    public DateTime LastSeenUtc { get; set; }
    public int Rotation { get; set; }
    public string LicenseId { get; set; } = string.Empty;
    public string Mode { get; set; } = "Full";
    public DateTime? DemoStartedUtc { get; set; }
    public string SignedToken { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
}

internal sealed record OnlineLicenseEnvelope(string Payload, string Signature);
internal sealed record OnlineLicensePayload(string CompanyId, string LicenseId, DateTime ValidUntilUtc, string Mode, string? DeviceId);

internal static class CompanyLicenseGuard
{
    static readonly JsonSerializerOptions Json = new() { WriteIndented = false, PropertyNameCaseInsensitive = true };
    static string Root => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP", "PDKS", "licenses");
    public static string CompanyId => BuildCompanyId();
    public static string DeviceId => BuildDeviceId();
    public static string LicensePath => Path.Combine(Root, CompanyId + ".kyl");
    public static Uri PortalUri => new(Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_PORTAL") ?? "https://kyerp.net");
    public static Uri ActivationEndpoint => new(Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_API") ?? "https://api.kyerp.net/pdks/license/activate");

    public static bool EnsureAccess(out CompanyLicenseState state, out string message)
    {
        Directory.CreateDirectory(Root);
        var loaded = Load();
        if (loaded is null)
        {
            state = StartDemo(7);
            message = $"7 günlük demo başlatıldı • {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihine kadar. Demo modunda veri değiştiren kritik işlemler kapalıdır.";
            return true;
        }

        state = loaded;
        var now = DateTime.UtcNow;
        state.LastSeenUtc = now;
        state.Rotation++;
        Save(state);

        if (now > state.ValidUntilUtc)
        {
            message = state.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase)
                ? $"Demo süresi {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihinde sona erdi. Uygulama görüntüleme/raporlama modunda açılacaktır; veri değiştiren işlemler lisans etkinleşene kadar kapalıdır."
                : $"Firma lisansı {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihinde sona erdi. Veri silinmedi; uygulama görüntüleme/raporlama modunda açılacaktır.";
            return false;
        }

        message = state.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase)
            ? $"Demo aktif • {Math.Max(0, (state.ValidUntilUtc.Date - now.Date).Days + 1)} gün kaldı • veri değiştiren kritik işlemler kapalı"
            : $"Lisans aktif • {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihine kadar";
        return true;
    }

    public static bool CanWrite
    {
        get
        {
            var state = Load();
            return state is not null
                && DateTime.UtcNow <= state.ValidUntilUtc
                && state.Mode.Equals("Full", StringComparison.OrdinalIgnoreCase);
        }
    }

    public static bool IsDemo => Load()?.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase) == true;

    public static string ShortStatus()
    {
        var state = Load();
        if (state is null) return "Lisans: Demo hazırlanıyor";
        if (DateTime.UtcNow > state.ValidUntilUtc) return "Lisans: Süre doldu • salt okunur";
        if (state.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase))
            return $"Demo: {Math.Max(0, (state.ValidUntilUtc.Date - DateTime.UtcNow.Date).Days + 1)} gün";
        return $"Lisans: {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy}";
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
            var state = JsonSerializer.Deserialize<CompanyLicenseState>(plain, Json);
            if (state is null || !state.CompanyId.Equals(CompanyId, StringComparison.OrdinalIgnoreCase)) return null;
            if (string.IsNullOrWhiteSpace(state.Mode)) state.Mode = "Full";
            if (string.IsNullOrWhiteSpace(state.DeviceId)) state.DeviceId = DeviceId;
            return state;
        }
        catch { return null; }
    }

    public static CompanyLicenseState StartDemo(int days)
    {
        var now = DateTime.UtcNow;
        var current = Load();
        if (current is not null) return current;
        var state = new CompanyLicenseState
        {
            CompanyId = CompanyId,
            ValidUntilUtc = now.Date.AddDays(Math.Max(1, days)),
            LastSeenUtc = now,
            Rotation = 1,
            LicenseId = "DEMO-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(),
            Mode = "Demo",
            DemoStartedUtc = now,
            DeviceId = DeviceId
        };
        Save(state);
        return state;
    }

    public static CompanyLicenseState SetFullValidity(DateTime validUntilLocal)
    {
        var current = Load() ?? new CompanyLicenseState
        {
            CompanyId = CompanyId,
            LicenseId = "LOCAL-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant(),
            DeviceId = DeviceId
        };
        current.Mode = "Full";
        current.ValidUntilUtc = DateTime.SpecifyKind(validUntilLocal.Date.AddDays(1).AddTicks(-1), DateTimeKind.Local).ToUniversalTime();
        current.LastSeenUtc = DateTime.UtcNow;
        current.Rotation++;
        if (current.LicenseId.StartsWith("DEMO-", StringComparison.OrdinalIgnoreCase))
            current.LicenseId = "LOCAL-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
        Save(current);
        return current;
    }

    public static async Task<(bool Ok, string Message)> ActivateOnlineAsync(string activationKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(activationKey)) return (false, "Aktivasyon anahtarı girilmedi.");
        var publicKeyPem = Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_PUBLIC_KEY_PEM");
        if (string.IsNullOrWhiteSpace(publicKeyPem))
            return (false, "Lisans sunucusu public doğrulama anahtarı bu kurulumda tanımlı değil. KY ERP lisans portalını kullanın veya kurulum profilini güncelleyin.");

        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            var request = JsonSerializer.Serialize(new
            {
                activationKey = activationKey.Trim(),
                companyId = CompanyId,
                deviceId = DeviceId,
                product = "KY-PDKS",
                version = typeof(CompanyLicenseGuard).Assembly.GetName().Version?.ToString() ?? "6.3"
            });
            using var response = await client.PostAsync(ActivationEndpoint,
                new StringContent(request, Encoding.UTF8, "application/json"), cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                return (false, $"Lisans sunucusu yanıtı: {(int)response.StatusCode} {response.ReasonPhrase}");

            var envelope = JsonSerializer.Deserialize<OnlineLicenseEnvelope>(body, Json);
            if (envelope is null || string.IsNullOrWhiteSpace(envelope.Payload) || string.IsNullOrWhiteSpace(envelope.Signature))
                return (false, "Lisans sunucusundan geçerli imzalı lisans paketi gelmedi.");

            var payloadBytes = Convert.FromBase64String(envelope.Payload);
            var signatureBytes = Convert.FromBase64String(envelope.Signature);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKeyPem);
            if (!rsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pss))
                return (false, "Lisans paketi dijital imza doğrulamasından geçmedi.");

            var signed = JsonSerializer.Deserialize<OnlineLicensePayload>(payloadBytes, Json);
            if (signed is null || !signed.CompanyId.Equals(CompanyId, StringComparison.OrdinalIgnoreCase))
                return (false, "Lisans bu firmaya ait değil.");
            if (!string.IsNullOrWhiteSpace(signed.DeviceId) && !signed.DeviceId.Equals(DeviceId, StringComparison.OrdinalIgnoreCase))
                return (false, "Lisans bu cihaz kurulumu için düzenlenmemiş.");
            if (signed.ValidUntilUtc <= DateTime.UtcNow)
                return (false, "Sunucudan gelen lisansın geçerlilik süresi sona ermiş.");

            var state = new CompanyLicenseState
            {
                CompanyId = CompanyId,
                ValidUntilUtc = signed.ValidUntilUtc.ToUniversalTime(),
                LastSeenUtc = DateTime.UtcNow,
                Rotation = (Load()?.Rotation ?? 0) + 1,
                LicenseId = signed.LicenseId,
                Mode = string.IsNullOrWhiteSpace(signed.Mode) ? "Full" : signed.Mode,
                SignedToken = envelope.Payload + "." + envelope.Signature,
                DeviceId = DeviceId
            };
            Save(state);
            return (true, $"Lisans etkinleştirildi • {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy} tarihine kadar.");
        }
        catch (TaskCanceledException) { return (false, "Lisans sunucusuna bağlantı zaman aşımına uğradı."); }
        catch (Exception ex) { return (false, "Lisans etkinleştirilemedi: " + ex.Message); }
    }

    public static void OpenPortal()
    {
        try { Process.Start(new ProcessStartInfo(PortalUri.ToString()) { UseShellExecute = true }); }
        catch (Exception ex) { PdksErrorPresenter.Show(null,ex,"KY ERP Lisans",MessageBoxIcon.Warning,"License.Portal"); }
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
        File.WriteAllText(LicensePath, Convert.ToBase64String(nonce.Concat(tag).Concat(cipher).ToArray()));
    }

    static byte[] DeriveKey()
    {
        var master = Environment.GetEnvironmentVariable("KY_PDKS_LICENSE_MASTER");
        if (string.IsNullOrWhiteSpace(master)) master = $"KYERP-PDKS|{Environment.MachineName}|{Environment.UserDomainName}";
        return SHA256.HashData(Encoding.UTF8.GetBytes(master + "|" + CompanyId));
    }

    static string BuildCompanyId()
    {
        var company = Environment.GetEnvironmentVariable("KY_PDKS_COMPANY_NAME")?.Trim() ?? "COMPANY";
        var db = Environment.GetEnvironmentVariable("KY_PDKS_DB")
            ?? Environment.GetEnvironmentVariable("KY_PDKS_FDB")
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DATABASE")
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH")
            ?? "LOCAL";
        var normalized = Path.GetFullPath(db).ToUpperInvariant();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(company + "|" + normalized)))[..20];
    }

    static string BuildDeviceId()
    {
        var source = $"{Environment.MachineName}|{Environment.UserDomainName}|{Environment.OSVersion.VersionString}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source)))[..24];
    }
}

internal class LicenseActivationForm : Form
{
    protected readonly Label status = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 10f), TextAlign = ContentAlignment.MiddleLeft };
    protected readonly TextBox activationKey = new() { Dock = DockStyle.Fill, PlaceholderText = "KY ERP aktivasyon anahtarı" };
    protected readonly Button activate = new() { Text = "Online Etkinleştir", Dock = DockStyle.Fill, Height = 36 };

    public LicenseActivationForm(string? initialMessage = null)
    {
        Text = "KY PDKS • Lisans Etkinleştirme";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(720, 350);
        MinimumSize = new Size(640, 330);
        Font = new Font("Segoe UI", 9f);
        Build(initialMessage);
    }

    protected virtual void Build(string? initialMessage)
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, ColumnCount = 1, Padding = new Padding(22) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.Controls.Add(new Label { Text = "Lisans / Demo Durumu", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 17f, FontStyle.Bold), ForeColor = Color.FromArgb(27, 44, 68), TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        root.Controls.Add(status, 0, 1);
        root.Controls.Add(activationKey, 0, 2);
        root.Controls.Add(activate, 0, 3);
        var portal = new Button { Text = "KYERP.net Lisans Portalını Aç", Dock = DockStyle.Fill };
        portal.Click += (_, _) => CompanyLicenseGuard.OpenPortal();
        root.Controls.Add(portal, 0, 4);
        Controls.Add(root);
        activate.Click += async (_, _) => await ActivateAsync();
        Shown += (_, _) => RefreshState(initialMessage);
    }

    protected void RefreshState(string? prefix = null)
    {
        CompanyLicenseGuard.EnsureAccess(out var state, out var message);
        var mode = state.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase) ? "DEMO" : "TAM LİSANS";
        status.Text = $"{prefix ?? message}\r\n\r\nFirma Kimliği: {CompanyLicenseGuard.CompanyId}\r\nCihaz: {CompanyLicenseGuard.DeviceId}\r\nMod: {mode}\r\nGeçerlilik: {state.ValidUntilUtc.ToLocalTime():dd.MM.yyyy HH:mm}";
    }

    async Task ActivateAsync()
    {
        activate.Enabled = false;
        activate.Text = "Doğrulanıyor...";
        try
        {
            var result = await CompanyLicenseGuard.ActivateOnlineAsync(activationKey.Text);
            MessageBox.Show(result.Message, "KY ERP Lisans", MessageBoxButtons.OK, result.Ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            RefreshState();
        }
        finally
        {
            activate.Enabled = true;
            activate.Text = "Online Etkinleştir";
        }
    }
}

internal sealed class CompanyLicenseCenterForm : Form
{
    readonly Label status = new() { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 10f), TextAlign = ContentAlignment.MiddleLeft };
    readonly DateTimePicker validUntil = new() { Format = DateTimePickerFormat.Short, Dock = DockStyle.Fill };
    readonly TextBox activationKey = new() { Dock = DockStyle.Fill, PlaceholderText = "KY ERP aktivasyon anahtarı" };

    public CompanyLicenseCenterForm()
    {
        Text = "Super Admin • Lisans Yönetimi";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(780, 500);
        MinimumSize = new Size(700, 460);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += (_, _) => RefreshState();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 7, ColumnCount = 2, Padding = new Padding(24) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 130));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var title = new Label { Text = "Firma Lisans Yönetimi", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 18f, FontStyle.Bold), ForeColor = Color.FromArgb(27, 44, 68), TextAlign = ContentAlignment.MiddleLeft };
        root.Controls.Add(title, 0, 0); root.SetColumnSpan(title, 2);
        root.Controls.Add(status, 0, 1); root.SetColumnSpan(status, 2);
        root.Controls.Add(new Label { Text = "Bitiş Tarihi", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 2);
        root.Controls.Add(validUntil, 1, 2);
        var saveDate = new Button { Text = "Bitiş Tarihini Önizle ve Kaydet", Dock = DockStyle.Fill };
        saveDate.Click += (_, _) => SaveDate();
        root.Controls.Add(saveDate, 0, 3); root.SetColumnSpan(saveDate, 2);
        root.Controls.Add(new Label { Text = "Aktivasyon Anahtarı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 4);
        root.Controls.Add(activationKey, 1, 4);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var online = new Button { Text = "Online Etkinleştir", Width = 180, Height = 34 };
        var portal = new Button { Text = "KYERP.net Lisans Portalı", Width = 190, Height = 34 };
        online.Click += async (_, _) =>
        {
            online.Enabled = false;
            try
            {
                var result = await CompanyLicenseGuard.ActivateOnlineAsync(activationKey.Text);
                MessageBox.Show(result.Message, "KY ERP Lisans", MessageBoxButtons.OK, result.Ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
                RefreshState();
            }
            finally { online.Enabled = true; }
        };
        portal.Click += (_, _) => CompanyLicenseGuard.OpenPortal();
        actions.Controls.Add(online); actions.Controls.Add(portal);
        root.Controls.Add(actions, 0, 5); root.SetColumnSpan(actions, 2);

        var note = new Label
        {
            Text = "7 günlük demo otomatik başlar. Demo ve süresi dolmuş lisanslarda uygulama görüntüleme/raporlama için açılır; veri değiştiren kritik işlemler kapalıdır. Super Admin erişimi kaybolmaz. TNF dosyaları lisans yüzünden silinmez. Canlı FDB/GDB dosyasının fiziksel disk şifrelemesi lisans kilidinden ayrı bir güvenlik katmanıdır.",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(85, 95, 110),
            TextAlign = ContentAlignment.MiddleLeft
        };
        root.Controls.Add(note, 0, 6); root.SetColumnSpan(note, 2);
        Controls.Add(root);
    }

    void SaveDate()
    {
        var old = CompanyLicenseGuard.Load();
        var oldText = old is null ? "Yok" : old.ValidUntilUtc.ToLocalTime().ToString("dd.MM.yyyy");
        var newText = validUntil.Value.Date.ToString("dd.MM.yyyy");
        if (MessageBox.Show($"Mevcut bitiş: {oldText}\r\nYeni bitiş: {newText}\r\n\r\nTam lisans tarihi kaydedilsin mi?", "Lisans Önizleme", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        CompanyLicenseGuard.SetFullValidity(validUntil.Value.Date);
        RefreshState();
    }

    void RefreshState()
    {
        CompanyLicenseGuard.EnsureAccess(out var state, out var message);
        var mode = state.Mode.Equals("Demo", StringComparison.OrdinalIgnoreCase) ? "DEMO" : "TAM LİSANS";
        status.Text = $"{message}\r\nFirma Kimliği: {state.CompanyId}\r\nCihaz Kimliği: {CompanyLicenseGuard.DeviceId}\r\nMod: {mode}\r\nLisans No: {state.LicenseId}";
        validUntil.Value = state.ValidUntilUtc > DateTime.UtcNow.AddYears(-1) ? state.ValidUntilUtc.ToLocalTime().Date : DateTime.Today.AddYears(1);
    }
}
