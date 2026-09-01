using System.ComponentModel;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksMasterWindow : Window
{
    private readonly string _token;
    private readonly IReadOnlyList<CachedPerson> _people;
    private readonly PdksPaths _paths;
    private readonly bool _canWrite;
    private readonly PdksMasterApiClient _api = new();
    private readonly ConfigStore _configStore;
    private PdksMasterSnapshot _snapshot = new(Array.Empty<PdksWorkGroup>(), Array.Empty<PdksService>(), Array.Empty<PdksMasterAssignment>(), Array.Empty<PdksMasterAssignment>(), false);
    private string _groupId = "";
    private string _serviceId = "";
    private bool _busy;

    public PdksMasterWindow(string token, IReadOnlyList<CachedPerson> people, PdksPaths paths, bool canWrite)
    {
        InitializeComponent();
        _token = token ?? "";
        _people = people ?? Array.Empty<CachedPerson>();
        _paths = paths;
        _canWrite = canWrite;
        _configStore = new ConfigStore(paths);
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        PeopleGrid.ItemsSource = _people;
        GroupPersonCombo.ItemsSource = _people;
        ServicePersonCombo.ItemsSource = _people;
        LoadTerminal();
        ApplyWriteGuard();
        await RefreshD1Async();
    }

    private void Window_Closing(object? sender, CancelEventArgs e) => _api.Dispose();

    private void ApplyWriteGuard()
    {
        var enabled = _canWrite && !_snapshot.Audit;
        SaveGroupButton.IsEnabled = enabled;
        AssignGroupButton.IsEnabled = enabled;
        SaveServiceButton.IsEnabled = enabled;
        AssignServiceButton.IsEnabled = enabled;
        SaveTerminalButton.IsEnabled = _canWrite;
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e) => await RefreshD1Async();

    private async Task RefreshD1Async()
    {
        if (_busy) return;
        if (string.IsNullOrWhiteSpace(_token))
        {
            StatusText.Text = "KY ERP oturumu yok. Vardiya ve servis D1 verisi yüklenemedi.";
            DataStateText.Text = "D1: Oturum yok";
            return;
        }
        _busy = true;
        try
        {
            await RefreshD1CoreAsync();
        }
        finally { _busy = false; }
    }

    private async Task RefreshD1CoreAsync()
    {
        try
        {
            DataStateText.Text = "D1: Yükleniyor";
            _snapshot = await _api.GetAsync(_token);
            GroupsGrid.ItemsSource = _snapshot.Groups;
            ServicesGrid.ItemsSource = _snapshot.Services;
            GroupAssignCombo.ItemsSource = _snapshot.Groups.Where(x => x.Active).ToArray();
            ServiceAssignCombo.ItemsSource = _snapshot.Services.Where(x => x.Active).ToArray();
            DataStateText.Text = _snapshot.Audit ? "D1: DENETİM / Salt okunur" : "D1: Bağlı";
            StatusText.Text = $"D1 yenilendi · {_snapshot.Groups.Count} vardiya · {_snapshot.Services.Count} servis · {_people.Count} personel";
            ApplyWriteGuard();
        }
        catch (Exception error)
        {
            DataStateText.Text = "D1: Hata";
            StatusText.Text = error.Message;
        }
    }

    private void GroupsGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (GroupsGrid.SelectedItem is not PdksWorkGroup row) return;
        _groupId = row.Id;
        GroupCodeBox.Text = row.Code;
        GroupNameBox.Text = row.Name;
        GroupEntryBox.Text = row.EntryTime;
        GroupExitBox.Text = row.ExitTime;
        GroupLateBox.Text = row.LateTolerance.ToString(CultureInfo.InvariantCulture);
        GroupEarlyBox.Text = row.EarlyTolerance.ToString(CultureInfo.InvariantCulture);
        GroupActiveCheck.IsChecked = row.Active;
    }

    private void NewGroupButton_Click(object sender, RoutedEventArgs e)
    {
        _groupId = "";
        GroupCodeBox.Clear();
        GroupNameBox.Clear();
        GroupEntryBox.Text = "08:30";
        GroupExitBox.Text = "19:00";
        GroupLateBox.Text = "5";
        GroupEarlyBox.Text = "10";
        GroupActiveCheck.IsChecked = true;
        GroupsGrid.SelectedItem = null;
    }

    private async void SaveGroupButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_canWrite || _snapshot.Audit) { StatusText.Text = "Bu hesap vardiya değiştiremez."; return; }
        var code = GroupCodeBox.Text.Trim();
        var name = GroupNameBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name)) { StatusText.Text = "Vardiya kodu ve adı zorunludur."; return; }
        if (!ValidTime(GroupEntryBox.Text) || !ValidTime(GroupExitBox.Text)) { StatusText.Text = "Giriş/çıkış saati HH:mm olmalıdır."; return; }
        if (!int.TryParse(GroupLateBox.Text, out var late) || !int.TryParse(GroupEarlyBox.Text, out var early)) { StatusText.Text = "Tolerans dakika olarak sayı olmalıdır."; return; }
        await RunAsync("Vardiya D1'e kaydediliyor...", async () =>
        {
            await _api.SaveWorkGroupAsync(_token, new PdksWorkGroup(_groupId, code, name, GroupEntryBox.Text.Trim(), GroupExitBox.Text.Trim(), Math.Max(0, late), Math.Max(0, early), GroupActiveCheck.IsChecked != false));
            NewGroupButton_Click(sender, e);
        });
    }

    private async void AssignGroupButton_Click(object sender, RoutedEventArgs e)
    {
        if (GroupPersonCombo.SelectedItem is not CachedPerson person || GroupAssignCombo.SelectedItem is not PdksWorkGroup group)
        { StatusText.Text = "Personel ve vardiya seçin."; return; }
        await RunAsync("Personel vardiyası D1'e atanıyor...", async () =>
        {
            await _api.AssignWorkGroupAsync(_token, person.Id, group.Id);
            StatusText.Text = $"{person.FullName} → {group.Name} vardiyası D1'e atandı.";
        });
    }

    private void ServicesGrid_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (ServicesGrid.SelectedItem is not PdksService row) return;
        _serviceId = row.Id;
        ServiceCodeBox.Text = row.Code;
        ServiceNameBox.Text = row.Name;
        ServiceRouteBox.Text = row.RouteNote;
        ServiceActiveCheck.IsChecked = row.Active;
    }

    private void NewServiceButton_Click(object sender, RoutedEventArgs e)
    {
        _serviceId = "";
        ServiceCodeBox.Clear();
        ServiceNameBox.Clear();
        ServiceRouteBox.Clear();
        ServiceActiveCheck.IsChecked = true;
        ServicesGrid.SelectedItem = null;
    }

    private async void SaveServiceButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_canWrite || _snapshot.Audit) { StatusText.Text = "Bu hesap servis değiştiremez."; return; }
        var code = ServiceCodeBox.Text.Trim();
        var name = ServiceNameBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name)) { StatusText.Text = "Servis kodu ve adı zorunludur."; return; }
        await RunAsync("Servis D1'e kaydediliyor...", async () =>
        {
            await _api.SaveServiceAsync(_token, new PdksService(_serviceId, code, name, ServiceRouteBox.Text.Trim(), ServiceActiveCheck.IsChecked != false));
            NewServiceButton_Click(sender, e);
        });
    }

    private async void AssignServiceButton_Click(object sender, RoutedEventArgs e)
    {
        if (ServicePersonCombo.SelectedItem is not CachedPerson person || ServiceAssignCombo.SelectedItem is not PdksService service)
        { StatusText.Text = "Personel ve servis seçin."; return; }
        await RunAsync("Personel servisi D1'e atanıyor...", async () =>
        {
            await _api.AssignServiceAsync(_token, person.Id, service.Id);
            StatusText.Text = $"{person.FullName} → {service.Name} servisi D1'e atandı.";
        });
    }

    private void LoadTerminal()
    {
        var config = _configStore.Load();
        SelectTag(SourceModeCombo, config.NormalizedMode);
        HedefReadBox.Text = config.HedefReadFile;
        HedefWriteBox.Text = config.HedefWriteFile;
        TcpHostBox.Text = config.TcpHost;
        TcpPortBox.Text = config.TcpPort.ToString(CultureInfo.InvariantCulture);
        SerialPortBox.Text = config.SerialPort;
        SerialBaudBox.Text = config.SerialBaud.ToString(CultureInfo.InvariantCulture);
        ScanIntervalBox.Text = config.ScanIntervalMs.ToString(CultureInfo.InvariantCulture);
        SyncIntervalBox.Text = config.SyncIntervalSeconds.ToString(CultureInfo.InvariantCulture);
        AutoSyncCheck.IsChecked = config.AutoSync;
        FileImportCheck.IsChecked = config.FileImportEnabled;
    }

    private void HedefDefaultsButton_Click(object sender, RoutedEventArgs e)
    {
        SelectTag(SourceModeCombo, "HEDEF_TR500");
        HedefReadBox.Text = @"F:\Ekin\bilgi.dat";
        HedefWriteBox.Text = @"F:\Ekin\TR500.txt";
        StatusText.Text = "Hedef / TR500 varsayılan yolları forma yüklendi. Kaydet derseniz bu cihazın Agent ayarı güncellenir.";
    }

    private void SaveTerminalButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_canWrite) { StatusText.Text = "Bu hesap terminal ayarı değiştiremez."; return; }
        if (!int.TryParse(TcpPortBox.Text, out var tcpPort) || !int.TryParse(SerialBaudBox.Text, out var baud)
            || !int.TryParse(ScanIntervalBox.Text, out var scan) || !int.TryParse(SyncIntervalBox.Text, out var sync))
        { StatusText.Text = "Port, baud ve süre alanları sayı olmalıdır."; return; }
        var config = _configStore.Load();
        config.SourceMode = SelectedTag(SourceModeCombo);
        config.HedefReadFile = HedefReadBox.Text.Trim();
        config.HedefWriteFile = HedefWriteBox.Text.Trim();
        config.TcpHost = TcpHostBox.Text.Trim();
        config.TcpPort = tcpPort;
        config.SerialPort = SerialPortBox.Text.Trim();
        config.SerialBaud = baud;
        config.ScanIntervalMs = scan;
        config.SyncIntervalSeconds = sync;
        config.AutoSync = AutoSyncCheck.IsChecked != false;
        config.FileImportEnabled = FileImportCheck.IsChecked != false;
        _configStore.Save(config);
        StatusText.Text = $"Terminal ayarı bu Windows cihazına kaydedildi · {config.NormalizedMode}. Agent config.json değişikliğini kullanır; D1 iş verisine dokunulmadı.";
    }

    private async Task RunAsync(string message, Func<Task> action)
    {
        if (_busy) return;
        _busy = true;
        var succeeded = false;
        try
        {
            StatusText.Text = message;
            await action();
            succeeded = true;
        }
        catch (Exception error) { StatusText.Text = error.Message; }
        finally { _busy = false; }
        if (succeeded) await RefreshD1Async();
    }

    private static bool ValidTime(string value) => TimeOnly.TryParseExact(value.Trim(), "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static string SelectedTag(ComboBox combo) => (combo.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "HEDEF_TR500";

    private static void SelectTag(ComboBox combo, string tag)
    {
        foreach (var item in combo.Items.OfType<ComboBoxItem>())
        {
            if (!string.Equals(item.Tag?.ToString(), tag, StringComparison.OrdinalIgnoreCase)) continue;
            combo.SelectedItem = item;
            return;
        }
        combo.SelectedIndex = 0;
    }
}
