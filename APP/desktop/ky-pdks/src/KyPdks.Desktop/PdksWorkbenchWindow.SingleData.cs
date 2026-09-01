using System.Globalization;
using System.Text;
using System.Windows;
using KyPdks.Shared;

namespace KyPdks.Desktop;

public partial class PdksWorkbenchWindow
{
    private async void SaveLeaveSingleDataButton_Click(object sender, RoutedEventArgs e)
    {
        if (LeavePersonCombo.SelectedItem is not CachedPerson person) { StatusText.Text = "İzin için personel seçin."; return; }
        var start = LeaveStartPicker.SelectedDate ?? DateTime.Today;
        var end = LeaveEndPicker.SelectedDate ?? start;
        if (end < start) { StatusText.Text = "İzin bitiş tarihi başlangıçtan önce olamaz."; return; }

        await BusyAsync("İzin KY ERP D1'e kaydediliyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("İzin kaydı için yazma yetkisi gerekir.");
            var type = SelectedTag(LeaveTypeCombo);
            await _erp.SaveLeaveAsync(_token, person, start.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"), type, LeaveNoteBox.Text, _userName, _lifetime.Token);
            await RefreshOnePersonMonthAsync(person, start.Year, start.Month);
            if (start.Year != end.Year || start.Month != end.Month) await RefreshOnePersonMonthAsync(person, end.Year, end.Month);
            await RefreshAllAsync();
            StatusText.Text = $"{person.FullName} izin kaydı D1'e işlendi. Windows ve Web aynı kaydı kullanır.";
        });
    }

    private async void SaveAdvanceSingleDataButton_Click(object sender, RoutedEventArgs e)
    {
        if (AdvancePersonCombo.SelectedItem is not CachedPerson person) { StatusText.Text = "Avans için personel seçin."; return; }
        var date = AdvanceDatePicker.SelectedDate ?? DateTime.Today;
        if (!decimal.TryParse(AdvanceAmountBox.Text.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var amount) || amount <= 0)
        {
            StatusText.Text = "Geçerli avans tutarı girin.";
            return;
        }

        await BusyAsync("Avans KY ERP D1'e kaydediliyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Avans kaydı için yazma yetkisi gerekir.");
            await _erp.SaveAdvanceAsync(_token, person, date.ToString("yyyy-MM-dd"), amount, AdvanceNoteBox.Text, _lifetime.Token);
            AdvanceAmountBox.Clear();
            StatusText.Text = $"{person.FullName} · {amount:N2} TL avans D1'e işlendi. İK Bordro ile aynıdır.";
        });
    }

    private async void ClosePeriodSingleDataButton_Click(object sender, RoutedEventArgs e)
    {
        await BusyAsync("D1 ay sonu kontrolleri çalışıyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Dönem kapatma için yazma yetkisi gerekir.");
            var (year, month) = SelectedPeriod();
            var today = DateTime.Today;
            if (year > today.Year || (year == today.Year && month >= today.Month))
                throw new InvalidOperationException("İçinde bulunulan veya gelecek ay kapatılamaz.");

            var backup = await _store.BackupAsync(_lifetime.Token);
            var result = await _erp.ClosePeriodAsync(_token, year, month, "KY PDKS masaüstü kontrollü kapanış", _userName, _lifetime.Token);
            if (result.BlockingCount > 0 || !result.IsLocked)
                throw new InvalidOperationException($"Dönem kapanmadı. Açık kontrol: {result.BlockingCount}.");

            PeriodStateText.Text = "KAPALI · D1";
            PeriodStateText.Foreground = System.Windows.Media.Brushes.Firebrick;
            StatusText.Text = $"{month:D2}/{year} D1 üzerinde kilitlendi · kontrol {result.OkCount}/{result.TotalChecks} · yedek {Path.GetFileName(backup)}";
        });
    }

    private async void ExportPayrollSingleDataButton_Click(object sender, RoutedEventArgs e)
    {
        await BusyAsync("Bordro KY ERP D1'den alınıyor...", async () =>
        {
            if (!CanWrite) throw new InvalidOperationException("Bordro finans çıktısı denetim hesabında kapalıdır.");
            var (year, month) = SelectedPeriod();
            var rows = await _erp.GetPayrollAsync(_token, year, month, _lifetime.Token);
            var reportDir = Path.Combine(_paths.Root, "Reports", year.ToString(CultureInfo.InvariantCulture));
            Directory.CreateDirectory(reportDir);
            var path = Path.Combine(reportDir, $"KY-PDKS-BORDRO-D1-{year:D4}-{month:D2}.csv");
            var lines = new List<string> { Csv("Personel Kodu", "Personel", "Maaş", "Mesai", "Avans", "Kesinti", "Banka", "Elden", "Net") };
            lines.AddRange(rows.Select(row => Csv(row.PersonnelCode, row.FullName, row.Salary, row.Overtime, row.Advance, row.Deduction, row.Bank, row.Cash, row.Net)));
            await File.WriteAllLinesAsync(path, lines, new UTF8Encoding(true), _lifetime.Token);
            StatusText.Text = $"Bordro D1'den hazırlandı · {rows.Count} personel · {path}";
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
        });
    }

    private async void ExportAuditTempButton_Click(object sender, RoutedEventArgs e)
    {
        await BusyAsync("Yıllık denetim TEMP D1'den hazırlanıyor...", async () =>
        {
            if (string.IsNullOrWhiteSpace(_token)) throw new InvalidOperationException("Denetim TEMP için KY ERP oturumu gerekir.");
            var (year, _) = SelectedPeriod();
            var exporter = new AuditTempExporter(_paths);
            var folder = await exporter.ExportYearAsync(_erp, _token, year, _lifetime.Token);
            StatusText.Text = $"{year} denetim TEMP hazır · {folder}";
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true });
        });
    }

    private static string Csv(params object?[] cells) => string.Join(';', cells.Select(cell =>
    {
        var value = Convert.ToString(cell, CultureInfo.InvariantCulture) ?? "";
        return value.Contains(';') || value.Contains('"') || value.Contains('\n') || value.Contains('\r')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
    }));
}
