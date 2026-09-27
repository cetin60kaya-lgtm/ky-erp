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
    private readonly HashSet<string> _allowedModules = new(StringComparer.OrdinalIgnoreCase);

    private bool _online;
    private bool _offlineCenterVisible;
    private bool _audit;
    private bool _preloadMode;
    private bool _syncInProgress;
    private string _token = "";
    private string _preloadedToken = "";
    private IReadOnlyList<CachedPerson> _pdksPeople = Array.Empty<CachedPerson>();

    public KyErpShellWindow()
    {
        InitializeComponent();
        _connectionTimer.Tick += async (_, _) => await CheckConnectionAsync();

        // Masaüstü tek ürün: KY ERP'nin tamamı. PDKS yalnız İK altındaki cihaz katmanıdır.
        FileHubButton.Tag = "/depolama/depolama-genel";
        FileHubButton.Content = "▤   Depolama / Dosya Merkezi";
        DesenButton.Content = "◆   Desen / Kalıp";
        BoyahaneButton.Content = "●   Boyahane / Numune / Stok";
        NativePdksButton.Content = "↳   PDKS Cihaz İşlemleri";
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
            FooterStatusText.Text = "KY ERP Masaüstü hazır. Tüm ERP modülleri, online ERP ve yerel offline katman birlikte çalışıyor.";
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
        ErpWebView.Source = AppUri;
    }

    private async void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            FooterStatusText.Text = "ERP Web açılamadı. Offline çalışma merkezi kullanılabilir.";
            if (!_online) ShowOfflineCenter(true);
            return;
        }
        await ApplyEmbeddedWebModeAsync();
        await TryRefreshIdentityAsync();
        UpdatePageTitle(ErpWebView.Source?.AbsolutePath ?? "/");
    }

    private async Task ApplyEmbeddedWebModeAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        const string script = """
        (() => {
          const id = 'kyerp-desktop-host-style';
          if (document.getElementById(id)) return true;
          const style = document.createElement('style');
          style.id = id;
          style.textContent = `
            .shell-v3{grid-template-columns:minmax(0,1fr)!important}
            .shell-v3-sidebar,.shell-v3-overlay{display:none!important}
            .shell-v3-main{grid-column:1!important;min-width:0!important;width:100%!important}
            .shell-v3-icon.mobile{display:none!important}
          `;
          document.head.appendChild(style);
          document.documentElement.dataset.kyerpDesktopHost = '1';
          return true;
        })()
        """;
        try { await ErpWebView.CoreWebView2.ExecuteScriptAsync(script); } catch { }
    }

    private async void CoreWebView2_WebResourceResponseReceived(object? sender, CoreWebView2WebResourceResponseReceivedEventArgs e)
    {
        try
        {
            if (!string.Equals(e.Request.Method, "GET", StringComparison.OrdinalIgnoreCase)) return;
            if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || !uri.Host.Equals("api.kyerp.net", StringComparison.OrdinalIgnoreCase)) return;
            if (e.Response.StatusCode is < 200 or >= 300) return;
            await using var stream = await e.Response.GetContentAsync();
            using var reader = new StreamReader(stream, Encoding.UTF8, true, 4096, false);
            var payload = await reader.ReadToEndAsync(_lifetime.Token);
            if (string.IsNullOrWhiteSpace(payload)) return;
            var trimmed = payload.TrimStart();
            if (trimmed.Length == 0 || (trimmed[0] != '{' && trimmed[0] != '[')) return;
            string contentType;
            try { contentType = e.Response.Headers.GetHeader("Content-Type"); }
            catch { contentType = "application/json; charset=utf-8"; }
            await _offlineStore.SaveCacheAsync(
                CacheKey(e.Request.Uri),
                await GetWebStorageValueAsync("kyerp.activeCompany"),
                ModuleFromApiUri(uri.AbsolutePath),
                payload,
                string.IsNullOrWhiteSpace(contentType) ? "application/json; charset=utf-8" : contentType,
                e.Response.StatusCode,
                _lifetime.Token);
            await _offlineStore.SetStateAsync("last_api_sync", DateTimeOffset.Now.ToString("O"), _lifetime.Token);
        }
        catch { }
    }

    private async void CoreWebView2_WebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (!Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || !uri.Host.Equals("api.kyerp.net", StringComparison.OrdinalIgnoreCase)) return;

        if (_preloadMode && !string.Equals(e.Request.Method, "GET", StringComparison.OrdinalIgnoreCase) && !string.Equals(e.Request.Method, "HEAD", StringComparison.OrdinalIgnoreCase))
        {
            const string blocked = "{\"ok\":false,\"error\":{\"code\":\"KYERP_DESKTOP_PRELOAD_READ_ONLY\",\"message\":\"Tam Eşitle yalnız okuma isteği çalıştırır.\"}}";
            e.Response = ErpWebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(Encoding.UTF8.GetBytes(blocked)), 409, "KY ERP PRELOAD READ ONLY",
                "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://app.kyerp.net\r\n");
            return;
        }

        if (_online || !string.Equals(e.Request.Method, "GET", StringComparison.OrdinalIgnoreCase)) return;
        var deferral = e.GetDeferral();
        try
        {
            var cached = await _offlineStore.GetCacheAsync(CacheKey(e.Request.Uri), _lifetime.Token);
            if (cached is not null)
            {
                var headers = $"Content-Type: {cached.ContentType}\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://app.kyerp.net\r\n";
                e.Response = ErpWebView.CoreWebView2.Environment.CreateWebResourceResponse(
                    new MemoryStream(Encoding.UTF8.GetBytes(cached.PayloadJson)), cached.HttpStatus, "KY ERP OFFLINE CACHE", headers);
                return;
            }
            const string unavailable = "{\"ok\":false,\"error\":{\"code\":\"KYERP_DESKTOP_OFFLINE_CACHE_MISS\",\"message\":\"Bu veri daha önce masaüstüne senkronlanmamış. İnternet geldiğinde Tam Eşitle çalıştırın.\"}}";
            e.Response = ErpWebView.CoreWebView2.Environment.CreateWebResourceResponse(
                new MemoryStream(Encoding.UTF8.GetBytes(unavailable)), 503, "KY ERP OFFLINE",
                "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://app.kyerp.net\r\n");
        }
        catch { }
        finally { deferral.Complete(); }
    }

    private async Task CheckConnectionAsync()
    {
        var next = false;
        try
        {
            using var response = await _probe.GetAsync(HealthUri, HttpCompletionOption.ResponseHeadersRead, _lifetime.Token);
            next = response.IsSuccessStatusCode;
        }
        catch { }
        var changed = next != _online;
        _online = next;
        SidebarConnectionDot.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(_online ? "#35C18A" : "#E35D6A"));
        SidebarConnectionText.Text = _online ? "Cloud bağlı • Senkron aktif" : "Offline • Yerel çalışma";
        FooterStatusText.Text = _online
            ? "Cloud bağlı. D1 ana kaynak; görüntülenen API verileri masaüstü cache'ine güncelleniyor."
            : "İnternet/Cloud erişimi yok. Son senkronlanan ERP verileri ve PDKS cihaz agentı yerel çalışmaya devam eder.";
        if (!changed) return;
        await _offlineStore.SetStateAsync("connection", _online ? "ONLINE" : "OFFLINE", _lifetime.Token);
        await RefreshOfflineAsync();
        if (_online && ErpWebView.CoreWebView2 is not null)
        {
            await TryRefreshIdentityAsync();
            if (_offlineCenterVisible) ShowOfflineCenter(false);
        }
    }

    private async Task TryRefreshIdentityAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        try
        {
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync(
                "(() => ({ token: localStorage.getItem('kyerp_auth_token') || '', user: localStorage.getItem('kyerp_auth_user') || '' }))()");
            using var document = JsonDocument.Parse(result);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return;
            var token = document.RootElement.TryGetProperty("token", out var tokenNode) ? tokenNode.GetString() ?? "" : "";
            var userJson = document.RootElement.TryGetProperty("user", out var userNode) ? userNode.GetString() ?? "" : "";
            ApplyUserPresentation(userJson);
            if (string.IsNullOrWhiteSpace(token))
            {
                _token = "";
                _preloadedToken = "";
                _audit = false;
                _allowedModules.Clear();
                ApplyScope(false);
                return;
            }
            if (token == _token && _pdksPeople.Count > 0)
            {
                await PreloadAuthorizedModulesAsync(false);
                return;
            }
            _token = token;
            var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
            _audit = profile.Audit || profile.Scope.Equals("AUDIT", StringComparison.OrdinalIgnoreCase) || profile.Role.Equals("DENETIM", StringComparison.OrdinalIgnoreCase);
            _pdksPeople = await _erp.GetPdksPeopleAsync(token, _lifetime.Token);
            ApplyScope(_audit);
            CurrentRoleText.Text = _audit
                ? "DENETİM • SGK/PDKS • Salt okunur"
                : string.IsNullOrWhiteSpace(profile.Role) ? "KY ERP kullanıcısı" : profile.Role;
            await PreloadAuthorizedModulesAsync(false);
        }
        catch { }
    }

    private async Task PreloadAuthorizedModulesAsync(bool force)
    {
        if (!_online || ErpWebView.CoreWebView2 is null || string.IsNullOrWhiteSpace(_token) || _syncInProgress) return;
        if (!force && string.Equals(_preloadedToken, _token, StringComparison.Ordinal)) return;

        var routes = BuildPreloadRoutes();
        if (routes.Count == 0) return;

        _syncInProgress = true;
        _preloadMode = true;
        try
        {
            FooterStatusText.Text = $"Tam Eşitle çalışıyor • {routes.Count} yetkili çalışma alanı okunuyor...";
            var routesJson = JsonSerializer.Serialize(routes);
            var script = $$"""
            (async () => {
              const routes = {{routesJson}};
              const rootId = 'kyerp-desktop-preload-root';
              document.getElementById(rootId)?.remove();
              const root = document.createElement('div');
              root.id = rootId;
              root.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10000px;top:-10000px';
              document.body.appendChild(root);
              for (const route of routes) {
                await new Promise((resolve) => {
                  const frame = document.createElement('iframe');
                  frame.style.cssText = 'width:1280px;height:800px;border:0';
                  let finished = false;
                  const done = () => {
                    if (finished) return;
                    finished = true;
                    try { frame.remove(); } catch {}
                    resolve(true);
                  };
                  frame.onload = () => setTimeout(done, 900);
                  root.appendChild(frame);
                  frame.src = new URL(route, location.origin).href;
                  setTimeout(done, 2600);
                });
              }
              root.remove();
              return routes.length;
            })()
            """;
            await ErpWebView.CoreWebView2.ExecuteScriptAsync(script);
            _preloadedToken = _token;
            var now = DateTimeOffset.Now.ToString("O");
            await _offlineStore.SetStateAsync("last_full_sync", now, _lifetime.Token);
            await _offlineStore.SetStateAsync("last_api_sync", now, _lifetime.Token);
            await RefreshOfflineAsync();
            FooterStatusText.Text = $"Tam Eşitle tamamlandı • {routes.Count} yetkili alanın GET verileri offline cache'e alındı.";
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            FooterStatusText.Text = $"Tam Eşitle tamamlanamadı: {error.Message}";
        }
        finally
        {
            _preloadMode = false;
            _syncInProgress = false;
        }
    }

    private List<string> BuildPreloadRoutes()
    {
        if (_audit)
            return new List<string> { "/ik/personel-kartlari", "/pdks/ana-ekran" };

        var routes = new List<string> { "/" };
        void Add(string permission, string route)
        {
            if (_allowedModules.Contains(permission) && !routes.Contains(route, StringComparer.OrdinalIgnoreCase)) routes.Add(route);
        }
        Add("MUHASEBE", "/muhasebe/yonetim-ozeti");
        Add("ISNET", "/isnet/yonetim-merkezi");
        Add("DESEN", "/desen/gelen-desenler");
        Add("BOYAHANE", "/boyahane/is-akisi");
        Add("IMALAT", "/uretim/uretim-merkezi");
        if (_allowedModules.Contains("IK"))
        {
            Add("IK", "/ik/ozet");
            Add("IK", "/pdks/ana-ekran");
        }
        Add("STORAGE_ADMIN", "/depolama/depolama-genel");
        Add("ASISTAN", "/asistan/sohbet");
        Add("ADMIN", "/admin/admin-yonetim-ozeti");
        return routes;
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
            ApplyPermissions(root, role);
        }
        catch { }
    }

    private void ApplyPermissions(JsonElement user, string role)
    {
        _allowedModules.Clear();
        if (new[] { "ADMIN", "SUPER_ADMIN" }.Contains(role.Trim().ToUpperInvariant()))
        {
            foreach (var key in new[] { "MUHASEBE", "ISNET", "DESEN", "BOYAHANE", "IMALAT", "IK", "STORAGE_ADMIN", "ADMIN", "ASISTAN" })
                _allowedModules.Add(key);
            SetAllModuleButtons(Visibility.Visible);
            return;
        }
        if (!user.TryGetProperty("permissions", out var rows) || rows.ValueKind != JsonValueKind.Array) return;
        foreach (var row in rows.EnumerateArray())
        {
            var module = FirstText(row, "moduleKey", "module_key");
            var canView = row.TryGetProperty("canView", out var view) && view.ValueKind == JsonValueKind.True;
            if (canView && !string.IsNullOrWhiteSpace(module)) _allowedModules.Add(module);
        }
        SetVisible(MuhasebeButton, _allowedModules.Contains("MUHASEBE"));
        SetVisible(IsnetButton, _allowedModules.Contains("ISNET"));
        SetVisible(DesenButton, _allowedModules.Contains("DESEN"));
        SetVisible(BoyahaneButton, _allowedModules.Contains("BOYAHANE"));
        SetVisible(ImalatButton, _allowedModules.Contains("IMALAT"));
        SetVisible(IkButton, _allowedModules.Contains("IK"));
        SetVisible(PdksButton, _allowedModules.Contains("IK"));
        SetVisible(NativePdksButton, _allowedModules.Contains("IK"));
        SetVisible(FileHubButton, _allowedModules.Contains("STORAGE_ADMIN"));
        SetVisible(AssistantButton, _allowedModules.Contains("ASISTAN"));
        SetVisible(AdminButton, _allowedModules.Contains("ADMIN"));
        FinanceGroup.Visibility = MuhasebeButton.Visibility == Visibility.Visible || IsnetButton.Visibility == Visibility.Visible ? Visibility.Visible : Visibility.Collapsed;
        ProductionGroup.Visibility = DesenButton.Visibility == Visibility.Visible || BoyahaneButton.Visibility == Visibility.Visible || ImalatButton.Visibility == Visibility.Visible ? Visibility.Visible : Visibility.Collapsed;
        PeopleGroup.Visibility = IkButton.Visibility == Visibility.Visible || PdksButton.Visibility == Visibility.Visible ? Visibility.Visible : Visibility.Collapsed;
        SystemGroup.Visibility = FileHubButton.Visibility == Visibility.Visible || AssistantButton.Visibility == Visibility.Visible || AdminButton.Visibility == Visibility.Visible ? Visibility.Visible : Visibility.Collapsed;
    }

    private void SetAllModuleButtons(Visibility visibility)
    {
        foreach (var button in new[] { MuhasebeButton, IsnetButton, DesenButton, BoyahaneButton, ImalatButton, IkButton, PdksButton, NativePdksButton, FileHubButton, AssistantButton, AdminButton })
            button.Visibility = visibility;
        FinanceGroup.Visibility = ProductionGroup.Visibility = PeopleGroup.Visibility = SystemGroup.Visibility = visibility;
    }

    private static void SetVisible(Button button, bool visible) => button.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;

    private void ApplyScope(bool audit)
    {
        if (!audit)
        {
            PageSubTitleText.Text = "Tüm KY ERP modülleri • Web + D1 + Depolama/File Hub + Offline çalışma kopyası";
            return;
        }
        _allowedModules.Clear();
        _allowedModules.Add("IK");
        FinanceGroup.Visibility = Visibility.Collapsed;
        ProductionGroup.Visibility = Visibility.Collapsed;
        SystemGroup.Visibility = Visibility.Collapsed;
        PeopleGroup.Visibility = Visibility.Visible;
        IkButton.Visibility = Visibility.Visible;
        PdksButton.Visibility = Visibility.Visible;
        NativePdksButton.Visibility = Visibility.Visible;
        PageSubTitleText.Text = "DENETİM • İK=SGK VAR • PDKS=SGK VAR+kart • salt okunur";
    }

    private async void ModuleButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string path || ErpWebView.CoreWebView2 is null) return;
        ShowOfflineCenter(false);
        ErpWebView.CoreWebView2.Navigate(new Uri(AppUri, path).ToString());
        UpdatePageTitle(path);
        await TryRefreshIdentityAsync();
    }

    private async void NativePdksButton_Click(object sender, RoutedEventArgs e)
    {
        await TryRefreshIdentityAsync();
        if (string.IsNullOrWhiteSpace(_token))
        {
            MessageBox.Show(this, "Önce KY ERP oturumunu açın. PDKS cihaz işlemleri aynı ERP oturumunu kullanır.", "KY ERP Masaüstü", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        try
        {
            if (_pdksPeople.Count == 0) _pdksPeople = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
            new PdksUnifiedWindow(_token, _pdksPeople, _pdksPaths, !_audit) { Owner = this }.ShowDialog();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "PDKS", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        var button = sender as Button;
        if (button is not null)
        {
            button.IsEnabled = false;
            button.Content = "Eşitleniyor...";
        }
        try
        {
            await CheckConnectionAsync();
            if (_online && ErpWebView.CoreWebView2 is not null)
            {
                await TryRefreshIdentityAsync();
                await PreloadAuthorizedModulesAsync(true);
                ErpWebView.CoreWebView2.Reload();
            }
            await RefreshOfflineAsync();
        }
        finally
        {
            if (button is not null)
            {
                button.Content = "Tam Eşitle";
                button.IsEnabled = true;
            }
        }
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
        var payload = JsonSerializer.Serialize(new { text, createdAt = DateTimeOffset.Now, requiresReview = true, source = "KY_ERP_DESKTOP_OFFLINE" });
        await _offlineStore.EnqueueAsync("", module, "DRAFT", "offline://review", payload, ct: _lifetime.Token);
        OfflineDraftText.Clear();
        await RefreshOfflineAsync();
        FooterStatusText.Text = "Offline taslak kaydedildi. Bağlantı geldiğinde kontrol edilmeden işletme verisine yazılmaz.";
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
            var lastSync = await _offlineStore.GetStateAsync("last_full_sync", _lifetime.Token)
                ?? await _offlineStore.GetStateAsync("last_api_sync", _lifetime.Token);
            LastSyncText.Text = DateTimeOffset.TryParse(lastSync, out var parsed) ? parsed.LocalDateTime.ToString("dd.MM HH:mm") : "Henüz yok";
            OfflineAgentText.Text = Process.GetProcessesByName("KYERP.PDKS.Agent").Length > 0 ? "Çalışıyor" : "Servis kontrolü";
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error) { FooterStatusText.Text = error.Message; }
    }

    private void ShowOfflineCenter(bool visible)
    {
        _offlineCenterVisible = visible;
        OfflineCenter.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        ErpWebView.Visibility = visible ? Visibility.Collapsed : Visibility.Visible;
        if (visible)
        {
            PageTitleText.Text = "Offline Çalışma Merkezi";
            PageSubTitleText.Text = "Tüm ERP için kesinti katmanı • cache • güvenli taslak • PDKS cihaz agentı";
        }
    }

    private void UpdatePageTitle(string path)
    {
        if (_offlineCenterVisible) return;
        PageTitleText.Text = path switch
        {
            var p when p.StartsWith("/muhasebe", StringComparison.OrdinalIgnoreCase) => "Muhasebe",
            var p when p.StartsWith("/isnet", StringComparison.OrdinalIgnoreCase) => "İşNet / e-Belge",
            var p when p.StartsWith("/desen", StringComparison.OrdinalIgnoreCase) => "Desen / Kalıp",
            var p when p.StartsWith("/boyahane", StringComparison.OrdinalIgnoreCase) => "Boyahane / Numune / Stok",
            var p when p.StartsWith("/uretim", StringComparison.OrdinalIgnoreCase) => "İmalat",
            var p when p.StartsWith("/ik", StringComparison.OrdinalIgnoreCase) => "İK / Personel",
            var p when p.StartsWith("/pdks", StringComparison.OrdinalIgnoreCase) => "İK / PDKS",
            var p when p.StartsWith("/depolama", StringComparison.OrdinalIgnoreCase) => "Depolama / Dosya Merkezi",
            var p when p.StartsWith("/asistan", StringComparison.OrdinalIgnoreCase) => "KY ERP Asistan",
            var p when p.StartsWith("/admin", StringComparison.OrdinalIgnoreCase) => "Yönetim",
            _ => "KY ERP Çalışma Merkezi",
        };
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
        if (lower.Contains("file-hub") || lower.Contains("storage")) return "DEPOLAMA";
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
