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

        var payroll = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Puantaj ve Bordro", StringComparison.OrdinalIgnoreCase));
        if (payroll is not null && !payroll.DropDownItems.OfType<ToolStripMenuItem>()
                .Any(x => (x.Text ?? string.Empty).Contains("Aylık Düzeltme", StringComparison.OrdinalIgnoreCase)))
        {
            var item = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
            payroll.DropDownItems.Insert(Math.Min(2, payroll.DropDownItems.Count), item);
        }

        var support = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Destek ve Bilgi", StringComparison.OrdinalIgnoreCase));
        if (support is not null && !support.DropDownItems.OfType<ToolStripMenuItem>()
                .Any(x => string.Equals(x.Text ?? string.Empty, "Hızlı Kullanım Rehberi", StringComparison.OrdinalIgnoreCase)))
        {
            var guide = new ToolStripMenuItem("Hızlı Kullanım Rehberi")
            {
                ToolTipText = "Canlı takipten bordroya kadar ekranların ne işe yaradığını ve önerilen işlem sırasını gösterir."
            };
            guide.Click += (_, _) =>
            {
                using var form = new PdksQuickGuideForm();
                form.ShowDialog(this);
            };
            support.DropDownItems.Insert(0, guide);
            if (support.DropDownItems.Count > 1 && support.DropDownItems[1] is not ToolStripSeparator)
                support.DropDownItems.Insert(1, new ToolStripSeparator());
        }

        // Yapılandırma ve Çalışma Alanı artık başka menünün içine zorla taşınmaz.
        // Kullanıcı ana menü düzenleyicisinden istediğini gösterir, gizler ve sıralar.
        ApplyMenuIcons(MainMenuStrip);
    }
}
