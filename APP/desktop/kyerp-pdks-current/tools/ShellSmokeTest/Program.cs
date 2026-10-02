using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}

var user = new LocalUser
{
    UserName = "ADMIN",
    IsActive = true,
    IsAdmin = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var form = new MainShellForm(user)
{
    StartPosition = FormStartPosition.Manual,
    Location = new Point(20, 20),
    Size = new Size(1500, 900)
};
form.Show();
Application.DoEvents();
Thread.Sleep(250);
Application.DoEvents();

var primary = PdksCommandCatalog.Primary.ToArray();
var expectedPrimary = new[] { "Genel Bakış", "Canlı Denetim", "Giriş / Çıkış", "Personel", "Puantaj", "Bordro", "Raporlar", "Tanımlar", "Terminal" };
if (!primary.Select(x=>x.Title).SequenceEqual(expectedPrimary))
    throw new InvalidOperationException("Modern ana navigasyon sırası bozulmuş.");

if (PdksCommandCatalog.All.Select(x=>x.Id).Distinct().Count() != PdksCommandCatalog.All.Count)
    throw new InvalidOperationException("Komut kataloğunda mükerrer komut var.");

var workflow = PdksWorkflowCatalog.All.OrderBy(x=>x.Order).ToArray();
var expectedWorkflow = new[]
{
    PdksCommandId.TerminalCenter,
    PdksCommandId.EntryExit,
    PdksCommandId.Personnel,
    PdksCommandId.TimesheetMonthly,
    PdksCommandId.PayrollGeneral,
    PdksCommandId.Reports
};
if (!workflow.Select(x=>x.Command).SequenceEqual(expectedWorkflow))
    throw new InvalidOperationException("Standart işlem sırası bozulmuş.");
if (workflow.Select(x=>x.Order).Distinct().Count() != workflow.Length)
    throw new InvalidOperationException("İş akışında mükerrer sıra var.");

var shellButtons = Descendants(form).OfType<Button>().Select(x => x.Text ?? string.Empty).ToArray();
foreach (var required in expectedPrimary)
    if (!shellButtons.Contains(required)) throw new InvalidOperationException("Modern navigasyon eksik: " + required);
foreach (var required in new[] { "Yönetim", $"Tema • {PdksAppearance.ModeLabel}", "İşlem Ara  Ctrl+K" })
    if (!shellButtons.Contains(required)) throw new InvalidOperationException("Kabuk komutu eksik: " + required);

if (form.MainMenuStrip is null || form.MainMenuStrip.Visible)
    throw new InvalidOperationException("Eski menü görünür olmamalı.");

if (form.Controls.OfType<ToolStrip>().Any(x => x is not MenuStrip && x.Visible))
    throw new InvalidOperationException("Eski araç çubuğu artık kabukta bulunmamalı.");

var palette = PdksAppearance.Current;
if (palette.Primary == palette.Canvas)
    throw new InvalidOperationException("Tema vurgu rengi tuval renginden ayrı olmalı.");

using (var settings = new LegacyTerminalSettingsForm())
{
    var columns = Descendants(settings).OfType<DataGridView>().First().Columns.Cast<DataGridViewColumn>().Select(x => x.HeaderText).ToArray();
    foreach (var required in new[] { "CihazNo", "CihazAdı", "MakineNo", "BağlantıTipi", "IP Adres", "IP Port", "Giriş/Çıkış", "İşlem Durumu" })
        if (!columns.Contains(required)) throw new InvalidOperationException("Terminal ayar kolonu eksik: " + required);

    var buttons = Descendants(settings).OfType<Button>().Select(x => (x.Text ?? string.Empty).Replace("&", string.Empty)).ToArray();
    foreach (var required in new[] { "EKLE", "ÇIKART", "DÜZENLE", "KAYDET", "BAĞLAN TEST", "CİHAZ TARİH/SAAT OKU", "PC SAATİNE AYARLA", "CİHAZDAN OKU", "KAYITLARI AKTAR", "SÜRÜCÜYÜ ONAR", "ÇIKIŞ" })
        if (!buttons.Contains(required)) throw new InvalidOperationException("Terminal ayar komutu eksik: " + required);
}

using (var personnel = new PersonelForm())
{
    var tabs = Descendants(personnel).OfType<TabControl>().First(x => x.TabPages.Count == 6);
    string[] expected = ["Personel Bilgileri", "Giriş / Çıkış", "İzinler", "Kazanç / Kesinti", "Puantaj Bilgisi", "Ödemeler"];
    if (!tabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expected))
        throw new InvalidOperationException("Personel sekmeleri bozulmuş.");
    var inner = Descendants(tabs.TabPages[0]).OfType<TabControl>().First();
    string[] innerExpected = ["Temel Bilgiler", "Kimlik", "İletişim / Kişisel", "Ehliyet / Belgeler", "İş / SGK", "Ek Ödemeler"];
    if (!inner.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(innerExpected))
        throw new InvalidOperationException("Personel bilgi iç sekmeleri bozulmuş.");
}

using (var attendance = new LegacyGirisCikisForm())
{
    var buttons = Descendants(attendance).OfType<Button>().Select(x => x.Text ?? string.Empty).ToArray();
    foreach (var required in new[] { "Göster", "Yeni Kayıt", "Düzenle", "Rapor" })
        if (!buttons.Contains(required)) throw new InvalidOperationException("Giriş/Çıkış komutu eksik: " + required);
    if (!Descendants(attendance).OfType<DataGridView>().Any())
        throw new InvalidOperationException("Giriş/Çıkış listesi yok.");
}

using (var timesheet = new LegacyPuantajForm())
{
    var tabs = Descendants(timesheet).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Günlük Puantaj"));
    if (!tabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(["Günlük Puantaj", "Aylık Puantaj"]))
        throw new InvalidOperationException("Puantaj sekmeleri bozulmuş.");
}

using (var payroll = new LegacyBordroForm())
{
    var buttons = Descendants(payroll).OfType<Button>().Select(x => x.Text ?? string.Empty).ToArray();
    foreach (var required in new[] { "Göster", "Alanlar / Sıralama", "Düzeni Kilitle", "Önizle", "Yazdır", "PDF Aktar", "Excel Aktar" })
        if (!buttons.Contains(required)) throw new InvalidOperationException("Bordro komutu eksik: " + required);
}

form.Close();
Application.DoEvents();
using (var reportCenter = new ReportCenterForm())
{
    var type = typeof(ReportCenterForm);
    var method = type.GetMethod("Query", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("ReportCenter Query bulunamadı.");
    var reportField = type.GetField("report", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
        ?? throw new InvalidOperationException("ReportCenter rapor listesi bulunamadı.");
    var combo = reportField.GetValue(reportCenter) as ComboBox
        ?? throw new InvalidOperationException("ReportCenter rapor listesi okunamadı.");

    foreach (var reportName in combo.Items.Cast<object>().Select(x => Convert.ToString(x) ?? string.Empty).Where(x => x.Length > 0))
    {
        try
        {
            _ = method.Invoke(reportCenter, new object?[] { reportName });
        }
        catch (System.Reflection.TargetInvocationException ex)
        {
            throw new InvalidOperationException("Rapor sorgusu başarısız: " + reportName + " -> " + (ex.InnerException?.Message ?? ex.Message), ex.InnerException ?? ex);
        }
    }
}

Console.WriteLine("KYERP PDKS 6.4.0 SHELL SMOKE OK");

static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var nested in Descendants(child)) yield return nested;
    }
}
