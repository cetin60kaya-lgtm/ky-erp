using FirebirdSql.Data.FirebirdClient;
using System.Data;
using System.Drawing.Printing;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly ComboBox periodG=new(){Width=190,DropDownStyle=ComboBoxStyle.DropDownList}, periodI=new(){Width=190,DropDownStyle=ComboBoxStyle.DropDownList}, periodE=new(){Width=190,DropDownStyle=ComboBoxStyle.DropDownList}, periodB=new(){Width=190,DropDownStyle=ComboBoxStyle.DropDownList}, periodO=new(){Width=190,DropDownStyle=ComboBoxStyle.DropDownList};
    readonly DateTimePicker gFrom=new(){Width=105,Format=DateTimePickerFormat.Short}, gTo=new(){Width=105,Format=DateTimePickerFormat.Short}, iFrom=new(){Width=105,Format=DateTimePickerFormat.Short}, iTo=new(){Width=105,Format=DateTimePickerFormat.Short}, eFrom=new(){Width=105,Format=DateTimePickerFormat.Short}, eTo=new(){Width=105,Format=DateTimePickerFormat.Short};
    readonly DataGridView gGiris=Grid("GIRCIK"), gIzin=Grid("IZIN"), gEkk=Grid("AVANS"), gBilgi=Grid("BILGI"), gOdeme=Grid("ODEME");
    readonly Label payNormal=new(){AutoSize=true}, payEk=new(){AutoSize=true}, payKes=new(){AutoSize=true}, payNet=new(){AutoSize=true};
    readonly System.Windows.Forms.Timer slider=new(){Interval=3000};

    static DataGridView Grid(string name)=>new(){Name=name,Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,BackgroundColor=Color.White};

    void BuildMenuFull()
    {
        var m=new MenuStrip();
        var rap=new ToolStripMenuItem("Raporlar");
        rap.DropDownItems.Add(Item("Ayrıntılı Kişisel Bordro",Keys.F2,()=>PrintReportFinal("Ayrıntılı Kişisel Bordro")));
        rap.DropDownItems.Add(Item("Personel Bilgi Formu",Keys.None,()=>PrintReportFinal("Personel Bilgi Formu")));
        rap.DropDownItems.Add(Item("Personel Bilgi Formu (Boş)",Keys.None,()=>PrintReportFinal("Personel Bilgi Formu (Boş)")));
        rap.DropDownItems.Add(Item("Kişisel Giriş Çıkış Raporu",Keys.None,()=>PrintReportFinal("Kişisel Giriş Çıkış Raporu")));
        rap.DropDownItems.Add(Item("Kişisel İzin Kartı",Keys.None,()=>PrintReportFinal("Kişisel İzin Kartı")));
        rap.DropDownItems.Add(Item("Kişisel Ek Kazanç ve Kesinti Kartı",Keys.None,()=>PrintReportFinal("Kişisel Ek Kazanç ve Kesinti Kartı")));
        var isl=new ToolStripMenuItem("İşlemler");
        isl.DropDownItems.Add(Item("Personel Listesi Filtreleme",Keys.F3,FilterDialog));
        isl.DropDownItems.Add(Item("Süreli Personel Kaydırma",Keys.F4,ToggleSlider));
        isl.DropDownItems.Add(Item("Hesapla",Keys.F5,RefreshFullTabs));
        isl.DropDownItems.Add(Item("Maaş Geçmişi",Keys.None,SalaryHistory));
        m.Items.Add(rap); m.Items.Add(isl); MainMenuStrip=m; Controls.Add(m);
        slider.Tick += (_,_)=>{ if(list.Rows.Count==0)return; int i=list.CurrentRow?.Index??-1; i=(i+1)%list.Rows.Count; list.CurrentCell=list.Rows[i].Cells[0]; };
    }

    ToolStripMenuItem Item(string text,Keys key,Action a)
    {
        var x=new ToolStripMenuItem(text); if(key!=Keys.None)x.ShortcutKeys=key; x.Click+=(_,_)=>a(); return x;
    }

    TabPage BuildKisiselTab()
    {
        var p=new TabPage("Kişisel Bilgiler"); var t=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=11,Padding=new Padding(8)};
        t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));t.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));t.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        string[] z={"Vergi Kimlik No","VKNO","SSK No","SSKNO","Askerlik Durumu","ASDURUM","Elbise Beden No","ELBNO","Eğitim Durumu","EGTDURUM","Ayakkabı No","AYNO","Yabancı Dil","YDIL","Kullanıldığı İzin","KULIZIN","Uzmanlık Alanı","UALAN","Çocuk Sayısı","CCKSAY","Ehliyet Sınıfı","ESINIF","Ev Telefonu","EVTEL","Ehliyet Verildiği İl/İlçe","EVILILCE","Cep Telefonu","GSM","Ehliyet Belge Numarası","EBELGENO","Fazla Mesai Ücreti","MSUCRET","Ehliyetin Verildiği Tarih","EVTAR","Günlük Yemek Ücreti","GYEMUCRET","Kullandığı Cihaz","","Günlük Yol Ücreti","GYUCRET","Eski Maaşı","EMAAS","İşten Çıkış Sebebi","ICIKSEBEB","","","Adres","ADRES"};
        for(int i=0;i<z.Length;i+=2){int n=i/2,row=n/2,col=(n%2)*2;if(string.IsNullOrEmpty(z[i]))continue; t.Controls.Add(new Label{Text=z[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},col,row);var b=new TextBox{Dock=DockStyle.Fill};if(!string.IsNullOrEmpty(z[i+1]))f[z[i+1]]=b;t.Controls.Add(b,col+1,row);}
        p.Controls.Add(t); return p;
    }
    TabPage BuildGirisTab()=>PeriodGridTab("Giriş ve Çıkışları",periodG,gFrom,gTo,gGiris,true);
    TabPage BuildIzinTab()=>PeriodGridTab("İzinler",periodI,iFrom,iTo,gIzin,false);
    TabPage BuildEkkTab()=>PeriodGridTab("Ek Kazanç Ve Kesintiler",periodE,eFrom,eTo,gEkk,false);

    TabPage PeriodGridTab(string title,ComboBox per,DateTimePicker a,DateTimePicker b,DataGridView grid,bool giris)
    {
        var p=new TabPage(title); var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3}; lay.RowStyles.Add(new RowStyle(SizeType.Absolute,72));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));lay.RowStyles.Add(new RowStyle(SizeType.Absolute,46));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(6)}; top.Controls.Add(new Label{Text="Dönem Adı",AutoSize=true,Padding=new Padding(0,7,4,0)});top.Controls.Add(per);top.Controls.Add(new Label{Text="Tarih Aralığı",AutoSize=true,Padding=new Padding(8,7,4,0)});top.Controls.Add(a);top.Controls.Add(new Label{Text="ile",AutoSize=true,Padding=new Padding(4,7,4,0)});top.Controls.Add(b);var show=new Button{Text="👁 Seçili Tarihi Göster",Width=145};show.Click+=(_,_)=>RefreshFullTabs();top.Controls.Add(show);
        var bot=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(4)};foreach(var s in new[]{"Tümünü Sil","Sil","Değiştir","Yeni Ekle"}){var bt=new Button{Text=s,Width=100,Height=30};bot.Controls.Add(bt);} lay.Controls.Add(top,0,0);lay.Controls.Add(grid,0,1);lay.Controls.Add(bot,0,2);p.Controls.Add(lay);return p;
    }

    TabPage BuildBilgiTab()
    {
        var p=new TabPage("Bilgi");var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2};lay.RowStyles.Add(new RowStyle(SizeType.Absolute,65));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(6)};top.Controls.Add(new Label{Text="Dönem Adı",AutoSize=true,Padding=new Padding(0,7,4,0)});top.Controls.Add(periodB);var type=new ComboBox{Width=150};type.Items.AddRange(new object[]{"Tümü","Normal Çalışma","Mesai","Devamsızlık","Geç Kalma","Eksik Süre"});type.SelectedIndex=0;top.Controls.Add(type);var show=new Button{Text="👁 Seçili Tarihi Göster",Width=145};show.Click+=(_,_)=>RefreshFullTabs();top.Controls.Add(show);lay.Controls.Add(top,0,0);lay.Controls.Add(gBilgi,0,1);p.Controls.Add(lay);return p;
    }
    TabPage BuildOdemeTab()
    {
        var p=new TabPage("Ödemeler");var lay=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2};lay.RowStyles.Add(new RowStyle(SizeType.Absolute,50));lay.RowStyles.Add(new RowStyle(SizeType.Percent,100));var top=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(6)};top.Controls.Add(new Label{Text="Dönem Adı",AutoSize=true,Padding=new Padding(0,7,4,0)});top.Controls.Add(periodO);var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2};body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,58));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,42));body.Controls.Add(gOdeme,0,0);var sum=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=2,RowCount=8,Padding=new Padding(12)};string[] names={"Normal Çalışma Toplamı","Ek Kesinti","Ek Kazanç","Yol Parası","Yemek Parası","Devir","Ödenecek","Kalan Ödeme"};Label[] vals={payNormal,payKes,payEk,new(),new(),new(),payNet,new()};for(int i=0;i<names.Length;i++){sum.Controls.Add(new Label{Text=names[i],AutoSize=true},0,i);sum.Controls.Add(vals[i],1,i);}body.Controls.Add(sum,1,0);lay.Controls.Add(top,0,0);lay.Controls.Add(body,0,1);p.Controls.Add(lay);return p;
    }

    void LoadPeriods()
    {
        try
        {
            var dt=Q("select KOD,AD,BASTAR,BITTAR,GRUP from DONEM order by BASTAR desc,GRUP");
            foreach(var c in new[]{periodG,periodI,periodE,periodB,periodO}){c.DisplayMember="AD";c.ValueMember="KOD";c.DataSource=dt.Copy();SelectPeriodForToday(c);}
            DateTime first=new(DateTime.Today.Year,DateTime.Today.Month,1), last=first.AddMonths(1).AddDays(-1);foreach(var d in new[]{gFrom,iFrom,eFrom})d.Value=first;foreach(var d in new[]{gTo,iTo,eTo})d.Value=last;
            WireAllButtons();
            RefreshFullTabs();
        }
        catch{}
    }

    void RefreshFullTabs()
    {
        if(string.IsNullOrEmpty(currentPk))return;
        try
        {
            var p=new FbParameter("@PK",currentPk);DateTime a=gFrom.Value.Date,b=gTo.Value.Date.AddDays(1);
            gGiris.DataSource=Q("select SIRA,GTARIH as GIRIS_TARIHI,GSAAT as GIRIS_SAATI,CTARIH as CIKIS_TARIHI,CSAAT as CIKIS_SAATI,GTUR,CTUR from GIRCIK where PKNO=@PK and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by coalesce(GTARIH,CTARIH)",p,new FbParameter("@A",a),new FbParameter("@B",b));
            a=iFrom.Value.Date;b=iTo.Value.Date.AddDays(1);gIzin.DataSource=Q("select SIRA,TARIH,BASSAAT,BITSAAT,SURESAAT,TIP,MAZERET from OZELIZIN where PKNO=@PK and TARIH>=@A and TARIH<@B order by TARIH",new FbParameter("@PK",currentPk),new FbParameter("@A",a),new FbParameter("@B",b));
            a=eFrom.Value.Date;b=eTo.Value.Date.AddDays(1);gEkk.DataSource=Q("select KOD,TARIH as ISLEM_TARIHI,VTARIH as VERILIS_TARIHI,TURKOD as TURU,MIKTAR,ACIKLAMA from AVANS where PKNO=@PK and TARIH>=@A and TARIH<@B order by TARIH",new FbParameter("@PK",currentPk),new FbParameter("@A",a),new FbParameter("@B",b));
            LoadBilgiOdemeClassic();
        }catch(Exception ex){MessageBox.Show(ex.Message,"Personel Sekmeleri");}
    }
    (DateTime A,DateTime B) PeriodDates(ComboBox c)
    {
        if(c.SelectedItem is DataRowView r && r["BASTAR"]!=DBNull.Value && r["BITTAR"]!=DBNull.Value)return(((DateTime)r["BASTAR"]).Date,((DateTime)r["BITTAR"]).Date);
        var a=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);return(a,a.AddMonths(1).AddDays(-1));
    }

    void LoadBilgiOdeme()
    {
        var d=PeriodDates(periodB);var b=d.B.AddDays(1);
        gBilgi.DataSource=Q("select TARIH,GIRIS as NC,SAAT2 as M50,SAAT3 as M100,SAAT4 as UIZIN,SAAT5,SAAT6,SAAT7,SAAT8,SAAT9,DEVAMSIZLIKS as DEVAMSIZLIK,GECS as GEC_KALMA,EKSIKS as EKSIK_SURE from PUANTAJ where PKNO=@PK and TARIH>=@A and TARIH<@B order by TARIH",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",b));
        gBilgi.DefaultCellStyle.BackColor=Color.Black;gBilgi.DefaultCellStyle.ForeColor=Color.White;gBilgi.ColumnHeadersDefaultCellStyle.BackColor=SystemColors.Control;gBilgi.ColumnHeadersDefaultCellStyle.ForeColor=Color.Black;gBilgi.EnableHeadersVisualStyles=false;
        d=PeriodDates(periodO);b=d.B.AddDays(1);var pu=Q("select coalesce(sum(GUN1),0) NG,coalesce(sum(DAKIKA1),0) ND,coalesce(sum(DEVAMSIZLIKG),0) DG,coalesce(sum(GECG),0) GG,coalesce(sum(ERKENG),0) EG,coalesce(sum(EKSIKG),0) XG from PUANTAJ where PKNO=@PK and TARIH>=@A and TARIH<@B",new FbParameter("@PK",currentPk),new FbParameter("@A",d.A),new FbParameter("@B",b));
        var kr=Q("select MAAS from KIMLIK where PKNO=@PK",new FbParameter("@PK",currentPk));decimal maas=kr.Rows.Count==0||kr.Rows[0][0]==DBNull.Value?0:Convert.ToDecimal(kr.Rows[0][0]);var r=pu.Rows[0];decimal ng=Convert.ToDecimal(r["NG"]),dg=Convert.ToDecimal(r["DG"]),normal=Math.Round(maas/30m*ng,2),kes=Math.Round(maas/30m*dg,2),net=normal-kes;
        var t=new DataTable();t.Columns.Add("Bordro Alanları");t.Columns.Add("Gün");t.Columns.Add("Saat");t.Columns.Add("Ücret");void Add(string n,object gun,object saat,decimal u)=>t.Rows.Add(n,gun,saat,u.ToString("N2"));
        Add("Normal Çalışma",ng,Minutes(Convert.ToDecimal(r["ND"])),normal);Add("% 50 Mesai",0,"",0);Add("% 100 Mesai",0,"",0);Add("Ücretsiz İzin",0,"",0);for(int i=5;i<=9;i++)Add(i.ToString(),0,"",0);Add("Devamsızlık",dg,"",-kes);Add("Geç Kalma",r["GG"],"",0);Add("Eksik Süre",r["XG"],"",0);Add("Erken Çıkma",r["EG"],"",0);gOdeme.DataSource=t;
        payNormal.Text=$"{Minutes(Convert.ToDecimal(r["ND"]))}   {ng}   {normal:N2}";payKes.Text=kes.ToString("N2");payEk.Text="0,00";payNet.Text=net.ToString("N2");
    }

    string Minutes(decimal m)=>$"{(int)(m/60):00}:{(int)(m%60):00}";
    void PrintReport(string title)
    {
        if(currentPk=="")return;var doc=new PrintDocument{DocumentName=title};
        doc.PrintPage+=(s,e)=>{var g=e.Graphics!;float y=45;using var h=new Font("Arial",14,FontStyle.Bold);using var n=new Font("Arial",9);g.DrawString(title,h,Brushes.Black,45,y);y+=35;g.DrawString($"Kart No: {currentPk}    Ad Soyad: {f.GetValueOrDefault("AD")?.Text} {f.GetValueOrDefault("SOYAD")?.Text}",n,Brushes.Black,45,y);y+=24;g.DrawString($"İşe Giriş: {f.GetValueOrDefault("IGTARIH")?.Text}    Maaş: {f.GetValueOrDefault("MAAS")?.Text}",n,Brushes.Black,45,y);y+=28;DataGridView? src=title.Contains("Giriş")?gGiris:title.Contains("İzin")?gIzin:title.Contains("Kazanç")?gEkk:gOdeme;foreach(DataGridViewRow r in src.Rows){if(r.IsNewRow)continue;string line=string.Join(" | ",r.Cells.Cast<DataGridViewCell>().Take(6).Select(c=>Convert.ToString(c.Value)));g.DrawString(line,n,Brushes.Black,45,y);y+=17;if(y>e.MarginBounds.Bottom-20){e.HasMorePages=true;return;}}};
        using var pv=new PrintPreviewDialog{Document=doc,Width=1000,Height=750};pv.ShowDialog(this);
    }

    void FilterDialog()
    {
        using var d=new Form{Text="Personel Listesi Filtreleme",Width=330,Height=150,StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog};var c=new ComboBox{Left=25,Top=20,Width=260,DropDownStyle=ComboBoxStyle.DropDownList};c.Items.AddRange(new object[]{"Aktif Personel","Tüm Personel","İşten Ayrılan Personel"});c.SelectedIndex=0;var b=new Button{Text="Uygula",Left=195,Top=60,Width=90,DialogResult=DialogResult.OK};d.Controls.Add(c);d.Controls.Add(b);d.AcceptButton=b;if(d.ShowDialog(this)!=DialogResult.OK)return;string w=c.SelectedIndex==0?" where ICTARIH is null":c.SelectedIndex==2?" where ICTARIH is not null":"";list.DataSource=Q("select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK"+w+" order by PKNO");
    }

    void ToggleSlider(){slider.Enabled=!slider.Enabled;MessageBox.Show(slider.Enabled?"Süreli personel kaydırma başladı.":"Süreli personel kaydırma durdu.","Personel");}
    void SalaryHistory(){if(currentPk=="")return;string cur=f.GetValueOrDefault("MAAS")?.Text??"";string old=f.GetValueOrDefault("EMAAS")?.Text??"";MessageBox.Show($"Kart No: {currentPk}\nMevcut Maaş: {cur}\nEski Maaş: {old}","Maaş Geçmişi");}
    bool wired;
    IEnumerable<Control> All(Control c){foreach(Control x in c.Controls){yield return x;foreach(var y in All(x))yield return y;}}
    void WireAllButtons()
    {
        if(wired)return;wired=true;
        foreach(TabPage p in tabs.TabPages)
        {
            var bs=All(p).OfType<Button>().ToList();
            if(p.Text=="Giriş ve Çıkışları")Wire(bs,AddGiris,EditGiris,DeleteGiris,DeleteAllGiris);
            if(p.Text=="İzinler")Wire(bs,AddIzinFull,EditIzinFull,DeleteIzin,DeleteAllIzin);
            if(p.Text=="Ek Kazanç Ve Kesintiler")Wire(bs,AddEkkFull,EditEkkFull,DeleteEkk,DeleteAllEkk);
        }
    }
    void Wire(List<Button> bs,Action add,Action edit,Action del,Action all)
    {
        foreach(var b in bs){if(b.Text=="Yeni Ekle")b.Click+=(_,_)=>add();else if(b.Text=="Değiştir")b.Click+=(_,_)=>edit();else if(b.Text=="Sil")b.Click+=(_,_)=>del();else if(b.Text=="Tümünü Sil")b.Click+=(_,_)=>all();}
    }
    int Next(string table,string col)=>Convert.ToInt32(S($"select coalesce(max({col}),0)+1 from {table}"));
    int Min(string s){var a=s.Split(':').Select(int.Parse).ToArray();return a[0]*60+a[1];}
    bool GirisDialog(ref DateTime d,ref string gir,ref string cik)
    {
        using var f0=new Form{Text="Giriş ve Çıkış",Width=340,Height=210,StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog};var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=4,Padding=new Padding(12)};p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));var dt=new DateTimePicker{Value=d,Format=DateTimePickerFormat.Short};var tg=new TextBox{Text=gir};var tc=new TextBox{Text=cik};Control[] cs={dt,tg,tc};string[] ls={"Tarih","Giriş Saati","Çıkış Saati"};for(int i=0;i<3;i++){p.Controls.Add(new Label{Text=ls[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,i);p.Controls.Add(cs[i],1,i);}var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK,Width=90};p.Controls.Add(ok,1,3);f0.AcceptButton=ok;f0.Controls.Add(p);if(f0.ShowDialog(this)!=DialogResult.OK)return false;d=dt.Value.Date;gir=tg.Text.Trim();cik=tc.Text.Trim();return true;
    }
    void AddGiris(){ShowGirisCikisEklemeClassic();}
    void EditGiris(){if(gGiris.CurrentRow==null)return;int s=Convert.ToInt32(gGiris.CurrentRow.Cells["SIRA"].Value);DateTime d=Convert.ToDateTime(gGiris.CurrentRow.Cells["GIRIS_TARIHI"].Value);string g=Convert.ToString(gGiris.CurrentRow.Cells["GIRIS_SAATI"].Value)??"08:30",c=Convert.ToString(gGiris.CurrentRow.Cells["CIKIS_SAATI"].Value)??"19:00";if(!GirisDialog(ref d,ref g,ref c))return;Exec("update GIRCIK set GTARIH=@D,GSAAT=@G,GDAKIKA=@GM,CTARIH=@D,CSAAT=@C,CDAKIKA=@CM where SIRA=@S and PKNO=@PK",new FbParameter("@D",d),new FbParameter("@G",g),new FbParameter("@GM",Min(g)),new FbParameter("@C",c),new FbParameter("@CM",Min(c)),new FbParameter("@S",s),new FbParameter("@PK",currentPk));RefreshFullTabs();}
    void DeleteGiris(){DeleteSelected(gGiris,"GIRCIK","SIRA");}
    void DeleteAllGiris(){DeleteAllPeriod("GIRCIK","GTARIH",gFrom.Value,gTo.Value);}
    bool IzinDialog(ref DateTime d,ref string tip,ref string maz)
    {
        using var f0=new Form{Text="İzin",Width=360,Height=210,StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog};var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=4,Padding=new Padding(12)};p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));var dt=new DateTimePicker{Value=d,Format=DateTimePickerFormat.Short};var tt=new TextBox{Text=tip};var tm=new TextBox{Text=maz};Control[] cs={dt,tt,tm};string[] ls={"Tarih","Tip","Mazeret"};for(int i=0;i<3;i++){p.Controls.Add(new Label{Text=ls[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,i);p.Controls.Add(cs[i],1,i);}var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK,Width=90};p.Controls.Add(ok,1,3);f0.AcceptButton=ok;f0.Controls.Add(p);if(f0.ShowDialog(this)!=DialogResult.OK)return false;d=dt.Value.Date;tip=tt.Text.Trim();maz=tm.Text.Trim();return true;
    }
    void AddIzin(){if(currentPk=="")return;DateTime d=DateTime.Today;string tip="Ücretsiz",maz="";if(!IzinDialog(ref d,ref tip,ref maz))return;Exec("insert into OZELIZIN (PKNO,SURESAAT,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) values (@PK,'07:30',450,4,@D,@T,@M,@S,'0')",new FbParameter("@PK",currentPk),new FbParameter("@D",d),new FbParameter("@T",tip),new FbParameter("@M",maz),new FbParameter("@S",Next("OZELIZIN","SIRA")));RefreshFullTabs();}
    void EditIzin(){if(gIzin.CurrentRow==null)return;int s=Convert.ToInt32(gIzin.CurrentRow.Cells["SIRA"].Value);DateTime d=Convert.ToDateTime(gIzin.CurrentRow.Cells["TARIH"].Value);string tip=Convert.ToString(gIzin.CurrentRow.Cells["TIP"].Value)??"",maz=Convert.ToString(gIzin.CurrentRow.Cells["MAZERET"].Value)??"";if(!IzinDialog(ref d,ref tip,ref maz))return;Exec("update OZELIZIN set TARIH=@D,TIP=@T,MAZERET=@M where SIRA=@S and PKNO=@PK",new FbParameter("@D",d),new FbParameter("@T",tip),new FbParameter("@M",maz),new FbParameter("@S",s),new FbParameter("@PK",currentPk));RefreshFullTabs();}
    void DeleteIzin(){DeleteSelected(gIzin,"OZELIZIN","SIRA");}
    void DeleteAllIzin(){DeleteAllPeriod("OZELIZIN","TARIH",iFrom.Value,iTo.Value);}

    bool EkkDialog(ref DateTime d,ref decimal miktar,ref string acik)
    {
        using var f0=new Form{Text="Ek Kazanç ve Kesinti",Width=370,Height=210,StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog};var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=4,Padding=new Padding(12)};var dt=new DateTimePicker{Value=d,Format=DateTimePickerFormat.Short};var tm=new TextBox{Text=miktar.ToString()};var ta=new TextBox{Text=acik};Control[] cs={dt,tm,ta};string[] ls={"Tarih","Miktar","Açıklama"};for(int i=0;i<3;i++){p.Controls.Add(new Label{Text=ls[i],AutoSize=true},0,i);p.Controls.Add(cs[i],1,i);}var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK};p.Controls.Add(ok,1,3);f0.AcceptButton=ok;f0.Controls.Add(p);if(f0.ShowDialog(this)!=DialogResult.OK)return false;d=dt.Value.Date;miktar=decimal.Parse(tm.Text);acik=ta.Text.Trim();return true;
    }
    void AddEkk(){if(currentPk=="")return;DateTime d=DateTime.Today;decimal m=0;string a="";if(!EkkDialog(ref d,ref m,ref a))return;Exec("insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@PK,@D,@M,@D,2,@K,@A,1,1,@C)",new FbParameter("@PK",currentPk),new FbParameter("@D",d),new FbParameter("@M",m),new FbParameter("@K",Next("AVANS","KOD")),new FbParameter("@A",Math.Abs(m)),new FbParameter("@C",a));RefreshFullTabs();}
    void EditEkk(){if(gEkk.CurrentRow==null)return;int k=Convert.ToInt32(gEkk.CurrentRow.Cells["KOD"].Value);DateTime d=Convert.ToDateTime(gEkk.CurrentRow.Cells["ISLEM_TARIHI"].Value);decimal m=Convert.ToDecimal(gEkk.CurrentRow.Cells["MIKTAR"].Value);string a=Convert.ToString(gEkk.CurrentRow.Cells["ACIKLAMA"].Value)??"";if(!EkkDialog(ref d,ref m,ref a))return;Exec("update AVANS set TARIH=@D,VTARIH=@D,MIKTAR=@M,TOPMIKTAR=@A,ACIKLAMA=@C where KOD=@K and PKNO=@PK",new FbParameter("@D",d),new FbParameter("@M",m),new FbParameter("@A",Math.Abs(m)),new FbParameter("@C",a),new FbParameter("@K",k),new FbParameter("@PK",currentPk));RefreshFullTabs();}
    void DeleteEkk(){DeleteSelected(gEkk,"AVANS","KOD");}
    void DeleteAllEkk(){DeleteAllPeriod("AVANS","TARIH",eFrom.Value,eTo.Value);}

    void DeleteSelected(DataGridView g,string table,string key)
    {
        if(g.CurrentRow==null)return;if(MessageBox.Show("Seçili kayıt silinsin mi?","Sil",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;var v=g.CurrentRow.Cells[key].Value;Exec($"delete from {table} where PKNO=@PK and {key}=@K",new FbParameter("@PK",currentPk),new FbParameter("@K",v));RefreshFullTabs();
    }
    void DeleteAllPeriod(string table,string dateCol,DateTime a,DateTime b)
    {
        if(MessageBox.Show("Seçili tarih aralığındaki tüm kayıtlar silinsin mi?","Tümünü Sil",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;Exec($"delete from {table} where PKNO=@PK and {dateCol}>=@A and {dateCol}<@B",new FbParameter("@PK",currentPk),new FbParameter("@A",a.Date),new FbParameter("@B",b.Date.AddDays(1)));RefreshFullTabs();
    }
}
