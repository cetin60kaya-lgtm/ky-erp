using System.ComponentModel;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using KyPdks.Shared;
using Microsoft.Web.WebView2.Core;

namespace KyPdks.Desktop;

public partial class KyErpShellWindow : Window
{
    private static readonly Uri AppUri = new("https://app.kyerp.net/");
    private static readonly Uri HealthUri = new("https://api.kyerp.net/api/health");

    private readonly DesktopOfflineStore _offlineStore = new();
    private readonly PdksPaths _pdksPaths = new();
    private readonly ErpApiClient _erp = new();
    private readonly HttpClient _probe = new() { Timeout = TimeSpan.FromSeconds(4) };
    private readonly DispatcherTimer _connectionTimer = new() { Interval = TimeSpan.FromSeconds(12) };
    private readonly CancellationTokenSource _lifetime = new();

    private bool _online;
    private bool _offlineCenterVisible;
    private bool _audit;
    private string _token = "";
    private IReadOnlyList<CachedPerson> _pdksPeople = Array.Empty<CachedPerson>();

    public KyErpShellWindow()
    {
        InitializeComponent();
        _connectionTimer.Tick += async (_, _) => await CheckConnectionAsync();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            await _offlineStore.InitializeAsync(_lifetime.Token);
            await InitializeWebViewAsync();
            await CheckConnectionAsync();
            await RefreshOfflineAsync();
            _connectionTimer.Start();
            FooterStatusText.Text = "KY ERP Masaüstü hazır. Online ERP ve yerel offline katman birlikte çalışıyor.";
        }
        catch (Exception error)
        {
            FooterStatusText.Text = error.Message;
            ShowOfflineCenter(true);
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _connectionTimer.Stop();
        _lifetime.Cancel();
        _erp.Dispose();
        _probe.Dispose();
    }

    private async Task InitializeWebViewAsync()
    {
        var webRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KY ERP", "Desktop", "WebView2");
        Directory.CreateDirectory(webRoot);
        var environment = await CoreWebView2Environment.CreateAsync(null, webRoot);
        await ErpWebView.EnsureCoreWebView2Async(environment);

        ErpWebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        ErpWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
        ErpWebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        ErpWebView.CoreWebView2.Settings.IsZoomControlEnabled = true;

        ErpWebView.CoreWebView2.AddWebResourceRequestedFilter("https://api.kyerp.net/api/*", CoreWebView2WebResourceContext.All);
        ErpWebView.CoreWebView2.WebResourceRequested += CoreWebView2_WebResourceRequested;
        ErpWebView.CoreWebView2.WebResourceResponseReceived += CoreWebView2_WebResourceResponseReceived;
        ErpWebView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
        ErpWebView.CoreWebView2.Source = AppUri;
    }

    private async void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            FooterStatusText.Text = "ERP Web açılamadı. Offline çalışma merkezi kullanılabilir.";
            if (!_online) ShowOfflineCenter(true);
            return;
        }

        await TryRefreshIdentityAsync();
        UpdatePageTitle(ErpWebView.Source?.AbsolutePath ?? "/");
    }

    private async void CoreWebView2_WebResourceResponseReceived(object? sender, CoreWebView2WebResourceResponseReceivedEventArgs e)
    {
        try
        {
            if (!string.Equals(e.Request.Method, "GET", StringComparison.OrdinalIgnoreCase)) return;
            if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || !uri.Host.Equals("api.kyerp.net", StringComparison.OrdinalIgnoreCase)) return;
            if (e.Response.StatusCode < 200 || e.Response.StatusCode >= 300) return;

            await using var stream = await e.Response.GetContentAsync();
            using var reader = new StreamReader(stream, Encoding.UTF8, true, 4096, leaveOpen: false);
            var payload = await reader.ReadToEndAsync(_lifetime.Token);
            if (string.IsNullOrWhiteSpace(payload)) return;

            var trimmed = payload.TrimStart();
            if (!(trimmed.StartsWith('{') || trimmed.StartsWith('['))) return;

            string contentType;
            try { contentType = e.Response.Headers.GetHeader("Content-Type"); }
            catch { contentType = "application/json; charset=utf-8"; }

            await _offlineStore.SaveCacheAsync(
                CacheKey(e.Request.Uri),
                await GetWebStorageValueAsync("kyerp.active_company"),
                ModuleFromApiUri(uri.AbsolutePath),
                payload,
                string.IsNullOrWhiteSpace(contentType) ? "application/json; charset=utf-8" : contentType,
                e.Response.StatusCode,
                _lifetime.Token);
            await _offlineStore.SetStateAsync("last_api_sync", DateTimeOffset.Now.ToString("O"), _lifetime.Token);
        }
        catch
        {
            // Cache hatası canlı ERP yanıtını etkilemez.
        }
    }

    private async void CoreWebView2_WebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (_online) return;
        if (!string.Equals(e.Request.Method, "GET", StringComparison.OrdinalIgnoreCase)) return;
        if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || !uri.Host.Equals("api.kyerp.net", StringComparison.OrdinalIgnoreCase)) return;

        var deferral = e.GetDeferral();
        try
        {
            var cached = await _offlineStore.GetCacheAsync(CacheKey(e.Request.Uri), _lifetime.Token);
            if (cached is not null)
            {
                var bytes = Encoding.UTF8.GetBytes(cached.PayloadJson);
                var stream = new MemoryStream(bytes);
                var headers = $"Content-Type: {cached.ContentType}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://app.kyerp.net\r\n";
                e.Response = ErpWebView.CoreWebView2.Environment.CreateWebResourceResponse(
                    stream, cached.HttpStatus, "KY ERP OFFLINE CACHE", headers);
                return;
            }

            const string unavailable = "{\"ok\":false,\"error\":{\"code\":\"KYERP_DESKTOP_OFFLINE_CACHE_MISS\",\"message\":\"Bu veri daha önce masaüstüne senkronlanmamış. İnternet geldiğinde yenileyin.\"}}";
            e.Response = ErpWebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(Encoding.UTF8.GetBytes(unavailable)),
                503,
                "KY ERP OFFLINE",
                "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://app.kyerp.net\r\n");
        }
        catch
        {
            // WebView kendi network hatasını gösterir.
        }
        finally
        {
            deferral.Complete();
        }
    }

    private async Task CheckConnectionAsync()
    {
        var online = false;
        try
        {
            using var response = await _probe.GetAsync(HealthUri, HttpCompletionOption.ResponseHeadersRead, _lifetime.Token);
            online = response.IsSuccessStatusCode;
        }
        catch { online = false; }

        var changed = _online != online;
        _online = online;
        SidebarConnectionDot.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(online ? "#35C18A" : "#E35D6A"));
        SidebarConnectionText.Text = online ? "Cloud bağlı • Senkron aktif" : "Offline • Yerel çalışma";
        FooterStatusText.Text = online
            ? "Cloud bağlı. D1 ana kaynak; görüntülenen API verileri masaüstü cache'ine güncelleniyor."
            : "İnternet/Cloud erişimi yok. Son senkronlanan veriler ve PDKS Agent yerel çalışmaya devam eder.";

        if (changed)
        {
            await _offlineStore.SetStateAsync("connection", online ? "ONLINE" : "OFFLINE", _lifetime.Token);
            await RefreshOfflineAsync();
            if (online && ErpWebView.CoreWebView2 is not null)
            {
                await TryRefreshIdentityAsync();
                if (_offlineCenterVisible) ShowOfflineCenter(false);
            }
        }
    }

    private async Task TryRefreshIdentityAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        try
        {
            var script = "(() => ({ token: localStorage.getItem('kyerp_auth_token') || '', user: localStorage.getItem('kyerp_auth_user') || '' }))()";
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync(script);
            using var document = JsonDocument.Parse(result);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return;
            var token = document.RootElement.TryGetProperty("token", out var tokenNode) ? tokenNode.GetString() ?? "" : "";
            var userJson = document.RootElement.TryGetProperty("user", out var userNode) ? userNode.GetString() ?? "" : "";

            ApplyUserPresentation(userJson);
            if (string.IsNullOrWhiteSpace(token))
            {
                _token = "";
                _audit = false;
                ApplyScope(false);
                return;
            }

            if (token == _token && _pdksPeople.Count > 0) return;
            _token = token;
            var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
            _audit = profile.Audit || profile.Scope.Equals("AUDIT", StringComparison.OrdinalIgnoreCase) || profile.Role.Equals("DENETIM", StringComparison.OrdinalIgnoreCase);
            _pdksPeople = await _erp.GetPdksPeopleAsync(token, _lifetime.Token);
            ApplyScope(_audit);
            CurrentRoleText.Text = _audit
                ? $"DENETİM • SGK kartlı personel • Salt okunur"
                : string.IsNullOrWhiteSpace(profile.Role) ? "KY ERP kullanıcısı" : profile.Role;
        }
        catch
        {
            // Login sayfasında token olmaması normaldir.
        }
    }

    private void ApplyUserPresentation(string userJson)
    {
        if (string.IsNullOrWhiteSpace(userJson))
        {
            CurrentUserText.Text = "KY ERP oturumu";
            return;
        }
        try
        {
            using var user = JsonDocument.Parse(userJson);
            var root = user.RootElement;
            CurrentUserText.Text = FirstText(root, "fullName", "name", "username") is { Length: > 0 } name ? name : "KY ERP kullanıcısı";
            var role = FirstText(root, "role");
            if (!_audit && !string.IsNullOrWhiteSpace(role)) CurrentRoleText.Text = role;
        }
        catch { }
    }

    private void ApplyScope(bool audit)
    {
        if (audit)
        {
            FinanceGroup.Visibility = Visibility.Collapsed;
            ProductionGroup.Visibility = Visibility.Collapsed;
            SystemGroup.Visibility = Visibility.Collapsed;
            PeopleGroup.Visibility = Visibility.Visible;
            IkButton.Visibility = Visibility.Visible;
            PdksButton.Visibility = Visibility.Visible;
            NativePdksButton.Visibility = Visibility.Visible;
            PageSubTitleText.Text = "DENETİM • yalnız izin verilen SGK/PDKS görünümü • salt okunur";
            return;
        }

        FinanceGroup.Visibility = Visibility.Visible;
        ProductionGroup.Visibility = Visibility.Visible;
        SystemGroup.Visibility = Visibility.Visible;
        PeopleGroup.Visibility = Visibility.Visible;
        PageSubTitleText.Text = "Web + D1 + File Hub + Offline çalışma kopyası";
    }

    private async void ModuleButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string path) return;
        ShowOfflineCenter(false);
        if (ErpWebView.CoreWebView2 is null) return;
        var uri = new Uri(AppUri, path);
        ErpWebView.CoreWebView2.Navigate(uri.ToString());
        UpdatePageTitle(path);
        await TryRefreshIdentityAsync();
    }

    private async void NativePdksButton_Click(object sender, RoutedEventArgs e)
    {
        await TryRefreshIdentityAsync();
        if (string.IsNullOrWhiteSpace(_token))
        {
            MessageBox.Show(this, "Önce KY ERP Web oturumunu açın. Masaüstü PDKS aynı oturumu kullanacaktır.", "KY ERP Masaüstü", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            if (_pdksPeople.Count == 0) _pdksPeople = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
            var window = new PdksUnifiedWindow(_token, _pdksPeople, _pdksPaths, !_audit) { Owner = this };
            window.ShowDialog();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "PDKS", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await CheckConnectionAsync();
        if (_online && ErpWebView.CoreWebView2 is not null)
        {
            ErpWebView.CoreWebView2.Reload();
            await TryRefreshIdentityAsync();
        }
        await RefreshOfflineAsync();
    }

    private void OfflineCenterButton_Click(object sender, RoutedEventArgs e) => ShowOfflineCenter(!_offlineCenterVisible);

    private async void RefreshOfflineButton_Click(object sender, RoutedEventArgs e) => await RefreshOfflineAsync();

    private async void SaveOfflineDraftButton_Click(object sender, RoutedEventArgs e)
    {
        var text = OfflineDraftText.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            MessageBox.Show(this, "Offline kayıt için işlem veya not yazın.", "KY ERP Masaüstü", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var module = (OfflineModuleCombo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "GENEL";
        var payload = JsonSerializer.Serialize(new
        {
            text,
            createdAt = DateTimeOffset.Now,
            requiresReview = true,
            source = "KY_ERP_DESKTOP_OFFLINE",
        });
        await _offlineStore.EnqueueAsync("", module, "DRAFT", "offline://review", payload, ct: _lifetime.Token);
        OfflineDraftText.Clear();
        await RefreshOfflineAsync();
        FooterStatusText.Text = "Offline işlem taslağı kaydedildi. Bağlantı geldiğinde kontrol edilmeden işletme verisine yazılmaz.";
    }

    private async Task RefreshOfflineAsync()
    {
        try
        {
            var pending = await _offlineStore.GetPendingAsync(300, _lifetime.Token);
            OfflineOutboxGrid.ItemsSource = pending;
            PendingText.Text = $"{pending.Count} bekleyen";
            OfflinePendingCountText.Text = pending.Count.ToString();
            PendingBadge.Visibility = pending.Count > 0 ? Visibility.Visible : Visibility.Collapsed;

            var lastSync = await _offlineStore.GetStateAsync("last_api_sync", _lifetime.Token);
            LastSyncText.Text = DateTimeOffset.TryParse(lastSync, out var parsed) ? parsed.LocalDateTime.ToString("dd.MM HH:mm") : "Henüz yok";

            var agentRunning = Process.GetProcessesByName("KYERP.PDKS.Agent").Length > 0;
            OfflineAgentText.Text = agentRunning ? "Çalışıyor" : "Servis kontrolü";
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            FooterStatusText.Text = error.Message;
        }
    }

    private void ShowOfflineCenter(bool visible)
    {
        _offlineCenterVisible = visible;
        OfflineCenter.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        ErpWebView.Visibility = visible ? Visibility.Collapsed : Visibility.Visible;
        if (visible)
        {
            PageTitleText.Text = "Offline Çalışma Merkezi";
            PageSubTitleText.Text = "Kesintide çalışma • cache • güvenli taslak • PDKS Agent";
        }
    }

    private void UpdatePageTitle(string path)
    {
        if (_offlineCenterVisible) return;
        var title = path switch
        {
            var p when p.StartsWith("/muhasebe", StringComparison.OrdinalIgnoreCase) => "Muhasebe",
            var p when p.StartsWith("/isnet", StringComparison.OrdinalIgnoreCase) => "İşNet / e-Belge",
            var p when p.StartsWith("/desen", StringComparison.OrdinalIgnoreCase) => "Desen",
            var p when p.StartsWith("/boyahane", StringComparison.OrdinalIgnoreCase) => "Boyahane",
            var p when p.StartsWith("/uretim", StringComparison.OrdinalIgnoreCase) => "İmalat",
            var p when p.StartsWith("/ik", StringComparison.OrdinalIgnoreCase) => "İK / Personel",
            var p when p.StartsWith("/pdks", StringComparison.OrdinalIgnoreCase) => "PDKS",
            var p when p.StartsWith("/asistan", StringComparison.OrdinalIgnoreCase) => "KY ERP Asistan",
            var p when p.StartsWith("/admin", StringComparison.OrdinalIgnoreCase) => "Yönetim / Dosya Merkezi",
            _ => "KY ERP Çalışma Merkezi",
        };
        PageTitleText.Text = title;
    }

    private async Task<string> GetWebStorageValueAsync(string key)
    {
        if (ErpWebView.CoreWebView2 is null) return "";
        try
        {
            var json = await ErpWebView.CoreWebView2.ExecuteScriptAsync($"localStorage.getItem({JsonSerializer.Serialize(key)}) || ''");
            return JsonSerializer.Deserialize<string>(json) ?? "";
        }
        catch { return ""; }
    }

    private static string CacheKey(string uri) => $"GET|{uri}";

    private static string ModuleFromApiUri(string path)
    {
        var lower = path.ToLowerInvariant();
        if (lower.Contains("/muhasebe") || lower.Contains("account")) return "MUHASEBE";
        if (lower.Contains("/isnet")) return "ISNET";
        if (lower.Contains("/desen")) return "DESEN";
        if (lower.Contains("/boyahane")) return "BOYAHANE";
        if (lower.Contains("production") || lower.Contains("/uretim")) return "IMALAT";
        if (lower.Contains("/ik/") || lower.Contains("personnel")) return "IK";
        if (lower.Contains("file-hub") || lower.Contains("storage")) return "FILE_HUB";
        if (lower.Contains("assistant")) return "ASISTAN";
        return "GENEL";
    }

    private static string FirstText(JsonElement node, params string[] names)
    {
        if (node.ValueKind != JsonValueKind.Object) return "";
        foreach (var name in names)
        {
            if (!node.TryGetProperty(name, out var value)) continue;
            var result = value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
            if (!string.IsNullOrWhiteSpace(result)) return result!;
        }
        return "";
    }
}
