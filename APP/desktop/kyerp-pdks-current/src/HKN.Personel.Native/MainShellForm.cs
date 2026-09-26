using System.Diagnostics;

namespace HKN.Personel.Native;

public sealed class MainShellForm : Form
{
    readonly LocalUser currentUser;
    readonly WorkspaceDockHost workspace;
    readonly ToolStrip tool = new()
    {
        Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden, AutoSize = false,
        Height = 77, ImageScalingSize = new Size(36,36), BackColor = Color.White,
        RenderMode = ToolStripRenderMode.ManagerRenderMode, Padding = Padding.Empty, CanOverflow = true, LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow
    };
    readonly StatusStrip status = new() { SizingGrip = false, AutoSize = false, Height = 22, BackColor = SystemColors.Control };
    readonly ToolStripStatusLabel leadStatus = new() { AutoSize = false, Width = 170 };
    readonly ToolStripStatusLabel todayStatus = new() { AutoSize = false, Width = 190, TextAlign = ContentAlignment.MiddleCenter };
    readonly ToolStripStatusLabel firmStatus = new() { AutoSize = false, Width = 195, Text = "Firma :", TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel userStatus = new() { AutoSize = false, Width = 155, TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel brandStatus = new() { Spring = true, Text = "www.kyerp.net", TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Blue };
    readonly ToolStripStatusLabel dbStatus = new() { AutoSize = false, Width = 420, TextAlign = ContentAlignment.MiddleLeft };
    PersonelForm? personel;
    CompanyBranding branding = CompanyBranding.Empty;

    public MainShellForm(LocalUser user)
    {
        currentUser = user;
        workspace = new WorkspaceDockHost(user.UserName);
        branding = CompanyBranding.Load();
        var v = typeof(MainShellForm).Assembly.GetName().Version;
        Text = $"KYERP PDKS • {branding.ReportHeader} [Versiyon: {v?.Major ?? 2}.{v?.Minor ?? 2}.{v?.Build ?? 0}]";
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI",9f);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        ToolStripManager.Renderer = new ModernShellRenderer();
        BuildMenu();
        BuildToolbar();
        BuildStatus();
        Controls.Add(workspace); Controls.Add(tool); Controls.Add(MainMenuStrip!); Controls.Add(status);
        ShowHome();
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.F2: OpenLiveAttendance(); return true;
            case Keys.F3: OpenPersonel(); return true;
            case Keys.F4: OpenLegacyGirisCikis(); return true;
            case Keys.F5: OpenLegacyPuantaj(); return true;
            case Keys.F6: OpenLegacyBordro(); return true;
            case Keys.F7: OpenOperationalReport(LegacyOperationalReport.PersonnelList); return true;
            case Keys.Control | Keys.T: OpenDialogModule(PdksModule.Terminal); return true;
            case Keys.Control | Keys.H: ShowHome(); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
    void BuildMenu()
    {
        var menu = new MenuStrip
        {
            Dock = DockStyle.Top, Font = new Font("Segoe UI",10f,FontStyle.Bold),
            BackColor = Color.FromArgb(247,249,252), ForeColor = Color.FromArgb(28,46,72),
            AutoSize = false, Height = 44, Padding = new Padding(14,5,0,3),
            RenderMode = ToolStripRenderMode.ManagerRenderMode, ImageScalingSize = new Size(20,20)
        };

        var home = PlainItem("Genel Bakış", ShowHome);

        var daily = new ToolStripMenuItem("Operasyon");
        daily.DropDownItems.Add(MenuItem("Canlı Devam Takibi", PdksModule.GunlukOperasyon, OpenLiveAttendance));
        daily.DropDownItems.Add(MenuItem("Terminal Veri Aktarımı", PdksModule.Terminal, () => OpenDialogModule(PdksModule.Terminal)));
        daily.DropDownItems.Add(MenuItem("Giriş-Çıkış Kayıtları", PdksModule.GirisCikis, OpenLegacyGirisCikis));
        daily.DropDownItems.Add(new ToolStripSeparator());
        daily.DropDownItems.Add(MenuItem("Çalışma Tarihi", PdksModule.Donemler, OpenWorkingDate));

        var hr = new ToolStripMenuItem("İnsan Kaynakları");
        hr.DropDownItems.Add(MenuItem("Personel Kartları", PdksModule.Personel, OpenPersonel));
        hr.DropDownItems.Add(MenuItem("İzin Yönetimi", PdksModule.Izinler, OpenLegacyIzin));
        hr.DropDownItems.Add(MenuItem("Ek Ödeme ve Kesinti İşlemleri", PdksModule.EkKazancKesinti, OpenLegacyKazancKesinti));
        hr.DropDownItems.Add(MenuItem("Çalışma Süresi Düzeltmeleri", PdksModule.Personel, () => OpenLegacyTable("Çalışma Süresi Düzeltmeleri","PERTIMESHIFT",true,new Size(1080,680))));

        var payroll = new ToolStripMenuItem("Puantaj ve Bordro");
        payroll.DropDownItems.Add(MenuItem("Puantaj İşlemleri", PdksModule.Puantaj, OpenLegacyPuantaj));
        payroll.DropDownItems.Add(MenuItem("Puantaj Sonuçları", PdksModule.Puantaj, () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));
        payroll.DropDownItems.Add(new ToolStripSeparator());
        payroll.DropDownItems.Add(MenuItem("Personel Ödeme İşlemleri", PdksModule.Bordro, () => OpenPersonelTab(PdksModule.Bordro)));
        payroll.DropDownItems.Add(MenuItem("Genel Maaş Bordrosu", PdksModule.Bordro, OpenLegacyBordro));

        var definitions = new ToolStripMenuItem("Yapılandırma");
        definitions.DropDownItems.Add(MenuItem("Vardiya ve Çalışma Grupları", PdksModule.Tanimlar, OpenGroups));
        definitions.DropDownItems.Add(MenuItem("Dönem Yönetimi", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));
        var org = new ToolStripMenuItem("Organizasyon Yapısı");
        org.DropDownItems.Add(MenuItem("Bölümler", PdksModule.Tanimlar, () => OpenDefinitions("Bölümler")));
        org.DropDownItems.Add(MenuItem("Servisler", PdksModule.Tanimlar, () => OpenDefinitions("Servisler")));
        org.DropDownItems.Add(MenuItem("Görevler", PdksModule.Tanimlar, () => OpenDefinitions("Görevler")));
        org.DropDownItems.Add(MenuItem("Personel Durumları", PdksModule.Tanimlar, () => OpenDefinitions("Durum")));
        org.DropDownItems.Add(MenuItem("Firma Bilgileri", PdksModule.Tanimlar, () => OpenDefinitions("Firma")));
        definitions.DropDownItems.Add(org);
        var calendar = new ToolStripMenuItem("Takvim ve Çalışma Planı");
        calendar.DropDownItems.Add(MenuItem("Genel Tatiller", PdksModule.Tanimlar, () => OpenLegacyTable("Genel Tatiller","TATIL",true,new Size(1040,680))));
        calendar.DropDownItems.Add(MenuItem("Günlük Çalışma Saatleri", PdksModule.Tanimlar, () => OpenLegacyTable("Günlük Çalışma Saatleri","PUANBILGI",true,new Size(1120,700))));
        calendar.DropDownItems.Add(MenuItem("Yıllık Çalışma Planı", PdksModule.Tanimlar, () => OpenLegacyTable("Yıllık Çalışma Planı","PLANA",true,new Size(1180,720))));
        definitions.DropDownItems.Add(calendar);
        var money = new ToolStripMenuItem("Bordro ve Kesinti Tanımları");
        money.DropDownItems.Add(MenuItem("Bordro Alanları", PdksModule.Tanimlar, () => OpenDefinitions("Bordro")));
        money.DropDownItems.Add(MenuItem("Kesinti ve Kazanç Türleri", PdksModule.Tanimlar, () => OpenLegacyTable("Kesinti ve Kazanç Türleri","AVTUR",true,new Size(1040,680))));
        money.DropDownItems.Add(MenuItem("Ceza Kesintileri", PdksModule.Tanimlar, () => OpenLegacyTable("Ceza Kesintileri","GCEZA",true,new Size(1040,680))));
        definitions.DropDownItems.Add(money);

        var reports = new ToolStripMenuItem("Raporlama ve Denetim");
        reports.DropDownItems.Add(MenuItem("Personel Listesi", PdksModule.Raporlar, () => OpenOperationalReport(LegacyOperationalReport.PersonnelList)));
        reports.DropDownItems.Add(MenuItem("İzinli Personel", PdksModule.Raporlar, () => OpenOperationalReport(LegacyOperationalReport.LeavePersonnel)));
        reports.DropDownItems.Add(MenuItem("Ek Kazanç ve Kesintiler", PdksModule.Raporlar, () => OpenOperationalReport(LegacyOperationalReport.EarningsDeductions)));
        reports.DropDownItems.Add(MenuItem("Çalışma Sistemine Göre Personel", PdksModule.Raporlar, () => OpenOperationalReport(LegacyOperationalReport.PersonnelCountByWorkSystem)));
        reports.DropDownItems.Add(MenuItem("Yıllık İzin Hakedişleri", PdksModule.Raporlar, () => OpenOperationalReport(LegacyOperationalReport.AnnualLeaveEntitlements)));
        reports.DropDownItems.Add(new ToolStripSeparator());
        reports.DropDownItems.Add(MenuItem("Genel Maaş Bordrosu", PdksModule.Bordro, OpenLegacyBordro));

        var system = new ToolStripMenuItem("Sistem Yönetimi");
        system.DropDownItems.Add(MenuItem("Terminal ve Cihaz Ayarları", PdksModule.Terminal, OpenLegacyTerminalSettings));
        system.DropDownItems.Add(PlainItem("Veritabanı Bağlantı Yönetimi", () => { StartupConfiguration.EnsureReady(); UpdateDbStatus(); }));
        system.DropDownItems.Add(PlainItem("Hızlı Veri Kaynakları (GDB / TNF)", () => new QuickDataSourceForm().ShowDialog(this)));
        system.DropDownItems.Add(PlainItem("Veritabanı Yedekleme", BackupDatabase));
        system.DropDownItems.Add(PlainItem("Yazdırma Ayarları", OpenPrinterSettings));
        system.DropDownItems.Add(new ToolStripSeparator());
        var users = MenuItem("Kullanıcı Yönetimi", PdksModule.KullaniciYonetimi, OpenUserManagement);
        users.Enabled = currentUser.IsAdmin;
        system.DropDownItems.Add(users);

        var layout = new ToolStripMenuItem("Çalışma Alanı");
        layout.DropDownItems.Add(PlainItem("Tek Çalışma Alanı", () => workspace.ApplyLayout(WorkspaceLayoutMode.Single)));
        layout.DropDownItems.Add(PlainItem("İki Sütunlu Görünüm", () => workspace.ApplyLayout(WorkspaceLayoutMode.TwoColumns)));
        layout.DropDownItems.Add(PlainItem("İki Satırlı Görünüm", () => workspace.ApplyLayout(WorkspaceLayoutMode.TwoRows)));
        layout.DropDownItems.Add(PlainItem("Operasyon Düzeni: Sol İki / Sağ Geniş", () => workspace.ApplyLayout(WorkspaceLayoutMode.ThreeFocusRight)));
        layout.DropDownItems.Add(PlainItem("Dört Bölmeli Görünüm", () => workspace.ApplyLayout(WorkspaceLayoutMode.FourGrid)));
        layout.DropDownItems.Add(new ToolStripSeparator());
        layout.DropDownItems.Add(PlainItem("Aktif Modülü Kapat", workspace.CloseActive));
        layout.DropDownItems.Add(PlainItem("Tüm Modülleri Kapat", () => workspace.CloseAll()));

        var about = new ToolStripMenuItem("Destek ve Bilgi");
        about.DropDownItems.Add(PlainItem("KY ERP Kurumsal Web Sitesi", OpenErpSite));
        about.DropDownItems.Add(PlainItem("Hakkında", () => MessageBox.Show(Text + "\nKY ERP • PDKS\nhttps://kyerp.net", "Hakkında", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        var help = PlainItem("Kullanım Yardımı", () => MessageBox.Show("KYERP PDKS yardım ve kullanım bilgileri.","Kullanım Yardımı"));
        help.ShortcutKeys = Keys.F1;
        about.DropDownItems.Add(help);

        menu.Items.AddRange([home,daily,hr,payroll,definitions,reports,system,layout,about]);
        ApplyMenuIcons(menu);
        var companyBadge = new ToolStripMenuItem($"{branding.ReportHeader}  •  {currentUser.UserName}")
        {
            Alignment = ToolStripItemAlignment.Right, Enabled = false,
            Font = new Font("Segoe UI",9.5f,FontStyle.Bold), ForeColor = Color.FromArgb(30,79,145)
        };
        menu.Items.Add(companyBadge);
        MainMenuStrip = menu;
    }
    static void ApplyMenuIcons(MenuStrip menu)
    {
        foreach (ToolStripMenuItem item in menu.Items) ApplyMenuIcon(item);
    }

    static void ApplyMenuIcon(ToolStripMenuItem item)
    {
        var text = (item.Text ?? string.Empty).ToLower(new System.Globalization.CultureInfo("tr-TR"));
        var icon = text.Contains("genel bakış") || text.Contains("ana sayfa") ? PdksToolbarIcon.Home
            : text.Contains("rapor") || text.Contains("sonuç") ? PdksToolbarIcon.Results
            : text.Contains("personel") || text.Contains("kullanıcı") ? PdksToolbarIcon.Personnel
            : text.Contains("terminal") || text.Contains("transfer") || text.Contains("aktar") ? PdksToolbarIcon.Transfer
            : text.Contains("puantaj") ? PdksToolbarIcon.Timesheet
            : text.Contains("bordro") || text.Contains("ödeme") || text.Contains("kazanç") || text.Contains("kesinti") ? PdksToolbarIcon.Payroll
            : text.Contains("dönem") || text.Contains("tarih") || text.Contains("tatil") ? PdksToolbarIcon.Periods
            : text.Contains("grup") ? PdksToolbarIcon.Groups
            : text.Contains("böl") || text.Contains("tanım") || text.Contains("firma") ? PdksToolbarIcon.Departments
            : text.Contains("giriş") || text.Contains("çıkış") || text.Contains("işlem") ? PdksToolbarIcon.EntryExit
            : PdksToolbarIcon.WorkDate;
        item.Image = PdksToolbarIcons.Create(icon);
        item.ImageScaling = ToolStripItemImageScaling.SizeToFit;
        foreach (ToolStripItem child in item.DropDownItems)
            if (child is ToolStripMenuItem sub) ApplyMenuIcon(sub);
    }

    ToolStripMenuItem MenuItem(string text, PdksModule module, Action action)
    {
        var item = new ToolStripMenuItem(text) { Enabled = currentUser.Can(module) };
        item.Click += (_,_) => action(); return item;
    }

    static ToolStripMenuItem PlainItem(string text, Action action)
    {
        var item = new ToolStripMenuItem(text); item.Click += (_,_) => action(); return item;
    }

    void BuildToolbar()
    {
        tool.Height = 88;
        tool.BackColor = Color.White;
        tool.Padding = new Padding(10,4,0,4);
        AddLegacyTool("Genel Bakış", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Home), ShowHome, 88);
        AddLegacyTool("Canlı İzleme", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Live), OpenLiveAttendance, 96);
        AddLegacyTool("Terminal", PdksModule.Terminal, PdksToolbarIcons.Create(PdksToolbarIcon.Transfer), () => OpenDialogModule(PdksModule.Terminal), 92);
        AddLegacyTool("Giriş-Çıkış", PdksModule.GirisCikis, PdksToolbarIcons.Create(PdksToolbarIcon.EntryExit), OpenLegacyGirisCikis, 96);
        AddLegacyTool("Personel", PdksModule.Personel, PdksToolbarIcons.Create(PdksToolbarIcon.Personnel), OpenPersonel, 92);
        AddLegacyTool("Puantaj", PdksModule.Puantaj, PdksToolbarIcons.Create(PdksToolbarIcon.Timesheet), OpenLegacyPuantaj, 88);
        AddLegacyTool("Sonuçlar", PdksModule.Puantaj, PdksToolbarIcons.Create(PdksToolbarIcon.Results), () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj), 88);
        AddLegacyTool("Bordro", PdksModule.Bordro, PdksToolbarIcons.Create(PdksToolbarIcon.Payroll), OpenLegacyBordro, 88);
        AddLegacyTool("Çalışma Tarihi", PdksModule.Donemler, PdksToolbarIcons.Create(PdksToolbarIcon.WorkDate), OpenWorkingDate, 102);
    }
    void AddLegacyTool(string text, PdksModule module, Image image, Action action, int width, bool visible = true)
    {
        var b = new ToolStripButton(text,image)
        {
            AutoSize=false, Width=width, Height=80, TextImageRelation=TextImageRelation.ImageAboveText,
            DisplayStyle=ToolStripItemDisplayStyle.ImageAndText, Enabled=currentUser.Can(module),
            Font=new Font("Segoe UI",8.5f,FontStyle.Bold), ForeColor=Color.FromArgb(28,46,72),
            Margin=new Padding(2,0,2,0), Padding=new Padding(2,7,2,4), AutoToolTip=false, Visible=visible, CheckOnClick=false
        };
        b.Click += (_,_) => { foreach(var x in tool.Items.OfType<ToolStripButton>()) x.Checked=false; b.Checked=true; action(); }; tool.Items.Add(b);
    }

    void BuildStatus()
    {
        status.Font = new Font("Segoe UI",8f);
        status.Height = 28;
        status.BackColor = Color.FromArgb(247,249,252);
        todayStatus.Text = "Bugün: " + DateTime.Today.ToString("dd MMMM yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
        firmStatus.Text = $"Firma: {branding.ReportHeader}";
        userStatus.Text = $"Kullanıcı: {currentUser.UserName}"; UpdateDbStatus();
        brandStatus.Text = "KY ERP • PDKS";
        brandStatus.ForeColor = Color.FromArgb(25,92,180);
        brandStatus.IsLink = true;
        brandStatus.Click += (_,_) => OpenErpSite();
        status.Items.Add(leadStatus); status.Items.Add(todayStatus); status.Items.Add(firmStatus); status.Items.Add(userStatus); status.Items.Add(brandStatus); status.Items.Add(dbStatus);
        status.Dock = DockStyle.Bottom;
    }

    void UpdateDbStatus()
    {
        var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User) ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        dbStatus.Text = StartupConfiguration.IsReady() ? path ?? "Veritabanı bağlı" : "Veritabanı: bağlantı bekliyor";
    }

    void ShowHome()
    {
        foreach (var button in tool.Items.OfType<ToolStripButton>()) button.Checked = button.Text == "Genel Bakış";
        personel = null;
        workspace.ShowSingle(new PdksHomeDashboard(
            OpenLiveAttendance,
            () => OpenDialogModule(PdksModule.Terminal),
            OpenLegacyGirisCikis,
            OpenLegacyPuantaj,
            () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj),
            OpenPersonel,
            () => OpenOperationalReport(LegacyOperationalReport.PersonnelList)), "home", "Genel Bakış");
    }

    static void OpenErpSite()
    {
        try { Process.Start(new ProcessStartInfo("https://kyerp.net") { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "KY ERP", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    bool Ready(PdksModule module)
    {
        if (!currentUser.Can(module))
        {
            MessageBox.Show("Bu işlem için yetkiniz yok.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
    }

    void OpenPersonel() => OpenPersonelTab(PdksModule.Personel);

    void OpenPersonelTab(PdksModule module)
    {
        if (!Ready(module)) return;
        EnsurePersonel();
        if (personel is null) return;
        personel.PrepareForEmbedding();
        PdksTheme.Apply(personel);
        personel.ActivateModule(module);
        AccessGuard.Apply(personel, module, currentUser);
        ShowEmbedded(personel, "personel", "İnsan Kaynakları");
    }

    void OpenGroups()
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        ShowModule(new LegacyGroupForm(), PdksModule.Tanimlar);
    }

    void OpenDefinitions(string initialTab)
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        ShowModule(new LegacyDefinitionsForm(initialTab), PdksModule.Tanimlar);
    }

    void OpenLegacyTerminalSettings()
    {
        if (!Ready(PdksModule.Terminal)) return;
        ShowModule(new LegacyTerminalSettingsForm(), PdksModule.Terminal);
    }

    void OpenLegacyTable(string title, string table, bool edit, Size size, PdksModule module = PdksModule.Tanimlar)
    {
        if (!Ready(module)) return;
        ShowModule(new LegacyTableBrowserForm(title, table, edit, size), module);
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
        switch (module)
        {
            case PdksModule.Terminal:
                EnsurePersonel();
                if (personel is not null) ShowModule(personel.CreateTerminalTransferDialog(), PdksModule.Terminal);
                break;
            case PdksModule.Donemler:
                ShowModule(new LegacyPeriodForm(), PdksModule.Donemler);
                break;
            case PdksModule.GunlukOperasyon:
                OpenLiveAttendance();
                break;
            case PdksModule.Tanimlar:
                OpenDefinitions("Bölümler");
                break;
            default:
                OpenPersonelTab(module);
                break;
        }
    }

    void OpenWorkingDate()
    {
        if (!Ready(PdksModule.Donemler)) return;
        EnsurePersonel();
        personel?.ShowWorkingDateDialog();
    }

    void OpenTerminalProfilesAdvanced()
    {
        if (!Ready(PdksModule.Terminal)) return;
        EnsurePersonel();
        personel?.ShowTerminalProfileManager();
    }

    void OpenLegacyKazancKesinti()
    {
        if (!Ready(PdksModule.EkKazancKesinti)) return;
        ShowModule(new LegacyAvansEntryForm(), PdksModule.EkKazancKesinti);
    }

    void OpenLegacyIzin() => OpenPersonelTab(PdksModule.Izinler);

    void OpenLiveAttendance()
    {
        if (!Ready(PdksModule.GunlukOperasyon)) return;
        ShowModule(new LiveAttendanceForm(OpenGirisCikisFor, OpenPersonFor), PdksModule.GunlukOperasyon);
    }

    void OpenPersonFor(string cardNo)
    {
        if (!Ready(PdksModule.Personel)) return;
        EnsurePersonel();
        if (personel is null) return;
        personel.PrepareForEmbedding();
        PdksTheme.Apply(personel);
        AccessGuard.Apply(personel, PdksModule.Personel, currentUser);
        ShowEmbedded(personel, "personel", "İnsan Kaynakları");
        personel.SelectPerson(cardNo);
    }

    void OpenGirisCikisFor(string cardNo, DateTime day)
    {
        if (!Ready(PdksModule.GirisCikis)) return;
        ShowModule(new LegacyGirisCikisForm(cardNo, day), PdksModule.GirisCikis);
    }

    void OpenLegacyGirisCikis()
    {
        if (!Ready(PdksModule.GirisCikis)) return;
        ShowModule(new LegacyGirisCikisForm(), PdksModule.GirisCikis);
    }

    void OpenLegacyPuantaj()
    {
        if (!Ready(PdksModule.Puantaj)) return;
        ShowModule(new LegacyPuantajForm(), PdksModule.Puantaj);
    }

    void OpenLegacyBordro()
    {
        if (!Ready(PdksModule.Bordro)) return;
        ShowModule(new LegacyBordroForm(), PdksModule.Bordro);
    }

    void OpenOperationalReport(LegacyOperationalReport report)
    {
        if (!Ready(PdksModule.Raporlar)) return;
        ShowModule(new LegacyOperationalReportForm(report), PdksModule.Raporlar);
    }

    void OpenData(LegacyDataView view, PdksModule module)
    {
        if (!Ready(module)) return;
        switch (view)
        {
            case LegacyDataView.GirisCikis: ShowModule(new LegacyGirisCikisForm(), PdksModule.GirisCikis); break;
            case LegacyDataView.Avanslar: ShowModule(new LegacyAvansEntryForm(), PdksModule.EkKazancKesinti); break;
            case LegacyDataView.Puantaj: ShowModule(new LegacyPuantajForm(), PdksModule.Puantaj); break;
            case LegacyDataView.Bordro: ShowModule(new LegacyBordroForm(), PdksModule.Bordro); break;
            default: ShowModule(new LegacyDataModuleForm(view), module); break;
        }
    }

    void ShowModule(Form form, PdksModule module)
    {
        AccessGuard.Apply(form, module, currentUser);
        var host = new ModuleHostForm(form, ShowHome);
        ShowEmbedded(host, "module:" + form.GetType().Name + ":" + form.Text, form.Text);
    }

    void ShowEmbedded(Form form, string key, string title)
    {
        workspace.Open(form, key, title);
        if (!form.Visible) form.Show();
        form.BringToFront();
    }

    void DisposeActiveChild()
    {
        workspace.CloseAll();
        personel = null;
    }

    void OpenUserManagement()
    {
        if (!currentUser.IsAdmin) return;
        ShowModule(new UserManagementForm(), PdksModule.KullaniciYonetimi);
    }

    void OpenPrinterSettings()
    {
        using var dlg = new PrintDialog { UseEXDialog = true }; dlg.ShowDialog(this);
    }

    static void Launch(string file)
    {
        try { Process.Start(new ProcessStartInfo(file){UseShellExecute=true}); }
        catch (Exception ex) { MessageBox.Show(ex.Message,"KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    static void LaunchEditor()
    {
        try { Process.Start(new ProcessStartInfo("write.exe"){UseShellExecute=true}); }
        catch { Launch("notepad.exe"); }
    }

    void BackupDatabase()
    {
        try
        {
            var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User) ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new FileNotFoundException("Veritabanı dosyası bulunamadı.",path);
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"KYERP","PDKS","Yedek"); Directory.CreateDirectory(dir);
            var dest = Path.Combine(dir,$"DATABASE_{DateTime.Now:yyyyMMdd_HHmmss}.GDB"); File.Copy(path,dest,false);
            MessageBox.Show("Yedek alındı:\n"+dest,"Yedekle",MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message,"Yedekle",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    sealed class ModernShellRenderer : ToolStripProfessionalRenderer
    {
        public ModernShellRenderer() : base(new ModernColors()) { RoundedEdges = false; }

        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e)
            => e.Graphics.Clear(e.ToolStrip is MenuStrip ? Color.FromArgb(247,249,252) : Color.White);

        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (e.Item is not ToolStripButton b) { base.OnRenderButtonBackground(e); return; }
            var rect = new Rectangle(2,2,Math.Max(1,b.Width-5),Math.Max(1,b.Height-5));
            var back = b.Pressed ? Color.FromArgb(224,236,255) : (b.Selected || b.Checked) ? Color.FromArgb(238,245,255) : Color.White;
            using var brush = new SolidBrush(back);
            using var pen = new Pen(b.Selected || b.Pressed || b.Checked ? Color.FromArgb(165,198,242) : Color.FromArgb(226,231,239));
            e.Graphics.FillRectangle(brush,rect); e.Graphics.DrawRectangle(pen,rect);
            if (b.Selected || b.Pressed || b.Checked)
            {
                using var accent = new SolidBrush(Color.FromArgb(30,105,205));
                e.Graphics.FillRectangle(accent,rect.Left,rect.Bottom-3,rect.Width,3);
            }
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            using var pen = new Pen(Color.FromArgb(220,227,237));
            e.Graphics.DrawLine(pen,0,e.ToolStrip.Height-1,e.ToolStrip.Width,e.ToolStrip.Height-1);
        }

        sealed class ModernColors : ProfessionalColorTable
        {
            public override Color MenuItemSelected => Color.FromArgb(232,241,255);
            public override Color MenuItemBorder => Color.FromArgb(180,205,240);
            public override Color MenuItemSelectedGradientBegin => MenuItemSelected;
            public override Color MenuItemSelectedGradientEnd => MenuItemSelected;
            public override Color MenuItemPressedGradientBegin => Color.FromArgb(222,236,255);
            public override Color MenuItemPressedGradientEnd => Color.FromArgb(222,236,255);
            public override Color ToolStripDropDownBackground => Color.White;
            public override Color ImageMarginGradientBegin => Color.White;
            public override Color ImageMarginGradientMiddle => Color.White;
            public override Color ImageMarginGradientEnd => Color.White;
            public override Color SeparatorDark => Color.FromArgb(225,230,238);
            public override Color SeparatorLight => Color.White;
        }
    }
}
