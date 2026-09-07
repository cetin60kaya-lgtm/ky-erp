using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using KyPdks.Shared;
using Microsoft.Win32;

namespace KyPdks.Desktop;

public partial class PdksDeviceWindow : Window
{
    private readonly PdksPaths _paths = new();
    private readonly ConfigStore _configStore;
    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly CancellationTokenSource _lifetime = new();
    private readonly bool _readOnly;

    public PdksDeviceWindow(bool readOnly = false)
    {
        InitializeComponent();
        _readOnly = readOnly;
        _configStore = new ConfigStore(_paths);
        _clock.Tick += (_, _) => PcTimeText.Text = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("tr-TR"));
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        LoadConfig();
        ApplyReadOnlyGuard();
        _clock.Start();
        PcTimeText.Text = DateTime.Now.ToString("dd.MM.yyyy HH:mm:ss", CultureInfo.GetCultureInfo("tr-TR"));
        await InspectFileAsync();
    }

    private void Window_Closed(object? sender, EventArgs e)
    {
        _clock.Stop();
        _lifetime.Cancel();
        _lifetime.Dispose();
    }

    private void LoadConfig()
    {
        var config = _configStore.Load();
        DeviceNameBox.Text = config.DeviceName;
        DeviceNoBox.Text = config.DeviceNo.ToString(CultureInfo.InvariantCulture);
        MachineNoBox.Text = config.MachineNo.ToString(CultureInfo.InvariantCulture);
        IpBox.Text = config.TcpHost;
        PortBox.Text = config.TcpPort.ToString(CultureInfo.InvariantCulture);
        BaudBox.Text = config.SerialBaud.ToString(CultureInfo.InvariantCulture);
        HedefFileBox.Text = config.HedefReadFile;
        SelectDirection(config.Direction);
    }

    private PdksConfig ReadConfigFromForm()
    {
        var config = _configStore.Load();
        config.SourceMode = "HEDEF_TR500";
        config.DeviceName = DeviceNameBox.Text.Trim();
        config.DeviceNo = ParsePositive(DeviceNoBox.Text, 1, "Cihaz No");
        config.MachineNo = ParsePositive(MachineNoBox.Text, 1, "Makine No");
        config.Direction = SelectedDirection();
        config.TcpHost = IpBox.Text.Trim();
        config.TcpPort = ParsePort(PortBox.Text);
        config.SerialBaud = ParsePositive(BaudBox.Text, 38400, "Baudrate");
        config.HedefReadFile = HedefFileBox.Text.Trim();
        config.HedefWriteFile = "";
        config.TerminalProtocol = "HEDEF_UNKNOWN_BINARY";
        config.DirectCommandsEnabled = false;
        config.FileImportEnabled = true;
        config.AutoSync = true;
        config.Normalize();
        return config;
    }

    private void ApplyHedefProfileButton_Click(object sender, RoutedEventArgs e)
    {
        DeviceNameBox.Text = "Cihaz1";
        DeviceNoBox.Text = "1";
        MachineNoBox.Text = "1";
        IpBox.Text = "192.168.1.224";
        PortBox.Text = "5005";
        BaudBox.Text = "38400";
        HedefFileBox.Text = @"C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt";
        SelectDirection("GIRIS");
        StatusText.Text = "Hedef500 işyeri profili forma uygulandı. Kaydet ile kalıcılaştırın.";
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var config = ReadConfigFromForm();
            _configStore.Save(config);
            StatusText.Text = $"Ayar kaydedildi · {config.DeviceName} · {config.TcpHost}:{config.TcpPort} · {config.HedefReadFile}";
        }
        catch (Exception error)
        {
            StatusText.Text = $"Ayar kaydedilemedi · {error.Message}";
        }
    }

    private async void ProbeButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var host = IpBox.Text.Trim();
            var port = ParsePort(PortBox.Text);
            TcpStatusText.Text = $"TCP test ediliyor · {host}:{port}...";
            var result = await TerminalDiagnostics.ProbeTcpAsync(host, port, 1500, _lifetime.Token);
            TcpStatusText.Text = result.Message + (result.Reachable
                ? " · Cihaz portuna erişilebiliyor; veri/komut protokolü ayrıca doğrulanmalıdır."
                : " · Hedef PDKS çalışıyor olsa bile terminal tek bağlantı kabul ediyor olabilir.");
            StatusText.Text = result.Reachable ? "Terminal ağ erişimi doğrulandı." : "Terminal ağ erişimi doğrulanamadı; dosya köprüsü çalışmaya devam eder.";
        }
        catch (Exception error)
        {
            TcpStatusText.Text = $"TCP test hatası · {error.Message}";
        }
    }

    private async void InspectFileButton_Click(object sender, RoutedEventArgs e) => await InspectFileAsync();

    private async Task InspectFileAsync()
    {
        try
        {
            FileStatusText.Text = "timerecords kontrol ediliyor...";
            var result = await TerminalDiagnostics.InspectHedefFileAsync(HedefFileBox.Text, _lifetime.Token);
            FileLineCountText.Text = result.TotalLines.ToString(CultureInfo.InvariantCulture);
            FileParsedCountText.Text = result.ParsedLines.ToString(CultureInfo.InvariantCulture);
            FileDuplicateCountText.Text = result.DuplicateLines.ToString(CultureInfo.InvariantCulture);
            FileRejectedCountText.Text = result.RejectedLines.ToString(CultureInfo.InvariantCulture);
            FileStatusText.Text = result.Message + (result.LastWriteAt is DateTimeOffset lastWrite ? $" · son yazma {lastWrite:dd.MM.yyyy HH:mm:ss}" : "");
            LastPunchText.Text = $"Son kayıt: {TerminalDiagnostics.FormatPunch(result.LastPunch)}";
            StatusText.Text = result.Exists && result.ParsedLines > 0 ? "Hedef PDKS dosya köprüsü hazır." : "Hedef PDKS dosya köprüsü kontrol gerekiyor.";
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            FileStatusText.Text = $"timerecords kontrol hatası · {error.Message}";
        }
    }

    private void BrowseFileButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Hedef PDKS timerecords dosyasını seçin",
            Filter = "PDKS kayıt dosyası (*.txt;*.csv;*.dat;*.log)|*.txt;*.csv;*.dat;*.log|Tüm dosyalar (*.*)|*.*",
            CheckFileExists = true,
        };
        if (dialog.ShowDialog(this) == true) HedefFileBox.Text = dialog.FileName;
    }

    private void ApplyReadOnlyGuard()
    {
        if (!_readOnly) return;
        DeviceNameBox.IsReadOnly = true;
        DeviceNoBox.IsReadOnly = true;
        MachineNoBox.IsReadOnly = true;
        IpBox.IsReadOnly = true;
        PortBox.IsReadOnly = true;
        BaudBox.IsReadOnly = true;
        HedefFileBox.IsReadOnly = true;
        DirectionCombo.IsEnabled = false;
        ApplyProfileButton.IsEnabled = false;
        SaveConfigButton.IsEnabled = false;
        BrowseHedefFileButton.IsEnabled = false;
        StatusText.Text = "Salt-okunur terminal görünümü. Ayar değiştirme yetkisi yok.";
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private string SelectedDirection()
        => (DirectionCombo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "GIRIS";

    private void SelectDirection(string value)
    {
        foreach (var item in DirectionCombo.Items.OfType<ComboBoxItem>())
        {
            if (!string.Equals(item.Tag?.ToString(), value, StringComparison.OrdinalIgnoreCase)) continue;
            DirectionCombo.SelectedItem = item;
            return;
        }
        DirectionCombo.SelectedIndex = 0;
    }

    private static int ParsePositive(string value, int fallback, string label)
    {
        if (int.TryParse(value.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed > 0) return parsed;
        if (fallback > 0) return fallback;
        throw new InvalidOperationException($"{label} geçersiz.");
    }

    private static int ParsePort(string value)
    {
        if (int.TryParse(value.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var port) && port is >= 1 and <= 65535) return port;
        throw new InvalidOperationException("IP port 1-65535 arasında olmalıdır.");
    }
}
