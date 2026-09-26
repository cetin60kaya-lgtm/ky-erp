namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    readonly Dictionary<string, TextBox> boxes = new();
    public decimal Maas => D("DMAAS"); public decimal Gun => D("GUN1"); public string Saat => S("SAAT1"); public decimal Ucret => D("UCRET1");
    public decimal NGun => D("NCGUN"); public string NSaat => S("NCSAAT"); public decimal NUcret => D("NCUCRET");
    public decimal DevGun => D("DEVG"); public decimal DevUcret => D("DEVU"); public decimal EkKaz => D("EKKAZ"); public decimal EkKes => D("EKKES"); public decimal Odenen => D("NCODENEN");

    public PayrollEditForm(string card, DataGridViewRow row)
    {
        Text = $"Bordro Düzenle - {card}"; Width = 520; Height = 620; StartPosition = FormStartPosition.CenterParent;
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, AutoScroll = true };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170)); grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        string[] fields = ["DMAAS","GUN1","SAAT1","UCRET1","NCGUN","NCSAAT","NCUCRET","DEVG","DEVU","EKKAZ","EKKES","NCODENEN"];
        foreach (var field in fields)
        {
            var b = new TextBox { Dock = DockStyle.Top, Text = Convert.ToString(row.Cells[field].Value) ?? "" }; boxes[field] = b;
            grid.Controls.Add(new Label { Text = field, Dock = DockStyle.Top, Height = 28 }, 0, grid.RowCount);
            grid.Controls.Add(b, 1, grid.RowCount); grid.RowCount++;
        }
        var ok = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 110 }; var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 110 };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.RightToLeft, Height = 45 }; bar.Controls.Add(ok); bar.Controls.Add(cancel);
        grid.Controls.Add(bar, 0, grid.RowCount); grid.SetColumnSpan(bar, 2); Controls.Add(grid); AcceptButton = ok; CancelButton = cancel;
    }
    string S(string key) => boxes[key].Text.Trim();
    decimal D(string key)
    {
        if (decimal.TryParse(boxes[key].Text, out var value)) return value;
        throw new InvalidOperationException($"{key} sayısal olmalı.");
    }
}
