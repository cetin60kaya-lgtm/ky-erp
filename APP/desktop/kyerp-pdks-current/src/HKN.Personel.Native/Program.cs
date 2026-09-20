using System.Text;

namespace HKN.Personel.Native;

static class Program
{
    [STAThread]
    static void Main()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
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
