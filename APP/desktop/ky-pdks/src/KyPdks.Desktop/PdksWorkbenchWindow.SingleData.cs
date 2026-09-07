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
