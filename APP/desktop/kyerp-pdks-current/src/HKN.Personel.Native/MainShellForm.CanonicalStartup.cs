namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool canonicalStartupApplied;

    void ApplyCanonicalStartup()
    {
        if (canonicalStartupApplied || MainMenuStrip is null) return;
        canonicalStartupApplied = true;

        // Stop the older after-show mutation layers. The shell below is the only layout applied.
        operatorEnhancementsApplied = true;
        compactShellFinalized = true;
        shellLayoutInitialized = true;
        try { if (File.Exists(ShellLayoutFile)) File.Delete(ShellLayoutFile); } catch { }

        MainMenuStrip.SuspendLayout();
        tool.SuspendLayout();
        try
        {
            Text = $"KY PDKS 6.3.5 TEST • {branding.ReportHeader} • Operasyon / Puantaj / Bordro";

            var daily = CanonicalTop("Operasyon");
            var hr = CanonicalTop("İnsan Kaynakları");
            var payroll = CanonicalTop("Puantaj ve Bordro");
            var settings = CanonicalTop("Yapılandırma");
            var reports = CanonicalTop("Raporlama ve Denetim");
            var system = CanonicalTop("Sistem Yönetimi");
            var workspaceMenu = CanonicalTop("Çalışma Alanı");
            var support = CanonicalTop("Destek ve Bilgi");

            if (payroll is not null)
            {
                payroll.Text = "Puantaj & Bordro";
                var puantaj = payroll.DropDownItems.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Puantaj İşlemleri", StringComparison.OrdinalIgnoreCase));
                if (puantaj is not null)
                {
                    puantaj.Text = "Puantaj Kontrol / Yeniden Hesaplama";
                    puantaj.ToolTipText = "Kaynak giriş-çıkış, izin, vardiya ve tatil kayıtlarını kontrol eder; gerektiğinde kontrollü yeniden hesaplama açılır.";
                }

                if ((currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin) &&
                    !payroll.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Aylık Düzeltme", StringComparison.OrdinalIgnoreCase)))
                {
                    var monthly = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                        () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
                    payroll.DropDownItems.Insert(Math.Min(2, payroll.DropDownItems.Count), monthly);
                }
            }

            if (daily is not null)
            {
                var oldWorkDate = daily.DropDownItems.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase));
                if (oldWorkDate is not null) daily.DropDownItems.Remove(oldWorkDate);
                RemoveTrailingSeparators(daily.DropDownItems);

                if (!daily.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Kart Basma Kontrolü", StringComparison.OrdinalIgnoreCase)))
                {
                    daily.DropDownItems.Insert(Math.Min(1, daily.DropDownItems.Count), MenuItem(
                        "Kart Basma Kontrolü • Gün / Ay / Tarih Aralığı",
                        PdksModule.GunlukOperasyon,
                        () => ShowModule(new AttendanceHistoryForm(), PdksModule.GunlukOperasyon)));
                }
            }

            if (settings is not null)
            {
                settings.Text = "Ayarlar";
                if (!settings.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Kart Cihazı Ayarları", StringComparison.OrdinalIgnoreCase)))
                {
                    settings.DropDownItems.Insert(0, MenuItem("Terminal / Kart Cihazı Ayarları", PdksModule.Terminal, OpenTerminalSettingsDirect));
                    settings.DropDownItems.Insert(1, new ToolStripSeparator());
                }

                var calendar = settings.DropDownItems.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Takvim", StringComparison.OrdinalIgnoreCase));
                if (calendar is not null && !calendar.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase)))
                {
                    calendar.DropDownItems.Add(new ToolStripSeparator());
                    calendar.DropDownItems.Add(MenuItem("Çalışma Tarihi / İş Günü Ayarı", PdksModule.Donemler, OpenWorkingDate));
                }

                if (workspaceMenu is not null && !settings.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Çalışma Alanı", StringComparison.OrdinalIgnoreCase)))
                {
                    var view = new ToolStripMenuItem("Görünüm / Çalışma Alanı");
                    while (workspaceMenu.DropDownItems.Count > 0)
                    {
                        var item = workspaceMenu.DropDownItems[0];
                        workspaceMenu.DropDownItems.RemoveAt(0);
                        view.DropDownItems.Add(item);
                    }
                    settings.DropDownItems.Add(new ToolStripSeparator());
                    settings.DropDownItems.Add(view);
                }
            }

            if (reports is not null) reports.Text = "Raporlama";

            if (support is not null)
            {
                support.Text = "Destek";
                var about = support.DropDownItems.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Hakkında", StringComparison.OrdinalIgnoreCase));
                if (about is not null) about.Text = "KY PDKS 6.3.5 TEST Hakkında";
                if (!support.DropDownItems.OfType<ToolStripMenuItem>().Any(x => string.Equals(x.Text ?? string.Empty, "Hızlı Kullanım Rehberi", StringComparison.OrdinalIgnoreCase)))
                {
                    var guide = new ToolStripMenuItem("Hızlı Kullanım Rehberi");
                    guide.Click += (_, _) => { using var form = new PdksQuickGuideForm(); form.ShowDialog(this); };
                    support.DropDownItems.Insert(0, guide);
                    support.DropDownItems.Insert(1, new ToolStripSeparator());
                }
            }

            var management = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => string.Equals((x.Text ?? string.Empty).Trim(), "Yönetim", StringComparison.OrdinalIgnoreCase));
            if (management is not null) MainMenuStrip.Items.Remove(management);

            if (currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin)
            {
                management = new ToolStripMenuItem("Yönetim");
                var quick = new ToolStripMenuItem("Hızlı İşlemler")
                {
                    ToolTipText = "Personel, kart hareketi, E/hariç tutma, TNF, veri kontrol ve bordro düzeltme merkezi"
                };
                quick.Click += (_, _) => { using var form = new ResponsibleQuickOperationsForm(this); form.ShowDialog(this); };
                management.DropDownItems.Add(quick);

                if (currentUser.IsSuperAdmin)
                {
                    management.DropDownItems.Add(new ToolStripSeparator());
                    var refresh = new ToolStripMenuItem("Hedef'ten Güncel Personel / Veri Al");
                    refresh.Click += async (_, _) => await RefreshFromHedefLiveAsync();
                    management.DropDownItems.Add(refresh);

                    var license = new ToolStripMenuItem("Lisans Yönetimi");
                    license.Click += (_, _) => { using var form = new CompanyLicenseCenterForm(); form.ShowDialog(this); };
                    management.DropDownItems.Add(license);

                    if (system is not null)
                    {
                        var systemSub = new ToolStripMenuItem("Sistem");
                        while (system.DropDownItems.Count > 0)
                        {
                            var item = system.DropDownItems[0];
                            system.DropDownItems.RemoveAt(0);
                            systemSub.DropDownItems.Add(item);
                        }
                        management.DropDownItems.Add(new ToolStripSeparator());
                        management.DropDownItems.Add(systemSub);
                    }
                }
                MainMenuStrip.Items.Add(management);
            }

            if (system is not null) MainMenuStrip.Items.Remove(system);
            if (workspaceMenu is not null) MainMenuStrip.Items.Remove(workspaceMenu);

            HideDisabledLeafItems(MainMenuStrip.Items);
            ReorderCanonicalTopMenus(["Genel Bakış", "Operasyon", "İnsan Kaynakları", "Puantaj & Bordro", "Raporlama", "Yönetim", "Ayarlar", "Destek"]);

            foreach (var top in MainMenuStrip.Items.OfType<ToolStripMenuItem>())
            {
                top.Image = null;
                top.Padding = new Padding(5, 0, 5, 0);
                top.Margin = Padding.Empty;
            }

            foreach (var old in MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                         .Where(x => (x.Text ?? string.Empty).StartsWith("REV 6.", StringComparison.OrdinalIgnoreCase)).ToArray())
                MainMenuStrip.Items.Remove(old);
            MainMenuStrip.Items.Add(new ToolStripMenuItem("REV 6.3.5 TEST")
            {
                Alignment = ToolStripItemAlignment.Right,
                Enabled = false,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(190, 82, 54)
            });

            MainMenuStrip.AutoSize = false;
            MainMenuStrip.Height = 32;
            MainMenuStrip.Padding = new Padding(6, 3, 0, 2);
            MainMenuStrip.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
            MainMenuStrip.ContextMenuStrip = null;

            var allowedToolbar = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Genel Bakış", "Canlı İzleme", "Terminal", "Giriş-Çıkış", "Personel", "Puantaj", "Bordro"
            };
            tool.Height = 60;
            tool.ImageScalingSize = new Size(25, 25);
            tool.Padding = new Padding(6, 2, 0, 2);
            tool.ContextMenuStrip = null;
            foreach (var button in tool.Items.OfType<ToolStripButton>())
            {
                button.Visible = allowedToolbar.Contains(button.Text ?? string.Empty) && button.Enabled;
                button.AutoSize = false;
                button.Height = 52;
                button.Width = (button.Text ?? string.Empty) is "Canlı İzleme" or "Giriş-Çıkış" ? 86 : 76;
                button.Font = new Font("Segoe UI", 7.8f, FontStyle.Bold);
                button.Padding = new Padding(1);
                button.Margin = new Padding(1, 0, 1, 0);
            }
        }
        finally
        {
            tool.ResumeLayout(true);
            MainMenuStrip.ResumeLayout(true);
        }
    }

    ToolStripMenuItem? CanonicalTop(string text) => MainMenuStrip?.Items.OfType<ToolStripMenuItem>()
        .FirstOrDefault(x => string.Equals((x.Text ?? string.Empty).Trim(), text, StringComparison.OrdinalIgnoreCase));

    void ReorderCanonicalTopMenus(IReadOnlyList<string> order)
    {
        if (MainMenuStrip is null) return;
        var index = 0;
        foreach (var name in order)
        {
            var item = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => string.Equals((x.Text ?? string.Empty).Trim(), name, StringComparison.OrdinalIgnoreCase));
            if (item is null || !item.Visible || item.Alignment == ToolStripItemAlignment.Right) continue;
            MainMenuStrip.Items.Remove(item);
            MainMenuStrip.Items.Insert(Math.Min(index++, MainMenuStrip.Items.Count), item);
        }
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

    static void RemoveTrailingSeparators(ToolStripItemCollection items)
    {
        while (items.Count > 0 && items[^1] is ToolStripSeparator) items.RemoveAt(items.Count - 1);
    }
}
