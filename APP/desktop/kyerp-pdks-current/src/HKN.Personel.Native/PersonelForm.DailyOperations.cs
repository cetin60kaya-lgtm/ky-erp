using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core.Operations;
using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void ShowDailyOperations()
    {
        using var dialog=new Form{Text="Günlük Operasyon",StartPosition=FormStartPosition.CenterParent,Size=new Size(980,620),MinimumSize=new Size(840,520),Font=Font};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(8)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));root.RowStyles.Add(new RowStyle(SizeType.Absolute,70));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(4)};var date=new DateTimePicker{Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd",Width=220};var refresh=new Button{Text="Yenile",Width=90,Height=30};top.Controls.Add(new Label{Text="Operasyon Tarihi",AutoSize=true,Padding=new Padding(0,7,5,0)});top.Controls.Add(date);top.Controls.Add(refresh);root.Controls.Add(top,0,0);
        var cards=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(2),WrapContents=false};
        Label Card(string title){var label=new Label{Width=145,Height=54,BorderStyle=BorderStyle.FixedSingle,TextAlign=ContentAlignment.MiddleCenter,Font=new Font(Font,FontStyle.Bold),Text=title};cards.Controls.Add(label);return label;}
        var expected=Card("Beklenen\n0");var arrived=Card("Gelen\n0");var missing=Card("Gelmeyen\n0");var open=Card("Açık Kayıt\n0");var day=Card("Gündüz\n0");var night=Card("Gece\n0");root.Controls.Add(cards,0,1);
        var tabsDaily=new TabControl{Dock=DockStyle.Fill};var allGrid=Grid("DAILY_ALL");var missingGrid=Grid("DAILY_MISSING");var openGrid=Grid("DAILY_OPEN");
        TabPage Page(string title,Control control){var page=new TabPage(title);page.Controls.Add(control);return page;}tabsDaily.TabPages.Add(Page("Bugünkü Ekip",allGrid));tabsDaily.TabPages.Add(Page("Gelmeyenler",missingGrid));tabsDaily.TabPages.Add(Page("Çıkış Bekleyenler",openGrid));root.Controls.Add(tabsDaily,0,2);dialog.Controls.Add(root);
        void LoadDay()
        {
            var selected=date.Value.Date;var next=selected.AddDays(1);
            var table=Q(@"select K.PKNO,K.AD,K.SOYAD,
                (select first 1 G.GTARIH from GIRCIK G where G.PKNO=K.PKNO and G.GTARIH>=@A and G.GTARIH<@B order by G.GTARIH,G.GDAKIKA) GIRIS_TARIHI,
                (select first 1 G.GSAAT from GIRCIK G where G.PKNO=K.PKNO and G.GTARIH>=@A and G.GTARIH<@B order by G.GTARIH,G.GDAKIKA) GIRIS_SAATI,
                (select first 1 G.CTARIH from GIRCIK G where G.PKNO=K.PKNO and G.GTARIH>=@A and G.GTARIH<@B order by G.GTARIH desc,G.GDAKIKA desc) CIKIS_TARIHI,
                (select first 1 G.CSAAT from GIRCIK G where G.PKNO=K.PKNO and G.GTARIH>=@A and G.GTARIH<@B order by G.GTARIH desc,G.GDAKIKA desc) CIKIS_SAATI
                from KIMLIK K where K.IGTARIH<@B and (K.ICTARIH is null or K.ICTARIH>=@A) order by K.PKNO",
                new FbParameter("@A",selected),new FbParameter("@B",next));
            table.Columns.Add("VARDIYA");
            foreach(System.Data.DataRow row in table.Rows){var time=Convert.ToString(row["GIRIS_SAATI"])??"";row["VARDIYA"]=TimeSpan.TryParse(time,out var parsed)&&(parsed.Hours>=18||parsed.Hours<6)?"GECE":"GÜNDÜZ";}
            var rows=table.AsEnumerable().Select(row=>new DailyAttendance(Convert.ToString(row["PKNO"])??"",row["GIRIS_TARIHI"] is DateTime gi?gi:null,row["CIKIS_TARIHI"] is DateTime ci?ci:null,true,Convert.ToString(row["VARDIYA"])??"GÜNDÜZ"));
            var summary=DailyOperationCalculator.Calculate(rows);expected.Text=$"Beklenen\n{summary.Expected}";arrived.Text=$"Gelen\n{summary.Arrived}";missing.Text=$"Gelmeyen\n{summary.Missing}";open.Text=$"Açık Kayıt\n{summary.OpenRecords}";day.Text=$"Gündüz\n{summary.DayShift}";night.Text=$"Gece\n{summary.NightShift}";
            allGrid.DataSource=table;missingGrid.DataSource=table.AsEnumerable().Where(row=>row["GIRIS_TARIHI"]==DBNull.Value).Any()?table.AsEnumerable().Where(row=>row["GIRIS_TARIHI"]==DBNull.Value).CopyToDataTable():table.Clone();openGrid.DataSource=table.AsEnumerable().Where(row=>row["GIRIS_TARIHI"]!=DBNull.Value&&row["CIKIS_TARIHI"]==DBNull.Value).Any()?table.AsEnumerable().Where(row=>row["GIRIS_TARIHI"]!=DBNull.Value&&row["CIKIS_TARIHI"]==DBNull.Value).CopyToDataTable():table.Clone();
        }
        refresh.Click+=(_,_)=>{try{LoadDay();}catch(Exception ex){MessageBox.Show(ex.Message,"Günlük Operasyon");}};dialog.Shown+=(_,_)=>refresh.PerformClick();dialog.ShowDialog(this);
    }
}
