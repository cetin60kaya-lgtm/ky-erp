using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Input;
using KyPdks.Shared;
using Microsoft.Web.WebView2.Core;

namespace KyPdks.Desktop;

public partial class KyErpDesktopWindow : Window
{
    private static readonly Uri AppUri = new("https://app.kyerp.net/");
    private static readonly Uri BundledAppUri = new("http://localhost/index.html");
    private const string BundledHost = "localhost";
    private const string FileHubTaskName = "KY ERP File Hub Agent";

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
            core.SetVirtualHostNameToFolderMapping(BundledHost, bundledRoot, CoreWebView2HostResourceAccessKind.DenyCors);
            _bundledFrontend = true;
            StartupText.Text = "KY ERP Desktop açılıyor...";
        }
        else
        {
            _bundledFrontend = false;
            StartupText.Text = "Canlı KY ERP açılıyor...";
        }

        ErpWebView.Source = _bundledFrontend ? BundledAppUri : AppUri;
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
          document.documentElement.dataset.kyerpDesktopVersion = '1.7.2';
          const post = payload => window.chrome?.webview?.postMessage(JSON.stringify(payload));
          window.KYERP_DESKTOP = Object.freeze({
            version: '1.7.2',
            isDesktop: true,
            openPdksDevice: () => post({ type: 'pdks.open-device' }),
            configureFileAgent: (secret, mainCompanySlug) => post({
              type: 'file-hub.configure-agent',
              secret: String(secret || ''),
              mainCompanySlug: String(mainCompanySlug || '')
            })
          });
          if (!window.__kyerpDesktopFetchBridgeInstalled) {
            window.__kyerpDesktopFetchBridgeInstalled = true;
            const originalFetch = window.fetch.bind(window);
            window.fetch = async (...args) => {
              const response = await originalFetch(...args);
              try {
                const input = args[0];
                const url = typeof input === 'string' ? input : String(input?.url || '');
                if (response.ok && url.includes('/file-hub/agent-credential/rotate')) {
                  response.clone().json().then(payload => {
                    const data = payload?.data || payload || {};
                    if (data.secret) {
                      post({
                        type: 'file-hub.configure-agent',
                        secret: String(data.secret),
                        mainCompanySlug: String(data.mainCompanySlug || '')
                      });
                    }
                  }).catch(() => {});
                }
              } catch {}
              return response;
            };
          }
          return true;
        })()
        """;

        try { await ErpWebView.CoreWebView2.ExecuteScriptAsync(script); }
        catch { }
    }

    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!IsTrustedAppSource(e.Source)) return;
        try
        {
            var raw = e.TryGetWebMessageAsString();
            if (string.IsNullOrWhiteSpace(raw)) return;
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var node) ? node.GetString() : null;
            if (string.Equals(type, "pdks.open-device", StringComparison.OrdinalIgnoreCase))
            {
                await OpenNativePdksAsync();
                return;
            }
            if (string.Equals(type, "file-hub.configure-agent", StringComparison.OrdinalIgnoreCase))
            {
                var secret = root.TryGetProperty("secret", out var secretNode) ? secretNode.GetString() ?? "" : "";
                var slug = root.TryGetProperty("mainCompanySlug", out var slugNode) ? slugNode.GetString() ?? "" : "";
                await ConfigureFileHubAgentAsync(secret, slug);
            }
        }
        catch { }
    }

    private static bool IsTrustedAppSource(string? source)
    {
        if (!Uri.TryCreate(source, UriKind.Absolute, out var uri)) return false;
        var liveApp = uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)
            && uri.Host.Equals(AppUri.Host, StringComparison.OrdinalIgnoreCase);
        var bundledApp = uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
            && uri.Host.Equals(BundledHost, StringComparison.OrdinalIgnoreCase);
        return liveApp || bundledApp;
    }

    private async void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!e.Uri.StartsWith("kyerp://", StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        if (e.Uri.StartsWith("kyerp://pdks-device", StringComparison.OrdinalIgnoreCase))
            await OpenNativePdksAsync();
    }

    private async Task ConfigureFileHubAgentAsync(string secret, string mainCompanySlug)
    {
        secret = secret.Trim();
        mainCompanySlug = mainCompanySlug.Trim().ToLowerInvariant();
        if (secret.Length < 24) return;
        if (!Regex.IsMatch(mainCompanySlug, "^[a-z0-9][a-z0-9._-]{1,100}$", RegexOptions.IgnoreCase)) return;

        Environment.SetEnvironmentVariable("KYERP_AGENT_KEY", secret);
        Environment.SetEnvironmentVariable("KYERP_API_URL", "https://api.kyerp.net");
        Environment.SetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", mainCompanySlug);
        Environment.SetEnvironmentVariable("KYERP_AGENT_KEY", secret, EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("KYERP_API_URL", "https://api.kyerp.net", EnvironmentVariableTarget.User);
        Environment.SetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", mainCompanySlug, EnvironmentVariableTarget.User);

        await Task.Run(() =>
        {
            var taskReady = RunHidden("schtasks.exe", $"/Query /TN \"{FileHubTaskName}\"") == 0;
            if (!taskReady)
            {
                var installScript = Path.Combine(AppContext.BaseDirectory, "FileAgent", "install-file-hub-agent.ps1");
                if (File.Exists(installScript))
                    RunHidden("powershell.exe", $"-NoProfile -ExecutionPolicy Bypass -File \"{installScript}\" -TaskName \"{FileHubTaskName}\"");
            }
            RunHidden("schtasks.exe", $"/End /TN \"{FileHubTaskName}\"");
            RunHidden("schtasks.exe", $"/Run /TN \"{FileHubTaskName}\"");
        });
    }

    private static int RunHidden(string fileName, string arguments)
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo(fileName, arguments)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            });
            if (process is null) return -1;
            process.WaitForExit(15_000);
            return process.HasExited ? process.ExitCode : -1;
        }
        catch { return -1; }
    }

    private async Task OpenNativePdksAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        var token = await ReadTokenAsync();
        if (string.IsNullOrWhiteSpace(token))
        {
            MessageBox.Show(this, "Önce KY ERP oturumunu açın. Kart cihazı aynı ERP oturumunu kullanır.", "KY ERP Desktop", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        try
        {
            var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
            var audit = profile.Audit
                || string.Equals(profile.Scope, "AUDIT", StringComparison.OrdinalIgnoreCase)
                || string.Equals(profile.Role, "DENETIM", StringComparison.OrdinalIgnoreCase);
            if (_pdksPeople.Count == 0)
                _pdksPeople = await _erp.GetPdksPeopleAsync(token, _lifetime.Token);
            new PdksUnifiedWindow(token, _pdksPeople, _pdksPaths, !audit) { Owner = this }.ShowDialog();
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
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync("localStorage.getItem('kyerp_auth_token') || ''");
            return JsonSerializer.Deserialize<string>(result) ?? "";
        }
        catch { return ""; }
    }

    private async void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F5 || (e.Key == Key.R && Keyboard.Modifiers.HasFlag(ModifierKeys.Control)))
        {
            if (_bundledFrontend)
                ErpWebView.Source = BundledAppUri;
            else
                ErpWebView.CoreWebView2?.Reload();
            e.Handled = true;
            return;
        }
        if (e.Key == Key.Left && Keyboard.Modifiers.HasFlag(ModifierKeys.Alt))
        {
            if (ErpWebView.CoreWebView2?.CanGoBack == true) ErpWebView.CoreWebView2.GoBack();
            e.Handled = true;
            return;
        }
        if (e.Key == Key.P && Keyboard.Modifiers.HasFlag(ModifierKeys.Control) && Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
        {
            await OpenNativePdksAsync();
            e.Handled = true;
        }
    }
}
