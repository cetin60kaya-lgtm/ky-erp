using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
var user = new LocalUser
{
    UserName = "SMOKE",
    IsActive = true,
    IsAdmin = true,
    Permissions = Enum.GetNames<PdksModule>().ToList()
};

using var form = new MainShellForm(user);

string[] expectedMenus = ["Ayarlar","Tanımlar","İşlemler","Raporlar","Araçlar","Transfer","Hakkında"];
var actualMenus = form.MainMenuStrip!.Items.Cast<ToolStripItem>().Select(x => x.Text).ToArray();
if (!actualMenus.SequenceEqual(expectedMenus))
    throw new InvalidOperationException("Ana menü Hedef düzeninden sapmış: " + string.Join(" | ", actualMenus));

var toolbar = form.Controls.OfType<ToolStrip>().First(x => x is not MenuStrip && x is not StatusStrip);
string[] expectedTools = ["Bilgi Aktar","Gruplar","Dönemler","Bölümler","Giriş-Çıkışlar","Per. Bilgileri","Avanslar","Puantaj","Puantaj Son.","Bordro","Çalışma Tarihi","WC"];
var actualTools = toolbar.Items.Cast<ToolStripItem>().Where(x => x is ToolStripButton).Select(x => x.Text).ToArray();
if (!actualTools.SequenceEqual(expectedTools))
    throw new InvalidOperationException("Araç çubuğu Hedef düzeninden sapmış: " + string.Join(" | ", actualTools));
if (toolbar.Items.Cast<ToolStripItem>().Single(x => x.Text == "WC").Visible)
    throw new InvalidOperationException("Legacy WC araç öğesi görünür olmamalı.");

using (var groups = new LegacyGroupForm())
{
    if (groups.Size != new Size(543, 448) || groups.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Çalışma Grupları legacy geometrisinden sapmış.");
}

using (var definitions = new LegacyDefinitionsForm())
{
    var definitionTabs = definitions.Controls.OfType<TabControl>().Single();
    string[] expectedDefinitionTabs = ["Bölümler", "Servisler", "Durum", "Görevler", "Firma", "Bordro"];
    var actualDefinitionTabs = definitionTabs.TabPages.Cast<TabPage>().Select(x => x.Text).ToArray();
    if (definitions.Size != new Size(609, 450) || definitions.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Çalışma Sistemleri legacy geometrisinden sapmış.");
    if (!actualDefinitionTabs.SequenceEqual(expectedDefinitionTabs) || definitionTabs.SelectedTab?.Text != "Bordro")
        throw new InvalidOperationException("Çalışma Sistemleri tab düzeninden sapmış.");
}

    using (var periods = new LegacyPeriodForm())
    {
        if (periods.Size != new Size(738, 422) || periods.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Dönem Tanımlamaları legacy geometrisinden sapmış.");
    }

using (var personnel = new PersonelForm())
{
    var personnelTabs = Descendants(personnel).OfType<TabControl>().First(x => x.TabPages.Count == 6);
    string[] expectedPersonnelTabs = ["Personel Bilgileri", "Giriş ve Çıkışları", "İzinler", "Ek Kazanç Ve Kesintiler", "Bilgi", "Ödemeler"];
    var actualPersonnelTabs = personnelTabs.TabPages.Cast<TabPage>().Select(x => x.Text).ToArray();
    var labels = Descendants(personnel).OfType<Label>().Select(x => x.Text).ToHashSet();
    if (personnel.Size != new Size(940, 731) || personnel.FormBorderStyle != FormBorderStyle.FixedDialog)
        throw new InvalidOperationException("Personel Bilgileri legacy geometrisinden sapmış.");
    if (!actualPersonnelTabs.SequenceEqual(expectedPersonnelTabs))
        throw new InvalidOperationException("Personel Bilgileri üst tab düzeninden sapmış.");
    if (!labels.Contains("Saat Ücreti") || !labels.Contains("Banka Hesap No") || !labels.Contains("SGK İşe Giriş Tarihi"))
        throw new InvalidOperationException("Personel Bilgileri kişisel alanları eksik.");
}

using (var attendance = new LegacyGirisCikisForm())
{
    var attendanceTabs = attendance.Controls.OfType<TabControl>().Single();
    string[] expectedAttendanceTabs = ["Giriş Çıkış Paremetreleri", "Filtreleme", "Sıralama"];
    if (attendance.Size != new Size(777, 609) || attendance.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Giriş ve Çıkışlar legacy geometrisinden sapmış.");
    if (!attendanceTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedAttendanceTabs))
        throw new InvalidOperationException("Giriş ve Çıkışlar tab düzeninden sapmış.");
}

using (var advances = new LegacyAvansEntryForm())
{
    var advanceTabs = advances.Controls.OfType<TabControl>().Single();
    if (advances.Size != new Size(764, 508) || advances.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Ek Kesinti ve Kazanç Girişleri legacy geometrisinden sapmış.");
    if (advanceTabs.SelectedTab?.Text != "Seçili Kişi Girişi")
        throw new InvalidOperationException("Ek Kesinti ve Kazanç Girişleri varsayılan tabından sapmış.");
}

using (var timesheet = new LegacyPuantajForm())
{
    var timesheetTabs = timesheet.Controls.OfType<TabControl>().Single();
    string[] expectedTimesheetTabs = ["Günlük Puantaj", "Aylık Puantaj"];
    var buttons = Descendants(timesheet).OfType<Button>().Select(x => x.Text).ToArray();
    if (timesheet.Size != new Size(689, 504) || timesheet.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Günlük ve Aylık Puantaj legacy geometrisinden sapmış.");
    if (!timesheetTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedTimesheetTabs))
        throw new InvalidOperationException("Günlük ve Aylık Puantaj tab düzeninden sapmış.");
    if (buttons.Count(x => x == "&Hesapla") != 2 || !buttons.Contains("&Puantaj Sonuçları"))
        throw new InvalidOperationException("Günlük ve Aylık Puantaj mnemonic düzeninden sapmış.");
}

using (var payroll = new LegacyBordroForm())
{
    var payrollTabs = payroll.Controls.OfType<TabControl>().Single();
    string[] expectedPayrollTabs = ["Filitreler", "Rapor Seçenekleri", "Kağıt Ayarları"];
    var paper = payrollTabs.TabPages.Cast<TabPage>().Single(x => x.Text == "Kağıt Ayarları");
    var paperGroups = paper.Controls.OfType<GroupBox>().Select(x => x.Text).ToArray();
    var buttons = payroll.Controls.OfType<Button>().Select(x => x.Text).ToArray();
    if (payroll.Size != new Size(616, 496) || payroll.StartPosition != FormStartPosition.CenterScreen)
        throw new InvalidOperationException("Genel Maaş Bordrosu legacy geometrisinden sapmış.");
    if (!payrollTabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expectedPayrollTabs))
        throw new InvalidOperationException("Genel Maaş Bordrosu tab düzeninden sapmış.");
    if (!paperGroups.SequenceEqual(["Sayfa Ayarları", "Kağıt Ayarları", "Alan Genişlikleri"]) || Descendants(paper).OfType<TextBox>().Count(x => Equals(x.Tag, "FieldWidth")) != 10)
        throw new InvalidOperationException("Genel Maaş Bordrosu kağıt ayarlarından sapmış.");
    if (!buttons.Contains("A&ktar") || !buttons.Contains("Ö&nizleme") || !buttons.Contains("Kapa&t"))
        throw new InvalidOperationException("Genel Maaş Bordrosu komutlarından sapmış.");
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
