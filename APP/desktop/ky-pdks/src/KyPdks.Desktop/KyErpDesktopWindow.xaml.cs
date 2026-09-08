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
    private static readonly Uri BundledAppUri = new("https://app.kyerp.net/index.html");
    private const string FileHubTaskName = "KY ERP File Hub Agent";
    private const string DesktopVersion = "1.9.0";
#if PDKS_ONLY
    private const string ProductCode = "PDKS";
    private const string ProductName = "KY PDKS Pro";
#else
    private const string ProductCode = "ERP";
    private const string ProductName = "KY ERP Desktop";
#endif

    private readonly PdksPaths _pdksPaths = new();
    private readonly ErpApiClient _erp = new();
    private readonly CancellationTokenSource _lifetime = new();
    private IReadOnlyList<CachedPerson> _pdksPeople = Array.Empty<CachedPerson>();
    private bool _bundledFrontend;
    private bool _pdksEnrollmentWatchStarted;
    private bool _pdksFirstRunWizardShown;

    public KyErpDesktopWindow()
    {
        InitializeComponent();
        Title = ProductName;
        StartupTitle.Text = ProductName;
        StartupSubtitle.Text = ProductCode == "PDKS"
            ? "Canlı PDKS • Windows Agent • terminal köprüsü • aynı KY ERP verisi"
            : "Aynı KY ERP arayüzü • aynı canlı veri • Windows entegrasyonu";
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            StartupText.Text = ProductCode == "PDKS" ? "KY PDKS Pro hazırlanıyor..." : "KY ERP arayüzü hazırlanıyor...";
            await InitializeWebViewAsync();
        }
        catch (Exception error)
        {
            StartupText.Text = $"{ProductName} açılamadı: {error.Message}";
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
            ProductCode,
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
        await core.AddScriptToExecuteOnDocumentCreatedAsync(GetDesktopBridgeScript());

        var bundledRoot = Path.Combine(AppContext.BaseDirectory, "web");
        var bundledIndex = Path.Combine(bundledRoot, "index.html");
        if (File.Exists(bundledIndex))
        {
            core.SetVirtualHostNameToFolderMapping(AppUri.Host, bundledRoot, CoreWebView2HostResourceAccessKind.Allow);
            _bundledFrontend = true;
            StartupText.Text = ProductCode == "PDKS" ? "KY PDKS Pro açılıyor..." : "KY ERP Desktop açılıyor...";
        }
        else
        {
            _bundledFrontend = false;
            StartupText.Text = ProductCode == "PDKS" ? "Canlı KY PDKS açılıyor..." : "Canlı KY ERP açılıyor...";
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
        if (ProductCode == "PDKS" && !_pdksEnrollmentWatchStarted)
        {
            _pdksEnrollmentWatchStarted = true;
            _ = WatchPdksAgentEnrollmentAsync();
        }
    }

    private string GetDesktopBridgeScript()
    {
        var firstRun = ProductCode == "PDKS" && !File.Exists(_pdksPaths.SetupCompletedFile);
        const string template = """
        (() => {
          window.__KYERP_DESKTOP_PRODUCT = '__PRODUCT__';
          document.documentElement.dataset.kyerpDesktopHost = '1';
          document.documentElement.dataset.kyerpDesktopVersion = '__VERSION__';
          document.documentElement.dataset.kyerpDesktopProduct = '__PRODUCT__';
          const post = payload => window.chrome?.webview?.postMessage(JSON.stringify(payload));
          window.KYERP_DESKTOP = Object.freeze({
            version: '__VERSION__',
            product: '__PRODUCT__',
            isDesktop: true,
            isPdks: '__PRODUCT__' === 'PDKS',
            firstRun: __FIRST_RUN__,
            openPdksDevice: () => post({ type: 'pdks.open-device' }),
            openPdksTerminalSettings: () => post({ type: 'pdks.open-terminal-settings' }),
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
        return template
            .Replace("__PRODUCT__", ProductCode, StringComparison.Ordinal)
            .Replace("__VERSION__", DesktopVersion, StringComparison.Ordinal)
            .Replace("__FIRST_RUN__", firstRun ? "true" : "false", StringComparison.Ordinal);
    }

    private async Task InstallDesktopBridgeAsync()
    {
        if (ErpWebView.CoreWebView2 is null) return;
        try { await ErpWebView.CoreWebView2.ExecuteScriptAsync(GetDesktopBridgeScript()); }
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
            if (string.Equals(type, "pdks.open-device", StringComparison.OrdinalIgnoreCase)
                || string.Equals(type, "pdks.open-terminal-settings", StringComparison.OrdinalIgnoreCase))
            {
                await OpenPdksTerminalSettingsAsync();
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
        return uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)
            && uri.Host.Equals(AppUri.Host, StringComparison.OrdinalIgnoreCase);
    }

    private async void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!e.Uri.StartsWith("kyerp://", StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        if (e.Uri.StartsWith("kyerp://pdks-device", StringComparison.OrdinalIgnoreCase))
            await OpenPdksTerminalSettingsAsync();
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

    private async Task OpenPdksTerminalSettingsAsync()
    {
        if (ProductCode != "PDKS")
        {
            MessageBox.Show(this, "Yerel terminal ve Agent yönetimi KY PDKS Pro ürününe aittir.", ProductName, MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (ErpWebView.CoreWebView2 is null) return;
        var token = await ReadTokenAsync();
        if (string.IsNullOrWhiteSpace(token))
        {
            MessageBox.Show(this, "Önce KY ERP hesabınızla giriş yapın. Terminal ayarları aynı yetki bağlamını kullanır.", ProductName, MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        try
        {
            var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
            var audit = profile.Audit
                || string.Equals(profile.Scope, "AUDIT", StringComparison.OrdinalIgnoreCase)
                || string.Equals(profile.Role, "DENETIM", StringComparison.OrdinalIgnoreCase);
            var window = new PdksTerminalSetupWindow(_pdksPaths, !audit) { Owner = this };
            window.ShowDialog();
            await InstallDesktopBridgeAsync();
            if (!audit)
            {
                try { await EnsurePdksAgentEnrollmentAsync(token, _lifetime.Token); }
                catch (Exception enrollmentError)
                {
                    var store = new LocalPdksStore(_pdksPaths);
                    await store.TouchStateAsync("d1_sync", $"D1 cihaz yetkilendirmesi bekliyor · {enrollmentError.Message}", _lifetime.Token);
                }
            }
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "KY PDKS Terminal Ayarları", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async Task<string> ReadTokenAsync()
    {
        try
        {
            if (ErpWebView.CoreWebView2 is null) return "";
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync(
                "sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token') || ''");
            return JsonSerializer.Deserialize<string>(result) ?? "";
        }
        catch { return ""; }
    }

    private async Task<string> ReadActiveCompanySlugAsync()
    {
        try
        {
            if (ErpWebView.CoreWebView2 is null) return "";
            var result = await ErpWebView.CoreWebView2.ExecuteScriptAsync(
                "String(localStorage.getItem('kyerp.activeCompany') || localStorage.getItem('companySlug') || '').trim().toLowerCase()");
            return (JsonSerializer.Deserialize<string>(result) ?? "").Trim().ToLowerInvariant();
        }
        catch { return ""; }
    }

    private async Task WatchPdksAgentEnrollmentAsync()
    {
        if (ProductCode != "PDKS") return;
        while (!_lifetime.IsCancellationRequested)
        {
            try
            {
                var token = await ReadTokenAsync();
                if (!string.IsNullOrWhiteSpace(token))
                {
                    var profile = await _erp.GetPdksProfileAsync(token, _lifetime.Token);
                    var audit = profile.Audit
                        || string.Equals(profile.Scope, "AUDIT", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(profile.Role, "DENETIM", StringComparison.OrdinalIgnoreCase);
                    if (audit) { await Task.Delay(TimeSpan.FromSeconds(30), _lifetime.Token); continue; }

                    if (!File.Exists(_pdksPaths.SetupCompletedFile) && !_pdksFirstRunWizardShown)
                    {
                        _pdksFirstRunWizardShown = true;
                        await Dispatcher.InvokeAsync(() =>
                        {
                            var wizard = new PdksTerminalSetupWindow(_pdksPaths, true) { Owner = this };
                            wizard.ShowDialog();
                        });
                        await InstallDesktopBridgeAsync();
                    }

                    try
                    {
                        await EnsurePdksAgentEnrollmentAsync(token, _lifetime.Token);
                    }
                    catch (Exception enrollmentError)
                    {
                        var store = new LocalPdksStore(_pdksPaths);
                        await store.TouchStateAsync("d1_sync", $"D1 cihaz yetkilendirmesi bekliyor · {enrollmentError.Message}", _lifetime.Token);
                    }
                }
            }
            catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { return; }
            catch { /* ağ geçici olabilir; aktif oturum için tekrar dene */ }

            try { await Task.Delay(TimeSpan.FromSeconds(30), _lifetime.Token); }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task<bool> EnsurePdksAgentEnrollmentAsync(string token, CancellationToken ct)
    {
        if (ProductCode != "PDKS" || string.IsNullOrWhiteSpace(token)) return false;

        var activeCompanySlug = await ReadActiveCompanySlugAsync();
        if (string.IsNullOrWhiteSpace(activeCompanySlug))
            throw new InvalidOperationException("Aktif ana firma seçimi okunamadı. PDKS cihazı yanlış firmaya bağlanmamak için yetkilendirme durduruldu.");

        var credentials = new MachineCredentialStore(_pdksPaths);
        using var api = new PdksMachineApiClient();
        var store = new LocalPdksStore(_pdksPaths);
        var current = credentials.Load();

        if (current is not null
            && !string.Equals(current.Company, activeCompanySlug, StringComparison.OrdinalIgnoreCase))
        {
            credentials.Clear();
            current = null;
            await store.TouchStateAsync("d1_sync", $"Firma değişti · cihaz yeniden yetkilendirilecek: {activeCompanySlug}", ct);
        }

        if (current is not null
            && string.Equals(current.DeviceLabel, _pdksPaths.DeviceLabel, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(current.DeviceId)
            && !string.IsNullOrWhiteSpace(current.Secret))
        {
            try
            {
                await api.HeartbeatAsync(current, ct);
                await store.TouchStateAsync("d1_sync", "D1 cihaz yetkisi hazır · Agent otomatik sync aktif", ct);
                return true;
            }
            catch
            {
                credentials.Clear();
            }
        }

        var enrolled = await api.EnrollAsync(token, _pdksPaths, activeCompanySlug, ct);
        if (string.IsNullOrWhiteSpace(enrolled.DeviceId) || string.IsNullOrWhiteSpace(enrolled.Secret))
            throw new InvalidOperationException("PDKS cihaz yetkilendirmesi eksik döndü.");
        if (!string.Equals(enrolled.Company, activeCompanySlug, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"PDKS cihazı yanlış firmaya bağlandı. Beklenen={activeCompanySlug}, Dönen={enrolled.Company}.");

        credentials.Save(enrolled);
        await store.TouchStateAsync("d1_sync", "D1 cihaz yetkisi oluşturuldu · Agent otomatik sync aktif", ct);
        return true;
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
            await OpenPdksTerminalSettingsAsync();
            e.Handled = true;
        }
    }
}
