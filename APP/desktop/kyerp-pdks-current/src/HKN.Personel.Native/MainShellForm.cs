namespace HKN.Personel.Native;

public sealed class MainShellForm : Form
{
    readonly LocalUser currentUser;
    readonly Panel workspace = new() { Dock = DockStyle.Fill, BackColor = Color.White };
    readonly ToolStrip tool = new()
    {
        Dock = DockStyle.Top,
        GripStyle = ToolStripGripStyle.Hidden,
        AutoSize = false,
        Height = 62,
        ImageScalingSize = new Size(24,24),
        BackColor = SystemColors.Control,
        RenderMode = ToolStripRenderMode.System,
        Padding = Padding.Empty
    };
    readonly StatusStrip status = new() { SizingGrip = false };
    readonly ToolStripStatusLabel todayStatus = new();
    readonly ToolStripStatusLabel firmStatus = new() { Text = "Firma :" };
    readonly ToolStripStatusLabel userStatus = new();
    readonly ToolStripStatusLabel brandStatus = new() { Spring = true, Text = "www.kyerp.net", TextAlign = ContentAlignment.MiddleCenter };
    readonly ToolStripStatusLabel dbStatus = new() { TextAlign = ContentAlignment.MiddleRight };
    PersonelForm? personel;
    Form? activeChild;

    public MainShellForm(LocalUser user)
    {
        currentUser = user;
        Text = "KYERP PDKS";
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft Sans Serif",8.25f);
        BuildMenu();
        BuildToolbar();
        BuildStatus();
        Controls.Add(workspace);
        Controls.Add(tool);
        Controls.Add(MainMenuStrip!);
        Controls.Add(status);
        ShowHome();
    }

    void BuildMenu()
    {
        var menu = new MenuStrip { Dock = DockStyle.Top, Font = Font };

        var ayarlar = new ToolStripMenuItem("Ayarlar");
        var db = new ToolStripMenuItem("Veritabanı Bağlantısı");
        db.Click += (_,_) => { StartupConfiguration.EnsureReady(); UpdateDbStatus(); };
        var users = new ToolStripMenuItem("Kullanıcı Yönetimi") { Enabled = currentUser.IsAdmin };
        users.Click += (_,_) => OpenUserManagement();
        ayarlar.DropDownItems.Add(db);
        ayarlar.DropDownItems.Add(users);
        ayarlar.DropDownItems.Add(new ToolStripSeparator());
        var cikis = new ToolStripMenuItem("Çıkış"); cikis.Click += (_,_) => Close();
        ayarlar.DropDownItems.Add(cikis);

        var tanimlar = new ToolStripMenuItem("Tanımlar");
        tanimlar.DropDownItems.Add(MenuItem("Gruplar", PdksModule.Tanimlar, () => OpenDialogModule(PdksModule.Tanimlar)));
        tanimlar.DropDownItems.Add(MenuItem("Dönemler", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));
        tanimlar.DropDownItems.Add(MenuItem("Bölümler", PdksModule.Tanimlar, () => OpenDialogModule(PdksModule.Tanimlar)));
        tanimlar.DropDownItems.Add(MenuItem("Per. Bilgileri", PdksModule.Personel, OpenPersonel));

        var islemler = new ToolStripMenuItem("İşlemler");
        islemler.DropDownItems.Add(MenuItem("Giriş-Çıkışlar", PdksModule.GirisCikis, () => OpenData(LegacyDataView.GirisCikis, PdksModule.GirisCikis)));
        islemler.DropDownItems.Add(MenuItem("İzinler", PdksModule.Izinler, () => OpenPersonelTab(PdksModule.Izinler)));
        islemler.DropDownItems.Add(MenuItem("Avanslar", PdksModule.EkKazancKesinti, () => OpenData(LegacyDataView.Avanslar, PdksModule.EkKazancKesinti)));
        islemler.DropDownItems.Add(MenuItem("Puantaj", PdksModule.Puantaj, () => OpenData(LegacyDataView.Puantaj, PdksModule.Puantaj)));
        islemler.DropDownItems.Add(MenuItem("Puantaj Sonuçları", PdksModule.Puantaj, () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));
        islemler.DropDownItems.Add(MenuItem("Bordro", PdksModule.Bordro, () => OpenData(LegacyDataView.Bordro, PdksModule.Bordro)));
        islemler.DropDownItems.Add(MenuItem("Çalışma Tarihi", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));

        var raporlar = new ToolStripMenuItem("Raporlar");
        raporlar.DropDownItems.Add(MenuItem("Rapor Merkezi", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));

        var araclar = new ToolStripMenuItem("Araçlar");
        araclar.DropDownItems.Add(MenuItem("Günlük Operasyon", PdksModule.GunlukOperasyon, () => OpenDialogModule(PdksModule.GunlukOperasyon)));

        var transfer = new ToolStripMenuItem("Transfer");
        transfer.DropDownItems.Add(MenuItem("Bilgi Aktar", PdksModule.Terminal, () => OpenDialogModule(PdksModule.Terminal)));
        transfer.DropDownItems.Add(MenuItem("Terminal Ayarları", PdksModule.Terminal, () => OpenDialogModule(PdksModule.Terminal)));

        var hakkinda = new ToolStripMenuItem("Hakkında");
        var about = new ToolStripMenuItem("KYERP PDKS");
        about.Click += (_,_) => MessageBox.Show("KYERP PDKS", "Hakkında", MessageBoxButtons.OK, MessageBoxIcon.Information);
        hakkinda.DropDownItems.Add(about);

        menu.Items.AddRange([ayarlar,tanimlar,islemler,raporlar,araclar,transfer,hakkinda]);
        MainMenuStrip = menu;
    }

    ToolStripMenuItem MenuItem(string text, PdksModule module, Action action)
    {
        var item = new ToolStripMenuItem(text) { Enabled = currentUser.Can(module) };
        item.Click += (_,_) => action();
        return item;
    }

    void BuildToolbar()
    {
        AddLegacyTool("Bilgi Aktar", PdksModule.Terminal, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Terminal));
        AddLegacyTool("Gruplar", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Tanimlar));
        AddLegacyTool("Dönemler", PdksModule.Donemler, SystemIcons.Question.ToBitmap(), () => OpenDialogModule(PdksModule.Donemler));
        AddLegacyTool("Bölümler", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Tanimlar));
        AddLegacyTool("Giriş-Çıkışlar", PdksModule.GirisCikis, SystemIcons.Shield.ToBitmap(), () => OpenData(LegacyDataView.GirisCikis, PdksModule.GirisCikis));
        AddLegacyTool("Per. Bilgileri", PdksModule.Personel, SystemIcons.Information.ToBitmap(), OpenPersonel);
        AddLegacyTool("Avanslar", PdksModule.EkKazancKesinti, SystemIcons.Warning.ToBitmap(), () => OpenData(LegacyDataView.Avanslar, PdksModule.EkKazancKesinti));
        AddLegacyTool("Puantaj", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), () => OpenData(LegacyDataView.Puantaj, PdksModule.Puantaj));
        AddLegacyTool("Puantaj Son.", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj));
        AddLegacyTool("Bordro", PdksModule.Bordro, SystemIcons.Information.ToBitmap(), () => OpenData(LegacyDataView.Bordro, PdksModule.Bordro));
        AddLegacyTool("Çalışma Tarihi", PdksModule.Donemler, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Donemler));
    }

    void AddLegacyTool(string text, PdksModule module, Image image, Action action)
    {
        var b = new ToolStripButton(text,image)
        {
            AutoSize = false,
            Width = 72,
            Height = 58,
            TextImageRelation = TextImageRelation.ImageAboveText,
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            Enabled = currentUser.Can(module),
            Font = new Font("Microsoft Sans Serif",7.5f),
            Margin = Padding.Empty
        };
        b.Click += (_,_) => action();
        tool.Items.Add(b);
    }

    void BuildStatus()
    {
        todayStatus.Text = "Bugün : " + DateTime.Today.ToString("dd MMMM yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
        userStatus.Text = $"Kullanıcı : {currentUser.UserName}";
        UpdateDbStatus();
        status.Items.Add(todayStatus);
        status.Items.Add(new ToolStripSeparator());
        status.Items.Add(firmStatus);
        status.Items.Add(new ToolStripSeparator());
        status.Items.Add(userStatus);
        status.Items.Add(brandStatus);
        status.Items.Add(dbStatus);
        status.Dock = DockStyle.Bottom;
    }

    void UpdateDbStatus()
    {
        var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User)
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        dbStatus.Text = StartupConfiguration.IsReady() ? path ?? "Veritabanı bağlı" : "Veritabanı: bağlantı bekliyor";
    }

    void ShowHome()
    {
        DisposeActiveChild();
        workspace.Controls.Clear();
        var title = new Label
        {
            Text = "KYERP PDKS",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI",32,FontStyle.Bold),
            ForeColor = Color.FromArgb(35,64,110)
        };
        workspace.Controls.Add(title);
    }

    bool Ready(PdksModule module)
    {
        if (!currentUser.Can(module))
        {
            MessageBox.Show("Bu işlem için yetkiniz yok.","KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            return false;
        }
        if (!StartupConfiguration.IsReady() && !StartupConfiguration.EnsureReady()) return false;
        UpdateDbStatus();
        return true;
    }

    void EnsurePersonel()
    {
        if (personel is not null && !personel.IsDisposed) return;
        personel = new PersonelForm();
        personel.PrepareForEmbedding();
    }

    void OpenPersonel()
    {
        if (!Ready(PdksModule.Personel)) return;
        EnsurePersonel();
        if (personel is null) return;
        ShowEmbedded(personel);
        personel.ActivateModule(PdksModule.Personel);
    }

    void OpenPersonelTab(PdksModule module)
    {
        if (!Ready(module)) return;
        EnsurePersonel();
        if (personel is null) return;
        ShowEmbedded(personel);
        personel.ActivateModule(module);
    }

    void OpenDialogModule(PdksModule module)
    {
        if (!Ready(module)) return;
        EnsurePersonel();
        personel?.OpenStandaloneDialog(module);
    }

    void OpenData(LegacyDataView view, PdksModule module)
    {
        if (!Ready(module)) return;
        var form = new LegacyDataModuleForm(view);
        form.PrepareForEmbedding();
        ShowEmbedded(form);
    }

    void ShowEmbedded(Form form)
    {
        if (!ReferenceEquals(activeChild, form)) DisposeActiveChild();
        workspace.Controls.Clear();
        activeChild = form;
        if (form.Parent != workspace) workspace.Controls.Add(form);
        if (!form.Visible) form.Show();
        form.BringToFront();
    }

    void DisposeActiveChild()
    {
        if (activeChild is null) return;
        if (!ReferenceEquals(activeChild, personel) && !activeChild.IsDisposed) activeChild.Dispose();
        activeChild = null;
    }

    void OpenUserManagement()
    {
        if (!currentUser.IsAdmin) return;
        using var f = new UserManagementForm();
        f.ShowDialog(this);
    }
}
