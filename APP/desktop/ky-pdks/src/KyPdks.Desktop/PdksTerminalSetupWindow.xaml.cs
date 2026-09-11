using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using KyPdks.Shared;
using Microsoft.Win32;

namespace KyPdks.Desktop;

public partial class PdksTerminalSetupWindow : Window
{
    private readonly PdksPaths _paths;
    private readonly ConfigStore _store;
    private readonly bool _canWrite;
    private bool _busy;

    public PdksTerminalSetupWindow(PdksPaths paths, bool canWrite)
    {
        InitializeComponent();
        _paths = paths;
        _store = new ConfigStore(paths);
        _canWrite = canWrite;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        LoadConfig();
        SaveButton.IsEnabled = _canWrite;
        WriteStateText.Text = _canWrite ? "Yerel ayar yazılabilir" : "Salt okunur";
        WriteStateText.Foreground = _canWrite ? System.Windows.Media.Brushes.SeaGreen : System.Windows.Media.Brushes.Firebrick;
        StatusText.Text = _canWrite
            ? "Hazır · mevcut ayarlar yüklendi."
            : "Bu hesap terminal ayarı değiştiremez; bağlantı testi yapılabilir.";
        await TestAsync(silent: true);
    }

    private void LoadConfig()
    {
        var config = _store.Load();
        DeviceNameBox.Text = config.DeviceName;
        DeviceNoBox.Text = config.DeviceNo.ToString(CultureInfo.InvariantCulture);
        MachineNoBox.Text = config.MachineNo.ToString(CultureInfo.InvariantCulture);
        SelectTag(DirectionCombo, config.Direction);
        SelectTag(SourceModeCombo, config.NormalizedMode);
        TcpHostBox.Text = config.TcpHost;
        TcpPortBox.Text = config.TcpPort.ToString(CultureInfo.InvariantCulture);
        CommKeyBox.Text = config.CommKey.ToString(CultureInfo.InvariantCulture);
        var directMode = config.NormalizedMode == "FP_CLOCK_DIRECT";
        HedefReadBox.Text = directMode ? "" : config.HedefReadFile;
        HedefWriteBox.Text = directMode ? "" : config.HedefWriteFile;
        SerialPortBox.Text = config.SerialPort;
        SerialBaudBox.Text = config.SerialBaud.ToString(CultureInfo.InvariantCulture);
        ScanIntervalBox.Text = config.ScanIntervalMs.ToString(CultureInfo.InvariantCulture);
        SyncIntervalBox.Text = config.SyncIntervalSeconds.ToString(CultureInfo.InvariantCulture);
        AutoSyncCheck.IsChecked = config.AutoSync;
        FileImportCheck.IsChecked = directMode ? false : config.FileImportEnabled;
        PcClockText.Text = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("tr-TR"));
    }

    private void DirectProfile_Click(object sender, RoutedEventArgs e)
    {
        DeviceNameBox.Text = "Cihaz1";
        DeviceNoBox.Text = "1";
        MachineNoBox.Text = "1";
        SelectTag(DirectionCombo, "AUTO");
        SelectTag(SourceModeCombo, "FP_CLOCK_DIRECT");
        TcpHostBox.Text = "192.168.1.224";
        TcpPortBox.Text = "5005";
        CommKeyBox.Text = "0";
        HedefReadBox.Text = "";
        HedefWriteBox.Text = "";
        SerialPortBox.Text = "COM1";
        SerialBaudBox.Text = "38400";
        ScanIntervalBox.Text = "1000";
        SyncIntervalBox.Text = "30";
        AutoSyncCheck.IsChecked = true;
        FileImportCheck.IsChecked = false;
        StatusText.Text = "Doğrudan FP_CLOCK profili yüklendi · 192.168.1.224:5005 · cihaz 1 · Hedef500/TXT kullanılmaz. Kaydetmeden önce bağlantıyı test edin.";
    }

    private void FileProfile_Click(object sender, RoutedEventArgs e)
    {
        SelectTag(SourceModeCombo, "FILE");
        FileImportCheck.IsChecked = true;
        StatusText.Text = "Dosya profili seçildi. Import klasörüne TXT/CSV/DAT bırakabilir veya veri dosyası seçebilirsiniz.";
    }

    private void TcpProfile_Click(object sender, RoutedEventArgs e)
    {
        SelectTag(SourceModeCombo, "TCP_CLIENT");
        StatusText.Text = "TCP Client profili seçildi. Host ve portu girip bağlantıyı test edin.";
    }

    private void SerialProfile_Click(object sender, RoutedEventArgs e)
    {
        SelectTag(SourceModeCombo, "SERIAL");
        StatusText.Text = "Serial / COM profili seçildi. COM ve baud değerlerini cihaz dokümanına göre girin.";
    }

    private void BrowseReadFile_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "PDKS terminal veri dosyasını seçin",
            Filter = "PDKS veri dosyaları|*.txt;*.dat;*.csv;*.log|Tüm dosyalar|*.*",
            CheckFileExists = true,
        };
        if (dialog.ShowDialog(this) == true) HedefReadBox.Text = dialog.FileName;
    }

    private async void TestButton_Click(object sender, RoutedEventArgs e) => await TestAsync(silent: false);

    private async Task TestAsync(bool silent)
    {
        if (_busy) return;
        _busy = true;
        try
        {
            PcClockText.Text = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("tr-TR"));
            var mode = SelectedTag(SourceModeCombo);
            var host = string.IsNullOrWhiteSpace(TcpHostBox.Text) ? "127.0.0.1" : TcpHostBox.Text.Trim();
            var port = int.TryParse(TcpPortBox.Text, out var parsedPort) ? parsedPort : 5005;
            var config = _store.Load();

            if (mode is "FP_CLOCK_DIRECT" or "TCP_CLIENT")
            {
                TcpProbeText.Text = "Kontrol ediliyor...";
                var tcp = await TerminalDiagnostics.ProbeTcpAsync(host, port, 2500);
                TcpProbeText.Text = tcp.Message;
            }
            else TcpProbeText.Text = mode == "TCP_SERVER" ? $"Bu bilgisayar {port} portunu dinleyecek." : "Bu modda TCP testi gerekmiyor.";

            if (mode == "FILE")
            {
                FileProbeText.Text = "Kontrol ediliyor...";
                var file = await TerminalDiagnostics.ProbeHedefFileAsync(HedefReadBox.Text.Trim(), config.LineEncoding);
                FileProbeText.Text = file.LastPunch is null ? file.Message : $"{file.Message}\n{file.LastPunch.CardNo} · {file.LastPunch.EventAt:dd.MM.yyyy HH:mm:ss}";
            }
            else if (mode == "FP_CLOCK_DIRECT")
            {
                if (File.Exists(_paths.DeviceBridgeStateFile))
                {
                    try
                    {
                        using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(_paths.DeviceBridgeStateFile));
                        var root = doc.RootElement;
                        var connected = root.TryGetProperty("connected", out var c) && c.GetBoolean();
                        var deviceTime = root.TryGetProperty("deviceTime", out var dt) ? dt.GetString() ?? "" : "";
                        var serial = root.TryGetProperty("serialNumber", out var sn) ? sn.GetString() ?? "" : "";
                        var product = root.TryGetProperty("productCode", out var pc) ? pc.GetString() ?? "" : "";
                        var offset = root.TryGetProperty("clockOffsetMinutes", out var of) && of.TryGetInt32(out var om) ? om : 0;
                        var users = root.TryGetProperty("userCount", out var u) ? u.GetInt32() : -1;
                        var cards = root.TryGetProperty("cardCount", out var ca) ? ca.GetInt32() : -1;
                        var logs = root.TryGetProperty("timeLogCount", out var lg) ? lg.GetInt32() : -1;
                        var lastPunch = root.TryGetProperty("lastPunch", out var lp) ? lp.GetString() ?? "" : "";
                        var bridgeError = root.TryGetProperty("error", out var er) ? er.GetString() ?? "" : "";
                        FileProbeText.Text = connected
                            ? $"FP_CLOCK bağlı · saat {deviceTime} · PC farkı ~{offset} dk · seri {serial} · ürün {product} · kullanıcı {users} · kart {cards} · giriş/çıkış log {logs}" + (string.IsNullOrWhiteSpace(lastPunch) ? "" : $" · son kart {lastPunch}")
                            : $"FP_CLOCK bridge bağlantı bekliyor · {bridgeError}";
                    }
                    catch { FileProbeText.Text = "FP_CLOCK bridge durum dosyası okunamadı."; }
                }
                else FileProbeText.Text = "FP_CLOCK bridge Agent tarafından başlatılacak.";
            }
            else FileProbeText.Text = mode == "SERIAL" ? $"{SerialPortBox.Text.Trim()} / {SerialBaudBox.Text.Trim()} · kaydettikten sonra Agent açar." : "Dosya köprüsü kullanılmıyor.";

            if (!silent) StatusText.Text = "Güvenli bağlantı testi tamamlandı. Cihaza yazma komutu gönderilmedi.";
        }
        catch (Exception error)
        {
            StatusText.Text = $"Bağlantı testi hatası: {error.Message}";
        }
        finally { _busy = false; }
    }

    private async void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_canWrite || _busy) return;
        if (!int.TryParse(DeviceNoBox.Text, out var deviceNo)
            || !int.TryParse(MachineNoBox.Text, out var machineNo)
            || !int.TryParse(TcpPortBox.Text, out var tcpPort)
            || !int.TryParse(CommKeyBox.Text, out var commKey)
            || !int.TryParse(SerialBaudBox.Text, out var baud)
            || !int.TryParse(ScanIntervalBox.Text, out var scanMs)
            || !int.TryParse(SyncIntervalBox.Text, out var syncSeconds))
        {
            StatusText.Text = "Cihaz No, Makine No, port, baud ve süre alanları sayı olmalıdır.";
            return;
        }

        var config = _store.Load();
        config.DeviceName = DeviceNameBox.Text.Trim();
        config.DeviceNo = deviceNo;
        config.MachineNo = machineNo;
        config.Direction = SelectedTag(DirectionCombo);
        config.SourceMode = SelectedTag(SourceModeCombo);
        config.TcpHost = TcpHostBox.Text.Trim();
        config.TcpPort = tcpPort;
        config.CommKey = commKey;
        config.HedefReadFile = HedefReadBox.Text.Trim();
        config.HedefWriteFile = HedefWriteBox.Text.Trim();
        config.SerialPort = SerialPortBox.Text.Trim();
        config.SerialBaud = baud;
        config.ScanIntervalMs = scanMs;
        config.SyncIntervalSeconds = syncSeconds;
        config.AutoSync = AutoSyncCheck.IsChecked != false;
        config.FileImportEnabled = FileImportCheck.IsChecked != false;
        if (config.NormalizedMode == "FP_CLOCK_DIRECT")
        {
            config.HedefReadFile = "";
            config.HedefWriteFile = "";
            config.FileImportEnabled = false;
        }
        _store.Save(config);
        File.WriteAllText(_paths.SetupCompletedFile, DateTimeOffset.Now.ToString("O", CultureInfo.InvariantCulture));

        await TestAsync(silent: true);
        StatusText.Text = $"Kaydedildi · {config.DeviceName} · {config.NormalizedMode} · {config.Direction} · Agent ayarı otomatik okuyacak.";
        DialogResult = true;
        Close();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private static string SelectedTag(ComboBox combo)
        => (combo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "FP_CLOCK_DIRECT";

    private static void SelectTag(ComboBox combo, string tag)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
        {
            if (!string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) continue;
            combo.SelectedItem = item;
            return;
        }
        if (combo.Items.Count > 0) combo.SelectedIndex = 0;
    }
}
