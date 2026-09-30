$ErrorActionPreference = 'Stop'
$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$main = Join-Path $tool 'MainForm.cs'
$tnf = Join-Path $tool 'TnfPrepareInjector.cs'
$sync = Join-Path $tool 'DbTnfSyncInjector.cs'
$program = Join-Path $tool 'Program.cs'

# Restore verified full base source.
git show a2a57332597e3fa5a6284f4c5209c33bf2368688:APP/desktop/kyerp-pdks-current/tools/QuickDataTool/MainForm.cs | Set-Content $main -Encoding UTF8

# MAIN: remove minute-capacity rejection and distribute inside the selected interval, allowing repeats when needed.
$m = Get-Content $main -Raw
$m = [regex]::Replace($m, '(?ms)^\s*if \(inB - inA \+ 1 < cards\.Count \|\| outB - outA \+ 1 < cards\.Count\)\s*throw new InvalidOperationException\([^;]+;\s*', '')
$m = $m.Replace('var ins = ShuffledMinutes(inA, inB, day, 17); var outs = ShuffledMinutes(outA, outB, day, 71);', 'var ins = DistributedMinutes(inA, inB, cards.Count, day, 17); var outs = DistributedMinutes(outA, outB, cards.Count, day, 71);')
$oldMain = @'
    static List<int> ShuffledMinutes(int min, int max, DateTime day, int salt)
    {
        var list = Enumerable.Range(min, max - min + 1).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt));
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }
'@
$newMain = @'
    static List<int> DistributedMinutes(int min, int max, int count, DateTime day, int salt)
    {
        if (max < min) throw new InvalidOperationException("Saat aralığı hatalı.");
        var span = max - min + 1;
        var list = Enumerable.Range(0, count).Select(i => min + (i % span)).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt, count));
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }
'@
if (-not $m.Contains($oldMain)) { throw 'MainForm ShuffledMinutes block not found.' }
$m = $m.Replace($oldMain, $newMain)
Set-Content $main $m -Encoding UTF8 -NoNewline

# TNF PREPARE: same interval behavior, no startup BeginInvoke crash.
$t = Get-Content $tnf -Raw
$t = $t.Replace('        BeginInvoke(new Action(RefreshPeople));','        Load += (_, _) => RefreshPeople();')
$t = [regex]::Replace($t, '(?ms)^\s*if \(ib - ia \+ 1 < cards\.Count \|\| ob - oa \+ 1 < cards\.Count\)\s*throw new InvalidOperationException\([^;]+;\s*', '')
$t = $t.Replace('var ins = ShuffledMinutes(ia, ib, day, 17); var outs = ShuffledMinutes(oa, ob, day, 71);', 'var ins = DistributedMinutes(ia, ib, cards.Count, day, 17); var outs = DistributedMinutes(oa, ob, cards.Count, day, 71);')
$oldTnf = @'
    static List<int> ShuffledMinutes(int min, int max, DateTime day, int salt)
    {
        var list = Enumerable.Range(min, max - min + 1).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt));
        for (var i = list.Count - 1; i > 0; i--) { var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]); }
        return list;
    }
'@
$newTnf = @'
    static List<int> DistributedMinutes(int min, int max, int count, DateTime day, int salt)
    {
        if (max < min) throw new InvalidOperationException("Saat aralığı hatalı.");
        var span = max - min + 1;
        var list = Enumerable.Range(0, count).Select(i => min + (i % span)).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt, count));
        for (var i = list.Count - 1; i > 0; i--) { var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]); }
        return list;
    }
'@
if (-not $t.Contains($oldTnf)) { throw 'TnfPrepare ShuffledMinutes block not found.' }
$t = $t.Replace($oldTnf, $newTnf)

# Format settings live under LocalAppData so the distributed package itself is one EXE.
$t = $t.Replace('readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");', 'readonly string settingsPath = SettingsFile();')
$settingsMarker = '    FormatSettings settings = new();'
$settingsHelper = @'
    FormatSettings settings = new();

    static string SettingsFile()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "TNF_FORMAT_AYAR.json");
    }
'@
if (-not $t.Contains($settingsMarker)) { throw 'TNF settings marker not found.' }
$t = $t.Replace($settingsMarker, $settingsHelper)
Set-Content $tnf $t -Encoding UTF8 -NoNewline

# Sync uses same format settings path.
$s = Get-Content $sync -Raw
$s = $s.Replace('readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");', 'readonly string settingsPath = SettingsFile();')
$ctorMarker = '    public DbTnfSyncControl(Form mainForm)'
$ctorHelper = @'
    static string SettingsFile()
    {
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "TNF_FORMAT_AYAR.json");
    }

    public DbTnfSyncControl(Form mainForm)
'@
if (-not $s.Contains($ctorMarker)) { throw 'Sync constructor marker not found.' }
$s = $s.Replace($ctorMarker, $ctorHelper)
Set-Content $sync $s -Encoding UTF8 -NoNewline

# Password gate. The clear-text password is never stored in source; only PBKDF2 salt+hash.
$gate = @'
using System.Security.Cryptography;
using System.Text;

namespace QuickDataTool;

internal sealed class PasswordGateForm : Form
{
    readonly TextBox password = new() { UseSystemPasswordChar = true, Width = 250 };
    readonly Label info = new() { AutoSize = true, ForeColor = Color.DimGray };
    int attempts;

    static readonly byte[] Salt = Convert.FromBase64String("a06dmpu1kojiATXZLw2rpA==");
    static readonly byte[] Expected = Convert.FromBase64String("aKQ32UI5MPJb/q5Bym5r9vLORk1AIV35UeEl1/A/9II=");

    internal PasswordGateForm()
    {
        Text = "HKN PDKS - Giriş";
        Width = 390; Height = 205;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false;
        Font = new Font("Segoe UI", 10f);

        var title = new Label { Text = "HKN PDKS", AutoSize = true, Font = new Font("Segoe UI", 15f, FontStyle.Bold) };
        var label = new Label { Text = "Şifre", AutoSize = true, Padding = new Padding(0,7,6,0) };
        var ok = new Button { Text = "GİRİŞ", Width = 110, Height = 34 };
        var cancel = new Button { Text = "KAPAT", Width = 90, Height = 34, DialogResult = DialogResult.Cancel };
        ok.Click += (_, _) => CheckPassword();

        var root = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(28,20,20,15) };
        root.Controls.Add(title);
        var row = new FlowLayoutPanel { Width = 325, Height = 38, WrapContents = false };
        row.Controls.Add(label); row.Controls.Add(password); root.Controls.Add(row);
        info.Text = "Yetkili kullanıcı girişi"; root.Controls.Add(info);
        var buttons = new FlowLayoutPanel { Width = 325, Height = 42, FlowDirection = FlowDirection.RightToLeft };
        buttons.Controls.Add(cancel); buttons.Controls.Add(ok); root.Controls.Add(buttons);
        Controls.Add(root);
        AcceptButton = ok; CancelButton = cancel;
        Shown += (_, _) => password.Focus();
    }

    void CheckPassword()
    {
        var actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password.Text), Salt, 210000, HashAlgorithmName.SHA256, 32);
        if (CryptographicOperations.FixedTimeEquals(actual, Expected))
        {
            DialogResult = DialogResult.OK;
            Close();
            return;
        }
        attempts++;
        password.Clear();
        if (attempts >= 5)
        {
            MessageBox.Show("Çok fazla hatalı deneme. Uygulama kapatılacak.", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            DialogResult = DialogResult.Cancel;
            Close();
            return;
        }
        info.Text = $"Şifre hatalı. Kalan deneme: {5 - attempts}";
        info.ForeColor = Color.DarkRed;
        password.Focus();
    }
}
'@
$gate | Set-Content (Join-Path $tool 'PasswordGateForm.cs') -Encoding UTF8

# Crash guard.
$guard = @'
using System.Text;
namespace QuickDataTool;
internal static class CrashGuard
{
    internal static void Install()
    {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_, e) => Log(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => { if (e.ExceptionObject is Exception ex) Log(ex); };
    }
    static void Log(Exception ex)
    {
        try
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "QUICKDATA_HATA.log");
            File.AppendAllText(path, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {ex}\r\n\r\n", Encoding.UTF8);
            MessageBox.Show("Bir işlem hatası yakalandı.\n\n" + ex.Message + "\n\nKayıt: " + path, "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch { }
    }
}
'@
$guard | Set-Content (Join-Path $tool 'CrashGuard.cs') -Encoding UTF8

# Program startup: crash guard first, password gate second, main application last.
$p = Get-Content $program -Raw
$p = $p.Replace('        ApplicationConfiguration.Initialize();', '        ApplicationConfiguration.Initialize();' + "`r`n" + '        CrashGuard.Install();')
$p = $p.Replace('        Application.Run(new MainForm());', @'
        using (var gate = new PasswordGateForm())
        {
            if (gate.ShowDialog() != DialogResult.OK) return;
        }
        Application.Run(new MainForm());
'@.TrimEnd())
if (-not $p.Contains('PasswordGateForm') -or -not $p.Contains('CrashGuard.Install();')) { throw 'Program startup patch failed.' }
Set-Content $program $p -Encoding UTF8 -NoNewline

# Hard source audit.
$allMain = Get-Content $main -Raw
$allTnf = Get-Content $tnf -Raw
$allSync = Get-Content $sync -Raw
foreach($tok in @('DistributedMinutes','ApplyBulk','ApplyBulkE','BuildEHistory','EditPayrollSelected','EditSelectedPayment','EditSelectedAdvance')) { if(-not $allMain.Contains($tok)){ throw "Main feature missing: $tok" } }
foreach($tok in @('DistributedMinutes','YENİ TXT OLUŞTUR','Terminal Format Ayarı')) { if(-not $allTnf.Contains($tok)){ throw "TNF feature missing: $tok" } }
foreach($tok in @('TNF SİL FAZLA','TNF SİL E','TNF DÜZELT','TNF EKLE','_YEDEK','ÇOKLU / İNCELE')) { if(-not $allSync.Contains($tok)){ throw "Sync feature missing: $tok" } }
Write-Host 'REV8 source patch audit OK.'
