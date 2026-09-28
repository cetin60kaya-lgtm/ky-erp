namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    internal void OpenPersonelForResponsible() => OpenPersonel();
    internal void OpenEntryExitForResponsible() => OpenLegacyGirisCikis();
    internal void OpenQuickDataForResponsible() => new QuickDataSourceForm().ShowDialog(this);
    internal void OpenPayrollAdjustmentForResponsible() => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro);

    void ConfigureRoleMenus()
    {
        if (MainMenuStrip is null) return;

        var system = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Sistem Yönetimi", StringComparison.OrdinalIgnoreCase));
        if (system is not null)
            system.Visible = currentUser.IsSuperAdmin;

        var management = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
            .FirstOrDefault(x => string.Equals(x.Text ?? string.Empty, "Yönetim", StringComparison.OrdinalIgnoreCase));
        if (management is null && (currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin))
        {
            management = new ToolStripMenuItem("Yönetim");
            var quick = new ToolStripMenuItem("Hızlı İşlemler") { ToolTipText = "Firma sorumlusuna özel veri düzeltme ve kontrol merkezi" };
            quick.Click += (_,_) => { using var f = new ResponsibleQuickOperationsForm(this); f.ShowDialog(this); };
            management.DropDownItems.Add(quick);
            if (currentUser.IsSuperAdmin)
            {
                management.DropDownItems.Add(new ToolStripSeparator());
                var license = new ToolStripMenuItem("Firma Lisans / Veri Erişim Kilidi");
                license.Click += (_,_) => { using var f = new CompanyLicenseCenterForm(); f.ShowDialog(this); };
                management.DropDownItems.Add(license);
            }
            var insert = Math.Max(0, MainMenuStrip.Items.Count - 2);
            MainMenuStrip.Items.Insert(insert, management);
        }

        var workDate = tool.Items.OfType<ToolStripItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase));
        if (workDate is not null) workDate.Visible = false;

        WindowState = FormWindowState.Normal;
        StartPosition = FormStartPosition.CenterScreen;
        var area = Screen.FromControl(this).WorkingArea;
        Size = new Size(Math.Min(1500, Math.Max(1180, area.Width - 120)), Math.Min(900, Math.Max(760, area.Height - 100)));
        Location = new Point(area.Left + Math.Max(0, (area.Width - Width) / 2), area.Top + Math.Max(0, (area.Height - Height) / 2));
    }
}
