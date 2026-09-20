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
        Height = 77,
        ImageScalingSize = new Size(20,20),
        BackColor = Color.White,
        RenderMode = ToolStripRenderMode.ManagerRenderMode,
        Padding = Padding.Empty,
        CanOverflow = false
    };
    readonly StatusStrip status = new() { SizingGrip = false, AutoSize = false, Height = 22, BackColor = SystemColors.Control };
    readonly ToolStripStatusLabel leadStatus = new() { AutoSize = false, Width = 200 };
    readonly ToolStripStatusLabel todayStatus = new() { AutoSize = false, Width = 155, TextAlign = ContentAlignment.MiddleCenter };
    readonly ToolStripStatusLabel firmStatus = new() { AutoSize = false, Width = 195, Text = "Firma :", TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel userStatus = new() { AutoSize = false, Width = 150, TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel brandStatus = new() { Spring = true, Text = "www.kyerp.net", TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Blue };
    readonly ToolStripStatusLabel dbStatus = new() { AutoSize = false, Width = 360, TextAlign = ContentAlignment.MiddleLeft };
    PersonelForm? personel;
    Form? activeChild;

    public MainShellForm(LocalUser user)
    {
        currentUser = user;
        var v = typeof(MainShellForm).Assembly.GetName().Version;
        Text = $"KYERP PDKS [Versiyon: {v?.Major ?? 2}.{v?.Minor ?? 2}.{v?.Build ?? 0}]";
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft Sans Serif",8.25f);
        ToolStripManager.Renderer = new LegacyShellRenderer();
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
        var menu = new MenuStrip
        {
            Dock = DockStyle.Top,
            Font = new Font("Microsoft Sans Serif",8.25f),
            BackColor = SystemColors.Control,
            AutoSize = false,
            Height = 20,
            Padding = new Padding(2,1,0,0),
            RenderMode = ToolStripRenderMode.System
        };

        var ayarlar = new ToolStripMenuItem("Ayarlar");
        var db = new ToolStripMenuItem("Veritabanı Bağlantısı");
        db.Click += (_,_) => { StartupConfiguration.EnsureReady(); UpdateDbStatus(); };
        var users = new ToolStripMenuItem("Kullanıcı Yönetimi") { Enabled = currentUser.IsAdmin };
        users.Click += (_,_) => OpenUserManagement();
        var cikis = new ToolStripMenuItem("Çıkış");
        cikis.Click += (_,_) => Close();
        ayarlar.DropDownItems.Add(db);
        ayarlar.DropDownItems.Add(users);
        ayarlar.DropDownItems.Add(new ToolStripSeparator());
        ayarlar.DropDownItems.Add(cikis);

        var tanimlar = new ToolStripMenuItem("Tanımlar");
        tanimlar.DropDownItems.Add(MenuItem("Gruplar", PdksModule.Tanimlar, () => OpenDefinition("GRUP")));
        tanimlar.DropDownItems.Add(MenuItem("Dönemler", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));
        tanimlar.DropDownItems.Add(MenuItem("Bölümler", PdksModule.Tanimlar, () => OpenDefinition("BOLUM")));
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
        var transfer = new ToolStripMenuItem("Transfer");
        transfer.DropDownItems.Add(MenuItem("Bilgi Aktar", PdksModule.Terminal, () => OpenDialogModule(PdksModule.Terminal)));
        var hakkinda = new ToolStripMenuItem("Hakkında");
        var about = new ToolStripMenuItem("KYERP PDKS");
        about.Click += (_,_) => MessageBox.Show(Text, "Hakkında", MessageBoxButtons.OK, MessageBoxIcon.Information);
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
        AddLegacyTool("Bilgi Aktar", PdksModule.Terminal, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Terminal), 81);
        AddLegacyTool("Gruplar", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), () => OpenDefinition("GRUP"), 72);
        AddLegacyTool("Dönemler", PdksModule.Donemler, SystemIcons.Question.ToBitmap(), () => OpenDialogModule(PdksModule.Donemler), 79);
        AddLegacyTool("Bölümler", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), () => OpenDefinition("BOLUM"), 79);
        AddLegacyTool("Giriş-Çıkışlar", PdksModule.GirisCikis, SystemIcons.Shield.ToBitmap(), () => OpenData(LegacyDataView.GirisCikis, PdksModule.GirisCikis), 95);
        AddLegacyTool("Per. Bilgileri", PdksModule.Personel, SystemIcons.Information.ToBitmap(), OpenPersonel, 88);
        AddLegacyTool("Avanslar", PdksModule.EkKazancKesinti, SystemIcons.Warning.ToBitmap(), () => OpenData(LegacyDataView.Avanslar, PdksModule.EkKazancKesinti), 77);
        AddLegacyTool("Puantaj", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), () => OpenData(LegacyDataView.Puantaj, PdksModule.Puantaj), 72);
        AddLegacyTool("Puantaj Son.", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj), 90);
        AddLegacyTool("Bordro", PdksModule.Bordro, SystemIcons.Information.ToBitmap(), () => OpenData(LegacyDataView.Bordro, PdksModule.Bordro), 70);
        AddLegacyTool("Çalışma Tarihi", PdksModule.Donemler, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Donemler), 95);
    }

    void AddLegacyTool(string text, PdksModule module, Image image, Action action, int width)
    {
        var b = new ToolStripButton(text,image)
        {
            AutoSize = false,
            Width = width,
            Height = 73,
            TextImageRelation = TextImageRelation.ImageAboveText,
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            Enabled = currentUser.Can(module),
            Font = new Font("Microsoft Sans Serif",8.0f,FontStyle.Bold),
            ForeColor = Color.Blue,
            Margin = Padding.Empty,
            Padding = new Padding(1,7,1,4),
            AutoToolTip = false
        };
        b.Click += (_,_) => action();
        tool.Items.Add(b);
    }

    void BuildStatus()
    {
        status.Font = new Font("Microsoft Sans Serif",7.25f);
        todayStatus.Text = "Bugün : " + DateTime.Today.ToString("dd MMMM yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
        userStatus.Text = $"Kullanıcı : {currentUser.UserName}";
        UpdateDbStatus();
        status.Items.Add(leadStatus);
        status.Items.Add(todayStatus);
        status.Items.Add(firmStatus);
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
        var center = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Color.White,
            Padding = Padding.Empty
        };
        center.RowStyles.Add(new RowStyle(SizeType.Percent,35));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute,150));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute,62));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        center.RowStyles.Add(new RowStyle(SizeType.Percent,65));
        center.Controls.Add(new Label
        {
            Text = "KYERP",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.BottomCenter,
            Font = new Font("Arial",92,FontStyle.Bold),
            ForeColor = Color.Black,
            BackColor = Color.White,
            Margin = Padding.Empty
        },0,1);
        center.Controls.Add(new Label
        {
            Text = "P   D   K   S",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopCenter,
            Font = new Font("Arial",36,FontStyle.Bold),
            ForeColor = Color.DimGray,
            BackColor = Color.White,
            Margin = Padding.Empty
        },0,2);
        center.Controls.Add(new Label
        {
            Text = "www.kyerp.net",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopCenter,
            Font = new Font("Arial",17,FontStyle.Bold),
            ForeColor = Color.Black,
            BackColor = Color.White,
            Margin = Padding.Empty
        },0,3);
        workspace.Controls.Add(center);
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

    void OpenDefinition(string table)
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        EnsurePersonel();
        personel?.OpenOrganizationDefinition(table);
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

    sealed class LegacyShellRenderer : ToolStripSystemRenderer
    {
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
        {
            e.Graphics.Clear(e.ToolStrip is MenuStrip ? SystemColors.Control : Color.White);
        }

        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (e.Item is not ToolStripButton b) { base.OnRenderButtonBackground(e); return; }
            var r = new Rectangle(0,0,b.Width-1,b.Height-1);
            var light = b.Pressed || b.Selected ? SystemColors.ControlDark : SystemColors.ControlLightLight;
            var dark = b.Pressed || b.Selected ? SystemColors.ControlLightLight : SystemColors.ControlDark;
            using var p1 = new Pen(light);
            using var p2 = new Pen(dark);
            e.Graphics.DrawLine(p1,r.Left,r.Top,r.Right,r.Top);
            e.Graphics.DrawLine(p1,r.Left,r.Top,r.Left,r.Bottom);
            e.Graphics.DrawLine(p2,r.Right,r.Top,r.Right,r.Bottom);
            e.Graphics.DrawLine(p2,r.Left,r.Bottom,r.Right,r.Bottom);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            if (e.ToolStrip is MenuStrip) return;
            using var dark = new Pen(SystemColors.ControlDark);
            using var light = new Pen(SystemColors.ControlLightLight);
            var y = e.ToolStrip.Height - 3;
            e.Graphics.DrawLine(dark,0,y,e.ToolStrip.Width,y);
            e.Graphics.DrawLine(light,0,y+1,e.ToolStrip.Width,y+1);
        }
    }
}
