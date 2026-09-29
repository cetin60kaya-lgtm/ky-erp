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
                var refreshHedef = new ToolStripMenuItem("Hedef'ten Güncel Personel / Veri Al")
                {
                    ToolTipText = @"D:\Hedef500\Hedef500\Data\DATABASE.GDB dosyasını Firebird gbak ile güvenli yedekleyip doğrulanmış yeni KY PDKS verisi olarak hazırlar."
                };
                refreshHedef.Click += async (_, _) => await RefreshFromHedefLiveAsync();
                management.DropDownItems.Add(refreshHedef);

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

    async Task RefreshFromHedefLiveAsync()
    {
        if (!currentUser.IsSuperAdmin) return;
        const string source = @"D:\Hedef500\Hedef500\Data\DATABASE.GDB";
        var answer = MessageBox.Show(
            "Hedef PDKS'nin güncel personel ve hareket verileri KY PDKS'ye alınacak.\n\n" +
            source + "\n\n" +
            "İşlem sırası:\n• Mevcut KY PDKS veritabanı yedeklenir.\n• Hedef veritabanı gbak ile güvenli yedeklenir.\n• Yeni veritabanı ayrı dosyada geri yüklenir ve KIMLIK / GIRCIK / DONEM doğrulanır.\n• Başarılıysa uygulama yeniden başlar.\n\n" +
            "Canlı DATABASE.GDB dosyası doğrudan kopyalanmaz veya değiştirilmez. Devam edilsin mi?",
            "Hedef'ten Güncel Veri Al",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (answer != DialogResult.Yes) return;

        UseWaitCursor = true;
        Enabled = false;
        try
        {
            var result = await Task.Run(() => DatabaseMaintenance.PrepareHedefLiveRefresh(source));
            var message =
                $"Güncel Hedef verisi doğrulandı.\n\nPersonel: {result.PersonnelCount:N0}\nKart hareketi: {result.MovementCount:N0}\n\n" +
                $"Mevcut KY PDKS yedeği:\n{result.CurrentBackup}\n\n" +
                "Yeni veri uygulama yeniden başladığında devreye alınacak.";
            MessageBox.Show(message, "Hedef Veri Güncelleme Hazır", MessageBoxButtons.OK, MessageBoxIcon.Information);
            Application.Restart();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Hedef verisi alınamadı. Mevcut KY PDKS verisi değiştirilmedi.\n\n" + ex.GetBaseException().Message,
                "Hedef Veri Güncelleme",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        finally
        {
            if (!IsDisposed)
            {
                Enabled = true;
                UseWaitCursor = false;
            }
        }
    }
}
