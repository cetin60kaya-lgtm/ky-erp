using System.Diagnostics;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm : Form
{
    readonly LocalUser currentUser;
    readonly WorkspaceDockHost workspace;
    readonly Dictionary<string, Form> moduleCache = new(StringComparer.OrdinalIgnoreCase);
    PersonelForm? personel;
    CompanyBranding branding = CompanyBranding.Empty;

    public MainShellForm(LocalUser user)
    {
        currentUser = user;
        workspace = new WorkspaceDockHost(user.UserName);
        branding = CompanyBranding.Load();
        var v = typeof(MainShellForm).Assembly.GetName().Version;
        Text = $"KYERP PDKS • {branding.ReportHeader} [Versiyon: {v?.Major ?? 2}.{v?.Minor ?? 2}.{v?.Build ?? 0}]";
        WindowState = FormWindowState.Normal;
        MinimumSize = new Size(1100,700);
        StartPosition = FormStartPosition.Manual;
        var working = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1440, 900);
        Size = new Size(Math.Min(1680, Math.Max(MinimumSize.Width, working.Width - 80)), Math.Min(960, Math.Max(MinimumSize.Height, working.Height - 70)));
        Location = new Point(working.Left + Math.Max(0, (working.Width - Width) / 2), working.Top + Math.Max(0, (working.Height - Height) / 2));
        Font = new Font("Segoe UI",9f);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        BuildCanonicalMenuHost();
        Controls.Add(workspace); Controls.Add(MainMenuStrip!);
        ApplyCanonicalStartup();
        ShowHome();
        InitializeTerminalAutoSync();
        InitializeCloudSync();

        // Personel ekranı ilk menü tıklamasında kurulup kullanıcıyı bekletmesin.
        // Ana ekran çizildikten sonra bir kez gizli olarak ısıtılır ve menüler arası
        // geçişlerde WorkspaceDockHost tarafından dispose edilmeden korunur.
        Shown += (_, _) =>
        {
            var warmup = new System.Windows.Forms.Timer { Interval = 900 };
            warmup.Tick += (_, _) =>
            {
                warmup.Stop();
                warmup.Dispose();
                if (IsDisposed || personel is not null) return;
                try { EnsurePersonel(); } catch { }
            };
            warmup.Start();
        };
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == (Keys.Alt | Keys.Left))
        {
            NavigateBack();
            return true;
        }

        if (keyData == (Keys.Control | Keys.K))
        {
            OpenCommandPalette();
            return true;
        }

        var command = PdksCommandCatalog.ForShortcut(keyData);
        if (command is not null && CanExecute(command))
        {
            ExecuteCommand(command.Id);
            return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
    void ShowHome()
    {
        workspace.ShowSingle(new ModernHomeDashboard(
            PdksCommandCatalog.All.Where(CanExecute),
            ExecuteCommand,
            currentUser.UserName), "home", "Genel Bakış");
        SetModernPage("Genel Bakış", "Günün personel hareketleri ve hızlı işlemler");
    }

    static void OpenErpSite()
    {
        try { Process.Start(new ProcessStartInfo("https://kyerp.net") { UseShellExecute = true }); }
        catch (Exception ex) { PdksErrorPresenter.Show(null,ex,"KY ERP",MessageBoxIcon.Warning,"Shell.OpenSite"); }
    }

    bool Ready(PdksModule module)
    {
        if (!currentUser.Can(module))
        {
            MessageBox.Show("Bu işlem için yetkiniz yok.", "KYERP PDKS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (!StartupConfiguration.IsReady() && !StartupConfiguration.EnsureReady()) return false;
        RefreshModernDbState();
        return true;
    }

    void EnsurePersonel()
    {
        if (personel is not null && !personel.IsDisposed) return;
        personel = new PersonelForm();
    }

    void OpenPersonel() => OpenPersonelTab(PdksModule.Personel);

    void OpenPersonelTab(PdksModule module)
    {
        if (!Ready(module)) return;
        EnsurePersonel();
        if (personel is null) return;
        personel.PrepareForEmbedding();
        PdksTheme.Apply(personel);
        personel.ActivateModule(module);
        AccessGuard.Apply(personel, module, currentUser);
        ShowEmbedded(personel, "personel", "İnsan Kaynakları");
    }

    void OpenGroups()
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        ShowModule(new LegacyGroupForm(), PdksModule.Tanimlar);
    }

    void OpenDefinitions(string initialTab)
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        ShowModule(new LegacyDefinitionsForm(initialTab), PdksModule.Tanimlar);
    }

    void OpenLegacyTerminalSettings() => OpenTerminalCenter();

    void OpenTerminalCenter()
    {
        if (!Ready(PdksModule.Terminal)) return;
        EnsurePersonel();
        var transfer = personel?.CreateTerminalTransferDialog();
        ShowModule(new TerminalCenterForm(transfer, new LegacyTerminalSettingsForm()), PdksModule.Terminal);
    }

    void OpenLegacyTable(string title, string table, bool edit, Size size, PdksModule module = PdksModule.Tanimlar)
    {
        if (!Ready(module)) return;
        ShowModule(new LegacyTableBrowserForm(title, table, edit, size), module);
    }

    void OpenDefinition(string table)
    {
        if (!Ready(PdksModule.Tanimlar)) return;
        EnsurePersonel();
        personel?.OpenOrganizationDefinition(table);
    }

    void OpenDialogModule(PdksModule module)
    {
        if (!Ready(module)) return;
        switch (module)
        {
            case PdksModule.Terminal:
                OpenTerminalCenter();
                break;
            case PdksModule.Donemler:
                ShowModule(new LegacyPeriodForm(), PdksModule.Donemler);
                break;
            case PdksModule.GunlukOperasyon:
                OpenLiveAttendance();
                break;
            case PdksModule.Tanimlar:
                OpenDefinitions("Bölümler");
                break;
            default:
                OpenPersonelTab(module);
                break;
        }
    }

    void OpenWorkingDate()
    {
        if (!Ready(PdksModule.Donemler)) return;
        EnsurePersonel();
        personel?.ShowWorkingDateDialog();
    }

    void OpenTerminalProfilesAdvanced()
    {
        if (!Ready(PdksModule.Terminal)) return;
        EnsurePersonel();
        personel?.ShowTerminalProfileManager();
    }

    void OpenLegacyKazancKesinti()
    {
        if (!Ready(PdksModule.EkKazancKesinti)) return;
        ShowModule(new LegacyAvansEntryForm(), PdksModule.EkKazancKesinti);
    }

    void OpenLegacyIzin() => OpenPersonelTab(PdksModule.Izinler);

    void OpenLiveAttendance()
    {
        if (!Ready(PdksModule.GunlukOperasyon)) return;
        ShowModule(new LiveAttendanceHubForm(OpenGirisCikisFor, OpenPersonFor, currentUser.IsSuperAdmin), PdksModule.GunlukOperasyon);
    }

    void OpenPersonFor(string cardNo)
    {
        if (!Ready(PdksModule.Personel)) return;
        EnsurePersonel();
        if (personel is null) return;
        personel.PrepareForEmbedding();
        PdksTheme.Apply(personel);
        AccessGuard.Apply(personel, PdksModule.Personel, currentUser);
        ShowEmbedded(personel, "personel", "İnsan Kaynakları");
        personel.SelectPerson(cardNo);
    }

    void OpenGirisCikisFor(string cardNo, DateTime day)
    {
        if (!Ready(PdksModule.GirisCikis)) return;
        ShowModule(new LegacyGirisCikisForm(cardNo, day), PdksModule.GirisCikis);
    }

    void OpenLegacyGirisCikis()
    {
        if (!Ready(PdksModule.GirisCikis)) return;
        ShowModule(new LegacyGirisCikisForm(), PdksModule.GirisCikis);
    }

    void OpenLegacyPuantaj()
    {
        if (!Ready(PdksModule.Puantaj)) return;
        ShowModule(new LegacyPuantajForm(), PdksModule.Puantaj);
    }

    void OpenLegacyBordro()
    {
        if (!Ready(PdksModule.Bordro)) return;
        ShowModule(new LegacyBordroForm(), PdksModule.Bordro);
    }

    void OpenOperationalReport(LegacyOperationalReport report)
    {
        if (!Ready(PdksModule.Raporlar)) return;
        ShowModule(new LegacyOperationalReportForm(report), PdksModule.Raporlar);
    }

    void OpenData(LegacyDataView view, PdksModule module)
    {
        if (!Ready(module)) return;
        switch (view)
        {
            case LegacyDataView.GirisCikis: ShowModule(new LegacyGirisCikisForm(), PdksModule.GirisCikis); break;
            case LegacyDataView.Avanslar: ShowModule(new LegacyAvansEntryForm(), PdksModule.EkKazancKesinti); break;
            case LegacyDataView.Puantaj: ShowModule(new LegacyPuantajForm(), PdksModule.Puantaj); break;
            case LegacyDataView.Bordro: ShowModule(new LegacyBordroForm(), PdksModule.Bordro); break;
            default: ShowModule(new LegacyDataModuleForm(view), module); break;
        }
    }

    void ShowModule(Form form, PdksModule module)
    {
        AccessGuard.Apply(form, module, currentUser);
        var host = new ModuleHostForm(form, ShowHome);
        ShowEmbedded(host, "module:" + form.GetType().Name + ":" + form.Text, form.Text);
    }

    void ShowCachedModule(string cacheKey, Func<Form> factory, PdksModule module, string? title = null)
    {
        if (moduleCache.TryGetValue(cacheKey, out var cached) && !cached.IsDisposed)
        {
            ShowEmbedded(cached, "cached:" + cacheKey, title ?? cached.Text);
            return;
        }

        var form = factory();
        AccessGuard.Apply(form, module, currentUser);
        var host = new ModuleHostForm(form, ShowHome)
        {
            Tag = "KYERP_WORKSPACE_KEEP_ALIVE"
        };
        moduleCache[cacheKey] = host;
        ShowEmbedded(host, "cached:" + cacheKey, title ?? form.Text);
    }

    void ShowEmbedded(Form form, string key, string title)
    {
        workspace.Open(form, key, title);
        if (!form.Visible) form.Show();
        form.BringToFront();
        SetModernPage(title, "KY PDKS çalışma alanı");
    }

    void DisposeActiveChild()
    {
        workspace.CloseAll();
        personel = null;
    }

    void OpenUserManagement()
    {
        if (!currentUser.IsAdmin) return;
        ShowModule(new UserManagementForm(), PdksModule.KullaniciYonetimi);
    }

    void OpenPrinterSettings()
    {
        using var dlg = new PrintDialog { UseEXDialog = true }; dlg.ShowDialog(this);
    }

    static void Launch(string file)
    {
        try { Process.Start(new ProcessStartInfo(file){UseShellExecute=true}); }
        catch (Exception ex) { PdksErrorPresenter.Show(null,ex,"KYERP PDKS",MessageBoxIcon.Warning,"Shell.Launch"); }
    }

    static void LaunchEditor()
    {
        try { Process.Start(new ProcessStartInfo("write.exe"){UseShellExecute=true}); }
        catch { Launch("notepad.exe"); }
    }

    void BackupDatabase()
    {
        try
        {
            var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User) ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) throw new FileNotFoundException("Veritabanı dosyası bulunamadı.",path);
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"KYERP","PDKS","Yedek"); Directory.CreateDirectory(dir);
            var dest = Path.Combine(dir,$"DATABASE_{DateTime.Now:yyyyMMdd_HHmmss}.GDB"); File.Copy(path,dest,false);
            MessageBox.Show("Yedek alındı:\n"+dest,"Yedekle",MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,"Yedekle",MessageBoxIcon.Warning,"Shell.Backup"); }
    }

}
