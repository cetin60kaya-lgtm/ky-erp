using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksUnifiedWindow : Window
{
    private readonly string _token;
    private readonly IReadOnlyList<CachedPerson> _people;
    private readonly PdksPaths _paths;
    private readonly bool _canWrite;
    private readonly ErpApiClient _erp = new();
    private readonly PdksMasterApiClient _mastersApi = new();
    private readonly PdksMachineApiClient _machineApi = new();
    private readonly PdksPersonnelMediaClient _mediaApi = new();
    private readonly LocalPdksStore _store;
    private readonly CancellationTokenSource _lifetime = new();
    private PdksMasterSnapshot _masters = new(Array.Empty<PdksWorkGroup>(), Array.Empty<PdksService>(), Array.Empty<PdksMasterAssignment>(), Array.Empty<PdksMasterAssignment>(), false);
    private CachedPerson? _selected;
    private bool _busy;

    public PdksUnifiedWindow(string token, IReadOnlyList<CachedPerson> people, PdksPaths paths, bool canWrite)
    {
        InitializeComponent();
        _token = token ?? "";
        _people = people ?? Array.Empty<CachedPerson>();
        _paths = paths;
        _canWrite = canWrite;
        _store = new LocalPdksStore(paths);
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        PersonCombo.ItemsSource = _people;
        PersonCombo.SelectedIndex = _people.Count > 0 ? 0 : -1;
        AssistantCommitButton.IsEnabled = _canWrite;
        PeriodText.Text = DateTime.Today.ToString("MMMM yyyy", CultureInfo.GetCultureInfo("tr-TR"));
        await RefreshAsync();
    }

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _lifetime.Cancel();
        _erp.Dispose();
        _mastersApi.Dispose();
        _machineApi.Dispose();
        _mediaApi.Dispose();
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e) => await RefreshAsync();

    private async Task RefreshAsync()
    {
        if (_busy) return;
        _busy = true;
        try
        {
            D1StateText.Text = "D1: Yükleniyor";
            _masters = await _mastersApi.GetAsync(_token, _lifetime.Token);
            D1StateText.Text = _masters.Audit ? "D1: DENETİM / Salt okunur" : "D1: Bağlı";
            DefinitionSummaryText.Text = $"{_masters.Groups.Count} vardiya · {_masters.Services.Count} servis · {_people.Count} aktif kartlı personel. Vardiya ve servis atamaları Web ile aynıdır.";
            await RefreshAgentStateAsync();
            await LoadSelectedAsync();
            StatusText.Text = "Web ve Windows PDKS aynı KY ERP D1 verisinden yenilendi.";
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            D1StateText.Text = "D1: Hata";
            StatusText.Text = error.Message;
        }
        finally { _busy = false; }
    }

    private async void PersonCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (PersonCombo.SelectedItem is not CachedPerson person) return;
        _selected = person;
        if (!IsLoaded || _busy) return;
        try { await LoadSelectedAsync(); }
        catch (Exception error) { StatusText.Text = error.Message; }
    }

    private async Task LoadSelectedAsync()
    {
        _selected = PersonCombo.SelectedItem as CachedPerson ?? _selected ?? _people.FirstOrDefault();
        if (_selected is null)
        {
            AttendanceGrid.ItemsSource = Array.Empty<AttendanceDayRow>();
            return;
        }

        var person = _selected;
        PersonNameText.Text = person.FullName;
        PersonCodeText.Text = string.IsNullOrWhiteSpace(person.PersonnelCode) ? "-" : person.PersonnelCode;
        CardText.Text = person.CardNo;
        DepartmentText.Text = string.IsNullOrWhiteSpace(person.Department) ? "-" : person.Department;
        TitleText.Text = string.IsNullOrWhiteSpace(person.Title) ? "-" : person.Title;
        StartText.Text = string.IsNullOrWhiteSpace(person.StartDate) ? "-" : person.StartDate;
        ExitText.Text = string.IsNullOrWhiteSpace(person.ExitDate) ? "-" : person.ExitDate;
        PhotoInitials.Text = Initials(person.FullName);

        var groupId = _masters.GroupAssignments.FirstOrDefault(x => string.Equals(x.EmployeeId, person.Id, StringComparison.OrdinalIgnoreCase))?.TargetId ?? "";
        var serviceId = _masters.ServiceAssignments.FirstOrDefault(x => string.Equals(x.EmployeeId, person.Id, StringComparison.OrdinalIgnoreCase))?.TargetId ?? "";
        var group = _masters.Groups.FirstOrDefault(x => string.Equals(x.Id, groupId, StringComparison.OrdinalIgnoreCase));
        var service = _masters.Services.FirstOrDefault(x => string.Equals(x.Id, serviceId, StringComparison.OrdinalIgnoreCase));
        GroupText.Text = group is null ? "Normal Mesai · 08:30-19:00" : $"{group.Name} · {group.EntryTime}-{group.ExitTime} · tol. +{group.LateTolerance}/-{group.EarlyTolerance} dk";
        ServiceText.Text = service?.Name ?? "Atanmamış";

        var now = DateTime.Today;
        var days = await _erp.GetAttendanceMonthAsync(_token, person, now.Year, now.Month, _lifetime.Token);
        AttendanceGrid.ItemsSource = days.OrderByDescending(x => x.Date).ToArray();
        WorkedText.Text = days.Count(x => x.Status is "CALISTI" or "EKSIK_BASIM").ToString(CultureInfo.InvariantCulture);
        MissingText.Text = days.Count(x => x.Status == "EKSIK_BASIM").ToString(CultureInfo.InvariantCulture);
        NoPunchText.Text = days.Count(x => x.Status == "KART_YOK").ToString(CultureInfo.InvariantCulture);
        LateText.Text = days.Sum(x => x.LateMinutes).ToString(CultureInfo.InvariantCulture);
        EarlyText.Text = days.Sum(x => x.EarlyMinutes).ToString(CultureInfo.InvariantCulture);
        OvertimeText.Text = days.Sum(x => x.OvertimeMinutes).ToString(CultureInfo.InvariantCulture);
        await LoadPhotoAsync(person);
    }

    private async Task LoadPhotoAsync(CachedPerson person)
    {
        PersonPhoto.Source = null;
        PhotoInitials.Visibility = Visibility.Visible;
        try
        {
            var photo = await _mediaApi.GetPhotoAsync(_token, person.Id, _lifetime.Token);
            if (photo is null || photo.Bytes.Length == 0) return;
            using var stream = new MemoryStream(photo.Bytes, writable: false);
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.StreamSource = stream;
            bitmap.EndInit();
            bitmap.Freeze();
            PersonPhoto.Source = bitmap;
            PhotoInitials.Visibility = Visibility.Collapsed;
        }
        catch
        {
            PersonPhoto.Source = null;
            PhotoInitials.Visibility = Visibility.Visible;
        }
    }

    private async void AssistantPreviewButton_Click(object sender, RoutedEventArgs e)
    {
        var command = AssistantBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(command)) { StatusText.Text = "Asistan komutunu yazın."; return; }
        if (IsFinanceAssistantCommand(command)) { StatusText.Text = "Finans ve bordro işlemleri yalnız İK üzerinden yapılır."; return; }
        if (IsFinanceAssistantCommand(command)) { StatusText.Text = "Finans ve bordro işlemleri yalnız İK üzerinden yapılır."; return; }
        await RunAsync("Komut D1 üzerinde önizleniyor...", async () =>
        {
            var result = await _machineApi.AssistantAsync(_token, command, false, _lifetime.Token);
            StatusText.Text = $"ÖNİZLEME · {result.Summary}";
        });
    }

    private async void AssistantCommitButton_Click(object sender, RoutedEventArgs e)
    {
        if (!_canWrite) return;
        var command = AssistantBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(command)) { StatusText.Text = "Asistan komutunu yazın."; return; }
        await RunAsync("Komut kontrol ediliyor...", async () =>
        {
            var preview = await _machineApi.AssistantAsync(_token, command, false, _lifetime.Token);
            var answer = MessageBox.Show(this,
                $"D1'e uygulanacak işlem:\n\n{preview.Summary}\n\nOnaylıyor musunuz?",
                "PDKS Asistan Onayı", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (answer != MessageBoxResult.Yes)
            {
                StatusText.Text = "Asistan işlemi iptal edildi; D1'e yazılmadı.";
                return;
            }
            var result = await _machineApi.AssistantAsync(_token, command, true, _lifetime.Token);
            StatusText.Text = $"UYGULANDI · {result.Summary}";
            await LoadSelectedAsync();
        });
    }

    private static bool IsFinanceAssistantCommand(string command)
    {
        var value = (command ?? "").ToLocaleUpper(CultureInfo.GetCultureInfo("tr-TR"));
        var blocked = new[] { "AVANS", "BORDRO", "MAAŞ", "MAAS", "BANKA", "ELDEN", "KESİNTİ", "KESINTI", "İCRA", "ICRA", "HACİZ", "HACIZ", "FİBE", "FIBE" };
        return blocked.Any(value.Contains);
    }

    private async Task RefreshAgentStateAsync()
    {
        var snapshot = await _store.SnapshotAsync(_lifetime.Token);
        AgentDetailText.Text = snapshot.AgentOnline
            ? $"Agent çalışıyor · mod={snapshot.AgentMode} · bugün {snapshot.TodayCount} ham kart · bekleyen {snapshot.PendingCount} · hata {snapshot.ErrorCount}"
            : $"Agent bağlantısı yok · bekleyen {snapshot.PendingCount} · hata {snapshot.ErrorCount}";
        SyncDetailText.Text = string.IsNullOrWhiteSpace(snapshot.LastAgentMessage)
            ? "D1 otomatik senkron durumu Agent tarafından güncellenecek."
            : snapshot.LastAgentMessage;
    }

    private void NavButton_Click(object sender, RoutedEventArgs e)
    {
        var key = (sender as Button)?.Tag?.ToString() ?? "DAILY";
        DailyPanel.Visibility = key == "DAILY" ? Visibility.Visible : Visibility.Collapsed;
        PersonPanel.Visibility = key == "PERSON" ? Visibility.Visible : Visibility.Collapsed;
        DefinitionsPanel.Visibility = key == "DEFINITIONS" ? Visibility.Visible : Visibility.Collapsed;
        SystemPanel.Visibility = key == "SYSTEM" ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OpenMasterButton_Click(object sender, RoutedEventArgs e)
    {
        var window = new PdksMasterWindow(_token, _people, _paths, _canWrite && !_masters.Audit) { Owner = this };
        window.ShowDialog();
        _ = RefreshAsync();
    }

    private async Task RunAsync(string message, Func<Task> action)
    {
        if (_busy) return;
        _busy = true;
        StatusText.Text = message;
        try { await action(); }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested) { }
        catch (Exception error) { StatusText.Text = error.Message; }
        finally { _busy = false; }
    }

    private static string Initials(string fullName)
    {
        var parts = (fullName ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return "?";
        return string.Concat(parts.Take(2).Select(x => char.ToUpper(x[0], CultureInfo.GetCultureInfo("tr-TR"))));
    }
}
