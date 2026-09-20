using FirebirdSql.Data.FirebirdClient;
using System.Data;
using System.Drawing;
using System.Globalization;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Personnel;

namespace HKN.Personel.Native;

public partial class PersonelForm : Form
{
    readonly PdksOptions options = PdksOptions.FromEnvironment();
    readonly FirebirdDatabase db;
    readonly DataGridView list = new() { Dock=DockStyle.Fill, ReadOnly=true, AllowUserToAddRows=false, SelectionMode=DataGridViewSelectionMode.FullRowSelect, MultiSelect=false, AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill };
    readonly Dictionary<string,TextBox> f = new();
    readonly TabControl tabs = new() { Dock=DockStyle.Fill };
    readonly StatusStrip status = new();
    readonly ToolStripStatusLabel stats = new() { Spring=true, TextAlign=ContentAlignment.MiddleLeft };
    string currentPk = "";

    public PersonelForm()
    {
        db = new FirebirdDatabase(options);
        Text="Personel Bilgileri"; StartPosition=FormStartPosition.CenterScreen; Size=new Size(940,731); MinimumSize=new Size(940,731);
        FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; MinimizeBox=false;
        Font=new Font("Microsoft Sans Serif",8.25f); BackColor=SystemColors.Control;
        BuildMenuFull(); BuildUiClassic(); list.SelectionChanged += (_,_) => { SyncPeriodsToPerson(); RefreshFullTabs(); }; Shown += (_,_) => { Reload(); LoadPeriods(); SyncPeriodsToPerson(); RefreshFullTabs(); ApplyClassicGridStyles(); };
    }
    void BuildMenu()
    {
        var m=new MenuStrip();
        m.Items.Add(new ToolStripMenuItem("Raporlar", null,
            new ToolStripMenuItem("Ayrıntılı Kişisel Bordro"), new ToolStripMenuItem("Personel Bilgi Formu"), new ToolStripMenuItem("Kişisel Giriş Çıkış Raporu")));
        m.Items.Add(new ToolStripMenuItem("İşlemler", null,
            new ToolStripMenuItem("Personel Listesi Filtreleme"), new ToolStripMenuItem("Süreli Personel Kaydırma"), new ToolStripMenuItem("Hesapla"), new ToolStripMenuItem("Maaş Geçmişi")));
        MainMenuStrip=m; Controls.Add(m);
    }

    void BuildUi()
    {
        var root=new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, RowCount=2, Padding=new Padding(8,28,8,0) };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,38)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,62));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        BuildList(root); BuildRight(root); BuildBottom(root);
        Controls.Add(root); status.Items.Add(stats); status.Dock=DockStyle.Bottom; Controls.Add(status);
    }

    void BuildList(TableLayoutPanel root)
    {
        list.SelectionChanged += (_,_) => { if(list.CurrentRow?.Cells["PKNO"].Value is object v) LoadPerson(v.ToString()!); };
        root.Controls.Add(list,0,0);
    }
    void BuildRight(TableLayoutPanel root)
    {
        var right=new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=2 };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute,150)); right.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var top=new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=4, RowCount=6, Padding=new Padding(8) };
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92)); top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,45)); top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,80)); top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,55));
        AddField(top,0,"Kart Numarası","PKNO"); AddField(top,1,"Grubu","GRUPAD",false);
        AddField(top,2,"Adı","AD"); AddField(top,3,"Bölümü","BOLUMAD",false);
        AddField(top,4,"Soyadı","SOYAD"); AddField(top,5,"Durum","DURUMAD",false);
        AddField(top,6,"Maaşı","MAAS"); AddField(top,7,"Servis","SERVISAD",false);
        AddField(top,8,"İşe Giriş Tarihi","IGTARIH"); AddField(top,9,"Görev","GOREVAD",false);
        AddField(top,10,"Çıkış Tarihi","ICTARIH"); AddField(top,11,"Firma","FIRMAAD",false);
        right.Controls.Add(top,0,0);
        BuildTabs(); right.Controls.Add(tabs,0,1);
        root.Controls.Add(right,1,0);
    }

    void AddField(TableLayoutPanel p,int i,string label,string key,bool edit=true)
    {
        int row=i/2, col=(i%2)*2; var l=new Label { Text=label, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft };
        var t=new TextBox { Dock=DockStyle.Fill, ReadOnly=!edit }; f[key]=t; p.Controls.Add(l,col,row); p.Controls.Add(t,col+1,row);
    }
    void BuildTabs()
    {
        var pInfo=new TabPage("Personel Bilgileri"); var inner=new TabControl { Dock=DockStyle.Fill };
        var kimlik=new TabPage("Kimlik Bilgileri"); var tl=new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=4, RowCount=8, Padding=new Padding(12) };
        tl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,115)); tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50)); tl.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,115)); tl.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        string[] a={"Ulusal Kimlik No","UKNO","Doğum Tarihi","DTARIH","Nüfusa Kayıtlı İl","IL","Cinsiyeti","CINSIYET","Nüfusa Kayıtlı İlçe","ILCE","Kan Grubu","KGB","Doğum Yeri","DYER","Cilt No","CILTNO","Baba Adı","BABAAD","Sayfa No","SAYFANO","Ana Adı","ANAAD","Kayıt No","KAYITNO","Medeni Hali","MEDHAL","Uyruğu","UYRUK"};
        for(int i=0;i<a.Length;i+=2){int n=i/2,row=n/2,col=(n%2)*2; var l=new Label{Text=a[i],Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft}; var t=new TextBox{Dock=DockStyle.Fill}; f[a[i+1]]=t; tl.Controls.Add(l,col,row); tl.Controls.Add(t,col+1,row);}        
        kimlik.Controls.Add(tl); inner.TabPages.Add(kimlik); inner.TabPages.Add(new TabPage("Kişisel Bilgiler")); pInfo.Controls.Add(inner);
        tabs.TabPages.Add(pInfo); tabs.TabPages.Add(GridTab("Giriş ve Çıkışları","GIRCIK")); tabs.TabPages.Add(GridTab("İzinler","IZIN")); tabs.TabPages.Add(GridTab("Ek Kazanç Ve Kesintiler","AVANS")); tabs.TabPages.Add(new TabPage("Bilgi")); tabs.TabPages.Add(new TabPage("Ödemeler"));
    }

    TabPage GridTab(string title,string name)
    {
        var p=new TabPage(title); var g=new DataGridView { Name=name, Dock=DockStyle.Fill, ReadOnly=true, AllowUserToAddRows=false, AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill }; p.Controls.Add(g); return p;
    }
    void BuildBottom(TableLayoutPanel root)
    {
        var bar=new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.RightToLeft, Padding=new Padding(4) };
        var per=new Button{Text="Per. Bilgisi",Width=110,Height=28}; per.Click += (_,_)=> { if(currentPk!="") LoadPerson(currentPk); };
        var del=new Button{Text="Sil",Width=90,Height=28}; del.Click += (_,_)=> MarkExit();
        var edit=new Button{Text="Değiştir",Width=100,Height=28}; edit.Click += (_,_)=> SaveCurrent();
        var add=new Button{Text="Yeni Ekle",Width=100,Height=28}; add.Click += (_,_)=> NewPerson();
        bar.Controls.Add(per); bar.Controls.Add(del); bar.Controls.Add(edit); bar.Controls.Add(add);
        root.Controls.Add(bar,1,1);
        var search=new TextBox { Width=260, PlaceholderText="Kart No / Ad / Soyad ara" }; search.TextChanged += (_,_)=>Filter(search.Text);
        var leftBar=new FlowLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(4)}; leftBar.Controls.Add(new Label{Text="Arama Alanı",AutoSize=true,Padding=new Padding(0,6,5,0)}); leftBar.Controls.Add(search); root.Controls.Add(leftBar,0,1);
    }

    DataTable Q(string sql, params FbParameter[] pars)
    {
        return db.Query(sql, pars);
    }

    object? S(string sql)
    {
        return db.Scalar(sql);
    }
    void Reload()
    {
        try
        {
            var dt=Q("select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK where ICTARIH is null order by PKNO"); list.DataSource=dt;
            if(list.Columns.Contains("PKNO")) list.Columns["PKNO"].HeaderText="Kart No";
            if(list.Columns.Contains("AD")) list.Columns["AD"].HeaderText="Adı"; if(list.Columns.Contains("SOYAD")) list.Columns["SOYAD"].HeaderText="Soyadı";
            if(list.Columns.Contains("IGTARIH")) list.Columns["IGTARIH"].HeaderText="İş. Gir. Tar."; if(list.Columns.Contains("ICTARIH")) list.Columns["ICTARIH"].HeaderText="İş. Çıkış Tar.";
            int active=Convert.ToInt32(S("select count(*) from KIMLIK where ICTARIH is null")); int total=Convert.ToInt32(S("select count(*) from KIMLIK"));
            stats.Text=$"Aktif Çalışan Personel: {active}        İşten Ayrılan Personel: {total-active}        Toplam Personel: {total}        Listelenen Personel: {dt.Rows.Count}";
        }
        catch(Exception ex){ MessageBox.Show(ex.Message,"Veritabanı Hatası",MessageBoxButtons.OK,MessageBoxIcon.Error); }
    }

    void Filter(string s)
    {
        if(list.DataSource is not DataTable dt) return; dt.DefaultView.RowFilter=PersonnelListFilter.Build(s);
    }

    string Fmt(object v)
    {
        if(v==DBNull.Value || v is null) return ""; if(v is DateTime d) return d.ToString("dd.MM.yyyy"); return Convert.ToString(v,CultureInfo.CurrentCulture)??"";
    }
    void LoadPerson(string pk)
    {
        try
        {
            currentPk=pk;
            var sql=@"select K.*, 
                (select AD from GRUP G where G.KOD=K.GRUP) GRUPAD,
                (select AD from BOLUM B where B.KOD=K.BOLUM) BOLUMAD,
                (select AD from DURUM D where D.KOD=K.DURUM) DURUMAD,
                (select AD from SERVIS S where S.KOD=K.SERVIS) SERVISAD,
                (select AD from GOREV R where R.KOD=K.GOREV) GOREVAD,
                (select AD from FIRMA F where F.KOD=K.SIRKET) FIRMAAD
                from KIMLIK K where K.PKNO=@PK";
            var dt=Q(sql,new FbParameter("@PK",pk)); if(dt.Rows.Count==0) return; var r=dt.Rows[0];
            foreach(var kv in f) if(dt.Columns.Contains(kv.Key)) kv.Value.Text=Fmt(r[kv.Key]);
            if(dt.Columns.Contains("RESIM"))LoadPersonPhoto(r["RESIM"]);
            LoadChild("GIRCIK", "select GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA from GIRCIK where PKNO=@PK order by coalesce(GTARIH,CTARIH) desc rows 100", pk);
            LoadChild("IZIN", "select TARIH,TIP,MAZERET,BASSAAT,BITSAAT,SURESAAT from OZELIZIN where PKNO=@PK order by TARIH desc rows 100", pk);
            LoadChild("AVANS", "select TARIH,MIKTAR,VTARIH,TURKOD,ACIKLAMA from AVANS where PKNO=@PK order by TARIH desc rows 100", pk);
            RefreshFullTabs();
        }
        catch(Exception ex){ MessageBox.Show(ex.Message,"Personel",MessageBoxButtons.OK,MessageBoxIcon.Error); }
    }

    void LoadChild(string name,string sql,string pk)
    {
        var g=tabs.TabPages.Cast<TabPage>().SelectMany(x=>x.Controls.Cast<Control>()).OfType<DataGridView>().FirstOrDefault(x=>x.Name==name); if(g!=null) g.DataSource=Q(sql,new FbParameter("@PK",pk));
    }
    int Exec(string sql, params FbParameter[] pars)
    {
        return db.Execute(sql, pars);
    }

    object DbVal(string key)
    {
        var s=f.TryGetValue(key,out var t)?t.Text.Trim():"";
        if(string.IsNullOrEmpty(s)) return DBNull.Value;
        if(key is "IGTARIH" or "ICTARIH" or "DTARIH") return DateTime.Parse(s,new CultureInfo("tr-TR"));
        if(key=="MAAS") return decimal.Parse(s,CultureInfo.CurrentCulture);
        return s;
    }

    void SaveCurrent()
    {
        if(currentPk=="") return;
        try
        {
            string[] keys={"AD","SOYAD","MAAS","IGTARIH","ICTARIH","UKNO","DTARIH","IL","ILCE","CINSIYET","KGB","DYER","CILTNO","BABAAD","SAYFANO","ANAAD","KAYITNO","MEDHAL","UYRUK"};
            var set=new List<string>(); var ps=new List<FbParameter>();
            foreach(var k in keys){set.Add(k+"=@"+k); ps.Add(new FbParameter("@"+k,DbVal(k)));} ps.Add(new FbParameter("@PK",currentPk));
            Exec("update KIMLIK set "+string.Join(',',set)+" where PKNO=@PK",ps.ToArray());
            MessageBox.Show("Personel bilgileri kaydedildi.","KY PDKS"); Reload(); LoadPerson(currentPk);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Kayıt Hatası",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
    void NewPerson()
    {
        using var d=new Form{Text="Yeni Personel",Width=360,Height=250,StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false};
        var p=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=5,Padding=new Padding(12)}; p.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95)); p.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var pk=new TextBox(); var ad=new TextBox(); var soy=new TextBox(); var gir=new TextBox{Text=DateTime.Today.ToString("dd.MM.yyyy")};
        void R(int r,string l,Control c){p.Controls.Add(new Label{Text=l,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,r); p.Controls.Add(c,1,r);} R(0,"Kart No",pk);R(1,"Adı",ad);R(2,"Soyadı",soy);R(3,"İşe Giriş",gir);
        var ok=new Button{Text="Kaydet",DialogResult=DialogResult.OK,Width=90}; var fp=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft}; fp.Controls.Add(ok); p.Controls.Add(fp,1,4); d.AcceptButton=ok; d.Controls.Add(p);
        if(d.ShowDialog(this)!=DialogResult.OK) return;
        try
        {
            var employeeCode=PdksValidation.EmployeeCode(pk.Text);
            var firstName=PdksValidation.RequiredText(ad.Text,"Adı");
            var lastName=PdksValidation.RequiredText(soy.Text,"Soyadı");
            var employmentStart=DateTime.Parse(gir.Text,new CultureInfo("tr-TR"));
            int ps=Convert.ToInt32(S("select coalesce(max(PS),0)+1 from KIMLIK"));
            Exec("insert into KIMLIK (PS,PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,DURUM,GOREV,MAAS,KULIZIN,CCKSAY) values (@PS,@PK,@AD,@SOY,@G,1,1,2,1,0,0,0)", new FbParameter("@PS",ps),new FbParameter("@PK",employeeCode),new FbParameter("@AD",firstName.ToUpperInvariant()),new FbParameter("@SOY",lastName.ToUpperInvariant()),new FbParameter("@G",employmentStart)); Reload();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Yeni Personel",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
    void MarkExit()
    {
        if(currentPk=="") return;
        if(MessageBox.Show($"{currentPk} kartlı personel bugün işten ayrılmış olarak işaretlensin mi?","Personel",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes) return;
        try { Exec("update KIMLIK set ICTARIH=@D where PKNO=@PK",new FbParameter("@D",DateTime.Today),new FbParameter("@PK",currentPk)); Reload(); LoadPerson(currentPk); }
        catch(Exception ex){MessageBox.Show(ex.Message,"İşten Çıkış",MessageBoxButtons.OK,MessageBoxIcon.Error);}
    }
}
