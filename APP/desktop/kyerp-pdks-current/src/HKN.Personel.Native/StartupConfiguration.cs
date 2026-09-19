using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal static class StartupConfiguration
{
    private static readonly (string Key, EnvironmentVariableTarget Target)[] Targets =
    [
        ("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User),
        ("KY_PDKS_DB_HOST", EnvironmentVariableTarget.User),
        ("KY_PDKS_DB_PORT", EnvironmentVariableTarget.User),
        ("KY_PDKS_DB_USER", EnvironmentVariableTarget.User),
        ("KY_PDKS_DB_PASSWORD", EnvironmentVariableTarget.User),
        ("KY_PDKS_RUNTIME_ROOT", EnvironmentVariableTarget.User),
        ("KY_PDKS_REPORT_ROOT", EnvironmentVariableTarget.User),
        ("KY_PDKS_PERSONEL_EXE", EnvironmentVariableTarget.User)
    ];

    public static bool EnsureReady()
    {
        var current = PdksOptions.FromEnvironment();
        if (CanOpen(current)) return true;

        while (true)
        {
            using var dialog = BuildDialog(current, out var dbPath, out var host, out var port, out var user, out var password);
            if (dialog.ShowDialog() != DialogResult.OK) return false;

            if (string.IsNullOrWhiteSpace(dbPath.Text) || string.IsNullOrWhiteSpace(password.Text))
            {
                MessageBox.Show("Veritabanı yolu ve parola zorunludur.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                continue;
            }

            var values = new Dictionary<string, string>
            {
                ["KY_PDKS_DB_PATH"] = dbPath.Text.Trim(),
                ["KY_PDKS_DB_HOST"] = string.IsNullOrWhiteSpace(host.Text) ? "127.0.0.1" : host.Text.Trim(),
                ["KY_PDKS_DB_PORT"] = string.IsNullOrWhiteSpace(port.Text) ? "3050" : port.Text.Trim(),
                ["KY_PDKS_DB_USER"] = string.IsNullOrWhiteSpace(user.Text) ? "SYSDBA" : user.Text.Trim(),
                ["KY_PDKS_DB_PASSWORD"] = password.Text,
                ["KY_PDKS_RUNTIME_ROOT"] = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar),
                ["KY_PDKS_REPORT_ROOT"] = Path.Combine(AppContext.BaseDirectory, "Report"),
                ["KY_PDKS_PERSONEL_EXE"] = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "HKN.Personel.Native.exe")
            };

            foreach (var item in values) Environment.SetEnvironmentVariable(item.Key, item.Value, EnvironmentVariableTarget.Process);

            try
            {
                using var connection = new FirebirdDatabase(PdksOptions.FromEnvironment()).OpenConnection();
                using var command = connection.CreateCommand();
                command.CommandText = "select 1 from RDB$DATABASE";
                _ = command.ExecuteScalar();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Bağlantı kurulamadı. Ayarları kontrol edin.\n\n" + ex.Message, "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Error);
                current = PdksOptions.FromEnvironment();
                continue;
            }

            foreach (var (key, target) in Targets)
            {
                if (values.TryGetValue(key, out var value)) Environment.SetEnvironmentVariable(key, value, target);
            }

            Directory.CreateDirectory(Path.Combine(AppContext.BaseDirectory, "Report"));
            MessageBox.Show("Bağlantı doğrulandı. Ayarlar bu Windows kullanıcısı için kaydedildi.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return true;
        }
    }

    private static bool CanOpen(PdksOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.DatabasePassword) || string.IsNullOrWhiteSpace(options.DatabasePath)) return false;
        try
        {
            using var connection = new FirebirdDatabase(options).OpenConnection();
            return connection.State == System.Data.ConnectionState.Open;
        }
        catch { return false; }
    }

    private static Form BuildDialog(PdksOptions current, out TextBox dbPath, out TextBox host, out TextBox port, out TextBox user, out TextBox password)
    {
        var form = new Form
        {
            Text = "KYERP PDKS İlk Kurulum",
            StartPosition = FormStartPosition.CenterScreen,
            Width = 660,
            Height = 360,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false
        };

        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 7, Padding = new Padding(14) };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,145));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));

        var dbPathControl = new TextBox { Dock = DockStyle.Fill, Text = GuessDatabasePath(current.DatabasePath) };
        dbPath = dbPathControl;
        host = new TextBox { Dock = DockStyle.Fill, Text = current.DatabaseHost };
        port = new TextBox { Dock = DockStyle.Fill, Text = current.DatabasePort.ToString() };
        user = new TextBox { Dock = DockStyle.Fill, Text = current.DatabaseUser };
        password = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };

        AddRow(grid, 0, "Veritabanı", dbPathControl);
        var browse = new Button { Text = "Gözat...", Dock = DockStyle.Fill };
        browse.Click += (_, _) =>
        {
            using var picker = new OpenFileDialog { Filter = "Firebird veritabanı (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar (*.*)|*.*", FileName = dbPathControl.Text };
            if (picker.ShowDialog(form) == DialogResult.OK) dbPathControl.Text = picker.FileName;
        };
        grid.Controls.Add(browse, 2, 0);
        AddRow(grid, 1, "Sunucu", host);
        AddRow(grid, 2, "Port", port);
        AddRow(grid, 3, "Kullanıcı", user);
        AddRow(grid, 4, "Parola", password);

        var note = new Label
        {
            Text = "Parola GitHub'a veya uygulama dosyalarına yazılmaz. Bağlantı test edildikten sonra yalnız bu Windows kullanıcısının ortam ayarına kaydedilir.",
            Dock = DockStyle.Fill,
            AutoSize = false
        };
        grid.Controls.Add(note, 0, 5);
        grid.SetColumnSpan(note, 3);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var cancel = new Button { Text = "Kapat", DialogResult = DialogResult.Cancel, Width = 100 };
        var save = new Button { Text = "Bağlan ve Aç", DialogResult = DialogResult.OK, Width = 120 };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(save);
        grid.Controls.Add(buttons, 0, 6);
        grid.SetColumnSpan(buttons, 3);

        form.Controls.Add(grid);
        form.AcceptButton = save;
        form.CancelButton = cancel;
        return form;
    }

    private static void AddRow(TableLayoutPanel grid, int row, string label, Control control)
    {
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        grid.Controls.Add(new Label { Text = label, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, row);
        grid.Controls.Add(control, 1, row);
    }

    private static string GuessDatabasePath(string configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;
        string[] candidates =
        [
            @"D:\Hedef500\Hedef500\Data\DATABASE.GDB".Replace("\\", "\\"),
            @"C:\Hedef500\Hedef500\Data\DATABASE.GDB".Replace("\\", "\\"),
            Path.Combine(AppContext.BaseDirectory, "Data", "DATABASE.GDB")
        ];
        return candidates.FirstOrDefault(File.Exists) ?? configured;
    }
}
