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
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
        BackgroundColor = Color.White
    };
    DataTable data = new();

    public LegacyOperationalReportForm(LegacyOperationalReport report)
    {
        this.report = report;
        Text = TitleFor(report);
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1180, 720);
        MinimumSize = new Size(900, 600);
        Font = new Font("Segoe UI", 9f);
        from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        to.Value = DateTime.Today;
        Build();
        Shown += (_, _) => LoadData();
    }

    static string TitleFor(LegacyOperationalReport r) => r switch
    {
        LegacyOperationalReport.PersonnelList => "Personel Listesi",
        LegacyOperationalReport.LeavePersonnel => "İzinli Personel Raporu",
        LegacyOperationalReport.EarningsDeductions => "Ek Kazanç ve Kesinti Raporu",
        LegacyOperationalReport.PersonnelCountByWorkSystem => "Çalışma Sistemine Göre Personel",
        LegacyOperationalReport.AnnualLeaveEntitlements => "Yıllık İzin Hakedişleri",
        _ => "Rapor"
    };

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(12) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(6, 8, 0, 0) };
        filter.Controls.Add(new Label { Text = "Tarih Aralığı", AutoSize = true, Padding = new Padding(0, 7, 8, 0) });
        filter.Controls.Add(from);
        filter.Controls.Add(new Label { Text = "—", AutoSize = true, Padding = new Padding(6, 7, 6, 0) });
        filter.Controls.Add(to);
        var show = new Button { Text = "Göster", Width = 90, Height = 32 };
        show.Click += (_, _) => LoadData();
        filter.Controls.Add(show);
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
            grid.DataSource = data;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    DataTable Query()
    {
        var a = from.Value.Date;
        var b = to.Value.Date.AddDays(1);
        return report switch
        {
            LegacyOperationalReport.PersonnelList => db.Query(
                "select k.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,k.IGTARIH \"İşe Giriş\",k.ICTARIH \"İşten Çıkış\",k.MAAS Maaş,b.AD Bölüm,s.AD Servis,g.AD Görev " +
                "from KIMLIK k left join BOLUM b on b.KOD=k.BOLUM left join SERVIS s on s.KOD=k.SERVIS left join GOREV g on g.KOD=k.GOREV order by k.PKNO"),

            LegacyOperationalReport.LeavePersonnel => db.Query(
                "select o.TARIH Tarih,o.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,o.MAZERET Mazeret,o.TIP Tür,o.SURESAAT Süre,o.BASSAAT Başlangıç,o.BITSAAT Bitiş " +
                "from OZELIZIN o left join KIMLIK k on k.PKNO=o.PKNO where o.TARIH>=@A and o.TARIH<@B order by o.TARIH,o.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b)),

            LegacyOperationalReport.EarningsDeductions => db.Query(
                "select a.TARIH Tarih,a.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,v.TUR Tür,v.ISARET İşaret,a.MIKTAR Miktar,a.ACIKLAMA Açıklama " +
                "from AVANS a left join KIMLIK k on k.PKNO=a.PKNO left join AVTUR v on v.KOD=a.TURKOD where a.TARIH>=@A and a.TARIH<@B order by a.TARIH,a.PKNO",
                new FbParameter("@A", a), new FbParameter("@B", b)),

            LegacyOperationalReport.PersonnelCountByWorkSystem => db.Query(
                "select coalesce(p.AD,'Tanımsız') \"Çalışma Sistemi\",count(*) \"Personel Sayısı\" from KIMLIK k left join PUANBILGI p on p.KOD=k.PUANTAJ group by p.AD order by p.AD"),

            LegacyOperationalReport.AnnualLeaveEntitlements => db.Query(
                "select PKNO \"Kart No\",AD Ad,SOYAD Soyad,IGTARIH \"İşe Giriş\",coalesce(KULIZIN,0) \"İzin Hakedişi\" from KIMLIK order by PKNO"),

            _ => new DataTable()
        };
    }

    ReportTable Table()
    {
        var columns = data.Columns.Cast<DataColumn>().Select(c => c.ColumnName).ToArray();
        var rows = data.Rows.Cast<DataRow>()
            .Select(r => (IReadOnlyList<string>)data.Columns.Cast<DataColumn>().Select(c => Convert.ToString(r[c]) ?? string.Empty).ToArray())
            .ToArray();
        return CompanyBranding.Decorate(new ReportTable($"{Text} • {from.Value:dd.MM.yyyy} - {to.Value:dd.MM.yyyy}", columns, rows));
    }

    void Preview()
    {
        try { LoadData(); ReportPrintHelper.Preview(this, Table(), grid.Columns.Count > 7); }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void Print()
    {
        try { LoadData(); ReportPrintHelper.Print(this, Table(), grid.Columns.Count > 7); }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
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
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}
