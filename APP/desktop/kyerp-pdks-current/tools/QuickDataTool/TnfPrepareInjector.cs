using System.Data;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace QuickDataTool;

internal static class TnfPrepareInjector
{
    static bool injected;

    [ModuleInitializer]
    internal static void Initialize()
    {
        Application.Idle += InjectOnce;
    }

    static void InjectOnce(object? sender, EventArgs e)
    {
        if (injected) return;
        var main = Application.OpenForms.Cast<Form>().FirstOrDefault(f => f is MainForm);
        if (main is null) return;
        var tabs = FindControls<TabControl>(main).FirstOrDefault();
        if (tabs is null) return;

        injected = true;
        Application.Idle -= InjectOnce;

        if (!tabs.TabPages.Cast<TabPage>().Any(p => p.Text == "TNF Hazırla"))
            tabs.TabPages.Add(new TabPage("TNF Hazırla") { Padding = new Padding(8), BackColor = Color.White, Controls = { new TnfPrepareControl(main) } });

        var bulkPage = tabs.TabPages.Cast<TabPage>().FirstOrDefault(p => p.Text.Contains("Toplu", StringComparison.OrdinalIgnoreCase));
        if (bulkPage is not null)
        {
            foreach (var button in FindControls<Button>(bulkPage).Where(b => string.Equals(b.Text, "Uygula", StringComparison.OrdinalIgnoreCase)))
            {
                button.Text = "DB + TNF UYGULA";
                button.Width = Math.Max(button.Width, 145);
                button.BackColor = Color.MistyRose;
            }
        }
    }

    internal static IEnumerable<T> FindControls<T>(Control root) where T : Control
    {
        foreach (Control child in root.Controls)
        {
            if (child is T t) yield return t;
            foreach (var nested in FindControls<T>(child)) yield return nested;
        }
    }
}

internal sealed class TnfPrepareControl : UserControl
{
    sealed class DayChoice
    {
        public DateTime Date { get; }
        public DayChoice(DateTime date) => Date = date.Date;
        public override string ToString() => Date.ToString("dd.MM.yyyy dddd", new System.Globalization.CultureInfo("tr-TR"));
    }

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

    readonly Form main;
    readonly CheckedListBox people = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox days = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DataGridView preview = new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        BackgroundColor = Color.White
    };
    readonly DateTimePicker start = new() { Format = DateTimePickerFormat.Short, Width = 115 };
    readonly DateTimePicker end = new() { Format = DateTimePickerFormat.Short, Width = 115 };
    readonly MaskedTextBox inMin = TimeBox("08:20"), inMax = TimeBox("08:35"), outMin = TimeBox("18:55"), outMax = TimeBox("19:05");
    readonly CheckBox weekends = new() { Text = "Cumartesi / Pazar hariç", Checked = true, AutoSize = true, Padding = new Padding(6, 7, 0, 0) };
    readonly Label status = new() { AutoSize = true, ForeColor = Color.DarkGreen, Padding = new Padding(8, 8, 0, 0) };
    readonly Dictionary<string, NumericUpDown> pos = new();
    readonly Dictionary<string, NumericUpDown> len = new();
    readonly TextBox typeValue = new() { Width = 70 };
    readonly TextBox codeValue = new() { Width = 70 };
    readonly TextBox separators = new() { Width = 240 };
    readonly TextBox formatPreview = new() { ReadOnly = true, Width = 380, Font = new Font("Consolas", 10f) };
    readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");
    FormatSettings settings = new();

    public TnfPrepareControl(Form mainForm)
    {
        main = mainForm;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9f);
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        settings = LoadSettings();
        Build();
        start.ValueChanged += (_, _) => RebuildDays();
        end.ValueChanged += (_, _) => RebuildDays();
        weekends.CheckedChanged += (_, _) => RebuildDays();
        VisibleChanged += (_, _) => { if (Visible) RefreshPeople(); };
        RebuildDays();
        BeginInvoke(new Action(RefreshPeople));
    }

    static MaskedTextBox TimeBox(string value) => new("00:00") { Text = value, Width = 62 };

    void Build()
    {
        var inner = new TabControl { Dock = DockStyle.Fill };
        inner.TabPages.Add(BuildGeneratePage());
        inner.TabPages.Add(BuildFormatPage());
        Controls.Add(inner);
    }

    TabPage BuildGeneratePage()
    {
        var page = new TabPage("TXT Oluştur") { Padding = new Padding(8), BackColor = Color.White };
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 4, Padding = new Padding(4) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 310));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 270));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true };
        top.Controls.Add(L("Başlangıç")); top.Controls.Add(start);
        top.Controls.Add(L("Bitiş")); top.Controls.Add(end);
        top.Controls.Add(L("Giriş")); top.Controls.Add(inMin); top.Controls.Add(inMax);
        top.Controls.Add(L("Çıkış")); top.Controls.Add(outMin); top.Controls.Add(outMax);
        top.Controls.Add(weekends);
        root.Controls.Add(top, 0, 0); root.SetColumnSpan(top, 3);

        root.Controls.Add(people, 0, 1); root.Controls.Add(days, 1, 1); root.Controls.Add(preview, 2, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(2, 6, 2, 2) };
        actions.Controls.Add(Wide("Personeli Yenile", RefreshPeople, 125));
        actions.Controls.Add(Wide("Tüm Personeli Seç", CheckAllPeople, 135));
        actions.Controls.Add(Wide("Tüm Günleri Seç", CheckAllDays, 125));
        actions.Controls.Add(Wide("Önizleme", PreviewRows, 110));
        var create = Wide("YENİ TXT OLUŞTUR", CreateTxt, 170); create.BackColor = Color.LightGreen; actions.Controls.Add(create);
        root.Controls.Add(actions, 0, 2); root.SetColumnSpan(actions, 3);

        var note = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        note.Controls.Add(new Label { Text = "DATABASE.GDB'ye YAZMAZ. Dosya Masaüstüne tarih adıyla oluşturulur: 29&9&2026.txt", AutoSize = true, ForeColor = Color.DarkGreen, Font = new Font("Segoe UI", 9f, FontStyle.Bold), Padding = new Padding(0,8,0,0) });
        note.Controls.Add(status);
        root.Controls.Add(note, 0, 3); root.SetColumnSpan(note, 3);

        page.Controls.Add(root); return page;
    }

    TabPage BuildFormatPage()
    {
        var page = new TabPage("Terminal Format Ayarı") { Padding = new Padding(10), BackColor = Color.White };
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1 };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 470));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var grid = new TableLayoutPanel { Dock = DockStyle.Top, ColumnCount = 3, AutoSize = true, Padding = new Padding(5) };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95));
        grid.Controls.Add(new Label { Text = "Alan", Font = new Font("Segoe UI", 9f, FontStyle.Bold), AutoSize = true }, 0, 0);
        grid.Controls.Add(new Label { Text = "Başlangıç", Font = new Font("Segoe UI", 9f, FontStyle.Bold), AutoSize = true }, 1, 0);
        grid.Controls.Add(new Label { Text = "Kaç Tane", Font = new Font("Segoe UI", 9f, FontStyle.Bold), AutoSize = true }, 2, 0);

        var defs = new (string Label, string Key, int Start, int Count)[]
        {
            ("Personel Kart Numarası","Card",settings.CardStart,settings.CardLen),
            ("Yıl","Year",settings.YearStart,settings.YearLen),
            ("Ay","Month",settings.MonthStart,settings.MonthLen),
            ("Gün","Day",settings.DayStart,settings.DayLen),
            ("Başlam Tür (Giriş/Çıkış)","Type",settings.TypeStart,settings.TypeLen),
            ("Saat","Hour",settings.HourStart,settings.HourLen),
            ("Dakika","Minute",settings.MinuteStart,settings.MinuteLen),
            ("Saat Kodu","Code",settings.CodeStart,settings.CodeLen)
        };
        var row = 1;
        foreach (var d in defs)
        {
            grid.Controls.Add(new Label { Text = d.Label, AutoSize = true, Padding = new Padding(0,6,0,0) }, 0, row);
            var p = Num(d.Start, 1, 99); var c = Num(d.Count, 1, 20);
            pos[d.Key] = p; len[d.Key] = c;
            p.ValueChanged += (_, _) => RefreshFormatPreview(); c.ValueChanged += (_, _) => RefreshFormatPreview();
            grid.Controls.Add(p, 1, row); grid.Controls.Add(c, 2, row); row++;
        }
        root.Controls.Add(grid, 0, 0);

        var right = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(12) };
        typeValue.Text = settings.TypeValue; codeValue.Text = settings.CodeValue; separators.Text = settings.Separators;
        typeValue.TextChanged += (_, _) => RefreshFormatPreview(); codeValue.TextChanged += (_, _) => RefreshFormatPreview(); separators.TextChanged += (_, _) => RefreshFormatPreview();
        right.Controls.Add(new Label { Text = "Tür değeri", AutoSize = true }); right.Controls.Add(typeValue);
        right.Controls.Add(new Label { Text = "Saat Kodu", AutoSize = true, Padding = new Padding(0,8,0,0) }); right.Controls.Add(codeValue);
        right.Controls.Add(new Label { Text = "Ayraç pozisyonları", AutoSize = true, Padding = new Padding(0,8,0,0) }); right.Controls.Add(separators);
        right.Controls.Add(new Label { Text = "Örnek: 6=,;9=:;12=,;19=,;21=,", AutoSize = true, ForeColor = Color.DimGray });
        right.Controls.Add(new Label { Text = "Canlı format önizleme", AutoSize = true, Padding = new Padding(0,12,0,0) }); right.Controls.Add(formatPreview);
        right.Controls.Add(Wide("FORMATI KAYDET", SaveFormat, 160));
        right.Controls.Add(new Label { Text = "Hedef 5.0.29 varsayılanı:\nKart 01/05 | Saat 07/02 | Dakika 10/02 | Gün 13/02\nAy 15/02 | Yıl 17/02 | Tür 20/01 | Kod 22/03", AutoSize = true, Padding = new Padding(0,14,0,0) });
        root.Controls.Add(right, 1, 0);
        page.Controls.Add(root);
        RefreshFormatPreview();
        return page;
    }

    static Label L(string text) => new() { Text = text, AutoSize = true, Padding = new Padding(7, 8, 2, 0) };
    static NumericUpDown Num(int value, int min, int max) => new() { Minimum = min, Maximum = max, Value = Math.Clamp(value, min, max), Width = 70 };
    static Button Wide(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => action(); return b;
    }

    void RefreshPeople()
    {
        try
        {
            var load = main.GetType().GetMethod("LoadPeople", BindingFlags.Instance | BindingFlags.NonPublic);
            load?.Invoke(main, null);
            var field = main.GetType().GetField("peopleList", BindingFlags.Instance | BindingFlags.NonPublic);
            if (field?.GetValue(main) is not CheckedListBox source) return;
            var existing = people.CheckedItems.Cast<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
            people.Items.Clear();
            foreach (var item in source.Items.Cast<object>().Select(x => Convert.ToString(x) ?? "").Where(x => x.Length >= 5))
                people.Items.Add(item, existing.Count == 0 || existing.Contains(item));
            status.Text = $"{people.Items.Count} aktif personel";
        }
        catch (Exception ex) { MessageBox.Show(ex.InnerException?.Message ?? ex.Message, "TNF Hazırla"); }
    }

    void RebuildDays()
    {
        var selected = days.CheckedItems.Cast<DayChoice>().Select(x => x.Date).ToHashSet();
        days.Items.Clear();
        if (end.Value.Date < start.Value.Date) return;
        for (var d = start.Value.Date; d <= end.Value.Date; d = d.AddDays(1))
        {
            if (weekends.Checked && (d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday)) continue;
            days.Items.Add(new DayChoice(d), selected.Count == 0 || selected.Contains(d));
        }
    }

    void CheckAllPeople() { for (var i = 0; i < people.Items.Count; i++) people.SetItemChecked(i, true); }
    void CheckAllDays() { for (var i = 0; i < days.Items.Count; i++) days.SetItemChecked(i, true); }

    void PreviewRows()
    {
        try { preview.DataSource = BuildPreview(); status.Text = $"Önizleme: {preview.Rows.Count} kişi/gün"; }
        catch (Exception ex) { MessageBox.Show(ex.Message, "TNF Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable BuildPreview()
    {
        var cards = people.CheckedItems.Cast<string>().Select(x => x[..5]).OrderBy(x => x).ToList();
        var selectedDays = days.CheckedItems.Cast<DayChoice>().Select(x => x.Date).OrderBy(x => x).ToList();
        if (cards.Count == 0 || selectedDays.Count == 0) throw new InvalidOperationException("Personel ve gün seçin.");
        var ia = ToMinute(inMin.Text); var ib = ToMinute(inMax.Text); var oa = ToMinute(outMin.Text); var ob = ToMinute(outMax.Text);
        if (ib < ia || ob < oa) throw new InvalidOperationException("Saat aralığı hatalı.");
        if (ib - ia + 1 < cards.Count || ob - oa + 1 < cards.Count)
            throw new InvalidOperationException($"Saat aralığı dar. Personel: {cards.Count}, giriş slotu: {ib-ia+1}, çıkış slotu: {ob-oa+1}.");

        var t = new DataTable(); t.Columns.Add("Kart No"); t.Columns.Add("Tarih", typeof(DateTime)); t.Columns.Add("Giriş"); t.Columns.Add("Çıkış");
        foreach (var day in selectedDays)
        {
            var ins = ShuffledMinutes(ia, ib, day, 17); var outs = ShuffledMinutes(oa, ob, day, 71);
            for (var i = 0; i < cards.Count; i++) t.Rows.Add(cards[i], day, FromMinute(ins[i]), FromMinute(outs[i]));
        }
        return t;
    }

    List<string> BuildTxtLines()
    {
        var t = BuildPreview();
        var result = new List<string>();
        foreach (var group in t.AsEnumerable().GroupBy(r => r.Field<DateTime>("Tarih").Date).OrderBy(g => g.Key))
        {
            var entries = group.Select(r => new { Card = r.Field<string>("Kart No")!, Time = r.Field<string>("Giriş")! }).OrderBy(x => ToMinute(x.Time)).ThenBy(x => x.Card);
            var exits = group.Select(r => new { Card = r.Field<string>("Kart No")!, Time = r.Field<string>("Çıkış")! }).OrderBy(x => ToMinute(x.Time)).ThenBy(x => x.Card);
            foreach (var x in entries) result.Add(BuildLine(x.Card, group.Key, x.Time));
            foreach (var x in exits) result.Add(BuildLine(x.Card, group.Key, x.Time));
        }
        return result;
    }

    void CreateTxt()
    {
        try
        {
            var lines = BuildTxtLines();
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            var now = DateTime.Now;
            var stem = $"{now.Day}&{now.Month}&{now.Year}";
            var path = Path.Combine(desktop, stem + ".txt");
            var n = 1;
            while (File.Exists(path)) path = Path.Combine(desktop, $"{stem}({n++}).txt");
            File.WriteAllLines(path, lines, Encoding.GetEncoding(1254));
            status.Text = $"Hazır: {Path.GetFileName(path)} / {lines.Count} satır";
            MessageBox.Show($"TXT hazır.\n\n{path}\n\n{lines.Count} satır.\nDATABASE.GDB'ye hiçbir kayıt yazılmadı.", "HKN PDKS", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "TXT Oluştur", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    string BuildLine(string card, DateTime day, string time)
    {
        var cfg = CurrentSettings();
        var hhmm = TimeSpan.Parse(time);
        var fields = new (int Start, int Count, string Value)[]
        {
            (cfg.CardStart,cfg.CardLen,card), (cfg.YearStart,cfg.YearLen,day.ToString("yy")),
            (cfg.MonthStart,cfg.MonthLen,day.ToString("MM")), (cfg.DayStart,cfg.DayLen,day.ToString("dd")),
            (cfg.TypeStart,cfg.TypeLen,cfg.TypeValue), (cfg.HourStart,cfg.HourLen,hhmm.Hours.ToString("00")),
            (cfg.MinuteStart,cfg.MinuteLen,hhmm.Minutes.ToString("00")), (cfg.CodeStart,cfg.CodeLen,cfg.CodeValue)
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

    static Dictionary<int,char> ParseSeparators(string text)
    {
        var d = new Dictionary<int,char>();
        foreach (var part in (text ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var eq = part.IndexOf('='); if (eq <= 0 || eq == part.Length - 1) continue;
            if (int.TryParse(part[..eq], out var p)) d[p] = part[(eq + 1)..][0];
        }
        return d;
    }

    static int ToMinute(string text)
    {
        if (!TimeSpan.TryParse(text, out var t)) throw new InvalidOperationException("Saat biçimi HH:mm olmalı.");
        return (int)t.TotalMinutes;
    }
    static string FromMinute(int minute) => $"{minute / 60:00}:{minute % 60:00}";
    static List<int> ShuffledMinutes(int min, int max, DateTime day, int salt)
    {
        var list = Enumerable.Range(min, max - min + 1).ToList();
        var rng = new Random(HashCode.Combine(day.Year, day.DayOfYear, salt));
        for (var i = list.Count - 1; i > 0; i--) { var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]); }
        return list;
    }

    FormatSettings CurrentSettings() => new()
    {
        CardStart=(int)pos["Card"].Value,CardLen=(int)len["Card"].Value,
        YearStart=(int)pos["Year"].Value,YearLen=(int)len["Year"].Value,
        MonthStart=(int)pos["Month"].Value,MonthLen=(int)len["Month"].Value,
        DayStart=(int)pos["Day"].Value,DayLen=(int)len["Day"].Value,
        TypeStart=(int)pos["Type"].Value,TypeLen=(int)len["Type"].Value,
        HourStart=(int)pos["Hour"].Value,HourLen=(int)len["Hour"].Value,
        MinuteStart=(int)pos["Minute"].Value,MinuteLen=(int)len["Minute"].Value,
        CodeStart=(int)pos["Code"].Value,CodeLen=(int)len["Code"].Value,
        TypeValue=typeValue.Text.Trim(), CodeValue=codeValue.Text.Trim(), Separators=separators.Text.Trim()
    };

    void RefreshFormatPreview()
    {
        try { if (pos.Count > 0) formatPreview.Text = BuildLine("00003", new DateTime(2026,9,29), "08:28"); }
        catch (Exception ex) { formatPreview.Text = "FORMAT HATASI: " + ex.Message; }
    }

    void SaveFormat()
    {
        try
        {
            settings = CurrentSettings();
            File.WriteAllText(settingsPath, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }), Encoding.UTF8);
            RefreshFormatPreview();
            MessageBox.Show("Terminal format ayarı kaydedildi.", "HKN PDKS");
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Format Kaydet", MessageBoxButtons.OK, MessageBoxIcon.Error); }
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
}