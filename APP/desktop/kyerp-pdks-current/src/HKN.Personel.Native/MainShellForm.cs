namespace HKN.Personel.Native;

public sealed class MainShellForm : Form
{
    readonly LocalUser currentUser;
    readonly Panel workspace = new() { Dock = DockStyle.Fill, BackColor = Color.White };
    readonly ToolStrip tool = new() { Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden, AutoSize = false, Height = 64, ImageScalingSize = new Size(24,24), BackColor = SystemColors.Control };
    readonly StatusStrip status = new();
    readonly ToolStripStatusLabel userStatus = new();
    readonly ToolStripStatusLabel dbStatus = new() { Spring = true, TextAlign = ContentAlignment.MiddleRight };
    PersonelForm? personel;

    public MainShellForm(LocalUser user)
    {
        currentUser = user;
        Text = "KYERP PDKS";
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI",9f);
        BuildMenu(); BuildToolbar(); BuildStatus();
        Controls.Add(workspace); Controls.Add(tool); Controls.Add(MainMenuStrip!); Controls.Add(status);
        ShowHome();
    }

    void BuildMenu()
    {
        var menu = new MenuStrip { Dock = DockStyle.Top };
        var settings = new ToolStripMenuItem("Ayarlar");
        var users = new ToolStripMenuItem("Kullanıcı Yönetimi"); users.Enabled = currentUser.IsAdmin; users.Click += (_,_) => OpenUserManagement(); settings.DropDownItems.Add(users);
        var personelMenu = new ToolStripMenuItem("Personel Tanımları");
        personelMenu.DropDownItems.Add(MenuItem("Personel", PdksModule.Personel));
        personelMenu.DropDownItems.Add(MenuItem("Organizasyon Tanımları", PdksModule.Tanimlar));
        personelMenu.DropDownItems.Add(MenuItem("Dönemler", PdksModule.Donemler));
        var operations = new ToolStripMenuItem("Personel İşlemleri");
        operations.DropDownItems.Add(MenuItem("Giriş / Çıkış", PdksModule.GirisCikis));
        operations.DropDownItems.Add(MenuItem("İzinler", PdksModule.Izinler));
        operations.DropDownItems.Add(MenuItem("Ek Kazanç / Kesinti", PdksModule.EkKazancKesinti));
        operations.DropDownItems.Add(MenuItem("Günlük Operasyon", PdksModule.GunlukOperasyon));
        var reports = new ToolStripMenuItem("Raporlar"); reports.DropDownItems.Add(MenuItem("Rapor Merkezi", PdksModule.Raporlar));
        var toolsMenu = new ToolStripMenuItem("Araçlar"); toolsMenu.DropDownItems.Add(MenuItem("Puantaj", PdksModule.Puantaj)); toolsMenu.DropDownItems.Add(MenuItem("Bordro / Ödemeler", PdksModule.Bordro));
        var terminal = new ToolStripMenuItem("Terminal / Veri Aktarımı"); terminal.DropDownItems.Add(MenuItem("Terminal Aktarım Profilleri", PdksModule.Terminal));
        menu.Items.AddRange([settings,personelMenu,operations,reports,toolsMenu,terminal]);
        MainMenuStrip = menu;
    }

    ToolStripMenuItem MenuItem(string text, PdksModule module)
    {
        var item = new ToolStripMenuItem(text) { Enabled = currentUser.Can(module) };
        item.Click += (_,_) => OpenModule(module); return item;
    }

    void BuildToolbar()
    {
        AddTool("Personel", PdksModule.Personel, SystemIcons.Information.ToBitmap());
        AddTool("Gruplar", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap());
        AddTool("Dönemler", PdksModule.Donemler, SystemIcons.Question.ToBitmap());
        AddTool("Giriş/Çıkış", PdksModule.GirisCikis, SystemIcons.Shield.ToBitmap());
        AddTool("İzinler", PdksModule.Izinler, SystemIcons.Asterisk.ToBitmap());
        tool.Items.Add(new ToolStripSeparator());
        AddTool("Puantaj", PdksModule.Puantaj, SystemIcons.WinLogo.ToBitmap());
        AddTool("Bordro", PdksModule.Bordro, SystemIcons.Information.ToBitmap());
        AddTool("Günlük", PdksModule.GunlukOperasyon, SystemIcons.Application.ToBitmap());
        AddTool("Terminal", PdksModule.Terminal, SystemIcons.Shield.ToBitmap());
        AddTool("Raporlar", PdksModule.Raporlar, SystemIcons.Question.ToBitmap());
    }

    void AddTool(string text, PdksModule module, Image image)
    {
        var b = new ToolStripButton(text,image) { AutoSize=false, Width=78, Height=58, TextImageRelation=TextImageRelation.ImageAboveText, DisplayStyle=ToolStripItemDisplayStyle.ImageAndText, Enabled=currentUser.Can(module) };
        b.Click += (_,_) => OpenModule(module); tool.Items.Add(b);
    }

    void BuildStatus()
    {
        userStatus.Text = $"Kullanıcı: {currentUser.UserName}";
        dbStatus.Text = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH") ?? "Veritabanı: bağlantı hazır";
        status.Items.Add(userStatus); status.Items.Add(dbStatus); status.Dock = DockStyle.Bottom;
    }

    void ShowHome()
    {
        workspace.Controls.Clear();
        var title = new Label { Text="KYERP PDKS", Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleCenter, Font=new Font("Segoe UI",36,FontStyle.Bold), ForeColor=Color.FromArgb(35,64,110) };
        workspace.Controls.Add(title);
    }

    void EnsurePersonel()
    {
        if (personel is not null && !personel.IsDisposed) return;
        personel = new PersonelForm(); personel.PrepareForEmbedding();
    }

    void OpenModule(PdksModule module)
    {
        if (!currentUser.Can(module)) { MessageBox.Show("Bu işlem için yetkiniz yok.","KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning); return; }
        EnsurePersonel();
        if (personel is null) return;
        if (personel.Parent != workspace)
        {
            workspace.Controls.Clear(); workspace.Controls.Add(personel); personel.Show();
        }
        personel.ActivateModule(module); personel.BringToFront();
    }

    void OpenUserManagement()
    {
        if (!currentUser.IsAdmin) return;
        using var f = new UserManagementForm(); f.ShowDialog(this);
    }
}
