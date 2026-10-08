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

        if (PdksPreviewMode.Enabled)
        {
            // The preview must never load saved Firebird credentials, start
            // terminal polling, run restore/backup/bootstrap, or touch production data.
            var isolated = Path.Combine(Path.GetTempPath(), "KYERP-PDKS-VISUAL-PREVIEW");
            Environment.SetEnvironmentVariable("KY_PDKS_RUNTIME_ROOT", isolated);
            Environment.SetEnvironmentVariable("KY_PDKS_REPORT_ROOT", Path.Combine(isolated, "reports"));
            Environment.SetEnvironmentVariable("KY_PDKS_DB_PATH", Path.Combine(isolated, "NO_DATABASE.GDB"));
            Environment.SetEnvironmentVariable("KY_PDKS_DB_HOST", "127.0.0.1");
            Environment.SetEnvironmentVariable("KY_PDKS_DB_PASSWORD", "PREVIEW_ONLY_NOT_A_REAL_SECRET");
            Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT", "1");

            var previewUser = new LocalUser
            {
                UserName = "ÖNİZLEME",
                IsActive = true,
                IsAdmin = true,
                Permissions = Enum.GetNames<PdksModule>().ToList()
            };
            using var preview = new MainShellForm(previewUser);
            preview.Text = "KY PDKS 6.7 • GÖRSEL ÖNİZLEME • Canlı veri bağlantısı kapalı";
            Application.Run(preview);
            return;
        }

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
