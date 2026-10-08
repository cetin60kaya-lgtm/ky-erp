using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KyPdks.Unified;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        if (args.Contains("--agent-plan-selftest", StringComparer.OrdinalIgnoreCase))
        {
            UnifiedLocalActionPlanner.AssertContract();
            return;
        }
        if (args.Contains("--agent-once", StringComparer.OrdinalIgnoreCase))
        {
            _ = UnifiedSyncAgent.RunOnceAsync().GetAwaiter().GetResult();
            return;
        }
        var preview = args.Contains("--dev-preview", StringComparer.OrdinalIgnoreCase);
        Application.Run(new KyPdksWindow(preview));
    }
}

public sealed class KyPdksWindow : Form
{
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly Label connection = new()
    {
        AutoSize = false, Height = 32, Dock = DockStyle.Bottom,
        TextAlign = ContentAlignment.MiddleLeft,
        Padding = new Padding(14, 0, 0, 0),
        Text = "KY PDKS • Güvenli bağlantı hazırlanıyor..."
    };
    private readonly bool localPreview;
    private readonly Uri allowedOrigin;
    private readonly Uri initialUrl;

    public KyPdksWindow(bool localPreview)
    {
        this.localPreview = localPreview;
        allowedOrigin = localPreview
            ? new Uri("http://127.0.0.1:5186/")
            : new Uri("https://app.kyerp.net/");
        initialUrl = new Uri(allowedOrigin, localPreview ? "/pdks-studio" : "/pdks/workspace");

        Text = localPreview ? "KY PDKS — Yerel Tasarım İncelemesi" : "KY PDKS — Kurumsal";
        Width = 1500; Height = 900;
        MinimumSize = new Size(940, 620);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(browser);
        Controls.Add(connection);
        Shown += async (_, _) => await InitializeBrowserAsync();
    }

    private bool IsTrustedOrigin(Uri uri)
    {
        return uri.IsAbsoluteUri &&
            uri.Scheme == allowedOrigin.Scheme &&
            uri.Host.Equals(allowedOrigin.Host, StringComparison.OrdinalIgnoreCase) &&
            uri.Port == allowedOrigin.Port;
    }

    private async Task InitializeBrowserAsync()
    {
        try
        {
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "KYERP", "KY-PDKS", localPreview ? "PreviewWebView" : "WebViewProfile");
            Directory.CreateDirectory(profile);
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await browser.EnsureCoreWebView2Async(env);
            var core = browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = localPreview;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsWebMessageEnabled = false; // No privileged desktop bridge.
            core.NavigationStarting += (_, args) =>
            {
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri) || !IsTrustedOrigin(uri))
                {
                    args.Cancel = true;
                    connection.Text = "Güvenlik: yetkisiz adres engellendi.";
                }
            };
            core.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var uri)) return;
                if (IsTrustedOrigin(uri)) core.Navigate(uri.ToString());
                else if (uri.Scheme == Uri.UriSchemeHttps)
                    Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
            };
            core.NavigationCompleted += (_, args) =>
                connection.Text = args.IsSuccess
                    ? "KY PDKS • " + (localPreview ? "Yalnız tasarım incelemesi" : "Oturum ve sunucu verisi üzerinden güvenli bağlantı")
                    : "Bağlantı açılamadı. Yerel ağınızı veya app.kyerp.net oturumunu kontrol edin.";
            core.Navigate(initialUrl.ToString());
        }
        catch (Exception error)
        {
            connection.Text = "KY PDKS başlatılamadı: " + error.Message;
        }
    }
}
