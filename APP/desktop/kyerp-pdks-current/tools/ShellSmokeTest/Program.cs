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

var timer = new System.Windows.Forms.Timer { Interval = 400 };
timer.Tick += (_, _) => { timer.Stop(); form.Close(); };
form.Shown += (_, _) => timer.Start();
Application.Run(form);
Console.WriteLine("KYERP PDKS LEGACY SHELL PARITY OK");
