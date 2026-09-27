using System.Data;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal sealed class ReportPreviewWindow : Form
{
    readonly ReportTable report;
    readonly bool landscape;
    readonly IReadOnlyList<int>? sourceWidths;
    readonly DataGridView grid = new();

    public ReportPreviewWindow(ReportTable report, bool landscape, IReadOnlyList<int>? sourceWidths = null)
    {
        this.report = report;
        this.landscape = landscape;
        this.sourceWidths = sourceWidths;
        Text = report.Title + " • Önizleme";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1180, 760);
        MinimumSize = new Size(900, 620);
        BackColor = Color.FromArgb(246, 249, 253);
        Font = new Font("Segoe UI", 9f);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, Padding = new Padding(14) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 78));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));

        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(18, 10, 18, 8) };
        header.Controls.Add(new Label
        {
            Text = report.Title,
            AutoSize = true,
            Location = new Point(18, 12),
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            ForeColor = Color.FromArgb(27, 44, 68)
        });
        header.Controls.Add(new Label
        {
            Text = $"KY ERP • PDKS   •   {report.Rows.Count} kayıt   •   {DateTime.Now:dd.MM.yyyy HH:mm}",
            AutoSize = true,
            Location = new Point(20, 47),
            ForeColor = Color.FromArgb(88, 103, 124)
        });
        root.Controls.Add(header, 0, 0);

        grid.Dock = DockStyle.Fill;
        grid.ReadOnly = true;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.AllowUserToOrderColumns = true;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
        grid.BackgroundColor = Color.White;
        grid.DataSource = ToTable(report);
        if (sourceWidths is not null && sourceWidths.Count == grid.Columns.Count)
            for (var i = 0; i < grid.Columns.Count; i++) grid.Columns[i].Width = Math.Clamp(sourceWidths[i], 35, 800);
        else
            foreach (DataGridViewColumn c in grid.Columns) c.Width = Math.Max(80, c.Width);
        root.Controls.Add(grid, 0, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0) };
        actions.Controls.Add(Action("Kapat", Close, 100));
        actions.Controls.Add(Action("CSV Aktar", ExportCsv, 110));
        actions.Controls.Add(Action("Excel Aktar", () => Export(true), 120));
        actions.Controls.Add(Action("PDF Aktar", () => Export(false), 120));
        actions.Controls.Add(Action("Yazdır", () => ReportPrintHelper.Print(this, report, landscape, CurrentWidths()), 104, true));
        root.Controls.Add(actions, 0, 2);
        Controls.Add(root);
        PdksTheme.Apply(this);
    }

    IReadOnlyList<int> CurrentWidths() => grid.Columns.Cast<DataGridViewColumn>().OrderBy(c => c.DisplayIndex).Select(c => c.Width).ToArray();

    static Button Action(string text, Action action, int width, bool primary = false)
    {
        var b = new Button
        {
            Text = text, Width = width, Height = 36, FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(27, 44, 68),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold)
        };
        b.FlatAppearance.BorderColor = primary ? b.BackColor : Color.FromArgb(216, 225, 236);
        b.Click += (_, _) => action();
        return b;
    }

    void Export(bool excel)
    {
        using var save = new SaveFileDialog
        {
            Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf",
            DefaultExt = excel ? "xlsx" : "pdf",
            FileName = SafeFileName(report.Title) + "-" + DateTime.Now.ToString("yyyyMMdd-HHmm")
        };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        var current = GridReportAdapter.ToReport(grid, ToTable(report), report.Title);
        if (excel) ReportExporter.ExportExcel(save.FileName, current);
        else ReportExporter.ExportPdf(save.FileName, current);
        MessageBox.Show("Rapor oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    void ExportCsv()
    {
        using var save = new SaveFileDialog { Filter = "CSV (*.csv)|*.csv", DefaultExt = "csv", FileName = SafeFileName(report.Title) + "-" + DateTime.Now.ToString("yyyyMMdd-HHmm") };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        var table = ToTable(report);
        var current = GridReportAdapter.ToReport(grid, table, report.Title);
        using var sw = new StreamWriter(save.FileName, false, new System.Text.UTF8Encoding(true));
        sw.WriteLine(string.Join(";", current.Columns.Select(Csv)));
        foreach (var row in current.Rows) sw.WriteLine(string.Join(";", row.Select(Csv)));
        MessageBox.Show("CSV oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    static string Csv(string value) => "\"" + (value ?? string.Empty).Replace("\"", "\"\"") + "\"";

    static DataTable ToTable(ReportTable report)
    {
        var table = new DataTable();
        foreach (var column in report.Columns) table.Columns.Add(column);
        foreach (var row in report.Rows) table.Rows.Add(row.Cast<object>().ToArray());
        return table;
    }

    static string SafeFileName(string value) => string.Concat(value.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
}
