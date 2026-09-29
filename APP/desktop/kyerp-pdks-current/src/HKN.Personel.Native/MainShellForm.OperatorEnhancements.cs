namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool operatorEnhancementsApplied;
    bool compactShellFinalized;

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (!operatorEnhancementsApplied)
        {
            operatorEnhancementsApplied = true;
            ApplyOperatorEnhancements();
        }

        // Menu/toolbar customization is applied after the first stable window bounds were set in OnLoad.
        // Do not resize/reposition the window here: doing that after first paint caused a visible SHOW/jump.
        InitializeShellLayoutCustomization();
        FinalizeCompactShell();
    }

    void ApplyOperatorEnhancements()
    {
        if (MainMenuStrip is null) return;
        Text = $"KY PDKS 6.3.4 TEST • {branding.ReportHeader} • Operasyon / Puantaj / Bordro";

        MainMenuStrip.AutoSize = false;
        MainMenuStrip.Height = 31;
        MainMenuStrip.Padding = new Padding(5, 3, 0, 2);
        MainMenuStrip.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);

        var payroll = FindTop("Puantaj ve Bordro");
        if (payroll is not null)
        {
            var puantaj = payroll.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Puantaj İşlemleri", StringComparison.OrdinalIgnoreCase));
            if (puantaj is not null)
            {
                puantaj.Text = "Puantaj Kontrol / Yeniden Hesaplama";
                puantaj.ToolTipText = "Puantaj giriş-çıkış, izin, vardiya ve tatil bilgilerinden türetilir. Kaynak kayıt değişince sonuç kontrol edilir; gerektiğinde kontrollü yeniden hesaplama kullanılır.";
            }

            if (!payroll.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Aylık Düzeltme", StringComparison.OrdinalIgnoreCase)))
            {
                var item = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                    () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
                item.Visible = currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin;
                payroll.DropDownItems.Insert(Math.Min(2, payroll.DropDownItems.Count), item);
            }
        }

        var reports = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("Raporlama", StringComparison.OrdinalIgnoreCase));
        if (reports is not null) reports.Text = "Raporlama";

        var definitions = FindTop("Yapılandırma");
        if (definitions is not null)
        {
            definitions.Text = "Ayarlar";

            if (!definitions.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Kart Cihazı Ayarları", StringComparison.OrdinalIgnoreCase)))
            {
                var terminalSettings = MenuItem("Terminal / Kart Cihazı Ayarları", PdksModule.Terminal, OpenTerminalSettingsDirect);
                terminalSettings.ToolTipText = "Cihaz1, Makine No, Ethernet/COM, IP, port, baudrate, giriş/çıkış ve güvenli aktarım ayarları.";
                definitions.DropDownItems.Insert(0, terminalSettings);
                definitions.DropDownItems.Insert(1, new ToolStripSeparator());
            }

            var calendar = definitions.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Takvim", StringComparison.OrdinalIgnoreCase));
            if (calendar is not null && !calendar.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase)))
            {
                calendar.DropDownItems.Add(new ToolStripSeparator());
                calendar.DropDownItems.Add(MenuItem("Çalışma Tarihi / İş Günü Ayarı", PdksModule.Donemler, OpenWorkingDate));
            }
        }

        var daily = FindTop("Operasyon");
        if (daily is not null)
        {
            var oldWorkDate = daily.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase));
            if (oldWorkDate is not null) daily.DropDownItems.Remove(oldWorkDate);
            while (daily.DropDownItems.Count > 0 && daily.DropDownItems[^1] is ToolStripSeparator)
                daily.DropDownItems.RemoveAt(daily.DropDownItems.Count - 1);

            if (!daily.DropDownItems.OfType<ToolStripMenuItem>().Any(x => (x.Text ?? string.Empty).Contains("Kart Basma Kontrolü", StringComparison.OrdinalIgnoreCase)))
            {
                daily.DropDownItems.Insert(Math.Min(1, daily.DropDownItems.Count), MenuItem(
                    "Kart Basma Kontrolü • 7 Gün / Aylık",
                    PdksModule.GunlukOperasyon,
                    () => ShowModule(new AttendanceHistoryForm(), PdksModule.GunlukOperasyon)));
            }
        }

        var support = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("Destek", StringComparison.OrdinalIgnoreCase));
        if (support is not null)
        {
            support.Text = "Destek";
            var oldAbout = support.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Hakkında", StringComparison.OrdinalIgnoreCase));
            if (oldAbout is not null) oldAbout.Text = "KY PDKS 6.3.4 TEST Hakkında";
            if (!support.DropDownItems.OfType<ToolStripMenuItem>().Any(x => string.Equals(x.Text ?? string.Empty, "Hızlı Kullanım Rehberi", StringComparison.OrdinalIgnoreCase)))
            {
                var guide = new ToolStripMenuItem("Hızlı Kullanım Rehberi")
                {
                    ToolTipText = "Canlı takipten bordroya kadar ekranların amacı ve güvenli işlem sırasını gösterir."
                };
                guide.Click += (_, _) => { using var form = new PdksQuickGuideForm(); form.ShowDialog(this); };
                support.DropDownItems.Insert(0, guide);
                if (support.DropDownItems.Count > 1 && support.DropDownItems[1] is not ToolStripSeparator)
                    support.DropDownItems.Insert(1, new ToolStripSeparator());
            }
        }

        ConfigureRoleMenus();
        HideUnauthorizedChildren(MainMenuStrip.Items);

        foreach (var top in MainMenuStrip.Items.OfType<ToolStripMenuItem>())
        {
            top.Image = null;
            top.Padding = new Padding(4, 0, 4, 0);
            top.Margin = new Padding(0);
        }

        tool.Height = 62;
        tool.ImageScalingSize = new Size(26, 26);
        tool.Padding = new Padding(5, 2, 0, 2);
        foreach (var button in tool.Items.OfType<ToolStripButton>())
        {
            button.Height = 54;
            button.Width = button.Text switch
            {
                "Canlı İzleme" => 82,
                "Giriş-Çıkış" => 84,
                _ => 74
            };
            button.Font = new Font("Segoe UI", 7.8f, FontStyle.Bold);
            button.Padding = new Padding(1, 2, 1, 1);
            button.Margin = new Padding(1, 0, 1, 0);
            if (!button.Enabled) button.Visible = false;
        }

        foreach (var old in MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                     .Where(x => (x.Text ?? string.Empty).StartsWith("REV 6.", StringComparison.OrdinalIgnoreCase)).ToArray())
            MainMenuStrip.Items.Remove(old);

        MainMenuStrip.Items.Add(new ToolStripMenuItem("REV 6.3.4 TEST")
        {
            Alignment = ToolStripItemAlignment.Right,
            Enabled = false,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(190, 82, 54)
        });
    }

    void FinalizeCompactShell()
    {
        if (MainMenuStrip is null) return;

        if (!compactShellFinalized)
        {
            compactShellFinalized = true;
            var system = FindTop("Sistem Yönetimi");
            var management = FindTop("Yönetim");
            if (system is not null && management is not null && currentUser.IsSuperAdmin)
            {
                var systemSub = new ToolStripMenuItem("Sistem") { ToolTipText = "Veritabanı, terminal, yedekleme ve kullanıcı yönetimi" };
                while (system.DropDownItems.Count > 0)
                {
                    var item = system.DropDownItems[0];
                    system.DropDownItems.RemoveAt(0);
                    systemSub.DropDownItems.Add(item);
                }
                if (management.DropDownItems.Count > 0) management.DropDownItems.Add(new ToolStripSeparator());
                management.DropDownItems.Add(systemSub);
            }
            if (system is not null) system.Visible = false;

            var workspaceMenu = FindTop("Çalışma Alanı");
            var settings = FindTop("Ayarlar");
            if (workspaceMenu is not null && settings is not null)
            {
                var workspaceSub = new ToolStripMenuItem("Çalışma Alanı / Görünüm");
                while (workspaceMenu.DropDownItems.Count > 0)
                {
                    var item = workspaceMenu.DropDownItems[0];
                    workspaceMenu.DropDownItems.RemoveAt(0);
                    workspaceSub.DropDownItems.Add(item);
                }
                settings.DropDownItems.Add(new ToolStripSeparator());
                settings.DropDownItems.Add(workspaceSub);
            }
            if (workspaceMenu is not null) workspaceMenu.Visible = false;

            var payroll = FindTop("Puantaj ve Bordro");
            if (payroll is not null) payroll.Text = "Puantaj & Bordro";

            ReorderTopMenus(["Genel Bakış", "Operasyon", "İnsan Kaynakları", "Puantaj & Bordro", "Raporlama", "Yönetim", "Ayarlar", "Destek"]);
        }
    }

    ToolStripMenuItem? FindTop(string text) => MainMenuStrip?.Items.OfType<ToolStripMenuItem>()
        .FirstOrDefault(x => string.Equals((x.Text ?? string.Empty).Trim(), text, StringComparison.OrdinalIgnoreCase));

    void ReorderTopMenus(string[] order)
    {
        if (MainMenuStrip is null) return;
        var index = 0;
        foreach (var name in order)
        {
            var item = FindTop(name);
            if (item is null || !item.Visible) continue;
            MainMenuStrip.Items.Remove(item);
            MainMenuStrip.Items.Insert(Math.Min(index++, MainMenuStrip.Items.Count), item);
        }
    }

    static void HideUnauthorizedChildren(ToolStripItemCollection items)
    {
        foreach (ToolStripItem item in items)
        {
            if (item is not ToolStripMenuItem menu) continue;
            if (menu.DropDownItems.Count > 0) HideUnauthorizedChildren(menu.DropDownItems);
            if (!menu.Enabled && menu.DropDownItems.Count == 0) menu.Visible = false;
        }
    }
}
