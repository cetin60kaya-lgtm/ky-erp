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

        WindowState = FormWindowState.Normal;
        StartPosition = FormStartPosition.CenterScreen;
        var area = Screen.FromControl(this).WorkingArea;
        var targetWidth = Math.Clamp((int)Math.Round(area.Width * 0.86), 1180, 1480);
        var targetHeight = Math.Clamp((int)Math.Round(area.Height * 0.84), 720, 880);
        Size = new Size(Math.Min(targetWidth, area.Width - 40), Math.Min(targetHeight, area.Height - 40));
        Location = new Point(
            area.Left + Math.Max(0, (area.Width - Width) / 2),
            area.Top + Math.Max(0, (area.Height - Height) / 2));

        if (IsHandleCreated)
        {
            BeginInvoke(new Action(() =>
            {
                if (IsDisposed || MainMenuStrip is null) return;
                Text = $"KY PDKS 6.3.2 TEST • {branding.ReportHeader} • Operasyon / Puantaj / Bordro";
                var rev = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("REV 6.", StringComparison.OrdinalIgnoreCase));
                if (rev is not null) rev.Text = "REV 6.3.2 TEST";
                var support = MainMenuStrip.Items.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).StartsWith("Destek", StringComparison.OrdinalIgnoreCase));
                var about = support?.DropDownItems.OfType<ToolStripMenuItem>()
                    .FirstOrDefault(x => (x.Text ?? string.Empty).Contains("Hakkında", StringComparison.OrdinalIgnoreCase));
                if (about is not null) about.Text = "KY PDKS 6.3.2 TEST Hakkında";
            }));
        }
    }
}
