using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

public sealed class MainForm : Form
{
    readonly TextBox dbPath = new() { Dock = DockStyle.Fill };
    readonly TextBox tnfPath = new() { Dock = DockStyle.Fill };
    readonly Label sourceStatus = new() { AutoSize = true };
    readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    readonly DataGridView peopleGrid = Grid();
    readonly DataGridView ioGrid = Grid();
    readonly DataGridView payrollGrid = Grid();
    readonly DataGridView bulkGrid = Grid();
    readonly DataGridView auditGrid = Grid();
    readonly DataGridView eGrid = Grid();
    readonly ComboBox personFilter = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 110 };
    readonly Label personSummary = new() { AutoSize = true, Padding = new Padding(10,8,0,0) };
    readonly CheckedListBox ePeopleList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox eDayList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DateTimePicker eStart = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker eEnd = new() { Format = DateTimePickerFormat.Short };
    readonly ComboBox eSide = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 120 };
    readonly CheckedListBox peopleList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly CheckedListBox dayList = new() { Dock = DockStyle.Fill, CheckOnClick = true };
    readonly DateTimePicker ioMonth = MonthPicker();
    readonly DateTimePicker payrollMonth = MonthPicker();
    readonly DateTimePicker rangeStart = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker rangeEnd = new() { Format = DateTimePickerFormat.Short };
    readonly MaskedTextBox inMin = TimeBox("08:20"), inMax = TimeBox("08:35");
    readonly MaskedTextBox outMin = TimeBox("18:55"), outMax = TimeBox("19:05");
    FirebirdDatabase? db;
    PdksOptions? options;
    public MainForm()
    {
        Text = "HKN PDKS Hızlı Veri";
        StartPosition = FormStartPosition.CenterScreen;
        Width = 1380; Height = 820; MinimumSize = new Size(1100, 700);
        Font = new Font("Segoe UI", 9f);
        personFilter.Items.AddRange(["Aktif","Pasif","T\u00fcm\u00fc"]); personFilter.SelectedIndex = 0;
        eSide.Items.AddRange(["Giri\u015f E","\u00c7\u0131k\u0131\u015f E","Giri\u015f + \u00c7\u0131k\u0131\u015f E"]); eSide.SelectedIndex = 0;
        Build();
        personFilter.SelectedIndexChanged += (_, _) => LoadPeople();
        eStart.ValueChanged += (_, _) => RebuildEDays(); eEnd.ValueChanged += (_, _) => RebuildEDays();
        Shown += (_, _) => { DetectSources(); Connect(); };
        rangeStart.ValueChanged += (_, _) => RebuildDays();
        rangeEnd.ValueChanged += (_, _) => RebuildDays();
    }

    static DataGridView Grid() => new()
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

    static DateTimePicker MonthPicker() => new() { Format = DateTimePickerFormat.Custom, CustomFormat = "MMMM yyyy", ShowUpDown = true };
    static MaskedTextBox TimeBox(string value) => new("00:00") { Text = value, Width = 60 };
    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 122));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(BuildSources(), 0, 0);
        tabs.TabPages.Add(Page("Personel", BuildPeople()));
        tabs.TabPages.Add(Page("Giriş-Çıkış", BuildIo()));
        tabs.TabPages.Add(Page("Toplu İşlem", BuildBulk()));
        tabs.TabPages.Add(Page("E \u0130\u015flemleri", BuildE()));
        tabs.TabPages.Add(Page("Bordro", BuildPayroll()));
        tabs.TabPages.Add(Page("Data Kontrol", BuildAudit()));
        root.Controls.Add(tabs, 0, 1);
        Controls.Add(root);
    }

    static TabPage Page(string title, Control content)
    {
        var p = new TabPage(title) { Padding = new Padding(8), BackColor = Color.White };
        p.Controls.Add(content); return p;
    }

    Control BuildSources()
    {
        var box = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 3, Padding = new Padding(10) };
        box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 135)); box.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 105)); box.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        box.Controls.Add(new Label { Text = "Hedef GDB", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        box.Controls.Add(dbPath, 1, 0); box.Controls.Add(Btn("GDB Seç", PickDb), 2, 0);
        box.Controls.Add(new Label { Text = "Terminal TNF", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 1);
        box.Controls.Add(tnfPath, 1, 1); box.Controls.Add(Btn("TNF Seç", PickTnf), 2, 1);
        box.Controls.Add(Btn("Otomatik Tanı", DetectSources), 3, 0);
        box.Controls.Add(Btn("Bağlan / Yenile", Connect), 3, 1);
        box.Controls.Add(sourceStatus, 1, 2); box.SetColumnSpan(sourceStatus, 3);
        return box;
    }

    static Button Btn(string text, Action action)
    {
        var b = new Button { Text = text, Dock = DockStyle.Fill, Height = 32, FlatStyle = FlatStyle.Flat };
        b.Click += (_, _) => action(); return b;
    }

    static Button WideBtn(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 32, FlatStyle = FlatStyle.Flat, Margin = new Padding(3,0,3,0) };
        b.Click += (_, _) => action(); return b;
    }

    Control BuildPeople()
    {
        var p = new Panel { Dock = DockStyle.Fill };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44, Padding = new Padding(2,3,2,2) };
        bar.Controls.Add(new Label { Text = "Personel Durumu", AutoSize = true, Padding = new Padding(0,8,4,0) });
        bar.Controls.Add(personFilter);
        bar.Controls.Add(Btn("Yenile", LoadPeople));
        bar.Controls.Add(personSummary);
        p.Controls.Add(peopleGrid); p.Controls.Add(bar); return p;
    }

    Control BuildIo()
    {
        var p = new Panel { Dock = DockStyle.Fill }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42 };
        bar.Controls.Add(new Label { Text = "Ay", AutoSize = true, Padding = new Padding(0, 8, 4, 0) }); bar.Controls.Add(ioMonth);
        bar.Controls.Add(Btn("Listele", LoadIo));
        bar.Controls.Add(new Label { Text = "E i\u015flemleri ayr\u0131 E \u0130\u015flemleri sekmesinden toplu y\u00f6netilir.", AutoSize = true, Padding = new Padding(12,8,0,0) });
        p.Controls.Add(ioGrid); p.Controls.Add(bar); return p;
    }
    Control BuildBulk()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 3, Padding = new Padding(8) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 260));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var controls = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true };
        controls.Controls.Add(new Label { Text = "Ba\u015flang\u0131\u00e7", AutoSize = true, Padding = new Padding(0, 8, 2, 0) }); controls.Controls.Add(rangeStart);
        controls.Controls.Add(new Label { Text = "Biti\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(rangeEnd);
        controls.Controls.Add(new Label { Text = "Giri\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(inMin); controls.Controls.Add(inMax);
        controls.Controls.Add(new Label { Text = "\u00c7\u0131k\u0131\u015f", AutoSize = true, Padding = new Padding(8, 8, 2, 0) }); controls.Controls.Add(outMin); controls.Controls.Add(outMax);
        root.Controls.Add(controls, 0, 0); root.SetColumnSpan(controls, 3);
        root.Controls.Add(peopleList, 0, 1); root.Controls.Add(dayList, 1, 1); root.Controls.Add(bulkGrid, 2, 1);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(4,6,4,2) };
        actions.Controls.Add(WideBtn("T\u00fcm Personeli Se\u00e7", CheckAllPeople, 150)); actions.Controls.Add(WideBtn("T\u00fcm G\u00fcnleri Se\u00e7", CheckAllDays, 145));
        actions.Controls.Add(WideBtn("\u00d6nizleme", PreviewBulk, 115)); actions.Controls.Add(WideBtn("Uygula", ApplyBulk, 100));
        root.Controls.Add(actions, 0, 2); root.SetColumnSpan(actions, 3);
        return root;
    }

    Control BuildE()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 3, Padding = new Padding(8) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 250)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true };
        top.Controls.Add(new Label { Text = "Ba\u015flang\u0131\u00e7", AutoSize = true, Padding = new Padding(0,8,2,0) }); top.Controls.Add(eStart);
        top.Controls.Add(new Label { Text = "Biti\u015f", AutoSize = true, Padding = new Padding(8,8,2,0) }); top.Controls.Add(eEnd);
        top.Controls.Add(new Label { Text = "\u0130\u015flem", AutoSize = true, Padding = new Padding(8,8,2,0) }); top.Controls.Add(eSide);
        top.Controls.Add(new Label { Text = "Yaln\u0131z mevcut normal giri\u015f/\u00e7\u0131k\u0131\u015f E'ye \u00e7evrilir; yeni saat \u00fcretilmez.", AutoSize = true, Padding = new Padding(12,8,0,0) });
        root.Controls.Add(top,0,0); root.SetColumnSpan(top,3);
        root.Controls.Add(ePeopleList,0,1); root.Controls.Add(eDayList,1,1); root.Controls.Add(eGrid,2,1);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(4,6,4,2) };
        actions.Controls.Add(WideBtn("T\u00fcm Aktifleri Se\u00e7", CheckAllEPeople, 145)); actions.Controls.Add(WideBtn("T\u00fcm G\u00fcnleri Se\u00e7", CheckAllEDays, 145)); actions.Controls.Add(WideBtn("E \u00d6nizleme", PreviewBulkE, 120)); actions.Controls.Add(WideBtn("E Uygula", ApplyBulkE, 120));
        root.Controls.Add(actions,0,2); root.SetColumnSpan(actions,3); return root;
    }
    Control BuildPayroll()
    {
        var p = new Panel { Dock = DockStyle.Fill }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42 };
        bar.Controls.Add(new Label { Text = "Ay", AutoSize = true, Padding = new Padding(0, 8, 4, 0) }); bar.Controls.Add(payrollMonth);
        bar.Controls.Add(Btn("Bordroyu Listele", LoadPayroll)); bar.Controls.Add(Btn("Se\u00e7ili Bordroyu D\u00fczenle", EditPayrollSelected));
        p.Controls.Add(payrollGrid); p.Controls.Add(bar); return p;
    }
    Control BuildAudit()
    {
        var p = new Panel { Dock = DockStyle.Fill }; var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42 };
        bar.Controls.Add(Btn("E / TNF Çakışmalarını Tara", LoadAudit));
        p.Controls.Add(auditGrid); p.Controls.Add(bar); return p;
    }

    void DetectSources()
    {
        var configured = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User);
        string[] dbCandidates = [configured ?? "", @"C:\Hedef500\Data\DATABASE.GDB", @"D:\Hedef500\Hedef500\Data\DATABASE.GDB"];
        dbPath.Text = dbCandidates.FirstOrDefault(File.Exists) ?? configured ?? "";
        var root = string.IsNullOrWhiteSpace(dbPath.Text) ? "" : Directory.GetParent(Path.GetDirectoryName(dbPath.Text) ?? "")?.FullName ?? "";
        var temp = Path.Combine(root, "Temp");
        tnfPath.Text = Directory.Exists(temp) ? Directory.GetFiles(temp, "TR*.Tnf").OrderByDescending(x => x).FirstOrDefault() ?? "" : tnfPath.Text;
        UpdateSourceStatus();
    }

    void PickDb()
    {
        using var d = new OpenFileDialog { Filter = "Firebird (*.gdb;*.fdb)|*.gdb;*.fdb|Tüm dosyalar|*.*", FileName = dbPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { dbPath.Text = d.FileName; UpdateSourceStatus(); }
    }

    void PickTnf()
    {
        using var d = new OpenFileDialog { Filter = "Terminal (*.tnf;*.txt)|*.tnf;*.txt|Tüm dosyalar|*.*", FileName = tnfPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { tnfPath.Text = d.FileName; UpdateSourceStatus(); }
    }
    void UpdateSourceStatus()
    {
        var g = File.Exists(dbPath.Text); var t = File.Exists(tnfPath.Text);
        sourceStatus.Text = $"GDB: {(g ? "HAZIR" : "YOK")}   |   TNF: {(t ? "HAZIR" : "YOK")}";
        sourceStatus.ForeColor = g ? Color.DarkGreen : Color.DarkRed;
    }

    void Connect()
    {
        try
        {
            var baseOptions = PdksOptions.FromEnvironment();
            options = baseOptions with { DatabasePath = dbPath.Text.Trim() };
            db = new FirebirdDatabase(options);
            using var c = db.OpenConnection();
            sourceStatus.Text = "Bağlandı: " + dbPath.Text;
            LoadPeople(); LoadIo(); LoadPayroll(); RebuildDays(); RebuildEDays(); LoadAudit();
        }
        catch (Exception ex)
        {
            sourceStatus.Text = "Bağlantı yok: " + ex.Message;
            sourceStatus.ForeColor = Color.DarkRed;
        }
    }

    void LoadPeople()
    {
        if (db is null) return;
        try
        {
            var mode = personFilter.SelectedItem?.ToString() ?? "Aktif";
            var where = mode == "Aktif" ? " where (ICTARIH is null or ICTARIH>=@TODAY)" : mode == "Pasif" ? " where ICTARIH is not null and ICTARIH<@TODAY" : "";
            var order = mode == "TÃ¼mÃ¼" ? " order by case when (ICTARIH is null or ICTARIH>=@TODAY) then 0 else 1 end, PKNO" : " order by PKNO";
            peopleGrid.DataSource = db.Query("select PKNO,SICILNO,AD,SOYAD,IGTARIH,ICTARIH,DURUM,MAAS,BOLUM from KIMLIK" + where + order, new FbParameter("@TODAY", DateTime.Today));
            var active = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is null or ICTARIH>=@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? 0);
            var passive = Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is not null and ICTARIH<@TODAY", new FbParameter("@TODAY", DateTime.Today)) ?? 0);
            personSummary.Text = $"Aktif: {active}   Pasif: {passive}   Toplam: {active + passive}";
            var activeRows = db.Query("select PKNO,AD,SOYAD from KIMLIK where (ICTARIH is null or ICTARIH>=@TODAY) order by PKNO", new FbParameter("@TODAY", DateTime.Today));
            peopleList.Items.Clear(); ePeopleList.Items.Clear();
            foreach (DataRow r in activeRows.Rows)
            {
                var card = Convert.ToString(r["PKNO"]) ?? ""; var text = $"{card}  {r["AD"]} {r["SOYAD"]}";
                if (card == "00001") continue;
                peopleList.Items.Add(text, false); ePeopleList.Items.Add(text, false);
            }
            if (peopleGrid.Columns.Contains("ICTARIH")) peopleGrid.Columns["ICTARIH"].HeaderText = "\u0130\u015ften \u00c7\u0131k\u0131\u015f";
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Personel"); }
    }
    void LoadIo()
    {
        if (db is null) return;
        try
        {
            var a = new DateTime(ioMonth.Value.Year, ioMonth.Value.Month, 1); var b = a.AddMonths(1);
            ioGrid.DataSource = db.Query("select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO where g.GTARIH>=@A and g.GTARIH<@B order by g.GTARIH,g.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Giriş-Çıkış"); }
    }

    void LoadPayroll()
    {
        if (db is null) return;
        try
        {
            var a = new DateTime(payrollMonth.Value.Year, payrollMonth.Value.Month, 1); var b = a.AddMonths(1);
            payrollGrid.DataSource = db.Query("select u.PKNO,k.AD,k.SOYAD,u.BASTAR,u.BITTAR,u.DMAAS,u.GUN1,u.SAAT1,u.UCRET1,u.NCGUN,u.NCSAAT,u.NCUCRET,u.DEVG,u.DEVS,u.DEVU,u.EKKAZ,u.EKKES,u.NCODENEN,u.NCMAAS,u.NCKALAN from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR>=@A and u.BASTAR<@B order by u.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Bordro"); }
    }

    void RebuildDays()
    {
        dayList.Items.Clear(); if (rangeEnd.Value.Date < rangeStart.Value.Date) return;
        for (var d = rangeStart.Value.Date; d <= rangeEnd.Value.Date; d = d.AddDays(1)) dayList.Items.Add(d, true);
    }

    void CheckAllPeople() { for (var i = 0; i < peopleList.Items.Count; i++) peopleList.SetItemChecked(i, true); }
    void CheckAllDays() { for (var i = 0; i < dayList.Items.Count; i++) dayList.SetItemChecked(i, true); }


    void RebuildEDays()
    {
        eDayList.Items.Clear(); if (eEnd.Value.Date < eStart.Value.Date) return;
        for (var d = eStart.Value.Date; d <= eEnd.Value.Date; d = d.AddDays(1)) eDayList.Items.Add(d, true);
    }

    void CheckAllEPeople() { for (var i = 0; i < ePeopleList.Items.Count; i++) ePeopleList.SetItemChecked(i, true); }
    void CheckAllEDays() { for (var i = 0; i < eDayList.Items.Count; i++) eDayList.SetItemChecked(i, true); }

    void PreviewBulkE()
    {
        try { eGrid.DataSource = BuildBulkEPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E Ã–nizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable BuildBulkEPreview()
    {
        if (db is null) throw new InvalidOperationException("VeritabanÄ± baÄŸlÄ± deÄŸil.");
        var cards = ePeopleList.CheckedItems.Cast<string>().Select(x => x[..5]).ToHashSet();
        var days = eDayList.CheckedItems.Cast<DateTime>().Select(x => x.Date).ToHashSet();
        if (cards.Count == 0 || days.Count == 0) throw new InvalidOperationException("Personel ve gÃ¼n seÃ§in.");
        var a = days.Min(); var b = days.Max().AddDays(1);
        var src = db.Query("select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO where g.GTARIH>=@A and g.GTARIH<@B order by g.GTARIH,g.PKNO", new FbParameter("@A",a), new FbParameter("@B",b));
        var lines = File.Exists(tnfPath.Text) ? File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray() : [];
        var t = new DataTable();
        foreach (var c in new[]{"SIRA","Kart No","Ad Soyad","Tarih","Taraf","Saat","Mevcut TÃ¼r","TNF Aday","Durum"}) t.Columns.Add(c);
        var mode = eSide.SelectedIndex;
        foreach (DataRow r in src.Rows)
        {
            var card = Convert.ToString(r["PKNO"]) ?? "";
            if (!cards.Contains(card)) continue;
            var day = Convert.ToDateTime(r["GTARIH"]).Date; if (!days.Contains(day)) continue;
            var name = $"{r["AD"]} {r["SOYAD"]}".Trim();
            if ((mode == 0 || mode == 2) && r["GSAAT"] != DBNull.Value && !string.IsNullOrWhiteSpace(Convert.ToString(r["GSAAT"])) && Convert.ToString(r["GTUR"]) != "E")
                AddEPreviewRow(t, lines, r, card, name, day, true);
            if ((mode == 1 || mode == 2) && r["CSAAT"] != DBNull.Value && !string.IsNullOrWhiteSpace(Convert.ToString(r["CSAAT"])) && Convert.ToString(r["CTUR"]) != "E")
                AddEPreviewRow(t, lines, r, card, name, day, false);
        }
        return t;
    }

    void AddEPreviewRow(DataTable t, string[] lines, DataRow r, string card, string name, DateTime day, bool entry)
    {
        var time = Convert.ToString(r[entry ? "GSAAT" : "CSAAT"]) ?? "";
        var type = Convert.ToString(r[entry ? "GTUR" : "CTUR"]) ?? "";
        var same = lines.Where(x => SameTnfSide(x, card, day, entry)).ToArray();
        var exact = same.Where(x => x.Split(',').Length > 1 && x.Split(',')[1] == time).ToArray();
        var candidates = exact.Length > 0 ? exact : same;
        var status = exact.Length == 1 ? "HazÄ±r - tam eÅŸleÅŸme" : candidates.Length == 0 ? "HazÄ±r - TNF yok" : candidates.Length == 1 ? "HazÄ±r - tek taraf adayÄ±" : "Ã‡AKIÅMA";
        t.Rows.Add(r["SIRA"], card, name, day.ToString("dd.MM.yyyy"), entry ? "GiriÅŸ" : "Ã‡Ä±kÄ±ÅŸ", time, type, string.Join(" | ", candidates), status);
    }
    void ApplyBulkE()
    {
        if (db is null) return;
        DataTable preview;
        try { preview = BuildBulkEPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E Ä°ÅŸlemleri"); return; }
        if (preview.Rows.Count == 0) { MessageBox.Show("E'ye Ã§evrilecek normal kayÄ±t bulunamadÄ±."); return; }
        if (preview.AsEnumerable().Any(r => Convert.ToString(r["Durum"]) == "Ã‡AKIÅMA")) { MessageBox.Show("Ã‡akÄ±ÅŸmalÄ± TNF satÄ±rÄ± var. Uygulama durduruldu.", "E Ä°ÅŸlemleri", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyasÄ±nÄ± seÃ§in."); return; }
        if (MessageBox.Show($"{preview.Rows.Count} taraf E yapÄ±lacak ve TNF karÅŸÄ±lÄ±klarÄ± temizlenecek. Devam?", "Toplu E", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var backup = tnfPath.Text + ".bak_Ebulk_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        File.Copy(tnfPath.Text, backup, true);
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            foreach (DataRow r in preview.Rows)
            {
                var sira = Convert.ToInt32(r["SIRA"]); var card = Convert.ToString(r["Kart No"])!; var day = DateTime.ParseExact(Convert.ToString(r["Tarih"])!, "dd.MM.yyyy", null);
                var entry = Convert.ToString(r["Taraf"]) == "GiriÅŸ"; var time = Convert.ToString(r["Saat"])!;
                Exec(c, tx, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", sira));
                var same = lines.Select((x,i)=>(x,i)).Where(z => SameTnfSide(z.x, card, day, entry)).ToList();
                var exact = same.Where(z => z.x.Split(',').Length > 1 && z.x.Split(',')[1] == time).ToList();
                var chosen = exact.Count == 1 ? exact : same.Count == 1 ? same : [];
                if (chosen.Count == 1) lines.Remove(chosen[0].x);
            }
            File.WriteAllLines(tnfPath.Text, lines);
            tx.Commit(); eGrid.DataSource = BuildBulkEPreview(); LoadIo(); LoadAudit();
            MessageBox.Show($"Toplu E tamamlandÄ±. TNF yedeÄŸi: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { } File.Copy(backup, tnfPath.Text, true);
            MessageBox.Show(ex.Message, "Toplu E", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void PreviewBulk()
    {
        try { bulkGrid.DataSource = BuildBulkPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Toplu Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable BuildBulkPreview()
    {
        var cards = peopleList.CheckedItems.Cast<string>().Select(x => x[..5]).OrderBy(x => x).ToList();
        var days = dayList.CheckedItems.Cast<DateTime>().OrderBy(x => x).ToList();
        if (cards.Count == 0 || days.Count == 0) throw new InvalidOperationException("Personel ve gün seçin.");
        var inA = ToMinute(inMin.Text); var inB = ToMinute(inMax.Text);
        var outA = ToMinute(outMin.Text); var outB = ToMinute(outMax.Text);
        if (inB < inA || outB < outA) throw new InvalidOperationException("Saat aralığı hatalı.");
        if (inB - inA + 1 < cards.Count || outB - outA + 1 < cards.Count)
            throw new InvalidOperationException($"Saat aralığı dar. Personel: {cards.Count}, giriş slotu: {inB-inA+1}, çıkış slotu: {outB-outA+1}.");
        var t = new DataTable(); t.Columns.Add("Kart No"); t.Columns.Add("Tarih", typeof(DateTime)); t.Columns.Add("Giriş"); t.Columns.Add("Çıkış");
        foreach (var day in days)
        {
            var ins = ShuffledMinutes(inA, inB, day, 17); var outs = ShuffledMinutes(outA, outB, day, 71);
            for (var i = 0; i < cards.Count; i++) t.Rows.Add(cards[i], day, FromMinute(ins[i]), FromMinute(outs[i]));
        }
        return t;
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
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1); (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    static object? Scalar(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
    {
        using var cmd = FirebirdDatabase.CreateCommand(c, tx, sql, p); return cmd.ExecuteScalar();
    }

    static int Exec(FbConnection c, FbTransaction tx, string sql, params FbParameter[] p)
    {
        using var cmd = FirebirdDatabase.CreateCommand(c, tx, sql, p); return cmd.ExecuteNonQuery();
    }
    void ApplyBulk()
    {
        if (db is null) return;
        DataTable preview;
        try { preview = BuildBulkPreview(); }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Toplu İşlem"); return; }
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyasını seçin.", "Toplu İşlem"); return; }
        if (MessageBox.Show($"{preview.Rows.Count} kişi/gün kaydı uygulanacak. Mevcut dolu giriş-çıkışlar korunur. Devam?", "Toplu İşlem", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;

        var backup = tnfPath.Text + ".bak_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        var temp = tnfPath.Text + ".tmp_quick";
        File.Copy(tnfPath.Text, backup, true);
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var existing = new HashSet<string>(lines, StringComparer.OrdinalIgnoreCase);
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            var next = Convert.ToInt32(Scalar(c, tx, "select coalesce(max(SIRA),0)+1 from GIRCIK") ?? 1);
            foreach (DataRow r in preview.Rows)
            {
                var card = Convert.ToString(r["Kart No"])!; var day = Convert.ToDateTime(r["Tarih"]).Date;
                var gi = Convert.ToString(r["Giriş"])!; var co = Convert.ToString(r["Çıkış"])!;
                using var find = FirebirdDatabase.CreateCommand(c, tx, "select first 1 SIRA,GSAAT,CSAAT from GIRCIK where PKNO=@P and GTARIH>=@D and GTARIH<@N order by SIRA",
                    new FbParameter("@P", card), new FbParameter("@D", day), new FbParameter("@N", day.AddDays(1)));
                using var rd = find.ExecuteReader(); int? sira = null; string oldG = "", oldC = "";
                if (rd.Read()) { sira = Convert.ToInt32(rd[0]); oldG = Convert.ToString(rd[1]) ?? ""; oldC = Convert.ToString(rd[2]) ?? ""; }
                rd.Close();
                var addG = string.IsNullOrWhiteSpace(oldG); var addC = string.IsNullOrWhiteSpace(oldC);
                if (sira is null)
                {
                    Exec(c, tx, "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA) values (@S,@P,@D,@G,@GD,@D,@C,@CD)",
                        new FbParameter("@S", next), new FbParameter("@P", card), new FbParameter("@D", day), new FbParameter("@G", gi), new FbParameter("@GD", ToMinute(gi)), new FbParameter("@C", co), new FbParameter("@CD", ToMinute(co)));
                    next++; addG = addC = true;
                }
                else
                {
                    if (addG) Exec(c, tx, "update GIRCIK set GTARIH=@D,GSAAT=@G,GDAKIKA=@M,GTUR=null where SIRA=@S", new FbParameter("@D", day), new FbParameter("@G", gi), new FbParameter("@M", ToMinute(gi)), new FbParameter("@S", sira.Value));
                    if (addC) Exec(c, tx, "update GIRCIK set CTARIH=@D,CSAAT=@C,CDAKIKA=@M,CTUR=null where SIRA=@S", new FbParameter("@D", day), new FbParameter("@C", co), new FbParameter("@M", ToMinute(co)), new FbParameter("@S", sira.Value));
                }
                if (addG) { var line = $"{card},{gi},{day:ddMMyy},1,001"; if (existing.Add(line)) lines.Add(line); }
                if (addC) { var line = $"{card},{co},{day:ddMMyy},1,001"; if (existing.Add(line)) lines.Add(line); }
            }
            File.WriteAllLines(temp, SortTnf(lines));
            File.Move(temp, tnfPath.Text, true);
            try { tx.Commit(); }
            catch { File.Copy(backup, tnfPath.Text, true); throw; }
            bulkGrid.DataSource = preview; LoadIo(); LoadAudit();
            MessageBox.Show($"Toplu işlem tamamlandı. TNF yedeği: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { }
            if (File.Exists(temp)) File.Delete(temp);
            MessageBox.Show(ex.Message, "Toplu İşlem", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static IEnumerable<string> SortTnf(IEnumerable<string> lines) =>
        lines.OrderBy(x => TnfKey(x).date).ThenBy(x => TnfKey(x).time).ThenBy(x => TnfKey(x).card);

    static (DateTime date, TimeSpan time, string card) TnfKey(string line)
    {
        try
        {
            var p = line.Split(','); if (p.Length < 3) return (DateTime.MaxValue, TimeSpan.MaxValue, line);
            return (DateTime.ParseExact(p[2], "ddMMyy", System.Globalization.CultureInfo.InvariantCulture), TimeSpan.Parse(p[1]), p[0]);
        }
        catch { return (DateTime.MaxValue, TimeSpan.MaxValue, line); }
    }
    static bool IsEntryTime(string time) => TimeSpan.TryParse(time, out var t) && t < TimeSpan.FromHours(12);

    static bool SameTnfSide(string line, string card, DateTime day, bool entry)
    {
        var p = line.Split(',');
        if (p.Length < 3 || p[0] != card || p[2] != day.ToString("ddMMyy")) return false;
        return IsEntryTime(p[1]) == entry;
    }

    void MarkSelectedE(bool entry)
    {
        if (db is null || ioGrid.SelectedRows.Count == 0) return;
        if (!File.Exists(tnfPath.Text)) { MessageBox.Show("TNF dosyasını seçin.", "E Düzeltme"); return; }
        var selected = ioGrid.SelectedRows.Cast<DataGridViewRow>().Where(r => !r.IsNewRow).ToList();
        var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var remove = new HashSet<int>();
        try
        {
            foreach (var row in selected)
            {
                var card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
                var dateObj = entry ? row.Cells["GTARIH"].Value : row.Cells["CTARIH"].Value;
                var time = Convert.ToString(entry ? row.Cells["GSAAT"].Value : row.Cells["CSAAT"].Value) ?? "";
                if (dateObj is null || dateObj == DBNull.Value || string.IsNullOrWhiteSpace(time)) throw new InvalidOperationException($"{card}: seçilen tarafta tarih/saat yok.");
                var day = Convert.ToDateTime(dateObj).Date;
                var sameSide = lines.Select((x, i) => (x, i)).Where(z => SameTnfSide(z.x, card, day, entry)).ToList();
                var exact = sameSide.Where(z => z.x.Split(',')[1] == time).ToList();
                var candidates = exact.Count > 0 ? exact : sameSide;
                if (candidates.Count > 1) throw new InvalidOperationException($"{card} {day:dd.MM.yyyy}: aynı tarafta birden fazla TNF adayı var.");
                if (candidates.Count == 1) remove.Add(candidates[0].i);
            }
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (MessageBox.Show($"{selected.Count} kayıt için {(entry ? "giriş" : "çıkış")} tarafı E yapılacak. TNF'deki karşılık temizlenecek. Devam?", "E Düzeltme", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var backup = tnfPath.Text + ".bak_E_" + DateTime.Now.ToString("yyyyMMdd_HHmmss");
        File.Copy(tnfPath.Text, backup, true);
        using var c = db.OpenConnection(); using var tx = c.BeginTransaction();
        try
        {
            foreach (var row in selected)
            {
                var sira = Convert.ToInt32(row.Cells["SIRA"].Value);
                Exec(c, tx, entry ? "update GIRCIK set GTUR='E' where SIRA=@S" : "update GIRCIK set CTUR='E' where SIRA=@S", new FbParameter("@S", sira));
            }
            var kept = lines.Where((_, i) => !remove.Contains(i)).ToArray();
            File.WriteAllLines(tnfPath.Text, kept);
            try { tx.Commit(); }
            catch { File.Copy(backup, tnfPath.Text, true); throw; }
            LoadIo(); LoadAudit();
            MessageBox.Show($"E işlemi tamamlandı. TNF'den {remove.Count} satır temizlendi. Yedek: {backup}", "HKN PDKS");
        }
        catch (Exception ex)
        {
            try { tx.Rollback(); } catch { }
            File.Copy(backup, tnfPath.Text, true);
            MessageBox.Show(ex.Message, "E Düzeltme", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void LoadAudit()
    {
        if (db is null || !File.Exists(tnfPath.Text)) return;
        try
        {
            var t = new DataTable(); t.Columns.Add("Kart No"); t.Columns.Add("Tarih"); t.Columns.Add("Taraf"); t.Columns.Add("E Saati"); t.Columns.Add("TNF Aday"); t.Columns.Add("Durum");
            var e = db.Query("select PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK where GTUR='E' or CTUR='E' order by GTARIH,PKNO");
            var lines = File.ReadAllLines(tnfPath.Text).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
            foreach (DataRow r in e.Rows)
            {
                var card = Convert.ToString(r["PKNO"]) ?? "";
                if (Convert.ToString(r["GTUR"]) == "E" && r["GTARIH"] != DBNull.Value)
                {
                    var d = Convert.ToDateTime(r["GTARIH"]).Date; var time = Convert.ToString(r["GSAAT"]) ?? "";
                    var cand = lines.Where(x => SameTnfSide(x, card, d, true)).ToArray();
                    t.Rows.Add(card, d.ToString("dd.MM.yyyy"), "Giriş", time, string.Join(" | ", cand), cand.Length == 0 ? "Temiz" : cand.Length == 1 ? "TNF karşılığı var" : "Birden fazla TNF adayı");
                }
                if (Convert.ToString(r["CTUR"]) == "E" && r["CTARIH"] != DBNull.Value)
                {
                    var d = Convert.ToDateTime(r["CTARIH"]).Date; var time = Convert.ToString(r["CSAAT"]) ?? "";
                    var cand = lines.Where(x => SameTnfSide(x, card, d, false)).ToArray();
                    t.Rows.Add(card, d.ToString("dd.MM.yyyy"), "Çıkış", time, string.Join(" | ", cand), cand.Length == 0 ? "Temiz" : cand.Length == 1 ? "TNF karşılığı var" : "Birden fazla TNF adayı");
                }
            }
            auditGrid.DataSource = t;
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, "Data Kontrol"); }
    }

    void EditPayrollSelected()
    {
        if (db is null || payrollGrid.SelectedRows.Count != 1) { MessageBox.Show("Tek bordro satırı seçin."); return; }
        var row = payrollGrid.SelectedRows[0];
        var card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
        var startDate = Convert.ToDateTime(row.Cells["BASTAR"].Value);
        using var f = new PayrollEditForm(card, row);
        if (f.ShowDialog(this) != DialogResult.OK) return;
        if (MessageBox.Show($"{card} bordro kaydı güncellenecek. Devam?", "Bordro", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        var sql = "update UCRETLER set DMAAS=@M,GUN1=@G,SAAT1=@S,UCRET1=@U,NCGUN=@NG,NCSAAT=@NS,NCUCRET=@NU,DEVG=@DG,DEVU=@DU,EKKAZ=@EK,EKKES=@ES,NCODENEN=@O where PKNO=@P and BASTAR=@B";
        db.Execute(sql, new FbParameter("@M",f.Maas), new FbParameter("@G",f.Gun), new FbParameter("@S",f.Saat), new FbParameter("@U",f.Ucret), new FbParameter("@NG",f.NGun), new FbParameter("@NS",f.NSaat), new FbParameter("@NU",f.NUcret), new FbParameter("@DG",f.DevGun), new FbParameter("@DU",f.DevUcret), new FbParameter("@EK",f.EkKaz), new FbParameter("@ES",f.EkKes), new FbParameter("@O",f.Odenen), new FbParameter("@P",card), new FbParameter("@B",startDate));
        LoadPayroll();
    }
}
