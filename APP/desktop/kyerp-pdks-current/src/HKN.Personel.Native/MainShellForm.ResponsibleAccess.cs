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
            var quick = new ToolStripMenuItem("Hızlı İşlemler")
            {
                ToolTipText = "Firma sorumlusuna özel personel, kart hareketi, E/hariç tutma, TNF, data kontrol ve bordro düzeltme merkezi"
            };
            quick.Click += (_, _) => { using var f = new ResponsibleQuickOperationsForm(this); f.ShowDialog(this); };
            management.DropDownItems.Add(quick);

            if (currentUser.IsSuperAdmin)
            {
                management.DropDownItems.Add(new ToolStripSeparator());
                var license = new ToolStripMenuItem("Lisans Yönetimi")
                {
                    ToolTipText = "Firma lisansı, demo, süre, cihaz ve veri erişim durumunu yönetir. Yalnız Super Admin görür."
                };
                license.Click += (_, _) => { using var f = new CompanyLicenseCenterForm(); f.ShowDialog(this); };
                management.DropDownItems.Add(license);
            }

            var insert = Math.Max(0, MainMenuStrip.Items.Count - 2);
            MainMenuStrip.Items.Insert(insert, management);
        }

        if (management is not null)
            management.Visible = currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin;

        var workDate = tool.Items.OfType<ToolStripItem>()
            .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Çalışma Tarihi", StringComparison.OrdinalIgnoreCase));
        if (workDate is not null) workDate.Visible = false;

        // Window bounds are intentionally not changed here. Role/menu setup runs after the form
        // exists and changing bounds here caused a visible second resize on startup.
        Text = $"KY PDKS 6.3.3 TEST • {branding.ReportHeader} • Operasyon / Puantaj / Bordro";
    }
}
