using System.Windows;

namespace KyPdks.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
#if PDKS_ONLY
        var window = new PdksWorkbenchWindow();
#else
        var window = new KyErpDesktopWindow();
#endif
        MainWindow = window;
        window.Show();
    }
}
