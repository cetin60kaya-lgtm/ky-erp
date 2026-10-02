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

    public static void LoadSavedSettingsIntoProcess()
    {
        foreach (var (key, _) in Targets)
        {
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
            try
            {
                var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
                if (!string.IsNullOrWhiteSpace(value))
                    Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
            }
            catch { }
        }
    }

    public static bool IsReady() => CanOpen(PdksOptions.FromEnvironment());

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
                ["KY_PDKS_PERSONEL_EXE"] = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "KYERP.PDKS.exe")
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
                PdksErrorPresenter.Show(null,ex,"KYERP PDKS",MessageBoxIcon.Error,"Startup.DatabaseConnection");
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
        var p=PdksAppearance.Current;
        var form=new Form
        {
            Text="KY PDKS • Veritabanı Bağlantısı",
            StartPosition=FormStartPosition.CenterScreen,
            Size=new Size(760,520),
            MinimumSize=new Size(700,480),
            FormBorderStyle=FormBorderStyle.FixedDialog,
            MaximizeBox=false,
            MinimizeBox=false,
            Font=new Font("Segoe UI",9f),
            BackColor=p.Canvas
        };

        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(18),BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,94));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));

        var hero=PdksUiKit.Card(16);
        var heroLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        heroLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        heroLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        heroLayout.Controls.Add(new Label{Text="Veritabanı Bağlantısı",Dock=DockStyle.Fill,Font=new Font("Segoe UI",13f,FontStyle.Bold),ForeColor=p.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        heroLayout.Controls.Add(new Label{Text="Canlı Firebird veri kaynağını doğrulayın. Bağlantı bilgileri yalnız bu Windows kullanıcısının ayarlarında saklanır.",Dock=DockStyle.Fill,ForeColor=p.Muted,TextAlign=ContentAlignment.MiddleLeft},0,1);
        hero.Controls.Add(heroLayout);
        root.Controls.Add(hero,0,0);

        var card=PdksUiKit.Card(18);
        var grid=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=6,BackColor=p.Surface,Margin=Padding.Empty};
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,130));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));
        for(var i=0;i<5;i++)grid.RowStyles.Add(new RowStyle(SizeType.Absolute,46));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var dbPathControl=new TextBox{Dock=DockStyle.Fill,Text=GuessDatabasePath(current.DatabasePath),Margin=new Padding(0,7,10,7)};
        dbPath=dbPathControl;
        host=new TextBox{Dock=DockStyle.Fill,Text=current.DatabaseHost,Margin=new Padding(0,7,10,7)};
        port=new TextBox{Dock=DockStyle.Fill,Text=current.DatabasePort.ToString(),Margin=new Padding(0,7,10,7)};
        user=new TextBox{Dock=DockStyle.Fill,Text=current.DatabaseUser,Margin=new Padding(0,7,10,7)};
        password=new TextBox{Dock=DockStyle.Fill,UseSystemPasswordChar=true,Margin=new Padding(0,7,10,7)};

        AddRow(grid,0,"Veritabanı",dbPathControl);
        var browse=PdksUiKit.Button("Gözat",90,PdksActionRole.Secondary);
        browse.MinimumSize=Size.Empty;browse.MaximumSize=Size.Empty;browse.Dock=DockStyle.Fill;browse.Margin=new Padding(0,7,0,7);
        browse.Click+=(_,_)=>{
            using var picker=new OpenFileDialog{Filter="Firebird veritabanı (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar (*.*)|*.*",FileName=dbPathControl.Text};
            if(picker.ShowDialog(form)==DialogResult.OK)dbPathControl.Text=picker.FileName;
        };
        grid.Controls.Add(browse,2,0);

        AddRow(grid,1,"Sunucu",host);
        AddRow(grid,2,"Port",port);
        AddRow(grid,3,"Kullanıcı",user);
        AddRow(grid,4,"Parola",password);

        var note=new Label
        {
            Text="Güvenlik: parola GitHub'a veya uygulama dosyalarına yazılmaz. Bağlantı başarılı olmadan ayarlar kalıcılaştırılmaz.",
            Dock=DockStyle.Fill,
            ForeColor=p.Muted,
            TextAlign=ContentAlignment.MiddleLeft,
            Padding=new Padding(0,10,0,0)
        };
        grid.Controls.Add(note,0,5);grid.SetColumnSpan(note,3);
        card.Controls.Add(grid);
        root.Controls.Add(card,0,1);

        var buttons=PdksUiKit.ActionBar(true,p.Canvas);
        var cancel=PdksUiKit.Button("Kapat",100,PdksActionRole.Quiet);cancel.DialogResult=DialogResult.Cancel;
        var save=PdksUiKit.Button("Bağlan ve Aç",125,PdksActionRole.Primary);save.DialogResult=DialogResult.OK;
        buttons.Controls.Add(cancel);buttons.Controls.Add(save);
        root.Controls.Add(buttons,0,2);

        form.Controls.Add(root);
        form.AcceptButton=save;
        form.CancelButton=cancel;
        return form;
    }

    private static void AddRow(TableLayoutPanel grid,int row,string label,Control control)
    {
        grid.Controls.Add(PdksUiKit.FieldLabel(label),0,row);
        grid.Controls.Add(control,1,row);
    }

    private static string GuessDatabasePath(string configured)
    {
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;
        string[] candidates =
        [
            CompanyDataPaths.Database,
            Path.Combine(AppContext.BaseDirectory, "Data", "KY_PDKS_DATA.FDB"),
            @"D:\Hedef500\Hedef500\Data\DATABASE.GDB",
            @"C:\Hedef500\Hedef500\Data\DATABASE.GDB",
            Path.Combine(AppContext.BaseDirectory, "Data", "DATABASE.GDB")
        ];
        return candidates.FirstOrDefault(File.Exists) ?? configured;
    }
}
