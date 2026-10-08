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
        if (args.Contains("--isolated-firebird-copy-smoke", StringComparer.OrdinalIgnoreCase))
        {
            var report = FirebirdIsolatedCopySmoke.RunAsync().GetAwaiter().GetResult();
            Console.WriteLine(report);
            return;
        }
        if (args.Contains("--agent-safety-selftest", StringComparer.OrdinalIgnoreCase))
        {
            // All tests use isolated temporary directories; no production FDB,
            // annual TNF or terminal RAW files are written by this command.
            UnifiedLocalActionPlanner.AssertContract();
            Console.WriteLine("PASS LOCAL_PLAN");
            UnifiedJournalStore.SelfTestAsync().GetAwaiter().GetResult();
            Console.WriteLine("PASS DURABLE_JOURNAL");
            UnifiedLocalPolicyStore.SelfTestAsync().GetAwaiter().GetResult();
            Console.WriteLine("PASS POLICY_MIRROR");
            AtomicTnfFileStore.AssertContractAsync().GetAwaiter().GetResult();
            Console.WriteLine("PASS TNF_ATOMIC_STORE");
            UnifiedAgentRunner.SelfTestAsync().GetAwaiter().GetResult();
            Console.WriteLine("PASS AGENT_LOOP");
            Console.WriteLine("RESULT=PASS AGENT_SAFETY_SELFTEST");
            return;
        }
        if (args.Contains("--agent-plan-selftest", StringComparer.OrdinalIgnoreCase))
        {
            UnifiedLocalActionPlanner.AssertContract();
            return;
        }
        if (args.Contains("--agent-journal-selftest", StringComparer.OrdinalIgnoreCase))
        {
            UnifiedJournalStore.SelfTestAsync().GetAwaiter().GetResult();
            return;
        }
        if (args.Contains("--agent-policy-selftest", StringComparer.OrdinalIgnoreCase))
        {
            UnifiedLocalPolicyStore.SelfTestAsync().GetAwaiter().GetResult();
            return;
        }
        if (args.Contains("--tnf-store-selftest", StringComparer.OrdinalIgnoreCase))
        {
            AtomicTnfFileStore.AssertContractAsync().GetAwaiter().GetResult();
            return;
        }
        if (args.Contains("--agent-schema-probe", StringComparer.OrdinalIgnoreCase))
        {
            var report = FirebirdSchemaProbe.RunAsync().GetAwaiter().GetResult();
            var output = Environment.GetEnvironmentVariable("KY_PDKS_SCHEMA_PROBE_OUTPUT");
            if (!string.IsNullOrWhiteSpace(output))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(output)!);
                File.WriteAllText(output, report, new System.Text.UTF8Encoding(false));
            }
            else
            {
                Console.WriteLine(report);
            }
            return;
        }
        if (args.Contains("--agent-loop-selftest", StringComparer.OrdinalIgnoreCase))
        {
            UnifiedAgentRunner.SelfTestAsync().GetAwaiter().GetResult();
            return;
        }
        if (args.Contains("--agent-loop", StringComparer.OrdinalIgnoreCase))
        {
            using var cancel = new CancellationTokenSource();
            ConsoleCancelEventHandler handler = (_, eventArgs) =>
            {
                eventArgs.Cancel = true;
                cancel.Cancel();
            };
            Console.CancelKeyPress += handler;
            try
            {
                var result = UnifiedAgentRunner.RunLoopAsync(cancel.Token).GetAwaiter().GetResult();
                Console.WriteLine(result);
                if (result != "AGENT_STOPPED") Environment.ExitCode = 2;
            }
            finally
            {
                Console.CancelKeyPress -= handler;
            }
            return;
        }
        if (args.Contains("--agent-once", StringComparer.OrdinalIgnoreCase))
        {
            var result = UnifiedSyncAgent.RunOnceAsync().GetAwaiter().GetResult();
            Console.WriteLine(result);
            if (result is not ("NO_PENDING_COMMAND" or "POLICY_MIRROR_AND_CLOUD_ACK_OK" or
                "LOCAL_RECEIPT_ACK_REPLAYED"))
                Environment.ExitCode = 2;
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
