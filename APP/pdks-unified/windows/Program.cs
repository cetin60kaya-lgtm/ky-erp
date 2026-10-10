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
        if (args.Contains("--isolated-ledger-smoke", StringComparer.OrdinalIgnoreCase))
        {
            var proof = FirebirdIsolatedLedgerSmoke.RunAsync().GetAwaiter().GetResult();
            Console.WriteLine(proof);
            return;
        }
        if (args.Contains("--isolated-firebird-copy-smoke", StringComparer.OrdinalIgnoreCase))
        {
            var report = FirebirdIsolatedCopySmoke.RunAsync().GetAwaiter().GetResult();
            Console.WriteLine(report);
            return;
        }
        if (args.Contains("--stage-snapshot", StringComparer.OrdinalIgnoreCase))
        {
            // Real personnel/punch evidence may be read ONLY from the
            // allowlisted gbak-restored Firebird copy, never the live FDB.
            var proof = FirebirdStageAttendanceSnapshot.RunAsync().GetAwaiter().GetResult();
            Console.WriteLine(proof);
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
        // A published QA directory contains a deliberate marker. A plain
        // double-click must open bundled test UI, NEVER production URL.
        var offlineTest = args.Contains("--offline-test", StringComparer.OrdinalIgnoreCase)
            || Path.GetFileNameWithoutExtension(Environment.ProcessPath ?? "").Equals(
                "KY-PDKS-MENU-TEST", StringComparison.OrdinalIgnoreCase)
            || File.Exists(Path.Combine(AppContext.BaseDirectory, "KY-PDKS-MENU-TEST.marker"));
        Application.Run(new KyPdksWindow(preview && !offlineTest, offlineTest));
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
    private readonly bool offlineTest;
    private readonly Uri allowedOrigin;
    private readonly Uri initialUrl;

    public KyPdksWindow(bool localPreview, bool offlineTest = false)
    {
        this.localPreview = localPreview;
        this.offlineTest = offlineTest;
        allowedOrigin = offlineTest
            ? new Uri("https://ky-pdks-test.local/")
            : localPreview
                ? new Uri("http://127.0.0.1:5186/")
                : new Uri("https://app.kyerp.net/");
        initialUrl = new Uri(allowedOrigin,
            offlineTest ? "/index.html?pdks-test=1" : localPreview ? "/pdks-studio" : "/pdks/workspace");

        Text = offlineTest ? "KY PDKS — MENÜ TEST SÜRÜMÜ (CANLI VERİ KAPALI)"
            : localPreview ? "KY PDKS — Yerel Tasarım İncelemesi" : "KY PDKS — Kurumsal";
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
                "KYERP", "KY-PDKS", offlineTest ? "PortableQaWebView"
                    : localPreview ? "PreviewWebView" : "WebViewProfile");
            Directory.CreateDirectory(profile);
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await browser.EnsureCoreWebView2Async(env);
            var core = browser.CoreWebView2;
            if (offlineTest)
            {
                // Static Vite output is bundled beside the executable. WebView2
                // treats it as HTTPS origin without launching a local HTTP server.
                var localWeb = Path.Combine(AppContext.BaseDirectory, "web");
                if (!File.Exists(Path.Combine(localWeb, "index.html")))
                    throw new FileNotFoundException("Menü test arayüz dosyaları bulunamadı.", localWeb);
                core.SetVirtualHostNameToFolderMapping("ky-pdks-test.local", localWeb,
                    CoreWebView2HostResourceAccessKind.DenyCors);
            }
            if (offlineTest)
            {
                // The only privileged local read route. No directory listing, arbitrary
                // paths, file writes, remote server access or person-data packaging.
                core.AddWebResourceRequestedFilter(
                    "https://ky-pdks-test.local/__local-copy/latest.json",
                    CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += (_, args) =>
                {
                    if (!Uri.TryCreate(args.Request.Uri, UriKind.Absolute, out var requestUri) ||
                        requestUri.AbsolutePath != "/__local-copy/latest.json" ||
                        !IsTrustedOrigin(requestUri) || args.Request.Method != "GET") return;
                    var folder = @"D:\\KYERP\\_TEMP\\PDKS_PRIVATE_SNAPSHOTS";
                    var latest = Directory.Exists(folder)
                        ? new DirectoryInfo(folder).GetFiles("KY_REAL_COPY_*.json")
                            .Where(f => !f.Attributes.HasFlag(FileAttributes.ReparsePoint) &&
                                        f.Length is >= 100 and <= 12000000)
                            .OrderByDescending(f => f.LastWriteTimeUtc).FirstOrDefault()
                        : null;
                    if (latest is null)
                    {
                        args.Response = core.Environment.CreateWebResourceResponse(
                            new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{}")),
                            404, "Not Found", "Content-Type: application/json; charset=utf-8");
                        return;
                    }
                    // Read only the allowlisted local file. It remains on this machine.
                    var bytes = File.ReadAllBytes(latest.FullName);
                    args.Response = core.Environment.CreateWebResourceResponse(
                        new MemoryStream(bytes), 200, "OK",
                        "Content-Type: application/json; charset=utf-8\\r\\nCache-Control: no-store");
                };
            }
            core.Settings.AreDevToolsEnabled = localPreview || offlineTest;
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
                else if (!offlineTest && uri.Scheme == Uri.UriSchemeHttps)
                    Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
            };
            core.NavigationCompleted += (_, args) =>
                connection.Text = args.IsSuccess
                    ? "KY PDKS • " + (offlineTest ? "İZOLE MENÜ TESTİ — canlı veri bağlantısı kapalı"
                        : localPreview ? "Yalnız tasarım incelemesi" : "Oturum ve sunucu verisi üzerinden güvenli bağlantı")
                    : "Bağlantı açılamadı. Yerel ağınızı veya app.kyerp.net oturumunu kontrol edin.";
            core.Navigate(initialUrl.ToString());
        }
        catch (Exception error)
        {
            connection.Text = "KY PDKS başlatılamadı: " + error.Message;
        }
    }
}
