using System.Diagnostics;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm : Form
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
        WindowState = FormWindowState.Normal;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.Manual;
        var working = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1440, 900);
        Size = new Size(Math.Min(1680, Math.Max(MinimumSize.Width, working.Width - 80)), Math.Min(960, Math.Max(MinimumSize.Height, working.Height - 70)));
        Location = new Point(working.Left + Math.Max(0, (working.Width - Width) / 2), working.Top + Math.Max(0, (working.Height - Height) / 2));
        Font = new Font("Segoe UI",9f);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        ToolStripManager.Renderer = new ModernShellRenderer();
        BuildCanonicalMenuHost();
        BuildStatus();
        Controls.Add(workspace); Controls.Add(tool); Controls.Add(MainMenuStrip!); Controls.Add(status);
        ApplyCanonicalStartup();
        ShowHome();
        InitializeTerminalAutoSync();
        InitializeCloudSync();
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        var command = PdksCommandCatalog.ForShortcut(keyData);
        if (command is not null && CanExecute(command))
        {
            ExecuteCommand(command.Id);
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
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
        workspace.ShowSingle(new ModernHomeDashboard(
            VisiblePrimaryCommands(),
            ExecuteCommand), "home", "Genel Bakış");
        SetModernPage("Genel Bakış", "Günün personel hareketleri ve hızlı işlemler");
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

    void OpenLegacyTerminalSettings() => OpenTerminalCenter();

    void OpenTerminalCenter()
    {
        if (!Ready(PdksModule.Terminal)) return;
        EnsurePersonel();
        var transfer = personel?.CreateTerminalTransferDialog();
        ShowModule(new TerminalCenterForm(transfer, new LegacyTerminalSettingsForm()), PdksModule.Terminal);
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
                OpenTerminalCenter();
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
        ShowModule(new LiveAttendanceHubForm(OpenGirisCikisFor, OpenPersonFor, currentUser.IsSuperAdmin), PdksModule.GunlukOperasyon);
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
        SetModernPage(title, "KY PDKS çalışma alanı");
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
