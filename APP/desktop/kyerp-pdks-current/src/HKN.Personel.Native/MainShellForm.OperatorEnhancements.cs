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
            .FirstOrDefault(x => string.Equals(x.Text, "Puantaj ve Bordro", StringComparison.OrdinalIgnoreCase));
        if (payroll is not null && !payroll.DropDownItems.OfType<ToolStripMenuItem>().Any(x => x.Text.Contains("Aylık Düzeltme", StringComparison.OrdinalIgnoreCase)))
        {
            var item = MenuItem("Aylık Düzeltme / Hızlı Ödeme", PdksModule.Bordro,
                () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro));
            payroll.DropDownItems.Insert(Math.Min(2, payroll.DropDownItems.Count), item);
        }

        // Yapılandırma ve Çalışma Alanı artık başka menünün içine zorla taşınmaz.
        // Kullanıcı ana menü düzenleyicisinden istediğini gösterir, gizler ve sıralar.
        ApplyMenuIcons(MainMenuStrip);
    }
}
