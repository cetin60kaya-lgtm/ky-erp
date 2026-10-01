using System.Runtime.InteropServices;
using System.Reflection;
using System.Text;
using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1", EnvironmentVariableTarget.Process);

var errors = new List<string>();
var results = new List<string>();
RunLiveAttendanceChecks(errors, results);
Application.ThreadException += (_, e) => errors.Add("UI: " + e.Exception.GetBaseException().Message);

var user = new LocalUser
{
    UserName = "ADMIN",
    IsAdmin = true,
    IsActive = true,
    IsCompanyResponsible = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var shell = new MainShellForm(user)
{
    StartPosition = FormStartPosition.Manual,
    Location = new Point(20, 20),
    Size = new Size(1500, 900)
};
shell.Show();
Pump(900);

if (shell.MainMenuStrip is null)
{
    Console.WriteLine("ERROR|Ana menu yok");
    Environment.Exit(2);
}

var topNames = shell.MainMenuStrip.Items.OfType<ToolStripMenuItem>().Where(x => x.Visible).Select(x => Clean(x.Text)).ToArray();
var expected = new[] { "Genel", "Operasyon", "Personel", "Puantaj / Bordro", "Raporlar", "Yönetim", "Ayarlar", "Yardım" };
foreach (var duplicate in topNames.GroupBy(x => x, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1))
    errors.Add("Mükerrer üst menu: " + duplicate.Key);
foreach (var name in expected.Where(x => !topNames.Contains(x, StringComparer.OrdinalIgnoreCase)))
    errors.Add("Eksik üst menu: " + name);

var leaves = new List<(string Path, ToolStripMenuItem Item)>();
foreach (var top in shell.MainMenuStrip.Items.OfType<ToolStripMenuItem>().Where(x => x.Visible))
    Collect(top, Clean(top.Text), leaves);

var skipFragments = new[]
{
    "Hedef'ten Güncel Personel / Veri Al",
    "KY ERP Web Sitesi"
};

foreach (var (path, item) in leaves)
{
    if (!item.Enabled)
    {
        results.Add("SKIP_DISABLED|" + path);
        continue;
    }
    if (skipFragments.Any(x => path.Contains(x, StringComparison.OrdinalIgnoreCase)))
    {
        results.Add("SKIP_LIVE|" + path);
        continue;
    }

    Console.WriteLine("RUN|" + path);
    Console.Out.Flush();
    var beforeErrors = errors.Count;
    using var closer = new System.Windows.Forms.Timer { Interval = 400 };
    closer.Tick += (_, _) =>
    {
        NativeDialogs.CloseOwnMessageBoxes();
        foreach (Form form in Application.OpenForms.Cast<Form>().ToArray())
        {
            if (ReferenceEquals(form, shell) || !form.Modal) continue;
            try { form.Close(); } catch { }
        }
    };
    closer.Start();
    try
    {
        item.PerformClick();
        Pump(800);
        if (errors.Count == beforeErrors) results.Add("PASS|" + path);
        else results.Add("FAIL|" + path + "|" + errors[^1]);
    }
    catch (Exception ex)
    {
        var message = ex.GetBaseException().Message;
        errors.Add(path + ": " + message);
        results.Add("FAIL|" + path + "|" + message);
    }
    finally
    {
        closer.Stop();
        NativeDialogs.CloseOwnMessageBoxes();
        foreach (Form form in Application.OpenForms.Cast<Form>().ToArray())
        {
            if (ReferenceEquals(form, shell) || !form.Modal) continue;
            try { form.Close(); } catch { }
        }
        Pump(100);
    }
}

foreach (var line in results) Console.WriteLine(line);
foreach (var error in errors.Distinct()) Console.WriteLine("ERROR|" + error);
Console.WriteLine($"FUNCTION_AUDIT_LEAVES={leaves.Count}");
Console.WriteLine($"FUNCTION_AUDIT_ERRORS={errors.Distinct().Count()}");
Console.WriteLine(errors.Count == 0 ? "FUNCTION_AUDIT_PASS" : "FUNCTION_AUDIT_FAIL");
shell.Close();
Environment.Exit(errors.Count == 0 ? 0 : 1);

static void RunLiveAttendanceChecks(List<string> errors, List<string> results)
{
    try
    {
        using var form = new LiveAttendanceForm();
        var tabs = FindControls<TabControl>(form).FirstOrDefault();
        var names = tabs?.TabPages.Cast<TabPage>().Select(x => x.Text).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        foreach (var required in new[] { "Giriş Eksik", "Geç Giriş", "Erken Çıkış" })
            if (!names.Contains(required)) errors.Add("Canlı denetim sekmesi eksik: " + required);
        var scheduleType = typeof(LiveAttendanceForm).GetNestedType("Schedule", BindingFlags.NonPublic);
        var status = typeof(LiveAttendanceForm).GetMethod("Status", BindingFlags.NonPublic | BindingFlags.Static);
        if (scheduleType is null || status is null) errors.Add("Canlı denetim durum sınıflandırıcısı bulunamadı.");
        else
        {
            var schedule = Activator.CreateInstance(scheduleType, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null,
                new object[] { "Test", 510, 525, 1140, 1110, 450 }, null);
            var day = DateTime.Today.AddDays(-1);
            var exitOnly = status.Invoke(null, new object?[] { day, schedule, true, false, null, day.AddHours(19) }) as string;
            if (!string.Equals(exitOnly, "Giriş Kartı Yok", StringComparison.Ordinal)) errors.Add("Exit-only canlı hareket yanlış sınıflandı: " + exitOnly);
        }
        var failed = errors.Any(x => x.Contains("Canlı denetim", StringComparison.OrdinalIgnoreCase) || x.Contains("Exit-only", StringComparison.OrdinalIgnoreCase));
        results.Add(failed ? "FAIL|Canlı denetim durum/sekme regresyonu" : "PASS|Canlı denetim giriş-çıkış ve geç/erken filtreleri");
    }
    catch (Exception ex) { errors.Add("Canlı denetim regresyon testi: " + ex.GetBaseException().Message); }
}

static IEnumerable<T> FindControls<T>(Control root) where T : Control
{
    foreach (Control child in root.Controls)
    {
        if (child is T match) yield return match;
        foreach (var nested in FindControls<T>(child)) yield return nested;
    }
}
static void Collect(ToolStripMenuItem parent, string path, List<(string Path, ToolStripMenuItem Item)> leaves)
{
    var children = parent.DropDownItems.OfType<ToolStripMenuItem>().ToArray();
    if (children.Length == 0)
    {
        leaves.Add((path, parent));
        return;
    }
    foreach (var child in children) Collect(child, path + " > " + Clean(child.Text), leaves);
}

static string Clean(string? text) => (text ?? string.Empty).Replace("&&", "&").Trim();

static void Pump(int milliseconds)
{
    var until = Environment.TickCount64 + milliseconds;
    while (Environment.TickCount64 < until)
    {
        Application.DoEvents();
        Thread.Sleep(25);
    }
}

static class NativeDialogs
{
    const uint WM_CLOSE = 0x0010;
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    public static void CloseOwnMessageBoxes()
    {
        var pid = (uint)Environment.ProcessId;
        EnumWindows((hWnd, ignored) =>
        {
            GetWindowThreadProcessId(hWnd, out var ownerPid);
            if (ownerPid != pid) return true;
            var name = new StringBuilder(64);
            _ = GetClassName(hWnd, name, name.Capacity);
            if (name.ToString() == "#32770") _ = PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            return true;
        }, IntPtr.Zero);
    }
}
