using System.Diagnostics;

namespace HKN.Personel.Native;

public sealed class MainShellForm : Form
{
    readonly LocalUser currentUser;
    readonly Panel workspace = new() { Dock = DockStyle.Fill, BackColor = Color.White };
    readonly ToolStrip tool = new()
    {
        Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden, AutoSize = false,
        Height = 77, ImageScalingSize = new Size(24,24), BackColor = Color.White,
        RenderMode = ToolStripRenderMode.ManagerRenderMode, Padding = Padding.Empty, CanOverflow = false
    };
    readonly StatusStrip status = new() { SizingGrip = false, AutoSize = false, Height = 22, BackColor = SystemColors.Control };
    readonly ToolStripStatusLabel leadStatus = new() { AutoSize = false, Width = 170 };
    readonly ToolStripStatusLabel todayStatus = new() { AutoSize = false, Width = 190, TextAlign = ContentAlignment.MiddleCenter };
    readonly ToolStripStatusLabel firmStatus = new() { AutoSize = false, Width = 195, Text = "Firma :", TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel userStatus = new() { AutoSize = false, Width = 155, TextAlign = ContentAlignment.MiddleLeft };
    readonly ToolStripStatusLabel brandStatus = new() { Spring = true, Text = "www.kyerp.net", TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.Blue };
    readonly ToolStripStatusLabel dbStatus = new() { AutoSize = false, Width = 420, TextAlign = ContentAlignment.MiddleLeft };
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
        Controls.Add(workspace); Controls.Add(tool); Controls.Add(MainMenuStrip!); Controls.Add(status);
        ShowHome();
    }

    void BuildMenu()
    {
        var menu = new MenuStrip
        {
            Dock = DockStyle.Top, Font = new Font("Microsoft Sans Serif",8.25f),
            BackColor = SystemColors.Control, AutoSize = false, Height = 20,
            Padding = new Padding(2,1,0,0), RenderMode = ToolStripRenderMode.System
        };

        var ayarlar = new ToolStripMenuItem("Ayarlar");
        ayarlar.DropDownItems.Add(MenuItem("Terminal Ayarları", PdksModule.Terminal, OpenLegacyTerminalSettings));
        ayarlar.DropDownItems.Add(MenuItem("Yuvarlatmalar", PdksModule.Tanimlar, () => OpenLegacyTable("Yuvarlatmalar","YUVARLA",true,new Size(481,272))));
        ayarlar.DropDownItems.Add(MenuItem("Çıkışta Yedek Al", PdksModule.Tanimlar, BackupDatabase));
        ayarlar.DropDownItems.Add(new ToolStripSeparator());
        ayarlar.DropDownItems.Add(PlainItem("Yazıcı Ayarları", OpenPrinterSettings));
        ayarlar.DropDownItems.Add(PlainItem("Windows Tarih Ve Saat Ayarları", () => Launch("timedate.cpl")));
        ayarlar.DropDownItems.Add(PlainItem("Windows Bölgesel Ayarlar", () => Launch("intl.cpl")));
        ayarlar.DropDownItems.Add(PlainItem("Veri Tabanı Hizmet Sağlayacı (Interbase)", () => { StartupConfiguration.EnsureReady(); UpdateDbStatus(); }));
        ayarlar.DropDownItems.Add(new ToolStripSeparator());
        ayarlar.DropDownItems.Add(MenuItem("Çalışma Tarihi", PdksModule.Donemler, OpenWorkingDate));

        var tanimlar = new ToolStripMenuItem("Tanımlar");
        tanimlar.DropDownItems.Add(MenuItem("Çalışma Grupları", PdksModule.Tanimlar, OpenGroups));
        tanimlar.DropDownItems.Add(new ToolStripSeparator());
        tanimlar.DropDownItems.Add(MenuItem("Bölüm Tanımları", PdksModule.Tanimlar, () => OpenDefinitions("Bölümler")));
        tanimlar.DropDownItems.Add(MenuItem("Servis Tanımları", PdksModule.Tanimlar, () => OpenDefinitions("Servisler")));
        tanimlar.DropDownItems.Add(MenuItem("Görev Tanımları", PdksModule.Tanimlar, () => OpenDefinitions("Görevler")));
        tanimlar.DropDownItems.Add(MenuItem("Durum Tanımları", PdksModule.Tanimlar, () => OpenDefinitions("Durum")));
        tanimlar.DropDownItems.Add(new ToolStripSeparator());
        tanimlar.DropDownItems.Add(MenuItem("Firma Bilgileri", PdksModule.Tanimlar, () => OpenDefinitions("Firma")));
        tanimlar.DropDownItems.Add(MenuItem("Bordro Alanları", PdksModule.Tanimlar, () => OpenDefinitions("Bordro")));
        tanimlar.DropDownItems.Add(new ToolStripSeparator());
        tanimlar.DropDownItems.Add(MenuItem("Dönemler", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));
        tanimlar.DropDownItems.Add(MenuItem("Kesinti ve Kazanç Türleri", PdksModule.Tanimlar, () => OpenLegacyTable("Kesinti ve Kazanç Türleri","AVTUR",true,new Size(520,410))));
        tanimlar.DropDownItems.Add(MenuItem("Genel Tatilller", PdksModule.Tanimlar, () => OpenLegacyTable("Genel Tatiller","TATIL",true,new Size(570,430))));
        tanimlar.DropDownItems.Add(MenuItem("Günlük Çalışma Saatleri", PdksModule.Tanimlar, () => OpenLegacyTable("Günlük Çalışma Saatleri","PUANBILGI",true,new Size(650,470))));
        tanimlar.DropDownItems.Add(MenuItem("Yıllık Çalışma Planı", PdksModule.Tanimlar, () => OpenLegacyTable("Yıllık Çalışma Planı","PLANA",true,new Size(760,520))));
        tanimlar.DropDownItems.Add(MenuItem("Ceza Kesintileri", PdksModule.Tanimlar, () => OpenLegacyTable("Ceza Kesintileri","GCEZA",true,new Size(620,450))));
        tanimlar.DropDownItems.Add(new ToolStripSeparator());
        tanimlar.DropDownItems.Add(MenuItem("Özel Geçiş Kartları", PdksModule.Tanimlar, () => OpenLegacyTable("Özel Geçiş Kartları","MKART",true,new Size(600,440))));

        var islemler = new ToolStripMenuItem("İşlemler");
        islemler.DropDownItems.Add(MenuItem("Terminalden Gelen Bilgileri Aktar", PdksModule.Terminal, () => OpenDialogModule(PdksModule.Terminal)));
        islemler.DropDownItems.Add(MenuItem("Giriş ve Çıkışlar", PdksModule.GirisCikis, OpenLegacyGirisCikis));
        islemler.DropDownItems.Add(MenuItem("Personel Bilgileri", PdksModule.Personel, OpenPersonel));
        islemler.DropDownItems.Add(new ToolStripSeparator());
        islemler.DropDownItems.Add(MenuItem("Personel Süre Kaydırma", PdksModule.Personel, () => OpenLegacyTable("Personel Süre Kaydırma","PERTIMESHIFT",true,new Size(620,430))));
        islemler.DropDownItems.Add(new ToolStripSeparator());
        islemler.DropDownItems.Add(MenuItem("Ek Kazanç ve Kesinti Girişi", PdksModule.EkKazancKesinti, OpenLegacyKazancKesinti));
        islemler.DropDownItems.Add(MenuItem("Sabit Ödemeler", PdksModule.Bordro, () => OpenPersonelTab(PdksModule.Bordro)));
        islemler.DropDownItems.Add(MenuItem("İzin Girişi", PdksModule.Izinler, OpenLegacyIzin));
        islemler.DropDownItems.Add(MenuItem("Personel Maaş Zammı", PdksModule.Personel, OpenPersonel));
        islemler.DropDownItems.Add(MenuItem("Dönem Devir İşlemi", PdksModule.Donemler, () => OpenLegacyTable("Dönem Devir İşlemi","DONEM",false,new Size(620,430))));
        islemler.DropDownItems.Add(new ToolStripSeparator());
        islemler.DropDownItems.Add(MenuItem("Puantaj", PdksModule.Puantaj, OpenLegacyPuantaj));
        islemler.DropDownItems.Add(new ToolStripSeparator());
        var users = MenuItem("Kullanıcı Bilgileri", PdksModule.KullaniciYonetimi, OpenUserManagement);
        users.Enabled = currentUser.IsAdmin; islemler.DropDownItems.Add(users);

        var raporlar = new ToolStripMenuItem("Raporlar");
        raporlar.DropDownItems.Add(MenuItem("Ayrıntılı Bordro", PdksModule.Bordro, OpenLegacyBordro));
        raporlar.DropDownItems.Add(MenuItem("Genel Maaş Bordrosu", PdksModule.Bordro, OpenLegacyBordro));
        var userBordro = MenuItem("Genel Maaş Bordrosu (Kullanıcı)", PdksModule.Bordro, OpenLegacyBordro); userBordro.Visible=false; raporlar.DropDownItems.Add(userBordro);
        raporlar.DropDownItems.Add(new ToolStripSeparator());
        raporlar.DropDownItems.Add(MenuItem("Puantaj Sonuçları", PdksModule.Puantaj, () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));
        raporlar.DropDownItems.Add(MenuItem("Detaylı Puantaj Sonuçları", PdksModule.Puantaj, () => OpenPersonelTab(PdksModule.Puantaj)));
        raporlar.DropDownItems.Add(new ToolStripSeparator());
        raporlar.DropDownItems.Add(MenuItem("Ek Kazanç ve Kesinti Raporu", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));
        raporlar.DropDownItems.Add(MenuItem("İzinli Personel Raporu", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));
        raporlar.DropDownItems.Add(new ToolStripSeparator());
        raporlar.DropDownItems.Add(MenuItem("Personel Listesi", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));
        raporlar.DropDownItems.Add(MenuItem("Çalışma Sistemine Göre Personel Sayısı", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));
        raporlar.DropDownItems.Add(MenuItem("Personel Yıllık İzin Hakedişleri", PdksModule.Raporlar, () => OpenDialogModule(PdksModule.Raporlar)));

        var araclar = new ToolStripMenuItem("Araçlar");
        araclar.DropDownItems.Add(PlainItem("Hesap Makinası", () => Launch("calc.exe")));
        araclar.DropDownItems.Add(PlainItem("Yazı Editörü (Wordpad)", LaunchEditor));
        araclar.DropDownItems.Add(new ToolStripSeparator());
        araclar.DropDownItems.Add(PlainItem("Yedekle", BackupDatabase));

        var transfer = new ToolStripMenuItem("Transfer");
        transfer.DropDownItems.Add(MenuItem("Puantaj Transfer", PdksModule.Puantaj, () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));

        var hakkinda = new ToolStripMenuItem("Hakkında");
        hakkinda.DropDownItems.Add(new ToolStripMenuItem("Aktivasyon Kodu") { Enabled = false });
        hakkinda.DropDownItems.Add(new ToolStripSeparator());
        hakkinda.DropDownItems.Add(PlainItem("Hakkında", () => MessageBox.Show(Text + "\nwww.kyerp.net", "Hakkında", MessageBoxButtons.OK, MessageBoxIcon.Information)));
        var help = PlainItem("Yardım", () => MessageBox.Show("KYERP PDKS yardım ve kullanım bilgileri.","Yardım")); help.ShortcutKeys=Keys.F1; hakkinda.DropDownItems.Add(help);

        menu.Items.AddRange([ayarlar,tanimlar,islemler,raporlar,araclar,transfer,hakkinda]);
        MainMenuStrip = menu;
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
        AddLegacyTool("Bilgi Aktar", PdksModule.Terminal, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Terminal), 80);
        AddLegacyTool("Gruplar", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), OpenGroups, 80);
        AddLegacyTool("Dönemler", PdksModule.Donemler, SystemIcons.Application.ToBitmap(), () => OpenDialogModule(PdksModule.Donemler), 80);
        AddLegacyTool("Bölümler", PdksModule.Tanimlar, SystemIcons.Application.ToBitmap(), () => OpenDefinitions("Bölümler"), 80);
        AddLegacyTool("Giriş-Çıkışlar", PdksModule.GirisCikis, SystemIcons.Application.ToBitmap(), OpenLegacyGirisCikis, 80);
        AddLegacyTool("Per. Bilgileri", PdksModule.Personel, SystemIcons.Application.ToBitmap(), OpenPersonel, 80);
        AddLegacyTool("Avanslar", PdksModule.EkKazancKesinti, SystemIcons.Application.ToBitmap(), OpenLegacyKazancKesinti, 80);
        AddLegacyTool("Puantaj", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), OpenLegacyPuantaj, 80);
        AddLegacyTool("Puantaj Son.", PdksModule.Puantaj, SystemIcons.Application.ToBitmap(), () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj), 80);
        AddLegacyTool("Bordro", PdksModule.Bordro, SystemIcons.Application.ToBitmap(), OpenLegacyBordro, 80);
        AddLegacyTool("Çalışma Tarihi", PdksModule.Donemler, SystemIcons.Application.ToBitmap(), OpenWorkingDate, 85);
    }

    void AddLegacyTool(string text, PdksModule module, Image image, Action action, int width)
    {
        var b = new ToolStripButton(text,image)
        {
            AutoSize=false, Width=width, Height=75, TextImageRelation=TextImageRelation.ImageAboveText,
            DisplayStyle=ToolStripItemDisplayStyle.ImageAndText, Enabled=currentUser.Can(module),
            Font=new Font("Microsoft Sans Serif",8.0f,FontStyle.Bold), ForeColor=Color.Blue,
            Margin=Padding.Empty, Padding=new Padding(1,7,1,4), AutoToolTip=false
        };
        b.Click += (_,_) => action(); tool.Items.Add(b);
    }

    void BuildStatus()
    {
        status.Font = new Font("Microsoft Sans Serif",7.25f);
        todayStatus.Text = "Bugün : " + DateTime.Today.ToString("dd MMMM yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
        userStatus.Text = $"Kullanıcı : {currentUser.UserName}"; UpdateDbStatus();
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
        DisposeActiveChild(); workspace.Controls.Clear();
        var center = new TableLayoutPanel { Dock=DockStyle.Fill,ColumnCount=1,RowCount=5,BackColor=Color.White,Padding=Padding.Empty };
        center.RowStyles.Add(new RowStyle(SizeType.Percent,35)); center.RowStyles.Add(new RowStyle(SizeType.Absolute,150)); center.RowStyles.Add(new RowStyle(SizeType.Absolute,62)); center.RowStyles.Add(new RowStyle(SizeType.Absolute,52)); center.RowStyles.Add(new RowStyle(SizeType.Percent,65));
        center.Controls.Add(new Label { Text="KYERP",Dock=DockStyle.Fill,TextAlign=ContentAlignment.BottomCenter,Font=new Font("Arial",92,FontStyle.Bold),ForeColor=Color.Black,BackColor=Color.White,Margin=Padding.Empty },0,1);
        center.Controls.Add(new Label { Text="P   D   K   S",Dock=DockStyle.Fill,TextAlign=ContentAlignment.TopCenter,Font=new Font("Arial",36,FontStyle.Bold),ForeColor=Color.DimGray,BackColor=Color.White,Margin=Padding.Empty },0,2);
        center.Controls.Add(new Label { Text="www.kyerp.net",Dock=DockStyle.Fill,TextAlign=ContentAlignment.TopCenter,Font=new Font("Arial",17,FontStyle.Bold),ForeColor=Color.Black,BackColor=Color.White,Margin=Padding.Empty },0,3);
        workspace.Controls.Add(center);
    }

    bool Ready(PdksModule module)
    {
        if (!currentUser.Can(module)) { MessageBox.Show("Bu işlem için yetkiniz yok.","KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning); return false; }
        if (!StartupConfiguration.IsReady() && !StartupConfiguration.EnsureReady()) return false;
        UpdateDbStatus(); return true;
    }

    void EnsurePersonel()
    {
        if (personel is not null && !personel.IsDisposed) return;
        personel = new PersonelForm(); personel.PrepareForEmbedding();
    }

    void OpenPersonel()
    {
        if (!Ready(PdksModule.Personel)) return; EnsurePersonel(); if (personel is null) return;
        ShowEmbedded(personel); personel.ActivateModule(PdksModule.Personel);
    }

    void OpenPersonelTab(PdksModule module)
    {
        if (!Ready(module)) return; EnsurePersonel(); if (personel is null) return;
        ShowEmbedded(personel); personel.ActivateModule(module);
    }

    void OpenGroups()
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        try { using var f = new LegacyGroupForm(); f.ShowDialog(this); }
        catch (Exception ex) { MessageBox.Show(ex.Message,"Çalışma Grupları",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    void OpenDefinitions(string initialTab)
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        try { using var f = new LegacyDefinitionsForm(initialTab); f.ShowDialog(this); }
        catch (Exception ex) { MessageBox.Show(ex.Message,"Çalışma Sistemleri",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    void OpenLegacyTerminalSettings()
    {
        if (!Ready(PdksModule.Terminal)) return;
        try { using var f = new LegacyTerminalSettingsForm(); f.ShowDialog(this); }
        catch (Exception ex) { MessageBox.Show(ex.Message,"Terminal Aktarım Ayarları",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    void OpenLegacyTable(string title,string table,bool edit,Size size,PdksModule module=PdksModule.Tanimlar)
    {
        if (!Ready(module)) return;
        try { using var f = new LegacyTableBrowserForm(title,table,edit,size); f.ShowDialog(this); }
        catch (Exception ex) { MessageBox.Show(ex.Message,title,MessageBoxButtons.OK,MessageBoxIcon.Warning); }
    }

    void OpenDefinition(string table)
    {
        if (!Ready(PdksModule.Tanimlar)) return; EnsurePersonel(); personel?.OpenOrganizationDefinition(table);
    }

    void OpenDialogModule(PdksModule module)
    {
        if (!Ready(module)) return; EnsurePersonel(); personel?.OpenStandaloneDialog(module);
    }

    void OpenWorkingDate()
    {
        if (!Ready(PdksModule.Donemler)) return; EnsurePersonel(); personel?.ShowWorkingDateDialog();
    }

    void OpenTerminalProfilesAdvanced()
    {
        if (!Ready(PdksModule.Terminal)) return; EnsurePersonel(); personel?.ShowTerminalProfileManager();
    }

    void OpenLegacyKazancKesinti()
    {
        if (!Ready(PdksModule.EkKazancKesinti)) return; EnsurePersonel(); personel?.ShowLegacyKazancKesintiEntry();
    }

    void OpenLegacyIzin()
    {
        if (!Ready(PdksModule.Izinler)) return; EnsurePersonel(); personel?.ShowLegacyIzinEntry();
    }

    void OpenLegacyGirisCikis()
    {
        if (!Ready(PdksModule.GirisCikis)) return;
        using var form = new LegacyGirisCikisForm();
        form.ShowDialog(this);
    }

    void OpenLegacyPuantaj()
    {
        if (!Ready(PdksModule.Puantaj)) return;
        using var form = new LegacyPuantajForm();
        form.ShowDialog(this);
    }

    void OpenLegacyBordro()
    {
        if (!Ready(PdksModule.Bordro)) return;
        using var form = new LegacyBordroForm();
        form.ShowDialog(this);
    }
    void OpenData(LegacyDataView view, PdksModule module)
    {
        if (!Ready(module)) return; using var form = new LegacyDataModuleForm(view); form.ShowDialog(this);
    }

    void ShowEmbedded(Form form)
    {
        if (!ReferenceEquals(activeChild, form)) DisposeActiveChild(); workspace.Controls.Clear(); activeChild=form;
        if (form.Parent != workspace) workspace.Controls.Add(form); if (!form.Visible) form.Show(); form.BringToFront();
    }

    void DisposeActiveChild()
    {
        if (activeChild is null) return; if (!ReferenceEquals(activeChild, personel) && !activeChild.IsDisposed) activeChild.Dispose(); activeChild=null;
    }

    void OpenUserManagement()
    {
        if (!currentUser.IsAdmin) return; using var f = new UserManagementForm(); f.ShowDialog(this);
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

    sealed class LegacyShellRenderer : ToolStripSystemRenderer
    {
        protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e) => e.Graphics.Clear(e.ToolStrip is MenuStrip ? SystemColors.Control : Color.White);
        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (e.Item is not ToolStripButton b) { base.OnRenderButtonBackground(e); return; }
            var r=new Rectangle(0,0,b.Width-1,b.Height-1); var light=b.Pressed||b.Selected?SystemColors.ControlDark:SystemColors.ControlLightLight; var dark=b.Pressed||b.Selected?SystemColors.ControlLightLight:SystemColors.ControlDark;
            using var p1=new Pen(light); using var p2=new Pen(dark); e.Graphics.DrawLine(p1,r.Left,r.Top,r.Right,r.Top); e.Graphics.DrawLine(p1,r.Left,r.Top,r.Left,r.Bottom); e.Graphics.DrawLine(p2,r.Right,r.Top,r.Right,r.Bottom); e.Graphics.DrawLine(p2,r.Left,r.Bottom,r.Right,r.Bottom);
        }
        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            if(e.ToolStrip is MenuStrip)return; using var dark=new Pen(SystemColors.ControlDark); using var light=new Pen(SystemColors.ControlLightLight); var y=e.ToolStrip.Height-3; e.Graphics.DrawLine(dark,0,y,e.ToolStrip.Width,y); e.Graphics.DrawLine(light,0,y+1,e.ToolStrip.Width,y+1);
        }
    }
}
