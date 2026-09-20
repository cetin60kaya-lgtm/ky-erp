using System.Data;
using System.Drawing.Printing;
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
    readonly DateTimePicker from=new(){Location=new Point(88,10),Size=new Size(120,21),Format=DateTimePickerFormat.Short};
    readonly DateTimePicker to=new(){Location=new Point(242,10),Size=new Size(120,21),Format=DateTimePickerFormat.Short};
    readonly DataGridView grid=new(){Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,BackgroundColor=Color.White};
    DataTable? data;

    public LegacyOperationalReportForm(LegacyOperationalReport report)
    {
        this.report=report;Text=Title(report);StartPosition=FormStartPosition.CenterScreen;Size=new Size(900,600);MinimumSize=new Size(720,480);Font=new Font("Microsoft Sans Serif",8.25f);ShowInTaskbar=false;
        var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);from.Value=first;to.Value=DateTime.Today;
        var top=new Panel{Dock=DockStyle.Top,Height=43};var show=Button("&Göster",380);var preview=Button("Ö&nizleme",474);var pdf=Button("PDF",568);var excel=Button("Excel",662);var close=Button("Kapa&t",756);close.DialogResult=DialogResult.Cancel;
        top.Controls.AddRange([new Label{Text="Tarih Aralığı",Location=new Point(12,14),AutoSize=true},from,new Label{Text="-",Location=new Point(224,14),AutoSize=true},to,show,preview,pdf,excel,close]);Controls.Add(grid);Controls.Add(top);CancelButton=close;
        if(!UsesDateRange(report)){from.Visible=false;to.Visible=false;top.Controls.OfType<Label>().ToList().ForEach(x=>x.Visible=false);}
        show.Click+=(_,_)=>LoadData();preview.Click+=(_,_)=>PrintPreview();pdf.Click+=(_,_)=>Export(false);excel.Click+=(_,_)=>Export(true);Shown+=(_,_)=>LoadData();
    }

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
            };grid.DataSource=data;
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    ReportTable Table()
    {
        data??=new DataTable();return new(Text,data.Columns.Cast<DataColumn>().Select(x=>x.ColumnName).ToArray(),data.Rows.Cast<DataRow>().Select(row=>(IReadOnlyList<string>)data.Columns.Cast<DataColumn>().Select(column=>Convert.ToString(row[column])??"").ToArray()).ToArray());
    }

    void Export(bool excel)
    {
        try{LoadData();using var save=new SaveFileDialog{Filter=excel?"Excel (*.xlsx)|*.xlsx":"PDF (*.pdf)|*.pdf",DefaultExt=excel?"xlsx":"pdf",FileName=Text.Replace(' ','-')};if(save.ShowDialog(this)!=DialogResult.OK)return;if(excel)ReportExporter.ExportExcel(save.FileName,Table());else ReportExporter.ExportPdf(save.FileName,Table());MessageBox.Show("Rapor oluşturuldu:\n"+save.FileName,Text,MessageBoxButtons.OK,MessageBoxIcon.Information);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void PrintPreview()
    {
        try{LoadData();var table=Table();var row=0;using var document=new PrintDocument{DocumentName=Text};document.PrintPage+=(_,args)=>{var graphics=args.Graphics;if(graphics is null)return;using var heading=new Font("Arial",14,FontStyle.Bold);using var body=new Font("Arial",8);var y=args.MarginBounds.Top;graphics.DrawString(Text,heading,Brushes.Black,args.MarginBounds.Left,y);y+=28;graphics.DrawString(string.Join(" | ",table.Columns),body,Brushes.Black,args.MarginBounds.Left,y);y+=17;while(row<table.Rows.Count&&y<args.MarginBounds.Bottom-17){graphics.DrawString(string.Join(" | ",table.Rows[row++]),body,Brushes.Black,args.MarginBounds.Left,y);y+=15;}args.HasMorePages=row<table.Rows.Count;};using var preview=new PrintPreviewDialog{Document=document,Width=1000,Height=750,Text=Text};preview.ShowDialog(this);}catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
}