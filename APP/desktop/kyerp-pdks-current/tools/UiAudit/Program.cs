using System.Drawing.Imaging;
using System.Text;
using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1", EnvironmentVariableTarget.Process);
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value))
        Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}

var noLoad = string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT_NOLOAD"), "1", StringComparison.Ordinal);
var workspaceRoot = Environment.GetEnvironmentVariable("KYERP_PDKS_ROOT", EnvironmentVariableTarget.User);
var driveRoot = !string.IsNullOrWhiteSpace(workspaceRoot)
    ? Path.Combine(workspaceRoot, "08_TEST", "UI_AUDIT")
    : (Directory.Exists(@"D:\Googledrive\KYERP-PDKS-MASAUSTU")
        ? @"D:\Googledrive\KYERP-PDKS-MASAUSTU\08_TEST\UI_AUDIT"
        : Path.Combine(Path.GetTempPath(), "KYERP", "_UI_AUDIT"));
var root = Path.Combine(driveRoot, DateTime.Now.ToString("yyyyMMdd-HHmmss"));
Directory.CreateDirectory(root);
var log = new StringBuilder();
var errors = new List<string>();

var user = new LocalUser
{
    UserName = "ADMIN",
    IsActive = true,
    IsAdmin = true,
    IsCompanyResponsible = true,
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
    ("11-CanliDenetim", () => new LiveAttendanceForm()),
    ("12-KartGecmisi", () => new AttendanceHistoryForm())
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
        PdksTheme.Apply(form);
        if (noLoad || job.Name.StartsWith("30-Rapor-", StringComparison.Ordinal))
            CaptureFormNoLoad(form, job.Name, root, log, errors);
        else
            CaptureForm(form, job.Name, root, log, errors);
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
    if (noLoad) CaptureFormNoLoad(transfer, "40-Terminal-Veri-Transferi", root, log, errors);
    else CaptureForm(transfer, "40-Terminal-Veri-Transferi", root, log, errors);
}
catch (Exception ex)
{
    var msg = $"40-Terminal-Veri-Transferi: {ex.GetType().Name}: {ex.Message}";
    errors.Add(msg);
    log.AppendLine("ERROR " + msg);
}

File.WriteAllText(Path.Combine(root, "audit.txt"), log.ToString(), Encoding.UTF8);
File.WriteAllLines(Path.Combine(root, "errors.txt"), errors, Encoding.UTF8);
File.WriteAllText(Path.Combine(root, "RESULT.txt"), errors.Count == 0 ? "PASS" : $"PARTIAL - {errors.Count} error(s)");

Console.WriteLine($"UI_AUDIT_ROOT={root}");
Console.WriteLine($"UI_AUDIT_FORMS={jobs.Count + 1}");
Console.WriteLine($"UI_AUDIT_ERRORS={errors.Count}");
foreach (var error in errors) Console.WriteLine("ERROR=" + error);

static void CaptureFormNoLoad(Form form, string name, string root, StringBuilder log, List<string> errors)
{
    form.CreateControl();
    form.PerformLayout();
    log.AppendLine($"FORM-NOLOAD|{name}|{form.Text}|{form.Width}x{form.Height}");
    WriteControlTree(form, log, 0);
    ValidateLayout(form, name, errors, log);
    Capture(form, Path.Combine(root, Safe(name) + ".png"));
}

static void CaptureForm(Form form, string name, string root, StringBuilder log, List<string> errors)
{
    form.StartPosition = FormStartPosition.Manual;
    form.Location = new Point(40, 40);
    foreach (var grid in Descendants(form).OfType<DataGridView>())
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
    form.Show();
    Application.DoEvents();
    if (form is MainShellForm)
    {
        Capture(form, Path.Combine(root, $"{Safe(name)}__START-000ms.png"));
        log.AppendLine($"STARTUP|{name}|000ms|{form.Bounds}|State={form.WindowState}");
        Thread.Sleep(900);
        Application.DoEvents();
        Capture(form, Path.Combine(root, $"{Safe(name)}__START-900ms.png"));
        log.AppendLine($"STARTUP|{name}|900ms|{form.Bounds}|State={form.WindowState}");
        Thread.Sleep(1600);
        Application.DoEvents();
        Capture(form, Path.Combine(root, $"{Safe(name)}__START-2500ms.png"));
        log.AppendLine($"STARTUP|{name}|2500ms|{form.Bounds}|State={form.WindowState}");
        Thread.Sleep(2500);
        Application.DoEvents();
        Capture(form, Path.Combine(root, $"{Safe(name)}__START-5000ms.png"));
        log.AppendLine($"STARTUP|{name}|5000ms|{form.Bounds}|State={form.WindowState}");
    }
    else
    {
        var settle = form is LiveAttendanceForm ? 2600
            : form is AttendanceHistoryForm ? 1800
            : form is PersonelForm ? 1200
            : form.GetType().Name.Contains("Terminal", StringComparison.OrdinalIgnoreCase) ? 1800
            : 650;
        Thread.Sleep(settle);
    }
    Application.DoEvents();

    log.AppendLine($"FORM|{name}|{form.Text}|{form.Width}x{form.Height}");
    WriteControlTree(form, log, 0);
    ValidateLayout(form, name, errors, log);
    Capture(form, Path.Combine(root, Safe(name) + ".png"));

    if (form is MainShellForm && form.MainMenuStrip is MenuStrip menu)
    {
        foreach (var item in menu.Items.OfType<ToolStripMenuItem>().Where(x => x.Visible && x.Enabled && x.DropDownItems.Count > 0))
        {
            item.ShowDropDown();
            Application.DoEvents();
            var menuWait = item.Text is "Yönetim" or "Ayarlar" ? 1100 : 700;
            Thread.Sleep(menuWait);
            Capture(form, Path.Combine(root, $"{Safe(name)}__MENU-{Safe(item.Text ?? "Menu")}.png"));
            log.AppendLine($"MENU|{name}|{item.Text}|Wait={menuWait}ms");
            Thread.Sleep(item.Text is "Yönetim" or "Ayarlar" ? 700 : 300);
            Application.DoEvents();
            item.HideDropDown();
            Application.DoEvents();
            Thread.Sleep(250);
        }
    }

    var tabs = Descendants(form).OfType<TabControl>().ToList();
    for (var t = 0; t < tabs.Count; t++)
    {
        var tab = tabs[t];
        for (var i = 0; i < tab.TabPages.Count; i++)
        {
            tab.SelectedIndex = i;
            Application.DoEvents();
            var page = tab.TabPages[i];
            var tabWait = name.Contains("Personel", StringComparison.OrdinalIgnoreCase) ? 850
                : page.Text.Contains("Terminal", StringComparison.OrdinalIgnoreCase) ? 1200
                : page.Text.Contains("Canlı", StringComparison.OrdinalIgnoreCase) ? 1200
                : 450;
            Thread.Sleep(tabWait);
            Application.DoEvents();
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

static void ValidateLayout(Form form, string name, List<string> errors, StringBuilder log)
{
    foreach (var control in Descendants(form).Where(x => x.Visible))
    {
        if (control is Button button)
        {
            if (button.Width < 28 || button.Height < 22)
            {
                var msg = $"{name}: sıkışmış buton '{button.Text}' {button.Width}x{button.Height}";
                errors.Add(msg); log.AppendLine("LAYOUT_ERROR|" + msg);
            }
            if (button.Parent is Control parent && !parent.ClientRectangle.Contains(button.Bounds))
            {
                var msg = $"{name}: taşan buton '{button.Text}' Bounds={button.Bounds} Parent={parent.ClientRectangle}";
                errors.Add(msg); log.AppendLine("LAYOUT_ERROR|" + msg);
            }
        }
        if (control is TabControl tabs && tabs.Width < 300)
        {
            var msg = $"{name}: dar sekme alanı {tabs.Width}x{tabs.Height}";
            errors.Add(msg); log.AppendLine("LAYOUT_ERROR|" + msg);
        }
    }
    if (form.MainMenuStrip is MenuStrip menu)
    {
        var visible = menu.Items.OfType<ToolStripMenuItem>().Where(x => x.Visible).ToArray();
        var total = visible.Sum(x => x.Width + x.Margin.Horizontal);
        if (total > menu.DisplayRectangle.Width)
        {
            var msg = $"{name}: üst menü sıkışıyor toplam={total} alan={menu.DisplayRectangle.Width}";
            errors.Add(msg); log.AppendLine("LAYOUT_ERROR|" + msg);
        }
    }
}
static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var descendant in Descendants(child)) yield return descendant;
    }
}

static string Safe(string value)
{
    var invalid = Path.GetInvalidFileNameChars();
    var chars = value.Select(c => invalid.Contains(c) ? '-' : c).ToArray();
    var text = new string(chars).Replace('&', '-').Replace(' ', '-').Replace('/', '-').Replace('\\', '-');
    while (text.Contains("--")) text = text.Replace("--", "-");
    return text.Trim('-');
}
