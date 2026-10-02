namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool canonicalStartupApplied;

    void ApplyCanonicalStartup()
    {
        if (canonicalStartupApplied || MainMenuStrip is null) return;
        canonicalStartupApplied = true;

        SuspendLayout();
        MainMenuStrip.SuspendLayout();
        tool.SuspendLayout();
        try
        {
            Text = $"KY PDKS • {branding.ReportHeader}";
            workspace.ApplyLayout(WorkspaceLayoutMode.Single);
            BuildModernShell();
        }
        finally
        {
            tool.ResumeLayout(false);
            MainMenuStrip.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }
    }

    void BuildCanonicalMenu()
    {
        if (MainMenuStrip is null) return;
        MainMenuStrip.Items.Clear();

        var home = PlainItem("ANA SAYFA", ShowHome);

        var operations = TopMenu("İŞLEMLER");
        operations.DropDownItems.Add(MenuItem("Canlı Kart Kontrol", PdksModule.GunlukOperasyon, OpenLiveAttendance));
        operations.DropDownItems.Add(MenuItem("Terminalden Veri Al", PdksModule.Terminal, OpenTerminalCenter));
        operations.DropDownItems.Add(MenuItem("Giriş / Çıkış", PdksModule.GirisCikis, OpenLegacyGirisCikis));
        operations.DropDownItems.Add(MenuItem("Eksik / Hatalı Kayıtlar", PdksModule.GunlukOperasyon,
            () => ShowModule(new AttendanceHistoryForm(), PdksModule.GunlukOperasyon)));
        var bulk = PlainItem("Toplu İşlemler", () =>
        {
            using var form = new ResponsibleQuickOperationsForm(this);
            form.ShowDialog(this);
        });
        bulk.Enabled = currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin;
        operations.DropDownItems.Add(bulk);

        var personnel = TopMenu("PERSONEL");
        personnel.DropDownItems.Add(MenuItem("Personel Kartları", PdksModule.Personel, OpenPersonel));
        personnel.DropDownItems.Add(MenuItem("İzinler", PdksModule.Izinler, OpenLegacyIzin));
        personnel.DropDownItems.Add(MenuItem("Ek Kazanç / Kesinti / Avans", PdksModule.EkKazancKesinti, OpenLegacyKazancKesinti));
        personnel.DropDownItems.Add(MenuItem("Maaş / Ödeme Geçmişi", PdksModule.Bordro,
            () => OpenPersonelTab(PdksModule.Bordro)));

        var timesheet = TopMenu("PUANTAJ");
        timesheet.DropDownItems.Add(MenuItem("Günlük Puantaj", PdksModule.Puantaj, () => OpenPuantaj(0)));
        timesheet.DropDownItems.Add(MenuItem("Aylık Puantaj", PdksModule.Puantaj, () => OpenPuantaj(1)));
        timesheet.DropDownItems.Add(MenuItem("Puantaj Sonuçları", PdksModule.Puantaj,
            () => OpenData(LegacyDataView.PuantajSonuclari, PdksModule.Puantaj)));
        timesheet.DropDownItems.Add(MenuItem("Puantaj Kontrol / Yeniden Hesaplama", PdksModule.Puantaj, () => OpenPuantaj(1)));

        var payroll = TopMenu("BORDRO");
        payroll.DropDownItems.Add(MenuItem("Genel Bordro", PdksModule.Bordro, () => OpenBordro(0)));
        payroll.DropDownItems.Add(MenuItem("Personel Ödemeleri", PdksModule.Bordro, () => OpenPersonelTab(PdksModule.Bordro)));
        var adjustment = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
            () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
        adjustment.Visible = currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin;
        payroll.DropDownItems.Add(adjustment);
        payroll.DropDownItems.Add(MenuItem("Maaş Bordrosu", PdksModule.Bordro, () => OpenBordro(2)));
        payroll.DropDownItems.Add(MenuItem("Mesai Bordrosu", PdksModule.Bordro, () => OpenBordro(1)));

        var reports = TopMenu("RAPORLAR");
        reports.DropDownItems.Add(MenuItem("Personel", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.PersonnelList)));
        reports.DropDownItems.Add(MenuItem("Giriş / Çıkış", PdksModule.Raporlar, () => OpenReportCenter("Giriş Çıkış")));
        reports.DropDownItems.Add(MenuItem("İzin", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.LeavePersonnel)));
        reports.DropDownItems.Add(MenuItem("Ek Kazanç / Kesinti", PdksModule.Raporlar,
            () => OpenOperationalReport(LegacyOperationalReport.EarningsDeductions)));
        reports.DropDownItems.Add(MenuItem("Puantaj", PdksModule.Raporlar, () => OpenReportCenter("Puantaj")));
        reports.DropDownItems.Add(MenuItem("Bordro", PdksModule.Raporlar, () => OpenReportCenter("Bordro")));
        reports.DropDownItems.Add(MenuItem("Organizasyon", PdksModule.Raporlar, () => OpenReportCenter("Tanımlar")));
        reports.DropDownItems.Add(MenuItem("Rapor ve Çıktı Merkezi", PdksModule.Raporlar, () => OpenReportCenter(null)));

        var definitions = TopMenu("TANIMLAR");
        definitions.DropDownItems.Add(MenuItem("Çalışma Grupları / Vardiyalar", PdksModule.Tanimlar, OpenGroups));
        definitions.DropDownItems.Add(MenuItem("Dönemler", PdksModule.Donemler, () => OpenDialogModule(PdksModule.Donemler)));

        var organization = TopMenu("Organizasyon");
        organization.DropDownItems.Add(MenuItem("Bölümler", PdksModule.Tanimlar, () => OpenDefinitions("Bölümler")));
        organization.DropDownItems.Add(MenuItem("Servisler", PdksModule.Tanimlar, () => OpenDefinitions("Servisler")));
        organization.DropDownItems.Add(MenuItem("Görevler", PdksModule.Tanimlar, () => OpenDefinitions("Görevler")));
        organization.DropDownItems.Add(MenuItem("Personel Durumları", PdksModule.Tanimlar, () => OpenDefinitions("Durum")));
        organization.DropDownItems.Add(MenuItem("Firma", PdksModule.Tanimlar, () => OpenDefinitions("Firma")));
        definitions.DropDownItems.Add(organization);

        var calendar = TopMenu("Takvim / Çalışma Planı");
        calendar.DropDownItems.Add(MenuItem("Genel Tatiller", PdksModule.Tanimlar,
            () => OpenLegacyTable("Genel Tatiller", "TATIL", true, new Size(1040, 680))));
        calendar.DropDownItems.Add(MenuItem("Günlük Çalışma Saatleri", PdksModule.Tanimlar,
            () => OpenLegacyTable("Günlük Çalışma Saatleri", "PUANBILGI", true, new Size(1120, 700))));
        calendar.DropDownItems.Add(MenuItem("Yıllık Çalışma Planı", PdksModule.Tanimlar,
            () => OpenLegacyTable("Yıllık Çalışma Planı", "PLANA", true, new Size(1180, 720))));
        definitions.DropDownItems.Add(calendar);

        var money = TopMenu("Bordro / Kazanç / Kesinti Türleri");
        money.DropDownItems.Add(MenuItem("Bordro Alanları", PdksModule.Tanimlar, () => OpenDefinitions("Bordro")));
        money.DropDownItems.Add(MenuItem("Kazanç / Kesinti Türleri", PdksModule.Tanimlar,
            () => OpenLegacyTable("Kazanç / Kesinti Türleri", "AVTUR", true, new Size(1040, 680))));
        definitions.DropDownItems.Add(money);

        var system = TopMenu("SİSTEM");
        system.DropDownItems.Add(MenuItem("Kart Cihazı / Terminal Ayarları", PdksModule.Terminal, OpenTerminalSettingsDirect));
        system.DropDownItems.Add(PlainItem("FDB / TNF Veri Kaynakları", () => new QuickDataSourceForm().ShowDialog(this)));
        system.DropDownItems.Add(PlainItem("Yedekleme / Geri Yükleme", () => new BackupRestoreForm().ShowDialog(this)));
        var users = PlainItem("Kullanıcı / Yetki", OpenUserManagement);
        users.Enabled = currentUser.IsAdmin;
        system.DropDownItems.Add(users);
        var license = PlainItem("Lisans", () => new CompanyLicenseCenterForm().ShowDialog(this));
        license.Enabled = currentUser.IsSuperAdmin;
        system.DropDownItems.Add(license);
        system.DropDownItems.Add(PlainItem("Entegrasyonlar", () => new IntegrationCenterForm(this, currentUser).ShowDialog(this)));
        system.DropDownItems.Add(PlainItem("Değişiklik / İşlem Geçmişi", () => new AuditHistoryForm().ShowDialog(this)));

        var help = TopMenu("YARDIM");
        help.DropDownItems.Add(PlainItem("Hızlı Kullanım Rehberi", () => new PdksQuickGuideForm().ShowDialog(this)));
        help.DropDownItems.Add(PlainItem("Hakkında", () => new AboutKy6Form().ShowDialog(this)));

        MainMenuStrip.Items.AddRange([home, operations, personnel, timesheet, payroll, reports, definitions, system, help]);
        HideDisabledLeafItems(MainMenuStrip.Items);

        MainMenuStrip.AutoSize = false;
        MainMenuStrip.Height = 34;
        MainMenuStrip.Padding = new Padding(10, 3, 0, 2);
        MainMenuStrip.Font = new Font("Segoe UI", 9.2f, FontStyle.Bold);
        MainMenuStrip.BackColor = Color.FromArgb(248, 249, 251);
        MainMenuStrip.ContextMenuStrip = null;
        MainMenuStrip.ShowItemToolTips = true;
        foreach (var item in MainMenuStrip.Items.OfType<ToolStripMenuItem>())
        {
            item.Image = null;
            item.AutoSize = true;
            item.Padding = new Padding(9, 0, 9, 0);
            item.Margin = new Padding(1, 0, 1, 0);
            item.DropDown.MinimumSize = new Size(260, 0);
        }
    }

    void BuildCanonicalToolbar()
    {
        tool.Height = 58;
        tool.ImageScalingSize = new Size(24, 24);
        tool.Padding = new Padding(10, 2, 0, 2);
        tool.ContextMenuStrip = null;
        tool.RenderMode = ToolStripRenderMode.System;
        tool.CanOverflow = false;
        tool.LayoutStyle = ToolStripLayoutStyle.HorizontalStackWithOverflow;
        foreach (var button in tool.Items.OfType<ToolStripButton>())
        {
            button.Visible = button.Enabled;
            button.AutoSize = false;
            button.Height = 52;
            button.Width = (button.Text ?? string.Empty) is "Canlı" or "Giriş / Çıkış" ? 88 : 78;
            button.Font = new Font("Segoe UI", 7.8f);
            button.Padding = Padding.Empty;
            button.Margin = new Padding(3, 0, 3, 0);
        }
    }

    static ToolStripMenuItem TopMenu(string text) => new(text) { Image = null };

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
