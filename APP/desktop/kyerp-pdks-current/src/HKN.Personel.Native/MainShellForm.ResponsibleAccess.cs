namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    internal void OpenPersonelForResponsible() => OpenPersonel();
    internal void OpenEntryExitForResponsible() => OpenLegacyGirisCikis();
    internal void OpenQuickDataForResponsible() => new QuickDataSourceForm().ShowDialog(this);
    internal void OpenPayrollAdjustmentForResponsible() => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro);
    internal void OpenTerminalForIntegration() => OpenTerminalCenter();
    internal Task RefreshFromHedefForIntegrationAsync() => RefreshFromHedefLiveAsync();

    async Task RefreshFromHedefLiveAsync()
    {
        if (!currentUser.IsSuperAdmin) return;
        const string source = @"C:\Hedef500\Data\DATABASE.GDB";
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
