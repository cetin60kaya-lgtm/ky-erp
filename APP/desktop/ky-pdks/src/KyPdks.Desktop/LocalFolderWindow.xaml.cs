using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace KyPdks.Desktop;

/// <summary>
/// Local consent UI, hosted inside the existing KY ERP Desktop product.
/// No folder is read, indexed or backed up before an explicit local grant.
/// </summary>
public partial class LocalFolderWindow : Window
{
    private readonly string _company;

    public LocalFolderWindow(string company)
    {
        InitializeComponent();
        _company = string.IsNullOrWhiteSpace(company) ? "" : company.Trim();
        CompanyInput.Text = _company;
        RefreshGrants();
    }

    private void RefreshGrants()
    {
        try
        {
            var previousSource = (BackupSource.SelectedItem as LocalFolderGrant)?.Id;
            var previousTarget = (BackupDestination.SelectedItem as LocalFolderGrant)?.Id;
            var grants = LocalFolderService.Load().ToArray();
            GrantsGrid.ItemsSource = grants;
            BackupSource.ItemsSource = grants.Where(g => g.Permission == "READ_ONLY").ToArray();
            BackupDestination.ItemsSource = grants.Where(g => g.Purpose == "BACKUP_DESTINATION"
                && g.Permission == "BACKUP_WRITE").ToArray();
            BackupSource.SelectedItem = (BackupSource.ItemsSource as LocalFolderGrant[])?
                .FirstOrDefault(g => g.Id == previousSource);
            BackupDestination.SelectedItem = (BackupDestination.ItemsSource as LocalFolderGrant[])?
                .FirstOrDefault(g => g.Id == previousTarget);
            GrantCountText.Text = $"{grants.Length} açık klasör izni · Yetkiler Windows kullanıcısı kapsamında";
        }
        catch (Exception error)
        {
            ShowStatus("Klasör izinleri okunamadı: " + error.Message, true);
        }
    }

    private void AddFolder_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var purpose=(PurposeInput.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
            var picker = new Microsoft.Win32.OpenFolderDialog
            {
                Title = purpose == "BACKUP_DESTINATION"
                    ? "KY ERP yedekleri için yazma izni verilecek klasörü seçin"
                    : "KY ERP için yalnız okuma izni verilecek klasörü seçin",
            };
            if (picker.ShowDialog(this) != true) return;
            var grant = LocalFolderService.Grant(picker.FolderName, NameInput.Text.Trim(),
                purpose, CompanyInput.Text.Trim());
            RefreshGrants();
            ShowStatus($"{grant.Name} için {grant.Permission} izni verildi: {grant.FullPath}");
        }
        catch(Exception error)
        {
            ShowStatus("Klasör onayı başarısız: " + error.Message, true);
        }
    }

    private void InspectFolder_Click(object sender, RoutedEventArgs e)
    {
        if (GrantsGrid.SelectedItem is not LocalFolderGrant selected)
        {
            ShowStatus("Önce izin verilen bir klasör seçin.", true);
            return;
        }
        try
        {
            var summary = LocalFolderService.Inspect(selected);
            ShowStatus($"{selected.Name} · {summary.FileCount:N0} dosya · {summary.TotalBytes / 1024d / 1024d:N2} MB. " +
                "Dosya içeriği buluta aktarılmadı, kaynak değiştirilmedi.");
        }
        catch(Exception error)
        {
            ShowStatus("Klasör incelenemedi: " + error.Message, true);
        }
    }

    private void RemoveFolder_Click(object sender, RoutedEventArgs e)
    {
        if (GrantsGrid.SelectedItem is not LocalFolderGrant selected) return;
        var confirmation = MessageBox.Show(this,
            $"'{selected.Name}' klasörünün KY ERP yerel erişim izni kaldırılacak.\n\n" +
            "Kaynak dosyalar ve mevcut yedekler silinmeyecektir.\n\nOnaylıyor musunuz?",
            "KY ERP · Yerel erişim izni", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (confirmation != MessageBoxResult.Yes) return;
        try
        {
            LocalFolderService.Revoke(selected.Id);
            RefreshGrants();
            ShowStatus("Klasör erişimi kaldırıldı. Dosyalar korunuyor.");
        }
        catch(Exception error) { ShowStatus("Yetki kaldırılamadı: "+error.Message,true); }
    }

    private async void RunBackup_Click(object sender, RoutedEventArgs e)
    {
        if (BackupSource.SelectedItem is not LocalFolderGrant source ||
            BackupDestination.SelectedItem is not LocalFolderGrant destination)
        {
            ShowStatus("Önce kaynak klasörü ve onaylı yedek hedefini seçin.", true);
            return;
        }
        var confirm = MessageBox.Show(this,
            $"Kaynak: {source.FullPath}\nHedef: {destination.FullPath}\n" +
            $"Firma: {source.Company}\n\nYeni tarihli bir klasör yedeği oluşturulacak.\n" +
            "Mevcut dosyalar silinmeyecek veya üzerine yazılmayacak. Devam edilsin mi?",
            "KY ERP · Firma klasör yedeği", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (confirm != MessageBoxResult.Yes) return;

        BackupButton.IsEnabled = false;
        BackupButton.Content = "Yedek oluşturuluyor...";
        try
        {
            var result = await Task.Run(() => LocalFolderService.BackupAsync(source,destination));
            ShowStatus($"Yedek doğrulama manifesti oluşturuldu · {result.FileCount:N0} dosya · " +
                $"{result.TotalBytes / 1024d / 1024d:N2} MB · SHA256 {result.ManifestSha256[..12]}... " +
                $"· {result.SnapshotPath}");
        }
        catch(Exception error) { ShowStatus("Yedekleme tamamlanamadı: "+error.Message+
            " Kısmi yedek korunur; kaynak dosyalar değişmedi.",true); }
        finally
        {
            BackupButton.IsEnabled = true;
            BackupButton.Content = "Yedeği Oluştur";
        }
    }

    private void ShowStatus(string message, bool error = false)
    {
        LocalStatus.Text = message;
        LocalStatus.Foreground = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(error ? "#9C2F2F" : "#23527B"));
    }
}