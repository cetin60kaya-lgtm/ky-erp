using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KYERP_PDKS_ROOT", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}

PdksTheme.Install();
Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1", EnvironmentVariableTarget.Process);

var expectedPrimary = new[] { "Genel Bakış", "Operasyon", "Personel", "Puantaj", "Bordro", "Raporlar" };
var catalogPrimary = PdksCommandCatalog.Primary.Select(x => x.Title).ToArray();
if (!catalogPrimary.SequenceEqual(expectedPrimary))
    throw new Exception("Primary catalog mismatch: " + string.Join(" | ", catalogPrimary));

var admin = new LocalUser
{
    UserName = "ADMIN",
    IsActive = true,
    IsAdmin = true,
    IsCompanyResponsible = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var form = new MainShellForm(admin);
form.Show();
Pump(700);

var visibleButtons = FindControls<Button>(form)
    .Where(x => x.Visible)
    .Select(x => Clean(x.Text))
    .Where(x => x.Length > 0)
    .ToHashSet(StringComparer.OrdinalIgnoreCase);

foreach (var title in expectedPrimary)
    if (!visibleButtons.Contains(title))
        throw new Exception("Primary navigation button missing: " + title);

var forbiddenPrimary = new[] { "Terminal Merkezi", "Terminal Ayarları", "FDB / TNF Veri Kaynakları", "Yedekleme / Geri Yükleme", "Lisans" };
if (PdksCommandCatalog.Primary.Any(x => forbiddenPrimary.Contains(x.Title, StringComparer.OrdinalIgnoreCase)))
    throw new Exception("Technical command leaked into primary navigation.");

var viewer = new LocalUser
{
    UserName = "VIEW",
    IsActive = true,
    Permissions = [PdksModule.Personel.ToString()],
    ReadOnlyPermissions = [PdksModule.Personel.ToString()]
};
if (!viewer.Can(PdksModule.Personel) || viewer.CanEdit(PdksModule.Personel))
    throw new Exception("Read-only access failed.");

form.NavigateToCommand(PdksCommandId.Home);
Pump(250);
form.NavigateToCommand(PdksCommandId.Operations);
Pump(350);

var shellType = typeof(MainShellForm);
var showManagement = shellType.GetMethod("ShowManagementCenter", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
    ?? throw new Exception("Management navigation method missing.");
showManagement.Invoke(form, null);
Pump(350);
var activeNav = shellType.GetField("activeNavButton", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)?.GetValue(form);
var manageButton = shellType.GetField("modernManageButton", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)?.GetValue(form) as Button
    ?? throw new Exception("Management navigation button missing.");
if (activeNav is not null)
    throw new Exception("Primary navigation remained selected while Management Center is active.");
if (manageButton.BackColor != PdksAppearance.Current.SidebarHover)
    throw new Exception("Management navigation active state was not applied.");

Console.WriteLine("KYERP PDKS 6.4.0 MODERN SHELL OK");
form.Close();

static IEnumerable<T> FindControls<T>(Control root) where T : Control
{
    foreach (Control child in root.Controls)
    {
        if (child is T match) yield return match;
        foreach (var nested in FindControls<T>(child)) yield return nested;
    }
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
