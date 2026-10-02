using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class QuickDataSourceForm : Form
{
    readonly TextBox gdb = new() { Dock = DockStyle.Fill };
    readonly TextBox terminal = new() { Dock = DockStyle.Fill };
    readonly Label status = new() { Dock = DockStyle.Fill, AutoSize = true };
    readonly DataGridView grid = new() { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill };

    public QuickDataSourceForm()
    {
        Text = "Hızlı Veri Kaynakları";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1000, 650);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += (_, _) => Detect();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), RowCount = 4, ColumnCount = 1, BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 90)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(SourceRow("Canlı şirket veritabanı (.FDB)", gdb, PickGdb), 0, 0);
        root.Controls.Add(SourceRow("Terminal / denetim datası (.Tnf / .txt)", terminal, PickTerminal), 0, 1);
        var bar = PdksUiKit.ActionBar(false,p.Canvas);
        bar.Controls.Add(Button("Otomatik Tanı", Detect)); bar.Controls.Add(Button("Kaynakları Kontrol Et", Inspect)); bar.Controls.Add(status);
        root.Controls.Add(bar, 0, 2); root.Controls.Add(grid, 0, 3); Controls.Add(root);
    }

    static Control SourceRow(string caption, TextBox box, Action pick)
    {
        var p = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2, BackColor=PdksAppearance.Current.Surface, Padding=new Padding(12,6,12,6) };
        p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        p.Controls.Add(new Label { Text = caption, Dock = DockStyle.Fill, TextAlign = ContentAlignment.BottomLeft, Font = new Font("Segoe UI", 9f, FontStyle.Bold) }, 0, 0);
        p.SetColumnSpan(p.Controls[^1], 2); p.Controls.Add(box, 0, 1); p.Controls.Add(Button("Dosya Seç", pick), 1, 1); return p;
    }
    static Button Button(string text, Action action)
    {
        var width=Math.Max(96,TextRenderer.MeasureText(text,new Font("Segoe UI",8.8f,FontStyle.Bold)).Width+24);
        return PdksUiKit.Button(text,width,text.Contains("Kontrol",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Primary:PdksActionRole.Secondary,action);
    }

    void Detect()
    {
        var o = PdksOptions.FromEnvironment();
        CompanyDataPaths.Ensure();
        gdb.Text = File.Exists(o.DatabasePath) ? o.DatabasePath : CompanyDataPaths.Database;
        var root = Directory.GetParent(Path.GetDirectoryName(gdb.Text) ?? "")?.FullName ?? @"C:\Hedef500";
        var temp = CompanyDataPaths.Tnf;
        terminal.Text = Directory.Exists(temp) ? Directory.GetFiles(temp, "TR*.Tnf").OrderByDescending(x => x).FirstOrDefault() ?? CompanyDataPaths.CurrentTnf : CompanyDataPaths.CurrentTnf;
        Inspect();
    }

    void PickGdb()
    {
        using var d = new OpenFileDialog { Filter = "Firebird veritabanı (*.fdb;*.gdb)|*.fdb;*.gdb|Tüm dosyalar (*.*)|*.*", FileName = gdb.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { gdb.Text = d.FileName; Inspect(); }
    }

    void PickTerminal()
    {
        using var d = new OpenFileDialog { Filter = "Terminal datası (*.tnf;*.txt)|*.tnf;*.txt|Tüm dosyalar (*.*)|*.*", FileName = terminal.Text };
        if (d.ShowDialog(this) == DialogResult.OK) { terminal.Text = d.FileName; Inspect(); }
    }

    void Inspect()
    {
        var t = new System.Data.DataTable(); t.Columns.Add("Kaynak"); t.Columns.Add("Yol"); t.Columns.Add("Durum"); t.Columns.Add("Boyut / Satır");
        var gf = new FileInfo(gdb.Text); t.Rows.Add("Şirket FDB", gdb.Text, gf.Exists ? "Hazır" : "Bulunamadı", gf.Exists ? $"{gf.Length:N0} bayt" : "-");
        var tf = new FileInfo(terminal.Text); var lines = tf.Exists ? File.ReadLines(tf.FullName).Count() : 0;
        t.Rows.Add("Terminal/TNF", terminal.Text, tf.Exists ? "Hazır" : "Bulunamadı", tf.Exists ? $"{lines:N0} satır" : "-");
        grid.DataSource = t; status.Text = gf.Exists && tf.Exists ? "  İki kaynak da hazır" : "  Kaynak seçimi gerekli";
    }
}
