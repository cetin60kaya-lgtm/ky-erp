using System.Text;

namespace HKN.Personel.Native;

static class Program
{
    [STAThread]
    static void Main()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_,e) => PdksErrorPresenter.Show(null,e.Exception,"KYERP PDKS",MessageBoxIcon.Warning,"Application.ThreadException");
        AppDomain.CurrentDomain.UnhandledException += (_,e) =>
        {
            if(e.ExceptionObject is Exception ex)
                PdksErrorPresenter.Show(null,ex,"KYERP PDKS",MessageBoxIcon.Error,"AppDomain.UnhandledException");
        };
        ApplicationConfiguration.Initialize();
        StartupConfiguration.LoadSavedSettingsIntoProcess();
        CompanyDataPaths.Ensure();
        CompanyDataPaths.PinEnvironment();
        PdksTheme.Install();

        var skipLogin = IsLoginBypassEnabled();
        LocalUser user;
        if (skipLogin)
        {
            user = LocalAuthStore.Load().FirstOrDefault(x => x.IsSuperAdmin && x.IsActive)
                ?? new LocalUser { UserName = "ADMIN", IsActive = true, IsAdmin = true };
            File.AppendAllText(
                Path.Combine(CompanyDataPaths.Logs, "startup.log"),
                $"{DateTime.Now:O} TEST/DEMO login bypass active.{Environment.NewLine}");
        }
        else
        {
            if (!LocalAuthStore.HasUsers)
            {
                using var bootstrap = new BootstrapAdminForm();
                if (bootstrap.ShowDialog() != DialogResult.OK) return;
            }

            using var login = new LoginForm();
            if (login.ShowDialog() != DialogResult.OK || login.AuthenticatedUser is null) return;
            user = login.AuthenticatedUser;
        }

        var licenseActive = CompanyLicenseGuard.EnsureAccess(out _, out var licenseMessage);
        if (!licenseActive)
        {
            if (user.IsSuperAdmin)
            {
                MessageBox.Show(
                    licenseMessage + "\r\n\r\nSuper Admin erişimi açık kalır. Yönetim > Lisans Yönetimi üzerinden firma lisansını düzenleyebilirsiniz.",
                    "KY PDKS • Lisans",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            else
            {
                using var activation = new LicenseActivationForm(licenseMessage);
                activation.ShowDialog();
            }
        }

        CompanyDataPaths.ApplyPendingRestore();
        DatabaseMaintenance.EnsureDailyBackup();
        try { CompanyDatabaseBootstrap.Ensure(); }
        catch (Exception ex)
        {
            File.AppendAllText(Path.Combine(CompanyDataPaths.Logs,"startup.log"),$"{DateTime.Now:O} Firma hazırlığı: {ex.Message}{Environment.NewLine}");
        }

        Application.Run(new MainShellForm(user));
    }

    static bool IsLoginBypassEnabled()
    {
        var value = Environment.GetEnvironmentVariable("KY_PDKS_SKIP_LOGIN");
        return value is not null &&
               (value.Equals("1", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("yes", StringComparison.OrdinalIgnoreCase));
    }
}
