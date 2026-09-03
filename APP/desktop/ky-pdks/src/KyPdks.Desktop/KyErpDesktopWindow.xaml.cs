using System.ComponentModel;
using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using KyPdks.Shared;
using Microsoft.Web.WebView2.Core;

namespace KyPdks.Desktop;

public partial class KyErpDesktopWindow : Window
{
    private static readonly Uri AppUri = new("https://app.kyerp.net/");
    private static readonly Uri HealthUri = new("https://api.kyerp.net/api/health");

    private readonly PdksPaths _pdksPaths = new();
    private readonly ErpApiClient _erp = new();
    private readonly HttpClient _probe = new() { Timeout = TimeSpan.FromSeconds(4) };
    private readonly CancellationTokenSource _lifetime = new();
    private readonly DispatcherTimer _connectionTimer = new() { Interval = TimeSpan.FromSeconds(12) };
    private readonly DispatcherTimer _identityTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private readonly DispatcherTimer _clockTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly HashSet<string> _allowedModules = new(StringComparer.OrdinalIgnoreCase);

    private IReadOnlyList<CachedPerson> _pdksPeople = Array.Empty<CachedPerson>();
    private string _token = "";
    private bool _audit;
    private bool _online;
    private bool _bundledFrontend;
    private string _currentRoute = "/";

    public KyErpDesktopWindow()
    {
        InitializeComponent();
        _connectionTimer.Tick += async (_, _) => await CheckConnectionAsync();
        _identityTimer.Tick += async (_, _) => await TryRefreshIdentityAsync();
        _clockTimer.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("dd.MM.yyyy  HH:mm:ss");
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            StartupText.Text = "KY ERP Desktop arayüzü hazırlanıyor...";
            await InitializeWebViewAsync();
            await CheckConnectionAsync();
            _connectionTimer.Start();
            _identityTimer.Start();
            _clockTimer.Start();
            ClockText.Text = DateTime.Now.ToString("dd.MM.yyyy  HH:mm:ss");
            FooterStatusText.Text = "KY ERP Desktop hazır • canlı veri + masaüstü arayüz + Windows PDKS cihaz katmanı";
        }
        catch (Exception error)
        {
            StartupText.Text = $"Başlatma tamamlanamadı: {error.Message}";
            FooterStatusText.Text = error.Message;
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _connectionTimer.Stop();
        _identityTimer.Stop();
        _clockTimer.Stop();
        _lifetime.Cancel();
        _erp.Dispose();
        _probe.Dispose();
    }

    private async Task InitializeWebViewAsync()
    {
        var webData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KY ERP", "Desktop", "WebView2");
        Directory.CreateDirectory(webData);
        var environment = await CoreWebView2Environment.CreateAsync(null, webData);
        await ErpWebView.EnsureCoreWebView2Async(environment);

        var core = ErpWebView.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = true;
        core.NavigationCompleted += CoreWebView2_NavigationCompleted;

        var bundledRoot = Path.Combine(AppContext.BaseDirectory, "web");
        var bundledIndex = Path.Combine(bundledRoot, "index.html");
        if (File.Exists(bundledIndex))
        {
            core.SetVirtualHostNameToFolderMapping(AppUri.Host, bundledRoot, CoreWebView2HostResourceAccessKind.Allow);
            _bundledFrontend = true;
            FrontendModeText.Text = "Arayüz: Desktop paketli • Veri: canlı";
            StartupText.Text = "Paketlenmiş Desktop arayüzü açılıyor; veriler canlı KY ERP API'den alınacak...";
        }
        else
        {
            _bundledFrontend = false;
            FrontendModeText.Text = "Arayüz: canlı app.kyerp.net";
            StartupText.Text = "Canlı KY ERP arayüzü açılıyor...";
        }

        ErpWebView.Source = AppUri;
    }

    private async void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            StartupOverlay.Visibility = Visibility.Visible;
            StartupText.Text = "ERP arayüzü açılamadı. İnternet ve WebView2 bağlantısını kontrol edin.";
            FooterStatusText.Text = $"WebView2 gezinme hatası: {e.WebErrorStatus}";
            return;
        }

        StartupOverlay.Visibility = Visibility.Collapsed;
        await ApplyEmbeddedWebModeAsync();
        await TryRefreshIdentityAsync();
        UpdatePageTitle(ErpWebView.Source?.PathAndQuery ?? _currentRoute);
    }

    private async Task ApplyEmbeddedWebModeAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        const string script = """
        (() => {
          const id = 'kyerp-desktop-v16-style';
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
          document.documentElement.dataset.kyerpDesktopVersion = '1.6';
          return true;
        })()
        """;
        try { await ErpWebView.CoreWebView2.ExecuteScriptAsync(script); } catch { }
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

        _online = next;
        ConnectionDot.Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString(_online ? "#35C18A" : "#E05E69"));
        ConnectionText.Text = _online ? "Cloud bağlı • canlı veri" : "Cloud bağlantısı yok";
        FooterStatusText.Text = _online
            ? (_bundledFrontend ? "Desktop arayüzü aktif • api.kyerp.net canlı bağlı" : "Canlı KY ERP bağlı")
            : "Cloud erişimi yok • PDKS yerel servis ve cihaz katmanı Windows tarafında çalışmaya devam eder";
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
                _audit = false;
                _pdksPeople = Array.Empty<CachedPerson>();
                return;
            }

            if (string.Equals(token, _token, StringComparison.Ordinal)) return;
            _token = token;

            try
            {
                var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
                _audit = profile.Audit || profile.Scope.Equals("AUDIT", StringComparison.OrdinalIgnoreCase) || profile.Role.Equals("DENETIM", StringComparison.OrdinalIgnoreCase);
                CurrentRoleText.Text = _audit ? "DENETİM • salt okunur" : (string.IsNullOrWhiteSpace(profile.Role) ? CurrentRoleText.Text : profile.Role);
                if (_audit) ApplyAuditScope();
            }
            catch
            {
                _audit = false;
            }
        }
        catch { }
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
            var name = FirstText(root, "fullName", "name", "username", "email");
            CurrentUserText.Text = string.IsNullOrWhiteSpace(name) ? "KY ERP kullanıcısı" : name;
            var role = FirstText(root, "role");
            if (!string.IsNullOrWhiteSpace(role)) CurrentRoleText.Text = role;
            ApplyPermissions(root, role);
        }
        catch { }
    }

    private void ApplyPermissions(JsonElement user, string role)
    {
        _allowedModules.Clear();
        var normalizedRole = role.Trim().ToUpperInvariant();
        if (normalizedRole is "ADMIN" or "SUPER_ADMIN" or "OWNER")
        {
            foreach (var key in new[] { "MUHASEBE", "ISNET", "DESEN", "BOYAHANE", "IMALAT", "IK", "STORAGE_ADMIN", "ADMIN", "ASISTAN" })
                _allowedModules.Add(key);
            SetGroups(true, true, true, true, true, true);
            return;
        }

        if (user.TryGetProperty("permissions", out var rows) && rows.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in rows.EnumerateArray())
            {
                var module = FirstText(row, "moduleKey", "module_key");
                var canView = (row.TryGetProperty("canView", out var view) && view.ValueKind == JsonValueKind.True)
                    || (row.TryGetProperty("can_view", out var legacyView) && legacyView.ValueKind == JsonValueKind.True);
                if (canView && !string.IsNullOrWhiteSpace(module)) _allowedModules.Add(module);
            }
        }

        if (_allowedModules.Count == 0) return;
        SetGroups(
            _allowedModules.Contains("MUHASEBE") || _allowedModules.Contains("ISNET"),
            _allowedModules.Contains("DESEN") || _allowedModules.Contains("BOYAHANE") || _allowedModules.Contains("IMALAT"),
            _allowedModules.Contains("IK"),
            _allowedModules.Contains("STORAGE_ADMIN"),
            _allowedModules.Contains("ASISTAN"),
            _allowedModules.Contains("ADMIN"));
    }

    private void SetGroups(bool finance, bool production, bool people, bool fileHub, bool assistant, bool admin)
    {
        FinanceGroup.Visibility = finance ? Visibility.Visible : Visibility.Collapsed;
        ProductionGroup.Visibility = production ? Visibility.Visible : Visibility.Collapsed;
        PeopleGroup.Visibility = people ? Visibility.Visible : Visibility.Collapsed;
        FileHubGroup.Visibility = fileHub ? Visibility.Visible : Visibility.Collapsed;
        AssistantGroup.Visibility = assistant ? Visibility.Visible : Visibility.Collapsed;
        AdminGroup.Visibility = admin ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ApplyAuditScope()
    {
        SetGroups(false, false, true, false, false, false);
        CurrentRoleText.Text = "DENETİM • İK / PDKS • salt okunur";
        PageSubTitleText.Text = "Denetim kapsamı • İK / PDKS verileri • yazma işlemleri kapalı";
    }

    private async void ModuleButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button button || button.Tag is not string path) return;
        await NavigateToRouteAsync(path);
    }

    private async Task NavigateToRouteAsync(string path)
    {
        if (ErpWebView.CoreWebView2 is null) return;
        _currentRoute = path;
        UpdatePageTitle(path);

        try
        {
            if (_bundledFrontend)
            {
                var routeJson = JsonSerializer.Serialize(path);
                var script = $"history.pushState({{}}, '', {routeJson}); window.dispatchEvent(new PopStateEvent('popstate')); window.dispatchEvent(new Event('kyerp-route-change'));";
                await ErpWebView.CoreWebView2.ExecuteScriptAsync(script);
                await ApplyEmbeddedWebModeAsync();
            }
            else
            {
                ErpWebView.CoreWebView2.Navigate(new Uri(AppUri, path).ToString());
            }
        }
        catch (Exception error)
        {
            FooterStatusText.Text = $"Sayfa açılamadı: {error.Message}";
        }
    }

    private async void NativePdksButton_Click(object sender, RoutedEventArgs e)
    {
        await TryRefreshIdentityAsync();
        if (string.IsNullOrWhiteSpace(_token))
        {
            MessageBox.Show(this, "Önce KY ERP oturumunu açın. Kart cihazı işlemleri aynı ERP oturumunu kullanır.", "KY ERP Desktop", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            if (_pdksPeople.Count == 0)
                _pdksPeople = await _erp.GetPdksPeopleAsync(_token, _lifetime.Token);
            new PdksUnifiedWindow(_token, _pdksPeople, _pdksPaths, !_audit) { Owner = this }.ShowDialog();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "KY ERP PDKS", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await CheckConnectionAsync();
        if (ErpWebView.CoreWebView2 is null) return;
        if (_bundledFrontend)
        {
            ErpWebView.CoreWebView2.Reload();
            if (_currentRoute != "/")
            {
                await Task.Delay(350);
                await NavigateToRouteAsync(_currentRoute);
            }
        }
        else
        {
            ErpWebView.CoreWebView2.Reload();
        }
    }

    private async void BackButton_Click(object sender, RoutedEventArgs e)
    {
        if (ErpWebView.CoreWebView2 is null) return;
        if (_bundledFrontend)
        {
            try { await ErpWebView.CoreWebView2.ExecuteScriptAsync("history.back();"); } catch { }
        }
        else if (ErpWebView.CoreWebView2.CanGoBack)
        {
            ErpWebView.CoreWebView2.GoBack();
        }
    }

    private void OpenLiveButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo(AppUri.ToString()) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            FooterStatusText.Text = error.Message;
        }
    }

    private void UpdatePageTitle(string path)
    {
        var clean = path.Split('#')[0].Split('?')[0];
        PageTitleText.Text = clean switch
        {
            var p when p.StartsWith("/muhasebe", StringComparison.OrdinalIgnoreCase) => "Muhasebe",
            var p when p.StartsWith("/isnet", StringComparison.OrdinalIgnoreCase) => "İşNet / e-Belge",
            var p when p.StartsWith("/desen", StringComparison.OrdinalIgnoreCase) => "Desen / Kalıp",
            var p when p.StartsWith("/boyahane", StringComparison.OrdinalIgnoreCase) => "Boyahane / Numune / Stok",
            var p when p.StartsWith("/uretim", StringComparison.OrdinalIgnoreCase) => "İmalat / Üretim",
            var p when p.StartsWith("/ik", StringComparison.OrdinalIgnoreCase) => "İK / Personel",
            var p when p.StartsWith("/pdks", StringComparison.OrdinalIgnoreCase) => "PDKS",
            var p when p.StartsWith("/depolama", StringComparison.OrdinalIgnoreCase) => "Depolama / File Hub",
            var p when p.StartsWith("/asistan", StringComparison.OrdinalIgnoreCase) => "KY ERP AI Asistan",
            var p when p.StartsWith("/admin", StringComparison.OrdinalIgnoreCase) => "Yönetim",
            _ => "KY ERP Çalışma Merkezi"
        };

        PageSubTitleText.Text = clean.StartsWith("/depolama", StringComparison.OrdinalIgnoreCase)
            ? "Google Drive • OneDrive • Yerel Klasör • NAS • SharePoint • KY File Agent"
            : clean.StartsWith("/ik", StringComparison.OrdinalIgnoreCase) || clean.StartsWith("/pdks", StringComparison.OrdinalIgnoreCase)
                ? "Personel kartı • günlük giriş/çıkış • aylık puantaj • vardiya • kart cihazı"
                : clean.StartsWith("/asistan", StringComparison.OrdinalIgnoreCase)
                    ? "Canlı ERP verileri + File Hub bağlamı + yetki kontrollü asistan"
                    : "Desktop-first arayüz • canlı API • ortak KY ERP oturumu";
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