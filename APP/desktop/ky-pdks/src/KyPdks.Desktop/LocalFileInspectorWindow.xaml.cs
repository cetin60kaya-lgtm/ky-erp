using System.Windows;

namespace KyPdks.Desktop;

/// <summary>Reads only explicit approved folders; cannot execute scripts or edit originals.</summary>
public partial class LocalFileInspectorWindow : Window
{
    private readonly LocalFolderGrant _grant;
    public LocalFileInspectorWindow(LocalFolderGrant grant)
    {
        InitializeComponent();
        _grant=grant;
        RootLabel.Text=$"{grant.Company} · {grant.Name} · {grant.FullPath}";
    }

    private async void Search_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            StatusText.Text="İzinli klasörde dosyalar aranıyor...";
            var query=QueryInput.Text;
            var matches=await Task.Run(()=>LocalFolderService.Search(_grant,query,200));
            ResultsGrid.ItemsSource=matches;
            StatusText.Text=$"{matches.Count} dosya gösterildi (üst sınır 200). Dosya içeriği okunmadı; kaynak değiştirilmedi.";
        }
        catch(Exception error) {StatusText.Text="Arama yapılamadı: "+error.Message;}
    }

    private async void Read_Click(object sender, RoutedEventArgs e)
    {
        if(ResultsGrid.SelectedItem is not LocalFileEntry entry)
        {
            StatusText.Text="Önce bir dosya seçin.";
            return;
        }
        try
        {
            PreviewText.Text="Dosya güvenli salt-okunur modda açılıyor...";
            var text=await Task.Run(()=>LocalFolderService.ReadTextPreview(_grant,entry.RelativePath));
            PreviewText.Text=text;
            StatusText.Text=entry.RelativePath+" · Yerel önizleme; dosya ve ERP verisi değiştirilmedi.";
        }
        catch(Exception error){PreviewText.Clear();StatusText.Text="Önizleme açılamadı: "+error.Message;}
    }
}