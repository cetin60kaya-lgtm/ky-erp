using System.ComponentModel;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using KyPdks.Shared;
using Microsoft.Web.WebView2.Core;

namespace KyPdks.Desktop;

public partial class KyErpDesktopWindow : Window
{
    private static readonly Uri AppUri = new("https://app.kyerp.net/");

    private readonly PdksPaths _pdksPaths = new();
    private readonly ErpApiClient _erp = new();
    private readonly CancellationTokenSource _lifetime = new();
    private IReadOnlyList<CachedPerson> _pdksPeople = Array.Empty<CachedPerson>();
    private bool _bundledFrontend;

    public KyErpDesktopWindow()
    {
        InitializeComponent();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            StartupText.Text = "KY ERP arayüzü hazırlanıyor...";
            await InitializeWebViewAsync();
        }
        catch (Exception error)
        {
            StartupText.Text = $"KY ERP açılamadı: {error.Message}";
        }
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _lifetime.Cancel();
        _erp.Dispose();
    }

    private async Task InitializeWebViewAsync()
    {
        var webData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "KY ERP",
            "Desktop",
            "WebView2");
        Directory.CreateDirectory(webData);

        var environment = await CoreWebView2Environment.CreateAsync(null, webData);
        await ErpWebView.EnsureCoreWebView2Async(environment);

        var core = ErpWebView.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = true;
        core.NavigationCompleted += CoreWebView2_NavigationCompleted;
        core.NavigationStarting += CoreWebView2_NavigationStarting;
        core.WebMessageReceived += CoreWebView2_WebMessageReceived;

        var bundledRoot = Path.Combine(AppContext.BaseDirectory, "web");
        var bundledIndex = Path.Combine(bundledRoot, "index.html");
        if (File.Exists(bundledIndex))
        {
            core.SetVirtualHostNameToFolderMapping(
                AppUri.Host,
                bundledRoot,
                CoreWebView2HostResourceAccessKind.Allow);
            _bundledFrontend = true;
            StartupText.Text = "KY ERP Desktop açılıyor...";
        }
        else
        {
            _bundledFrontend = false;
            StartupText.Text = "Canlı KY ERP açılıyor...";
        }

        ErpWebView.Source = AppUri;
    }

    private async void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess)
        {
            StartupOverlay.Visibility = Visibility.Visible;
            StartupText.Text = _bundledFrontend
                ? "KY ERP arayüzü açıldı ancak sayfa yüklemesi tamamlanamadı. Yenilemek için F5'e basın."
                : "KY ERP açılamadı. İnternet bağlantısını kontrol edin ve F5'e basın.";
            return;
        }

        await InstallDesktopBridgeAsync();
        StartupOverlay.Visibility = Visibility.Collapsed;
    }

    private async Task InstallDesktopBridgeAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;

        const string script = """
        (() => {
          document.documentElement.dataset.kyerpDesktopHost = '1';
          document.documentElement.dataset.kyerpDesktopVersion = '1.7.0';
          window.KYERP_DESKTOP = Object.freeze({
            version: '1.7.0',
            isDesktop: true,
            openPdksDevice: () => window.chrome?.webview?.postMessage(JSON.stringify({ type: 'pdks.open-device' }))
          });
          return true;
        })()
        """;

        try
        {
            await ErpWebView.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch
        {
            // The ERP remains usable even if the optional native bridge cannot be injected.
        }
    }

    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(raw)) return;

            using var doc = JsonDocument.Parse(raw);
            var type = doc.RootElement.TryGetProperty("type", out var node) ? node.GetString() : null;
            if (string.Equals(type, "pdks.open-device", StringComparison.OrdinalIgnoreCase))
                await OpenNativePdksAsync();
        }
        catch
        {
            // Ignore malformed/unknown web messages. No native action is taken.
        }
    }

    private async void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!e.Uri.StartsWith("kyerp://", StringComparison.OrdinalIgnoreCase)) return;

        e.Cancel = true;
        if (e.Uri.StartsWith("kyerp://pdks-device", StringComparison.OrdinalIgnoreCase))
            await OpenNativePdksAsync();
    }

    private async Task OpenNativePdksAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;

        var token = await ReadTokenAsync();
        if (string.IsNullOrWhiteSpace(token))
        {
            MessageBox.Show(
                this,
                "Önce KY ERP oturumunu açın. Kart cihazı aynı ERP oturumunu kullanır.",
                "KY ERP Desktop",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        try
        {
            var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
            var audit = profile.Audit
                || profile.Scope.Equals("AUDIT", StringComparison.OrdinalIgnoreCase)
                || profile.Role.Equals("DENETIM", StringComparison.OrdinalIgnoreCase);

            if (_pdksPeople.Count == 0)
                _pdksPeople = await _erp.GetPdksPeopleAsync(token, _lifetime.Token);

            new PdksUnifiedWindow(token, _pdksPeople, _pdksPaths, !audit)
            {
                Owner = this
            }.ShowDialog();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "KY ERP PDKS", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async Task<string> ReadTokenAsync()
    {
        try
        {
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync(
                "localStorage.getItem('kyerp_auth_token') || ''");
            return JsonSerializer.Deserialize<string>(result) ?? "";
        }
        catch
        {
            return "";
        }
    }

    private async void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F5 || (e.Key == Key.R && Keyboard.Modifiers.HasFlag(ModifierKeys.Control)))
        {
            ErpWebView.CoreWebView2?.Reload();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.Left && Keyboard.Modifiers.HasFlag(ModifierKeys.Alt))
        {
            if (ErpWebView.CoreWebView2?.CanGoBack == true)
                ErpWebView.CoreWebView2.GoBack();
            e.Handled = true;
            return;
        }

        if (e.Key == Key.P
            && Keyboard.Modifiers.HasFlag(ModifierKeys.Control)
            && Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
        {
            await OpenNativePdksAsync();
            e.Handled = true;
        }
    }
}