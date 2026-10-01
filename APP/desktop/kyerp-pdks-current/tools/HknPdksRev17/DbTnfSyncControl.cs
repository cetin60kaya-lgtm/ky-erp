using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class DbTnfSyncControl : UserControl
{
    readonly Form main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Width = 75, Value = DateTime.Today.Year };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 100 };
    readonly TextBox search = new() { Width = 180, PlaceholderText = "Kart / ad soyad ara" };
    readonly ComboBox statusFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 90 };
    readonly CheckBox errorsOnly = new() { Text = "Sadece Hatalı", AutoSize = true, Checked = true };
    readonly CheckBox hasMovement = new() { Text = "Dönemde hareketi olan", AutoSize = true, Checked = true };
    readonly Label summary = new() { Dock = DockStyle.Bottom, Height = 42, Padding = new Padding(8), Text = "Önce DB'ye bağlanın; Kontrol Et veya SON TAM KONTROL çalıştırın." };
    readonly Label personnelSummary = new() { Dock = DockStyle.Fill, Padding = new Padding(12), Font = new Font("Segoe UI", 11), Text = "Karşılaştırmak için soldan personel seçin." };
    readonly Label details = new() { Dock = DockStyle.Bottom, Height = 45, Padding = new Padding(8), Text = "Önce checkbox ile seçin. Butonlar yalnız seçili kişinin işaretli güvenli satırlarını uygular; DB değişmez. İNCELE otomatik düzeltilmez." };
    readonly ProgressBar progressBar = new() { Width = 105, Height = 26, Style = ProgressBarStyle.Marquee, Visible = false };
    readonly Button cancel = new() { Text = "İptal", Width = 65, Height = 32, Enabled = false };
    readonly DataGridView peopleGrid = Grid();
    readonly DataGridView dbGrid = Grid();
    readonly DataGridView tnfGrid = Grid();
    readonly List<Control> operationControls = [];
    CancellationTokenSource? cancellation;
    AuditSnapshot? snapshot;
    FirebirdDatabase? snapshotDatabase;
    Dictionary<string, List<PairView>> byCard = [];
    List<PersonView> people = [];
    List<PairView> visiblePairs = [];
    string selectedCard = "";
    bool synchronizing;
    bool updatingPeople;
    internal long LastGridMilliseconds { get; private set; }
    internal long LastTotalMilliseconds { get; private set; }
    internal AuditSnapshot? LastSnapshot => snapshot;
    internal bool IsBusy => cancellation is not null;
    FirebirdDatabase? Database => main.GetType().GetField("db", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as FirebirdDatabase;
    TextBox? TnfPathBox => main.GetType().GetField("tnfPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as TextBox;

    internal sealed class PairView(DataRow row)
    {
        internal DataRow Row => row;
        public bool Selected { get => row.Field<bool>("Seç"); set => row["Seç"] = value; }
        public string Date => row.Field<string>("Tarih") ?? "-";
        public string Side => row.Field<string>("Taraf") ?? "Belirsiz";
        public string DbTime => row.Field<int>("DbId") >= 0 ? row.Field<string>("DB Saat") ?? "" : "BOŞ";
        public string TnfTime => row.Field<int>("TnfIndex") >= 0 ? row.Field<string>("TNF Saat") ?? "" : "BOŞ";
        public string Type => row.Field<string>("Tür") ?? "";
        public string Status => row.Field<string>("Durum") ?? "İNCELE";
        public string Operation => row.Field<string>("İşlem") ?? "İNCELE";
        public string Detail => row.Field<string>("Açıklama") ?? "Bozuk TNF satırı; otomatik işlem yapılmaz.";
        internal bool Safe => Operation is "TNF EKLE" or "TNF SİL FAZLA" or "TNF SİL E" or "TNF DÜZELT";
    }

    internal sealed record PersonView(string Card, string Name, string Status, string Hire, string Exit,
        string ErrorType, int ErrorCount, int DbCount, int TnfCount, string Result);

    public DbTnfSyncControl(Form mainForm)
    {
        main = mainForm;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9);
        BackColor = Color.White;
        month.Items.AddRange(["Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]);
        month.SelectedIndex = DateTime.Today.Month;
        statusFilter.Items.AddRange(["Tümü", "Aktif", "Pasif"]);
        statusFilter.SelectedIndex = 0;
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(5), WrapContents = true };
        bar.Controls.AddRange([new Label { Text = "Yıl", AutoSize = true, Padding = new Padding(0,8,0,0) }, year,
            new Label { Text = "Ay", AutoSize = true, Padding = new Padding(0,8,0,0) }, month]);
        void Button(string text, Func<Task> action, int width, Color? color = null)
        {
            var button = new Button { Text = text, Width = width, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = color ?? Color.WhiteSmoke };
            button.Click += async (_, _) =>
            {
                try { await action(); }
                catch (Exception exception) { if (!main.IsDisposed) MessageBox.Show(main, exception.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            };
            operationControls.Add(button);
            bar.Controls.Add(button);
        }
        Button("Kontrol Et", () => RunAuditAsync(false), 95);
        Button("SON TAM KONTROL", () => RunAuditAsync(true), 145, Color.LightBlue);
        Button("DB'YE GÖRE TNF DÜZELT", () => ApplySelectedAsync(null), 185);
        Button("EKSİK TNF EKLE", () => ApplySelectedAsync("TNF EKLE"), 135);
        Button("FAZLA TNF SİL", () => ApplySelectedAsync("FAZLA"), 125);
        Button("SAAT FARKINI DÜZELT", () => ApplySelectedAsync("TNF DÜZELT"), 165);
        Button("SEÇİLENLERİ UYGULA", () => ApplySelectedAsync(null), 165, Color.LightGreen);
        Button("PERSONELİ TEKRAR KONTROL ET", RecheckPersonAsync, 220);
        Button("Güvenli hataları seç", () => SelectVisibleAsync(true), 145);
        Button("Seçimi kaldır", () => SelectVisibleAsync(false), 110);
        Button("GEÇERSİZ DB KAYDINI TEMİZLE", CleanSelectedAsync, 235, Color.MistyRose);
        Button("TNF Listele", () => RunAuditAsync(false, true), 95);
        cancel.Click += (_, _) => cancellation?.Cancel();
        bar.Controls.AddRange([progressBar, cancel]);
        operationControls.AddRange([year, month, statusFilter, errorsOnly, hasMovement, search]);
        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterWidth = 7, Width = 1300, SplitterDistance = 520, Panel1MinSize = 250, Panel2MinSize = 300 };
        var filters = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 63, Padding = new Padding(3) };
        filters.Controls.AddRange([statusFilter, errorsOnly, hasMovement, search]);
        split.Panel1.Controls.Add(peopleGrid);
        split.Panel1.Controls.Add(filters);
        var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 145));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(234, 242, 250) };
        header.Controls.Add(personnelSummary);
        right.Controls.Add(header, 0, 0);
        var comparison = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        comparison.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        comparison.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        comparison.Controls.Add(GridPanel("DB — ANA KAYNAK", dbGrid), 0, 0);
        comparison.Controls.Add(GridPanel("TNF — DÜZELTİLECEK DOSYA", tnfGrid), 1, 0);
        right.Controls.Add(comparison, 0, 1);
        split.Panel2.Controls.Add(right);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        bar.Dock = details.Dock = summary.Dock = DockStyle.Fill;
        summary.BackColor = Color.FromArgb(234,242,250);
        layout.Controls.Add(bar, 0, 0);
        layout.Controls.Add(split, 0, 1);
        layout.Controls.Add(details, 0, 2);
        layout.Controls.Add(summary, 0, 3);
        Controls.Add(layout);
        AddColumn(peopleGrid, "Card", "Kart No", 50);
        AddColumn(peopleGrid, "Name", "Ad Soyad", 105);
        AddColumn(peopleGrid, "Status", "Durum", 65);
        AddColumn(peopleGrid, "Hire", "İşe Giriş", 70);
        AddColumn(peopleGrid, "Exit", "İşten Çıkış", 70);
        AddColumn(peopleGrid, "ErrorType", "Hata Türü", 95);
        AddColumn(peopleGrid, "ErrorCount", "Hata Adedi", 50);
        peopleGrid.ReadOnly = true;
        peopleGrid.MultiSelect = false;
        ConfigureComparison(dbGrid, true);
        ConfigureComparison(tnfGrid, false);
        peopleGrid.SelectionChanged += (_, _) => { if (!updatingPeople) ShowPerson(); };
        search.TextChanged += (_, _) => FilterPeople();
        statusFilter.SelectedIndexChanged += (_, _) => FilterPeople();
        errorsOnly.CheckedChanged += (_, _) => FilterPeople();
        hasMovement.CheckedChanged += (_, _) => FilterPeople();
        year.ValueChanged += (_, _) => InvalidateResult();
        month.SelectedIndexChanged += (_, _) => InvalidateResult();
        if (TnfPathBox is { } pathBox) pathBox.TextChanged += (_, _) => InvalidateResult();
        main.FormClosing += (_, _) => cancellation?.Cancel();
        Disposed += (_, _) => cancellation?.Cancel();
    }

    static DataGridView Grid() => new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AutoGenerateColumns = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None, AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect, RowHeadersVisible = false, BackgroundColor = Color.White,
        RowTemplate = { Height = 26 }, AllowUserToOrderColumns = false, AllowUserToResizeRows = false,
        ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing, ColumnHeadersHeight = 30
    };

    static Control GridPanel(string title, DataGridView grid)
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        panel.Controls.Add(grid);
        panel.Controls.Add(new Label { Dock = DockStyle.Top, Height = 30, Text = title, Font = new Font("Segoe UI", 10, FontStyle.Bold), BackColor = Color.FromArgb(225,233,241), Padding = new Padding(5) });
        return panel;
    }

    static void AddColumn(DataGridView grid, string property, string title, int width) => grid.Columns.Add(new DataGridViewTextBoxColumn
    {
        DataPropertyName = property, HeaderText = title, Width = width, FillWeight = width, ReadOnly = true, SortMode = DataGridViewColumnSortMode.NotSortable
    });

    void ConfigureComparison(DataGridView grid, bool dbSide)
    {
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.Columns.Add(new DataGridViewCheckBoxColumn { DataPropertyName = "Selected", HeaderText = "Seç", Width = 35, FillWeight = 35, MinimumWidth = 28, SortMode = DataGridViewColumnSortMode.NotSortable });
        AddColumn(grid, "Date", "Tarih", 80);
        AddColumn(grid, "Side", "Taraf", 60);
        AddColumn(grid, dbSide ? "DbTime" : "TnfTime", "Saat", 50);
        if (dbSide) AddColumn(grid, "Type", "Tür", 50);
        AddColumn(grid, "Status", "Durum", 125);
        grid.CurrentCellDirtyStateChanged += (_, _) => { if (grid.IsCurrentCellDirty) grid.CommitEdit(DataGridViewDataErrorContexts.Commit); };
        grid.CellValueChanged += (_, args) =>
        {
            if (args.RowIndex < 0 || grid.Rows[args.RowIndex].DataBoundItem is not PairView pair) return;
            if (pair.Selected && pair.Operation == "YOK") pair.Selected = false;
            if (args.RowIndex < dbGrid.RowCount) dbGrid.InvalidateRow(args.RowIndex);
            if (args.RowIndex < tnfGrid.RowCount) tnfGrid.InvalidateRow(args.RowIndex);
        };
        grid.CellFormatting += (_, args) =>
        {
            if (args.RowIndex < 0 || grid.Rows[args.RowIndex].DataBoundItem is not PairView pair || args.CellStyle is null) return;
            args.CellStyle.BackColor = pair.Operation == "YOK" ? Color.White : pair.Operation == "İNCELE" && !pair.Row.Field<bool>("CertainInvalid") ? Color.Gainsboro : pair.Status == "TNF EKSİK" ? Color.LemonChiffon : Color.MistyRose;
        };
        grid.SelectionChanged += (_, _) => { if (grid.CurrentRow?.DataBoundItem is PairView pair) details.Text = pair.Detail; };
        grid.Scroll += (_, args) =>
        {
            if (synchronizing || args.ScrollOrientation != ScrollOrientation.VerticalScroll || grid.FirstDisplayedScrollingRowIndex < 0) return;
            var other = ReferenceEquals(grid, dbGrid) ? tnfGrid : dbGrid;
            if (grid.FirstDisplayedScrollingRowIndex >= other.RowCount) return;
            try { synchronizing = true; other.FirstDisplayedScrollingRowIndex = grid.FirstDisplayedScrollingRowIndex; }
            finally { synchronizing = false; }
        };
    }

    void InvalidateResult()
    {
        cancellation?.Cancel();
        snapshot = null;
        byCard.Clear();
        people.Clear();
        selectedCard = "";
        FilterPeople();
        summary.Text = "Kaynak/dönem değişti; yeniden Kontrol Et.";
    }

    string RequireTnfPath()
    {
        var path = TnfPathBox?.Text.Trim() ?? "";
        if (!File.Exists(path)) throw new FileNotFoundException("TNF dosyasını seçin.");
        return Path.GetFullPath(path);
    }

    AuditRequest Request(bool full)
    {
        var path = RequireTnfPath();
        var selectedYear = (int)year.Value;
        if (full)
        {
            var match = Regex.Match(Path.GetFileNameWithoutExtension(path), @"(?<!\d)(20\d{2})(?!\d)");
            if (match.Success) selectedYear = int.Parse(match.Value);
        }
        var start = new DateTime(selectedYear, full || month.SelectedIndex == 0 ? 1 : month.SelectedIndex, 1);
        var end = full || month.SelectedIndex == 0 ? start.AddYears(1) : start.AddMonths(1);
        var settings = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS", "TNF_FORMAT_AYAR.json");
        var format = File.Exists(settings) ? JsonSerializer.Deserialize<TnfFormat>(File.ReadAllText(settings)) ?? new TnfFormat() : new TnfFormat();
        return new(path, start, end, "", format);
    }

    void SetBusy(bool busy)
    {
        foreach (var control in operationControls) control.Enabled = !busy;
        peopleGrid.Enabled = dbGrid.Enabled = tnfGrid.Enabled = !busy;
        progressBar.Visible = busy;
        cancel.Enabled = busy;
        if (busy) summary.Text = "Kontrol ediliyor...";
    }

    static (Dictionary<string, List<PairView>> Groups, List<PersonView> People) PrepareView(AuditSnapshot result, CancellationToken token)
    {
        var groups = new Dictionary<string, List<PairView>>();
        var dbCounts = result.Db.GroupBy(movement => movement.Card).ToDictionary(group => group.Key, group => group.Count());
        foreach (DataRow row in result.Table.Rows)
        {
            token.ThrowIfCancellationRequested();
            var card = row.Field<string>("Kart No") ?? "";
            if (!groups.TryGetValue(card, out var list)) groups[card] = list = [];
            list.Add(new PairView(row));
        }
        var persons = new List<PersonView>();
        foreach (var entry in groups)
        {
            token.ThrowIfCancellationRequested();
            var rule = result.People.GetValueOrDefault(entry.Key);
            var errors = entry.Value.Where(pair => pair.Operation != "YOK").ToArray();
            var counts = errors.GroupBy(pair => pair.Status).Select(group => $"{group.Key}: {group.Count()}");
            var detail = string.Join(" | ", counts);
            persons.Add(new(entry.Key.Length == 0 ? "FORMAT" : entry.Key, rule?.Name ?? "KIMLIK YOK", rule?.Active == true ? "AKTİF" : rule?.Active == false ? "PASİF" : string.IsNullOrWhiteSpace(rule?.StatusCode) ? "DB DURUM BOŞ" : "TANIMSIZ",
                rule?.Hire?.ToString("dd.MM.yyyy") ?? "-", rule?.Exit?.ToString("dd.MM.yyyy") ?? "-",
                errors.Length == 0 ? "UYUMLU" : string.Join(", ", errors.Select(pair => pair.Status).Distinct()), errors.Length,
                dbCounts.GetValueOrDefault(entry.Key), entry.Value.Count(pair => pair.Row.Field<int>("TnfIndex") >= 0), errors.Length == 0 ? "✓ UYUMLU" : detail));
        }
        return (groups, persons.OrderBy(person => person.Card).ToList());
    }

    static void Bind(DataGridView grid, object items)
    {
        var old = grid.DataSource as BindingSource;
        grid.DataSource = new BindingSource { DataSource = items };
        old?.Dispose();
    }

    void FilterPeople()
    {
        updatingPeople = true;
        var filtered = people.Where(person => (search.Text.Trim().Length == 0 || (person.Card + " " + person.Name).Contains(search.Text.Trim(), StringComparison.CurrentCultureIgnoreCase)) && (statusFilter.SelectedIndex == 0 || person.Status == (statusFilter.SelectedIndex == 1 ? "AKTİF" : "PASİF")) &&
            (!errorsOnly.Checked || person.ErrorCount > 0) && (!hasMovement.Checked || person.DbCount + person.TnfCount > 0 || person.Card == "FORMAT")).ToList();
        Bind(peopleGrid, filtered);
        updatingPeople = false;
        var restore = filtered.FindIndex(person => person.Card == selectedCard);
        if (restore >= 0 && peopleGrid.RowCount > restore) peopleGrid.CurrentCell = peopleGrid.Rows[restore].Cells[0];
        ShowPerson();
    }

    void ShowPerson()
    {
        if (peopleGrid.CurrentRow?.DataBoundItem is not PersonView person)
        {
            visiblePairs = [];
            Bind(dbGrid, visiblePairs);
            Bind(tnfGrid, visiblePairs);
            personnelSummary.Text = "Filtreye uygun personel yok. Tümü / Sadece Hatalı filtresini kontrol edin.";
            return;
        }
        selectedCard = person.Card == "FORMAT" ? "" : person.Card;
        visiblePairs = byCard.GetValueOrDefault(selectedCard) ?? [];
        Bind(dbGrid, visiblePairs);
        Bind(tnfGrid, visiblePairs);
        personnelSummary.Text = $"{person.Card}  {person.Name}\nDurum: {person.Status}     İşe Giriş: {person.Hire}     İşten Çıkış: {person.Exit}\nDB Hareket: {person.DbCount}     TNF Hareket: {person.TnfCount}\nSonuç: {person.Result}";
    }

    internal async Task RunAuditAsync(bool full, bool listOnly = false, AuditRequest? scope = null)
    {
        if (IsBusy) return;
        cancellation = new CancellationTokenSource();
        var token = cancellation.Token;
        var total = Stopwatch.StartNew();
        SetBusy(true);
        snapshot = null;
        try
        {
            var database = Database ?? throw new InvalidOperationException("Önce DB'ye bağlanın.");
            var request = scope ?? Request(full);
            var progress = new Progress<string>(text => { if (!IsDisposed && IsBusy) summary.Text = "Kontrol ediliyor... " + text; });
            var prepared = await Task.Run(async () =>
            {
                var result = await SyncEngine.ReadAsync(database, request, token, progress, listOnly);
                return (Result: result, View: PrepareView(result, token), Summary: Summary(result.Table));
            }, token);
            token.ThrowIfCancellationRequested();
            if (IsDisposed || main.IsDisposed) return;
            if (!ReferenceEquals(database, Database) || RequireTnfPath() != request.Path) throw new InvalidOperationException("Kaynak değişti; kontrolü yenileyin.");
            var bind = Stopwatch.StartNew();
            byCard = prepared.View.Groups;
            people = prepared.View.People;
            snapshot = listOnly ? null : prepared.Result;
            snapshotDatabase = database;
            if (listOnly) errorsOnly.Checked = false;
            FilterPeople();
            LastGridMilliseconds = bind.ElapsedMilliseconds;
            LastTotalMilliseconds = total.ElapsedMilliseconds;
            summary.Text = $"{(full ? "SON TAM KONTROL" : listOnly ? "TNF Listele" : "Kontrol")} {request.Start:dd.MM.yyyy}–{request.End:dd.MM.yyyy} | {prepared.Summary}";
            SyncEngine.Log($"REV17 db_query_ms={prepared.Result.DbMilliseconds} tnf_read_parse_ms={prepared.Result.TnfMilliseconds} compare_ms={prepared.Result.CompareMilliseconds} grid_bind_ms={LastGridMilliseconds} total_ms={LastTotalMilliseconds} db_events={prepared.Result.Db.Count} rows={prepared.Result.Table.Rows.Count}");
        }
        catch (OperationCanceledException) { if (!IsDisposed) summary.Text = "Kontrol iptal edildi; sonuç uygulanamaz."; }
        catch (Exception exception) { if (!IsDisposed) { summary.Text = "Kontrol başarısız; eski sonuç uygulanamaz."; MessageBox.Show(main, exception.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error); } }
        finally { cancellation?.Dispose(); cancellation = null; if (!IsDisposed) SetBusy(false); }
    }

    static string Summary(DataTable table)
    {
        var counts = table.AsEnumerable().GroupBy(row => row.Field<string>("İşlem")!).ToDictionary(group => group.Key, group => group.Count());
        int Count(string operation) => counts.GetValueOrDefault(operation);
        return $"Uyumlu={Count("YOK")}  Eksik={Count("TNF EKLE")}  Fazla={Count("TNF SİL FAZLA") + Count("TNF SİL E")}  Saat Farkı={Count("TNF DÜZELT")}  İncele/Geçersiz={Count("İNCELE")}";
    }

    Task SelectVisibleAsync(bool select)
    {
        if (IsBusy || snapshot is null) return Task.CompletedTask;
        foreach (var pair in visiblePairs) if (!select || pair.Safe) pair.Selected = select;
        dbGrid.Refresh();
        tnfGrid.Refresh();
        return Task.CompletedTask;
    }

    async Task RecheckPersonAsync()
    {
        if (selectedCard.Length == 0) { MessageBox.Show(main, "Soldan personel seçin."); return; }
        await RunAuditAsync(false, scope: snapshot?.Request with { Card = "" });
    }

    async Task ApplySelectedAsync(string? operation)
    {
        if (IsBusy || snapshot is null || !ReferenceEquals(snapshotDatabase, Database) || RequireTnfPath() != snapshot.Request.Path) { MessageBox.Show(main, "Önce Kontrol Et çalıştırın."); return; }
        dbGrid.EndEdit();
        tnfGrid.EndEdit();
        var rows = visiblePairs.Where(pair => pair.Selected && pair.Safe && (operation is null || operation == pair.Operation || operation == "FAZLA" && pair.Operation is "TNF SİL E" or "TNF SİL FAZLA")).Select(pair => pair.Row).ToArray();
        if (rows.Length == 0) { MessageBox.Show(main, "Önce güvenli hata checkbox'larını işaretleyin. İNCELE değiştirilemez."); return; }
        await ApplyAsync(rows, false);
    }

    async Task CleanSelectedAsync()
    {
        if (IsBusy || snapshot is null || selectedCard.Length == 0) { MessageBox.Show(main, "Soldan tek kişi seçin ve kesin geçersiz satırları işaretleyin."); return; }
        dbGrid.EndEdit();
        tnfGrid.EndEdit();
        var rows = visiblePairs.Where(pair => pair.Selected && pair.Row.Field<bool>("CertainInvalid") && pair.Row.Field<int>("DbId") >= 0).Select(pair => pair.Row).ToArray();
        if (rows.Length == 0) { MessageBox.Show(main, "Kesin geçersiz seçili DB kaydı yok; şüpheli kayıt silinmez."); return; }
        await ApplyAsync(rows, true);
    }

    async Task ApplyAsync(DataRow[] rows, bool clean)
    {
        if (snapshot is null || !ReferenceEquals(snapshotDatabase, Database)) return;
        if (MessageBox.Show(main, $"Seçili {rows.Length} kayıt {(clean ? "DB transaction ile temizlenecek; tam DB satır yedeği alınacak" : "yalnız TNF üzerinde düzeltilecek; DB ASLA değişmeyecek")}. TNF _YEDEK alınır. Devam?",
            "Seçilenleri Uygula", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        var previous = clean ? snapshot with { Request = snapshot.Request with { Card = selectedCard } } : snapshot;
        snapshot = null;
        cancellation = new CancellationTokenSource();
        SetBusy(true);
        var succeeded = false;
        try
        {
            if (clean)
            {
                var cardSnapshot = await Task.Run(() => SyncEngine.ReadAsync(snapshotDatabase!, previous.Request, cancellation.Token));
                var selectedIds = rows.Select(row => (row.Field<int>("DbId"), row.Field<string>("Taraf"))).ToHashSet();
                var selectedRows = cardSnapshot.Table.AsEnumerable().Where(row => selectedIds.Contains((row.Field<int>("DbId"), row.Field<string>("Taraf")))).ToArray();
                if (previous.FileHash != cardSnapshot.FileHash || SyncEngine.DbFingerprint(previous.Db.Where(movement => movement.Card == selectedCard), previous.People.Where(person => person.Key == selectedCard).ToDictionary()) != cardSnapshot.DbHash)
                    throw new InvalidOperationException("DB/personel/TNF değişmiş; önce yeniden kontrol edin.");
                await Task.Run(() => SyncEngine.ApplyAsync(snapshotDatabase!, cardSnapshot, selectedRows, true, cancellation.Token));
            }
            else await Task.Run(() => SyncEngine.ApplyAsync(snapshotDatabase!, previous, rows, false, cancellation.Token));
            succeeded = true;
        }
        catch (OperationCanceledException) { summary.Text = "Düzeltme iptal edildi."; }
        catch (Exception exception) { MessageBox.Show(main, exception.Message, "Düzeltme başarısız", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { cancellation.Dispose(); cancellation = null; if (!IsDisposed) SetBusy(false); }
        if (succeeded && !IsDisposed) await RunAuditAsync(true);
    }
}
