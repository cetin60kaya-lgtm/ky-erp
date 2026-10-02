using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public enum LegacyOperationalReport
{
    PersonnelList,
    LeavePersonnel,
    EarningsDeductions,
    PersonnelCountByWorkSystem,
    AnnualLeaveEntitlements
}

public sealed class LegacyOperationalReportForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly LegacyOperationalReport report;
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly DataGridView grid = new()
    {
        Name = "OperationalReportGrid",
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AllowUserToOrderColumns = true,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
        BackgroundColor = Color.White
    };
    DataTable data = new();
    string LayoutKey => "operational-report-" + report;

    public LegacyOperationalReport Report => report;
    public static string Title(LegacyOperationalReport r) => r switch
    {
        LegacyOperationalReport.PersonnelList => "Personel Listesi",
        LegacyOperationalReport.LeavePersonnel => "İzinli Personel Raporu",
        LegacyOperationalReport.EarningsDeductions => "Ek Kazanç ve Kesinti Raporu",
        LegacyOperationalReport.PersonnelCountByWorkSystem => "Çalışma Sistemine Göre Personel",
        LegacyOperationalReport.AnnualLeaveEntitlements => "Yıllık İzin Hakedişleri",
        _ => "Rapor"
    };

    public LegacyOperationalReportForm(LegacyOperationalReport report)
    {
        this.report = report;
        Text = Title(report);
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1180, 720);
        MinimumSize = new Size(900, 600);
        Font = new Font("Segoe UI", 9f);
        from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        to.Value = DateTime.Today;
        Build();
        Shown += (_, _) =>
        {
            GridLayoutPersistence.Attach(grid, LayoutKey);
            LoadData();
        };
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(12) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 8, 0, 0), WrapContents = false };
        filter.Controls.Add(new Label { Text = "Tarih Aralığı", AutoSize = true, Padding = new Padding(0, 7, 8, 0) });
        filter.Controls.Add(from);
        filter.Controls.Add(new Label { Text = "—", AutoSize = true, Padding = new Padding(6, 7, 6, 0) });
        filter.Controls.Add(to);
        var show = new Button { Text = "Göster", Width = 90, Height = 32 };
        show.Click += (_, _) => LoadData();
        filter.Controls.Add(show);
        var fields = new Button { Text = "Alanlar / Sıralama", Width = 145, Height = 32 };
        fields.Click += (_, _) => GridLayoutPersistence.ShowEditor(this, grid, LayoutKey, Text + " • Alanlar / Sıralama");
        filter.Controls.Add(fields);
        root.Controls.Add(filter, 0, 0);
        root.Controls.Add(grid, 0, 1);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0) };
        actions.Controls.Add(Button("Excel Aktar", () => Export(true)));
        actions.Controls.Add(Button("PDF Aktar", () => Export(false)));
        actions.Controls.Add(Button("Yazdır", Print));
        actions.Controls.Add(Button("Önizle", Preview));
        root.Controls.Add(actions, 0, 2);
        Controls.Add(root);
    }

    static Button Button(string text, Action action)
    {
        var b = new Button { Text = text, Width = 110, Height = 34 };
        b.Click += (_, _) => action();
        return b;
    }

    void LoadData()
    {
        try
        {
            data = Query();
            LocalizeColumns(data);
            grid.DataSource = data;
            foreach (DataGridViewColumn c in grid.Columns)
            {
                if (c.Width < 70)
                    c.Width = c.HeaderText.Contains("Ad", StringComparison.OrdinalIgnoreCase) ? 140 : 90;
            }
            GridLayoutPersistence.Apply(grid, LayoutKey);
        }
        catch (Exception ex)
        {
            PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"OperationalReport");
        }
    }

    DataTable Query()
    {
        var a = from.Value.Date;
        var b = to.Value.Date.AddDays(1);
        return report switch
        {
            LegacyOperationalReport.PersonnelList => db.Query(
                "select k.PKNO KARTNO,k.AD ADI,k.SOYAD SOYADI,k.IGTARIH ISEGIRIS,k.ICTARIH ISTENCIKIS,k.MAAS MAAS,b.AD BOLUM,s.AD SERVIS,g.AD GOREV " +
                "from KIMLIK k left join BOLUM b on b.KOD=k.BOLUM left join SERVIS s on s.KOD=k.SERVIS left join GOREV g on g.KOD=k.GOREV order by k.PKNO"),

            LegacyOperationalReport.LeavePersonnel => db.Query(
                "select o.TARIH TARIH,o.PKNO KARTNO,k.AD ADI,k.SOYAD SOYADI,o.MAZERET MAZERET,o.TIP TIP,o.SURESAAT SURE,o.BASSAAT BASLANGIC,o.BITSAAT BITIS " +
                "from OZELIZIN o left join KIMLIK k on k.PKNO=o.PKNO where o.TARIH>=@A and o.TARIH<@B order by o.TARIH,o.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b)),

            LegacyOperationalReport.EarningsDeductions => db.Query(
                "select a.TARIH TARIH,a.PKNO KARTNO,k.AD ADI,k.SOYAD SOYADI,v.TUR TUR,v.ISARET ISARET,a.MIKTAR MIKTAR,a.ACIKLAMA ACIKLAMA " +
                "from AVANS a left join KIMLIK k on k.PKNO=a.PKNO left join AVTUR v on v.KOD=a.TURKOD where a.TARIH>=@A and a.TARIH<@B order by a.TARIH,a.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b)),

            LegacyOperationalReport.PersonnelCountByWorkSystem => db.Query(
                "select coalesce(p.AD,'Tanimsiz') CALISMASISTEMI,count(*) PERSONELSAYISI from KIMLIK k left join PUANBILGI p on p.KOD=k.PUANTAJ group by p.AD order by p.AD"),

            LegacyOperationalReport.AnnualLeaveEntitlements => db.Query(
                "select PKNO KARTNO,AD ADI,SOYAD SOYADI,IGTARIH ISEGIRIS,coalesce(KULIZIN,0) IZINHAKKI from KIMLIK order by PKNO"),

            _ => new DataTable()
        };
    }

    static void LocalizeColumns(DataTable table)
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["KARTNO"] = "Kart No",
            ["ADI"] = "Ad",
            ["SOYADI"] = "Soyad",
            ["ISEGIRIS"] = "İşe Giriş",
            ["ISTENCIKIS"] = "İşten Çıkış",
            ["MAAS"] = "Maaş",
            ["BOLUM"] = "Bölüm",
            ["SERVIS"] = "Servis",
            ["GOREV"] = "Görev",
            ["TARIH"] = "Tarih",
            ["MAZERET"] = "Mazeret",
            ["TIP"] = "Tür",
            ["SURE"] = "Süre",
            ["BASLANGIC"] = "Başlangıç",
            ["BITIS"] = "Bitiş",
            ["TUR"] = "Tür",
            ["ISARET"] = "İşaret",
            ["MIKTAR"] = "Miktar",
            ["ACIKLAMA"] = "Açıklama",
            ["CALISMASISTEMI"] = "Çalışma Sistemi",
            ["PERSONELSAYISI"] = "Personel Sayısı",
            ["IZINHAKKI"] = "İzin Hakedişi"
        };
        foreach (DataColumn column in table.Columns)
            if (names.TryGetValue(column.ColumnName.Trim(), out var localized)) column.ColumnName = localized;
    }

    ReportTable Table() => GridReportAdapter.ToReport(grid, data, $"{Text} • {from.Value:dd.MM.yyyy} - {to.Value:dd.MM.yyyy}");
    IReadOnlyList<int> Widths() => GridReportAdapter.VisibleWidths(grid);

    void Preview()
    {
        try { LoadData(); ReportPrintHelper.Preview(this, Table(), grid.Columns.Cast<DataGridViewColumn>().Count(c => c.Visible) > 7, Widths()); }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"OperationalReport"); }
    }

    void Print()
    {
        try { LoadData(); ReportPrintHelper.Print(this, Table(), grid.Columns.Cast<DataGridViewColumn>().Count(c => c.Visible) > 7, Widths()); }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"OperationalReport"); }
    }

    void Export(bool excel)
    {
        try
        {
            LoadData();
            using var save = new SaveFileDialog
            {
                Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf",
                DefaultExt = excel ? "xlsx" : "pdf",
                FileName = Text.Replace(' ', '-') + "-" + DateTime.Now.ToString("yyyyMMdd-HHmm")
            };
            if (save.ShowDialog(this) != DialogResult.OK) return;
            if (excel) ReportExporter.ExportExcel(save.FileName, Table()); else ReportExporter.ExportPdf(save.FileName, Table());
        }
        catch (Exception ex) { PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"OperationalReport"); }
    }
}
