namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool canonicalStartupApplied;

    void ApplyCanonicalStartup()
    {
        if (canonicalStartupApplied || MainMenuStrip is null) return;
        canonicalStartupApplied = true;

        // One shell, one layout. Do not mutate or re-order the menu after first paint.
        operatorEnhancementsApplied = true;
        compactShellFinalized = true;
        shellLayoutInitialized = true;
        try { if (File.Exists(ShellLayoutFile)) File.Delete(ShellLayoutFile); } catch { }

        SuspendLayout();
        MainMenuStrip.SuspendLayout();
        tool.SuspendLayout();
        try
        {
            Text = $"KY PDKS 6.4.0 CANLI • {branding.ReportHeader}";
            workspace.ApplyLayout(WorkspaceLayoutMode.Single);
            BuildSimpleCanonicalMenu();
            BuildSimpleCanonicalToolbar();
        }
        finally
        {
            tool.ResumeLayout(false);
            MainMenuStrip.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }
    }

    void BuildSimpleCanonicalMenu()
    {
        if (MainMenuStrip is null) return;
        MainMenuStrip.Items.Clear();

        var general = PlainItem("Genel", ShowHome);

        var operation = TopMenu("Operasyon");
        operation.DropDownItems.Add(MenuItem("Canlı Personel Denetimi", PdksModule.GunlukOperasyon, OpenLiveAttendance));
        operation.DropDownItems.Add(MenuItem("Kart Basma Kontrolü • Gün / 7 Gün / Ay", PdksModule.GunlukOperasyon,
            () => ShowModule(new AttendanceHistoryForm(), PdksModule.GunlukOperasyon)));
        operation.DropDownItems.Add(new ToolStripSeparator());
        operation.DropDownItems.Add(MenuItem("Terminal / Kart Cihazı", PdksModule.Terminal, OpenTerminalCenter));
        operation.DropDownItems.Add(MenuItem("Giriş / Çıkış Kayıtları", PdksModule.GirisCikis, OpenLegacyGirisCikis));

        var personnel = TopMenu("Personel");
        personnel.DropDownItems.Add(MenuItem("Personel Kartları", PdksModule.Personel, OpenPersonel));
        personnel.DropDownItems.Add(MenuItem("İzin Yönetimi", PdksModule.Izinler, OpenLegacyIzin));
        personnel.DropDownItems.Add(MenuItem("Ek Kazanç / Kesinti", PdksModule.EkKazancKesinti, OpenLegacyKazancKesinti));
        personnel.DropDownItems.Add(MenuItem("Çalışma Süresi Düzeltmeleri", PdksModule.Personel,
            () => OpenLegacyTable("Çalışma Süresi Düzeltmeleri", "PERTIMESHIFT", true, new Size(1080, 680))));

        var payroll = TopMenu("Puantaj & Bordro");
        var timesheet = MenuItem("Puantaj Kontrol / Yeniden Hesaplama", PdksModule.Puantaj, OpenLegacyPuantaj);
        timesheet.ToolTipText = "Giriş-çıkış, izin, vardiya ve tatil kayıtlarından oluşan puantajı kontrol eder. Kaynak değişmediyse yeniden hesaplama gerekmez.";
        payroll.DropDownItems.Add(timesheet);
        payroll.DropDownItems.Add(MenuItem("Puantaj Sonuçları", PdksModule.Puantaj,
            () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));
        payroll.DropDownItems.Add(new ToolStripSeparator());
        payroll.DropDownItems.Add(MenuItem("Personel Ödemeleri", PdksModule.Bordro,
            () => OpenPersonelTab(PdksModule.Bordro)));
        payroll.DropDownItems.Add(MenuItem("Genel Maaş Bordrosu", PdksModule.Bordro, OpenLegacyBordro));
        if (currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin)
            payroll.DropDownItems.Add(MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro)));

        var reports = TopMenu("Raporlar");
        reports.DropDownItems.Add(MenuItem("Rapor ve Çıktı Merkezi", PdksModule.Raporlar,
            () => ShowModule(new ReportCenterForm(), PdksModule.Raporlar)));
        reports.DropDownItems.Add(new ToolStripSeparator());
        reports.DropDownItems.Add(MenuItem("Personel Listesi", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.PersonnelList)));
        reports.DropDownItems.Add(MenuItem("İzinli Personel", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.LeavePersonnel)));
        reports.DropDownItems.Add(MenuItem("Ek Kazanç / Kesinti Raporu", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.EarningsDeductions)));
        reports.DropDownItems.Add(MenuItem("Yıllık İzin Hakedişleri", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.AnnualLeaveEntitlements)));

        ToolStripMenuItem? management = null;
        if (currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin)
        {
            management = TopMenu("Yönetim");
            var quick = new ToolStripMenuItem("Hızlı İşlemler");
            quick.Click += (_, _) => { using var form = new ResponsibleQuickOperationsForm(this); form.ShowDialog(this); };
            management.DropDownItems.Add(quick);

            if (currentUser.IsSuperAdmin)
            {
                management.DropDownItems.Add(new ToolStripSeparator());
                var refresh = new ToolStripMenuItem("Hedef'ten Güncel Personel / Veri Al");
                refresh.Click += async (_, _) => await RefreshFromHedefLiveAsync();
                management.DropDownItems.Add(refresh);
                management.DropDownItems.Add(PlainItem("Hızlı Veri Kaynakları (FDB / TNF)", () => new QuickDataSourceForm().ShowDialog(this)));
                management.DropDownItems.Add(PlainItem("Yedekleme / Geri Yükleme", () => new BackupRestoreForm().ShowDialog(this)));
                management.DropDownItems.Add(PlainItem("Kullanıcı Yönetimi", OpenUserManagement));
                management.DropDownItems.Add(PlainItem("Lisans Yönetimi", () => new CompanyLicenseCenterForm().ShowDialog(this)));
            }
        }

        var settings = TopMenu("Ayarlar");
        settings.DropDownItems.Add(MenuItem("Terminal / Kart Cihazı Ayarları", PdksModule.Terminal, OpenTerminalSettingsDirect));
        settings.DropDownItems.Add(MenuItem("Çalışma Tarihi / İş Günü", PdksModule.Donemler, OpenWorkingDate));
        settings.DropDownItems.Add(new ToolStripSeparator());
        settings.DropDownItems.Add(MenuItem("Vardiya / Çalışma Grupları", PdksModule.Tanimlar, OpenGroups));
        settings.DropDownItems.Add(MenuItem("Dönem Yönetimi", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));

        var org = TopMenu("Organizasyon");
        org.DropDownItems.Add(MenuItem("Bölümler", PdksModule.Tanimlar, () => OpenDefinitions("Bölümler")));
        org.DropDownItems.Add(MenuItem("Servisler", PdksModule.Tanimlar, () => OpenDefinitions("Servisler")));
        org.DropDownItems.Add(MenuItem("Görevler", PdksModule.Tanimlar, () => OpenDefinitions("Görevler")));
        org.DropDownItems.Add(MenuItem("Personel Durumları", PdksModule.Tanimlar, () => OpenDefinitions("Durum")));
        org.DropDownItems.Add(MenuItem("Firma Bilgileri", PdksModule.Tanimlar, () => OpenDefinitions("Firma")));
        settings.DropDownItems.Add(org);

        var calendar = TopMenu("Takvim / Çalışma Planı");
        calendar.DropDownItems.Add(MenuItem("Genel Tatiller", PdksModule.Tanimlar,
            () => OpenLegacyTable("Genel Tatiller", "TATIL", true, new Size(1040, 680))));
        calendar.DropDownItems.Add(MenuItem("Günlük Çalışma Saatleri", PdksModule.Tanimlar,
            () => OpenLegacyTable("Günlük Çalışma Saatleri", "PUANBILGI", true, new Size(1120, 700))));
        calendar.DropDownItems.Add(MenuItem("Yıllık Çalışma Planı", PdksModule.Tanimlar,
            () => OpenLegacyTable("Yıllık Çalışma Planı", "PLANA", true, new Size(1180, 720))));
        settings.DropDownItems.Add(calendar);

        var help = TopMenu("Yardım");
        help.DropDownItems.Add(PlainItem("Hızlı Kullanım Rehberi", () => { using var form = new PdksQuickGuideForm(); form.ShowDialog(this); }));
        help.DropDownItems.Add(PlainItem("KY PDKS Hakkında", () => new AboutKy6Form().ShowDialog(this)));
        help.DropDownItems.Add(PlainItem("KY ERP Web Sitesi", OpenErpSite));

        var topItems = new List<ToolStripItem> { general, operation, personnel, payroll, reports };
        if (management is not null) topItems.Add(management);
        topItems.Add(settings);
        topItems.Add(help);
        MainMenuStrip.Items.AddRange(topItems.ToArray());

        HideDisabledLeafItems(MainMenuStrip.Items);
        RemoveEmptyTopMenus();

        MainMenuStrip.AutoSize = false;
        MainMenuStrip.Height = 30;
        MainMenuStrip.Padding = new Padding(6, 2, 0, 1);
        MainMenuStrip.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        MainMenuStrip.BackColor = Color.FromArgb(248, 249, 251);
        MainMenuStrip.ContextMenuStrip = null;
        MainMenuStrip.ShowItemToolTips = true;
        foreach (var item in MainMenuStrip.Items.OfType<ToolStripMenuItem>())
        {
            item.Image = null;
            item.AutoSize = true;
            item.Padding = new Padding(5, 0, 5, 0);
            item.Margin = Padding.Empty;
        }
    }

    void BuildSimpleCanonicalToolbar()
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Genel Bakış", "Canlı İzleme", "Terminal", "Giriş-Çıkış", "Personel", "Puantaj", "Bordro"
        };
        tool.Height = 58;
        tool.ImageScalingSize = new Size(24, 24);
        tool.Padding = new Padding(5, 1, 0, 1);
        tool.ContextMenuStrip = null;
        tool.RenderMode = ToolStripRenderMode.System;
        foreach (var button in tool.Items.OfType<ToolStripButton>())
        {
            button.Visible = allowed.Contains(button.Text ?? string.Empty) && button.Enabled;
            button.AutoSize = false;
            button.Height = 52;
            button.Width = (button.Text ?? string.Empty) is "Canlı İzleme" or "Giriş-Çıkış" ? 82 : 72;
            button.Font = new Font("Segoe UI", 7.6f, FontStyle.Regular);
            button.Padding = Padding.Empty;
            button.Margin = new Padding(1, 0, 1, 0);
        }
    }

    static ToolStripMenuItem TopMenu(string text) => new(text) { Image = null };

    void RemoveEmptyTopMenus()
    {
        if (MainMenuStrip is null) return;
        foreach (var menu in MainMenuStrip.Items.OfType<ToolStripMenuItem>().ToArray())
            if (menu.DropDownItems.Count == 0 && menu.Text != "Genel")
                MainMenuStrip.Items.Remove(menu);
    }

    static void HideDisabledLeafItems(ToolStripItemCollection items)
    {
        foreach (ToolStripItem item in items)
        {
            if (item is not ToolStripMenuItem menu) continue;
            if (menu.DropDownItems.Count > 0) HideDisabledLeafItems(menu.DropDownItems);
            if (menu.DropDownItems.Count == 0 && !menu.Enabled) menu.Visible = false;
        }
    }
}
