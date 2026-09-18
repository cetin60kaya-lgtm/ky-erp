using FirebirdSql.Data.FirebirdClient;
using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly TextBox odHours=Box(),odDays=Box(),odNormal=Box(),odEkKes=Box(),odEkKaz=Box(),odYol=Box(),odYemek=Box(),odDevir=Box(),odOdenecek=Box(),odOdenen=Box(),odKalan=Box(),odMesai=Box(),odOdenenMesai=Box(),odKalanMesai=Box();
    static TextBox Box()=>new(){ReadOnly=true,BorderStyle=BorderStyle.FixedSingle,TextAlign=HorizontalAlignment.Right,Dock=DockStyle.Fill,Margin=Padding.Empty};

    TabPage BuildGirisClassic()=>BuildPeriodGridClassic("Giriş ve Çıkışları",periodG,gFrom,gTo,gGiris);
    TabPage BuildIzinClassic()=>BuildPeriodGridClassic("İzinler",periodI,iFrom,iTo,gIzin);
    TabPage BuildEkkClassic()=>BuildPeriodGridClassic("Ek Kazanç Ve Kesintiler",periodE,eFrom,eTo,gEkk);

    TabPage BuildPeriodGridClassic(string title,ComboBox per,DateTimePicker from,DateTimePicker to,DataGridView grid)
    {
        var page=new TabPage(title);var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=Padding.Empty};
        lay.RowStyles.Add(new RowStyle(SizeType.Absolute,66));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));lay.RowStyles.Add(new RowStyle(SizeType.Absolute,45));
        var top=ClassicPeriodHeader(per,from,to);lay.Controls.Add(top,0,0);lay.Controls.Add(grid,0,1);
        var bot=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(5,7,45,0),WrapContents=false};
        foreach(var s in new[]{"Tümünü Sil","Sil","Değiştir","Yeni Ekle"}){var b=new Button{Text=s,Width=96,Height=29,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),Image=ClassicGlyph(s),ImageAlign=ContentAlignment.MiddleLeft};bot.Controls.Add(b);}lay.Controls.Add(bot,0,2);page.Controls.Add(lay);return page;
    }
    Control ClassicPeriodHeader(ComboBox per,DateTimePicker from,DateTimePicker to)
    {
        var top=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Padding=new Padding(6,4,6,2),Margin=Padding.Empty};
        top.RowStyles.Add(new RowStyle(SizeType.Percent,50)); top.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        var r1=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty};
        r1.Controls.Add(new Label{Text="Dönem Adı",Width=68,Height=24,TextAlign=ContentAlignment.MiddleLeft}); per.Width=205; r1.Controls.Add(per);
        var show=new Button{Text="Seçili Tarihi Göster",Width=150,Height=28,Margin=new Padding(62,0,0,0),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),UseVisualStyleBackColor=true}; show.Click+=(_,_)=>RefreshFullTabs(); r1.Controls.Add(show);
        var r2=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty};
        r2.Controls.Add(new Label{Text="Tarih Aralığı",Width=68,Height=24,TextAlign=ContentAlignment.MiddleLeft}); from.Width=95; to.Width=95; r2.Controls.Add(from); r2.Controls.Add(new Label{Text="ile",AutoSize=true,Padding=new Padding(4,6,4,0)}); r2.Controls.Add(to);
        top.Controls.Add(r1,0,0); top.Controls.Add(r2,0,1); return top;
    }

    TabPage BuildBilgiClassic()
    {
        var page=new TabPage("Bilgi");var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2};lay.RowStyles.Add(new RowStyle(SizeType.Absolute,66));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var top=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=2,Padding=new Padding(6,5,6,2)};top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,70));top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,205));top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));
        top.Controls.Add(new Label{Text="Dönem Adı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);periodB.Dock=DockStyle.Fill;top.Controls.Add(periodB,1,0);var type=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList};type.Items.AddRange(new object[]{"Tümü","Normal Çalışma","Mesai","Devamsızlık","Geç Kalma","Eksik Süre"});type.SelectedIndex=0;top.Controls.Add(type,3,0);
        top.Controls.Add(new Label{Text="Tarih Aralığı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,1);var dates=new Label{Text="",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};top.Controls.Add(dates,1,1);top.SetColumnSpan(dates,2);void upd(){var d=PeriodDates(periodB);dates.Text=$"{d.A:dd.MM.yyyy}     ile     {d.B:dd.MM.yyyy}";}periodB.SelectedIndexChanged+=(_,_)=>upd();var show=new Button{Text="Seçili Tarihi Göster",Dock=DockStyle.Fill,ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),Image=ClassicGlyph("Göster"),ImageAlign=ContentAlignment.MiddleLeft};show.Click+=(_,_)=>RefreshFullTabs();top.Controls.Add(show,3,1);
        lay.Controls.Add(top,0,0);lay.Controls.Add(gBilgi,0,1);page.Controls.Add(lay);return page;
    }

    TabPage BuildOdemeClassic()
    {
        var page=new TabPage("Ödemeler");var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3};lay.RowStyles.Add(new RowStyle(SizeType.Absolute,42));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));lay.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(7,5,0,0),WrapContents=false};top.Controls.Add(new Label{Text="Dönem Adı",AutoSize=true,Padding=new Padding(0,6,5,0)});periodO.Width=205;top.Controls.Add(periodO);lay.Controls.Add(top,0,0);
        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(2)};body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,56));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,44));body.Controls.Add(gOdeme,0,0);
        var totals=new GroupBox{Text="Toplamlar",Dock=DockStyle.Fill,Padding=new Padding(3)};var t=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=4,RowCount=15};t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,34));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,20));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,30));
        t.Controls.Add(new Label{Text="Normal Çalışma Toplamı",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,0);t.SetColumnSpan(t.GetControlFromPosition(0,0)!,4);odHours.BackColor=Color.Black;odHours.ForeColor=Color.Lime;odHours.Font=new Font(Font,FontStyle.Bold);t.Controls.Add(odHours,0,1);t.Controls.Add(odDays,1,1);t.Controls.Add(odNormal,2,1);t.SetColumnSpan(odNormal,2);
        AddPairLabels(t,2,"Ek Kesinti","Ek Kazanç");t.Controls.Add(odEkKes,0,3);t.SetColumnSpan(odEkKes,2);t.Controls.Add(odEkKaz,2,3);t.SetColumnSpan(odEkKaz,2);AddPairLabels(t,4,"Yol Parası","Yemek Parası");t.Controls.Add(odYol,0,5);t.SetColumnSpan(odYol,2);t.Controls.Add(odYemek,2,5);t.SetColumnSpan(odYemek,2);
        AddTotalSingle(t,6,"Devir",odDevir);AddTotalSingle(t,7,"Ödenecek",odOdenecek);AddTotalSingle(t,8,"Ödenen Maaş",odOdenen);AddTotalSingle(t,9,"Kalan Ödeme",odKalan);AddTotalSingle(t,10,"Mesai",odMesai);AddTotalSingle(t,11,"Ödenen Mesai",odOdenenMesai);AddTotalSingle(t,12,"Kalan Mesai",odKalanMesai);var net=new Label{Text="Ödenecek Net Tutar",ForeColor=Color.Blue,Font=new Font(Font,FontStyle.Bold),Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter};t.Controls.Add(net,0,13);t.SetColumnSpan(net,4);t.Controls.Add(odOdenecek,2,14);t.SetColumnSpan(odOdenecek,2);
        totals.Controls.Add(t);body.Controls.Add(totals,1,0);lay.Controls.Add(body,0,1);
        var bar=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(30,6,30,4)};bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));var pay=new Button{Text="Maaş ve Mesai Ödemesi",Dock=DockStyle.Fill,Margin=new Padding(20,0,20,0),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),Image=ClassicGlyph("Yeni"),ImageAlign=ContentAlignment.MiddleLeft};var calc=new Button{Text="Hesapla",Dock=DockStyle.Fill,Margin=new Padding(20,0,20,0),ForeColor=Color.Navy,Font=new Font(Font,FontStyle.Bold),Image=ClassicGlyph("Göster"),ImageAlign=ContentAlignment.MiddleLeft};pay.Click+=(_,_)=>ShowPaymentClassic();calc.Click+=(_,_)=>RefreshFullTabs();bar.Controls.Add(pay,0,0);bar.Controls.Add(calc,1,0);lay.Controls.Add(bar,0,2);page.Controls.Add(lay);return page;
    }
    void AddPairLabels(TableLayoutPanel t,int row,string a,string b){var la=new Label{Text=a,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};var lb=new Label{Text=b,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};t.Controls.Add(la,0,row);t.SetColumnSpan(la,2);t.Controls.Add(lb,2,row);t.SetColumnSpan(lb,2);}
    void AddTotalSingle(TableLayoutPanel t,int row,string name,Control val){var l=new Label{Text=name,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft};t.Controls.Add(l,0,row);t.SetColumnSpan(l,3);t.Controls.Add(val,3,row);}

    Image ClassicGlyph(string kind)
    {
        var b=new Bitmap(16,16);using var g=Graphics.FromImage(b);g.Clear(Color.Transparent);using var pen=new Pen(kind.Contains("Sil")?Color.Red:kind.Contains("Değiş")?Color.DarkOrange:kind.Contains("Göster")?Color.Navy:Color.ForestGreen,2);
        if(kind.Contains("Sil")){g.DrawLine(pen,3,8,13,8);}else if(kind.Contains("Değiş")){g.DrawRectangle(pen,3,3,9,9);g.DrawLine(pen,5,11,12,4);}else if(kind.Contains("Göster")){g.DrawEllipse(pen,2,5,12,7);g.FillEllipse(Brushes.Navy,7,7,3,3);}else if(kind.Contains("Per.")){g.DrawEllipse(pen,5,2,6,6);g.DrawArc(pen,3,8,10,7,180,180);}else{g.DrawLine(pen,8,3,8,13);g.DrawLine(pen,3,8,13,8);}return b;
    }
    void OdemeBound(object? s,DataGridViewBindingCompleteEventArgs e){SetCol(gOdeme,"Bordro Alanları",108,true,"Bordro Alanları");SetCol(gOdeme,"Gün",36,true,"Gün");SetCol(gOdeme,"Saat",54,true,"Saat");SetCol(gOdeme,"Ücret",82,true,"Ücret");}

    void LoadBilgiOdemeClassic()
    {
        var d=PeriodDates(periodB);var end=d.B.AddDays(1);
        gBilgi.DataSource=Q("select TARIH,SAAT1 as NC,SAAT2 as M50,SAAT3 as M100,SAAT4 as UIZIN,SAAT5,SAAT6,SAAT7,SAAT8,SAAT9,DEVAMSIZLIKS as DEVAMSIZLIK,GECS as GEC_KALMA,EKSIKS as EKSIK_SURE from PUANTAJ where PKNO=@PK and TARIH>=@A and TARIH<@B order by TARIH",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",end));
        d=PeriodDates(periodO);end=d.B.AddDays(1);
        var pu=Q("select coalesce(sum(GUN1),0) NG,coalesce(sum(DAKIKA1),0) ND,coalesce(sum(GUN2),0) G2,coalesce(sum(DAKIKA2),0) D2,coalesce(sum(GUN3),0) G3,coalesce(sum(DAKIKA3),0) D3,coalesce(sum(GUN4),0) G4,coalesce(sum(DAKIKA4),0) D4,coalesce(sum(DEVAMSIZLIKG),0) DG,coalesce(sum(GECG),0) GG,coalesce(sum(ERKENG),0) EG,coalesce(sum(EKSIKG),0) XG from PUANTAJ where PKNO=@PK and TARIH>=@A and TARIH<@B",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",end));
        var kr=Q("select MAAS,GYUCRET,GYEMUCRET from KIMLIK where PKNO=@PK",new FbParameter("@PK",currentPk));
        decimal maas=Val(kr,0,"MAAS"),yolGun=Val(kr,0,"GYUCRET"),yemekGun=Val(kr,0,"GYEMUCRET");var r=pu.Rows[0];
        decimal ng=Num(r,"NG"),nd=Num(r,"ND"),g2=Num(r,"G2"),d2=Num(r,"D2"),g3=Num(r,"G3"),d3=Num(r,"D3"),g4=Num(r,"G4"),d4=Num(r,"D4"),dg=Num(r,"DG"),gg=Num(r,"GG"),eg=Num(r,"EG"),xg=Num(r,"XG");
        decimal normal=Math.Round(maas/30m*ng,2),m50=Math.Round(maas/225m*(d2/60m)*1.5m,2),m100=Math.Round(maas/225m*(d3/60m)*2m,2),dev=Math.Round(maas/30m*dg,2);
        decimal ekKaz=0,ekKes=0,paid=0,paidMesai=0;
        try{var ex=Q("select coalesce(sum(case when TURKOD=1 then abs(MIKTAR) else 0 end),0) KAZ,coalesce(sum(case when TURKOD<>1 then abs(MIKTAR) else 0 end),0) KES from AVANS where PKNO=@PK and TARIH>=@A and TARIH<@B",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",end));ekKaz=Num(ex.Rows[0],"KAZ");ekKes=Num(ex.Rows[0],"KES");}catch{}
        try{var od=Q("select coalesce(sum(NODENEN),0) N,coalesce(sum(FMODENEN),0) F from ODEME where PKNO=@PK and BASTAR<=@B and BITTAR>=@A",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",d.B));if(od.Rows.Count>0){paid=Num(od.Rows[0],"N");paidMesai=Num(od.Rows[0],"F");}}catch{}
        decimal yol=Math.Round(yolGun*ng,2),yemek=Math.Round(yemekGun*ng,2),mesai=m50+m100,odenecek=normal+mesai+ekKaz+yol+yemek-ekKes,kalan=odenecek-paid,kalanMesai=mesai-paidMesai;
        var t=new DataTable();t.Columns.Add("Bordro Alanları");t.Columns.Add("Gün");t.Columns.Add("Saat");t.Columns.Add("Ücret");
        void Add(string n,decimal gun,decimal dakika,decimal u)=>t.Rows.Add(n,gun==0?"0":gun.ToString("0.##"),dakika==0?"":Minutes(dakika),u==0?"":u.ToString("N2"));
        Add("Normal Çalışma",ng,nd,normal);Add("% 50 Mesai",g2,d2,m50);Add("% 100 Mesai",g3,d3,m100);Add("Ücretsiz İzin",g4,d4,0);for(int i=5;i<=9;i++)Add(i.ToString(),0,0,0);
        Add("Devamsızlık",dg,dg*450,-dev);Add("Geç Kalma",gg,0,0);Add("Eksik Süre",xg,0,0);Add("Erken Çıkma",eg,0,0);Add("Devamsızlık Ceza",0,dg*450,-dev);Add("Geç Kalma Ceza",0,0,0);gOdeme.DataSource=t;
        odHours.Text=Minutes(nd);odDays.Text=ng.ToString("0.##");odNormal.Text=normal.ToString("N2");odEkKes.Text=ekKes.ToString("N2");odEkKaz.Text=ekKaz.ToString("N2");odYol.Text=yol.ToString("N2");odYemek.Text=yemek.ToString("N2");odDevir.Text="0,00";odOdenecek.Text=odenecek.ToString("N2");odOdenen.Text=paid.ToString("N2");odKalan.Text=kalan.ToString("N2");odMesai.Text=mesai.ToString("N2");odOdenenMesai.Text=paidMesai.ToString("N2");odKalanMesai.Text=kalanMesai.ToString("N2");
        payNormal.Text=$"{Minutes(nd)}   {ng:0.##}   {normal:N2}";payKes.Text=ekKes.ToString("N2");payEk.Text=ekKaz.ToString("N2");payNet.Text=odenecek.ToString("N2");
    }
    decimal Num(DataRow r,string c)=>r[c]==DBNull.Value?0:Convert.ToDecimal(r[c]);
    decimal Val(DataTable t,int row,string c)=>t.Rows.Count<=row||!t.Columns.Contains(c)||t.Rows[row][c]==DBNull.Value?0:Convert.ToDecimal(t.Rows[row][c]);
}
