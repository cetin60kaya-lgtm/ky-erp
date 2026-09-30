$ErrorActionPreference = 'Stop'

# Start from the audited REV8 single-EXE source patch.
& "$PSScriptRoot/quickdata-rev8-build.ps1"

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$main = Join-Path $tool 'MainForm.cs'
$m = Get-Content $main -Raw

# No automatic DB/TNF path detection or automatic connection at startup.
$oldShown = '        Shown += (_, _) => { DetectSources(); Connect(); };'
$newShown = '        Shown += (_, _) => UpdateSourceStatus();'
if (-not $m.Contains($oldShown)) { throw 'Startup source-detection marker not found.' }
$m = $m.Replace($oldShown, $newShown)

# Keep session credentials only in memory. Default Firebird credentials: SYSDBA/masterkey.
$fieldMarker = '    FirebirdDatabase? db;' + "`r`n" + '    PdksOptions? options;'
if (-not $m.Contains($fieldMarker)) {
    $fieldMarker = '    FirebirdDatabase? db;' + "`n" + '    PdksOptions? options;'
}
if (-not $m.Contains($fieldMarker)) { throw 'DB field marker not found.' }
$fieldReplacement = @'
    FirebirdDatabase? db;
    PdksOptions? options;
    string dbUser = "SYSDBA";
    string dbPassword = "masterkey";
'@
$m = $m.Replace($fieldMarker, $fieldReplacement.TrimEnd())

# Source area: database and TNF are both user-selected. Remove automatic detection button.
$m = $m.Replace('new Label { Text = "Hedef GDB", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }', 'new Label { Text = "Firebird Veritabanı", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }')
$m = $m.Replace('box.Controls.Add(Btn("Otomatik Tanı", DetectSources), 3, 0);', 'box.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 0);')
$m = $m.Replace('box.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 1);', '')

# Selecting a DB resets to standard Firebird credentials and immediately attempts connection.
$oldPick = @'
    void PickDb()
    {
        using var d = new OpenFileDialog { Filter = "Firebird (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar|*.*", FileName = dbPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { dbPath.Text = d.FileName; UpdateSourceStatus(); }
    }
'@
$newPick = @'
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
        dbUser = "SYSDBA";
        dbPassword = "masterkey";
        UpdateSourceStatus();
        Connect();
    }
'@
if (-not $m.Contains($oldPick)) { throw 'PickDb block not found.' }
$m = $m.Replace($oldPick, $newPick)

# Replace connection flow: try SYSDBA/masterkey first; if rejected, ask user/password and retry.
$connectPattern = '(?ms)^    void Connect\(\)\s*\{.*?^    \}\s*\r?\n\s*    void LoadPeople\(\)'
$newConnect = @'
    void Connect()
    {
        if (string.IsNullOrWhiteSpace(dbPath.Text) || !File.Exists(dbPath.Text))
        {
            db = null;
            sourceStatus.Text = "Önce Veritabanı Seç ile .GDB/.FDB dosyasını seçin.";
            sourceStatus.ForeColor = Color.DarkRed;
            return;
        }

        // First attempt always uses the current in-memory credentials.
        // After a new file selection these are SYSDBA/masterkey.
        if (!TryConnect(dbUser, dbPassword, out var firstError))
        {
            if (!PromptDatabaseCredentials(dbUser, out var enteredUser, out var enteredPassword))
            {
                db = null;
                sourceStatus.Text = "Bağlantı iptal edildi.";
                sourceStatus.ForeColor = Color.DarkRed;
                return;
            }

            if (!TryConnect(enteredUser, enteredPassword, out var secondError))
            {
                db = null;
                sourceStatus.Text = "Bağlantı yok: " + secondError;
                sourceStatus.ForeColor = Color.DarkRed;
                MessageBox.Show("Veritabanına bağlanılamadı.\n\n" + secondError,
                    "Firebird Bağlantısı", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            dbUser = enteredUser;
            dbPassword = enteredPassword;
        }

        sourceStatus.Text = $"Bağlandı: {dbPath.Text}   |   Kullanıcı: {dbUser}";
        sourceStatus.ForeColor = Color.DarkGreen;
        LoadPeople(); LoadIo(); LoadPayroll(); LoadPayments(); LoadAdvances(); RebuildDays(); RebuildEDays(); LoadAudit();
    }

    bool TryConnect(string user, string password, out string error)
    {
        try
        {
            var baseOptions = PdksOptions.FromEnvironment();
            var candidateOptions = baseOptions with
            {
                DatabasePath = dbPath.Text.Trim(),
                DatabaseUser = string.IsNullOrWhiteSpace(user) ? "SYSDBA" : user.Trim(),
                DatabasePassword = password ?? string.Empty
            };
            var candidate = new FirebirdDatabase(candidateOptions);
            using var c = candidate.OpenConnection();
            db = candidate;
            options = candidateOptions;
            dbUser = candidateOptions.DatabaseUser;
            dbPassword = candidateOptions.DatabasePassword;
            error = "";
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    bool PromptDatabaseCredentials(string defaultUser, out string user, out string password)
    {
        using var f = new Form
        {
            Text = "Firebird Veritabanı Girişi",
            Width = 430,
            Height = 235,
            StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            Font = new Font("Segoe UI", 9.5f)
        };

        var userBox = new TextBox { Width = 255, Text = string.IsNullOrWhiteSpace(defaultUser) ? "SYSDBA" : defaultUser };
        var passBox = new TextBox { Width = 255, UseSystemPasswordChar = true };
        var note = new Label { Text = "Varsayılan SYSDBA / masterkey kabul edilmedi. Bu veritabanının kullanıcı ve şifresini girin.", AutoSize = true, MaximumSize = new Size(360, 0), ForeColor = Color.DimGray };
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
        f.AcceptButton = ok; f.CancelButton = cancel;
        f.Shown += (_, _) => passBox.Focus();

        if (f.ShowDialog(this) != DialogResult.OK)
        {
            user = ""; password = ""; return false;
        }
        user = string.IsNullOrWhiteSpace(userBox.Text) ? "SYSDBA" : userBox.Text.Trim();
        password = passBox.Text;
        return true;
    }

    void LoadPeople()
'@
$m2 = [regex]::Replace($m, $connectPattern, $newConnect)
if ($m2 -eq $m) { throw 'Connect block replacement failed.' }
$m = $m2

# Make status wording generic: both .GDB and .FDB are accepted.
$m = $m.Replace('sourceStatus.Text = $"GDB: {(g ? "HAZIR" : "YOK")}   |   TNF: {(t ? "HAZIR" : "YOK")}";', 'sourceStatus.Text = $"DB: {(g ? "SEÇİLDİ" : "SEÇİLMEDİ")}   |   TNF: {(t ? "SEÇİLDİ" : "SEÇİLMEDİ")}";')

Set-Content $main $m -Encoding UTF8 -NoNewline

# Hard audit for REV9 behavior.
$check = Get-Content $main -Raw
foreach ($token in @(
    'Shown += (_, _) => UpdateSourceStatus();',
    'dbPassword = "masterkey"',
    'PromptDatabaseCredentials',
    'DatabasePassword = password',
    'Firebird veritabanı (*.gdb;*.fdb)',
    'Bağlan / Yenile',
    'TNF Seç',
    'DistributedMinutes'))
{
    if (-not $check.Contains($token)) { throw "REV9 audit token missing: $token" }
}
if ($check.Contains('Shown += (_, _) => { DetectSources(); Connect(); };')) { throw 'Automatic startup connection still exists.' }

Write-Host 'REV9 manual DB/TNF selection + masterkey fallback audit OK.'
