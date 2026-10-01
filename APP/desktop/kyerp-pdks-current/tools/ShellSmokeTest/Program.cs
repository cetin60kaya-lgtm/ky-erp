using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
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

var menus = form.MainMenuStrip!.Items.Cast<ToolStripItem>()
    .Where(x => x.Alignment != ToolStripItemAlignment.Right)
    .Select(x => x.Text ?? string.Empty)
    .ToArray();
foreach (var required in new[] { "Genel", "Operasyon", "Personel", "Puantaj / Bordro", "Raporlar", "Yönetim", "Ayarlar", "Yardım" })
    if (!menus.Contains(required)) throw new InvalidOperationException("Ana menü eksik: " + required);

if (menus.Distinct(StringComparer.OrdinalIgnoreCase).Count() != menus.Length)
    throw new InvalidOperationException("Ana menüde mükerrer üst başlık var.");

var toolbar = form.Controls.OfType<ToolStrip>().First(x => x is not MenuStrip && x is not StatusStrip);
var toolNames = toolbar.Items.OfType<ToolStripButton>().Select(x => x.Text ?? string.Empty).ToArray();
foreach (var required in new[] { "Genel Bakış", "Canlı İzleme", "Terminal", "Giriş-Çıkış", "Personel", "Puantaj", "Bordro" })
    if (!toolNames.Contains(required)) throw new InvalidOperationException("Araç çubuğu eksik: " + required);

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
    string[] expected = ["Personel Bilgileri", "Giriş ve Çıkışları", "İzinler", "Ek Kazanç Ve Kesintiler", "Bilgi", "Ödemeler"];
    if (!tabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(expected))
        throw new InvalidOperationException("Personel sekmeleri bozulmuş.");
}

using (var attendance = new LegacyGirisCikisForm())
{
    var tabs = Descendants(attendance).OfType<TabControl>().First(x => x.TabPages.Cast<TabPage>().Any(p => p.Text == "Giriş / Çıkış Parametreleri"));
    if (!tabs.TabPages.Cast<TabPage>().Select(x => x.Text).SequenceEqual(["Giriş / Çıkış Parametreleri", "Filtreleme", "Sıralama"]))
        throw new InvalidOperationException("Giriş/Çıkış sekmeleri bozulmuş.");
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
Console.WriteLine("KYERP PDKS 6.4.0 SHELL SMOKE OK");

static IEnumerable<Control> Descendants(Control root)
{
    foreach (Control child in root.Controls)
    {
        yield return child;
        foreach (var nested in Descendants(child)) yield return nested;
    }
}
