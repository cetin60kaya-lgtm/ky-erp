using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed partial class DbTnfSyncControl : UserControl
{
    readonly Form main;
    readonly bool tnfOnly;
    readonly Label workTimeInformation = new() { AutoSize = true, Padding = new Padding(4), ForeColor = Color.DarkSlateBlue, Text = WorkTimePolicy.Default.Information };
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Width = 75, Value = DateTime.Today.Year };
    readonly ComboBox month = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 100 };
    readonly TextBox search = new() { Width = 180, PlaceholderText = "Kart / ad soyad ara" };
    readonly ComboBox statusFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 90 };
    readonly CheckBox errorsOnly = new() { Text = "Sadece Hatalı", AutoSize = true, Checked = true };
    readonly CheckBox hasMovement = new() { Text = "Dönemde hareketi olan", AutoSize = true, Checked = false };
    readonly Label summary = new() { Dock = DockStyle.Bottom, Height = 42, Padding = new Padding(8), Text = "Önce DB'ye bağlanın; Kontrol Et veya SON TAM KONTROL çalıştırın." };
    TnfOutputs? lastOutputs;
    string outputSourcePath = "";
    readonly Label personnelSummary = new() { Dock = DockStyle.Fill, Padding = new Padding(12), Font = new Font("Segoe UI", 11), Text = "Karşılaştırmak için soldan personel seçin." };
    readonly Label details = new() { Dock = DockStyle.Bottom, Height = 64, Padding = new Padding(8), Text = "DB ANA KAYNAK. TNF yalnız DB'deki normal hareketleri bire bir taşır; E kayıtları TNF'ye yazılmaz. Eksik eklenir, fazla/mükerrer silinir, saat DB'ye çekilir." };
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

    internal sealed class PairView(DataRow row) : INotifyPropertyChanged
    {
        internal DataRow Row => row;
        public event PropertyChangedEventHandler? PropertyChanged;
        public bool Selected
        {
            get => row.Field<bool>("Seç");
            set
            {
                if (Selected == value) return;
                row["Seç"] = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Selected)));
            }
        }
        public string Date => row.Field<string>("Tarih") ?? "-";
        public string Side => row.Field<string>("Taraf") ?? "Belirsiz";
        public string DbTime => row.Field<int>("DbId") >= 0 ? row.Field<string>("DB Saat") ?? "" : "BOŞ";
        public string TnfTime => row.Field<int>("TnfIndex") >= 0 ? row.Field<string>("TNF Saat") ?? "" : "BOŞ";
        public string Type => row.Field<string>("Tür") ?? "";
        public string Status => row.Field<string>("Durum") ?? "İNCELE";
        public string Operation => row.Field<string>("İşlem") ?? "İNCELE";
        public string Detail => row.Field<string>("Açıklama") ?? "Bozuk TNF satırı; otomatik işlem yapılmaz.";
        internal bool Safe => IsSafeOperation(Row);
    }

    internal sealed record PersonView(string Card, string Name, string DbStatus, string Status, string Hire, string Exit,
        string ErrorType, int ErrorCount, int DbCount, int TnfCount, int Missing, int Extra, int TimeDifference, int EErrors, int Review, string Note, string Result);

    public DbTnfSyncControl(Form mainForm, bool tnfOnly = false)
    {
        main = mainForm;
        this.tnfOnly = tnfOnly;
        if (main is MainForm application)
        {
            workTimeInformation.Text = application.WorkHours.Information;
            EventHandler update = (_, _) => workTimeInformation.Text = application.WorkHours.Information;
            application.WorkHoursChanged += update;
            Disposed += (_, _) => application.WorkHoursChanged -= update;
        }
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9);
        BackColor = Color.White;
        month.Items.AddRange(["Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]);
        month.SelectedIndex = 0;
        statusFilter.Items.AddRange(["Tümü", "Aktif", "Pasif"]);
        statusFilter.SelectedIndex = 0;
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(5), WrapContents = false, FlowDirection = FlowDirection.TopDown };
        var checkBar = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
        var personBar = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
        bar.Controls.AddRange([checkBar, personBar]);
        checkBar.Controls.AddRange([new Label { Text = "Yıl", AutoSize = true, Padding = new Padding(0,8,0,0) }, year,
            new Label { Text = "Ay", AutoSize = true, Padding = new Padding(0,8,0,0) }, month]);
        void Button(string text, Func<Task> action, int width, Color? color = null, FlowLayoutPanel? group = null)
        {
            var button = new Button { Text = text, Width = width, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = color ?? Color.WhiteSmoke };
            button.Click += async (_, _) =>
            {
                try { await action(); }
                catch (Exception exception) { if (!main.IsDisposed) MessageBox.Show(main, exception.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            };
            operationControls.Add(button);
            (group ?? checkBar).Controls.Add(button);
        }
        if (tnfOnly)
        {
            Button("SADECE KONTROL", () => RunAuditAsync(month.SelectedIndex == 0), 145);
            Button("TNF'Yİ DB'YE GÖRE DÜZELT", ApplyAllSafeAsync, 215, Color.LightGreen, personBar);
            Button("ÇIKTIYI AÇ", OpenOutputsAsync, 145, group: personBar);
        }
        else
        {
            Button("KONTROL ET", () => RunAuditAsync(month.SelectedIndex == 0), 145);
            Button("TEK ATIŞ KONTROL + DÜZELT", OneClickExactSyncAsync, 280, Color.LightGreen, personBar);
            var rule = new Label
            {
                Text = "KURAL: DB ANA KAYNAK • Ay=Tümü ise TÜM YIL • Eksik ekle • Fazla/mükerrer sil • Saat DB'ye çek • E kayıtları TNF'de olmaz",
                AutoSize = true,
                Padding = new Padding(10, 9, 0, 0),
                ForeColor = Color.DarkGreen,
                Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            personBar.Controls.Add(rule);
        }
        var paths = new Label { AutoSize = true, MaximumSize = new Size(1450, 65), Padding = new Padding(4) };
        void UpdatePaths() => paths.Text = "DB: " + (main.GetType().GetField("dbPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as TextBox)?.Text + "\nTNF: " + TnfPathBox?.Text;
        UpdatePaths();
        if (TnfPathBox is { } sourceBox) sourceBox.TextChanged += (_, _) => UpdatePaths();
        if (main.GetType().GetField("dbPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) is TextBox databaseBox)
            databaseBox.TextChanged += (_, _) => { UpdatePaths(); InvalidateResult(); };
        bar.Controls.Add(paths);
        if (tnfOnly)
        {
            var files = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
            var path = new TextBox { Width = 480, Text = TnfPathBox?.Text ?? "", PlaceholderText = "TNF dosyası" };
            path.TextChanged += (_, _) => { if (TnfPathBox is { } original && original.Text != path.Text) original.Text = path.Text; };
            if (TnfPathBox is { } originalPath) originalPath.TextChanged += (_, _) => { if (path.Text != originalPath.Text) path.Text = originalPath.Text; };
            var browse = new Button { Text = "TNF SEÇ", Width = 90 };
            browse.Click += (_, _) => { using var picker = new OpenFileDialog { Filter = "TNF|*.Tnf|Tüm dosyalar|*.*", FileName = path.Text }; if (picker.ShowDialog(main) == DialogResult.OK) path.Text = picker.FileName; };
            var databaseSource = new Button { Text = "DB SEÇ / BAĞLAN", Width = 160 };
            databaseSource.Click += (_, _) => main.GetType().GetMethod("PickDb", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(main, null);
            operationControls.AddRange([path, browse, databaseSource]);
            files.Controls.AddRange([databaseSource, path, browse]);
            bar.Controls.Add(files);
        }
        bar.SetFlowBreak(paths, true);
        bar.Controls.Add(workTimeInformation);
        bar.SetFlowBreak(workTimeInformation, true);
        var selectedPersonBar = new FlowLayoutPanel { AutoSize = true, WrapContents = false };
        bar.Controls.Add(selectedPersonBar);
        if (!tnfOnly)
            selectedPersonBar.Controls.Add(new Label
            {
                Text = "Tek kural vardır: TNF, seçilen ay/yıl için DB'nin bire bir kopyasıdır.",
                AutoSize = true,
                Padding = new Padding(4, 8, 0, 0),
                ForeColor = Color.DarkSlateGray
            });
        cancel.Click += (_, _) => cancellation?.Cancel();
        checkBar.Controls.AddRange([progressBar, cancel]);
        operationControls.AddRange([year, month, statusFilter, errorsOnly, hasMovement, search]);
        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterWidth = 7, Width = 1300, SplitterDistance = 710, Panel1MinSize = 250, Panel2MinSize = 300 };
        var filters = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 63, Padding = new Padding(3) };
        filters.Controls.AddRange([statusFilter, errorsOnly, hasMovement, search]);
        split.Panel1.Controls.Add(peopleGrid);
        split.Panel1.Controls.Add(filters);
        var right = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2 };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 180));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(234, 242, 250) };
        header.Controls.Add(personnelSummary);
        right.Controls.Add(header, 0, 0);
        var comparison = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        comparison.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        comparison.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        comparison.Controls.Add(GridPanel("DB — ANA KAYNAK", dbGrid), 0, 0);
        comparison.Controls.Add(GridPanel(tnfOnly ? "TNF — DÜZENLENECEK DOSYA" : "TNF — DÜZELTİLECEK DOSYA", tnfGrid), 1, 0);
        var tabs = new TabControl { Dock = DockStyle.Fill };
        var tnfPage = new TabPage("DB / TNF — AYNI HİZADA");
        tnfPage.Controls.Add(comparison);
        tabs.TabPages.Add(tnfPage);
        right.Controls.Add(tabs, 0, 1);
        split.Panel2.Controls.Add(right);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 65));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        bar.Dock = details.Dock = summary.Dock = DockStyle.Fill;
        summary.BackColor = Color.FromArgb(234,242,250);
        layout.Controls.Add(bar, 0, 0);
        layout.Controls.Add(split, 0, 1);
        layout.Controls.Add(details, 0, 2);
        layout.Controls.Add(summary, 0, 3);
        Controls.Add(layout);
        AddColumn(peopleGrid, "Card", "Kart", 55);
        AddColumn(peopleGrid, "Name", "Ad Soyad", 120);
        AddColumn(peopleGrid, "DbStatus", "DB Durumu", 100);
        AddColumn(peopleGrid, "Status", "Efektif Durum", 145);
        AddColumn(peopleGrid, "DbCount", "DB Hareket", 80);
        AddColumn(peopleGrid, "TnfCount", "TNF Hareket", 80);
        AddColumn(peopleGrid, "Missing", "Eksik", 55);
        AddColumn(peopleGrid, "Extra", "Fazla", 55);
        AddColumn(peopleGrid, "TimeDifference", "Saat Farkı", 80);
        AddColumn(peopleGrid, "EErrors", "E Hatası", 65);
        AddColumn(peopleGrid, "Review", "İncele", 55);
        if (tnfOnly)
        {
            foreach (var column in peopleGrid.Columns.Cast<DataGridViewColumn>().Where(column => column.DataPropertyName is "DbStatus" or "Status" or "EErrors" or "Review")) column.Visible = false;
            AddColumn(peopleGrid, "Result", "Durum", 155);
            errorsOnly.Checked = false;
            details.Text = "Bu sekme yalnız DB SELECT yapar. Eksikler aynı DUZELTILMIS TNF'ye eklenir; fazla/mükerrer/E silinir; saat DB'ye çekilir. Orijinal TNF korunur.";
        }
        peopleGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        peopleGrid.Font = new Font("Segoe UI", 8);
        peopleGrid.ColumnHeadersHeight = 48;
        foreach (DataGridViewColumn column in peopleGrid.Columns) column.MinimumWidth = 30;
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
        Disposed += (_, _) => { cancellation?.Cancel(); SetSnapshot(null); };
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
        AddColumn(grid, "Date", "Tarih", 80);
        AddColumn(grid, "Side", "Taraf", 60);
        AddColumn(grid, dbSide ? "DbTime" : "TnfTime", "Saat", 50);
        if (dbSide) AddColumn(grid, "Type", "Tür", 50);
        AddColumn(grid, "Status", "Durum", 125);
        grid.CellFormatting += (_, args) =>
        {
            if (args.RowIndex < 0 || grid.Rows[args.RowIndex].DataBoundItem is not PairView pair || args.CellStyle is null) return;
            args.CellStyle.BackColor = pair.Operation switch
            {
                "TNF EKLE" => Color.LemonChiffon,
                "TNF SİL FAZLA" => Color.MistyRose,
                "TNF SİL E" => Color.Thistle,
                "TNF DÜZELT" => Color.PeachPuff,
                "İNCELE" => Color.Gainsboro,
                _ => pair.Status == "E KAYDI" ? Color.Thistle : Color.Honeydew
            };
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
        SetSnapshot(null);
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

    string EnsureTnfSourceForSync()
    {
        var path = TnfPathBox?.Text.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(path))
        {
            var dbBox = main.GetType().GetField("dbPath", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(main) as TextBox;
            var dbSource = dbBox?.Text.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(dbSource)) throw new InvalidOperationException("Önce DB kaynağını seçin.");
            path = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(dbSource))!, $"TR{(int)year.Value}.Tnf");
            if (TnfPathBox is { } tnfBox) tnfBox.Text = path;
        }
        path = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(path)!;
        Directory.CreateDirectory(directory);
        if (!File.Exists(path))
        {
            File.WriteAllBytes(path, []);
            details.Text = $"TNF yoktu; yeni dosya oluşturuldu: {path}";
        }
        return path;
    }

    AuditRequest Request(bool full)
    {
        var path = lastOutputs is not null && RequireTnfPath() == outputSourcePath ? lastOutputs.CorrectedPath : RequireTnfPath();
        var selectedYear = (int)year.Value;
        if (full)
        {
            var match = Regex.Match(Path.GetFileNameWithoutExtension(path), @"(?<!\d)(20\d{2})(?!\d)");
            if (match.Success) selectedYear = int.Parse(match.Value);
        }
        if (!full && month.SelectedIndex == 0) throw new InvalidOperationException("Aylık kontrol için tek bir ay seçin.");
        var start = new DateTime(selectedYear, full || month.SelectedIndex == 0 ? 1 : month.SelectedIndex, 1);
        var end = full || month.SelectedIndex == 0 ? start.AddYears(1) : start.AddMonths(1);
        var settings = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS", "TNF_FORMAT_AYAR.json");
        var format = File.Exists(settings) ? JsonSerializer.Deserialize<TnfFormat>(File.ReadAllText(settings)) ?? new TnfFormat() : new TnfFormat();
        return new(path, start, end, "", new TnfFormat(), true);
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
        foreach (var card in result.People.Keys) if (!groups.ContainsKey(card)) groups[card] = [];
        var persons = new List<PersonView>();
        foreach (var entry in groups)
        {
            token.ThrowIfCancellationRequested();
            var rule = result.People.GetValueOrDefault(entry.Key);
            var errors = entry.Value.Where(pair => pair.Operation != "YOK").ToArray();
            var counts = errors.GroupBy(pair => pair.Status).Select(group => $"{group.Key}: {group.Count()}");
            var detail = string.Join(" | ", counts);
            var dbCount = dbCounts.GetValueOrDefault(entry.Key);
            var tnfCount = entry.Value.Count(pair => pair.Row.Field<int>("TnfIndex") >= 0);
            var operations = errors.GroupBy(pair => pair.Operation).ToDictionary(group => group.Key, group => group.Count());
            persons.Add(new(entry.Key.Length == 0 ? "FORMAT" : entry.Key, rule?.Name ?? "KIMLIK YOK",
                string.IsNullOrWhiteSpace(rule?.RawStatus) ? "(BOŞ / TANIMSIZ)" : rule.RawStatus,
                rule?.EffectiveStatus(result.Request.End.AddDays(-1)) ?? "KIMLIK YOK",
                rule?.Hire?.ToString("dd.MM.yyyy") ?? "-", rule?.Exit?.ToString("dd.MM.yyyy") ?? "-",
                errors.Length == 0 ? "UYUMLU" : string.Join(", ", errors.Select(pair => pair.Status).Distinct()), errors.Length,
                dbCount, tnfCount, operations.GetValueOrDefault("TNF EKLE"), operations.GetValueOrDefault("TNF SİL FAZLA"),
                operations.GetValueOrDefault("TNF DÜZELT"), operations.GetValueOrDefault("TNF SİL E"), operations.GetValueOrDefault("İNCELE"),
                rule?.StatusNote(result.Request.End.AddDays(-1)) ?? "",
                dbCount == 0 && tnfCount > 0 ? "TNF ONLY / FAZLA TNF | " + detail : errors.Length == 0 ? "✓ UYUMLU" : detail));
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
        var filtered = people.Where(person => (search.Text.Trim().Length == 0 || (person.Card + " " + person.Name).Contains(search.Text.Trim(), StringComparison.CurrentCultureIgnoreCase)) && (statusFilter.SelectedIndex == 0 || person.Status.StartsWith(statusFilter.SelectedIndex == 1 ? "AKTİF" : "PASİF", StringComparison.Ordinal)) &&
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
        personnelSummary.Text = $"{person.Card}  {person.Name}\nDB Durumu (DURUM.AD): {person.DbStatus}\nİşe Giriş Tarihi: {person.Hire}     İşten Çıkış Tarihi: {person.Exit}\nEfektif Durum: {person.Status} (dönem sonu)     {person.Note}\nDB Hareket: {person.DbCount}     TNF Hareket: {person.TnfCount}\nSonuç: {person.Result}";
    }

    internal async Task RunAuditAsync(bool full, bool listOnly = false, AuditRequest? scope = null)
    {
        if (IsBusy) return;
        cancellation = new CancellationTokenSource();
        var token = cancellation.Token;
        var total = Stopwatch.StartNew();
        SetBusy(true);
        SetSnapshot(null);
        try
        {
            var database = Database ?? throw new InvalidOperationException("Önce DB'ye bağlanın.");
            var request = scope ?? Request(full);
            var progress = new Progress<string>(text => { if (!IsDisposed && IsBusy) summary.Text = "Kontrol ediliyor... " + text; });
            var prepared = await Task.Run(async () =>
            {
                var result = await SyncEngine.ReadAsync(database, request, token, progress, listOnly);
                var workHours = WorkTimePolicy.Read(database, token);
                return (Result: result, WorkHours: workHours, View: PrepareView(result, token), Summary: Summary(result.Table));
            }, token);
            token.ThrowIfCancellationRequested();
            if (IsDisposed || main.IsDisposed) return;
            if (!ReferenceEquals(database, Database) || !MatchesSource(request.Path)) throw new InvalidOperationException("Kaynak değişti; kontrolü yenileyin.");
            var bind = Stopwatch.StartNew();
            byCard = prepared.View.Groups;
            people = prepared.View.People;
            workTimeInformation.Text = prepared.WorkHours.Information;
            if (main is MainForm application) application.SetWorkHours(prepared.WorkHours);
            SetSnapshot(listOnly ? null : prepared.Result);
            snapshotDatabase = database;
            if (listOnly) errorsOnly.Checked = false;
            FilterPeople();
            LastGridMilliseconds = bind.ElapsedMilliseconds;
            LastTotalMilliseconds = total.ElapsedMilliseconds;
            summary.Text = $"{(full ? "SON TAM KONTROL" : listOnly ? "TNF Listele" : "Kontrol")} {request.Start:dd.MM.yyyy}–{request.End:dd.MM.yyyy} | {prepared.Summary}";
            if (lastOutputs is not null && request.Path == lastOutputs.CorrectedPath && lastOutputs.MissingCount > 0)
                summary.Text += $" | EKSİK TNF HAZIR: {lastOutputs.MissingCount}";
            SyncEngine.Log($"REV25 db_query_ms={prepared.Result.DbMilliseconds} tnf_read_parse_ms={prepared.Result.TnfMilliseconds} compare_ms={prepared.Result.CompareMilliseconds} grid_bind_ms={LastGridMilliseconds} total_ms={LastTotalMilliseconds} db_events={prepared.Result.Db.Count} rows={prepared.Result.Table.Rows.Count}");
        }
        catch (OperationCanceledException) { if (!IsDisposed) summary.Text = "Kontrol iptal edildi; sonuç uygulanamaz."; }
        catch (Exception exception) { if (!IsDisposed) { summary.Text = "Kontrol başarısız; eski sonuç uygulanamaz."; MessageBox.Show(main, exception.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error); } }
        finally { cancellation?.Dispose(); cancellation = null; if (!IsDisposed) SetBusy(false); }
    }

    static string Summary(DataTable table)
    {
        var counts = table.AsEnumerable().GroupBy(row => row.Field<string>("İşlem")!).ToDictionary(group => group.Key, group => group.Count());
        int Count(string operation) => counts.GetValueOrDefault(operation);
        return $"Uyumlu={Count("YOK")}  Eksik={Count("TNF EKLE")}  Fazla={Count("TNF SİL FAZLA")}  Saat Farkı={Count("TNF DÜZELT")}  E Kayıt Hatası={Count("TNF SİL E")}  İncele={Count("İNCELE")}";
    }

    internal static bool IsSafeOperation(DataRow row)
        => row.Field<string>("İşlem") is "TNF EKLE" or "TNF SİL FAZLA" or "TNF SİL E" or "TNF DÜZELT";

    void SetSnapshot(AuditSnapshot? value) => snapshot = value;

    internal DataRow[] PlanVisibleCorrections(bool selectedOnly)
        => visiblePairs.Where(pair => pair.Safe && (!selectedOnly || pair.Selected) && pair.Row.Field<string>("Kart No") == selectedCard).Select(pair => pair.Row).ToArray();

    internal DataRow[] PlanAllCorrections()
        => snapshot?.Table.AsEnumerable().Where(SyncEngine.SafeOperation).ToArray() ?? [];

    internal static string CorrectionSummary(DataRow[] rows, int review = 0, bool entireMonth = false, int personCount = 0)
    {
        var counts = rows.GroupBy(row => row.Field<string>("İşlem")!).ToDictionary(group => group.Key, group => group.Count());
        var scope = entireMonth ? $"İşlenecek Personel: Tüm ay / {personCount} kişi" : $"İşlenecek Personel: {rows.Select(row => row.Field<string>("Kart No")).Distinct().Count()} kişi";
        return $"{scope}\nFazla TNF: {counts.GetValueOrDefault("TNF SİL FAZLA")}\nEksik TNF: {counts.GetValueOrDefault("TNF EKLE")}\nSaat Farkı: {counts.GetValueOrDefault("TNF DÜZELT")}\nE Kaydı: {counts.GetValueOrDefault("TNF SİL E")}\nToplam: {rows.Length}\nİncele: {review} (işlem yapılmayacak)";
    }

    async Task ApplyPersonAsync()
    {
        if (IsBusy || snapshot is null || selectedCard.Length == 0 || !ReferenceEquals(snapshotDatabase, Database) || !MatchesSource(snapshot.Request.Path))
        { MessageBox.Show(main, "Önce kontrol yapın ve soldan personel seçin."); return; }
        dbGrid.EndEdit();
        tnfGrid.EndEdit();
        var rows = PlanVisibleCorrections(false);
        if (rows.Length == 0) { MessageBox.Show(main, "Bu personelin güvenli TNF hatası yok. İNCELE kayıtları otomatik değiştirilmez."); return; }
        await ApplyAsync(rows);
    }

    bool MatchesSource(string path) => RequireTnfPath() == path ||
        lastOutputs is not null && RequireTnfPath() == outputSourcePath && path == lastOutputs.CorrectedPath;

    Task OpenOutputsAsync()
    {
        if (lastOutputs is null) { MessageBox.Show(main, "Henüz çıktı hazırlanmadı."); return Task.CompletedTask; }
        Process.Start(new ProcessStartInfo("explorer.exe", Path.GetDirectoryName(lastOutputs.CorrectedPath)!) { UseShellExecute = true });
        return Task.CompletedTask;
    }

    async Task OneClickExactSyncAsync()
    {
        if (IsBusy) return;
        lastOutputs = null;
        outputSourcePath = "";
        var createdPath = EnsureTnfSourceForSync();
        var fullYear = month.SelectedIndex == 0;
        await RunAuditAsync(fullYear);
        if (snapshot is null || IsDisposed) return;

        var review = snapshot.Table.AsEnumerable().Count(row => row.Field<string>("İşlem") == "İNCELE");
        var rows = PlanAllCorrections();
        if (review > 0)
        {
            MessageBox.Show(main, $"DB ana kaynakta {review} belirsiz/teknik kayıt var. TNF değiştirilmedi.\n\nBunlar yalnız DB tarafı tekil olmadığı veya kayıt teknik olarak aktarılamadığı zaman kalır.", "REV25 — Eşitleme durdu", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        if (rows.Length == 0)
        {
            MessageBox.Show(main, "DB ve TNF zaten bire bir uyumlu. E kayıtları TNF'de yok; eksik/fazla/saat farkı bulunmadı.", "REV25 — Uyumlu", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var counts = rows.GroupBy(row => row.Field<string>("İşlem")!).ToDictionary(group => group.Key, group => group.Count());
        var periodText = fullYear ? $"{year.Value:0} TÜM YIL" : $"{month.Text} {year.Value:0}";
        var message = $"DB ANA KAYNAK kabul edilerek {periodText} TNF ile BİRE BİR eşitlenecek.\n\n" +
            $"Eksik TNF eklenecek: {counts.GetValueOrDefault("TNF EKLE")}\n" +
            $"Fazla/mükerrer TNF silinecek: {counts.GetValueOrDefault("TNF SİL FAZLA")}\n" +
            $"E kayıtlarının TNF karşılığı silinecek: {counts.GetValueOrDefault("TNF SİL E")}\n" +
            $"Saat/format DB'ye çekilecek: {counts.GetValueOrDefault("TNF DÜZELT")}\n" +
            $"Toplam işlem: {rows.Length}\n\n" +
            $"Önce _YEDEK alınır. İşlem sonunda TNF tekrar DB ile bire bir doğrulanır; doğrulama geçmezse eski TNF otomatik geri yüklenir.\n\nDevam?";
        if (MessageBox.Show(main, message, "REV25 — TEK TIK DB → TNF EŞİTLE", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;

        var previous = snapshot;
        var database = snapshotDatabase!;
        SetSnapshot(null);
        cancellation = new CancellationTokenSource();
        var token = cancellation.Token;
        SetBusy(true);
        try
        {
            summary.Text = "Eşitleniyor: DB ana kaynak → eksik ekle → fazla/mükerrer/E sil → saatleri DB'ye çek → son doğrulama...";
            var result = await Task.Run(() => SyncEngine.DirectSyncSourceAsync(database, previous, token), token);
            lastOutputs = null;
            outputSourcePath = "";
            details.Text = $"TAMAMLANDI. TNF artık DB ile bire bir. Yedek: {result.BackupPath}";
            summary.Text = $"DB = TNF BİRE BİR | Eksik +{result.Added} | Fazla/mükerrer -{result.RemovedExtra} | E -{result.RemovedE} | Saat {result.Corrected} | Toplam {result.Total}";
        }
        catch (OperationCanceledException)
        {
            summary.Text = "REV25 eşitleme iptal edildi.";
        }
        catch (Exception exception)
        {
            MessageBox.Show(main, exception.Message, "REV25 — Eşitleme başarısız / TNF geri korundu", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            cancellation?.Dispose();
            cancellation = null;
            if (!IsDisposed) SetBusy(false);
        }
        if (!IsDisposed)
        {
            await RunAuditAsync(fullYear);
            if (snapshot is not null)
            {
                var remaining = snapshot.Table.AsEnumerable().Count(row => row.Field<string>("İşlem") != "YOK");
                if (remaining == 0)
                    summary.Text = $"SON KONTROL: {periodText} • DB = TNF BİRE BİR • E TNF'DE YOK • Eksik/Fazla/Mükerrer/Saat Farkı/İncele = 0";
            }
        }
    }

    async Task ApplyAllSafeAsync()
    {
        if (IsBusy || snapshot is null || !ReferenceEquals(snapshotDatabase, Database) || !MatchesSource(snapshot.Request.Path))
        { MessageBox.Show(main, "Önce KONTROL ET çalıştırın."); return; }
        await RunAuditAsync(false);
        if (snapshot is null || IsDisposed) return;
        // REV25: TNF işlemi yalnız exact DB→TNF planına göre yapılır; ayrı aylık yorum motoru yoktur.
        var rows = PlanAllCorrections();
        if (rows.Length == 0 && !tnfOnly) { MessageBox.Show(main, "Güvenli TNF işlemi yok; İNCELE kayıtları değişmez."); return; }
        await ApplyAsync(rows, true);
    }

    async Task ApplyAsync(DataRow[] rows, bool entireMonth = false)
    {
        if (snapshot is null || !ReferenceEquals(snapshotDatabase, Database)) return;
        var review = snapshot.Table.AsEnumerable().Count(row => row.Field<string>("İşlem") == "İNCELE");
        var personCount = snapshot.Table.AsEnumerable().Select(row => row.Field<string>("Kart No")).Distinct().Count();
        if (tnfOnly && review > 0) { MessageBox.Show(main, "DB tekil/aktarılabilir değil veya TNF formatı bozuk. Önce DB KAYIT / teknik kayıt sorununu düzeltin; çıktı uygulanmadı."); return; }
        var explanation = tnfOnly ? "Eksikler aynı DUZELTILMIS dosyasına eklenir; fazla/mükerrer/E silinir ve saat DB'ye çekilir. Tek dosya sonunda DB ile bire bir doğrulanır." : "Fazla/E silme ve saat düzeltmeleri DUZELTILMIS dosyasına; eksik normal DB kayıtları EKSIK dosyasına yazılır.";
        if (MessageBox.Show(main, $"{CorrectionSummary(rows, review, entireMonth, personCount)}\n\nOrijinal TNF ve DB DEĞİŞMEZ. _YEDEK alınır. {explanation} Devam?",
            "TNF çıktılarını hazırla", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var previous = snapshot;
        var sourcePath = RequireTnfPath();
        SetSnapshot(null);
        cancellation = new CancellationTokenSource();
        SetBusy(true);
        var succeeded = false;
        try
        {
            var outputs = await Task.Run(() => SyncEngine.ApplyAsync(snapshotDatabase!, previous, rows, cancellation.Token));
            lastOutputs = outputs;
            outputSourcePath = sourcePath;
            succeeded = true;
        }
        catch (OperationCanceledException) { summary.Text = "Çıktı hazırlama iptal edildi."; }
        catch (Exception exception) { MessageBox.Show(main, exception.Message, "Çıktı hazırlanamadı", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { cancellation.Dispose(); cancellation = null; if (!IsDisposed) SetBusy(false); }
        var published = lastOutputs;
        if (succeeded && !IsDisposed && published is not null)
        {
            await RunAuditAsync(false);
            if (snapshot is not null)
            {
                details.Text = tnfOnly ? $"Orijinal TNF korundu; DB değişmedi. SON KONTROL düzeltilmiş dosyada yapıldı: {published.CorrectedPath}" : $"Orijinal TNF korundu. SON TAM KONTROL düzeltilmiş dosyada yapıldı. Çıktı: {published.CorrectedPath}";
            }
        }
    }
}
