using System.Windows;

namespace KyPdks.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // ERP Desktop ve PDKS Desktop aynı canonical React kabuğunu kullanır.
        // PDKS_ONLY derlemesinde ürün işareti WebView document-start aşamasında enjekte edilir
        // ve frontend yalnız PDKS modülünü görünür tutar.
        var window = new KyErpDesktopWindow();
        MainWindow = window;
        window.Show();
    }
}
