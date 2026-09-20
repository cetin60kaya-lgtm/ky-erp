using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyGirisCikisForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new(){Location=new Point(0,128),Size=new Size(758,399),ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,RowHeadersWidth=22,AutoGenerateColumns=false};
    readonly TextBox cardStart = new(){Location=new Point(100,8),Size=new Size(40,21)};
    readonly TextBox cardEnd = new(){Location=new Point(100,32),Size=new Size(40,21)};
    readonly TextBox name = new(){Location=new Point(80,64),Size=new Size(175,21)};
    readonly ComboBox punch = new(){Location=new Point(336,66),Size=new Size(207,21),DropDownStyle=ComboBoxStyle.DropDownList};
    readonly DateTimePicker dateStart = D(272,8,176);
    readonly DateTimePicker dateEnd = D(272,32,176);
    readonly TextBox inFirst = T(480,8), inLast = T(600,8), outFirst = T(480,32), outLast = T(600,32);
    readonly CheckBox manual = new(){Text="Elle Girlilen Kayıtlar",Location=new Point(552,72),AutoSize=true};
    readonly ComboBox group = C(72,8,209), department=C(72,32,209), company=C(72,56,319), service=C(464,8,209), status=C(464,32,209), duty=C(464,56,209), sort=C(56,16,185);
    readonly StatusStrip statusBar = new(){Location=new Point(0,527),Size=new Size(761,23),SizingGrip=false};
    readonly ToolStripStatusLabel statusText = new(){Spring=true,TextAlign=ContentAlignment.MiddleLeft};
    readonly Button show = new(){Text="Göster",Location=new Point(693,19),Size=new Size(65,101),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold)};
    DataTable current = new();

    public LegacyGirisCikisForm()
    {
        Text="Giriş ve Çıkışlar";StartPosition=FormStartPosition.CenterScreen;Size=new Size(777,609);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build(); Shown+=(_,_)=>Init(); KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static TextBox T(int x,int y)=>new(){Location=new Point(x,y),Size=new Size(40,21),Text=":"};
    static ComboBox C(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Label L(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),AutoSize=true};

    void Build()
    {
        var tabs=new TabControl{Location=new Point(0,0),Size=new Size(689,121)};
        var p=new TabPage("Giriş Çıkış Paremetreleri");
        p.Controls.AddRange([L("Kart No Başlangıç",8,16),L("Kart No Bitiş",8,40),L("Adı",8,72),L("Kart Basma",272,74),L("> Giriş Saati <",528,9),L("Tarih Bitiş",176,40),L("Tarih Başlangıç",176,16),L("> Çıkış Saati <",528,33),cardStart,cardEnd,name,punch,dateStart,dateEnd,inLast,outLast,inFirst,outFirst,manual]);
        var f=new TabPage("Filtreleme");
        f.Controls.AddRange([L("Firma",8,64),L("Grubu",8,16),L("Bölümü",8,40),L("Servis",408,16),L("Durum",408,40),L("Görev",408,64),company,group,department,service,status,duty]);
        var s=new TabPage("Sıralama");s.Controls.AddRange([L("Sıralama",8,24),sort]); tabs.TabPages.AddRange([p,f,s]); Controls.Add(tabs);

        AddCol("PKNO","Kart No",55);AddCol("AD","Adı",90);AddCol("SOYAD","Soyadı",95);AddCol("GTARIH","Giriş Tarihi",85);AddCol("GSAAT","Giriş Saati",70);AddCol("GTUR","Giriş",45);AddCol("CTARIH","Çıkış Tarihi",85);AddCol("CSAAT","Çıkış Saati",70);AddCol("CTUR","Çıkış",45);AddCol("GRUPAD","Grubu",95);AddCol("BOLUMAD","Bölümü",95);
        grid.CellDoubleClick+=(_,_)=>EditSelected();Controls.Add(grid);Controls.Add(show);show.Click+=(_,_)=>Reload();
        statusBar.Items.Add(statusText);Controls.Add(statusBar);
        var menu=new MenuStrip{Dock=DockStyle.None,Location=new Point(690,0),Size=new Size(1,1),Visible=false};
        var ops=new ToolStripMenuItem("İşlemler");
        var del=MI("Sil",DeleteSelected);var delAll=MI("Tümünü Sil",()=>{});delAll.Enabled=false;var delList=MI("Listedeki Kayıtları Sil",DeleteListed);var add=MI("Yeni Ekle",()=>EditRecord(null));var edit=MI("Değiştir",EditSelected);var report=MI("Rapor",PrintList);
        ops.DropDownItems.AddRange([del,delAll,delList,add,edit,report]);menu.Items.Add(ops);Controls.Add(menu);MainMenuStrip=menu;
        var ctx=new ContextMenuStrip();ctx.Items.AddRange([MI("Sil",DeleteSelected),MI("Listedeki Kayıtları Sil",DeleteListed),MI("Yeni Ekle",()=>EditRecord(null)),MI("Değiştir",EditSelected),MI("Rapor",PrintList)]);grid.ContextMenuStrip=ctx;
        name.KeyDown+=(_,e)=>{if(e.KeyCode==Keys.Enter)Reload();};
    }

    static ToolStripMenuItem MI(string text,Action a){var m=new ToolStripMenuItem(text);m.Click+=(_,_)=>a();return m;}
    void AddCol(string n,string h,int w)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=n,DataPropertyName=n,HeaderText=h,Width=w});

    void Init()
    {
        punch.Items.AddRange(["Tümü","Giriş","Çıkış"]);punch.SelectedIndex=0;sort.Items.AddRange(["Kart No","Ad Soyad","Giriş Tarihi","Çıkış Tarihi"]);sort.SelectedIndex=0;
        dateStart.Value=DateTime.Today.AddDays(-30);dateEnd.Value=DateTime.Today;
        LoadLookup(group,"GRUP");LoadLookup(department,"BOLUM");LoadLookup(service,"SERVIS");LoadLookup(status,"DURUM");LoadLookup(duty,"GOREV");LoadLookup(company,"FIRMA");Reload();
    }

    void LoadLookup(ComboBox c,string table)
    {
        var src=db.Query($"select KOD,AD from {table} order by KOD");var all=src.NewRow();all["KOD"]=-1;all["AD"]="Tümü";src.Rows.InsertAt(all,0);src.Columns.Add("TEXT",typeof(string),"AD");c.DataSource=src;c.SelectedValue=-1;
    }

    void Reload()
    {
        try
        {
            var where=new List<string>{"g.GTARIH>=@A","g.GTARIH<@B"};var ps=new List<FbParameter>{new("@A",dateStart.Value.Date),new("@B",dateEnd.Value.Date.AddDays(1))};
            if(!string.IsNullOrWhiteSpace(cardStart.Text)){where.Add("g.PKNO>=@KS");ps.Add(new("@KS",cardStart.Text.Trim().PadLeft(5,'0')));} if(!string.IsNullOrWhiteSpace(cardEnd.Text)){where.Add("g.PKNO<=@KB");ps.Add(new("@KB",cardEnd.Text.Trim().PadLeft(5,'0')));}
            if(!string.IsNullOrWhiteSpace(name.Text)){where.Add("(upper(k.AD) containing upper(@N) or upper(k.SOYAD) containing upper(@N))");ps.Add(new("@N",name.Text.Trim()));}
            AddFilter(where,ps,"k.GRUP",group,"G");AddFilter(where,ps,"k.BOLUM",department,"D");AddFilter(where,ps,"k.SERVIS",service,"S");AddFilter(where,ps,"k.DURUM",status,"U");AddFilter(where,ps,"k.GOREV",duty,"R");AddFilter(where,ps,"k.SIRKET",company,"F");
            if(punch.SelectedIndex==1)where.Add("g.GSAAT is not null");if(punch.SelectedIndex==2)where.Add("g.CSAAT is not null");if(manual.Checked)where.Add("(coalesce(g.GTUR,'')<>'T' or coalesce(g.CTUR,'')<>'T')");
            AddTimeFilter(where,ps,"g.GDAKIKA",inFirst,true,"GIF");AddTimeFilter(where,ps,"g.GDAKIKA",inLast,false,"GIL");AddTimeFilter(where,ps,"g.CDAKIKA",outFirst,true,"GOF");AddTimeFilter(where,ps,"g.CDAKIKA",outLast,false,"GOL");
            var order=sort.SelectedIndex switch{1=>"k.AD,k.SOYAD,g.GTARIH",2=>"g.GTARIH,g.PKNO",3=>"g.CTARIH,g.PKNO",_=>"g.PKNO,g.GTARIH"};
            var sql=$"select g.SIRA,g.PKNO,k.AD,k.SOYAD,g.GTARIH,g.GSAAT,g.GTUR,g.CTARIH,g.CSAAT,g.CTUR,g.MKOD,g.BOLUM,gr.AD GRUPAD,b.AD BOLUMAD from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO left join GRUP gr on gr.KOD=k.GRUP left join BOLUM b on b.KOD=g.BOLUM where {string.Join(" and ",where)} order by {order}";
            current=db.Query(sql,ps.ToArray());grid.DataSource=current;statusText.Text=$"Kayıt Sayısı : {current.Rows.Count}";
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    static void AddFilter(List<string>w,List<FbParameter>p,string field,ComboBox c,string key){if(c.SelectedValue is int v&&v>=0){w.Add($"{field}=@{key}");p.Add(new FbParameter("@"+key,v));}}
    static void AddTimeFilter(List<string> where,List<FbParameter> parameters,string field,TextBox input,bool lowerBound,string key)
    {
        if(!TimeSpan.TryParse(input.Text.Trim(),out var time))return;
        where.Add($"{field}{(lowerBound?">=":"<=")}@{key}");
        parameters.Add(new FbParameter("@"+key,(int)time.TotalMinutes));
    }
    DataRow? Row()=>grid.CurrentRow?.DataBoundItem is DataRowView v?v.Row:null;
    void EditSelected(){var r=Row();if(r is null)return;EditRecord(r);}

    void EditRecord(DataRow? r)
    {
        var selectedId=r is null?(int?)null:Convert.ToInt32(r["SIRA"]);var selectedPk=r is null?"":Convert.ToString(r["PKNO"])??"";
        using var d=new Form{Text=r is null?"Giriş Çıkış Ekleme":"Giriş Çıkış Düzeltme",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(410,230),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false};
        var card=new TextBox{Location=new Point(130,18),Size=new Size(90,21),Text=selectedPk};var gd=D(130,52,180);var gt=new TextBox{Location=new Point(315,52),Size=new Size(55,21)};var cd=D(130,86,180);var ct=new TextBox{Location=new Point(315,86),Size=new Size(55,21)};
        if(r is not null){if(r["GTARIH"]!=DBNull.Value)gd.Value=Convert.ToDateTime(r["GTARIH"]);if(r["CTARIH"]!=DBNull.Value)cd.Value=Convert.ToDateTime(r["CTARIH"]);gt.Text=Convert.ToString(r["GSAAT"]);ct.Text=Convert.ToString(r["CSAAT"]);}else{gd.Value=cd.Value=DateTime.Today;}
        d.Controls.AddRange([L("Kart No",25,22),L("Giriş Tarihi / Saati",25,56),L("Çıkış Tarihi / Saati",25,90),card,gd,gt,cd,ct]);var ok=new Button{Text="Kaydet",Location=new Point(130,155),Size=new Size(95,32)};var cancel=new Button{Text="Kapat",Location=new Point(240,155),Size=new Size(95,32)};d.Controls.AddRange([ok,cancel]);cancel.Click+=(_,_)=>d.Close();
        ok.Click+=(_,_)=>{try{var pk=card.Text.Trim().PadLeft(5,'0');if(pk.Length!=5)throw new InvalidOperationException("Kart numarası 5 haneli olmalıdır.");if(!TimeSpan.TryParse(gt.Text.Trim(),out var ti)||!TimeSpan.TryParse(ct.Text.Trim(),out var to))throw new InvalidOperationException("Saatleri SS:dd biçiminde girin.");var dep=db.Scalar("select BOLUM from KIMLIK where PKNO=@P",new FbParameter("@P",pk));var pars=new[]{new FbParameter("@P",pk),new FbParameter("@GD",gd.Value.Date),new FbParameter("@GS",$"{ti.Hours:00}:{ti.Minutes:00}"),new FbParameter("@GDK",(int)ti.TotalMinutes),new FbParameter("@CD",cd.Value.Date),new FbParameter("@CS",$"{to.Hours:00}:{to.Minutes:00}"),new FbParameter("@CDK",(int)to.TotalMinutes),new FbParameter("@B",dep??DBNull.Value)};if(selectedId is null){var seq=Convert.ToInt32(db.Scalar("select coalesce(max(SIRA),0)+1 from GIRCIK")??1);db.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,BOLUM) values (@Q,@P,@GD,@GS,@GDK,'E',@CD,@CS,@CDK,'E',@B)",[new FbParameter("@Q",seq),..pars]);}else{db.Execute("update GIRCIK set PKNO=@P,GTARIH=@GD,GSAAT=@GS,GDAKIKA=@GDK,GTUR='E',CTARIH=@CD,CSAAT=@CS,CDAKIKA=@CDK,CTUR='E',BOLUM=@B where SIRA=@Q",[..pars,new FbParameter("@Q",selectedId.Value)]);}d.DialogResult=DialogResult.OK;d.Close();}catch(Exception ex){MessageBox.Show(ex.Message,d.Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}};
        if(d.ShowDialog(this)==DialogResult.OK)Reload();
    }

    void DeleteSelected(){var r=Row();if(r is null)return;if(MessageBox.Show("Seçili giriş-çıkış kaydı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;db.Execute("delete from GIRCIK where SIRA=@Q",new FbParameter("@Q",Convert.ToInt32(r["SIRA"])));Reload();}
    void DeleteListed(){if(current.Rows.Count==0)return;if(MessageBox.Show($"Listede görünen {current.Rows.Count} kayıt silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;var ids=current.AsEnumerable().Where(x=>x["SIRA"]!=DBNull.Value).Select(x=>Convert.ToInt32(x["SIRA"])).ToArray();db.InTransaction((c,t)=>{foreach(var id in ids){using var cmd=FirebirdDatabase.CreateCommand(c,t,"delete from GIRCIK where SIRA=@Q",new FbParameter("@Q",id));cmd.ExecuteNonQuery();}return 0;});Reload();}
    void PrintList(){MessageBox.Show("Giriş-çıkış raporları: GirisCikisADSOYAD.fr3, GirisCikisTarih.fr3 ve GirisCikisBOLUM.fr3 eşleştirildi. Önizleme Raporlar menüsünden kullanılabilir.","Rapor",MessageBoxButtons.OK,MessageBoxIcon.Information);}
}
