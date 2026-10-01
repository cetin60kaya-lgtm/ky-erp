using HKN.Personel.Native;

ApplicationConfiguration.Initialize();
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}
var admin = new LocalUser { UserName="ADMIN", IsActive=true, IsAdmin=true, IsCompanyResponsible=true, Permissions=Enum.GetNames<PdksModule>().ToList() };
using var form = new MainShellForm(admin);
form.Show();
Application.DoEvents();
var menu = form.MainMenuStrip!.Items.Cast<ToolStripItem>().Where(x=>x.Alignment!=ToolStripItemAlignment.Right).Select(x=>x.Text).ToArray();
var expected = new[]{"Genel","Operasyon","Personel","Puantaj / Bordro","Raporlar","Yönetim","Ayarlar","Yardım"};
if(!menu.SequenceEqual(expected)) throw new Exception("Menu mismatch: "+string.Join(" | ",menu));
var toolbar=form.Controls.OfType<ToolStrip>().First(x=>x is not MenuStrip && x is not StatusStrip);
var tools=toolbar.Items.OfType<ToolStripButton>().Select(x=>x.Text).ToArray();
var expectedTools=new[]{"Genel Bakış","Canlı İzleme","Terminal","Giriş-Çıkış","Personel","Puantaj","Bordro"};
if(!tools.SequenceEqual(expectedTools)) throw new Exception("Toolbar mismatch: "+string.Join(" | ",tools));
var viewer=new LocalUser{UserName="VIEW",IsActive=true,Permissions=[PdksModule.Personel.ToString()],ReadOnlyPermissions=[PdksModule.Personel.ToString()]};
if(!viewer.Can(PdksModule.Personel)||viewer.CanEdit(PdksModule.Personel)) throw new Exception("Read-only access failed");
using var users = new UserManagementFormV2();
Console.WriteLine("KYERP PDKS MODERN SHELL OK");