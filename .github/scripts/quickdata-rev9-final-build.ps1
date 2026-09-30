$ErrorActionPreference = 'Stop'

# Start from the audited REV8 source (single EXE, app password gate, flexible minute distribution).
& "$PSScriptRoot/quickdata-rev8-build.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$main = Join-Path $tool 'MainForm.cs'
$m = Get-Content $main -Raw

# 1) Startup must not auto-select or auto-connect any DB/TNF.
$m2 = $m.Replace('        Shown += (_, _) => { DetectSources(); Connect(); };', '        Shown += (_, _) => UpdateSourceStatus();')
if ($m2 -eq $m) { throw 'Startup automatic detect/connect marker not found.' }
$m = $m2

# 2) Make source selection explicit and remove the automatic discovery button.
$m = $m.Replace('new Label { Text = "Hedef GDB", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }', 'new Label { Text = "Firebird Veritabanı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }')
$m = $m.Replace('box.Controls.Add(Btn("Otomatik Tanı", DetectSources), 3, 0);', 'box.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 0);')
$m = $m.Replace('box.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 1);', '')

# 3) DB chooser: any Firebird GDB/FDB (or manually selected file), then immediately try to connect.
$pickPattern = '(?ms)^    void PickDb\(\)\s*\{.*?^    \}\s*\r?\n\s*    void PickTnf\(\)'
$pickReplacement = @'
    void PickDb()
    {
        using var d = new OpenFileDialog
        {
            Filter = "Firebird veritabanı (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar (*.*)|*.*",
            FileName = dbPath.Text,
            CheckFileExists = true,
            Title = "Firebird veritabanını seçin"
        };
        if (d.ShowDialog(this) != DialogResult.OK) return;
        dbPath.Text = d.FileName;
        UpdateSourceStatus();
        Connect();
    }

    void PickTnf()
'@
$m2 = [regex]::Replace($m, $pickPattern, $pickReplacement)
if ($m2 -eq $m) { throw 'PickDb regex replacement failed.' }
$m = $m2

# 4) Connection: helper tries SYSDBA/masterkey first. Only if rejected does it ask for credentials.
$connectPattern = '(?ms)^    void Connect\(\)\s*\{.*?^    \}\s*\r?\n\s*    void LoadPeople\(\)'
$connectReplacement = @'
    void Connect()
    {
        if (string.IsNullOrWhiteSpace(dbPath.Text) || !File.Exists(dbPath.Text))
        {
            db = null;
            sourceStatus.Text = "Önce Veritabanı Seç ile .GDB/.FDB dosyasını seçin.";
            sourceStatus.ForeColor = Color.DarkRed;
            return;
        }

        if (!DbConnectionHelper.TryOpen(this, dbPath.Text.Trim(), out var openedDb, out var openedOptions, out var user, out var error))
        {
            db = null;
            sourceStatus.Text = "Bağlantı yok: " + error;
            sourceStatus.ForeColor = Color.DarkRed;
            return;
        }

        db = openedDb;
        options = openedOptions;
        sourceStatus.Text = $"Bağlandı: {dbPath.Text}   |   Kullanıcı: {user}";
        sourceStatus.ForeColor = Color.DarkGreen;
        LoadPeople(); LoadIo(); LoadPayroll(); LoadPayments(); LoadAdvances(); RebuildDays(); RebuildEDays(); LoadAudit();
    }

    void LoadPeople()
'@
$m2 = [regex]::Replace($m, $connectPattern, $connectReplacement)
if ($m2 -eq $m) { throw 'Connect regex replacement failed.' }
$m = $m2

# 5) Generic status wording.
$m = $m.Replace('sourceStatus.Text = $"GDB: {(g ? "HAZIR" : "YOK")}   |   TNF: {(t ? "HAZIR" : "YOK")}";', 'sourceStatus.Text = $"DB: {(g ? "SEÇİLDİ" : "SEÇİLMEDİ")}   |   TNF: {(t ? "SEÇİLDİ" : "SEÇİLMEDİ")}";')

Set-Content $main $m -Encoding UTF8 -NoNewline

# 6) Firebird connection helper. Password is session-memory only; nothing is saved to disk.
$helper = @'
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class DbConnectionHelper
{
    static readonly Dictionary<string, (string User, string Password)> SessionCredentials = new(StringComparer.OrdinalIgnoreCase);

    internal static bool TryOpen(IWin32Window owner, string databasePath,
        out FirebirdDatabase? database, out PdksOptions? options, out string user, out string error)
    {
        database = null;
        options = null;
        user = "SYSDBA";
        error = "";

        var creds = SessionCredentials.TryGetValue(databasePath, out var saved)
            ? saved
            : (User: "SYSDBA", Password: "masterkey");

        if (TryCredentials(databasePath, creds.User, creds.Password, out database, out options, out error))
        {
            user = creds.User;
            SessionCredentials[databasePath] = creds;
            return true;
        }

        if (!Prompt(owner, creds.User, out var enteredUser, out var enteredPassword))
        {
            error = "Bağlantı iptal edildi.";
            return false;
        }

        if (!TryCredentials(databasePath, enteredUser, enteredPassword, out database, out options, out error))
        {
            MessageBox.Show("Veritabanına bağlanılamadı.\n\n" + error,
                "Firebird Bağlantısı", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }

        user = enteredUser;
        SessionCredentials[databasePath] = (enteredUser, enteredPassword);
        return true;
    }

    static bool TryCredentials(string path, string user, string password,
        out FirebirdDatabase? database, out PdksOptions? options, out string error)
    {
        database = null;
        options = null;
        error = "";
        try
        {
            var baseOptions = PdksOptions.FromEnvironment();
            var candidateOptions = baseOptions with
            {
                DatabasePath = path,
                DatabaseUser = string.IsNullOrWhiteSpace(user) ? "SYSDBA" : user.Trim(),
                DatabasePassword = password ?? string.Empty
            };
            var candidate = new FirebirdDatabase(candidateOptions);
            using var c = candidate.OpenConnection();
            database = candidate;
            options = candidateOptions;
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    static bool Prompt(IWin32Window owner, string defaultUser, out string user, out string password)
    {
        using var f = new Form
        {
            Text = "Firebird Veritabanı Girişi",
            Width = 440,
            Height = 245,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            Font = new Font("Segoe UI", 9.5f)
        };
        var userBox = new TextBox { Width = 260, Text = string.IsNullOrWhiteSpace(defaultUser) ? "SYSDBA" : defaultUser };
        var passBox = new TextBox { Width = 260, UseSystemPasswordChar = true };
        var note = new Label
        {
            Text = "Varsayılan SYSDBA / masterkey kabul edilmedi. Bu veritabanının kullanıcı ve şifresini girin.",
            AutoSize = true,
            MaximumSize = new Size(370, 0),
            ForeColor = Color.DimGray
        };
        var ok = new Button { Text = "BAĞLAN", Width = 105, Height = 32, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "VAZGEÇ", Width = 95, Height = 32, DialogResult = DialogResult.Cancel };

        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 4, Padding = new Padding(18) };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        grid.Controls.Add(new Label { Text = "Kullanıcı", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, 0, 0);
        grid.Controls.Add(userBox, 1, 0);
        grid.Controls.Add(new Label { Text = "Şifre", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, 0, 1);
        grid.Controls.Add(passBox, 1, 1);
        grid.Controls.Add(note, 0, 2); grid.SetColumnSpan(note, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        buttons.Controls.Add(cancel); buttons.Controls.Add(ok);
        grid.Controls.Add(buttons, 0, 3); grid.SetColumnSpan(buttons, 2);
        f.Controls.Add(grid);
        f.AcceptButton = ok;
        f.CancelButton = cancel;
        f.Shown += (_, _) => passBox.Focus();

        if (f.ShowDialog(owner) != DialogResult.OK)
        {
            user = "";
            password = "";
            return false;
        }

        user = string.IsNullOrWhiteSpace(userBox.Text) ? "SYSDBA" : userBox.Text.Trim();
        password = passBox.Text;
        return true;
    }
}
'@
$helper | Set-Content (Join-Path $tool 'DbConnectionHelper.cs') -Encoding UTF8

# 7) Hard audit.
$check = Get-Content $main -Raw
foreach ($token in @(
    'Shown += (_, _) => UpdateSourceStatus();',
    'Firebird veritabanı (*.gdb;*.fdb)',
    'DbConnectionHelper.TryOpen',
    'TNF Seç',
    'DistributedMinutes'))
{
    if (-not $check.Contains($token)) { throw "REV9 audit token missing: $token" }
}
if ($check.Contains('Shown += (_, _) => { DetectSources(); Connect(); };')) { throw 'Automatic startup connection still exists.' }
$h = Get-Content (Join-Path $tool 'DbConnectionHelper.cs') -Raw
foreach ($token in @('Password: "masterkey"','SessionCredentials','DatabasePassword = password','Varsayılan SYSDBA / masterkey'))
{
    if (-not $h.Contains($token)) { throw "REV9 helper token missing: $token" }
}

Write-Host 'REV9 FINAL: manual DB/TNF selection, default masterkey fallback, single-EXE source audit OK.'
