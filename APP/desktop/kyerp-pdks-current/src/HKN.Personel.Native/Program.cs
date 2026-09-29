using System.Text;

namespace HKN.Personel.Native;

static class Program
{
    [STAThread]
    static void Main()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (_,e) => MessageBox.Show(e.Exception.Message,"KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Warning);
        AppDomain.CurrentDomain.UnhandledException += (_,e) => { if(e.ExceptionObject is Exception ex) MessageBox.Show(ex.Message,"KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Error); };
        ApplicationConfiguration.Initialize();
        StartupConfiguration.LoadSavedSettingsIntoProcess();
        CompanyDataPaths.Ensure();
        CompanyDataPaths.PinEnvironment();
        PdksTheme.Install();

        if (!LocalAuthStore.HasUsers)
        {
            using var bootstrap = new BootstrapAdminForm();
            if (bootstrap.ShowDialog() != DialogResult.OK) return;
        }

        using var login = new LoginForm();
        if (login.ShowDialog() != DialogResult.OK || login.AuthenticatedUser is null) return;
        var user = login.AuthenticatedUser;

        if (!CompanyLicenseGuard.EnsureAccess(out _, out var licenseMessage))
        {
            if (!user.IsSuperAdmin)
            {
                MessageBox.Show(licenseMessage,"Firma Veri Erişimi Kilitli",MessageBoxButtons.OK,MessageBoxIcon.Stop);
                return;
            }

            MessageBox.Show(licenseMessage + "\r\n\r\nSuper Admin olarak lisansı yenileyebilirsiniz.","Firma Veri Erişimi Kilitli",MessageBoxButtons.OK,MessageBoxIcon.Warning);
            using var licenseCenter = new CompanyLicenseCenterForm();
            licenseCenter.ShowDialog();
            if (!CompanyLicenseGuard.EnsureAccess(out _, out licenseMessage))
            {
                MessageBox.Show("Lisans yenilenmedi. Firma verisine erişim açılmadı.","KYERP PDKS",MessageBoxButtons.OK,MessageBoxIcon.Stop);
                return;
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
}
