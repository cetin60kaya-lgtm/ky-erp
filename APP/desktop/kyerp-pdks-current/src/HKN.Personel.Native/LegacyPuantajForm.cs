using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyPuantajForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly TabControl tabs=new(){Dock=DockStyle.Fill};
    readonly Dictionary<TabPage,FilterSet> filters=[];
    readonly ListBox people=new(){Location=new Point(312,0),Size=new Size(297,321),IntegralHeight=false};
    readonly ProgressBar progress1=new(){Location=new Point(16,328),Size=new Size(630,25)};
    readonly ProgressBar progress2=new(){Location=new Point(16,356),Size=new Size(630,25)};

    public LegacyPuantajForm()
    {
        Text="Günlük ve Aylık Puantaj İşlemleri";StartPosition=FormStartPosition.CenterParent;ClientSize=new Size(673,465);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();Shown+=(_,_)=>Init();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),AutoSize=true};
    static TextBox E(int x,int y,int w=40)=>new(){Location=new Point(x,y),Size=new Size(w,21)};
    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static ComboBox C(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Button B(string t,int x,int y,int w,int h=41)=>new(){Text=t,Location=new Point(x,y),Size=new Size(w,h),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold)};

    void Build()
    {
        var daily=new TabPage("Günlük Puantaj");var monthly=new TabPage("Aylık Puantaj");tabs.TabPages.AddRange([daily,monthly]);Controls.Add(tabs);
        filters[daily]=BuildDaily(daily);filters[monthly]=BuildMonthly(monthly);
    }

    FilterSet BuildDaily(TabPage p)
    {
        var f=new FilterSet(E(128,16),E(128,40),D(128,64,177),D(128,88,177),C(80,115,224),C(80,139,224),C(80,163,224),C(80,187,224),C(80,211,224),C(80,235,224));
        p.Controls.AddRange([L("Kart No Başlangıç",40,24),L("Kart No Bitiş",40,48),L("Başlangıç Tarihi",40,72),L("Bitiş Tarihi",40,96),L("Grup",40,123),L("Bölüm",40,147),L("Servis",40,171),L("Durum",40,195),L("Görev",40,219),L("Firma",40,243),f.CardStart,f.CardEnd,f.Start,f.End,f.Group,f.Department,f.Service,f.Status,f.Duty,f.Company,people,progress1,progress2]);
        var calc=B("Hesapla",96,384,153);var result=B("Puantaj Sonuçları",408,384,153);calc.Click+=(_,_)=>Calculate(f);result.Click+=(_,_)=>ShowResults(f);p.Controls.AddRange([calc,result]);Hook(f);return f;
    }

    FilterSet BuildMonthly(TabPage p)
    {
        var f=new FilterSet(E(320,32),E(320,56),D(320,80,175),D(320,104,175),C(320,131,200),C(320,155,200),C(320,179,200),C(320,203,200),C(320,227,200),C(320,251,200));
        p.Controls.AddRange([L("Kart No Başlangıç",200,40),L("Kart No Bitiş",200,64),L("Başlangıç Tarihi",200,88),L("Bitiş Tarihi",200,112),L("Grup",200,139),L("Bölüm",200,163),L("Servis",200,187),L("Durum",200,211),L("Görev",200,235),L("Firma",200,259),f.CardStart,f.CardEnd,f.Start,f.End,f.Group,f.Department,f.Service,f.Status,f.Duty,f.Company]);
        var bar=new ProgressBar{Location=new Point(16,324),Size=new Size(630,25)};var calc=B("Hesapla",240,376,217);calc.Click+=(_,_)=>Calculate(f,bar);p.Controls.AddRange([bar,calc]);Hook(f);return f;
    }

    void Init()
    {
        foreach(var f in filters.Values)
        {
            f.Start.Value=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);f.End.Value=DateTime.Today;
            LoadLookup(f.Group,"GRUP");LoadLookup(f.Department,"BOLUM");LoadLookup(f.Service,"SERVIS");LoadLookup(f.Status,"DURUM");LoadLookup(f.Duty,"GOREV");LoadLookup(f.Company,"FIRMA");
        }
        ReloadPeople(filters[tabs.TabPages[0]]);
    }

    void Hook(FilterSet f)
    {
        f.CardStart.TextChanged+=(_,_)=>ReloadPeople(f);f.CardEnd.TextChanged+=(_,_)=>ReloadPeople(f);
        foreach(var c in f.Combos)c.SelectedIndexChanged+=(_,_)=>ReloadPeople(f);
    }

    void LoadLookup(ComboBox c,string table)
    {
        var dt=db.Query($"select KOD,AD from {table} order by KOD");var r=dt.NewRow();r["KOD"]=-1;r["AD"]="Tümü";dt.Rows.InsertAt(r,0);dt.Columns.Add("TEXT",typeof(string),"AD");c.DataSource=dt;c.SelectedValue=-1;
    }

    (string Sql,List<FbParameter> Params) EmployeeFilter(FilterSet f)
    {
        var w=new List<string>{"(k.ICTARIH is null or k.ICTARIH>=@A)","(k.IGTARIH is null or k.IGTARIH<=@B)"};var p=new List<FbParameter>{new("@A",f.Start.Value.Date),new("@B",f.End.Value.Date)};
        if(!string.IsNullOrWhiteSpace(f.CardStart.Text)){w.Add("k.PKNO>=@KS");p.Add(new("@KS",f.CardStart.Text.Trim().PadLeft(5,'0')));}if(!string.IsNullOrWhiteSpace(f.CardEnd.Text)){w.Add("k.PKNO<=@KB");p.Add(new("@KB",f.CardEnd.Text.Trim().PadLeft(5,'0')));}
        Add(w,p,"k.GRUP",f.Group,"G");Add(w,p,"k.BOLUM",f.Department,"D");Add(w,p,"k.SERVIS",f.Service,"S");Add(w,p,"k.DURUM",f.Status,"U");Add(w,p,"k.GOREV",f.Duty,"R");Add(w,p,"k.SIRKET",f.Company,"F");return(string.Join(" and ",w),p);
    }
    static void Add(List<string>w,List<FbParameter>p,string field,ComboBox c,string key){if(c.SelectedValue is int v&&v>=0){w.Add($"{field}=@{key}");p.Add(new FbParameter("@"+key,v));}}

    void ReloadPeople(FilterSet f)
    {
        if(!IsHandleCreated)return;try{var q=EmployeeFilter(f);var dt=db.Query($"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH from KIMLIK k where {q.Sql} order by k.PKNO",q.Params.ToArray());people.BeginUpdate();people.Items.Clear();foreach(DataRow r in dt.Rows)people.Items.Add($"{r["PKNO"],-6} {r["AD"]} {r["SOYAD"]}");people.EndUpdate();}catch{ }
    }

    void Calculate(FilterSet f,ProgressBar? bar=null)
    {
        var pb=bar??progress1;try
        {
            if(f.End.Value.Date<f.Start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            var q=EmployeeFilter(f);var emp=db.Query($"select k.PKNO,k.BOLUM from KIMLIK k where {q.Sql}",q.Params.ToArray());if(emp.Rows.Count==0){MessageBox.Show("Seçime uygun personel bulunamadı.",Text);return;}
            if(MessageBox.Show($"{f.Start.Value:dd.MM.yyyy} - {f.End.Value:dd.MM.yyyy} aralığındaki gerçek giriş-çıkış kayıtlarından puantaj oluşturulsun/güncellensin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            var allowed=emp.AsEnumerable().ToDictionary(r=>Convert.ToString(r["PKNO"])??"",r=>r["BOLUM"]==DBNull.Value?(int?)null:Convert.ToInt32(r["BOLUM"]));
            var gc=db.Query("select PKNO,GTARIH,GSAAT,CTARIH,CSAAT from GIRCIK where GTARIH>=@A and GTARIH<@B order by PKNO,GTARIH",new FbParameter("@A",f.Start.Value.Date),new FbParameter("@B",f.End.Value.Date.AddDays(1)));
            var rows=gc.AsEnumerable().Where(r=>allowed.ContainsKey(Convert.ToString(r["PKNO"])??"")).ToArray();pb.Minimum=0;pb.Maximum=Math.Max(1,rows.Length);pb.Value=0;
            var changed=db.InTransaction((con,tr)=>{var n=0;foreach(var r in rows){var pk=Convert.ToString(r["PKNO"])??"";var day=Convert.ToDateTime(r["GTARIH"]).Date;var gi=Convert.ToString(r["GSAAT"])??"";var ci=r["CSAAT"]==DBNull.Value?"":Convert.ToString(r["CSAAT"])??"";using var chk=FirebirdDatabase.CreateCommand(con,tr,"select count(*) from PUANTAJ where PKNO=@P and TARIH>=@T and TARIH<@N",new FbParameter("@P",pk),new FbParameter("@T",day),new FbParameter("@N",day.AddDays(1)));var exists=Convert.ToInt32(chk.ExecuteScalar()??0)>0;if(exists){using var u=FirebirdDatabase.CreateCommand(con,tr,"update PUANTAJ set GIRIS=@GI,CIKIS=@CI,STATUS='ÇALIŞTI',BOLUM=@D,DEVAMSIZLIKG=0 where PKNO=@P and TARIH>=@T and TARIH<@N",new FbParameter("@GI",gi),new FbParameter("@CI",ci),new FbParameter("@D",allowed[pk]??(object)DBNull.Value),new FbParameter("@P",pk),new FbParameter("@T",day),new FbParameter("@N",day.AddDays(1)));u.ExecuteNonQuery();}else{using var ins=FirebirdDatabase.CreateCommand(con,tr,"insert into PUANTAJ (PKNO,TARIH,GIRIS,CIKIS,STATUS,BOLUM,DEVAMSIZLIKG) values (@P,@T,@GI,@CI,'ÇALIŞTI',@D,0)",new FbParameter("@P",pk),new FbParameter("@T",day),new FbParameter("@GI",gi),new FbParameter("@CI",ci),new FbParameter("@D",allowed[pk]??(object)DBNull.Value));ins.ExecuteNonQuery();}n++;}return n;});
            pb.Value=pb.Maximum;if(bar is null){progress2.Minimum=0;progress2.Maximum=1;progress2.Value=1;}MessageBox.Show($"Puantaj işlemi tamamlandı. {changed} gerçek giriş-çıkış kaydı işlendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void ShowResults(FilterSet f)
    {
        try{var dt=db.Query("select p.PKNO,k.AD,k.SOYAD,p.TARIH,p.GIRIS,p.CIKIS,p.STATUS,p.DEVAMSIZLIKG,p.GECG,p.ERKENG,p.EKSIKG from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO where p.TARIH>=@A and p.TARIH<@B order by p.TARIH,p.PKNO",new FbParameter("@A",f.Start.Value.Date),new FbParameter("@B",f.End.Value.Date.AddDays(1)));using var d=new Form{Text="Puantaj Sonuçları",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(900,520)};var g=new DataGridView{Dock=DockStyle.Fill,DataSource=dt,ReadOnly=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,AllowUserToAddRows=false};d.Controls.Add(g);d.ShowDialog(this);}catch(Exception ex){MessageBox.Show(ex.Message,"Puantaj Sonuçları",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    sealed record FilterSet(TextBox CardStart,TextBox CardEnd,DateTimePicker Start,DateTimePicker End,ComboBox Group,ComboBox Department,ComboBox Service,ComboBox Status,ComboBox Duty,ComboBox Company)
    { public IEnumerable<ComboBox> Combos=>[Group,Department,Service,Status,Duty,Company]; }
}
