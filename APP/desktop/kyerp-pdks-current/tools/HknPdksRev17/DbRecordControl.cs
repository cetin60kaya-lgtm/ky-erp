using System.Diagnostics;
using System.Reflection;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class DbRecordControl : UserControl
{
    readonly Form main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Value = DateTime.Today.Year, Width = 75 };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 100 };
    readonly DateTimePicker start = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly DateTimePicker end = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly ComboBox operation = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 185 };
    readonly CheckedListBox people = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox days = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DataGridView preview = new() { Dock = DockStyle.Fill, ReadOnly = true, AutoGenerateColumns = false, AllowUserToAddRows = false,
        RowHeadersVisible = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = Color.White };
    readonly Label status = new() { Dock = DockStyle.Fill, AutoSize = true, Padding = new Padding(8), Text = "DB'ye bağlanın; personeller otomatik yüklenir. Gün/personel seçip ÖNİZLE çalıştırın." };
    readonly Label workTimeInformation = new() { Dock = DockStyle.Fill, Padding = new Padding(8), Text = "Saatler sabit değildir. Giriş/çıkış aralığı Hedef DB çalışma ayarından alınır; yeni saatler bu aralıkta doğal dağıtılır." };
    readonly ProgressBar progress = new() { Width = 110, Style = ProgressBarStyle.Marquee, Visible = false };
    readonly List<Control> controls = [];
    readonly Button cancel = new() { Text = "İptal", Width = 65, Enabled = false };
    CancellationTokenSource? cancellation;
    FirebirdDatabase? peopleDatabase;
    FirebirdDatabase? previewDatabase;
    DbRecordSnapshot? snapshot;
    bool updating;
    internal DbRecordSnapshot? LastSnapshot => snapshot;
    internal int PersonCount => people.Items.Count;
    FirebirdDatabase? Database => main.GetType().GetField("db", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as FirebirdDatabase;
    TextBox? TnfBox => main.GetType().GetField("tnfPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as TextBox;
    sealed record DayItem(DateTime Day) { public override string ToString() => $"{Day:dd.MM.yyyy dddd}"; }

    internal DbRecordControl(Form owner)
    {
        main = owner;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9);
        month.Items.AddRange(["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]);
        month.SelectedIndex = DateTime.Today.Month - 1;
        operation.Items.AddRange(["Giriş Ekle", "Çıkış Ekle", "Giriş + Çıkış Ekle", "Saat Düzelt", "Mükerrer Temizle", "Fazla Kayıt Temizle"]);
        operation.SelectedIndex = 2;
        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Padding = new Padding(5), WrapContents = true };
        void Field(string title, Control control) { top.Controls.Add(new Label { Text = title, AutoSize = true, Padding = new Padding(4, 7, 0, 0) }); top.Controls.Add(control); controls.Add(control); }
        Field("Yıl", year); Field("Ay", month); Field("Başlangıç", start); Field("Bitiş", end);
        Field("İşlem", operation);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, Padding = new Padding(5), WrapContents = true };
        void Button(string text, Action action, int width)
        {
            var button = new Button { Text = text, Width = width, Height = 35 };
            button.Click += (_, _) => action(); buttons.Controls.Add(button); controls.Add(button);
        }
        Button("TÜM PERSONELİ SEÇ", () => Check(people, true), 165);
        Button("TÜM HAFTA İÇİNİ SEÇ", SelectWeekdays, 185);
        Button("HAFTA SONUNU KALDIR", RemoveWeekends, 190);
        Button("SEÇİMİ TEMİZLE", () => { Check(people, false); Check(days, false); }, 155);
        Button("ÖNİZLE", async () => await PreviewAsync(), 105);
        Button("DB'YE UYGULA", async () => await ApplyAsync(), 140);
        cancel.Click += (_, _) => cancellation?.Cancel();
        buttons.Controls.AddRange([progress, cancel]);
        var content = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 2 };
        content.ColumnStyles.Add(new(SizeType.Absolute, 250)); content.ColumnStyles.Add(new(SizeType.Absolute, 200)); content.ColumnStyles.Add(new(SizeType.Percent, 100));
        content.RowStyles.Add(new(SizeType.Absolute, 28)); content.RowStyles.Add(new(SizeType.Percent, 100));
        foreach (var title in new[] { "PERSONEL — çoklu seçim", "GÜNLER — hafta sonu varsayılan kapalı", "YAPILACAK İŞLEMLER — sadece değişiklikler" }) content.Controls.Add(new Label { Text = title, Dock = DockStyle.Fill });
        content.Controls.Add(people, 0, 1); content.Controls.Add(days, 1, 1); content.Controls.Add(preview, 2, 1);
        foreach (var column in new[] { ("Card", "Kart"), ("Name", "Ad Soyad"), ("Day", "Tarih"), ("Side", "Taraf"),
            ("ExistingTime", "Eski Saat"), ("NewTime", "Yeni Saat"), ("Operation", "İşlem") }) preview.Columns.Add(new DataGridViewTextBoxColumn {
                DataPropertyName = column.Item1, HeaderText = column.Item2, SortMode = DataGridViewColumnSortMode.NotSortable });
        preview.Columns[2].DefaultCellStyle.Format = "dd.MM.yyyy";
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(5) };
        layout.RowStyles.Add(new(SizeType.AutoSize)); layout.RowStyles.Add(new(SizeType.AutoSize)); layout.RowStyles.Add(new(SizeType.Percent, 100));
        layout.RowStyles.Add(new(SizeType.Absolute, 60)); layout.RowStyles.Add(new(SizeType.Absolute, 42));
        layout.Controls.Add(top, 0, 0); layout.Controls.Add(buttons, 0, 1); layout.Controls.Add(content, 0, 2);
        layout.Controls.Add(workTimeInformation, 0, 3);
        layout.Controls.Add(status, 0, 4); Controls.Add(layout);
        controls.AddRange([people, days]);
        year.ValueChanged += (_, _) => SetMonth(); month.SelectedIndexChanged += (_, _) => SetMonth();
        start.ValueChanged += (_, _) => { if (!updating) RebuildDays(); }; end.ValueChanged += (_, _) => { if (!updating) RebuildDays(); };
        people.ItemCheck += (_, _) => InvalidatePreview(); days.ItemCheck += (_, _) => InvalidatePreview(); operation.SelectedIndexChanged += (_, _) => InvalidatePreview();
        VisibleChanged += async (_, _) => { if (Visible && !ReferenceEquals(peopleDatabase, Database)) await LoadPeopleAsync(); };
        if (main.GetType().GetField("dbPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) is TextBox path)
            path.TextChanged += (_, _) => { cancellation?.Cancel(); peopleDatabase = null; people.Items.Clear(); InvalidatePreview(); };
        main.FormClosing += (_, _) => cancellation?.Cancel(); Disposed += (_, _) => cancellation?.Cancel();
        SetMonth();
    }

    void SetMonth()
    {
        updating = true;
        start.Value = new DateTime((int)year.Value, month.SelectedIndex + 1, 1);
        end.Value = start.Value.AddMonths(1).AddDays(-1);
        updating = false; RebuildDays();
    }
    void RebuildDays()
    {
        InvalidatePreview(); days.Items.Clear();
        if (end.Value.Date < start.Value.Date || (end.Value.Date - start.Value.Date).Days > 365) { status.Text = "Tarih aralığı 1–366 gün olmalıdır."; return; }
        days.BeginUpdate();
        for (var day = start.Value.Date; day <= end.Value.Date; day = day.AddDays(1)) days.Items.Add(new DayItem(day), day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday));
        days.EndUpdate();
    }
    void InvalidatePreview() { if (updating) return; snapshot = null; preview.DataSource = null; status.Text = "Seçim değişti; ÖNİZLE çalıştırın."; }
    static void Check(CheckedListBox list, bool value) { list.BeginUpdate(); for (var index = 0; index < list.Items.Count; index++) list.SetItemChecked(index, value); list.EndUpdate(); }
    void SelectWeekdays() { for (var index = 0; index < days.Items.Count; index++) if (((DayItem)days.Items[index]).Day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday)) days.SetItemChecked(index, true); }
    void RemoveWeekends() { for (var index = 0; index < days.Items.Count; index++) if (((DayItem)days.Items[index]).Day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) days.SetItemChecked(index, false); }
    void Busy(bool value) { foreach (var control in controls) control.Enabled = !value; progress.Visible = value; cancel.Enabled = value; }

    internal async Task LoadPeopleAsync()
    {
        if (cancellation is not null) return;
        var database = Database;
        if (database is null) { status.Text = "Önce ana ekrandan DB'ye bağlanın."; return; }
        cancellation = new(); Busy(true);
        try
        {
            var result = await Task.Run(() => DbRecordService.ReadPeople(database, cancellation.Token), cancellation.Token);
            if (IsDisposed || !ReferenceEquals(database, Database)) return;
            people.Items.Clear(); people.Items.AddRange(result); peopleDatabase = database; status.Text = $"{result.Length} personel yüklendi. Personel/gün seçin.";
        }
        catch (OperationCanceledException) { }
        catch (Exception exception) { if (!IsDisposed) status.Text = "Personel yüklenemedi: " + exception.Message; }
        finally { cancellation?.Dispose(); cancellation = null; if (!IsDisposed) Busy(false); }
    }

    internal async Task PreviewAsync()
    {
        if (cancellation is not null) return;
        if (!ReferenceEquals(peopleDatabase, Database)) await LoadPeopleAsync();
        var cards = people.CheckedItems.Cast<DbRecordPerson>().Select(person => person.Card).ToArray();
        var dates = days.CheckedItems.Cast<DayItem>().Select(day => day.Day).ToArray();
        cancellation = new(); Busy(true); snapshot = null;
        var timer = Stopwatch.StartNew();
        try
        {
            var database = Database ?? throw new InvalidOperationException("Önce DB'ye bağlanın.");
            var mode = (DbRecordMode)(operation.SelectedIndex + 1);
            var result = await Task.Run(() => DbRecordService.Read(database, cards, dates, cancellation.Token, mode: mode), cancellation.Token);
            if (IsDisposed || !ReferenceEquals(database, Database)) return;
            snapshot = result; previewDatabase = database; preview.DataSource = result.Changes;
            workTimeInformation.Text = $"Saatler sabit değildir. {result.WorkHours.Information}. Yeni saatler yalnız bu aralık içinde doğal dağıtılır; ardışık günlerde aynı dakika tekrarı engellenir. E türleri korunur; ana TNF aynı işlemde DB'ye göre hizalanır.";
            status.Text = $"{operation.Text} | Personel: {cards.Length} | Gün: {dates.Length} | Yapılacak işlem: {result.Changes.Length} | {timer.ElapsedMilliseconds} ms";
        }
        catch (OperationCanceledException) { if (!IsDisposed) status.Text = "İptal edildi."; }
        catch (Exception exception) { if (!IsDisposed) { status.Text = exception.Message; MessageBox.Show(main, exception.Message, "DB KAYIT", MessageBoxButtons.OK, MessageBoxIcon.Warning); } }
        finally { cancellation?.Dispose(); cancellation = null; if (!IsDisposed) Busy(false); }
    }

    async Task ApplyAsync()
    {
        if (cancellation is not null) return;
        if (snapshot is null || !ReferenceEquals(previewDatabase, Database)) { MessageBox.Show(main, "Önce ÖNİZLE çalıştırın."); return; }
        var current = snapshot;
        if (current.Changes.Length == 0) { status.Text = "Seçilen işlem için yapılacak değişiklik yok."; return; }
        if (MessageBox.Show(main, $"{current.Cards.Length} personel / {current.Days.Length} seçili gün.\nİşlem: {operation.Text}\nÖnizlemedeki {current.Changes.Length} değişiklik uygulanacak; diğer kayıtlar ve E türleri korunacak.\nİşlemden önce DB ve TNF yedeği alınır. DB + ana TNF tek işlemde birlikte hizalanır. Devam?", "DB KAYIT — işlem onayı", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var tnf = TnfBox?.Text?.Trim() ?? "";
        if (!File.Exists(tnf)) { MessageBox.Show(main, "Ana TNF dosyasını seçin. DB KAYIT artık DB + TNF birlikte çalışır.", "DB KAYIT", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        cancellation = new(); Busy(true); var succeeded = false; string backup = "";
        try { backup = await Task.Run(() => DbRecordService.ApplyAsync(previewDatabase!, current, tnf, cancellation.Token), cancellation.Token); succeeded = true; }
        catch (OperationCanceledException) { if (!IsDisposed) status.Text = "İptal edildi; DB transaction geri alındı."; }
        catch (Exception exception) { if (!IsDisposed) MessageBox.Show(main, exception.Message, "DB uygulanamadı", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { snapshot = null; cancellation?.Dispose(); cancellation = null; if (!IsDisposed) Busy(false); }
        if (succeeded && !IsDisposed) { await PreviewAsync(); status.Text += " | DB + ana TNF birlikte tamamlandı. Ayrı TNF işlemi gerekmez. DB yedeği: " + backup; }
    }
}
