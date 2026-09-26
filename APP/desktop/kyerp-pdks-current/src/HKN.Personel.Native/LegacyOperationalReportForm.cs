using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public enum LegacyOperationalReport
{
    EarningsDeductions,
    LeavePersonnel,
    PersonnelList,
    PersonnelCountByWorkSystem,
    AnnualLeaveEntitlements
}

public sealed class LegacyOperationalReportForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly LegacyOperationalReport report;
    readonly DateTimePicker from=new(){Format=DateTimePickerFormat.Short};
    readonly DateTimePicker to=new(){Format=DateTimePickerFormat.Short};
    readonly DataGridView grid=new(){Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BackgroundColor=Color.White};
    readonly Label summary=new(){Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleRight,Font=new Font("Segoe UI",9f,FontStyle.Bold),ForeColor=Color.FromArgb(36,107,230)};
    DataTable? data;

    public LegacyOperationalReportForm(LegacyOperationalReport report)
    {
        this.report=report;Text=Title(report);StartPosition=FormStartPosition.CenterScreen;Size=new Size(1180,720);MinimumSize=new Size(900,600);Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);
        var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);from.Value=first;to.Value=DateTime.Today;Build();Shown+=(_,_)=>LoadData();
    }

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,ColumnCount=1,Padding=new Padding(14)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,68));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        var filter=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,Padding=new Padding(12),BackColor=Color.White};filter.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));filter.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));filter.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,24));filter.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));filter.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));filter.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var label=new Label{Text="Tarih Aralığı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(66,82,104)};filter.Controls.Add(label,0,0);from.Dock=DockStyle.Fill;filter.Controls.Add(from,1,0);filter.Controls.Add(new Label{Text="—",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter},2,0);to.Dock=DockStyle.Fill;filter.Controls.Add(to,3,0);var show=Btn("Göster",100,true);show.Click+=(_,_)=>LoadData();filter.Controls.Add(show,4,0);filter.Controls.Add(summary,5,0);root.Controls.Add(filter,0,0);
        if(!UsesDateRange(report)){label.Visible=false;from.Visible=false;to.Visible=false;}
        root.Controls.Add(grid,0,1);
        var actions=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,10,0,0)};var preview=Btn("Önizle",100);var pdf=Btn("PDF Aktar",110);var excel=Btn("Excel Aktar",110);preview.Click+=(_,_)=>PrintPreview();pdf.Click+=(_,_)=>Export(false);excel.Click+=(_,_)=>Export(true);actions.Controls.AddRange([excel,pdf,preview]);root.Controls.Add(actions,0,2);Controls.Add(root);
    }

    static Button Btn(string text,int width,bool primary=false){var b=new Button{Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,BackColor=primary?Color.FromArgb(36,107,230):Color.White,ForeColor=primary?Color.White:Color.FromArgb(27,44,68),Font=new Font("Segoe UI",9f,FontStyle.Bold)};b.FlatAppearance.BorderColor=primary?b.BackColor:Color.FromArgb(216,225,236);return b;}
    public LegacyOperationalReport Report=>report;
    public static string Title(LegacyOperationalReport value)=>value switch
    {
        LegacyOperationalReport.EarningsDeductions=>"Ek Kazanç ve Kesinti Raporu",
        LegacyOperationalReport.LeavePersonnel=>"İzinli Personel Raporu",
        LegacyOperationalReport.PersonnelList=>"Personel Listesi",
        LegacyOperationalReport.PersonnelCountByWorkSystem=>"Çalışma Sistemine Göre Personel Sayısı",
        LegacyOperationalReport.AnnualLeaveEntitlements=>"Personel Yıllık İzin Hakedişleri",
        _=>throw new ArgumentOutOfRangeException(nameof(value))
    };

    static bool UsesDateRange(LegacyOperationalReport value)=>value is LegacyOperationalReport.EarningsDeductions or LegacyOperationalReport.LeavePersonnel;
    static Button Button(string text,int x)=>new(){Text=text,Location=new Point(x,6),Size=new Size(88,29),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold)};

    void LoadData()
    {
        try
        {
            if(to.Value.Date<from.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");var range=new[]{new FbParameter("@A",from.Value.Date),new FbParameter("@B",to.Value.Date.AddDays(1))};
            data=report switch
            {
                LegacyOperationalReport.EarningsDeductions=>db.Query("select a.TARIH Tarih,a.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,v.TUR Tür,v.ISARET İşaret,a.MIKTAR Miktar,a.ACIKLAMA Açıklama from AVANS a left join KIMLIK k on k.PKNO=a.PKNO left join AVTUR v on v.KOD=a.TURKOD where a.TARIH>=@A and a.TARIH<@B order by a.TARIH,a.PKNO",range),
                LegacyOperationalReport.LeavePersonnel=>db.Query("select o.TARIH Tarih,o.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,o.MAZERET Mazeret,o.TIP Tür,o.SURESAAT Süre,o.BASSAAT Başlangıç,o.BITSAAT Bitiş from OZELIZIN o left join KIMLIK k on k.PKNO=o.PKNO where o.TARIH>=@A and o.TARIH<@B order by o.TARIH,o.PKNO",range),
                LegacyOperationalReport.PersonnelList=>db.Query("select k.PKNO \"Kart No\",k.SICILNO \"Sicil No\",k.AD Ad,k.SOYAD Soyad,k.IGTARIH \"İşe Giriş\",g.AD Grup,b.AD Bölüm,s.AD Servis,d.AD Durum from KIMLIK k left join GRUP g on g.KOD=k.GRUP left join BOLUM b on b.KOD=k.BOLUM left join SERVIS s on s.KOD=k.SERVIS left join DURUM d on d.KOD=k.DURUM order by k.PKNO"),
                LegacyOperationalReport.PersonnelCountByWorkSystem=>db.Query("select coalesce(g.AD,'Tanımsız') \"Çalışma Sistemi\",count(*) \"Personel Sayısı\" from KIMLIK k left join GRUP g on g.KOD=k.GRUP where k.ICTARIH is null group by g.AD order by g.AD"),
                LegacyOperationalReport.AnnualLeaveEntitlements=>db.Query("select k.PKNO \"Kart No\",k.AD Ad,k.SOYAD Soyad,k.IGTARIH \"İşe Giriş\",coalesce(k.KULIZIN,0) \"İzin Hakedişi\" from KIMLIK k where k.ICTARIH is null order by k.PKNO"),
                _=>throw new ArgumentOutOfRangeException()
            };grid.DataSource=data;summary.Text=$"{data.Rows.Count} kayıt";
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    ReportTable Table()
    {
        data??=new DataTable(); var reportTable = new ReportTable(Text,data.Columns.Cast<DataColumn>().Select(x=>x.ColumnName).ToArray(),data.Rows.Cast<DataRow>().Select(row=>(IReadOnlyList<string>)data.Columns.Cast<DataColumn>().Select(column=>Convert.ToString(row[column])??"").ToArray()).ToArray()); return CompanyBranding.Decorate(reportTable);
    }

    void Export(bool excel)
    {
        try{LoadData();using var save=new SaveFileDialog{Filter=excel?"Excel (*.xlsx)|*.xlsx":"PDF (*.pdf)|*.pdf",DefaultExt=excel?"xlsx":"pdf",FileName=Text.Replace(' ','-')};if(save.ShowDialog(this)!=DialogResult.OK)return;if(excel)ReportExporter.ExportExcel(save.FileName,Table());else ReportExporter.ExportPdf(save.FileName,Table());MessageBox.Show("Rapor oluşturuldu:\n"+save.FileName,Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void PrintPreview()
    {
        try
        {
            LoadData();
            ReportPrintHelper.Preview(this, Table(), grid.Columns.Count > 7);
        }
        catch(Exception ex)
        {
            MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);
        }
    }
}