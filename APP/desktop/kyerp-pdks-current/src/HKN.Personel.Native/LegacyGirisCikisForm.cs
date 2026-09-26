using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyGirisCikisForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DataGridView grid = new(){ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,SelectionMode=DataGridViewSelectionMode.FullRowSelect,MultiSelect=false,BackgroundColor=Color.White,AutoGenerateColumns=false};
    readonly TextBox cardStart = new(); readonly TextBox cardEnd = new(); readonly TextBox name = new();
    readonly ComboBox punch = new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly DateTimePicker dateStart = D(); readonly DateTimePicker dateEnd = D();
    readonly TextBox inFirst = new(){Text=":"}, inLast = new(){Text=":"}, outFirst = new(){Text=":"}, outLast = new(){Text=":"};
    readonly CheckBox manual = new(){Text="Elle girilen kayıtlar"};
    readonly ComboBox group=C(), department=C(), company=C(), service=C(), status=C(), duty=C(), sort=new(){DropDownStyle=ComboBoxStyle.DropDownList};
    readonly ToolStripStatusLabel statusText = new(){Spring=true,TextAlign=ContentAlignment.MiddleLeft};
    DataTable current = new();
    readonly string? initialCard;
    readonly DateTime? initialDate;

    public LegacyGirisCikisForm(string? initialCard=null, DateTime? initialDate=null){this.initialCard=initialCard;this.initialDate=initialDate;Text="Giriş ve Çıkışlar";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1220,740);MinimumSize=new Size(980,620);Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);KeyPreview=true;Build();Shown+=(_,_)=>Init();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};}
    static DateTimePicker D()=>new(){Format=DateTimePickerFormat.Short};
    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static Label L(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),AutoSize=true,ForeColor=Color.FromArgb(66,82,104)};
    static ComboBox C()=>new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Label L(string text)=>new(){Text=text,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(66,82,104)};
    static void Row(TableLayoutPanel t,int r,string label,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,36));t.Controls.Add(L(label),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(3,5,3,5);t.Controls.Add(c,1,r);}
    static Button Btn(string text,int width=110)=>new(){Text=text,Width=width,Height=36,FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,ColumnCount=1,Padding=new Padding(14)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,190));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,56));
        var filters=new TabControl{Dock=DockStyle.Fill};
        var p=new TabPage("Giriş / Çıkış Parametreleri"){Padding=new Padding(12)};var pg=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=4};pg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,130));pg.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));pg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,130));pg.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));
        Row(pg,0,"Kart No Başlangıç",cardStart); pg.Controls.Add(L("Tarih Başlangıç"),2,0);dateStart.Dock=DockStyle.Fill;pg.Controls.Add(dateStart,3,0);
        Row(pg,1,"Kart No Bitiş",cardEnd); pg.Controls.Add(L("Tarih Bitiş"),2,1);dateEnd.Dock=DockStyle.Fill;pg.Controls.Add(dateEnd,3,1);
        Row(pg,2,"Ad / Soyad",name); pg.Controls.Add(L("Kart Basma"),2,2);punch.Dock=DockStyle.Fill;pg.Controls.Add(punch,3,2);
        var time=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};foreach(var c in new[]{inFirst,inLast,outFirst,outLast}){c.Width=55;time.Controls.Add(c);}time.Controls.Add(manual);pg.Controls.Add(L("Saat Aralığı"),0,3);pg.Controls.Add(time,1,3);pg.SetColumnSpan(time,3);p.Controls.Add(pg);
        var f=new TabPage("Filtreleme"){Padding=new Padding(12)};var fg=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=4,RowCount=3};fg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));fg.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40));fg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));fg.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40));Row(fg,0,"Grup",group);fg.Controls.Add(L("Servis"),2,0);service.Dock=DockStyle.Fill;fg.Controls.Add(service,3,0);Row(fg,1,"Bölüm",department);fg.Controls.Add(L("Durum"),2,1);status.Dock=DockStyle.Fill;fg.Controls.Add(status,3,1);Row(fg,2,"Firma",company);fg.Controls.Add(L("Görev"),2,2);duty.Dock=DockStyle.Fill;fg.Controls.Add(duty,3,2);f.Controls.Add(fg);
        var sp=new TabPage("Sıralama"){Padding=new Padding(12)};var sg=new TableLayoutPanel{Dock=DockStyle.Top,ColumnCount=2,RowCount=1,Height=42};sg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));sg.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,260));sg.Controls.Add(L("Sıralama"),0,0);sort.Dock=DockStyle.Fill;sg.Controls.Add(sort,1,0);sp.Controls.Add(sg);filters.TabPages.AddRange([p,f,sp]);root.Controls.Add(filters,0,0);
        AddCol("PKNO","Kart No",65);AddCol("AD","Adı",100);AddCol("SOYAD","Soyadı",100);AddCol("GTARIH","Giriş Tarihi",90);AddCol("GSAAT","Giriş Saati",80);AddCol("GTUR","Giriş",55);AddCol("CTARIH","Çıkış Tarihi",90);AddCol("CSAAT","Çıkış Saati",80);AddCol("CTUR","Çıkış",55);AddCol("GRUPAD","Grubu",110);AddCol("BOLUMAD","Bölümü",110);grid.Dock=DockStyle.Fill;grid.CellDoubleClick+=(_,_)=>EditSelected();root.Controls.Add(grid,0,1);
        var bar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,8,0,0)};var show=Btn("Göster",100);var add=Btn("Yeni Ekle",100);var edit=Btn("Değiştir",100);var del=Btn("Sil",90);var report=Btn("Rapor",90);show.Click+=(_,_)=>Reload();add.Click+=(_,_)=>EditRecord(null);edit.Click+=(_,_)=>EditSelected();del.Click+=(_,_)=>DeleteSelected();report.Click+=(_,_)=>PrintList();bar.Controls.AddRange([show,report,del,edit,add]);root.Controls.Add(bar,0,2);Controls.Add(root);var ctx=new ContextMenuStrip();ctx.Items.AddRange([MI("Sil",DeleteSelected),MI("Listedeki Kayıtları Sil",DeleteListed),MI("Yeni Ekle",()=>EditRecord(null)),MI("Değiştir",EditSelected),MI("Rapor",PrintList)]);grid.ContextMenuStrip=ctx;name.KeyDown+=(_,e)=>{if(e.KeyCode==Keys.Enter)Reload();};
    }
    static ToolStripMenuItem MI(string text,Action a){var m=new ToolStripMenuItem(text);m.Click+=(_,_)=>a();return m;}
    void AddCol(string n,string h,int w)=>grid.Columns.Add(new DataGridViewTextBoxColumn{Name=n,DataPropertyName=n,HeaderText=h,Width=w});
    void Init()
    {
        punch.Items.AddRange(["Tümü","Giriş","Çıkış"]);punch.SelectedIndex=0;sort.Items.AddRange(["Kart No","Ad Soyad","Giriş Tarihi","Çıkış Tarihi"]);sort.SelectedIndex=0;
        dateStart.Value=initialDate?.Date ?? DateTime.Today.AddDays(-30);dateEnd.Value=initialDate?.Date ?? DateTime.Today;
        if(!string.IsNullOrWhiteSpace(initialCard)){cardStart.Text=initialCard;cardEnd.Text=initialCard;}
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
    void PrintList()
    {
        try
        {
            var columns=grid.Columns.Cast<DataGridViewColumn>().Where(c=>c.Visible).OrderBy(c=>c.DisplayIndex).ToArray();
            var rows=grid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow)
                .Select(r=>(IReadOnlyList<string>)columns.Select(c=>Convert.ToString(r.Cells[c.Index].FormattedValue)??string.Empty).ToArray()).ToArray();
            var report=new KYERP.PDKS.Core.Reports.ReportTable($"Giriş - Çıkış Raporu • {dateStart.Value:dd.MM.yyyy} - {dateEnd.Value:dd.MM.yyyy}",columns.Select(c=>c.HeaderText).ToArray(),rows);
            ReportPrintHelper.Preview(this,report,true);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Giriş - Çıkış Raporu",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }
}
