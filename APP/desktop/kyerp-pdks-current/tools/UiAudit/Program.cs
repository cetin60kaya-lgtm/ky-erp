using System.Drawing.Imaging;
using System.Text;
using HKN.Personel.Native;

ApplicationConfiguration.Initialize();

var root = Path.Combine(@"D:\KYERP\_UI_AUDIT", DateTime.Now.ToString("yyyyMMdd-HHmmss"));
Directory.CreateDirectory(root);
var log = new StringBuilder();
var errors = new List<string>();

var user = new LocalUser
{
    UserName = "UI-AUDIT",
    IsActive = true,
    IsAdmin = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

var jobs = new List<(string Name, Func<Form> Factory)>
{
    ("00-MainShell", () => new MainShellForm(user)),
    ("01-Gruplar", () => new LegacyGroupForm()),
    ("02-Tanimlar", () => new LegacyDefinitionsForm()),
    ("03-Donemler", () => new LegacyPeriodForm()),
    ("04-Personel", () => new PersonelForm()),
    ("05-GirisCikis", () => new LegacyGirisCikisForm()),
    ("06-Avans", () => new LegacyAvansEntryForm()),
    ("07-Puantaj", () => new LegacyPuantajForm()),
    ("08-Bordro", () => new LegacyBordroForm()),
    ("09-TerminalAyarlari", () => new LegacyTerminalSettingsForm()),
    ("10-Kullanicilar", () => new UserManagementForm()),
    ("11-CanliDenetim", () => new LiveAttendanceForm())
};

foreach (var view in Enum.GetValues<LegacyDataView>())
{
    var captured = view;
    jobs.Add(($"20-Veri-{captured}", () => new LegacyDataModuleForm(captured)));
}

foreach (var report in Enum.GetValues<LegacyOperationalReport>())
{
    var captured = report;
    jobs.Add(($"30-Rapor-{captured}", () => new LegacyOperationalReportForm(captured)));
}

foreach (var job in jobs)
{
    try
    {
        using var form = job.Factory();
        if (job.Name.StartsWith("30-Rapor-", StringComparison.Ordinal))
            CaptureFormNoLoad(form, job.Name, root, log);
        else
            CaptureForm(form, job.Name, root, log);
    }
    catch (Exception ex)
    {
        var msg = $"{job.Name}: {ex.GetType().Name}: {ex.Message}";
        errors.Add(msg);
        log.AppendLine("ERROR " + msg);
    }
}

try
{
    using var personnel = new PersonelForm();
    using var transfer = personnel.CreateTerminalTransferDialog();
    CaptureForm(transfer, "40-Terminal-Veri-Transferi", root, log);
}
catch (Exception ex)
{
    var msg = $"40-Terminal-Veri-Transferi: {ex.GetType().Name}: {ex.Message}";
    errors.Add(msg);
    log.AppendLine("ERROR " + msg);
}

File.WriteAllText(Path.Combine(root, "audit.txt"), log.ToString(), Encoding.UTF8);
File.WriteAllLines(Path.Combine(root, "errors.txt"), errors, Encoding.UTF8);
File.WriteAllText(Path.Combine(root, "RESULT.txt"),
    errors.Count == 0 ? "PASS" : $"PARTIAL - {errors.Count} error(s)");

Console.WriteLine($"UI_AUDIT_ROOT={root}");
Console.WriteLine($"UI_AUDIT_FORMS={jobs.Count + 1}");
Console.WriteLine($"UI_AUDIT_ERRORS={errors.Count}");
foreach (var error in errors) Console.WriteLine("ERROR=" + error);

static void CaptureFormNoLoad(Form form, string name, string root, StringBuilder log)
{
    form.CreateControl();
    form.PerformLayout();
    log.AppendLine($"FORM-NOLOAD|{name}|{form.Text}|{form.Width}x{form.Height}");
    WriteControlTree(form, log, 0);
    Capture(form, Path.Combine(root, Safe(name) + ".png"));
}

static void CaptureForm(Form form, string name, string root, StringBuilder log)
{
    form.StartPosition = FormStartPosition.Manual;
    form.Location = new Point(40, 40);
    foreach (var grid in Descendants(form).OfType<DataGridView>())
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
    form.Show();
    Application.DoEvents();
    Thread.Sleep(form is LiveAttendanceForm ? 1800 : 120);
    Application.DoEvents();

    log.AppendLine($"FORM|{name}|{form.Text}|{form.Width}x{form.Height}");
    WriteControlTree(form, log, 0);
    Capture(form, Path.Combine(root, Safe(name) + ".png"));

    var tabs = Descendants(form).OfType<TabControl>().ToList();
    for (var t = 0; t < tabs.Count; t++)
    {
        var tab = tabs[t];
        for (var i = 0; i < tab.TabPages.Count; i++)
        {
            tab.SelectedIndex = i;
            Application.DoEvents();
            Thread.Sleep(60);
            var page = tab.TabPages[i];
            var file = $"{Safe(name)}__TAB{t + 1}-{i + 1}-{Safe(page.Text)}.png";
            Capture(form, Path.Combine(root, file));
            log.AppendLine($"TAB|{name}|{t + 1}|{i + 1}|{page.Text}");
        }
    }

    form.Close();
    Application.DoEvents();
}

static void Capture(Form form, string path)
{
    var size = form.ClientSize;
    if (size.Width < 1 || size.Height < 1) return;
    using var bmp = new Bitmap(size.Width, size.Height);
    form.DrawToBitmap(bmp, new Rectangle(Point.Empty, size));
    bmp.Save(path, ImageFormat.Png);
}

static void WriteControlTree(Control root, StringBuilder log, int depth)
{
    foreach (Control child in root.Controls)
    {
        var text = (child.Text ?? "").Replace("|", "/").Replace("\r", " ").Replace("\n", " ");
        log.AppendLine($"CTRL|{depth}|{child.GetType().Name}|{child.Name}|{text}|{child.Width}x{child.Height}|Visible={child.Visible}|Enabled={child.Enabled}");
        WriteControlTree(child, log, depth + 1);
    }
}

static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var descendant in Descendants(child))
            yield return descendant;
    }
}

static string Safe(string value)
{
    var invalid = Path.GetInvalidFileNameChars();
    var chars = value.Select(c => invalid.Contains(c) ? '-' : c).ToArray();
    var text = new string(chars)
        .Replace('&', '-')
        .Replace(' ', '-')
        .Replace('/', '-')
        .Replace('\\', '-');
    while (text.Contains("--")) text = text.Replace("--", "-");
    return text.Trim('-');
}
