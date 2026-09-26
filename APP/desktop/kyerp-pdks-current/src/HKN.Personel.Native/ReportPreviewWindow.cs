using System.Data;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal sealed class ReportPreviewWindow : Form
{
    readonly ReportTable report;
    readonly bool landscape;
    readonly DataGridView grid = new();

    public ReportPreviewWindow(ReportTable report, bool landscape)
    {
        this.report = report;
        this.landscape = landscape;
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
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.BackgroundColor = Color.White;
        grid.DataSource = ToTable(report);
        root.Controls.Add(grid, 0, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0) };
        actions.Controls.Add(Action("Kapat", Close, 100));
        actions.Controls.Add(Action("Excel Aktar", () => Export(true), 120));
        actions.Controls.Add(Action("PDF Aktar", () => Export(false), 120));
        actions.Controls.Add(Action("Yazdır", () => ReportPrintHelper.Print(this, report, landscape), 104, true));
        root.Controls.Add(actions, 0, 2);
        Controls.Add(root);
        PdksTheme.Apply(this);
    }

    static Button Action(string text, Action action, int width, bool primary = false)
    {
        var b = new Button { Text = text, Width = width, Height = 36, FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(36, 107, 230) : Color.White,
            ForeColor = primary ? Color.White : Color.FromArgb(27, 44, 68), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
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
        if (excel) ReportExporter.ExportExcel(save.FileName, report);
        else ReportExporter.ExportPdf(save.FileName, report);
        MessageBox.Show("Rapor oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    static DataTable ToTable(ReportTable report)
    {
        var table = new DataTable();
        foreach (var column in report.Columns) table.Columns.Add(column);
        foreach (var row in report.Rows) table.Rows.Add(row.Cast<object>().ToArray());
        return table;
    }

    static string SafeFileName(string value) =>
        string.Concat(value.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
}
