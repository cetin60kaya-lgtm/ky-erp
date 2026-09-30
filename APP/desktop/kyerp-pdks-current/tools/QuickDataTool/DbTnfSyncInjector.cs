using System.Data;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class DbTnfSyncInjector
{
    static bool injected;

    [ModuleInitializer]
    internal static void Initialize() => Application.Idle += InjectOnce;

    static void InjectOnce(object? sender, EventArgs e)
    {
        if (injected) return;
        var main = Application.OpenForms.Cast<Form>().FirstOrDefault(f => f is MainForm);
        if (main is null) return;
        var tabs = FindControls<TabControl>(main)
            .FirstOrDefault(t => t.TabPages.Cast<TabPage>().Any(p => p.Text == "Personel"));
        if (tabs is null) return;

        injected = true;
        Application.Idle -= InjectOnce;

        foreach (var old in tabs.TabPages.Cast<TabPage>()
                     .Where(p => p.Text.Equals("Data Kontrol", StringComparison.OrdinalIgnoreCase)
                              || p.Text.Equals("DB - TNF Eşitle", StringComparison.OrdinalIgnoreCase))
                     .ToList())
            tabs.TabPages.Remove(old);

        var page = new TabPage("DB - TNF Eşitle")
        {
            Padding = new Padding(8),
            BackColor = Color.White
        };
        page.Controls.Add(new DbTnfSyncControl(main));

        var tnfIndex = tabs.TabPages.Cast<TabPage>().ToList()
            .FindIndex(p => p.Text.Equals("TNF Hazırla", StringComparison.OrdinalIgnoreCase));
        if (tnfIndex >= 0) tabs.TabPages.Insert(tnfIndex, page); else tabs.TabPages.Add(page);
    }

    static IEnumerable<T> FindControls<T>(Control root) where T : Control
    {
        foreach (Control child in root.Controls)
        {
            if (child is T t) yield return t;
            foreach (var nested in FindControls<T>(child)) yield return nested;
        }
    }
}

internal sealed class DbTnfSyncControl : UserControl
{
    sealed class FormatSettings
    {
        public int CardStart { get; set; } = 1; public int CardLen { get; set; } = 5;
        public int YearStart { get; set; } = 17; public int YearLen { get; set; } = 2;
        public int MonthStart { get; set; } = 15; public int MonthLen { get; set; } = 2;
        public int DayStart { get; set; } = 13; public int DayLen { get; set; } = 2;
        public int TypeStart { get; set; } = 20; public int TypeLen { get; set; } = 1;
        public int HourStart { get; set; } = 7; public int HourLen { get; set; } = 2;
        public int MinuteStart { get; set; } = 10; public int MinuteLen { get; set; } = 2;
        public int CodeStart { get; set; } = 22; public int CodeLen { get; set; } = 3;
        public string TypeValue { get; set; } = "1";
        public string CodeValue { get; set; } = "001";
        public string Separators { get; set; } = "6=,;9=:;12=,;19=,;21=,";
    }

    sealed record DbEvent(string Card, string Name, DateTime Date, string Side, string Time, string Tur);
    sealed record TnfEvent(int Index, string Raw, string Card, DateTime Date, string Time);

    readonly Form main;
    readonly NumericUpDown year = new() { Minimum = 2010, Maximum = 2100, Width = 75, Value = DateTime.Today.Year };
    readonly ComboBox month = MonthCombo();
    readonly ComboBox person = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 240 };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(8, 8, 0, 0) };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = true,
        BackgroundColor = Color.White
    };
    readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");

    public DbTnfSyncControl(Form mainForm)
    {
        main = mainForm;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9f);
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Build();
        VisibleChanged += (_, _) => { if (Visible) RefreshPeople(); };
    }

    static ComboBox MonthCombo()
    {
        var c = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 110 };
        c.Items.AddRange(new object[] { "Tümü", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık" });
        c.SelectedIndex = DateTime.Today.Month;
        return c;
    }

    static Button B(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3, 0, 3, 0) };
        b.Click += (_, _) => action();
        return b;
    }

    void Build()
    {
        var root = new Panel { Dock = DockStyle.Fill };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 88, WrapContents = true, Padding = new Padding(2, 4, 2, 2) };
        bar.Controls.Add(new Label { Text = "Yıl", AutoSize = true, Padding = new Padding(0, 8, 3, 0) });
        bar.Controls.Add(year);
        bar.Controls.Add(new Label { Text = "Ay", AutoSize = true, Padding = new Padding(7, 8, 3, 0) });
        bar.Controls.Add(month);
        bar.Controls.Add(new Label { Text = "Personel", AutoSize = true, Padding = new Padding(7, 8, 3, 0) });
        bar.Controls.Add(person);
        bar.Controls.Add(B("Kontrol Et", LoadAudit, 105));
        bar.Controls.Add(B("Seçili Eksikleri Ekle", () => ApplyMissing(true), 155));
        bar.Controls.Add(B("Tüm Eksikleri Ekle", () => ApplyMissing(false), 145));
        bar.Controls.Add(B("Fazla TNF Temizle", CleanExtras, 145));
        bar.Controls.Add(B("Saat Farkını Düzelt", FixTimes, 155));
        bar.Controls.Add(B("TNF Listele", ListTnf, 105));
        bar.Controls.Add(summary);

        var note = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 28,
            Text = "DB sadece kaynak olarak okunur. Düzeltmeler seçili TNF/TXT dosyasına uygulanır; işlem öncesi _YEDEK alınır. Çoklu/belirsiz eşleşmeler otomatik değiştirilmez.",
            ForeColor = Color.DarkGreen,
            TextAlign = ContentAlignment.MiddleLeft
        };

        root.Controls.Add(grid);
        root.Controls.Add(note);
        root.Controls.Add(bar);
        Controls.Add(root);
    }

    FirebirdDatabase? Database
    {
        get
        {
            var f = main.GetType().GetField("db", BindingFlags.Instance | BindingFlags.NonPublic);
            return f?.GetValue(main) as FirebirdDatabase;
        }
    }

    TextBox? TnfPathBox
    {
        get
        {
            var f = main.GetType().GetField("tnfPath", BindingFlags.Instance | BindingFlags.NonPublic);
            return f?.GetValue(main) as TextBox;
        }
    }

    string SelectedCard()
    {
        var s = person.SelectedItem?.ToString() ?? "Tümü";
        return s == "Tümü" || s.Length < 5 ? "" : s[..5];
    }

    void RefreshPeople()
    {
        try
        {
            var db = Database;
            if (db is null) return;
            var old = person.SelectedItem?.ToString();
            var t = db.Query("select PKNO,AD,SOYAD,ICTARIH from KIMLIK order by PKNO");
            person.Items.Clear();
            person.Items.Add("Tümü");
            foreach (DataRow r in t.Rows)
            {
                var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
                if (card.Length == 0 || card == "00001") continue;
                var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
                var suffix = r["ICTARIH"] == DBNull.Value ? "" : $"  [Çıkış {Convert.ToDateTime(r["ICTARIH"]):dd.MM.yyyy}]";
                person.Items.Add($"{card}  {name}{suffix}");
            }
            if (old is not null && person.Items.Contains(old)) person.SelectedItem = old; else person.SelectedIndex = 0;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    (DateTime Start, DateTime End) Period()
    {
        var y = (int)year.Value;
        var m = month.SelectedIndex;
        var a = m == 0 ? new DateTime(y, 1, 1) : new DateTime(y, m, 1);
        var b = m == 0 ? a.AddYears(1) : a.AddMonths(1);
        return (a, b);
    }

    void LoadAudit()
    {
        try
        {
            var db = Database ?? throw new InvalidOperationException("Önce Hedef GDB'ye Bağlan / Yenile ile bağlanın.");
            var src = RequireTnfPath();
            var cfg = LoadSettings();
            var (a, b) = Period();
            var filter = SelectedCard();

            var sql = "select g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO where ((g.GTARIH>=@A and g.GTARIH<@B) or (g.CTARIH>=@A and g.CTARIH<@B))" + (filter.Length == 0 ? "" : " and g.PKNO=@P") + " order by coalesce(g.GTARIH,g.CTARIH),g.PKNO,g.SIRA";
            var rows = filter.Length == 0
                ? db.Query(sql, new FbParameter("@A", a), new FbParameter("@B", b))
                : db.Query(sql, new FbParameter("@A", a), new FbParameter("@B", b), new FbParameter("@P", filter));

            var dbEvents = new List<DbEvent>();
            foreach (DataRow r in rows.Rows)
            {
                var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
                var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
                AddDbEvent(dbEvents, card, name, r["GTARIH"], r["GSAAT"], Convert.ToString(r["GTUR"]) ?? "", "Giriş", a, b);
                AddDbEvent(dbEvents, card, name, r["CTARIH"], r["CSAAT"], Convert.ToString(r["CTUR"]) ?? "", "Çıkış", a, b);
            }

            var rawLines = File.ReadAllLines(src, DetectEncoding(src)).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var parsed = new List<TnfEvent>();
            var bad = new List<(int Index, string Raw)>();
            for (var i = 0; i < rawLines.Count; i++)
            {
                if (TryParseTnf(rawLines[i], i, cfg, out var e))
                {
                    if (e.Date >= a && e.Date < b && (filter.Length == 0 || e.Card == filter)) parsed.Add(e);
                }
                else bad.Add((i, rawLines[i]));
            }

            var table = CreateAuditTable();
            var names = LoadNames(db);
            var keys = dbEvents.Select(x => (x.Card, x.Date.Date)).Union(parsed.Select(x => (x.Card, x.Date.Date))).Distinct().OrderBy(x => x.Date).ThenBy(x => x.Card);
            foreach (var key in keys)
            {
                var dg = dbEvents.Where(x => x.Card == key.Card && x.Date.Date == key.Date).OrderBy(x => ToMinute(x.Time)).ToList();
                var tg = parsed.Where(x => x.Card == key.Card && x.Date.Date == key.Date).OrderBy(x => ToMinute(x.Time)).ThenBy(x => x.Index).ToList();
                CompareGroup(table, dg, tg, names.TryGetValue(key.Card, out var n) ? n : "");
            }

            foreach (var x in bad)
                table.Rows.Add("", "", "", "", "", "", "", x.Raw, "BOZUK TNF / İNCELE", "İNCELE");

            grid.DataSource = table;
            ColorRows();
            UpdateSummary(table);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    static void AddDbEvent(List<DbEvent> list, string card, string name, object dateObj, object timeObj, string tur, string side, DateTime a, DateTime b)
    {
        if (dateObj is null || dateObj == DBNull.Value) return;
        var date = Convert.ToDateTime(dateObj).Date;
        if (date < a || date >= b) return;
        var time = NormalizeTime(timeObj);
        if (time.Length == 0) return;
        list.Add(new DbEvent(card, name, date, side, time, tur.Trim()));
    }

    static string NormalizeTime(object value)
    {
        if (value is null || value == DBNull.Value) return "";
        var s = Convert.ToString(value)?.Trim() ?? "";
        if (TimeSpan.TryParse(s, out var ts)) return $"{(int)ts.TotalHours:00}:{ts.Minutes:00}";
        if (DateTime.TryParse(s, out var dt)) return dt.ToString("HH:mm");
        return s.Length >= 5 ? s[..5] : s;
    }

    static DataTable CreateAuditTable()
    {
        var t = new DataTable();
        foreach (var c in new[] { "Kart No", "Ad Soyad", "Tarih", "Taraf", "DB Saat", "Tür", "TNF Saat", "TNF Karşılığı", "Durum", "İşlem" }) t.Columns.Add(c);
        return t;
    }

    static void CompareGroup(DataTable t, List<DbEvent> dbEvents, List<TnfEvent> tnfEvents, string fallbackName)
    {
        var used = new HashSet<int>();
        var unmatchedNormal = new List<DbEvent>();
        var unmatchedE = new List<DbEvent>();

        foreach (var d in dbEvents.Where(x => !x.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)))
        {
            var match = tnfEvents.FirstOrDefault(x => !used.Contains(x.Index) && x.Time == d.Time);
            if (match is not null)
            {
                used.Add(match.Index);
                AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "Normal", match.Time, match.Raw, "UYUMLU", "YOK");
            }
            else unmatchedNormal.Add(d);
        }

        foreach (var d in dbEvents.Where(x => x.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)))
        {
            var match = tnfEvents.FirstOrDefault(x => !used.Contains(x.Index) && x.Time == d.Time);
            if (match is not null)
            {
                used.Add(match.Index);
                AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "E", match.Time, match.Raw, "UYUMSUZ - E AMA TNF VAR", "TNF SİL E");
            }
            else unmatchedE.Add(d);
        }

        var remainingTnf = tnfEvents.Where(x => !used.Contains(x.Index)).ToList();

        if (unmatchedNormal.Count == 1 && remainingTnf.Count == 1 && unmatchedE.Count == 0)
        {
            var d = unmatchedNormal[0]; var x = remainingTnf[0];
            AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "Normal", x.Time, x.Raw, "UYUMSUZ - SAAT FARKLI", "TNF DÜZELT");
            return;
        }

        if (remainingTnf.Count == 0)
        {
            foreach (var d in unmatchedNormal)
                AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "Normal", "", "", "UYUMSUZ - TNF EKSİK", "TNF EKLE");
            foreach (var d in unmatchedE)
                AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "E", "", "", "UYUMLU - E / TNF YOK", "YOK");
            return;
        }

        if (unmatchedNormal.Count == 0 && unmatchedE.Count == 0)
        {
            var card = tnfEvents.FirstOrDefault()?.Card ?? "";
            var date = tnfEvents.FirstOrDefault()?.Date ?? DateTime.MinValue;
            foreach (var x in remainingTnf)
                AddRow(t, x.Card, fallbackName, x.Date, "TNF", "", "TNF", x.Time, x.Raw, "UYUMSUZ - FAZLA TNF", "TNF SİL FAZLA");
            return;
        }

        foreach (var d in unmatchedNormal)
            AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "Normal", "", "", "UYUMSUZ - ÇOKLU / İNCELE", "İNCELE");
        foreach (var d in unmatchedE)
            AddRow(t, d.Card, d.Name, d.Date, d.Side, d.Time, "E", "", "", "E / ÇOKLU TNF - İNCELE", "İNCELE");
        foreach (var x in remainingTnf)
            AddRow(t, x.Card, fallbackName, x.Date, "TNF", "", "TNF", x.Time, x.Raw, "UYUMSUZ - ÇOKLU / İNCELE", "İNCELE");
    }

    static void AddRow(DataTable t, string card, string name, DateTime date, string side, string dbTime, string tur, string tnfTime, string raw, string status, string op)
        => t.Rows.Add(card, name, date == DateTime.MinValue ? "" : date.ToString("dd.MM.yyyy"), side, dbTime, tur, tnfTime, raw, status, op);

    void ColorRows()
    {
        foreach (DataGridViewRow r in grid.Rows)
        {
            if (r.IsNewRow) continue;
            var s = Convert.ToString(r.Cells["Durum"].Value) ?? "";
            r.DefaultCellStyle.BackColor = s.StartsWith("UYUMLU") ? Color.Honeydew : s.Contains("EKSİK") ? Color.LemonChiffon : s.Contains("İNCELE") ? Color.LightGray : Color.MistyRose;
            r.DefaultCellStyle.SelectionBackColor = s.StartsWith("UYUMLU") ? Color.PaleGreen : s.Contains("EKSİK") ? Color.Khaki : s.Contains("İNCELE") ? Color.Silver : Color.LightSalmon;
        }
    }

    void UpdateSummary(DataTable t)
    {
        int Count(string op) => t.AsEnumerable().Count(r => string.Equals(Convert.ToString(r["İşlem"]), op, StringComparison.OrdinalIgnoreCase));
        var ok = t.AsEnumerable().Count(r => (Convert.ToString(r["Durum"]) ?? "").StartsWith("UYUMLU"));
        summary.Text = $"Uyumlu {ok} | Eksik {Count("TNF EKLE")} | Fazla/E {Count("TNF SİL FAZLA") + Count("TNF SİL E")} | Saat {Count("TNF DÜZELT")} | İncele {Count("İNCELE")}";
    }

    void ApplyMissing(bool selectedOnly)
    {
        var rows = CurrentRows(selectedOnly).Where(r => Cell(r, "İşlem") == "TNF EKLE").ToList();
        if (rows.Count == 0) { MessageBox.Show("Eklenecek eksik TNF kaydı yok."); return; }
        ApplyRows(rows, $"{rows.Count} eksik kayıt TNF'ye eklenecek.");
    }

    void CleanExtras()
    {
        var rows = CurrentRows(false).Where(r => Cell(r, "İşlem") is "TNF SİL FAZLA" or "TNF SİL E").ToList();
        if (rows.Count == 0) { MessageBox.Show("Temizlenecek fazla/E TNF kaydı yok."); return; }
        ApplyRows(rows, $"{rows.Count} fazla/E TNF kaydı temizlenecek.");
    }

    void FixTimes()
    {
        var rows = CurrentRows(false).Where(r => Cell(r, "İşlem") == "TNF DÜZELT").ToList();
        if (rows.Count == 0) { MessageBox.Show("Güvenli tekil saat farkı yok."); return; }
        ApplyRows(rows, $"{rows.Count} tekil saat farkı DB saatine göre düzeltilecek.");
    }

    IEnumerable<DataGridViewRow> CurrentRows(bool selectedOnly)
        => selectedOnly ? grid.SelectedRows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow) : grid.Rows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow);

    static string Cell(DataGridViewRow r, string name) => Convert.ToString(r.Cells[name].Value)?.Trim() ?? "";

    void ApplyRows(List<DataGridViewRow> rows, string message)
    {
        var src = RequireTnfPath();
        var cfg = LoadSettings();
        if (MessageBox.Show(message + "\n\nDB değişmeyecek. TNF yedeği alınacak. Devam?", "DB - TNF Eşitle", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        var dir = Path.GetDirectoryName(src) ?? AppContext.BaseDirectory;
        var backupDir = Path.Combine(dir, "_YEDEK");
        Directory.CreateDirectory(backupDir);
        var backup = Path.Combine(backupDir, Path.GetFileName(src) + ".bak_" + DateTime.Now.ToString("yyyyMMdd_HHmmss"));
        File.Copy(src, backup, true);

        var encoding = DetectEncoding(src);
        var lines = File.ReadAllLines(src, encoding).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var temp = src + ".tmp_REV7";
        try
        {
            foreach (var r in rows)
            {
                var op = Cell(r, "İşlem");
                var card = Cell(r, "Kart No");
                var date = DateTime.ParseExact(Cell(r, "Tarih"), "dd.MM.yyyy", CultureInfo.InvariantCulture);
                var dbTime = Cell(r, "DB Saat");
                var raw = Cell(r, "TNF Karşılığı");

                if (op == "TNF EKLE")
                {
                    var line = BuildLine(card, date, dbTime, cfg);
                    if (!lines.Contains(line, StringComparer.OrdinalIgnoreCase)) lines.Add(line);
                }
                else if (op is "TNF SİL FAZLA" or "TNF SİL E")
                {
                    var ix = lines.FindIndex(x => string.Equals(x, raw, StringComparison.Ordinal));
                    if (ix < 0) throw new InvalidOperationException("TNF değişmiş; silinecek satır artık bulunamadı. Önce tekrar Kontrol Et.");
                    lines.RemoveAt(ix);
                }
                else if (op == "TNF DÜZELT")
                {
                    var ix = lines.FindIndex(x => string.Equals(x, raw, StringComparison.Ordinal));
                    if (ix < 0) throw new InvalidOperationException("TNF değişmiş; düzeltilecek satır artık bulunamadı. Önce tekrar Kontrol Et.");
                    lines[ix] = BuildLine(card, date, dbTime, cfg);
                }
            }

            File.WriteAllLines(temp, SortLines(lines, cfg), Encoding.GetEncoding(1254));
            File.Move(temp, src, true);
            LoadAudit();
            MessageBox.Show($"İşlem tamamlandı.\n\nTNF: {src}\nYedek: {backup}", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            try { if (File.Exists(temp)) File.Delete(temp); } catch { }
            try { File.Copy(backup, src, true); } catch { }
            MessageBox.Show("İşlem geri alındı.\n\n" + ex.Message, "DB - TNF Eşitle", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void ListTnf()
    {
        try
        {
            var db = Database;
            var src = RequireTnfPath();
            var cfg = LoadSettings();
            var (a, b) = Period();
            var filter = SelectedCard();
            var names = db is null ? new Dictionary<string, string>() : LoadNames(db);
            var t = new DataTable();
            foreach (var c in new[] { "Kart No", "Ad Soyad", "Tarih", "Saat", "Ham TNF", "Durum" }) t.Columns.Add(c);
            var lines = File.ReadAllLines(src, DetectEncoding(src));
            for (var i = 0; i < lines.Length; i++)
            {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;
                if (!TryParseTnf(lines[i], i, cfg, out var x)) { t.Rows.Add("", "", "", "", lines[i], "BOZUK"); continue; }
                if (x.Date < a || x.Date >= b || (filter.Length > 0 && x.Card != filter)) continue;
                t.Rows.Add(x.Card, names.TryGetValue(x.Card, out var n) ? n : "", x.Date.ToString("dd.MM.yyyy"), x.Time, x.Raw, "OK");
            }
            grid.DataSource = t;
            summary.Text = $"TNF satırı: {t.Rows.Count}";
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "TNF Listele", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    string RequireTnfPath()
    {
        var path = TnfPathBox?.Text.Trim() ?? "";
        if (path.Length == 0 || !File.Exists(path)) throw new FileNotFoundException("Üstteki Terminal TNF alanından düzenlenecek TNF/TXT dosyasını seçin.", path);
        return path;
    }

    static Dictionary<string, string> LoadNames(FirebirdDatabase db)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var t = db.Query("select PKNO,AD,SOYAD from KIMLIK");
        foreach (DataRow r in t.Rows)
        {
            var card = Convert.ToString(r["PKNO"])?.Trim() ?? "";
            if (card.Length > 0) d[card] = $"{r["AD"]} {r["SOYAD"]}".Trim();
        }
        return d;
    }

    FormatSettings LoadSettings()
    {
        try
        {
            if (File.Exists(settingsPath)) return JsonSerializer.Deserialize<FormatSettings>(File.ReadAllText(settingsPath)) ?? new FormatSettings();
        }
        catch { }
        return new FormatSettings();
    }

    static bool TryParseTnf(string line, int index, FormatSettings cfg, out TnfEvent e)
    {
        e = null!;
        try
        {
            var card = Slice(line.TrimStart('\uFEFF'), cfg.CardStart, cfg.CardLen).Trim();
            var hh = Slice(line, cfg.HourStart, cfg.HourLen).Trim();
            var mm = Slice(line, cfg.MinuteStart, cfg.MinuteLen).Trim();
            var dd = Slice(line, cfg.DayStart, cfg.DayLen).Trim();
            var mo = Slice(line, cfg.MonthStart, cfg.MonthLen).Trim();
            var yy = Slice(line, cfg.YearStart, cfg.YearLen).Trim();
            var date = DateTime.ParseExact(dd + mo + yy, "ddMMyy", CultureInfo.InvariantCulture);
            if (!int.TryParse(hh, out var h) || !int.TryParse(mm, out var m) || h is < 0 or > 23 || m is < 0 or > 59) return false;
            e = new TnfEvent(index, line, card, date.Date, $"{h:00}:{m:00}");
            return card.Length > 0;
        }
        catch { return false; }
    }

    static string Slice(string s, int start, int count)
    {
        var i = start - 1;
        if (i < 0 || count < 1 || i + count > s.Length) throw new FormatException();
        return s.Substring(i, count);
    }

    static int ToMinute(string time)
    {
        if (!TimeSpan.TryParse(time, out var t)) return int.MaxValue;
        return (int)t.TotalMinutes;
    }

    static string BuildLine(string card, DateTime date, string time, FormatSettings cfg)
    {
        if (!TimeSpan.TryParse(time, out var ts)) throw new FormatException("DB saati HH:mm biçiminde değil: " + time);
        var fields = new (int Start, int Count, string Value)[]
        {
            (cfg.CardStart,cfg.CardLen,card), (cfg.YearStart,cfg.YearLen,date.ToString("yy")),
            (cfg.MonthStart,cfg.MonthLen,date.ToString("MM")), (cfg.DayStart,cfg.DayLen,date.ToString("dd")),
            (cfg.TypeStart,cfg.TypeLen,cfg.TypeValue), (cfg.HourStart,cfg.HourLen,((int)ts.TotalHours).ToString("00")),
            (cfg.MinuteStart,cfg.MinuteLen,ts.Minutes.ToString("00")), (cfg.CodeStart,cfg.CodeLen,cfg.CodeValue)
        };
        var seps = ParseSeparators(cfg.Separators);
        var max = Math.Max(fields.Max(x => x.Start + x.Count - 1), seps.Keys.DefaultIfEmpty(1).Max());
        var chars = Enumerable.Repeat(' ', max).ToArray();
        foreach (var f in fields) Put(chars, f.Start, f.Count, f.Value);
        foreach (var kv in seps) if (kv.Key >= 1 && kv.Key <= chars.Length) chars[kv.Key - 1] = kv.Value;
        return new string(chars).TrimEnd();
    }

    static void Put(char[] chars, int start, int count, string value)
    {
        var s = value ?? "";
        if (s.Length > count) s = s[..count];
        if (s.Length < count) s = s.PadLeft(count, '0');
        for (var i = 0; i < count && start - 1 + i < chars.Length; i++) chars[start - 1 + i] = s[i];
    }

    static Dictionary<int, char> ParseSeparators(string text)
    {
        var d = new Dictionary<int, char>();
        foreach (var part in (text ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0 || eq == part.Length - 1) continue;
            if (int.TryParse(part[..eq], out var p)) d[p] = part[(eq + 1)..][0];
        }
        return d;
    }

    static IEnumerable<string> SortLines(IEnumerable<string> lines, FormatSettings cfg)
    {
        return lines.Select((raw, i) => TryParseTnf(raw, i, cfg, out var e)
                ? new { Raw = raw, Good = true, Date = e.Date, Time = ToMinute(e.Time), Card = e.Card, Index = i }
                : new { Raw = raw, Good = false, Date = DateTime.MaxValue, Time = int.MaxValue, Card = "", Index = i })
            .OrderBy(x => x.Good ? 0 : 1)
            .ThenBy(x => x.Date)
            .ThenBy(x => x.Time)
            .ThenBy(x => x.Card)
            .ThenBy(x => x.Index)
            .Select(x => x.Raw);
    }

    static Encoding DetectEncoding(string path)
    {
        using var fs = File.OpenRead(path);
        if (fs.Length >= 3)
        {
            var b = new byte[3]; fs.ReadExactly(b);
            if (b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF) return new UTF8Encoding(true);
        }
        return Encoding.GetEncoding(1254);
    }
}
