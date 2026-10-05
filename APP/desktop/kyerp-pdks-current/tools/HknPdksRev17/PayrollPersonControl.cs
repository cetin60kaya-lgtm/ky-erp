using System.Data;
using System.Drawing;
using System.Globalization;
using System.Windows.Forms;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class PayrollPersonControl : UserControl
{
    private readonly FirebirdDatabase db;
    private readonly string card;
    private readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Width = 80, Value = DateTime.Today.Year };
    private readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    private readonly Label status = new() { AutoSize = true, Font = new Font("Segoe UI", 9f, FontStyle.Bold), Padding = new Padding(8, 8, 8, 0) };
    private readonly Label warning = new() { AutoSize = true, ForeColor = Color.DarkRed, Padding = new Padding(8, 8, 8, 0) };
    private readonly Button personLock = new() { Width = 165, Height = 30 };
    private readonly Button periodLock = new() { Width = 145, Height = 30 };
    private readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        BackgroundColor = Color.White,
        RowHeadersVisible = false
    };

    internal PayrollPersonControl(FirebirdDatabase database, string personnelCard)
    {
        db = database;
        card = personnelCard;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9f);
        month.Items.AddRange(CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.MonthNames.Take(12).Cast<object>().ToArray());
        month.SelectedIndex = DateTime.Today.Month - 1;

        var top = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 78, Padding = new Padding(8), AutoScroll = true };
        top.Controls.Add(new Label { Text = "Yıl", AutoSize = true, Padding = new Padding(0, 7, 3, 0) });
        top.Controls.Add(year);
        top.Controls.Add(new Label { Text = "Ay", AutoSize = true, Padding = new Padding(6, 7, 3, 0) });
        top.Controls.Add(month);
        top.Controls.Add(Button("Yenile", RefreshData, 90));
        top.Controls.Add(Button("Bordroyu Düzenle", EditPayroll, 155));
        personLock.Click += (_, _) => TogglePersonLock();
        periodLock.Click += (_, _) => TogglePeriodLock();
        top.Controls.Add(personLock);
        top.Controls.Add(periodLock);
        top.Controls.Add(Button("Çakışan Kaydı Temizle", CleanOverlap, 175));
        top.Controls.Add(Button("Düzeltmeyi Sıfırla", ClearOverride, 145));
        top.Controls.Add(status);
        top.Controls.Add(warning);

        Controls.Add(grid);
        Controls.Add(top);
        year.ValueChanged += (_, _) => RefreshData();
        month.SelectedIndexChanged += (_, _) => RefreshData();
        Load += (_, _) => RefreshData();
    }

    private Button Button(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 30 };
        b.Click += (_, _) => action();
        return b;
    }

    private int Year => (int)year.Value;
    private int Month => month.SelectedIndex + 1;

    internal void RefreshData()
    {
        try
        {
            PayrollOverrideService.EnsureSchema(db);
            grid.DataSource = PayrollOverrideService.PersonSummary(db, card, Year, Month);
            var s = PayrollOverrideService.Status(db, card, Year, Month);
            status.Text = $"{CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.GetMonthName(Month)} {Year} • {s.Text}";
            status.ForeColor = s.PeriodLocked ? Color.DarkRed : s.PersonLocked ? Color.DarkOrange : s.HasOverride ? Color.DarkBlue : Color.DarkGreen;
            warning.Text = s.HasOverlap ? "Çakışan dönem kaydı bulundu" : "";
            personLock.Text = s.PersonLocked ? "Personel Kilidini Aç" : "Bu Personeli Kilitle";
            periodLock.Text = s.PeriodLocked ? "Ay Kilidini Aç" : "Ayı Kilitle";
            periodLock.BackColor = s.PeriodLocked ? Color.MistyRose : SystemColors.Control;
            personLock.BackColor = s.PersonLocked ? Color.Bisque : SystemColors.Control;
        }
        catch (Exception ex)
        {
            warning.Text = ex.Message;
        }
    }

    private void EditPayroll()
    {
        try
        {
            var row = PayrollOverrideService.PreferredRow(db, card, Year, Month);
            if (row is null)
            {
                MessageBox.Show(this, "Bu personelin seçili ay için UCRETLER kaydı bulunamadı.", "Bordro");
                return;
            }
            var s = PayrollOverrideService.Status(db, card, Year, Month);
            if (s.HasOverlap)
                MessageBox.Show(this, "Çakışan dönem kaydı var. Düzenleme doğru aylık satıra uygulanacak; taşan kayıt ayrıca temizlenebilir.", "Bordro", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            using var form = new PayrollEditForm(card, PayrollOverrideService.RowValues(row));
            if (form.ShowDialog(this) != DialogResult.OK) return;
            var changed = PayrollOverrideService.SaveOverrides(db, card, Year, Month, form.Values(), form.AutoHours, "Personel kartı / Bordro");
            MessageBox.Show(this, changed.Length == 0 ? "Değişiklik yok." : "Bordro kaydedildi: " + string.Join(", ", changed), "Bordro");
            RefreshData();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Bordro", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void TogglePersonLock()
    {
        try
        {
            var locked = PayrollOverrideService.IsPersonLocked(db, card, Year, Month);
            var action = locked ? "kilidi açılsın mı?" : "bordrosu kilitlensin mi?";
            if (MessageBox.Show(this, $"{card} • {Month:00}/{Year} {action}", "Personel Bordro Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            PayrollOverrideService.SetPersonLock(db, card, Year, Month, !locked, "Personel kartı");
            RefreshData();
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Kilit"); }
    }

    private void TogglePeriodLock()
    {
        try
        {
            var locked = PayrollOverrideService.IsPeriodLocked(db, Year, Month);
            var name = CultureInfo.GetCultureInfo("tr-TR").DateTimeFormat.GetMonthName(Month);
            if (MessageBox.Show(this, locked ? $"{name} {Year} dönem kilidi açılsın mı?" : $"{name} {Year} TÜM PERSONEL için kilitlensin mi?", "Dönem Kilidi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            PayrollOverrideService.SetPeriodLock(db, Year, Month, !locked, "Personel kartı");
            RefreshData();
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Kilit"); }
    }

    private void CleanOverlap()
    {
        try
        {
            var s = PayrollOverrideService.Status(db, card, Year, Month);
            if (!s.HasOverlap) { MessageBox.Show(this, "Çakışan dönem kaydı yok."); return; }
            if (MessageBox.Show(this, "Doğru aylık satır korunacak; yalnız aynı ayın 1'inden başlayıp sonraki aya taşan kayıt silinecek. Devam?", "Çakışan Kaydı Temizle", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            var count = PayrollOverrideService.CleanSafeOverlap(db, card, Year, Month);
            MessageBox.Show(this, count + " taşan kayıt temizlendi.");
            RefreshData();
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Çakışma"); }
    }

    private void ClearOverride()
    {
        try
        {
            if (MessageBox.Show(this, "Bu personelin seçili ay bordro düzeltmeleri kaldırılsın mı? Mevcut değerler hemen değiştirilmez; sonraki hesaplamada normal değerler kullanılabilir.", "Düzeltmeyi Sıfırla", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            PayrollOverrideService.ClearOverrides(db, card, Year, Month);
            RefreshData();
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Bordro"); }
    }
}