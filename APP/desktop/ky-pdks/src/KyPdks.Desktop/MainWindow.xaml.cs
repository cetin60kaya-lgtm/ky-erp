using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Data.Sqlite;

namespace KyPdks.Desktop;

public partial class MainWindow : Window
{
    private readonly DesktopPaths _paths = new();
    private readonly LocalPdksReader _store;
    private readonly ErpApiClient _erp = new();
    private readonly DispatcherTimer _refreshTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private AuthFlow? _authFlow;
    private string _token = "";

    public MainWindow()
    {
        InitializeComponent();
        _store = new LocalPdksReader(_paths);
        DeviceText.Text = $"Cihaz: {_paths.DeviceLabel}";
        _refreshTimer.Tick += async (_, _) => await RefreshLocalAsync();
        Loaded += async (_, _) =>
        {
            await _store.InitializeAsync();
            await RefreshLocalAsync();
            _refreshTimer.Start();
        };
        Closed += (_, _) => _refreshTimer.Stop();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            LoginButton.IsEnabled = false;
            NoticeText.Text = "KY ERP doğrulanıyor...";
            _authFlow = await _erp.LoginAsync(UsernameBox.Text.Trim(), PasswordBox.Password, _paths.DeviceLabel);
            ApplyAuthFlow(_authFlow);
        }
        catch (Exception error)
        {
            NoticeText.Text = error.Message;
            ErpStateText.Text = "ERP: Giriş başarısız";
        }
        finally
        {
            LoginButton.IsEnabled = true;
        }
    }

    private async void MfaButton_Click(object sender, RoutedEventArgs e)
    {
        if (_authFlow is null) return;
        var code = new string(MfaCodeBox.Text.Where(char.IsDigit).ToArray());
        if (code.Length != 6)
        {
            NoticeText.Text = "Authenticator uygulamasındaki 6 haneli kodu girin.";
            return;
        }

        try
        {
            NoticeText.Text = "Authenticator doğrulanıyor...";
            _authFlow = await _erp.VerifyMfaAsync(_authFlow, code);
            ApplyAuthFlow(_authFlow);
        }
        catch (Exception error)
        {
            NoticeText.Text = error.Message;
        }
    }

    private void ApplyAuthFlow(AuthFlow flow)
    {
        var stage = flow.Stage.ToUpperInvariant();
        if (stage == "AUTHENTICATED" && !string.IsNullOrWhiteSpace(flow.Token))
        {
            _token = flow.Token;
            MfaPanel.Visibility = Visibility.Collapsed;
            ErpStateText.Text = $"ERP: {flow.UserName} · {flow.Role}";
            SyncButton.IsEnabled = true;
            NoticeText.Text = "KY ERP bağlantısı hazır.";
            return;
        }

        if (stage is "MFA_REQUIRED" or "MFA_SETUP" or "MFA_LEGACY_REQUIRED")
        {
            MfaPanel.Visibility = Visibility.Visible;
            MfaProviderText.Text = string.IsNullOrWhiteSpace(flow.Provider)
                ? "Authenticator uygulamasındaki 6 haneli kod"
                : $"{flow.Provider} Authenticator · 6 haneli kod";
            NoticeText.Text = "Güvenlik doğrulaması bekleniyor.";
            return;
        }

        if (stage == "APPROVAL_PENDING")
        {
            NoticeText.Text = "Bu hesap için yönetici giriş onayı bekleniyor. Masaüstü onay takibi sonraki adımda otomatikleştirilecek.";
            return;
        }

        NoticeText.Text = flow.Message ?? $"KY ERP giriş aşaması: {flow.Stage}";
    }

    private async void RefreshLocalButton_Click(object sender, RoutedEventArgs e) => await RefreshLocalAsync();

    private async void SyncButton_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_token))
        {
            NoticeText.Text = "Önce KY ERP hesabıyla giriş yapın.";
            return;
        }

        try
        {
            SyncButton.IsEnabled = false;
            var pending = await _store.GetPendingAsync(500);
            if (pending.Count == 0)
            {
                NoticeText.Text = "Bekleyen kart kaydı yok.";
                return;
            }

            NoticeText.Text = $"{pending.Count} kart kaydı ERP'ye gönderiliyor...";
            var result = await _erp.SyncPunchesAsync(_token, pending, _paths.DeviceLabel);
            await _store.ApplySyncResultAsync(pending, result.RejectedLocalIds, result.RejectedMessage);
            NoticeText.Text = result.RejectedLocalIds.Count == 0
                ? $"{pending.Count} kart kaydı ERP'ye senkronlandı."
                : $"Senkron tamamlandı; {result.RejectedLocalIds.Count} kayıt eşleşmedi ve yerelde bekliyor.";
            await RefreshLocalAsync();
        }
        catch (Exception error)
        {
            NoticeText.Text = error.Message;
        }
        finally
        {
            SyncButton.IsEnabled = !string.IsNullOrWhiteSpace(_token);
        }
    }

    private void OpenImportButton_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(_paths.Import);
        Process.Start(new ProcessStartInfo("explorer.exe", _paths.Import) { UseShellExecute = true });
    }

    private async Task RefreshLocalAsync()
    {
        try
        {
            var snapshot = await _store.SnapshotAsync();
            DatabaseStateText.Text = "Hazır";
            PendingCountText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
            PendingBigText.Text = snapshot.PendingCount.ToString(CultureInfo.InvariantCulture);
            SyncedCountText.Text = snapshot.SyncedCount.ToString(CultureInfo.InvariantCulture);
            TodayCountText.Text = snapshot.TodayCount.ToString(CultureInfo.InvariantCulture);
            LastPunchText.Text = snapshot.LastPunch is null ? "-" : $"{snapshot.LastPunch.CardNo} {snapshot.LastPunch.EventTime}";
            PunchGrid.ItemsSource = snapshot.Rows;
            AgentStateText.Text = snapshot.AgentOnline ? "Agent: Çalışıyor" : "Agent: Bekleniyor";
        }
        catch (Exception error)
        {
            DatabaseStateText.Text = "Hata";
            AgentStateText.Text = "Agent: Kontrol edilemedi";
            NoticeText.Text = error.Message;
        }
    }
}

sealed class DesktopPaths
{
    public string Root { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "KY ERP", "PDKS");
    public string Data => Path.Combine(Root, "Data");
    public string Import => Path.Combine(Root, "Import");
    public string Database => Path.Combine(Data, "pdks.db");
    public string DeviceFile => Path.Combine(Root, "device.id");
    public string DeviceLabel { get; }

    public DesktopPaths()
    {
        Directory.CreateDirectory(Data);
        Directory.CreateDirectory(Import);
        var id = File.Exists(DeviceFile) ? File.ReadAllText(DeviceFile).Trim() : "";
        if (string.IsNullOrWhiteSpace(id))
        {
            id = Guid.NewGuid().ToString("N");
            Directory.CreateDirectory(Root);
            File.WriteAllText(DeviceFile, id);
        }
        DeviceLabel = $"PDKS-WINDOWS:{Environment.MachineName}:{id}";
    }
}

sealed record PunchRow(string Id, string CardNo, string WorkDate, string EventTime, string Source, string SourceRef, string SyncState);
sealed record LocalSnapshot(int PendingCount, int SyncedCount, int TodayCount, bool AgentOnline, PunchRow? LastPunch, IReadOnlyList<PunchRow> Rows);

sealed class LocalPdksReader(DesktopPaths paths)
{
    private string ConnectionString => new SqliteConnectionStringBuilder
    {
        DataSource = paths.Database,
        Mode = SqliteOpenMode.ReadWriteCreate,
        Cache = SqliteCacheMode.Shared,
    }.ToString();

    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
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
        await command.ExecuteNonQueryAsync();
    }

    public async Task<LocalSnapshot> SnapshotAsync()
    {
        await InitializeAsync();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        async Task<int> CountAsync(string where, params object[] values)
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(*) FROM raw_punches WHERE {where}";
            for (var i = 0; i < values.Length; i++) cmd.Parameters.AddWithValue($"$p{i}", values[i]);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync() ?? 0, CultureInfo.InvariantCulture);
        }

        var today = DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var pending = await CountAsync("sync_state<>'SYNCED'");
        var synced = await CountAsync("sync_state='SYNCED'");
        var todayCount = await CountAsync("work_date=$p0", today);

        var rows = new List<PunchRow>();
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT id,card_no,work_date,event_time,source,COALESCE(source_ref,''),sync_state FROM raw_punches ORDER BY event_at DESC LIMIT 250";
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new PunchRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6)));
            }
        }

        DateTimeOffset? heartbeat = null;
        await using (var cmd = connection.CreateCommand())
        {
            cmd.CommandText = "SELECT updated_at FROM agent_state WHERE state_key='heartbeat' LIMIT 1";
            var value = Convert.ToString(await cmd.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
            if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)) heartbeat = parsed;
        }
        var online = heartbeat.HasValue && DateTimeOffset.Now - heartbeat.Value < TimeSpan.FromSeconds(15);
        return new LocalSnapshot(pending, synced, todayCount, online, rows.FirstOrDefault(), rows);
    }

    public async Task<List<PunchRow>> GetPendingAsync(int limit)
    {
        var rows = new List<PunchRow>();
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT id,card_no,work_date,event_time,source,COALESCE(source_ref,''),sync_state FROM raw_punches WHERE sync_state<>'SYNCED' ORDER BY event_at LIMIT $limit";
        cmd.Parameters.AddWithValue("$limit", limit);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) rows.Add(new PunchRow(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6)));
        return rows;
    }

    public async Task ApplySyncResultAsync(IReadOnlyList<PunchRow> sent, IReadOnlySet<string> rejectedLocalIds, string rejectedMessage)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        foreach (var row in sent)
        {
            await using var cmd = connection.CreateCommand();
            cmd.Transaction = (SqliteTransaction)transaction;
            var rejected = rejectedLocalIds.Contains(row.Id);
            cmd.CommandText = rejected
                ? "UPDATE raw_punches SET sync_state='ERROR',sync_error=$error WHERE id=$id"
                : "UPDATE raw_punches SET sync_state='SYNCED',sync_error=NULL,synced_at=$now WHERE id=$id";
            cmd.Parameters.AddWithValue("$id", row.Id);
            cmd.Parameters.AddWithValue("$error", rejectedMessage);
            cmd.Parameters.AddWithValue("$now", DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));
            await cmd.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }
}

sealed record AuthFlow(
    string Stage,
    string Token,
    string UserName,
    string Role,
    string ChallengeId,
    string ChallengeToken,
    string Provider,
    string? Message);

sealed record SyncResult(HashSet<string> RejectedLocalIds, string RejectedMessage);

sealed class ErpApiClient
{
    private readonly HttpClient _http = new() { BaseAddress = new Uri("https://api.kyerp.net"), Timeout = TimeSpan.FromSeconds(20) };
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public async Task<AuthFlow> LoginAsync(string identity, string password, string deviceLabel)
    {
        if (string.IsNullOrWhiteSpace(identity) || string.IsNullOrEmpty(password)) throw new InvalidOperationException("Kullanıcı adı/e-posta ve parola zorunludur.");
        return ParseAuth(await SendJsonAsync(HttpMethod.Post, "/api/auth/login", new { username = identity, password, deviceLabel }, ""));
    }

    public async Task<AuthFlow> VerifyMfaAsync(AuthFlow flow, string code)
    {
        return ParseAuth(await SendJsonAsync(HttpMethod.Post, "/api/auth/mfa/verify", new
        {
            challengeId = flow.ChallengeId,
            challengeToken = flow.ChallengeToken,
            code,
            provider = flow.Provider,
            resetProvider = "",
        }, ""));
    }

    public async Task<SyncResult> SyncPunchesAsync(string token, IReadOnlyList<PunchRow> punches, string deviceLabel)
    {
        var rows = punches.Select(row => new
        {
            localId = row.Id,
            cardNo = row.CardNo,
            workDate = row.WorkDate,
            eventTime = row.EventTime,
            direction = "AUTO",
            source = deviceLabel,
            note = $"KY PDKS · {row.Source}",
        }).ToArray();
        using var document = await SendJsonAsync(HttpMethod.Post, "/api/ik/personnel-control/time-events/import", new { source = deviceLabel, rows }, token);
        var data = UnwrapData(document.RootElement);
        var rejected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var messages = new List<string>();
        if (data.TryGetProperty("rejected", out var rejectedNode) && rejectedNode.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in rejectedNode.EnumerateArray())
            {
                var localId = Text(item, "localId");
                if (!string.IsNullOrWhiteSpace(localId)) rejected.Add(localId);
                var reason = Text(item, "reason");
                if (!string.IsNullOrWhiteSpace(reason)) messages.Add(reason);
            }
        }
        return new SyncResult(rejected, messages.FirstOrDefault() ?? "ERP kart eşleştirmesi reddetti.");
    }

    private async Task<JsonDocument> SendJsonAsync(HttpMethod method, string path, object body, string token)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await _http.SendAsync(request);
        var raw = await response.Content.ReadAsStringAsync();
        JsonDocument document;
        try { document = JsonDocument.Parse(string.IsNullOrWhiteSpace(raw) ? "{}" : raw); }
        catch { throw new InvalidOperationException($"KY ERP geçersiz yanıt döndürdü (HTTP {(int)response.StatusCode})."); }
        if (!response.IsSuccessStatusCode || (document.RootElement.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.False))
        {
            var message = document.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var msg)
                ? msg.GetString()
                : null;
            document.Dispose();
            throw new InvalidOperationException(message ?? $"KY ERP isteği başarısız (HTTP {(int)response.StatusCode}).");
        }
        return document;
    }

    private static AuthFlow ParseAuth(JsonDocument document)
    {
        using (document)
        {
            var root = UnwrapData(document.RootElement);
            var user = root.TryGetProperty("user", out var userNode) ? userNode : default;
            var provider = Text(root, "provider");
            if (string.IsNullOrWhiteSpace(provider) && root.TryGetProperty("availableProviders", out var providers) && providers.ValueKind == JsonValueKind.Array)
                provider = providers.EnumerateArray().Select(item => item.GetString()).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";
            return new AuthFlow(
                Text(root, "stage"),
                Text(root, "token"),
                user.ValueKind == JsonValueKind.Object ? Text(user, "username") : "",
                user.ValueKind == JsonValueKind.Object ? Text(user, "role") : "",
                Text(root, "challengeId"),
                Text(root, "challengeToken"),
                provider,
                Text(root, "message"));
        }
    }

    private static JsonElement UnwrapData(JsonElement root)
    {
        if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object) return data;
        return root;
    }

    private static string Text(JsonElement node, string name)
    {
        return node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value)
            ? value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString()
            : "";
    }
}
