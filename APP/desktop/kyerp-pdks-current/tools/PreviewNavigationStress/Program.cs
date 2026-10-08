using System.Diagnostics;
using System.Reflection;
using HKN.Personel.Native;

if (!Environment.GetCommandLineArgs().Contains("--visual-preview",
    StringComparer.OrdinalIgnoreCase))
    throw new InvalidOperationException("Must run with --visual-preview; live data is not allowed.");

Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1");
Environment.SetEnvironmentVariable("KY_PDKS_RUNTIME_ROOT",
    Path.Combine(Path.GetTempPath(), "KYERP-PDKS-VISUAL-PREVIEW-STRESS"));
Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH",
    Path.Combine(Path.GetTempPath(), "KYERP-PDKS-VISUAL-PREVIEW-STRESS", "NO_DB.GDB"));
ApplicationConfiguration.Initialize();

var staff = new LocalUser
{
    UserName = "ÖNİZLEME",
    IsAdmin = true,
    IsActive = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};
using var form = new MainShellForm(staff) { Size = new Size(1500, 900),
    StartPosition = FormStartPosition.Manual, Location = new Point(15, 15) };
form.Show();
Application.DoEvents();

var titleField = typeof(MainShellForm).GetField("modernPageTitle",
    BindingFlags.NonPublic | BindingFlags.Instance)
    ?? throw new InvalidOperationException("Page heading was not created.");

var items = PdksNavigationDesign.AllMenuCommands.Distinct().ToArray();
if (items.Length < 17) throw new InvalidOperationException("Sidebar has missing workflow entries.");
if (items.Length != PdksNavigationDesign.AllMenuCommands.Count)
    throw new InvalidOperationException("Sidebar duplicate command identity.");

var watch = Stopwatch.StartNew();
var baselineHandles = Process.GetCurrentProcess().HandleCount;
var routes = 0;
var worstMenuMilliseconds = 0L;
for (var pass = 0; pass < 12; pass++)
{
    foreach (var id in items)
    {
        var label = PdksCommandCatalog.Get(id);
        var control = Descendants(form).OfType<Button>()
            .FirstOrDefault(x => x.Tag is PdksCommandId nav && nav == id)
            ?? throw new InvalidOperationException("Missing actual sidebar button " + id);
        var step = Stopwatch.StartNew();
        control.PerformClick();
        Application.DoEvents();
        step.Stop();
        worstMenuMilliseconds = Math.Max(worstMenuMilliseconds, step.ElapsedMilliseconds);
        if (step.ElapsedMilliseconds > 2500)
            throw new InvalidOperationException(
                $"Slow real-UI menu navigation: {id} took {step.ElapsedMilliseconds}ms.");
        var heading = ((Label?)titleField.GetValue(form))?.Text;
        if (!string.Equals(heading, label.Title, StringComparison.Ordinal))
            throw new InvalidOperationException(
                $"Stale screen after {id}: expected {label.Title} but heading={heading}");
        if (id == PdksCommandId.Personnel &&
            !Descendants(form).OfType<DataGridView>()
                .Any(g => g.Columns.Cast<DataGridViewColumn>()
                    .Any(c => c.HeaderText == "Ad Soyad")))
            throw new InvalidOperationException("Personnel list is not displayed.");
        if (id == PdksCommandId.EntryExit &&
            !Descendants(form).OfType<DataGridView>()
                .Any(g => g.Columns.Cast<DataGridViewColumn>()
                    .Any(c => c.HeaderText == "Kaynak")))
            throw new InvalidOperationException("Attendance evidence table is missing.");
        routes++;
    }
}
GC.Collect();
GC.WaitForPendingFinalizers();
GC.Collect();
Application.DoEvents();
using var process = Process.GetCurrentProcess();
var handleGrowth = process.HandleCount - baselineHandles;
watch.Stop();
if (handleGrowth > 550)
    throw new InvalidOperationException("Navigation leaks UI handles: +" + handleGrowth);
if (process.WorkingSet64 > 500L * 1024 * 1024)
    throw new InvalidOperationException("Navigation working set exceeds 500 MB.");

Console.WriteLine($"PDKS_PREVIEW_STRESS PASS routes={routes} " +
    $"durationMs={watch.ElapsedMilliseconds} worstMenuMs={worstMenuMilliseconds} handlesDelta={handleGrowth} " +
    $"workingMB={process.WorkingSet64 / 1048576}");
form.Close();
Application.DoEvents();

static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var nested in Descendants(child)) yield return nested;
    }
}
