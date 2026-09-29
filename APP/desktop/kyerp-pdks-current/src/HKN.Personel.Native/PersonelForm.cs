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
        Text="Personel Bilgileri"; StartPosition=FormStartPosition.CenterScreen; Size=new Size(1220,760); MinimumSize=new Size(980,640);
        FormBorderStyle=FormBorderStyle.Sizable; MaximizeBox=true; MinimizeBox=true;
        Font=new Font("Segoe UI",9f); BackColor=Color.FromArgb(246,249,253); DoubleBuffered=true; SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.AllPaintingInWmPaint,true);
        BuildMenuFull();
        BuildUiClassic();
        Shown += (_,_) =>
        {
            fullTabsReady=false;
            ApplyModernTabLayoutAndPerformance();
            Reload();
            LoadPeriods();
            RepairRecordActionBars();
            fullTabsReady=true;
            SyncPeriodsToPerson();
            RefreshSelectedTab();
            ApplyClassicGridStyles();
        };
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

    int Exec(string sql, params FbParameter[] pars)
    {
        return db.Execute(sql, pars);
    }

    void Reload()
    {
        list.DataSource=Q("select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK order by PKNO");
        stats.Text=$"{list.Rows.Count} personel";
    }

    void Filter(string s)
    {
        var t=(s??"").Trim();
        if(t==""){Reload();return;}
        list.DataSource=Q("select PKNO,AD,SOYAD,IGTARIH,ICTARIH from KIMLIK where PKNO containing @P or AD containing @P or SOYAD containing @P order by PKNO",new FbParameter("@P",t));
    }

    void LoadPerson(string pk)
    {
        currentPk=pk; var dt=Q("select first 1 k.*,g.AD as GRUPAD,b.AD as BOLUMAD,s.AD as SERVISAD,d.AD as DURUMAD,go.AD as GOREVAD,fi.AD as FIRMAAD from KIMLIK k left join GRUP g on g.KOD=k.GRUP left join BOLUM b on b.KOD=k.BOLUM left join SERVIS s on s.KOD=k.SERVIS left join DURUM d on d.KOD=k.DURUM left join GOREV go on go.KOD=k.GOREV left join FIRMA fi on fi.KOD=k.SIRKET where k.PKNO=@PK",new FbParameter("@PK",pk));
        if(dt.Rows.Count==0)return; var r=dt.Rows[0]; foreach(var kv in f) if(dt.Columns.Contains(kv.Key)) kv.Value.Text=Convert.ToString(r[kv.Key])??""; else if(dt.Columns.Contains(kv.Key.Replace("AD",""))) kv.Value.Text=Convert.ToString(r[kv.Key.Replace("AD","")])??"";
    }

    void SaveCurrent()
    {
        if(currentPk=="")return;
        Exec("update KIMLIK set AD=@A,SOYAD=@S where PKNO=@P",new FbParameter("@A",f["AD"].Text),new FbParameter("@S",f["SOYAD"].Text),new FbParameter("@P",currentPk)); Reload();
    }

    void NewPerson()
    {
        MessageBox.Show("Yeni personel ekleme için Yeni Ekle düğmesini kullanın.","Personel");
    }

    void MarkExit()
    {
        if(currentPk=="")return;
        if(MessageBox.Show("Personel pasif/çıkış olarak işaretlensin mi?","Personel",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        Exec("update KIMLIK set ICTARIH=coalesce(ICTARIH,current_date) where PKNO=@P",new FbParameter("@P",currentPk)); Reload();
    }

    public void SelectPerson(string cardNo)
    {
        foreach(DataGridViewRow row in list.Rows) if(Convert.ToString(row.Cells["PKNO"].Value)==cardNo){row.Selected=true;list.CurrentCell=row.Cells["PKNO"];LoadPerson(cardNo);break;}
    }
}
