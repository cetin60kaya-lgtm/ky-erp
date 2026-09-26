namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    readonly Dictionary<string, TextBox> boxes = new();
    public static readonly string[] Fields =
    [
        "DMAAS","GUN1","SAAT1","UCRET1","GUN2","SAAT2","UCRET2","GUN3","SAAT3","UCRET3","GUN4","SAAT4","UCRET4",
        "GUN5","SAAT5","UCRET5","GUN6","SAAT6","UCRET6","GUN7","SAAT7","UCRET7","GUN8","SAAT8","UCRET8","GUN9","SAAT9","UCRET9","GUN10","SAAT10","UCRET10",
        "NCGUN","NCSAAT","NCUCRET","NCODENEN","FMSAAT","FMUCRET","FMODENEN","DEVS","DEVG","DEVU","DEVCEZAS","DEVCEZAU",
        "ERS","ERG","ERU","ERCEZAS","ERCEZAU","GECS","GECG","GECU","GECCEZAS","GECCEZAU","EKS","EKG","EKU","EKCEZAS","EKCEZAU",
        "AYS","AYU","TOPEKS","YOLU","YEMEKU","DEVIR","EX1","EX2","EX3","EX4","EX5","EX6","EKKES","EKKAZ","SSKG","BOLUM","MESAIKESINTIS"
    ];
    public string Get(string key) => boxes[key].Text.Trim();

    public PayrollEditForm(string card, DataGridViewRow row)
    {
        Text = $"Bordro Düzenle - {card}"; Width = 760; Height = 760; StartPosition = FormStartPosition.CenterParent;
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, AutoScroll = true };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210)); grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var field in Fields)
        {
            var text = row.DataGridView?.Columns.Contains(field) == true ? Convert.ToString(row.Cells[field].Value) ?? "" : "";
            var b = new TextBox { Dock = DockStyle.Top, Text = text }; boxes[field] = b;
            grid.Controls.Add(new Label { Text = field, Dock = DockStyle.Top, Height = 28 }, 0, grid.RowCount); grid.Controls.Add(b, 1, grid.RowCount); grid.RowCount++;
        }
        var ok = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 120 };
        var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120 };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.RightToLeft, Height = 48 }; bar.Controls.Add(ok); bar.Controls.Add(cancel);
        grid.Controls.Add(bar, 0, grid.RowCount); grid.SetColumnSpan(bar, 2);
        Controls.Add(grid); AcceptButton = ok; CancelButton = cancel;
    }
}
