namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool operatorEnhancementsApplied;

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (!operatorEnhancementsApplied)
        {
            operatorEnhancementsApplied = true;
            ApplyOperatorEnhancements();
        }
        InitializeShellLayoutCustomization();
    }

    void ApplyOperatorEnhancements()
    {
        if (MainMenuStrip is null) return;
        Text = $"KY PDKS 6.3 TEST • {branding.ReportHeader} • Operasyon / Puantaj / Bordro";

        MainMenuStrip.AutoSize = false;
        MainMenuStrip.Height = 32;
        MainMenuStrip.Padding = new Padding(8, 3, 0, 2);
        MainMenuStrip.Font = new Font("Segoe UI", 9f, FontStyle.Bold);

        var payroll = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Puantaj ve Bordro", StringComparison.OrdinalIgnoreCase));
        if (payroll is not null)
        {
            var puantaj = payroll.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Puantaj İşlemleri", StringComparison.OrdinalIgnoreCase));
            if (puantaj is not null)
            {
                puantaj.Text = "Puantaj Kontrol / Yeniden Hesaplama";
                puantaj.ToolTipText = "Puantaj normalde giriş-çıkış, izin, vardiya ve tatil değişiklikleriyle güncel tutulur. Gerekirse bu ekrandan kontrollü yeniden hesaplanır.";
            }

            if (!payroll.DropDownItems.OfType<ToolStripMenuItem>()
                .Any(x => (x.Text ?? string.Empty).Contains("Aylık Düzeltme", StringComparison.OrdinalIgnoreCase)))
            {
                var item = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                    () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
                payroll.DropDownItems.Insert(Math.Min(2, payroll.DropDownItems.Count), item);
            }
        }

        var reports = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("Raporlama", StringComparison.OrdinalIgnoreCase));
        if (reports is not null) reports.Text = "Raporlama";

        var definitions = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Yapılandırma", StringComparison.OrdinalIgnoreCase));
        if (definitions is not null) definitions.Text = "Ayarlar";

        var support = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("Destek", StringComparison.OrdinalIgnoreCase));
        if (support is not null)
        {
            support.Text = "Destek";
            var oldAbout = support.DropDownItems.OfType<ToolStripMenuItem>()
                .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Hakkında", StringComparison.OrdinalIgnoreCase));
            if (oldAbout is not null) oldAbout.Text = "KY PDKS 6.3 TEST Hakkında";
            if (!support.DropDownItems.OfType<ToolStripMenuItem>().Any(x => string.Equals(x.Text ?? string.Empty, "Hızlı Kullanım Rehberi", StringComparison.OrdinalIgnoreCase)))
            {
                var guide = new ToolStripMenuItem("Hızlı Kullanım Rehberi")
                {
                    ToolTipText = "Canlı takipten bordroya kadar ekranların amacı, işlem sırası ve güvenli kullanım kurallarını gösterir."
                };
                guide.Click += (_,_) => { using var form = new PdksQuickGuideForm(); form.ShowDialog(this); };
                support.DropDownItems.Insert(0, guide);
                if (support.DropDownItems.Count > 1 && support.DropDownItems[1] is not ToolStripSeparator)
                    support.DropDownItems.Insert(1, new ToolStripSeparator());
            }
        }

        ConfigureRoleMenus();

        foreach (var top in MainMenuStrip.Items.OfType<ToolStripMenuItem>())
        {
            top.Image = null;
            top.Padding = new Padding(3, 0, 3, 0);
        }

        tool.Height = 66;
        tool.ImageScalingSize = new Size(28, 28);
        tool.Padding = new Padding(8, 3, 0, 3);
        foreach (var button in tool.Items.OfType<ToolStripButton>())
        {
            button.Height = 58;
            button.Width = button.Text switch
            {
                "Canlı İzleme" => 86,
                "Giriş-Çıkış" => 88,
                _ => 78
            };
            button.Font = new Font("Segoe UI", 8f, FontStyle.Bold);
            button.Padding = new Padding(1, 3, 1, 2);
            button.Margin = new Padding(1, 0, 1, 0);
        }

        foreach (var old in MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                     .Where(x => string.Equals(x.Text ?? string.Empty, "REV 6.2 TEST", StringComparison.OrdinalIgnoreCase)).ToArray())
            MainMenuStrip.Items.Remove(old);

        if (!MainMenuStrip.Items.OfType<ToolStripMenuItem>().Any(x => string.Equals(x.Text ?? string.Empty, "REV 6.3 TEST", StringComparison.OrdinalIgnoreCase)))
            MainMenuStrip.Items.Add(new ToolStripMenuItem("REV 6.3 TEST")
            {
                Alignment = ToolStripItemAlignment.Right,
                Enabled = false,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.FromArgb(190,82,54)
            });
    }
}
