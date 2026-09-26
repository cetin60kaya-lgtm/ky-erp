using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}
var user = new LocalUser
{
    UserName = "SMOKE",
    IsActive = true,
    IsAdmin = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var form = new MainShellForm(user);

string[] expectedMenus = ["Genel Bakış","Operasyon","İnsan Kaynakları","Puantaj ve Bordro","Yapılandırma","Raporlama ve Denetim","Sistem Yönetimi","Çalışma Alanı","Destek ve Bilgi"];
var actualMenus = form.MainMenuStrip!.Items.Cast<ToolStripItem>().Where(x => x.Alignment != ToolStripItemAlignment.Right).Select(x => x.Text).ToArray();
if (!actualMenus.SequenceEqual(expectedMenus))
    throw new InvalidOperationException("Ana menü web PDKS düzeninden sapmış: " + string.Join(" | ", actualMenus));

var toolbar = form.Controls.OfType<ToolStrip>().First(x => x is not MenuStrip && x is not StatusStrip);
string[] expectedTools = ["Genel Bakış","Canlı İzleme","Terminal","Giriş-Çıkış","Personel","Puantaj","Sonuçlar","Bordro","Çalışma Tarihi"];
var actualTools = toolbar.Items.Cast<ToolStripItem>().Where(x => x is ToolStripButton).Select(x => x.Text).ToArray();
if (!actualTools.SequenceEqual(expectedTools))
    throw new InvalidOperationException("Araç çubuğu web PDKS düzeninden sapmış: " + string.Join(" | ", actualTools));

using (var groups = new LegacyGroupForm())
{
}

using (var definitions = new LegacyDefinitionsForm())
{
    var definitionTabs = definitions.Controls.OfType<TabControl>().Single();
    string[] expectedDefinitionTabs = ["Bölümler", "Servisler", "Durum", "Görevler", "Firma", "Bordro"];
    var actualDefinitionTabs = definitionTabs.TabPages.Cast<TabPage>().Select(x => x.Text).ToArray();
    if (!actualDefinitionTabs.SequenceEqual(expectedDefinitionTabs) || definitionTabs.SelectedTab?.Text != "Bordro")
        throw new InvalidOperationException("Çalışma Sistemleri tab düzeninden sapmış.");
}

    using (var periods = new LegacyPeriodForm())
    {
    }

using (var personnel = new PersonelForm())
{
    var personnelTabs = Descendants(personnel).OfType<TabControl>().First(x => x.TabPages.Count == 6);
    string[] expectedPersonnelTabs = ["Personel Bilgileri", "Giriş ve Çıkışları", "İzinler", "Ek Kazanç Ve Kesintiler", "Bilgi", "Ödemeler"];
    var actualPersonnelTabs = personnelTabs.TabPages.Cast<TabPage>().Select(x => x.Text).ToArray();
    var labels = Descendants(personnel).OfType<Label>().Select(x => x.Text).ToHashSet();
    if (!actualPersonnelTabs.SequenceEqual(expectedPersonnelTabs))
        throw new InvalidOperationException("Personel Bilgileri üst tab düzeninden sapmış.");
    using var terminalTransfer = personnel.CreateTerminalTransferDialog();
    var transferButtons = Descendants(terminalTransfer).OfType<Button>().Select(x => x.Text).ToArray();
    var transferTolerance = Descendants(terminalTransfer).OfType<TextBox>().Single(x => x.Name == "TransferTolerance");
    var transferLog = Descendants(terminalTransfer).OfType<TextBox>().Single(x => x.Name == "TransferLog");
    if (transferTolerance.Text != "5" || !transferButtons.SequenceEqual(["Cihaz Okut", "&Aktar"]))
        throw new InvalidOperationException("Terminal Veri Transferi kontrol düzeninden sapmış.");
}

using (var attendance = new LegacyGirisCikisForm())
{
    var attendanceTabs = Descendants(attendance).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Giriş / Çıkış Parametreleri"));
    string[] expectedAttendanceTabs = ["Giriş / Çıkış Parametreleri", "Filtreleme", "Sıralama"];
    if (!attendanceTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedAttendanceTabs))
        throw new InvalidOperationException("Giriş ve Çıkışlar tab düzeninden sapmış.");
}

using (var advances = new LegacyAvansEntryForm())
{
    var advanceTabs = Descendants(advances).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Seçili Kişi Girişi"));
    if (advanceTabs.SelectedTab?.Text != "Seçili Kişi Girişi")
        throw new InvalidOperationException("Ek Kesinti ve Kazanç Girişleri varsayılan tabından sapmış.");
}

using (var timesheet = new LegacyPuantajForm())
{
    var timesheetTabs = Descendants(timesheet).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Günlük Puantaj"));
    string[] expectedTimesheetTabs = ["Günlük Puantaj", "Aylık Puantaj"];
    var buttons = Descendants(timesheet).OfType<Button>().Select(x => x.Text).ToArray();
    if (!timesheetTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedTimesheetTabs))
        throw new InvalidOperationException("Günlük ve Aylık Puantaj tab düzeninden sapmış.");
    if (!buttons.Contains("Hesapla") || !buttons.Contains("Puantaj Sonuçları") || !buttons.Any(x => x.Contains("Aylık Puantaj", StringComparison.OrdinalIgnoreCase)))
        throw new InvalidOperationException("Günlük ve Aylık Puantaj mnemonic düzeninden sapmış.");
}

using (var payroll = new LegacyBordroForm())
{
    var payrollTabs = Descendants(payroll).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Filtreler"));
    string[] expectedPayrollTabs = ["Filtreler", "Gelişmiş"];
    var buttons = Descendants(payroll).OfType<Button>().Select(x => x.Text).ToArray();
    if (!payrollTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedPayrollTabs))
        throw new InvalidOperationException("Genel Maaş Bordrosu tab düzeninden sapmış.");
    if (!buttons.Any(x => x.Contains("Hesapla", StringComparison.OrdinalIgnoreCase)) || !buttons.Any(x => x.EndsWith("nizle", StringComparison.OrdinalIgnoreCase)) || !buttons.Any(x => x.StartsWith("Yaz", StringComparison.OrdinalIgnoreCase)) || !buttons.Contains("PDF Aktar") || !buttons.Contains("Excel Aktar"))
        throw new InvalidOperationException("Genel Maaş Bordrosu modern komutlarından sapmış.");
}
var reportKinds = Enum.GetValues<LegacyOperationalReport>();
var reportTitles = reportKinds.Select(LegacyOperationalReportForm.Title).ToArray();
if (reportTitles.Distinct().Count() != 5)
    throw new InvalidOperationException("Operasyon raporları ayrı komutlara eşlenmemiş.");
foreach (var reportKind in reportKinds)
{
    using var report = new LegacyOperationalReportForm(reportKind);
    if (report.Report != reportKind || report.Text != LegacyOperationalReportForm.Title(reportKind))
        throw new InvalidOperationException("Operasyon raporu tür/başlık eşlemesi hatalı.");
    var commands = Descendants(report).OfType<Button>().Select(x => x.Text).ToArray();
    if (!commands.Contains("Göster") || !commands.Contains("Önizle") || !commands.Contains("PDF Aktar") || !commands.Contains("Excel Aktar"))
        throw new InvalidOperationException("Operasyon raporu komutları eksik.");
}

var timer = new System.Windows.Forms.Timer { Interval = 400 };
timer.Tick += (_, _) => { timer.Stop(); form.Close(); };
form.Shown += (_, _) => timer.Start();
Application.Run(form);
Console.WriteLine("KYERP PDKS LEGACY SHELL PARITY OK");

static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var descendant in Descendants(child)) yield return descendant;
    }
}
