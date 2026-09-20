using System.Data;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

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
    TextBox? dailyKartBas;
    TextBox? dailyKartBit;
    DateTimePicker? dailyFrom;
    DateTimePicker? dailyTo;
    DateTimePicker? monthlyFrom;
    DateTimePicker? monthlyTo;
    ProgressBar? dailyProgress1;
    ProgressBar? dailyProgress2;
    ProgressBar? monthlyProgress;
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
        MinimizeBox = false;
        MaximizeBox = false;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.Dpi;
        ApplyLegacySize();
        BuildUi();
        var first = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        from.Value = first;
        to.Value = first.AddMonths(1).AddDays(-1);
        Shown += (_,_) => ReloadData();
    }

    static DataGridView NewGrid()=>new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        MultiSelect = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        BackgroundColor = Color.White,
        RowHeadersWidth = 18,
        RowTemplate = { Height = 20 },
        ColumnHeadersHeight = 20
    };

    void ApplyLegacySize()
    {
        ClientSize = view switch
        {
            LegacyDataView.Puantaj => new Size(505, 365),
            LegacyDataView.Bordro => new Size(350, 345),
            LegacyDataView.PuantajSonuclari => new Size(760, 500),
            LegacyDataView.Avanslar => new Size(760, 500),
            _ => new Size(860, 520)
        };
    }

    public void PrepareForEmbedding()
    {
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        ShowInTaskbar = false;
    }

    void BuildUi()
    {
        if (view == LegacyDataView.Puantaj) { BuildPuantajUi(); return; }
        if (view == LegacyDataView.Bordro) { BuildBordroUi(); return; }
        BuildGridUi();
    }

    void BuildGridUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(5) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));

        var top = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(2,4,0,0) };
        top.Controls.Add(new Label { Text = "Tarih Aralığı", AutoSize = true, Padding = new Padding(0,7,4,0) });
        top.Controls.Add(from);
        top.Controls.Add(new Label { Text = "ile", AutoSize = true, Padding = new Padding(4,7,4,0) });
        top.Controls.Add(to);
        var show = LegacyButton("Göster",82,25);
        show.Click += (_,_) => ReloadData();
        top.Controls.Add(show);
        top.Controls.Add(new Label { Text = "Ara", AutoSize = true, Padding = new Padding(12,7,4,0) });
        search.TextChanged += (_,_) => ApplySearch();
        top.Controls.Add(search);

        var closeBar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(4,4,4,0) };
        var close = LegacyButton("Kapat",88,28); close.DialogResult = DialogResult.Cancel;
        closeBar.Controls.Add(close);

        root.Controls.Add(top,0,0);
        root.Controls.Add(grid,0,1);
        root.Controls.Add(status,0,2);
        root.Controls.Add(closeBar,0,3);
        Controls.Add(root);
        CancelButton = close;
    }

    void BuildPuantajUi()
    {
        Text = "Günlük ve Aylık Puantaj İşlemleri";
        var tabs = new TabControl { Dock=DockStyle.Fill, Padding=new Point(6,3) };
        tabs.TabPages.Add(BuildDailyPuantajPage());
        tabs.TabPages.Add(BuildMonthlyPuantajPage());
        Controls.Add(tabs);
    }

    TabPage BuildDailyPuantajPage()
    {
        var page=new TabPage("Günlük Puantaj");
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(8)};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,38));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,43));
        var body=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2};
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,225));body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var filters=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2,Padding=new Padding(4)};
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        dailyKartBas=new TextBox{Dock=DockStyle.Fill};dailyKartBit=new TextBox{Dock=DockStyle.Fill};
        var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);
        dailyFrom=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first};
        dailyTo=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first.AddMonths(1).AddDays(-1)};
        AddFilterRow(filters,"Kart No Başlangıç",dailyKartBas,0);AddFilterRow(filters,"Kart No Bitiş",dailyKartBit,1);
        AddFilterRow(filters,"Başlangıç Tarihi",dailyFrom,2);AddFilterRow(filters,"Bitiş Tarihi",dailyTo,3);
        AddLookupRows(filters,dailyLookups,4);
        body.Controls.Add(filters,0,0);
        grid.AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill;body.Controls.Add(grid,1,0);root.Controls.Add(body,0,0);

        var progress=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(5,2,5,1)};
        dailyProgress1=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100};dailyProgress2=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100};
        progress.Controls.Add(dailyProgress1,0,0);progress.Controls.Add(dailyProgress2,0,1);root.Controls.Add(progress,0,1);
        var buttons=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Padding=new Padding(55,4,55,1)};buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        var calc=LegacyButton("Hesapla",110,30);var result=LegacyButton("Puantaj Sonuçları",120,30);calc.Anchor=AnchorStyles.None;result.Anchor=AnchorStyles.None;
        calc.Click+=(_,_)=>CalculatePuantaj(false);result.Click+=(_,_)=>{using var f=new LegacyDataModuleForm(LegacyDataView.PuantajSonuclari);f.ShowDialog(this);};
        buttons.Controls.Add(calc,0,0);buttons.Controls.Add(result,1,0);root.Controls.Add(buttons,0,2);page.Controls.Add(root);
        return page;
    }

    TabPage BuildMonthlyPuantajPage()
    {
        var page=new TabPage("Aylık Puantaj");
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(10,12,10,8)};
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,31));root.RowStyles.Add(new RowStyle(SizeType.Absolute,52));
        var holder=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3};holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,52));holder.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));
        var filters=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2,Padding=new Padding(3)};filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,105));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var kartBas=new TextBox{Dock=DockStyle.Fill};var kartBit=new TextBox{Dock=DockStyle.Fill};
        var first=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);monthlyFrom=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first};monthlyTo=new DateTimePicker{Dock=DockStyle.Fill,Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy dddd",Value=first.AddMonths(1).AddDays(-1)};
        AddFilterRow(filters,"Kart No Başlangıç",kartBas,0);AddFilterRow(filters,"Kart No Bitiş",kartBit,1);AddFilterRow(filters,"Dönem Başlangıç Tarihi",monthlyFrom,2);AddFilterRow(filters,"Dönem Bitiş Tarihi",monthlyTo,3);AddLookupRows(filters,monthlyLookups,4);
        holder.Controls.Add(filters,1,0);root.Controls.Add(holder,0,0);
        monthlyProgress=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=100,Margin=new Padding(4,5,4,5)};root.Controls.Add(monthlyProgress,0,1);
        var buttonHolder=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,Padding=new Padding(176,7,0,0)};var calc=LegacyButton("Hesapla",140,30);calc.Click+=(_,_)=>CalculatePuantaj(true);buttonHolder.Controls.Add(calc);root.Controls.Add(buttonHolder,0,2);page.Controls.Add(root);
        return page;
    }

    void AddLookupRows(TableLayoutPanel table,Dictionary<string,ComboBox> target,int startRow)
    {
        var names=new[]{("Grup","GRUP","GRUP"),("Bölüm","BOLUM","BOLUM"),("Servis","SERVIS","SERVIS"),("Durum","DURUM","DURUM"),("Görev","GOREV","GOREV"),("Firma","SIRKET","FIRMA")};
        for(int i=0;i<names.Length;i++)
        {
            var box=new ComboBox{Dock=DockStyle.Fill,DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember=nameof(LookupItem.Name),ValueMember=nameof(LookupItem.Code),Tag=names[i].Item3};
            target[names[i].Item2]=box;AddFilterRow(table,names[i].Item1,box,startRow+i);
            box.SelectedIndexChanged+=(_,_)=>ApplyPeopleFilter();
        }
    }

    void LoadLookups(Dictionary<string,ComboBox> target)
    {
        foreach(var pair in target)
        {
            var table=Convert.ToString(pair.Value.Tag)??pair.Key;
            var rows=db.Query($"select KOD,AD from {table} order by KOD");
            var items=new List<LookupItem>{new("","Tümü")};
            foreach(DataRow row in rows.Rows) items.Add(new(Convert.ToString(row["KOD"])??"",Convert.ToString(row["AD"])??""));
            pair.Value.DataSource=items;
        }
    }

    void LoadPuantajPeople()
    {
        try
        {
            LoadLookups(dailyLookups);LoadLookups(monthlyLookups);
            people=db.Query(@"select PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,SERVIS,DURUM,GOREV,SIRKET from KIMLIK where ICTARIH is null order by PKNO");
            grid.DataSource=people.DefaultView;
            foreach(var col in new[]{"GRUP","BOLUM","SERVIS","DURUM","GOREV","SIRKET"}) if(grid.Columns.Contains(col)) grid.Columns[col].Visible=false;
            Rename("PKNO","Kart No");Rename("AD","Adı");Rename("SOYAD","Soyadı");Rename("IGTARIH","Tarih");
            ApplyPeopleFilter();
        }
        catch(Exception ex){grid.DataSource=null;status.Text="Personel listesi okunamadı: "+ex.Message;}
    }

    void ApplyPeopleFilter()
    {
        if(people is null)return;
        var clauses=new List<string>();
        if(!string.IsNullOrWhiteSpace(dailyKartBas?.Text)) clauses.Add($"PKNO >= '{Esc(dailyKartBas.Text)}'");
        if(!string.IsNullOrWhiteSpace(dailyKartBit?.Text)) clauses.Add($"PKNO <= '{Esc(dailyKartBit.Text)}'");
        foreach(var pair in dailyLookups)
        {
            if(pair.Value.SelectedItem is LookupItem item&&!string.IsNullOrWhiteSpace(item.Code)) clauses.Add($"CONVERT({pair.Key},'System.String') = '{Esc(item.Code)}'");
        }
        people.DefaultView.RowFilter=string.Join(" AND ",clauses);
        status.Text=$"Listelenen Personel: {people.DefaultView.Count}";
    }

    void CalculatePuantaj(bool monthly)
    {
        try
        {
            var a=(monthly?monthlyFrom:dailyFrom)?.Value.Date??DateTime.Today;
            var b=(monthly?monthlyTo:dailyTo)?.Value.Date??a;
            if(b<a)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            from.Value=a;to.Value=b;
            var count=Convert.ToInt32(db.Scalar("select count(*) from PUANTAJ where TARIH>=@A and TARIH<@B",new FbParameter("@A",a),new FbParameter("@B",b.AddDays(1)))??0);
            if(monthly){if(monthlyProgress is not null) monthlyProgress.Value=100;}
            else{if(dailyProgress1 is not null) dailyProgress1.Value=100;if(dailyProgress2 is not null) dailyProgress2.Value=100;}
            MessageBox.Show($"{a:dd.MM.yyyy} - {b:dd.MM.yyyy} döneminde {count} puantaj kaydı bulundu.","Puantaj",MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,"Puantaj",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    void BuildBordroUi()
    {
        Text = "Genel Maaş Bordrosu";
        var root = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=4, Padding=new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
        var dates = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, RowCount=2 };dates.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));dates.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));AddFilterRow(dates,"Başlangıç Tarihi",from,0);AddFilterRow(dates,"Bitiş Tarihi",to,1);root.Controls.Add(dates,0,0);

        var sortBox=new GroupBox{Text="Sıralama Şekli",Dock=DockStyle.Fill};var sortFlow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=true,Padding=new Padding(5,3,0,0)};
        foreach(var text in new[]{"Kart No","İşe Giriş Tarihi","Ad - Soyad","Soyad - Ad","Sicil No"})sortFlow.Controls.Add(new RadioButton{Text=text,AutoSize=true,Checked=text=="Kart No",Margin=new Padding(3,3,8,0)});sortBox.Controls.Add(sortFlow);root.Controls.Add(sortBox,0,1);

        var filterBox = new GroupBox { Text="Filtreler", Dock=DockStyle.Fill };var filters = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(5) };filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var kartBas = new TextBox { Dock=DockStyle.Fill, Text="00000" };var kartBit = new TextBox { Dock=DockStyle.Fill, Text="00000" };AddFilterRow(filters,"Kart No Başlangıç",kartBas,0);AddFilterRow(filters,"Kart No Bitiş",kartBit,1);AddLookupRows(filters,bordroLookups,2);filterBox.Controls.Add(filters);root.Controls.Add(filterBox,0,2);
        var bar = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(5,4,5,0) };bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));var preview = LegacyButton("Önizleme",105,28);preview.Anchor=AnchorStyles.Left;var close = LegacyButton("Kapat",85,28);close.Anchor=AnchorStyles.Right;close.DialogResult=DialogResult.Cancel;preview.Click += (_,_) => ShowBordroPreview();bar.Controls.Add(preview,0,0);bar.Controls.Add(close,1,0);root.Controls.Add(bar,0,3);Controls.Add(root);CancelButton = close;
    }

    static void AddFilterRow(TableLayoutPanel table,string label,Control control,int row)
    {
        if(table.RowCount <= row) table.RowCount = row + 1;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute,26));
        table.Controls.Add(new Label { Text=label, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft },0,row);
        control.Dock = DockStyle.Fill;table.Controls.Add(control,1,row);
    }

    static Button LegacyButton(string text,int width,int height)=>new(){Text=text,Width=width,Height=height,ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold),UseVisualStyleBackColor=true};

    void ShowBordroPreview()
    {
        ReloadData();
        using var preview = new Form{Text="Genel Maaş Bordrosu - Önizleme",StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.SizableToolWindow,Size=new Size(920,600),ShowInTaskbar=false,Font=Font};
        var resultGrid = new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,DataSource=data?.DefaultView,BackgroundColor=Color.White};
        preview.Controls.Add(resultGrid);preview.ShowDialog(this);
    }

    void ReloadData()
    {
        if(view==LegacyDataView.Puantaj){LoadPuantajPeople();return;}
        try
        {
            if(view==LegacyDataView.Bordro && bordroLookups.Count>0) LoadLookups(bordroLookups);
            var a = from.Value.Date;var b = to.Value.Date.AddDays(1);
            data = view switch
            {
                LegacyDataView.GirisCikis => db.Query(@"
select G.SIRA,G.PKNO,K.AD,K.SOYAD,
       G.GTARIH as GIRIS_TARIHI,G.GSAAT as GIRIS_SAATI,G.GTUR,
       G.CTARIH as CIKIS_TARIHI,G.CSAAT as CIKIS_SAATI,G.CTUR
from GIRCIK G
left join KIMLIK K on K.PKNO=G.PKNO
where ((G.GTARIH>=@A and G.GTARIH<@B) or (G.CTARIH>=@A and G.CTARIH<@B))
order by coalesce(G.GTARIH,G.CTARIH),G.PKNO,G.SIRA",new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.Avanslar => db.Query(@"
select A.KOD,A.PKNO,K.AD,K.SOYAD,A.TARIH,A.VTARIH,A.TURKOD,A.MIKTAR,A.ACIKLAMA
from AVANS A
left join KIMLIK K on K.PKNO=A.PKNO
where A.TARIH>=@A and A.TARIH<@B
order by A.TARIH,A.PKNO,A.KOD",new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.PuantajSonuclari => db.Query(@"
select P.PKNO,K.AD,K.SOYAD,
       coalesce(sum(P.GUN1),0) as NORMAL_GUN,
       coalesce(sum(P.DAKIKA1),0) as NORMAL_DAKIKA,
       coalesce(sum(P.DEVAMSIZLIKG),0) as DEVAMSIZLIK,
       coalesce(sum(P.GECG),0) as GEC_KALMA,
       coalesce(sum(P.ERKENG),0) as ERKEN_CIKIS,
       coalesce(sum(P.EKSIKG),0) as EKSIK_SURE
from PUANTAJ P
left join KIMLIK K on K.PKNO=P.PKNO
where P.TARIH>=@A and P.TARIH<@B
group by P.PKNO,K.AD,K.SOYAD
order by P.PKNO",new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.Bordro => db.Query(@"
select O.PKNO,K.AD,K.SOYAD,O.BASTAR,O.BITTAR,O.NODENEN,O.FMODENEN
from ODEME O
left join KIMLIK K on K.PKNO=O.PKNO
where O.BASTAR<@B and O.BITTAR>=@A
order by O.BASTAR,O.PKNO",new FbParameter("@A",a),new FbParameter("@B",b)),
                _ => new DataTable()
            };
            if (view != LegacyDataView.Bordro) grid.DataSource = data;
            ApplyColumnNames();ApplySearch();
        }
        catch(Exception ex){grid.DataSource = null;status.Text = "Veri okunamadı: " + ex.Message;}
    }

    void ApplySearch()
    {
        if (data is null) return;
        var s = search.Text.Trim().Replace("'","''");
        if(data.Columns.Contains("PKNO")&&data.Columns.Contains("AD")&&data.Columns.Contains("SOYAD"))
            data.DefaultView.RowFilter = s.Length == 0 ? "" : $"CONVERT(PKNO,'System.String') LIKE '%{s}%' OR CONVERT(AD,'System.String') LIKE '%{s}%' OR CONVERT(SOYAD,'System.String') LIKE '%{s}%'";
        status.Text = $"{Title(view)} - Kayıt: {data.DefaultView.Count}";
    }

    void ApplyColumnNames()
    {
        Rename("PKNO","Kart No"); Rename("AD","Adı"); Rename("SOYAD","Soyadı");Rename("GIRIS_TARIHI","Giriş Tarihi"); Rename("GIRIS_SAATI","Giriş Saati");Rename("CIKIS_TARIHI","Çıkış Tarihi"); Rename("CIKIS_SAATI","Çıkış Saati");Rename("GTUR","Tür"); Rename("CTUR","Tür"); Rename("TARIH","Tarih");Rename("MIKTAR","Miktar"); Rename("ACIKLAMA","Açıklama"); Rename("BASTAR","Başlangıç"); Rename("BITTAR","Bitiş");
    }

    void Rename(string column,string text){if (grid.Columns.Contains(column)) grid.Columns[column].HeaderText = text;}
    static string Esc(string value)=>value.Replace("'","''");
    sealed record LookupItem(string Code,string Name);

    static string Title(LegacyDataView view) => view switch
    {
        LegacyDataView.GirisCikis => "Giriş-Çıkışlar",
        LegacyDataView.Avanslar => "Avanslar",
        LegacyDataView.Puantaj => "Günlük ve Aylık Puantaj İşlemleri",
        LegacyDataView.PuantajSonuclari => "Puantaj Sonuçları",
        LegacyDataView.Bordro => "Genel Maaş Bordrosu",
        _ => "KYERP PDKS"
    };
}
