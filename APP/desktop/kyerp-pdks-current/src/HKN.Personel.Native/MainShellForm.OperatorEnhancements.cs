namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool operatorEnhancementsApplied;

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (operatorEnhancementsApplied) return;
        operatorEnhancementsApplied = true;
        ApplyOperatorEnhancements();
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

        var system = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text, "Sistem Yönetimi", StringComparison.OrdinalIgnoreCase));
        if (system is not null)
        {
            MoveTopMenuUnderSystem("Yapılandırma", system);
            MoveTopMenuUnderSystem("Çalışma Alanı", system);
        }

        ApplyMenuIcons(MainMenuStrip);
    }

    void MoveTopMenuUnderSystem(string title, ToolStripMenuItem system)
    {
        if (MainMenuStrip is null || system.DropDownItems.OfType<ToolStripMenuItem>().Any(x => x.Text == title)) return;
        var item = MainMenuStrip.Items.OfType<ToolStripMenuItem>().FirstOrDefault(x => x.Text == title);
        if (item is null) return;
        MainMenuStrip.Items.Remove(item);
        if (system.DropDownItems.Count > 0 && system.DropDownItems[^1] is not ToolStripSeparator)
            system.DropDownItems.Add(new ToolStripSeparator());
        system.DropDownItems.Add(item);
    }
}
