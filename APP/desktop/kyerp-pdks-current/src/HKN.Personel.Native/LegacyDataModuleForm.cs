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
    readonly DataGridView grid = new()
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
    readonly Label status = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft };
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

    void ApplyLegacySize()
    {
        ClientSize = view switch
        {
            LegacyDataView.Puantaj => new Size(505, 365),
            LegacyDataView.Bordro => new Size(340, 330),
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
        var show = new Button { Text = "Göster", Width = 82, Height = 25 };
        show.Click += (_,_) => ReloadData();
        top.Controls.Add(show);
        top.Controls.Add(new Label { Text = "Ara", AutoSize = true, Padding = new Padding(12,7,4,0) });
        search.TextChanged += (_,_) => ApplySearch();
        top.Controls.Add(search);

        var closeBar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(4,4,4,0) };
        var close = new Button { Text = "Kapat", Width = 88, Height = 28, DialogResult = DialogResult.Cancel };
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
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(8) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

        var tabs = new TabControl { Dock = DockStyle.Fill, Height = 28 };
        tabs.TabPages.Add("Günlük Puantaj");
        tabs.TabPages.Add("Aylık Puantaj");
        root.Controls.Add(tabs,0,0);

        var body = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 225));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var filters = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, Padding = new Padding(4) };
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var kartBas = new TextBox { Dock = DockStyle.Fill };
        var kartBit = new TextBox { Dock = DockStyle.Fill };
        AddFilterRow(filters,"Kart No Başlangıç",kartBas,0);
        AddFilterRow(filters,"Kart No Bitiş",kartBit,1);
        AddFilterRow(filters,"Başlangıç Tarihi",from,2);
        AddFilterRow(filters,"Bitiş Tarihi",to,3);
        string[] names = ["Grup","Bölüm","Servis","Durum","Görev","Firma"];
        for (var i=0;i<names.Length;i++) AddFilterRow(filters,names[i],new ComboBox { Dock=DockStyle.Fill, DropDownStyle=ComboBoxStyle.DropDownList },4+i);
        body.Controls.Add(filters,0,0);
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells;
        body.Controls.Add(grid,1,0);
        root.Controls.Add(body,0,1);

        var progress = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=2, Padding=new Padding(6,2,6,2) };
        progress.Controls.Add(new ProgressBar { Dock=DockStyle.Fill, Minimum=0, Maximum=100 },0,0);
        progress.Controls.Add(new ProgressBar { Dock=DockStyle.Fill, Minimum=0, Maximum=100 },0,1);
        root.Controls.Add(progress,0,2);

        var buttons = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(55,4,55,2) };
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        var calc = new Button { Text="Hesapla", Width=110, Height=30, Anchor=AnchorStyles.None };
        var result = new Button { Text="Puantaj Sonuçları", Width=120, Height=30, Anchor=AnchorStyles.None };
        calc.Click += (_,_) => ReloadData();
        result.Click += (_,_) => { using var f = new LegacyDataModuleForm(LegacyDataView.PuantajSonuclari); f.ShowDialog(this); };
        buttons.Controls.Add(calc,0,0); buttons.Controls.Add(result,1,0);
        root.Controls.Add(buttons,0,3);
        Controls.Add(root);
    }

    void BuildBordroUi()
    {
        Text = "Genel Maaş Bordrosu";
        var root = new TableLayoutPanel { Dock=DockStyle.Fill, RowCount=3, Padding=new Padding(10) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));

        var dates = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, RowCount=2 };
        dates.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));
        dates.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        AddFilterRow(dates,"Başlangıç Tarihi",from,0);
        AddFilterRow(dates,"Bitiş Tarihi",to,1);
        root.Controls.Add(dates,0,0);

        var filterBox = new GroupBox { Text="Filtreler", Dock=DockStyle.Fill };
        var filters = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(5) };
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,95));
        filters.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var kartBas = new TextBox { Dock=DockStyle.Fill, Text="00000" };
        var kartBit = new TextBox { Dock=DockStyle.Fill, Text="00000" };
        AddFilterRow(filters,"Kart No Başlangıç",kartBas,0);
        AddFilterRow(filters,"Kart No Bitiş",kartBit,1);
        string[] names = ["Grubu","Bölümü","Servisi","Görevi","Durumu","Firma"];
        for(var i=0;i<names.Length;i++) AddFilterRow(filters,names[i],new ComboBox { Dock=DockStyle.Fill, DropDownStyle=ComboBoxStyle.DropDownList },2+i);
        filterBox.Controls.Add(filters);
        root.Controls.Add(filterBox,0,1);

        var bar = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(5,4,5,0) };
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        var preview = new Button { Text="Önizleme", Width=105, Height=28, Anchor=AnchorStyles.Left };
        var close = new Button { Text="Kapat", Width=85, Height=28, Anchor=AnchorStyles.Right, DialogResult=DialogResult.Cancel };
        preview.Click += (_,_) => ShowBordroPreview();
        bar.Controls.Add(preview,0,0); bar.Controls.Add(close,1,0);
        root.Controls.Add(bar,0,2);
        Controls.Add(root);
        CancelButton = close;
    }

    static void AddFilterRow(TableLayoutPanel table,string label,Control control,int row)
    {
        if(table.RowCount <= row) table.RowCount = row + 1;
        table.RowStyles.Add(new RowStyle(SizeType.Absolute,26));
        table.Controls.Add(new Label { Text=label, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft },0,row);
        control.Dock = DockStyle.Fill;
        table.Controls.Add(control,1,row);
    }

    void ShowBordroPreview()
    {
        ReloadData();
        using var preview = new Form
        {
            Text="Genel Maaş Bordrosu - Önizleme",
            StartPosition=FormStartPosition.CenterParent,
            FormBorderStyle=FormBorderStyle.SizableToolWindow,
            Size=new Size(920,600),
            ShowInTaskbar=false,
            Font=Font
        };
        var resultGrid = new DataGridView
        {
            Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,
            AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,
            DataSource=data?.DefaultView,BackgroundColor=Color.White
        };
        preview.Controls.Add(resultGrid);
        preview.ShowDialog(this);
    }

    void ReloadData()
    {
        try
        {
            var a = from.Value.Date;
            var b = to.Value.Date.AddDays(1);
            data = view switch
            {
                LegacyDataView.GirisCikis => db.Query(@"
select G.SIRA,G.PKNO,K.AD,K.SOYAD,
       G.GTARIH as GIRIS_TARIHI,G.GSAAT as GIRIS_SAATI,G.GTUR,
       G.CTARIH as CIKIS_TARIHI,G.CSAAT as CIKIS_SAATI,G.CTUR
from GIRCIK G
left join KIMLIK K on K.PKNO=G.PKNO
where ((G.GTARIH>=@A and G.GTARIH<@B) or (G.CTARIH>=@A and G.CTARIH<@B))
order by coalesce(G.GTARIH,G.CTARIH),G.PKNO,G.SIRA",
                    new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.Avanslar => db.Query(@"
select A.KOD,A.PKNO,K.AD,K.SOYAD,A.TARIH,A.VTARIH,A.TURKOD,A.MIKTAR,A.ACIKLAMA
from AVANS A
left join KIMLIK K on K.PKNO=A.PKNO
where A.TARIH>=@A and A.TARIH<@B
order by A.TARIH,A.PKNO,A.KOD",
                    new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.Puantaj => db.Query(@"
select P.PKNO,K.AD,K.SOYAD,P.TARIH,P.GUN1,P.DAKIKA1,
       P.DEVAMSIZLIKG,P.GECG,P.ERKENG,P.EKSIKG
from PUANTAJ P
left join KIMLIK K on K.PKNO=P.PKNO
where P.TARIH>=@A and P.TARIH<@B
order by P.TARIH,P.PKNO",
                    new FbParameter("@A",a),new FbParameter("@B",b)),
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
order by P.PKNO",
                    new FbParameter("@A",a),new FbParameter("@B",b)),
                LegacyDataView.Bordro => db.Query(@"
select O.PKNO,K.AD,K.SOYAD,O.BASTAR,O.BITTAR,O.NODENEN,O.FMODENEN
from ODEME O
left join KIMLIK K on K.PKNO=O.PKNO
where O.BASTAR<@B and O.BITTAR>=@A
order by O.BASTAR,O.PKNO",
                    new FbParameter("@A",a),new FbParameter("@B",b)),
                _ => new DataTable()
            };
            if (view != LegacyDataView.Bordro) grid.DataSource = data;
            ApplyColumnNames();
            ApplySearch();
        }
        catch(Exception ex)
        {
            grid.DataSource = null;
            status.Text = "Veri okunamadı: " + ex.Message;
        }
    }

    void ApplySearch()
    {
        if (data is null) return;
        var s = search.Text.Trim().Replace("'","''");
        data.DefaultView.RowFilter = s.Length == 0 ? "" :
            $"CONVERT(PKNO,'System.String') LIKE '%{s}%' OR CONVERT(AD,'System.String') LIKE '%{s}%' OR CONVERT(SOYAD,'System.String') LIKE '%{s}%'";
        status.Text = $"{Title(view)} - Kayıt: {data.DefaultView.Count}";
    }

    void ApplyColumnNames()
    {
        Rename("PKNO","Kart No"); Rename("AD","Adı"); Rename("SOYAD","Soyadı");
        Rename("GIRIS_TARIHI","Giriş Tarihi"); Rename("GIRIS_SAATI","Giriş Saati");
        Rename("CIKIS_TARIHI","Çıkış Tarihi"); Rename("CIKIS_SAATI","Çıkış Saati");
        Rename("GTUR","Tür"); Rename("CTUR","Tür"); Rename("TARIH","Tarih");
        Rename("MIKTAR","Miktar"); Rename("ACIKLAMA","Açıklama"); Rename("BASTAR","Başlangıç"); Rename("BITTAR","Bitiş");
    }

    void Rename(string column,string text)
    {
        if (grid.Columns.Contains(column)) grid.Columns[column].HeaderText = text;
    }

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
