using System.Diagnostics;
using System.Net.Http;
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
    private bool _startupLoaded;
    // Serialize discovery, manual validation and selection: an older timeout
    // must never overwrite a successfully approved File Hub grant.
    private bool _archiveOperationActive;
    private const string RunPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "KY ERP Integrations";
    private const string PrefPath = @"Software\KY ERP\Desktop";
    private static string IntegrationStarter => Path.Combine(AppContext.BaseDirectory,
        "Integrations", "start-kyerp-integrations-hidden.vbs");

    public LocalFolderWindow(string company)
    {
        InitializeComponent();
        _company = string.IsNullOrWhiteSpace(company) ? "" : company.Trim();
        CompanyInput.Text = _company;
        CompanyInput.IsReadOnly = !string.IsNullOrWhiteSpace(_company);
        RefreshGrants();
        RefreshStartup();
        ShowSavedCompanyGrant();
    }

    private void RefreshStartup()
    {
        try
        {
            _startupLoaded = false;
            var available = File.Exists(IntegrationStarter);
            StartWithWindows.IsEnabled = available;
            StartIntegrationsButton.IsEnabled = available;
            using var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunPath);
            var current = key?.GetValue(RunName)?.ToString() ?? "";
            StartWithWindows.IsChecked = available &&
                current.Contains(IntegrationStarter, StringComparison.OrdinalIgnoreCase);
        }
        catch(Exception error) { ShowStatus("Başlangıç ayarı okunamadı: "+error.Message,true); }
        finally { _startupLoaded = true; }
    }

    private void StartWithWindows_Changed(object sender, RoutedEventArgs e)
    {
        if (!_startupLoaded) return;
        try
        {
            if (!File.Exists(IntegrationStarter)) throw new FileNotFoundException("Kurulum içindeki entegrasyon başlatıcısı bulunamadı.");
            using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(RunPath, true)
                ?? throw new UnauthorizedAccessException("Windows başlangıç kaydı açılamadı.");
            if (StartWithWindows.IsChecked == true)
            {
                var wscript = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wscript.exe");
                key.SetValue(RunName, $"\"{wscript}\" \"{IntegrationStarter}\"");
                using var pref = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(PrefPath, true);
                pref?.SetValue("IntegrationStartupChoice", 1, Microsoft.Win32.RegistryValueKind.DWord);
                ShowStatus("KY ERP entegrasyonları bu Windows kullanıcısı oturum açınca otomatik başlayacak. Klasör izinleri değişmedi.");
            }
            else
            {
                key.DeleteValue(RunName, false);
                using var pref = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(PrefPath, true);
                pref?.SetValue("IntegrationStartupChoice", 0, Microsoft.Win32.RegistryValueKind.DWord);
                ShowStatus("KY ERP entegrasyonları için Windows otomatik başlatma kapatıldı. Dosyalar ve izinler korunuyor.");
            }
        }
        catch(Exception error) { ShowStatus("Başlangıç tercihi kaydedilemedi: "+error.Message,true); }
    }

    private async void StartIntegrations_Click(object sender, RoutedEventArgs e)
    {
        if (!File.Exists(IntegrationStarter)) {
            ShowStatus("Entegrasyon başlatıcısı bulunamadı. Setup paketi kurulmuş olmalı.",true);
            return;
        }
        StartIntegrationsButton.IsEnabled=false;
        try
        {
            var wscript = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"wscript.exe");
            using var process=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo {
                FileName=wscript,Arguments=$"\"{IntegrationStarter}\"",UseShellExecute=false,CreateNoWindow=true,
            });
            if(process is null)throw new InvalidOperationException("Entegrasyon başlatma isteği gönderilemedi.");
            await Task.Delay(1300);
            await VerifyPortalAsync();
        }
        catch(Exception error){ShowStatus("Entegrasyon başlatılamadı: "+error.Message,true);}
        finally{StartIntegrationsButton.IsEnabled=true;}
    }

    private async void CheckPortal_Click(object sender, RoutedEventArgs e) => await VerifyPortalAsync();

    private async Task VerifyPortalAsync()
    {
        try
        {
            using var http=new HttpClient{Timeout=TimeSpan.FromSeconds(4)};
            using var request=new HttpRequestMessage(HttpMethod.Get,"http://127.0.0.1:8788/health");
            request.Headers.TryAddWithoutValidation("Origin","https://kyerp.net");
            using var response=await http.SendAsync(request);
            if(!response.IsSuccessStatusCode)throw new InvalidOperationException("Adaptör yanıtı HTTP "+(int)response.StatusCode);
            using var result=System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if(!result.RootElement.TryGetProperty("adapter",out var adapter) ||
                adapter.GetString()!="KY_ISNET_LOCAL_V1")
                throw new InvalidOperationException("8788 portunda beklenmeyen program var.");
            var isConnected=result.RootElement.TryGetProperty("connected",out var connected) &&
                connected.ValueKind==System.Text.Json.JsonValueKind.True;
            ShowStatus(isConnected
                ? "Windows İşNet adaptörü çalışıyor ve yetkili firma oturumu açık. KY ERP XML/PDF aktarımı ayrıca doğrulanmalı."
                : "Windows İşNet adaptörü erişilebilir. İşNet oturumu henüz açılmadı; KY ERP üzerinden giriş yapılabilir.");
        }
        catch(Exception error){ShowStatus("Yerel İşNet adaptörü doğrulanamadı: "+error.Message,true);}
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

    private LocalFolderGrant? SavedCompanyGrant()
    {
        return LocalFolderService.Load().FirstOrDefault(grant =>
            grant.Company.Equals(_company, StringComparison.OrdinalIgnoreCase) &&
            grant.Purpose.Equals("FILE_HUB", StringComparison.OrdinalIgnoreCase) &&
            grant.Permission.Equals("READ_ONLY", StringComparison.OrdinalIgnoreCase));
    }

    private void ShowSavedCompanyGrant()
    {
        try
        {
            var grant = SavedCompanyGrant();
            if (grant is null) return;
            CompanyRootPathInput.Text = grant.FullPath;
            ShowStatus($"Onaylı firma arşivi kayıtlı: {_company} · Salt okunur (READ_ONLY) · " +
                       $"{grant.FullPath}. Yeniden klasör seçmeniz gerekmez.");
        }
        catch (Exception error) { ShowStatus("Mevcut File Hub izni okunamadı: " + error.Message, true); }
    }

    private void ShowArchiveFailure(string title, Exception error)
    {
        // A second background probe can fail after an explicit Yes was saved.
        // Do not misrepresent the persisted grant as a failed authorization.
        try
        {
            var saved = SavedCompanyGrant();
            if (saved is not null)
            {
                RefreshGrants();
                ShowStatus($"Firma arşivi izni zaten kayıtlı: {_company} · READ_ONLY · " +
                           $"{saved.FullPath}. Yeni kontrol başarısız: {error.Message}", true);
                return;
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        ShowStatus(title + error.Message, true);
    }

    private bool BeginArchiveOperation()
    {
        if (_archiveOperationActive) return false;
        _archiveOperationActive = true;
        ChooseCompanyRootButton.IsEnabled = false;
        ApproveCompanyRootPathButton.IsEnabled = false;
        return true;
    }

    private void EndArchiveOperation()
    {
        _archiveOperationActive = false;
        ChooseCompanyRootButton.IsEnabled = true;
        ApproveCompanyRootPathButton.IsEnabled = true;
    }

    private async void ChooseCompanyRoot_Click(object sender, RoutedEventArgs e)
    {
        if (!BeginArchiveOperation()) return;
        try
        {
            var saved = SavedCompanyGrant();
            var requested = CompanyRootPathInput.Text.Trim().Trim('"');
            if (saved is not null && (requested.Length == 0 ||
                requested.Equals(saved.FullPath, StringComparison.OrdinalIgnoreCase)))
            {
                RefreshGrants();
                ShowSavedCompanyGrant();
                return;
            }
            // Never use OpenFolderDialog for a cloud company root. It rejects
            // Google Drive junction ancestors on otherwise healthy Windows systems.
            var entered = CompanyRootPathInput.Text.Trim().Trim('"');
            if (entered.Length != 0)
            {
                await ApproveCompanyRootAsync(entered);
                return;
            }

            var discovery = await Task.Run(CompanyArchiveDiscovery.FindExistingCompanyRootsWithDiagnostics);
            var candidates = discovery.Candidates;
            if (candidates.Count == 0)
            {
                CompanyRootPathInput.Focus();
                ShowStatus($"Bu cihazda mevcut firma arşivi otomatik bulunamadı (incelenen bulut bağlantısı: {discovery.RootsChecked}). " +
                    "Var olan klasörün tam yolunu üstteki alandan doğrulayabilirsiniz; Windows klasör seçicisi açılmaz.", true);
                return;
            }
            if (candidates.Count > 1)
            {
                ArchiveCandidates.ItemsSource = candidates;
                ArchiveCandidates.Visibility = Visibility.Visible;
                ShowStatus("Birden fazla mevcut firma arşivi bulundu. Üstteki listeden doğru firmayı seçin; onay verilmeden bağlantı kurulmaz.");
                return;
            }
            CompanyRootPathInput.Text = candidates[0];
            await ApproveCompanyRootAsync(candidates[0]);
        }
        catch (Exception error)
        {
            CompanyRootPathInput.Focus();
            ShowArchiveFailure("Firma ana arşivi bulunamadı veya doğrulanamadı: ", error);
        }
        finally { EndArchiveOperation(); }
    }

    private async void ArchiveCandidates_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ArchiveCandidates.SelectedItem is not string selectedPath ||
            !BeginArchiveOperation()) return;
        try
        {
            ArchiveCandidates.Visibility = Visibility.Collapsed;
            CompanyRootPathInput.Text = selectedPath;
            await ApproveCompanyRootAsync(selectedPath);
        }
        catch (Exception error) { ShowArchiveFailure("Firma ana klasörü doğrulanamadı: ", error); }
        finally { EndArchiveOperation(); }
    }

    private async void ApproveCompanyRootPath_Click(object sender, RoutedEventArgs e)
    {
        if (!BeginArchiveOperation()) return;
        try
        {
            var requested = CompanyRootPathInput.Text.Trim().Trim('"');
            var saved = SavedCompanyGrant();
            if (saved is not null &&
                requested.Equals(saved.FullPath, StringComparison.OrdinalIgnoreCase))
            {
                RefreshGrants();
                ShowSavedCompanyGrant();
                return;
            }
            await ApproveCompanyRootAsync(requested);
        }
        catch (Exception error) { ShowArchiveFailure("Firma ana klasörü doğrulanamadı: ", error); }
        finally { EndArchiveOperation(); }
    }

    private async Task ApproveCompanyRootAsync(string selectedPath)
    {
        // Both Windows folder chooser and manual path use EXACTLY the same
        // root validation, tenant isolation, confirmation and read-only grant.
        // Manual entry is a Windows junction dialog fallback, not a bypass.
        if (string.IsNullOrWhiteSpace(_company))
            throw new InvalidOperationException("Önce KY ERP'de ana firmayı seçin. Firma kimliği boşsa klasör kurulmaz.");
        ShowStatus("Firma arşivi Windows üzerinde doğrulanıyor; dosyalar değiştirilmiyor.");
        var resolution = await Task.Run(() => LocalFolderService.ResolveUserEnteredRoot(selectedPath));
        var root = resolution.FullPath;
        // Corrected filesystem spelling is shown before the user's explicit approval.
        // This does NOT create a folder or bypass the existing tenant/grant checks.
        if (resolution.Corrected) CompanyRootPathInput.Text = root;
        var grants = LocalFolderService.Load();
        if (grants.Any(g => g.FullPath.Equals(root, StringComparison.OrdinalIgnoreCase) &&
                            !g.Company.Equals(_company, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Bu Windows klasörü başka bir KY ERP firmasına bağlı.");
        if (grants.Any(g => g.Purpose.Equals("FILE_HUB", StringComparison.OrdinalIgnoreCase) &&
                            g.Company.Equals(_company, StringComparison.OrdinalIgnoreCase) &&
                            !g.FullPath.Equals(root, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("Firma için başka bir File Hub ana klasörü zaten onaylı. " +
                "Eski yetkiyi kullanıcı onayıyla kaldırmadan aynı firmaya ikinci kök açılamaz.");

        var isMountedCloud = CloudArchiveProbe.Available && CloudArchiveProbe.IsCloudPath(root);
        if (isMountedCloud)
        {
            // A cloud mount may contain other junctions; never create files
            // through a WebView2-hosted confirmation action.
            CreateMissingFoldersCheck.IsChecked = false;
            CreateMissingFoldersCheck.IsEnabled = false;
        }
        // Only local physical directories need the optional standard-folder
        // inventory. Google Drive's virtual filesystem can block for minutes
        // on this scan, while a read-only File Hub grant creates zero folders.
        // Do not claim all standard directories exist if they were not read.
        IReadOnlyList<string> missing = isMountedCloud
            ? Array.Empty<string>()
            : await Task.Run(() => CompanyArchiveLayout.MissingPaths(root));
        var correctedNotice = resolution.Corrected
            ? $"Windows klasör adı otomatik düzeltildi.\nGirilen: {selectedPath}\nGerçek: {root}\n\n"
            : "";
        var createMissingFolders = !isMountedCloud && CreateMissingFoldersCheck.IsChecked == true;
        var inventoryText = isMountedCloud
            ? "Eksik standart klasör sayımı bu salt-okunur bağlantıda yapılmaz. Yeni klasör oluşturulacak: 0."
            : $"Eksik standart klasör: {missing.Count}. Yeni klasör oluşturulacak: {(createMissingFolders ? missing.Count : 0)}.";
        var preview = correctedNotice + $"{_company} firması\n\nAna klasör: {root}\n" +
            inventoryText + "\n\n" +
            "Mevcut hiçbir dosya silinmez, taşınmaz veya üzerine yazılmaz.\n" +
            "Seçili köke yalnız File Hub okuma izni verilir. Windows kullanıcı ortamında " +
            "İşNet arşiv hedefi tanımlanır; çalışan İşNet servisi yeniden başlatılmaz.\n" +
            "Bulut OAuth, yazma izni ve hassas klasör erişimleri ayrıca doğrulanır.\n\n" +
            "Bu klasör düzenini kurmak istiyor musunuz?";
        if (MessageBox.Show(this, preview, "KY ERP · Firma Arşivi",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;

        // Read-only local access is the safe default. Directory creation is a
        // separately visible user choice and never required merely to bind File Hub.
        var result = createMissingFolders
            ? await Task.Run(() => CompanyArchiveLayout.EnsureMissingPaths(root))
            : (Existing: CompanyArchiveLayout.StandardPaths.Count - missing.Count, Created: 0);
        if (!grants.Any(g => g.FullPath.Equals(root, StringComparison.OrdinalIgnoreCase) &&
                             g.Company.Equals(_company, StringComparison.OrdinalIgnoreCase) &&
                             g.Purpose.Equals("FILE_HUB", StringComparison.OrdinalIgnoreCase)))
            LocalFolderService.Grant(root, "Firma Ana Arşivi", "FILE_HUB", _company);

        // Only the accountant's approved Windows user may change the next
        // 8791 launch directory; existing portal session is never restarted.
        var isnetNotice = "İşNet yerel indirme ayarı değiştirilmedi.";
        if (IsnetArchivistCheck.IsChecked == true)
        {
            var legacyRoot = Path.Combine(root, "KY-ISNET-BELGELER");
            var isnetRoot = Directory.Exists(legacyRoot)
                ? legacyRoot : Path.Combine(root, "MUHASEBE", "e-Belgeler");
            Environment.SetEnvironmentVariable("KY_ISNET_ARCHIVE_ROOT", isnetRoot,
                EnvironmentVariableTarget.User);
            // 8791 starts automatically after the one-time authorized choice.
            // The packaged launcher checks for an existing listener; never kill
            // the current portal session or create a second instance.
            if (Directory.Exists(isnetRoot) && File.Exists(IntegrationStarter))
            {
                try
                {
                    var wscript = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wscript.exe");
                    using var launcher = Process.Start(new ProcessStartInfo {
                        FileName = wscript, Arguments = $"\"{IntegrationStarter}\"",
                        UseShellExecute = false, CreateNoWindow = true,
                    });
                    isnetNotice = launcher is null
                        ? "İşNet arşivi onaylandı; yerel servis başlangıcı doğrulanamadı."
                        : "İşNet arşivi onaylandı; yerel servis başlatma isteği gönderildi (8791 canlı kontrolü gereklidir).";
                }
                catch (Exception ex)
                {
                    isnetNotice = "İşNet arşivi onaylandı; yerel servis başlatılamadı: " + ex.GetType().Name;
                }
            }
            else isnetNotice = "Arşiv klasörü henüz kullanılabilir değil; servis başlatılmadı.";
        }
        Environment.SetEnvironmentVariable("KYERP_ARCHIVE_ACTIVE_TENANT", _company,
            EnvironmentVariableTarget.User);
        // Save only the user's explicitly approved root as a future discovery
        // hint. Never treat this preference as authorization or auto-create.
        Environment.SetEnvironmentVariable(CompanyArchiveDiscovery.ExistingArchiveHintVariable,
            root, EnvironmentVariableTarget.User);
        RefreshGrants();
        ShowStatus(isMountedCloud
            ? $"Firma bulut arşivi salt-okunur bağlandı: {_company}. Yeni klasör: 0. " +
              isnetNotice + " İşNet oturumu ve dosyalar değişmedi; bulut D1 kabulü ayrı."
            : $"Firma klasörleri hazır: {_company} · Mevcut: {result.Existing} · " +
              $"Yeni: {result.Created}. " + isnetNotice +
              " Çalışan uygulamalar ve İşNet oturumu değiştirilmedi. " +
              "Web bulut OAuth ve D1 kabulü ayrıca doğrulanır.");
    }

    private void AddFolder_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var purpose = (PurposeInput.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
            var picker = new Microsoft.Win32.OpenFolderDialog
            {
                Title = purpose == "BACKUP_DESTINATION"
                    ? "KY ERP yedekleri için yazma izni verilecek klasörü seçin"
                    : "KY ERP için yalnız okuma izni verilecek klasörü seçin",
            };
            if (picker.ShowDialog(this) != true) return;
            ExtraFolderPathInput.Text = picker.FolderName;
            ApproveFolderGrant(picker.FolderName);
        }
        catch (Exception error) { ShowStatus("Klasör onayı başarısız: " + error.Message, true); }
    }

    private void ApproveFolderPath_Click(object sender, RoutedEventArgs e)
    {
        try { ApproveFolderGrant(ExtraFolderPathInput.Text.Trim().Trim('"')); }
        catch (Exception error) { ShowStatus("Klasör yolu doğrulanamadı: " + error.Message, true); }
    }

    private void ApproveFolderGrant(string selectedPath)
    {
        if (string.IsNullOrWhiteSpace(_company))
            throw new InvalidOperationException("Önce KY ERP ana firmasını seçin.");
        var purpose = (PurposeInput.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "";
        var resolution = LocalFolderService.ResolveUserEnteredRoot(selectedPath);
        var validPath = resolution.FullPath;
        if (resolution.Corrected) ExtraFolderPathInput.Text = validPath;
        var permission = purpose is "BACKUP_DESTINATION" or "FILE_HUB_WRITE" ? "yazma" : "salt okunur";
        var approval = MessageBox.Show(this,
            $"Firma: {_company}\nKlasör: {validPath}\nİzin: {permission}\nAmaç: {purpose}\n\n" +
            "Bu Windows kullanıcısına yerel klasör yetkisi verilsin mi? Kaynak dosyalar değiştirilmez.",
            "KY ERP · Yerel klasör izni", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (approval != MessageBoxResult.Yes) return;
        var grant = LocalFolderService.Grant(validPath, NameInput.Text.Trim(), purpose, _company);
        RefreshGrants();
        ShowStatus($"{grant.Name} için {grant.Permission} izni verildi: {grant.FullPath}");
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
            new LocalFileInspectorWindow(selected) { Owner = this }.ShowDialog();
            ShowStatus($"İzinli {selected.Name} klasörü için yerel inceleme kapatıldı; kaynak dosyalar korunuyor.");
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