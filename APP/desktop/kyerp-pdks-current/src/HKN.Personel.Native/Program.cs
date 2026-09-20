using System.Text;

namespace HKN.Personel.Native;

static class Program
{
    [STAThread]
    static void Main()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_,e) =>
            MessageBox.Show(e.Exception.Message,"KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning);
        AppDomain.CurrentDomain.UnhandledException += (_,e) =>
        {
            if(e.ExceptionObject is Exception ex)
                MessageBox.Show(ex.Message,"KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Error);
        };
        ApplicationConfiguration.Initialize();

        if (!LocalAuthStore.HasUsers)
        {
            using var bootstrap = new BootstrapAdminForm();
            if (bootstrap.ShowDialog() != DialogResult.OK) return;
        }

        using var login = new LoginForm();
        if (login.ShowDialog() != DialogResult.OK || login.AuthenticatedUser is null) return;

        Application.Run(new MainShellForm(login.AuthenticatedUser));
    }
}
