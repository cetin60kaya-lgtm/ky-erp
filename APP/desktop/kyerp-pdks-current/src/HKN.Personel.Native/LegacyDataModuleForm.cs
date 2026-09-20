using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public enum LegacyDataView
{
    GirisCikis,
    Avanslar,
    Puantaj,
    PuantajSonuclari,
    Bordro
}

public sealed class LegacyDataModuleForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly LegacyDataView view;
    readonly DateTimePicker from = new() { Width = 118, Format = DateTimePickerFormat.Short };
    readonly DateTimePicker to = new() { Width = 118, Format = DateTimePickerFormat.Short };
    readonly TextBox search = new() { Width = 180 };
    readonly DataGridView grid = NewGrid();
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
    readonly Dictionary<string,ComboBox> dailyLookups = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,ComboBox> monthlyLookups = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,ComboBox> bordroLookups = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string,ComboBox> girisLookups = new(StringComparer.OrdinalIgnoreCase);
    TextBox? dailyKartBas, dailyKartBit, monthlyKartBas, monthlyKartBit, bordroKartBas, bordroKartBit;
    DateTimePicker? dailyFrom, dailyTo, monthlyFrom, monthlyTo;
    ProgressBar? dailyProgress1, dailyProgress2, monthlyProgress;
    ComboBox? bordroSort;
    DataTable? people;
    DataTable? data;

    public LegacyDataModuleForm(LegacyDataView view)
    {
        this.view = view;
        Text = Title(view);
        Font = new Font("Microsoft Sans Serif", 8.25f);
        BackColor = SystemColors.Control;
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = false; MaximizeBox = false; ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.Dpi;
        ApplyLegacySize();
        var first = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        from.Value = first; to.Value = first.AddMonths(1).AddDays(-1);
        BuildUi();
        Shown += (_,_) => ReloadData();
    }

    static DataGridView NewGrid()=>new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows=false,
        MultiSelect = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        BackgroundColor = Color.White, RowHeadersWidth = 18, RowTemplate = { Height = 20 }, ColumnHeadersHeight = 20
    };

    void ApplyLegacySize()
    {
        ClientSize = view switch
        {
            LegacyDataView.Puantaj => new Size(505, 365),
            LegacyDataView.Bordro => new Size(350, 345),
            LegacyDataView.GirisCikis => new Size(761,550),
            LegacyDataView.PuantajSonuclari => new Size(760, 500),
            LegacyDataView.Avanslar => new Size(760, 500),
            _ => new Size(760,500)
        };
    }

    public void PrepareForEmbedding(){TopLevel=false;FormBorderStyle=FormBorderStyle.None;Dock=DockStyle.Fill;ShowInTaskbar=false;}

    void BuildUi()
    {
        if(view==LegacyDataView.GirisCikis){BuildGirisCikisUi();return;}
        if(view==LegacyDataView.Puantaj){BuildPuantajUi();return;}
        if(view==LegacyDataView.Bordro){BuildBordroUi();return;}
        BuildGridUi();
    }

    void BuildGridUi()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(5)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,24));root.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(2,4,0,0)};
        top.Controls.Add(new Label{Text="Tarih Aralığı",AutoSize=true,Padding=new Padding(0,7,4,0)});top.Controls.Add(from);top.Controls.Add(new Label{Text="ile",AutoSize=true,Padding=new Padding(4,7,4,0)});top.Controls.Add(to);
        var show=LegacyButton("Göster",82,25);show.Click+=(_,_)=>ReloadData();top.Controls.Add(show);top.Controls.Add(new Label{Text="Ara",AutoSize=true,Padding=new Padding(12,7,4,0)});search.TextChanged+=(_,_)=>ApplySearch();top.Controls.Add(search);
        var closeBar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(4,4,4,0)};var close=LegacyButton("Kapat",88,28);close.DialogResult=DialogResult.Cancel;closeBar.Controls.Add(close);
        root.Controls.Add(top,0,0);root.Controls.Add(grid,0,1);root.Controls.Add(status,0,2);root.Controls.Add(closeBar,0,3);Controls.Add(root);CancelButton=close;
    }

    // ---------------- GİRİŞ / ÇIKIŞ ----------------
    void BuildGirisCikisUi()
    {
        Text="Giriş ve Çıkışlar";
        var menu=new MenuStrip{Dock=DockStyle.Top};var operations=new ToolStripMenuItem("İşlemler");
        var del=new ToolStripMenuItem("Sil");var delAll=new ToolStripMenuItem("Listedeki Kayıtları Sil");var add=new ToolStripMenuItem("Yeni Ekle");var edit=new ToolStripMenuItem("Değiştir");var report=new ToolStripMenuItem("Rapor");
        operations.DropDownItems.AddRange(new ToolStripItem[]{del,delAll,add,edit,new ToolStripSeparator(),report});menu.Items.Add(operations);MainMenuStrip=menu;Controls.Add(menu);
        var host=new Panel{Dock=DockStyle.Fill};Controls.Add(host);host.BringToFront();

        var pages=new TabControl{Location=new Point(0,0),Size=new Size(689,121)};
        var parameters=new TabPage("Giriş Çıkış Paremetreleri");var filter=new TabPage("Filtreleme");var sort=new TabPage("Sıralama");pages.TabPages.AddRange(new[]{parameters,filter,sort});host.Controls.Add(pages);

        var kartBas=SmallText(100,8,40);var kartBit=SmallText(100,32,40);var name=SmallText(80,64,175);
        var dateStart=new DateTimePicker{Location=new Point(272,8),Size=new Size(176,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
        var dateEnd=new DateTimePicker{Location=new Point(272,32),Size=new Size(176,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
        dateStart.Value=from.Value;dateEnd.Value=to.Value;
        var kartBasma=new ComboBox{Location=new Point(336,66),Size=new Size(207,21),DropDownStyle=ComboBoxStyle.DropDownList};kartBasma.Items.AddRange(new object[]{"Tümü","Giriş Basan","Çıkış Basan","Eksik Kayıt"});kartBasma.SelectedIndex=0;
        var inFirst=SmallText(480,8,40,"00:00");var inLast=SmallText(600,8,40,"23:59");var outFirst=SmallText(480,32,40,"00:00");var outLast=SmallText(600,32,40,"23:59");
        var manual=new CheckBox{Text="Elle Girilen Kayıtlar",Location=new Point(552,72),Size=new Size(120,17)};
        parameters.Controls.AddRange(new Control[]{At("Kart No Başlangıç",8,16),At("Kart No Bitiş",8,40),At("Adı",8,72),At("Kart Basma",272,74),At("Tarih Başlangıç",176,16),At("Tarih Bitiş",176,40),At("> Giriş Saati <",528,9),At("> Çıkış Saati <",528,33),kartBas,kartBit,name,kartBasma,dateStart,dateEnd,inFirst,inLast,outFirst,outLast,manual});

        AddLegacyLookup(filter,"Grubu","GRUP","GRUP",72,8,209);AddLegacyLookup(filter,"Bölümü","BOLUM","BOLUM",72,32,209);AddLegacyLookup(filter,"Firma","SIRKET","FIRMA",72,56,319);
        AddLegacyLookup(filter,"Servis","SERVIS","SERVIS",464,8,209);AddLegacyLookup(filter,"Durum","DURUM","DURUM",464,32,209);AddLegacyLookup(filter,"Görev","GOREV","GOREV",464,56,209);
        filter.Controls.AddRange(new Control[]{At("Grubu",8,16),At("Bölümü",8,40),At("Firma",8,64),At("Servis",408,16),At("Durum",408,40),At("Görev",408,64)});

        var sortBox=new ComboBox{Location=new Point(56,16),Size=new Size(185,21),DropDownStyle=ComboBoxStyle.DropDownList};sortBox.Items.AddRange(new object[]{"Kart No","Ad - Soyad","Soyad - Ad","Giriş Tarihi","Çıkış Tarihi"});sortBox.SelectedIndex=0;sort.Controls.Add(At("Sıralama",8,24));sort.Controls.Add(sortBox);
        var show=LegacyButton("Göster",65,101);show.Location=new Point(693,19);show.Click+=(_,_)=>LoadGirisCikis(kartBas,kartBit,name,kartBasma,dateStart,dateEnd,inFirst,inLast,outFirst,outLast,manual,sortBox);host.Controls.Add(show);

        grid.Dock=DockStyle.None;grid.Location=new Point(0,128);grid.Size=new Size(758,399);grid.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;grid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.None;host.Controls.Add(grid);
        var stat=new StatusStrip{Dock=DockStyle.Bottom,SizingGrip=false};stat.Items.Add(new ToolStripStatusLabel{Spring=true,TextAlign=ContentAlignment.MiddleLeft,Text="Hazır",Name="COUNT"});host.Controls.Add(stat);
        grid.CellFormatting+=GirisGridFormat;

        var popup=new ContextMenuStrip();popup.Items.Add("Sil",null,(_,_)=>DeleteGirisCurrent());popup.Items.Add("Listedeki Kayıtları Sil",null,(_,_)=>DeleteGirisListed());popup.Items.Add("Yeni Ekle",null,(_,_)=>EditGirisRecord(false));popup.Items.Add("Değiştir",null,(_,_)=>EditGirisRecord(true));grid.ContextMenuStrip=popup;
        del.Click+=(_,_)=>DeleteGirisCurrent();delAll.Click+=(_,_)=>DeleteGirisListed();add.Click+=(_,_)=>EditGirisRecord(false);edit.Click+=(_,_)=>EditGirisRecord(true);report.Click+=(_,_)=>ExportGridCsv(grid,"GirisCikis");
        Tag=new GirisFilterState(kartBas,kartBit,name,kartBasma,dateStart,dateEnd,inFirst,inLast,outFirst,outLast,manual,sortBox,stat);
    }

    static Label At(string text,int x,int y)=>new(){Text=text,Location=new Point(x,y),AutoSize=true};
    static TextBox SmallText(int x,int y,int w,string text="")=>new(){Location=new Point(x,y),Size=new Size(w,21),Text=text,BorderStyle=BorderStyle.FixedSingle};

    void AddLegacyLookup(TabPage page,string label,string key,string table,int x,int y,int w)
    {
        var box=new ComboBox{Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(LookupItem.Name),ValueMember=nameof(LookupItem.Code),Tag=table};girisLookups[key]=box;page.Controls.Add(box);
    }

    void LoadGirisLookups()
    {
        if(girisLookups.Values.Any(x=>x.DataSource is not null))return;
        LoadLookups(girisLookups);
    }

    void LoadGirisCikis(TextBox kartBas,TextBox kartBit,TextBox name,ComboBox kartBasma,DateTimePicker dateStart,DateTimePicker dateEnd,TextBox inFirst,TextBox inLast,TextBox outFirst,TextBox outLast,CheckBox manual,ComboBox sortBox)
    {
        try
        {
            LoadGirisLookups();from.Value=dateStart.Value.Date;to.Value=dateEnd.Value.Date;
            var sql=@"select G.SIRA,G.PKNO,K.AD,K.SOYAD,G.GTARIH,G.GSAAT,G.GTUR,G.CTARIH,G.CSAAT,G.CTUR,G.GDAKIKA,G.CDAKIKA,G.BOLUM
from GIRCIK G left join KIMLIK K on K.PKNO=G.PKNO where 1=1";
            var ps=new List<FbParameter>();
            sql+=" and ((G.GTARIH>=@A and G.GTARIH<@B) or (G.CTARIH>=@A and G.CTARIH<@B))";ps.Add(new("@A",dateStart.Value.Date));ps.Add(new("@B",dateEnd.Value.Date.AddDays(1)));
            if(kartBas.Text.Trim().Length>0){sql+=" and G.PKNO>=@KB";ps.Add(new("@KB",kartBas.Text.Trim()));}if(kartBit.Text.Trim().Length>0){sql+=" and G.PKNO<=@KE";ps.Add(new("@KE",kartBit.Text.Trim()));}
            if(name.Text.Trim().Length>0){sql+=" and upper(K.AD) like @N";ps.Add(new("@N","%"+name.Text.Trim().ToUpperInvariant()+"%"));}
            foreach(var pair in girisLookups)if(pair.Value.SelectedItem is LookupItem li&&li.Code.Length>0){sql+=$" and K.{pair.Key}=@{pair.Key}";ps.Add(new("@"+pair.Key,Convert.ToInt32(li.Code)));}
            if(TryMinute(inFirst.Text,out var ifm)&&TryMinute(inLast.Text,out var ilm)){sql+=" and (G.GDAKIKA is null or G.GDAKIKA between @IF and @IL)";ps.Add(new("@IF",ifm));ps.Add(new("@IL",ilm));}
            if(TryMinute(outFirst.Text,out var ofm)&&TryMinute(outLast.Text,out var olm)){sql+=" and (G.CDAKIKA is null or G.CDAKIKA between @OF and @OL)";ps.Add(new("@OF",ofm));ps.Add(new("@OL",olm));}
            if(kartBasma.SelectedIndex==1)sql+=" and G.GTARIH is not null";else if(kartBasma.SelectedIndex==2)sql+=" and G.CTARIH is not null";else if(kartBasma.SelectedIndex==3)sql+=" and (G.GTARIH is null or G.CTARIH is null)";
            if(manual.Checked)sql+=" and (coalesce(G.GTUR,'')='M' or coalesce(G.CTUR,'')='M')";
            sql+=" order by "+(sortBox.SelectedIndex switch{1=>"K.AD,K.SOYAD,G.GTARIH",2=>"K.SOYAD,K.AD,G.GTARIH",3=>"G.GTARIH,G.PKNO",4=>"G.CTARIH,G.PKNO",_=>"G.PKNO,G.GTARIH,G.SIRA"});
            data=db.Query(sql,ps.ToArray());grid.DataSource=data;ConfigureGirisColumns();UpdateGirisStatus();
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void ConfigureGirisColumns()
    {
        foreach(DataGridViewColumn c in grid.Columns)c.Visible=false;
        ShowCol("PKNO","Kart No",58);ShowCol("AD","Adı",82);ShowCol("SOYAD","Soyadı",92);ShowCol("GTARIH","Giriş Tarihi",105);ShowCol("GSAAT","Giriş Saati",72);ShowCol("GTUR","Tür",35);ShowCol("CTARIH","Çıkış Tarihi",105);ShowCol("CSAAT","Çıkış Saati",72);ShowCol("CTUR","Tür",35);
    }
    void ShowCol(string n,string h,int w){if(!grid.Columns.Contains(n))return;var c=grid.Columns[n];if(c is null)return;c.Visible=true;c.HeaderText=h;c.Width=w;}
    void GirisGridFormat(object? sender,DataGridViewCellFormattingEventArgs e)
    {
        if(e.RowIndex<0||e.ColumnIndex<0)return;var col=grid.Columns[e.ColumnIndex];if(col is null)return;var n=col.Name;
        if(n is "GSAAT" or "CSAAT"){var style=e.CellStyle;if(style is null)return;style.BackColor=Color.Black;style.ForeColor=Color.Lime;style.SelectionBackColor=Color.Black;style.SelectionForeColor=Color.Lime;style.Font=new Font(Font,FontStyle.Bold);}
        if(n is "GTARIH" or "CTARIH"&&e.Value is DateTime d){e.Value=d.ToString("dd MMM yyyy ddd",new System.Globalization.CultureInfo("tr-TR"));e.FormattingApplied=true;}
    }
    void UpdateGirisStatus(){if(Tag is GirisFilterState s&&s.Status.Items["COUNT"] is ToolStripStatusLabel l)l.Text=$"Listelenen Kayıt Sayısı : {grid.Rows.Count}";}

    void EditGirisRecord(bool editMode)
    {
        DataRow? src=null;if(editMode){if(grid.CurrentRow?.DataBoundItem is not DataRowView v){MessageBox.Show("Bir kayıt seçin.",Text);return;}src=v.Row;}
        using var d=new Form{Text=editMode?"Giriş Çıkış Değiştirme":"Giriş Çıkış Ekleme",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(420,260),FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,Font=Font};
        var people=db.Query("select PKNO,AD,SOYAD from KIMLIK order by PKNO");people.Columns.Add("GOSTER",typeof(string));foreach(DataRow r in people.Rows)r["GOSTER"]=$"{r["PKNO"]}  {r["AD"]} {r["SOYAD"]}";
        var person=new ComboBox{Location=new Point(125,18),Size=new Size(270,21),DropDownStyle=ComboBoxStyle.DropDownList,DataSource=people,DisplayMember="GOSTER",ValueMember="PKNO"};
        var hasIn=new CheckBox{Text="Giriş",Location=new Point(18,65),AutoSize=true,Checked=true};var inDate=new DateTimePicker{Location=new Point(125,60),Size=new Size(130,21),Format=DateTimePickerFormat.Short};var inTime=new TextBox{Location=new Point(270,60),Size=new Size(60,21),Text="08:30"};
        var hasOut=new CheckBox{Text="Çıkış",Location=new Point(18,100),AutoSize=true,Checked=true};var outDate=new DateTimePicker{Location=new Point(125,95),Size=new Size(130,21),Format=DateTimePickerFormat.Short};var outTime=new TextBox{Location=new Point(270,95),Size=new Size(60,21),Text="19:00"};
        d.Controls.AddRange(new Control[]{At("Personel",18,22),person,hasIn,inDate,inTime,hasOut,outDate,outTime});
        if(src is not null){person.SelectedValue=Convert.ToString(src["PKNO"]);hasIn.Checked=src["GTARIH"]!=DBNull.Value;hasOut.Checked=src["CTARIH"]!=DBNull.Value;if(hasIn.Checked){inDate.Value=Convert.ToDateTime(src["GTARIH"]);inTime.Text=Convert.ToString(src["GSAAT"])??"";}if(hasOut.Checked){outDate.Value=Convert.ToDateTime(src["CTARIH"]);outTime.Text=Convert.ToString(src["CSAAT"])??"";}}
        void Sync(){inDate.Enabled=hasIn.Checked;inTime.Enabled=hasIn.Checked;outDate.Enabled=hasOut.Checked;outTime.Enabled=hasOut.Checked;}hasIn.CheckedChanged+=(_,_)=>Sync();hasOut.CheckedChanged+=(_,_)=>Sync();Sync();
        var save=LegacyButton(editMode?"Kaydet":"Ekle",100,31);save.Location=new Point(205,190);var cancel=LegacyButton("Kapat",90,31);cancel.Location=new Point(310,190);cancel.DialogResult=DialogResult.Cancel;d.Controls.Add(save);d.Controls.Add(cancel);d.CancelButton=cancel;
        save.Click+=(_,_)=>{try{if(!hasIn.Checked&&!hasOut.Checked)throw new InvalidOperationException("Lütfen giriş veya çıkış saati alanlarından birisini giriniz..!");var pk=Convert.ToString(person.SelectedValue)??throw new InvalidOperationException("Personel seçin.");object gd=DBNull.Value,gs=DBNull.Value,gm=DBNull.Value,cd=DBNull.Value,cs=DBNull.Value,cm=DBNull.Value;if(hasIn.Checked){if(!TryMinute(inTime.Text,out var m))throw new InvalidOperationException("Giriş saatini SS:dd biçiminde girin.");gd=inDate.Value.Date;gs=inTime.Text.Trim();gm=m;}if(hasOut.Checked){if(!TryMinute(outTime.Text,out var m))throw new InvalidOperationException("Çıkış saatini SS:dd biçiminde girin.");cd=outDate.Value.Date;cs=outTime.Text.Trim();cm=m;}var bol=db.Scalar("select BOLUM from KIMLIK where PKNO=@P",new FbParameter("@P",pk))??DBNull.Value;if(src is null){var seq=Convert.ToInt32(db.Scalar("select coalesce(max(SIRA),0)+1 from GIRCIK")??1);db.Execute("insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD,BOLUM) values (@S,@P,@GD,@GS,@GM,'M',@CD,@CS,@CM,'M','000',@B)",new FbParameter("@S",seq),new FbParameter("@P",pk),new FbParameter("@GD",gd),new FbParameter("@GS",gs),new FbParameter("@GM",gm),new FbParameter("@CD",cd),new FbParameter("@CS",cs),new FbParameter("@CM",cm),new FbParameter("@B",bol));}else{var seq=Convert.ToInt32(src["SIRA"]);db.Execute("update GIRCIK set PKNO=@P,GTARIH=@GD,GSAAT=@GS,GDAKIKA=@GM,GTUR='M',CTARIH=@CD,CSAAT=@CS,CDAKIKA=@CM,CTUR='M',BOLUM=@B where SIRA=@S",new FbParameter("@P",pk),new FbParameter("@GD",gd),new FbParameter("@GS",gs),new FbParameter("@GM",gm),new FbParameter("@CD",cd),new FbParameter("@CS",cs),new FbParameter("@CM",cm),new FbParameter("@B",bol),new FbParameter("@S",seq));}d.DialogResult=DialogResult.OK;d.Close();ReloadGirisFromState();}catch(Exception ex){MessageBox.Show(ex.Message,d.Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}};
        d.ShowDialog(this);
    }

    void DeleteGirisCurrent()
    {
        if(grid.CurrentRow?.DataBoundItem is not DataRowView v)return;var seq=Convert.ToInt32(v.Row["SIRA"]);if(MessageBox.Show("Seçili giriş-çıkış kaydı silinsin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{db.Execute("delete from GIRCIK where SIRA=@S",new FbParameter("@S",seq));ReloadGirisFromState();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    void DeleteGirisListed()
    {
        if(data is null||data.Rows.Count==0)return;if(MessageBox.Show("Listedeki giriş-çıkış kayıtlarını silmek istediğinizden emin misiniz ?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;try{var ids=data.AsEnumerable().Where(r=>r["SIRA"]!=DBNull.Value).Select(r=>Convert.ToInt32(r["SIRA"])).ToArray();db.InTransaction((c,t)=>{foreach(var id in ids){using var cmd=FirebirdDatabase.CreateCommand(c,t,"delete from GIRCIK where SIRA=@S",new FbParameter("@S",id));cmd.ExecuteNonQuery();}return ids.Length;});ReloadGirisFromState();}catch(Exception ex){MessageBox.Show(ex.Message,Text);}
    }
    void ReloadGirisFromState(){if(Tag is GirisFilterState s)LoadGirisCikis(s.KartBas,s.KartBit,s.Name,s.KartBasma,s.Start,s.End,s.InFirst,s.InLast,s.OutFirst,s.OutLast,s.Manual,s.Sort);}
    static bool TryMinute(string value,out int minute){minute=0;if(!TimeSpan.TryParse(value.Trim(),out var t))return false;minute=(int)t.TotalMinutes;return minute>=0&&minute<1440;}

    sealed record GirisFilterState(TextBox KartBas,TextBox KartBit,TextBox Name,ComboBox KartBasma,DateTimePicker Start,DateTimePicker End,TextBox InFirst,TextBox InLast,TextBox OutFirst,TextBox OutLast,CheckBox Manual,ComboBox Sort,StatusStrip Status);

    // ---------------- PUANTAJ ----------------
    void BuildPuantajUi()
    {
        Text="Günlük ve Aylık Puantaj İşlemleri";var tabs=new TabControl{Dock=DockStyle.Fill,Padding=new Point(6,3)};tabs.TabPages.Add(BuildDailyPuantajPage());tabs.TabPages.Add(BuildMonthlyPuantajPage());Controls.Add(tabs);
    }
    TabPage BuildDailyPuantajPage()
    {
        var page=new TabPage("Günlük Puantaj");var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(8)};root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,38));root.RowStyles.Add(new RowStyle(SizeType.Absolute,43));
        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2};body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,225));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));var filters=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2,Padding=new Padding(4)};filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        dailyKartBas=new TextBox{Dock=DockStyle.Fill};dailyKartBit=new TextBox{Dock=DockStyle.Fill};var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);dailyFrom=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first};dailyTo=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first.AddMonths(1).AddDays(-1)};
        AddFilterRow(filters,"Kart No Başlangıç",dailyKartBas,0);AddFilterRow(filters,"Kart No Bitiş",dailyKartBit,1);AddFilterRow(filters,"Başlangıç Tarihi",dailyFrom,2);AddFilterRow(filters,"Bitiş Tarihi",dailyTo,3);AddLookupRows(filters,dailyLookups,4);body.Controls.Add(filters,0,0);grid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;body.Controls.Add(grid,1,0);root.Controls.Add(body,0,0);
        var progress=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(5,2,5,1)};dailyProgress1=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100};dailyProgress2=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100};progress.Controls.Add(dailyProgress1,0,0);progress.Controls.Add(dailyProgress2,0,1);root.Controls.Add(progress,0,1);
        var buttons=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(55,4,55,1)};buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));var calc=LegacyButton("Hesapla",110,30);var result=LegacyButton("Puantaj Sonuçları",120,30);calc.Anchor=AnchorStyles.None;result.Anchor=AnchorStyles.None;calc.Click+=(_,_)=>CalculatePuantaj(false);result.Click+=(_,_)=>{using var f=new LegacyDataModuleForm(LegacyDataView.PuantajSonuclari);f.ShowDialog(this);};buttons.Controls.Add(calc,0,0);buttons.Controls.Add(result,1,0);root.Controls.Add(buttons,0,2);page.Controls.Add(root);return page;
    }
    TabPage BuildMonthlyPuantajPage()
    {
        var page=new TabPage("Aylık Puantaj");var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(10,12,10,8)};root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,31));root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var holder=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3};holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,52));holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));var filters=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2,Padding=new Padding(3)};filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        monthlyKartBas=new TextBox{Dock=DockStyle.Fill};monthlyKartBit=new TextBox{Dock=DockStyle.Fill};var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);monthlyFrom=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first};monthlyTo=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first.AddMonths(1).AddDays(-1)};
        AddFilterRow(filters,"Kart No Başlangıç",monthlyKartBas,0);AddFilterRow(filters,"Kart No Bitiş",monthlyKartBit,1);AddFilterRow(filters,"Dönem Başlangıç Tarihi",monthlyFrom,2);AddFilterRow(filters,"Dönem Bitiş Tarihi",monthlyTo,3);AddLookupRows(filters,monthlyLookups,4);holder.Controls.Add(filters,1,0);root.Controls.Add(holder,0,0);monthlyProgress=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100,Margin=new Padding(4,5,4,5)};root.Controls.Add(monthlyProgress,0,1);var buttonHolder=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,Padding=new Padding(176,7,0,0)};var calc=LegacyButton("Hesapla",140,30);calc.Click+=(_,_)=>CalculatePuantaj(true);buttonHolder.Controls.Add(calc);root.Controls.Add(buttonHolder,0,2);page.Controls.Add(root);return page;
    }

    void AddLookupRows(TableLayoutPanel table,Dictionary<string,ComboBox> target,int startRow)
    {
        var names=new[]{("Grup","GRUP","GRUP"),("Bölüm","BOLUM","BOLUM"),("Servis","SERVIS","SERVIS"),("Durum","DURUM","DURUM"),("Görev","GOREV","GOREV"),("Firma","SIRKET","FIRMA")};
        for(int i=0;i<names.Length;i++){var box=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(LookupItem.Name),ValueMember=nameof(LookupItem.Code),Tag=names[i].Item3};target[names[i].Item2]=box;AddFilterRow(table,names[i].Item1,box,startRow+i);box.SelectedIndexChanged+=(_,_)=>ApplyPeopleFilter();}
    }
    void LoadLookups(Dictionary<string,ComboBox> target)
    {
        foreach(var pair in target){var table=Convert.ToString(pair.Value.Tag)??pair.Key;var rows=db.Query($"select KOD,AD from {table} order by KOD");var items=new List<LookupItem>{new("","Tümü")};foreach(DataRow row in rows.Rows)items.Add(new(Convert.ToString(row["KOD"])??"",Convert.ToString(row["AD"])??""));pair.Value.DataSource=items;}
    }
    void LoadPuantajPeople()
    {
        try{LoadLookups(dailyLookups);LoadLookups(monthlyLookups);people=db.Query("select PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,SERVIS,DURUM,GOREV,SIRKET from KIMLIK where ICTARIH is null order by PKNO");grid.DataSource=people.DefaultView;foreach(var col in new[]{"GRUP","BOLUM","SERVIS","DURUM","GOREV","SIRKET"})if(grid.Columns.Contains(col))grid.Columns[col].Visible=false;Rename("PKNO","Kart No");Rename("AD","Adı");Rename("SOYAD","Soyadı");Rename("IGTARIH","Tarih");ApplyPeopleFilter();}catch(Exception ex){grid.DataSource=null;status.Text="Personel listesi okunamadı: "+ex.Message;}
    }
    void ApplyPeopleFilter()
    {
        if(people is null)return;var clauses=new List<string>();if(!string.IsNullOrWhiteSpace(dailyKartBas?.Text))clauses.Add($"PKNO >= '{Esc(dailyKartBas.Text)}'");if(!string.IsNullOrWhiteSpace(dailyKartBit?.Text))clauses.Add($"PKNO <= '{Esc(dailyKartBit.Text)}'");foreach(var pair in dailyLookups)if(pair.Value.SelectedItem is LookupItem item&&item.Code.Length>0)clauses.Add($"CONVERT({pair.Key},'System.String') = '{Esc(item.Code)}'");people.DefaultView.RowFilter=string.Join(" AND ",clauses);status.Text=$"Listelenen Personel: {people.DefaultView.Count}";
    }

    void CalculatePuantaj(bool monthly)
    {
        try
        {
            var a=(monthly?monthlyFrom:dailyFrom)?.Value.Date??DateTime.Today;var b=(monthly?monthlyTo:dailyTo)?.Value.Date??a;if(b<a)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            var lookups=monthly?monthlyLookups:dailyLookups;var kb=monthly?monthlyKartBas:dailyKartBas;var ke=monthly?monthlyKartBit:dailyKartBit;var employees=LoadSelectedEmployees(a,b,kb,ke,lookups);if(employees.Rows.Count==0)throw new InvalidOperationException("Hesaplanacak personel bulunamadı.");
            int normalSlot=ResolveNormalSlot();int overtimeSlot=ResolveOvertimeSlot(normalSlot);int processed=0;
            db.InTransaction((connection,tx)=>
            {
                foreach(DataRow person in employees.Rows)
                {
                    var pk=Convert.ToString(person["PKNO"])??"";var att=QueryTx(connection,tx,"select SIRA,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA from GIRCIK where PKNO=@P and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by coalesce(GTARIH,CTARIH),SIRA",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)));
                    var leave=QueryTx(connection,tx,"select TARIH,SUREDAKIKA,EBALAN,TIP from OZELIZIN where PKNO=@P and TARIH>=@A and TARIH<@B order by TARIH",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)));
                    var dates=new SortedSet<DateTime>();foreach(DataRow r in att.Rows){if(r["GTARIH"]!=DBNull.Value)dates.Add(Convert.ToDateTime(r["GTARIH"]).Date);else if(r["CTARIH"]!=DBNull.Value)dates.Add(Convert.ToDateTime(r["CTARIH"]).Date);}foreach(DataRow r in leave.Rows)if(r["TARIH"]!=DBNull.Value)dates.Add(Convert.ToDateTime(r["TARIH"]).Date);
                    int expected=DbInt(person,"GSAAT");int shiftStart=DbInt(person,"BASSAAT1");int shiftEnd=DbInt(person,"BITSAAT1");if(expected<=0&&shiftStart>0&&shiftEnd>shiftStart)expected=shiftEnd-shiftStart;if(expected<=0)expected=450;
                    foreach(var day in dates)
                    {
                        var rows=att.AsEnumerable().Where(r=>(r["GTARIH"]!=DBNull.Value&&Convert.ToDateTime(r["GTARIH"]).Date==day)||(r["GTARIH"]==DBNull.Value&&r["CTARIH"]!=DBNull.Value&&Convert.ToDateTime(r["CTARIH"]).Date==day)).ToArray();
                        var leaves=leave.AsEnumerable().Where(r=>r["TARIH"]!=DBNull.Value&&Convert.ToDateTime(r["TARIH"]).Date==day).ToArray();
                        int? firstIn=rows.Where(r=>r["GDAKIKA"]!=DBNull.Value).Select(r=>(int?)Convert.ToInt32(r["GDAKIKA"])).OrderBy(x=>x).FirstOrDefault();int? lastOut=rows.Where(r=>r["CDAKIKA"]!=DBNull.Value).Select(r=>(int?)Convert.ToInt32(r["CDAKIKA"])).OrderByDescending(x=>x).FirstOrDefault();
                        int worked=0;foreach(var r in rows)if(r["GDAKIKA"]!=DBNull.Value&&r["CDAKIKA"]!=DBNull.Value){var gi=Convert.ToInt32(r["GDAKIKA"]);var ci=Convert.ToInt32(r["CDAKIKA"]);if(ci<gi)ci+=1440;worked+=Math.Max(0,ci-gi);}
                        var leaveMinutes=leaves.Sum(r=>r["SUREDAKIKA"]==DBNull.Value?0:Convert.ToInt32(r["SUREDAKIKA"]));var normal=Math.Min(expected,worked);var overtime=Math.Max(0,worked-expected);var missing=Math.Max(0,expected-worked-leaveMinutes);var late=firstIn.HasValue&&shiftStart>0?Math.Max(0,firstIn.Value-shiftStart):0;var early=lastOut.HasValue&&shiftEnd>0?Math.Max(0,shiftEnd-lastOut.Value):0;
                        var inText=firstIn.HasValue?FormatMinutes(firstIn.Value):"";var outText=lastOut.HasValue?FormatMinutes(lastOut.Value):"";var statusText=rows.Length==0&&leaves.Length>0?"İzinli":rows.Length>0&&!lastOut.HasValue?"Çıkış Eksik":rows.Length>0&&!firstIn.HasValue?"Giriş Eksik":"Çalıştı";var seq=rows.FirstOrDefault()?["SIRA"]??DBNull.Value;var bol=person["BOLUM"];
                        var exists=Convert.ToInt32(ScalarTx(connection,tx,"select count(*) from PUANTAJ where PKNO=@P and TARIH=@D",new FbParameter("@P",pk),new FbParameter("@D",day))??0);if(exists==0)ExecTx(connection,tx,"insert into PUANTAJ (PKNO,TARIH,BOLUM) values (@P,@D,@B)",new FbParameter("@P",pk),new FbParameter("@D",day),new FbParameter("@B",bol));
                        var sql=$"update PUANTAJ set GIRIS=@GI,CIKIS=@CI,STATUS=@ST,GIRCIK=@S,BOLUM=@B,GECS=@GES,GECD=@GED,GECG=@GEG,ERKENS=@ERS,ERKEND=@ERD,ERKENG=@ERG,EKSIKS=@EKS,EKSIKD=@EKD,EKSIKG=@EKG,SAAT{normalSlot}=@NS,DAKIKA{normalSlot}=@ND,GUN{normalSlot}=@NG,SAAT{overtimeSlot}=@OS,DAKIKA{overtimeSlot}=@OD,GUN{overtimeSlot}=@OG where PKNO=@P and TARIH=@D";
                        ExecTx(connection,tx,sql,new FbParameter("@GI",DbString(inText)),new FbParameter("@CI",DbString(outText)),new FbParameter("@ST",statusText),new FbParameter("@S",seq),new FbParameter("@B",bol),new FbParameter("@GES",FormatMinutes(late)),new FbParameter("@GED",late),new FbParameter("@GEG",late>0?1:0),new FbParameter("@ERS",FormatMinutes(early)),new FbParameter("@ERD",early),new FbParameter("@ERG",early>0?1:0),new FbParameter("@EKS",FormatMinutes(missing)),new FbParameter("@EKD",missing),new FbParameter("@EKG",missing>0?1:0),new FbParameter("@NS",FormatMinutes(normal)),new FbParameter("@ND",normal),new FbParameter("@NG",normal>0?1:0),new FbParameter("@OS",FormatMinutes(overtime)),new FbParameter("@OD",overtime),new FbParameter("@OG",0),new FbParameter("@P",pk),new FbParameter("@D",day));
                        foreach(var lg in leaves.GroupBy(r=>r["EBALAN"]==DBNull.Value?0:Convert.ToInt32(r["EBALAN"])))if(lg.Key>=1&&lg.Key<=9){var mins=lg.Sum(r=>r["SUREDAKIKA"]==DBNull.Value?0:Convert.ToInt32(r["SUREDAKIKA"]));ExecTx(connection,tx,$"update PUANTAJ set SAAT{lg.Key}=@S,DAKIKA{lg.Key}=@M,GUN{lg.Key}=@G where PKNO=@P and TARIH=@D",new FbParameter("@S",FormatMinutes(mins)),new FbParameter("@M",mins),new FbParameter("@G",mins>=expected?1:0),new FbParameter("@P",pk),new FbParameter("@D",day));}
                        processed++;
                    }
                }
                return processed;
            });
            from.Value=a;to.Value=b;if(monthly){if(monthlyProgress is not null)monthlyProgress.Value=100;}else{if(dailyProgress1 is not null)dailyProgress1.Value=100;if(dailyProgress2 is not null)dailyProgress2.Value=100;}
            MessageBox.Show($"{a:dd.MM.yyyy} - {b:dd.MM.yyyy} tarihleri arası puantaj işlemi tamamlandı.\nİşlenen personel/gün: {processed}","Puantaj",MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Puantaj",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    DataTable LoadSelectedEmployees(DateTime a,DateTime b,TextBox? kb,TextBox? ke,Dictionary<string,ComboBox> lookups)
    {
        var sql="select K.PKNO,K.AD,K.SOYAD,K.IGTARIH,K.ICTARIH,K.GRUP,K.BOLUM,K.SERVIS,K.DURUM,K.GOREV,K.SIRKET,G.GSAAT,G.BASSAAT1,G.BITSAAT1 from KIMLIK K left join GRUP G on G.KOD=K.GRUP where K.IGTARIH<@END and (K.ICTARIH is null or K.ICTARIH>=@START)";var ps=new List<FbParameter>{new("@START",a),new("@END",b.AddDays(1))};if(!string.IsNullOrWhiteSpace(kb?.Text)){sql+=" and K.PKNO>=@KB";ps.Add(new("@KB",kb!.Text.Trim()));}if(!string.IsNullOrWhiteSpace(ke?.Text)){sql+=" and K.PKNO<=@KE";ps.Add(new("@KE",ke!.Text.Trim()));}foreach(var pair in lookups)if(pair.Value.SelectedItem is LookupItem li&&li.Code.Length>0){sql+=$" and K.{pair.Key}=@{pair.Key}";ps.Add(new("@"+pair.Key,Convert.ToInt32(li.Code)));}sql+=" order by K.PKNO";return db.Query(sql,ps.ToArray());
    }
    int ResolveNormalSlot(){try{var v=db.Scalar("select first 1 KOD from BORDRO where TIP=1 and KOD between 1 and 9 order by KOD");if(v!=null&&v!=DBNull.Value)return Math.Clamp(Convert.ToInt32(v),1,9);}catch{}return 1;}
    int ResolveOvertimeSlot(int normal){try{var v=db.Scalar("select first 1 KOD from BORDRO where TIP=2 and KOD between 1 and 9 order by KOD");if(v!=null&&v!=DBNull.Value)return Math.Clamp(Convert.ToInt32(v),1,9);}catch{}return normal==1?2:1;}
    static int DbInt(DataRow r,string c)=>r.Table.Columns.Contains(c)&&r[c]!=DBNull.Value?Convert.ToInt32(r[c]):0;
    static object DbString(string s)=>string.IsNullOrWhiteSpace(s)?DBNull.Value:s;
    static string FormatMinutes(int minutes){minutes=Math.Max(0,minutes);return $"{minutes/60:00}:{minutes%60:00}";}
    static DataTable QueryTx(FbConnection c,FbTransaction t,string sql,params FbParameter[] ps){using var cmd=FirebirdDatabase.CreateCommand(c,t,sql,ps);using var ad=new FbDataAdapter(cmd);var dt=new DataTable();ad.Fill(dt);return dt;}
    static object? ScalarTx(FbConnection c,FbTransaction t,string sql,params FbParameter[] ps){using var cmd=FirebirdDatabase.CreateCommand(c,t,sql,ps);return cmd.ExecuteScalar();}
    static int ExecTx(FbConnection c,FbTransaction t,string sql,params FbParameter[] ps){using var cmd=FirebirdDatabase.CreateCommand(c,t,sql,ps);return cmd.ExecuteNonQuery();}

    // ---------------- BORDRO ----------------
    void BuildBordroUi()
    {
        Text="Genel Maaş Bordrosu";var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(10)};root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        var dates=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2};dates.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));dates.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));AddFilterRow(dates,"Başlangıç Tarihi",from,0);AddFilterRow(dates,"Bitiş Tarihi",to,1);root.Controls.Add(dates,0,0);
        var sortBox=new GroupBox{Text="Sıralama Şekli",Dock=DockStyle.Fill};bordroSort=new ComboBox{Dock=DockStyle.Top,DropDownStyle=ComboBoxStyle.DropDownList};bordroSort.Items.AddRange(new object[]{"Kart No","İşe Giriş Tarihi","Ad - Soyad","Soyad - Ad","Sicil No"});bordroSort.SelectedIndex=0;sortBox.Controls.Add(bordroSort);root.Controls.Add(sortBox,0,1);
        var filterBox=new GroupBox{Text="Filtreler",Dock=DockStyle.Fill};var filters=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(5)};filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));bordroKartBas=new TextBox{Dock=DockStyle.Fill};bordroKartBit=new TextBox{Dock=DockStyle.Fill};AddFilterRow(filters,"Kart No Başlangıç",bordroKartBas,0);AddFilterRow(filters,"Kart No Bitiş",bordroKartBit,1);AddLookupRows(filters,bordroLookups,2);filterBox.Controls.Add(filters);root.Controls.Add(filterBox,0,2);
        var bar=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(5,4,5,0)};bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));var preview=LegacyButton("Önizleme",105,28);preview.Anchor=AnchorStyles.Left;var close=LegacyButton("Kapat",85,28);close.Anchor=AnchorStyles.Right;close.DialogResult=DialogResult.Cancel;preview.Click+=(_,_)=>ShowBordroPreview();bar.Controls.Add(preview,0,0);bar.Controls.Add(close,1,0);root.Controls.Add(bar,0,3);Controls.Add(root);CancelButton=close;
    }

    void ShowBordroPreview()
    {
        try
        {
            var result=BuildPayrollPreview();using var preview=new Form{Text="Genel Maaş Bordrosu - Önizleme",StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.SizableToolWindow,Size=new Size(1050,620),ShowInTaskbar=false,Font=Font};
            var resultGrid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,DataSource=result.DefaultView,BackgroundColor=Color.White};var menu=new ContextMenuStrip();menu.Items.Add("Excel/CSV Kaydet",null,(_,_)=>ExportGridCsv(resultGrid,"Genel_Maas_Bordrosu"));resultGrid.ContextMenuStrip=menu;preview.Controls.Add(resultGrid);preview.ShowDialog(this);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Genel Maaş Bordrosu",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    DataTable BuildPayrollPreview()
    {
        var a=from.Value.Date;var b=to.Value.Date;if(b<a)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");LoadLookupsIfNeeded(bordroLookups);var emps=LoadSelectedEmployees(a,b,bordroKartBas,bordroKartBit,bordroLookups);var normalSlot=ResolveNormalSlot();var otRows=db.Query("select KOD,CARPAN from BORDRO where TIP=2 and KOD between 1 and 9 order by KOD");var ot50=new List<int>();var ot100=new List<int>();foreach(DataRow r in otRows.Rows){var slot=Convert.ToInt32(r["KOD"]);var factor=r["CARPAN"]==DBNull.Value?50:Convert.ToInt32(r["CARPAN"]);if(factor>=100)ot100.Add(slot);else ot50.Add(slot);}if(ot50.Count==0&&ot100.Count==0)ot50.Add(ResolveOvertimeSlot(normalSlot));
        var result=new DataTable();result.Columns.Add("Kart No");result.Columns.Add("Adı");result.Columns.Add("Soyadı");result.Columns.Add("Maaş",typeof(decimal));result.Columns.Add("Çalışılan Gün",typeof(decimal));result.Columns.Add("FM %50 Saat",typeof(decimal));result.Columns.Add("FM %100 Saat",typeof(decimal));result.Columns.Add("Ek Kazanç",typeof(decimal));result.Columns.Add("Kesinti",typeof(decimal));result.Columns.Add("Brüt",typeof(decimal));result.Columns.Add("Net",typeof(decimal));
        foreach(DataRow emp in emps.Rows)
        {
            var pk=Convert.ToString(emp["PKNO"])??"";var q=$"select coalesce(sum(GUN{normalSlot}),0) GD,coalesce(sum(DAKIKA{normalSlot}),0) NM";foreach(var s in ot50)q+=$",coalesce(sum(DAKIKA{s}),0) F50_{s}";foreach(var s in ot100)q+=$",coalesce(sum(DAKIKA{s}),0) F100_{s}";q+=" from PUANTAJ where PKNO=@P and TARIH>=@A and TARIH<@B";var p=db.Query(q,new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1))).Rows[0];var days=Convert.ToDecimal(p["GD"]);var f50=ot50.Sum(s=>Convert.ToInt32(p[$"F50_{s}"]));var f100=ot100.Sum(s=>Convert.ToInt32(p[$"F100_{s}"]));
            var av=db.Query("select coalesce(sum(case when T.ISARET='+' then A.MIKTAR else 0 end),0) KAZ,coalesce(sum(case when T.ISARET='-' then A.MIKTAR else 0 end),0) KES from AVANS A left join AVTUR T on T.KOD=A.TURKOD where A.PKNO=@P and A.TARIH>=@A and A.TARIH<@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1))).Rows[0];var kaz=Convert.ToDecimal(av["KAZ"]);var kes=Convert.ToDecimal(av["KES"]);var salary=emp.Table.Columns.Contains("MAAS")&&emp["MAAS"]!=DBNull.Value?Convert.ToDecimal(emp["MAAS"]):Convert.ToDecimal(db.Scalar("select coalesce(MAAS,0) from KIMLIK where PKNO=@P",new FbParameter("@P",pk))??0);var pay=PayrollCalculator.Calculate(new PayrollInput(salary,days,f50,f100,kaz,kes,0));
            result.Rows.Add(pk,Convert.ToString(emp["AD"])??"",Convert.ToString(emp["SOYAD"])??"",salary,days,Math.Round(f50/60m,2),Math.Round(f100/60m,2),kaz,kes,pay.GrossPay,pay.NetPay);
        }
        var sort=bordroSort?.SelectedIndex??0;result.DefaultView.Sort=sort switch{1=>"[Kart No] ASC",2=>"[Adı] ASC,[Soyadı] ASC",3=>"[Soyadı] ASC,[Adı] ASC",4=>"[Kart No] ASC",_=>"[Kart No] ASC"};return result;
    }

    void LoadLookupsIfNeeded(Dictionary<string,ComboBox> target){if(target.Count>0&&target.Values.Any(x=>x.DataSource is null))LoadLookups(target);}

    // ---------------- COMMON DATA ----------------
    static void AddFilterRow(TableLayoutPanel table,string label,Control control,int row){if(table.RowCount<=row)table.RowCount=row+1;table.RowStyles.Add(new RowStyle(SizeType.Absolute,26));table.Controls.Add(new Label{Text=label,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft},0,row);control.Dock=DockStyle.Fill;table.Controls.Add(control,1,row);}
    static Button LegacyButton(string text,int width,int height)=>new(){Text=text,Width=width,Height=height,ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    void ReloadData()
    {
        if(view==LegacyDataView.GirisCikis){LoadGirisLookups();ReloadGirisFromState();return;}if(view==LegacyDataView.Puantaj){LoadPuantajPeople();return;}try{if(view==LegacyDataView.Bordro&&bordroLookups.Count>0)LoadLookupsIfNeeded(bordroLookups);var a=from.Value.Date;var b=to.Value.Date.AddDays(1);data=view switch{LegacyDataView.Avanslar=>db.Query("select A.KOD,A.PKNO,K.AD,K.SOYAD,A.TARIH,A.VTARIH,A.TURKOD,A.MIKTAR,A.ACIKLAMA from AVANS A left join KIMLIK K on K.PKNO=A.PKNO where A.TARIH>=@A and A.TARIH<@B order by A.TARIH,A.PKNO,A.KOD",new FbParameter("@A",a),new FbParameter("@B",b)),LegacyDataView.PuantajSonuclari=>LoadPuantajResults(a,b),LegacyDataView.Bordro=>BuildPayrollPreview(),_=>new DataTable()};if(view!=LegacyDataView.Bordro)grid.DataSource=data;ApplyColumnNames();ApplySearch();}catch(Exception ex){grid.DataSource=null;status.Text="Veri okunamadı: "+ex.Message;}
    }
    DataTable LoadPuantajResults(DateTime a,DateTime b)
    {
        var n=ResolveNormalSlot();var o=ResolveOvertimeSlot(n);return db.Query($"select P.PKNO,K.AD,K.SOYAD,coalesce(sum(P.GUN{n}),0) NORMAL_GUN,coalesce(sum(P.DAKIKA{n}),0) NORMAL_DAKIKA,coalesce(sum(P.DAKIKA{o}),0) FAZLA_MESAI_DAKIKA,coalesce(sum(P.DEVAMSIZLIKG),0) DEVAMSIZLIK,coalesce(sum(P.GECG),0) GEC_KALMA,coalesce(sum(P.ERKENG),0) ERKEN_CIKIS,coalesce(sum(P.EKSIKG),0) EKSIK_SURE from PUANTAJ P left join KIMLIK K on K.PKNO=P.PKNO where P.TARIH>=@A and P.TARIH<@B group by P.PKNO,K.AD,K.SOYAD order by P.PKNO",new FbParameter("@A",a),new FbParameter("@B",b));
    }
    void ApplySearch(){if(data is null)return;var s=search.Text.Trim().Replace("'","''");if(data.Columns.Contains("PKNO")&&data.Columns.Contains("AD")&&data.Columns.Contains("SOYAD"))data.DefaultView.RowFilter=s.Length==0?"":$"CONVERT(PKNO,'System.String') LIKE '%{s}%' OR CONVERT(AD,'System.String') LIKE '%{s}%' OR CONVERT(SOYAD,'System.String') LIKE '%{s}%'";status.Text=$"{Title(view)} - Kayıt: {data.DefaultView.Count}";}
    void ApplyColumnNames(){Rename("PKNO","Kart No");Rename("AD","Adı");Rename("SOYAD","Soyadı");Rename("GIRIS_TARIHI","Giriş Tarihi");Rename("GIRIS_SAATI","Giriş Saati");Rename("CIKIS_TARIHI","Çıkış Tarihi");Rename("CIKIS_SAATI","Çıkış Saati");Rename("GTUR","Tür");Rename("CTUR","Tür");Rename("TARIH","Tarih");Rename("MIKTAR","Miktar");Rename("ACIKLAMA","Açıklama");Rename("BASTAR","Başlangıç");Rename("BITTAR","Bitiş");}
    void Rename(string column,string text){if(grid.Columns.Contains(column))grid.Columns[column].HeaderText=text;}
    static string Esc(string value)=>value.Replace("'","''");
    sealed record LookupItem(string Code,string Name);

    static void ExportGridCsv(DataGridView source,string name)
    {
        using var save=new SaveFileDialog{Filter="CSV Dosyası (*.csv)|*.csv",FileName=$"{name}_{DateTime.Now:yyyyMMdd_HHmm}.csv"};if(save.ShowDialog()!=DialogResult.OK)return;using var writer=new StreamWriter(save.FileName,false,new System.Text.UTF8Encoding(true));var visible=source.Columns.Cast<DataGridViewColumn>().Where(c=>c.Visible).ToArray();writer.WriteLine(string.Join(";",visible.Select(c=>Csv(c.HeaderText))));foreach(DataGridViewRow row in source.Rows){if(row.IsNewRow)continue;writer.WriteLine(string.Join(";",visible.Select(c=>Csv(Convert.ToString(row.Cells[c.Index].Value)??""))));}
    }
    static string Csv(string value)=>"\""+value.Replace("\"","\"\"")+"\"";

    static string Title(LegacyDataView view)=>view switch{LegacyDataView.GirisCikis=>"Giriş-Çıkışlar",LegacyDataView.Avanslar=>"Avanslar",LegacyDataView.Puantaj=>"Günlük ve Aylık Puantaj İşlemleri",LegacyDataView.PuantajSonuclari=>"Puantaj Sonuçları",LegacyDataView.Bordro=>"Genel Maaş Bordrosu",_=>"KYERP PDKS"};
}
