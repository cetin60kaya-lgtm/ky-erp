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
string[] expectedTools = ["Bilgi Aktar","Gruplar","Dönemler","Bölümler","Giriş-Çıkışlar","Per. Bilgileri","Avanslar","Puantaj","Puantaj Son.","Bordro","Çalışma Tarihi"];
var actualTools = toolbar.Items.Cast<ToolStripItem>().Where(x => x is ToolStripButton).Select(x => x.Text).ToArray();
if (!actualTools.SequenceEqual(expectedTools))
    throw new InvalidOperationException("Araç çubuğu Hedef düzeninden sapmış: " + string.Join(" | ", actualTools));

var timer = new System.Windows.Forms.Timer { Interval = 400 };
timer.Tick += (_, _) => { timer.Stop(); form.Close(); };
form.Shown += (_, _) => timer.Start();
Application.Run(form);
Console.WriteLine("KYERP PDKS LEGACY SHELL PARITY OK");
