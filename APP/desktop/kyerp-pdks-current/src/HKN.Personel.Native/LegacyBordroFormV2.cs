using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class LegacyBordroForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker period = new() { Format = DateTimePickerFormat.Custom, CustomFormat = "MMMM yyyy", ShowUpDown = true, Width = 145 };
    readonly ComboBox type = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 180 };
    readonly DataGridView grid = new() { Name = "BordroGrid", Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToOrderColumns = true, AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None, BackgroundColor = Color.White };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(8, 9, 8, 0) };
    DataTable data = new();
    string LayoutKey => "bordro-" + (type.SelectedItem?.ToString() ?? "genel").Replace(' ', '-');

    public LegacyBordroForm()
    {
        Text = "Bordro";
        Size = new Size(1360, 760);
        MinimumSize = new Size(1000, 620);
        Font = new Font("Segoe UI", 9f);
        type.Items.AddRange(["Genel Maaş Bordrosu", "Mesai Bordrosu", "Maaş Pusulası"]);
        type.SelectedIndex = 0;
        period.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        Build();
        Shown += (_, _) => { GridLayoutPersistence.Attach(grid, LayoutKey); LoadData(); };
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(12) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 8, 0, 0), WrapContents = false };
        top.Controls.Add(new Label { Text = "Dönem", AutoSize = true, Padding = new Padding(0, 8, 4, 0) });
        top.Controls.Add(period);
        top.Controls.Add(new Label { Text = "Bordro Türü", AutoSize = true, Padding = new Padding(10, 8, 4, 0) });
        top.Controls.Add(type);
        top.Controls.Add(Btn("Göster", LoadData, 90));
        top.Controls.Add(Btn("Alanlar / Sıralama", () => GridLayoutPersistence.ShowEditor(this, grid, LayoutKey, "Bordro Alanları / Sıralama"), 145));
        top.Controls.Add(Btn("Düzeni Kilitle", ToggleLock, 125));
        top.Controls.Add(summary);
        root.Controls.Add(top, 0, 0);
        root.Controls.Add(grid, 0, 1);
        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0) };
        bottom.Controls.Add(Btn("Excel Aktar", () => Export(true), 118));
        bottom.Controls.Add(Btn("PDF Aktar", () => Export(false), 118));
        bottom.Controls.Add(Btn("Yazdır", Print, 104));
        bottom.Controls.Add(Btn("Önizle", Preview, 104));
        root.Controls.Add(bottom, 0, 2);
        Controls.Add(root);
        type.SelectedIndexChanged += (_, _) => { if (IsHandleCreated) { GridLayoutPersistence.Apply(grid, LayoutKey); LoadData(); } };
        period.ValueChanged += (_, _) => { if (IsHandleCreated) LoadData(); };
    }

    static Button Btn(string text, Action action, int width)
    {
        var b = new Button { Text = text, Width = width, Height = 34 };
        b.Click += (_, _) => action();
        return b;
    }

    void LoadData()
    {
        try
        {
            var a = new DateTime(period.Value.Year, period.Value.Month, 1);
            var b = a.AddMonths(1);
            data = db.Query(
                "select u.PKNO \"Kart No\",k.IGTARIH \"İ.G.T\",trim(coalesce(k.AD,'')||' '||coalesce(k.SOYAD,'')) \"Ad Soyad\"," +
                "u.DMAAS Maaş,u.GUN1 \"Normal Gün\",u.SAAT1 \"Normal Saat\",u.SAAT2 \"%50 Mesai Saat\",u.SAAT3 \"%100 Mesai Saat\"," +
                "u.GUN4 \"Ücretsiz İzin Gün\",u.GUN5 \"Ücretli İzin Gün\",u.GUN9 \"Yıllık İzin Gün\",u.DEVG \"Devamsız Gün\",u.DEVS \"Devamsız Saat\",u.GECS \"Geç Saat\",u.EKS \"Eksik Saat\"," +
                "u.EX1 Avans,u.EX2 Banka,u.EX3 BES,u.EX4 İcra,u.NCKALAN \"Maaş Ödeme\",u.FMKALAN \"Mesai Ödeme\"," +
                "(coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0)) Toplam,((coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0))-coalesce(u.EX2,0)) Elden,cast('' as varchar(30)) İmza " +
                "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A order by u.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b));
            var serial = new DataColumn("S.No", typeof(int));
            data.Columns.Add(serial); serial.SetOrdinal(0);
            for (var i = 0; i < data.Rows.Count; i++) data.Rows[i][serial] = i + 1;
            grid.DataSource = data;
            foreach (DataGridViewColumn c in grid.Columns) c.Width = c.HeaderText == "Ad Soyad" ? 170 : c.HeaderText == "İmza" ? 120 : c.HeaderText == "S.No" ? 50 : 85;
            GridLayoutPersistence.Apply(grid, LayoutKey);
            var total = data.AsEnumerable().Sum(r => r["Toplam"] == DBNull.Value ? 0m : Convert.ToDecimal(r["Toplam"]));
            summary.Text = $"{data.Rows.Count} personel • {total:N2} ₺";
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void ToggleLock()
    {
        var locked = !GridLayoutPersistence.IsLocked(LayoutKey);
        GridLayoutPersistence.SetLocked(grid, LayoutKey, locked);
        MessageBox.Show(locked ? "Düzen kilitlendi." : "Düzen açıldı.", Text);
    }

    ReportTable Report()
    {
        var a = new DateTime(period.Value.Year, period.Value.Month, 1);
        var z = a.AddMonths(1).AddDays(-1);
        return GridReportAdapter.ToReport(grid, data, $"{a:dd.MM.yyyy} - {z:dd.MM.yyyy} {type.SelectedItem}");
    }

    IReadOnlyList<int> Widths() => GridReportAdapter.VisibleWidths(grid);
    void Preview() { LoadData(); ReportPrintHelper.Preview(this, Report(), true, Widths()); }
    void Print() { LoadData(); ReportPrintHelper.Print(this, Report(), true, Widths()); }

    void Export(bool excel)
    {
        LoadData();
        using var save = new SaveFileDialog { Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf", DefaultExt = excel ? "xlsx" : "pdf", FileName = $"{type.SelectedItem}-{period.Value:yyyyMM}".Replace(' ', '-') };
        if (save.ShowDialog(this) != DialogResult.OK) return;
        if (excel) ReportExporter.ExportExcel(save.FileName, Report()); else ReportExporter.ExportPdf(save.FileName, Report());
    }
}
