namespace QuickDataTool;

public sealed class PayrollEditForm : Form
{
    readonly Dictionary<string, TextBox> boxes = new();
    public static readonly string[] Fields =
    [
        "DMAAS","GUN1","SAAT1","UCRET1","NCGUN","NCSAAT","NCUCRET","NCODENEN",
        "FMSAAT","FMUCRET","FMODENEN","GUN4","SAAT4","UCRET4","DEVS","DEVG","DEVU",
        "EKKES","EKKAZ","YOLU","YEMEKU","DEVIR","MESAIKESINTIS"
    ];

    public string Get(string key) => boxes.TryGetValue(key, out var b) ? b.Text.Trim() : "";

    public PayrollEditForm(string card, DataGridViewRow row)
    {
        var person = $"{Cell(row,"AD")} {Cell(row,"SOYAD")}".Trim();
        Text = $"Bordro Düzenle - {card} {person}";
        Width = 760; Height = 680; StartPosition = FormStartPosition.CenterParent; BackColor=Color.FromArgb(244,248,253); Font=new Font("Segoe UI",9.5f);
        var root = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=2, ColumnCount=1 };
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var tabs = new TabControl { Dock=DockStyle.Fill, Font=new Font("Segoe UI Semibold",9.5f), Padding=new Point(14,6) };
        tabs.TabPages.Add(Page("Çalışma", row, ["DMAAS","GUN1","SAAT1","UCRET1","NCGUN","NCSAAT","NCUCRET"]));
        tabs.TabPages.Add(Page("Mesai / Ödeme", row, ["NCODENEN","FMSAAT","FMUCRET","FMODENEN"]));
        tabs.TabPages.Add(Page("İzin / Devamsızlık", row, ["GUN4","SAAT4","UCRET4","DEVG","DEVS","DEVU"]));
        tabs.TabPages.Add(Page("Kazanç / Kesinti", row, ["EKKAZ","EKKES","YOLU","YEMEKU","DEVIR","MESAIKESINTIS"]));
        root.Controls.Add(tabs,0,0);
        var ok = new Button { Text="Kaydet", DialogResult=DialogResult.OK, Width=120, Height=36, FlatStyle=FlatStyle.Flat, BackColor=Color.FromArgb(226,247,235), ForeColor=Color.FromArgb(18,122,72), Font=new Font("Segoe UI Semibold",9f) }; ok.FlatAppearance.BorderSize=0;
        var cancel = new Button { Text="Vazgeç", DialogResult=DialogResult.Cancel, Width=120, Height=36, FlatStyle=FlatStyle.Flat, BackColor=Color.FromArgb(231,241,253), ForeColor=Color.FromArgb(24,80,153), Font=new Font("Segoe UI Semibold",9f) }; cancel.FlatAppearance.BorderSize=0;
        var bar = new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.RightToLeft, Padding=new Padding(8) };
        bar.Controls.Add(ok); bar.Controls.Add(cancel); root.Controls.Add(bar,0,1);
        Controls.Add(root); AcceptButton=ok; CancelButton=cancel;
    }

    TabPage Page(string title, DataGridViewRow row, string[] fields)
    {
        var page = new TabPage(title) { BackColor=Color.White, Padding=new Padding(6) };
        var grid = new TableLayoutPanel { Dock=DockStyle.Fill, Padding=new Padding(18), ColumnCount=2, AutoScroll=true };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,210)); grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        foreach (var field in fields)
        {
            var b = new TextBox { Dock=DockStyle.Top, Text=Cell(row,field), BorderStyle=BorderStyle.FixedSingle, Font=new Font("Segoe UI",9.5f) }; boxes[field]=b;
            grid.Controls.Add(new Label { Text=LabelFor(field), Dock=DockStyle.Top, Height=30, TextAlign=ContentAlignment.MiddleLeft },0,grid.RowCount);
            grid.Controls.Add(b,1,grid.RowCount); grid.RowCount++;
        }
        page.Controls.Add(grid); return page;
    }

    static string Cell(DataGridViewRow row, string key) => row.DataGridView?.Columns.Contains(key)==true ? Convert.ToString(row.Cells[key].Value) ?? "" : "";
    static string LabelFor(string key) => key switch
    {
        "DMAAS"=>"Maaş", "GUN1"=>"Normal Gün", "SAAT1"=>"Normal Saat", "UCRET1"=>"Normal Tutar",
        "NCGUN"=>"Toplam Gün", "NCSAAT"=>"Toplam Saat", "NCUCRET"=>"Ödenecek Tutar", "NCODENEN"=>"Ödenen Tutar",
        "FMSAAT"=>"Fazla Mesai Saat", "FMUCRET"=>"Fazla Mesai Tutar", "FMODENEN"=>"Mesai Ödenen",
        "GUN4"=>"Ücretsiz İzin Gün", "SAAT4"=>"Ücretsiz İzin Saat", "UCRET4"=>"Ücretsiz İzin Tutar",
        "DEVG"=>"Devamsızlık Gün", "DEVS"=>"Devamsızlık Saat", "DEVU"=>"Devamsızlık Tutar",
        "EKKAZ"=>"Ek Kazanç", "EKKES"=>"Kesinti", "YOLU"=>"Yol", "YEMEKU"=>"Yemek", "DEVIR"=>"Devir",
        "MESAIKESINTIS"=>"Mesai Kesinti Saati",
        _=>key
    };
}
