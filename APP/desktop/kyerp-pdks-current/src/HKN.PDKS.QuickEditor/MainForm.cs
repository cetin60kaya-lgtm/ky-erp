using System.Data;

namespace HKN.PDKS.QuickEditor;

public sealed class MainForm : Form
{
    readonly DataService db = new();
    readonly TnfStore tnf = new();
    readonly TextBox dbPath = new() { Text = @"C:\Hedef500\Data\DATABASE.GDB", Width = 500 };
    readonly TextBox tnfPath = new() { Text = @"C:\Hedef500\Temp\TR2026.Tnf", Width = 500 };
    readonly TextBox password = new() { UseSystemPasswordChar = true, Width = 120 };
    readonly DataGridView personGrid = Grid();
    readonly DataGridView attendanceGrid = Grid();
    readonly DataGridView bulkGrid = Grid(false);
    readonly DataGridView payrollGrid = Grid();
    readonly CheckBox includePassive = new() { Text = "Pasif personeli göster", Checked = true, AutoSize = true };
    readonly TextBox card = new() { Width = 80 };
    readonly DateTimePicker attendanceMonth = MonthPicker();
    readonly DateTimePicker bulkMonth = MonthPicker();
    readonly DateTimePicker payrollMonth = MonthPicker();
    readonly DateTimePicker editDay = new() { Format = DateTimePickerFormat.Short, Width = 110 };
    readonly TextBox editEntry = new() { Width = 70 };
    readonly TextBox editExit = new() { Width = 70 };
    readonly CheckedListBox days = new() { CheckOnClick = true, Width = 210, Dock = DockStyle.Fill };
    readonly Label status = new() { AutoSize = true, Text = "Hazır" };

    public MainForm()
    {
        Text = "HKN PDKS Hızlı İşlem";
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1180, 720);
        Font = new Font("Segoe UI", 9f);
        Build();
        bulkMonth.ValueChanged += (_, _) => BulkPlanner.FillDays(days, bulkMonth.Value);
        Shown += (_, _) => { ApplySources(); BulkPlanner.FillDays(days, bulkMonth.Value); LoadPersonnel(); };
    }

    static DataGridView Grid(bool readOnly = true) => new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = readOnly,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        MultiSelect = true,
        BackgroundColor = Color.White
    };

    static DateTimePicker MonthPicker() => new()
    {
        Format = DateTimePickerFormat.Custom,
        CustomFormat = "MMMM yyyy",
        ShowUpDown = true,
        Width = 145
    };

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        var sources = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, WrapContents = true };
        sources.Controls.Add(Label("GDB")); sources.Controls.Add(dbPath); sources.Controls.Add(Btn("GDB Seç", PickDb));
        sources.Controls.Add(Label("TNF")); sources.Controls.Add(tnfPath); sources.Controls.Add(Btn("TNF Seç", PickTnf));
        sources.Controls.Add(Label("DB parola")); sources.Controls.Add(password); sources.Controls.Add(Btn("Bağlan / Yenile", ConnectAll, true));
        root.Controls.Add(sources, 0, 0);
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(BuildPersonnelTab());
        tabs.TabPages.Add(BuildAttendanceTab());
        tabs.TabPages.Add(BuildBulkTab());
        tabs.TabPages.Add(BuildPayrollTab());
        root.Controls.Add(tabs, 0, 1);
        root.Controls.Add(status, 0, 2);
        Controls.Add(root);
    }

    static Label Label(string text) => new() { Text = text, AutoSize = true, Padding = new Padding(8, 8, 0, 0) };

    TabPage BuildPersonnelTab()
    {
        var page = new TabPage("Personel") { Padding = new Padding(8) };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 42 };
        bar.Controls.Add(includePassive);
        bar.Controls.Add(Btn("Personeli Yenile", LoadPersonnel));
        bar.Controls.Add(new Label { Text = "Çift tık: personelin aylık giriş-çıkışını aç", AutoSize = true, Padding = new Padding(12, 8, 0, 0) });
        includePassive.CheckedChanged += (_, _) => LoadPersonnel();
        personGrid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) OpenSelectedPerson(); };
        page.Controls.Add(personGrid); page.Controls.Add(bar); return page;
    }

    TabPage BuildAttendanceTab()
    {
        var page = new TabPage("Giriş-Çıkış / E") { Padding = new Padding(8) };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44 };
        bar.Controls.Add(Label("Kart")); bar.Controls.Add(card); bar.Controls.Add(attendanceMonth);
        bar.Controls.Add(Btn("Ayı Getir", LoadAttendance, true));
        bar.Controls.Add(Label("Gün")); bar.Controls.Add(editDay);
        bar.Controls.Add(Label("Giriş")); bar.Controls.Add(editEntry); bar.Controls.Add(Btn("Girişi E Yap", () => ApplyManual(true)));
        bar.Controls.Add(Label("Çıkış")); bar.Controls.Add(editExit); bar.Controls.Add(Btn("Çıkışı E Yap", () => ApplyManual(false)));
        page.Controls.Add(attendanceGrid); page.Controls.Add(bar); return page;
    }

    TabPage BuildBulkTab()
    {
        var page = new TabPage("Toplu İşlem") { Padding = new Padding(8) };
        var split = new SplitContainer { Dock = DockStyle.Fill, FixedPanel = FixedPanel.Panel1, SplitterDistance = 220 };
        split.Panel1.Controls.Add(days);
        var right = new Panel { Dock = DockStyle.Fill };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 46 };
        bar.Controls.Add(bulkMonth);
        bar.Controls.Add(Btn("Seçili Personel + Günlerden Liste Hazırla", PrepareBulk, true));
        bar.Controls.Add(Btn("Toplu Planı Kaydet", SaveBulkPlan));
        bar.Controls.Add(new Label { Text = "Giriş/Çıkış saatlerini satırlara girin; boş hücre işleme alınmaz.", AutoSize = true, Padding = new Padding(10, 8, 0, 0) });
        right.Controls.Add(bulkGrid); right.Controls.Add(bar);
        split.Panel2.Controls.Add(right); page.Controls.Add(split); return page;
    }

    TabPage BuildPayrollTab()
    {
        var page = new TabPage("Bordro") { Padding = new Padding(8) };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 44 };
        bar.Controls.Add(payrollMonth);
        bar.Controls.Add(Btn("Ay Bordrosunu Getir", LoadPayroll, true));
        bar.Controls.Add(Btn("CSV Aktar", ExportPayroll));
        bar.Controls.Add(new Label { Text = "Bordro canlı veriden okunur; değişiklikler burada önizleme/rapor olarak hazırlanır.", AutoSize = true, Padding = new Padding(12, 8, 0, 0) });
        page.Controls.Add(payrollGrid); page.Controls.Add(bar); return page;
    }

    static Button Btn(string text, Action action, bool primary = false)
    {
        var b = new Button
        {
            Text = text, AutoSize = true, Height = 32, FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(30, 45, 65)
        };
        b.Click += (_, _) => action(); return b;
    }

    void ApplySources()
    {
        db.DatabasePath = dbPath.Text.Trim();
        if (!string.IsNullOrWhiteSpace(password.Text)) db.Password = password.Text;
        tnf.FilePath = tnfPath.Text.Trim();
    }

    void ConnectAll()
    {
        try
        {
            ApplySources(); LoadPersonnel();
            status.Text = $"Bağlı | GDB: {db.DatabasePath} | TNF: {tnf.FilePath}";
        }
        catch (Exception ex) { Error(ex); }
    }

    void LoadPersonnel()
    {
        try
        {
            ApplySources();
            personGrid.DataSource = db.Personnel(includePassive.Checked);
            status.Text = $"Personel yüklendi: {personGrid.Rows.Count}";
        }
        catch (Exception ex) { Error(ex); }
    }

    void OpenSelectedPerson()
    {
        if (personGrid.CurrentRow?.Cells["PKNO"].Value is not object v) return;
        card.Text = Convert.ToString(v) ?? "";
        LoadAttendance();
    }

    void LoadAttendance()
    {
        try
        {
            ApplySources();
            attendanceGrid.DataSource = db.Attendance(card.Text.Trim(), attendanceMonth.Value);
            status.Text = $"{card.Text} giriş-çıkış yüklendi";
        }
        catch (Exception ex) { Error(ex); }
    }

    void ApplyManual(bool entry)
    {
        try
        {
            ApplySources();
            var time = (entry ? editEntry.Text : editExit.Text).Trim();
            if (!TimeOnly.TryParseExact(time, "HH:mm", out _)) throw new InvalidOperationException("Saat HH:mm biçiminde olmalı.");
            var count = tnf.FindSide(card.Text.Trim(), editDay.Value.Date, entry).Count;
            var side = entry ? "giriş" : "çıkış";
            var question = $"{card.Text} | {editDay.Value:dd.MM.yyyy} | {side} {time}\nHam TNF aynı taraf: {count}\nDevam?";
            if (MessageBox.Show(question, "E düzeltmesi", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            db.SetManualSide(card.Text.Trim(), editDay.Value.Date, entry, time);
            status.Text = new TnfOverrideStore(tnf).SupersedeSingle(card.Text.Trim(), editDay.Value.Date, entry, "Manuel E düzeltmesi");
            LoadAttendance();
        }
        catch (Exception ex) { Error(ex); }
    }

    void PrepareBulk()
    {
        try
        {
            bulkGrid.DataSource = BulkPlanner.Prepare(personGrid, days);
            status.Text = $"Toplu önizleme hazır: {bulkGrid.Rows.Count} kişi-gün";
        }
        catch (Exception ex) { Error(ex); }
    }

    void SaveBulkPlan()
    {
        try
        {
            if (bulkGrid.DataSource is not DataTable table) throw new InvalidOperationException("Önce toplu listeyi hazırlayın.");
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "HKN PDKS Toplu Planlar");
            var path = BulkPlanExporter.Save(table, folder);
            status.Text = $"Toplu plan kaydedildi: {path}";
        }
        catch (Exception ex) { Error(ex); }
    }

    void LoadPayroll()
    {
        try
        {
            ApplySources();
            payrollGrid.DataSource = db.Payroll(payrollMonth.Value);
            status.Text = $"Bordro yüklendi: {payrollGrid.Rows.Count} kayıt";
        }
        catch (Exception ex) { Error(ex); }
    }

    void ExportPayroll()
    {
        try
        {
            if (payrollGrid.DataSource is not DataTable table) throw new InvalidOperationException("Önce bordroyu yükleyin.");
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "HKN PDKS Bordro Raporları");
            var path = CsvExporter.Save(table, folder, "BORDRO");
            status.Text = $"Bordro CSV kaydedildi: {path}";
        }
        catch (Exception ex) { Error(ex); }
    }

    void PickDb()
    {
        using var d = new OpenFileDialog { Filter = "Firebird veritabanı (*.gdb)|*.gdb|Tüm dosyalar (*.*)|*.*", FileName = dbPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) dbPath.Text = d.FileName;
    }

    void PickTnf()
    {
        using var d = new OpenFileDialog { Filter = "Terminal datası (*.tnf;*.txt)|*.tnf;*.txt|Tüm dosyalar (*.*)|*.*", FileName = tnfPath.Text };
        if (d.ShowDialog(this) == DialogResult.OK) tnfPath.Text = d.FileName;
    }

    void Error(Exception ex)
    {
        status.Text = ex.Message;
        MessageBox.Show(ex.Message, "HKN PDKS Hızlı İşlem", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}
