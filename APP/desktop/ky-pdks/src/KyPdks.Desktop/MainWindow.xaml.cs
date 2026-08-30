using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class MainWindow : Window
{
    private readonly PdksPaths _paths = new();
    private readonly LocalPdksStore _store;
    private readonly ConfigStore _configStore;
    private readonly SecureSessionStore _sessionStore;
    private readonly ErpApiClient _erp = new();
    private readonly DispatcherTimer _refreshTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private readonly DispatcherTimer _autoSyncTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private readonly CancellationTokenSource _lifetime = new();
    private CancellationTokenSource? _approvalCts;
    private AuthFlow? _authFlow;
    private string _token = "";
    private string _role = "";
    private bool _syncing;
    private DateTimeOffset _nextAutoSync = DateTimeOffset.MinValue;

    public MainWindow()
    {
        InitializeComponent();
        _store = new LocalPdksStore(_paths);
        _configStore = new ConfigStore(_paths);
        _sessionStore = new SecureSessionStore(_paths);
        _refreshTimer.Tick += async (_, _) => await SafeRefreshAsync();
        _autoSyncTimer.Tick += async (_, _) => await AutoSyncTickAsync();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await _store.InitializeAsync(_lifetime.Token);
            DeviceText.Text = $"Cihaz: {_paths.DeviceLabel}";
            DeviceIdText.Text = _paths.DeviceLabel;
            DatabasePathText.Text = _paths.Database;
            LoadSettings();
            await LoadCachedPeopleAsync();
            await RestoreSessionAsync();
            await RefreshLocalAsync();
            _refreshTimer.Start();
            _autoSyncTimer.Start();
        }
        catch (Exception error)
        {
            NoticeText.Text = $"Başlatma hatası: {error.Message}";
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _refreshTimer.Stop();
        _autoSyncTimer.Stop();
        _approvalCts?.Cancel();
        _lifetime.Cancel();
        _erp.Dispose();
    }

    private async Task RestoreSessionAsync()
    {
        var session = _sessionStore.Load();
        if (session is null || !session.IsUsable)
        {
            if (session is not null) _sessionStore.Clear();
            SetLoggedOutUi();
            return;
        }

        _token = session.Token;
        _role = session.Role;
        SetLoggedInUi(session.FullName, session.UserName, session.Role, online: false);
        try
        {
            var me = await _erp.GetMeAsync(_token, _lifetime.Token);
            var fullName = string.IsNullOrWhiteSpace(me.FullName) ? session.FullName : me.FullName;
            var userName = string.IsNullOrWhiteSpace(me.UserName) ? session.UserName : me.UserName;
            var role = string.IsNullOrWhiteSpace(me.Role) ? session.Role : me.Role;
            _role = role;
            _sessionStore.Save(_token, userName, fullName, role);
            SetLoggedInUi(fullName, userName, role, online: true);
            await RefreshPeopleFromErpAsync();
            _nextAutoSync = DateTimeOffset.Now;
        }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            ClearSession("ERP oturumunun süresi doldu. Yeniden giriş yapın.");
        }
        catch
        {
            ErpStateText.Text = "ERP: Çevrimdışı";
            NoticeText.Text = "İnternet/ERP bağlantısı yok; yerel kart toplama çalışmaya devam ediyor.";
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        var identity = UsernameBox.Text.Trim();
        var password = PasswordBox.Password;
        if (string.IsNullOrWhiteSpace(identity) || string.IsNullOrEmpty(password))
        {
            NoticeText.Text = "Kullanıcı adı/e-posta ve parola zorunludur.";
            return;
        }

        try
        {
            LoginButton.IsEnabled = false;
            NoticeText.Text = "KY ERP hesabı doğrulanıyor...";
            var flow = await _erp.LoginAsync(identity, password, _paths.DeviceLabel, _lifetime.Token);
            PasswordBox.Clear();
            await HandleAuthFlowAsync(flow);
        }
        catch (Exception error)
        {
            NoticeText.Text = error.Message;
        }
        finally
        {
            LoginButton.IsEnabled = true;
        }
    }

    private async void MfaButton_Click(object sender, RoutedEventArgs e)
    {
        if (_authFlow is null) return;
        try
        {
            var provider = SelectedTag(MfaProviderCombo);
            NoticeText.Text = "Authenticator kodu doğrulanıyor...";
            var flow = await _erp.VerifyMfaAsync(_authFlow, MfaCodeBox.Text, provider, _lifetime.Token);
            MfaCodeBox.Clear();
            await HandleAuthFlowAsync(flow);
        }
        catch (Exception error)
        {
            NoticeText.Text = error.Message;
        }
    }

    private async Task HandleAuthFlowAsync(AuthFlow flow)
    {
        _authFlow = flow;
        var stage = (flow.Stage ?? "").Trim().ToUpperInvariant();
        switch (stage)
        {
            case "AUTHENTICATED":
                if (string.IsNullOrWhiteSpace(flow.Token)) throw new InvalidOperationException("KY ERP geçerli oturum tokenı döndürmedi.");
                _approvalCts?.Cancel();
                _token = flow.Token;
                _role = flow.Role;
                _sessionStore.Save(flow.Token, flow.UserName, flow.FullName, flow.Role);
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                SetLoggedInUi(flow.FullName, flow.UserName, flow.Role, online: true);
                NoticeText.Text = "Bu bilgisayar KY ERP hesabıyla doğrulandı.";
                await RefreshPeopleFromErpAsync();
                _nextAutoSync = DateTimeOffset.Now;
                await SyncNowAsync(manual: false);
                break;

            case "MFA_REQUIRED":
            case "MFA_LEGACY_REQUIRED":
                MfaPanel.Visibility = Visibility.Visible;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                SelectProvider(flow.Provider);
                MfaProviderText.Text = string.IsNullOrWhiteSpace(flow.Provider) ? "Authenticator kodunu girin" : $"{flow.Provider} doğrulaması";
                NoticeText.Text = "ERP hesabının MFA doğrulamasını tamamlayın.";
                break;

            case "MFA_SETUP":
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Collapsed;
                NoticeText.Text = "Bu hesapta Authenticator kurulumu tamamlanmamış. KY ERP web güvenlik ekranından Google/Microsoft Authenticator kurulumunu tamamlayıp tekrar giriş yapın.";
                break;

            case "APPROVAL_PENDING":
                MfaPanel.Visibility = Visibility.Collapsed;
                ApprovalPanel.Visibility = Visibility.Visible;
                ApprovalText.Text = string.IsNullOrWhiteSpace(flow.Message) ? "ERP giriş onayı bekleniyor; durum otomatik kontrol ediliyor." : flow.Message;
                _approvalCts?.Cancel();
                _approvalCts = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
                _ = PollApprovalAsync(flow, _approvalCts.Token);
                break;

            default:
                NoticeText.Text = string.IsNullOrWhiteSpace(flow.Message) ? $"Giriş aşaması tamamlanamadı: {flow.Stage}" : flow.Message;
                break;
        }
    }

    private async Task PollApprovalAsync(AuthFlow initial, CancellationToken ct)
    {
        var current = initial;
        var expires = DateTimeOffset.Now.AddMinutes(10);
        while (!ct.IsCancellationRequested && DateTimeOffset.Now < expires)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(3.5), ct);
                current = await _erp.CheckApprovalAsync(current, ct);
                var stage = (current.Stage ?? "").Trim().ToUpperInvariant();
                if (stage == "APPROVAL_PENDING")
                {
                    ApprovalText.Text = string.IsNullOrWhiteSpace(current.Message) ? "Onay bekleniyor..." : current.Message;
                    continue;
                }
                await HandleAuthFlowAsync(current);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception error)
            {
                ApprovalText.Text = $"Onay kontrolü bekliyor: {error.Message}";
            }
        }
        ApprovalPanel.Visibility = Visibility.Collapsed;
        NoticeText.Text = "Giriş onayı süresi doldu. Yeniden giriş yapın.";
    }

    private async void LogoutButton_Click(object sender, RoutedEventArgs e)
    {
        var token = _token;
        ClearSession("Oturum kapatıldı. Yerel Agent kart toplamaya devam eder.");
        try { if (!string.IsNullOrWhiteSpace(token)) await _erp.LogoutAsync(token, _lifetime.Token); } catch { }
    }

    private void SetLoggedInUi(string fullName, string username, string role, bool online)
    {
        LoginPanel.Visibility = Visibility.Collapsed;
        AuthenticatedPanel.Visibility = Visibility.Visible;
        AccountNameText.Text = string.IsNullOrWhiteSpace(fullName) ? username : fullName;
        AccountRoleText.Text = $"{username} · {role}";
        ActivationStateText.Text = "Cihaz doğrulandı · ERP hesabına bağlı";
        ErpStateText.Text = online ? "ERP: Bağlı" : "ERP: Çevrimdışı oturum";
        SyncButton.IsEnabled = !string.Equals(role, "DENETIM", StringComparison.OrdinalIgnoreCase);
        if (string.Equals(role, "DENETIM", StringComparison.OrdinalIgnoreCase))
            NoticeText.Text = "DENETİM hesabı salt okunurdur. Kartları ERP'ye göndermek için PDKS yazma yetkili kullanıcıyla giriş yapın.";
    }

    private void SetLoggedOutUi()
    {
        LoginPanel.Visibility = Visibility.Visible;
        AuthenticatedPanel.Visibility = Visibility.Collapsed;
        MfaPanel.Visibility = Visibility.Collapsed;
        ApprovalPanel.Visibility = Visibility.Collapsed;
        ActivationStateText.Text = "ERP hesabıyla giriş bekleniyor";
        ErpStateText.Text = "ERP: Oturum yok";
    }

    private void ClearSession(string message)
    {
        _approvalCts?.Cancel();
        _sessionStore.Clear();
        _token = "";
        _role = "";
        _authFlow = null;
        SetLoggedOutUi();
        NoticeText.Text = message;
    }

    private async Task RefreshPeopleFromErpAsync()
    {
        if (string.IsNullOrWhiteSpace(_token)) return;
        var people = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
        await _store.CachePeopleAsync(people, _lifetime.Token);
        PeopleGrid.ItemsSource = people;
        PeopleInfoText.Text = $"{people.Count} SGK'lı + kartlı personel · KY ERP ile güncel";
    }

    private async Task LoadCachedPeopleAsync()
    {
        var people = await _store.GetPeopleAsync(_lifetime.Token);
        PeopleGrid.ItemsSource = people;
        PeopleInfoText.Text = people.Count > 0
            ? $"{people.Count} personel · son ERP önbelleği"
            : "ERP ile ilk bağlantıda SGK'lı kart personeli alınacak.";
    }

    private async Task SafeRefreshAsync()
    {
        try { await RefreshLocalAsync(); }
        catch (Exception error) { LocalStatusText.Text = $"Yerel DB okunamadı: {error.Message}"; }
    }

    private async Task RefreshLocalAsync()
    {
        var snapshot = await _store.SnapshotAsync(_lifetime.Token);
        TodayCountText.Text = snapshot.TodayCount.ToString();
        PendingBigText.Text = snapshot.PendingCount.ToString();
        SyncedCountText.Text = snapshot.SyncedCount.ToString();
        ErrorCountText.Text = snapshot.ErrorCount.ToString();
        AgentStateText.Text = snapshot.AgentOnline ? $"Agent: Çalışıyor · {snapshot.AgentMode}" : "Agent: Bağlantı yok";
        TerminalStateText.Text = $"Terminal durumu: {snapshot.LastAgentMessage}";
        LocalStatusText.Text = snapshot.AgentOnline
            ? $"Yerel DB sağlam · Agent aktif · bekleyen {snapshot.PendingCount}"
            : $"Yerel DB sağlam · Agent heartbeat alınamadı · bekleyen {snapshot.PendingCount}";
        OverviewPunchGrid.ItemsSource = snapshot.Rows.Take(100).ToArray();
        LivePunchGrid.ItemsSource = snapshot.Rows;
    }

    private async void RefreshLocalButton_Click(object sender, RoutedEventArgs e) => await SafeRefreshAsync();

    private async void SyncButton_Click(object sender, RoutedEventArgs e) => await SyncNowAsync(manual: true);

    private async Task AutoSyncTickAsync()
    {
        if (_syncing || string.IsNullOrWhiteSpace(_token)) return;
        var config = _configStore.Load();
        if (!config.AutoSync || DateTimeOffset.Now < _nextAutoSync) return;
        await SyncNowAsync(manual: false);
    }

    private async Task SyncNowAsync(bool manual)
    {
        if (_syncing) return;
        if (string.IsNullOrWhiteSpace(_token))
        {
            if (manual) NoticeText.Text = "Önce KY ERP hesabıyla giriş yapın.";
            return;
        }
        if (string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase))
        {
            if (manual) NoticeText.Text = "DENETİM hesabı kart verisi yazamaz; bu hesap salt okunurdur.";
            return;
        }
        if (SecureSessionStore.JwtExpiry(_token) <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 10)
        {
            ClearSession("ERP oturumu sona erdi. Kartlar yerelde güvende; yeniden giriş yaptıktan sonra senkron devam eder.");
            return;
        }

        _syncing = true;
        SyncButton.IsEnabled = false;
        string historyId = "";
        try
        {
            if (manual) NoticeText.Text = "ERP personeli ve kart hareketleri senkronize ediliyor...";
            await RefreshPeopleFromErpAsync();
            var people = await _store.GetPeopleAsync(_lifetime.Token);
            var byCard = people.ToDictionary(person => person.CardNo, StringComparer.OrdinalIgnoreCase);
            var pending = await _store.GetPendingAsync(500, _lifetime.Token);
            if (pending.Count == 0)
            {
                NoticeText.Text = "Senkron bekleyen kart hareketi yok.";
                return;
            }

            var invalid = new List<PunchRow>();
            var valid = new List<PunchRow>();
            foreach (var row in pending)
            {
                if (!byCard.TryGetValue(row.CardNo, out var person))
                {
                    invalid.Add(row);
                    continue;
                }
                if ((!string.IsNullOrWhiteSpace(person.StartDate) && string.CompareOrdinal(row.WorkDate, person.StartDate) < 0) ||
                    (!string.IsNullOrWhiteSpace(person.ExitDate) && string.CompareOrdinal(row.WorkDate, person.ExitDate) > 0))
                {
                    invalid.Add(row);
                    continue;
                }
                valid.Add(row);
            }
            if (invalid.Count > 0)
                await _store.MarkLocalErrorAsync(invalid, "SGK=VAR + kartlı personel veya çalışma dönemi eşleşmesi yok.", _lifetime.Token);

            if (valid.Count == 0)
            {
                NoticeText.Text = $"{invalid.Count} kart hareketi personel/dönem eşleşmesi için kontrol bekliyor.";
                return;
            }

            historyId = await _store.StartSyncHistoryAsync(valid.Count, _lifetime.Token);
            var result = await _erp.SyncPunchesAsync(_token, valid, _paths.DeviceLabel, _lifetime.Token);
            await _store.ApplySyncResultAsync(valid, result, _lifetime.Token);
            await _store.FinishSyncHistoryAsync(historyId, result.AcceptedCount, result.RejectedCount, "OK", "", _lifetime.Token);
            NoticeText.Text = $"ERP senkron tamamlandı · kabul {result.AcceptedCount} · reddedilen {result.RejectedCount} · yerel kontrol {invalid.Count}";
            ErpStateText.Text = "ERP: Bağlı";
            await RefreshLocalAsync();
        }
        catch (ErpApiException error) when (error.StatusCode == HttpStatusCode.Unauthorized)
        {
            if (!string.IsNullOrWhiteSpace(historyId)) await _store.FinishSyncHistoryAsync(historyId, 0, 0, "AUTH_REQUIRED", error.Message, CancellationToken.None);
            ClearSession("ERP oturumu sona erdi. Yerel kartlar silinmedi; yeniden giriş yapın.");
        }
        catch (Exception error)
        {
            if (!string.IsNullOrWhiteSpace(historyId)) await _store.FinishSyncHistoryAsync(historyId, 0, 0, "FAILED", error.Message, CancellationToken.None);
            ErpStateText.Text = "ERP: Çevrimdışı";
            NoticeText.Text = $"Senkron yapılamadı; kartlar yerelde güvende. {error.Message}";
        }
        finally
        {
            _syncing = false;
            SyncButton.IsEnabled = !string.IsNullOrWhiteSpace(_token) && !string.Equals(_role, "DENETIM", StringComparison.OrdinalIgnoreCase);
            var seconds = _configStore.Load().SyncIntervalSeconds;
            _nextAutoSync = DateTimeOffset.Now.AddSeconds(seconds);
        }
    }

    private void LoadSettings()
    {
        var config = _configStore.Load();
        SelectTag(SourceModeCombo, config.NormalizedMode);
        TcpHostBox.Text = config.TcpHost;
        TcpPortBox.Text = config.TcpPort.ToString();
        SerialPortBox.Text = config.SerialPort;
        SelectContent(SerialBaudCombo, config.SerialBaud.ToString());
        EncodingBox.Text = config.LineEncoding;
        FileImportCheck.IsChecked = config.FileImportEnabled;
        AutoSyncCheck.IsChecked = config.AutoSync;
        SyncIntervalBox.Text = config.SyncIntervalSeconds.ToString();
    }

    private void SaveSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var current = _configStore.Load();
            current.SourceMode = SelectedTag(SourceModeCombo);
            current.TcpHost = TcpHostBox.Text.Trim();
            current.TcpPort = ParseInt(TcpPortBox.Text, current.TcpPort);
            current.SerialPort = SerialPortBox.Text.Trim();
            current.SerialBaud = ParseInt(SelectedContent(SerialBaudCombo), current.SerialBaud);
            current.LineEncoding = EncodingBox.Text.Trim();
            current.FileImportEnabled = FileImportCheck.IsChecked == true;
            current.AutoSync = AutoSyncCheck.IsChecked == true;
            current.SyncIntervalSeconds = ParseInt(SyncIntervalBox.Text, current.SyncIntervalSeconds);
            _configStore.Save(current);
            _nextAutoSync = DateTimeOffset.Now;
            NoticeText.Text = "Terminal ve senkron ayarları kaydedildi. Kaynak tipi değiştiyse Agent'ı yeniden başlatın.";
        }
        catch (Exception error) { NoticeText.Text = $"Ayarlar kaydedilemedi: {error.Message}"; }
    }

    private async void BackupButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = await _store.BackupAsync(_lifetime.Token);
            NoticeText.Text = $"Yerel PDKS yedeği oluşturuldu: {path}";
        }
        catch (Exception error) { NoticeText.Text = $"Yedek alınamadı: {error.Message}"; }
    }

    private void RestartAgentButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var info = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c sc stop \"KYERP.PDKS.Agent\" & timeout /t 2 /nobreak >nul & sc start \"KYERP.PDKS.Agent\"",
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            Process.Start(info);
            NoticeText.Text = "Windows izin verirse kart Agent servisi yeniden başlatılacak.";
        }
        catch (Win32Exception) { NoticeText.Text = "Agent yeniden başlatma işlemi iptal edildi."; }
        catch (Exception error) { NoticeText.Text = $"Agent yeniden başlatılamadı: {error.Message}"; }
    }

    private void OpenImportButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Import);
    private void OpenArchiveButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Archive);
    private void OpenDataButton_Click(object sender, RoutedEventArgs e) => OpenFolder(_paths.Root);
    private void OpenWebButton_Click(object sender, RoutedEventArgs e) => Process.Start(new ProcessStartInfo("https://kyerp.net") { UseShellExecute = true });

    private static void OpenFolder(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo("explorer.exe", $"\"{path}\"") { UseShellExecute = true });
    }

    private static string SelectedTag(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
    private static string SelectedContent(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "";
    private static int ParseInt(string value, int fallback) => int.TryParse(value, out var result) ? result : fallback;

    private static void SelectTag(ComboBox combo, string tag)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
            if (string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) { combo.SelectedItem = item; return; }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private static void SelectContent(ComboBox combo, string content)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
            if (string.Equals(item.Content?.ToString(), content, StringComparison.OrdinalIgnoreCase)) { combo.SelectedItem = item; return; }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }

    private void SelectProvider(string provider)
    {
        var normalized = (provider ?? "").Trim().ToUpperInvariant();
        SelectTag(MfaProviderCombo, normalized == "MICROSOFT" ? "MICROSOFT" : "GOOGLE");
    }
}
