namespace QuickDataTool;

public sealed class RecordEditForm : Form
{
    readonly Dictionary<string, TextBox> boxes = new();
    public string Get(string key) => boxes[key].Text.Trim();
    public RecordEditForm(string title, DataGridViewRow row, params string[] fields)
    {
        Text = title; Width = 560; Height = Math.Min(720, 130 + fields.Length * 42); StartPosition = FormStartPosition.CenterParent;
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, AutoScroll = true };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 190)); grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var field in fields)
        {
            var b = new TextBox { Dock = DockStyle.Top, Text = row.DataGridView?.Columns.Contains(field) == true ? Convert.ToString(row.Cells[field].Value) ?? "" : "" }; boxes[field] = b;
            grid.Controls.Add(new Label { Text = field, Dock = DockStyle.Top, Height = 28 }, 0, grid.RowCount); grid.Controls.Add(b, 1, grid.RowCount); grid.RowCount++;
        }
        var ok = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 110 }; var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 110 };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.RightToLeft, Height = 45 }; bar.Controls.Add(ok); bar.Controls.Add(cancel);
        grid.Controls.Add(bar, 0, grid.RowCount); grid.SetColumnSpan(bar, 2); Controls.Add(grid); AcceptButton = ok; CancelButton = cancel;
    }
}
