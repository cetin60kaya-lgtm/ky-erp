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
    readonly DateTimePicker from = new() { Width = 105, Format = DateTimePickerFormat.Short };
    readonly DateTimePicker to = new() { Width = 105, Format = DateTimePickerFormat.Short };
    readonly TextBox search = new() { Width = 180 };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        MultiSelect = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        BackgroundColor = SystemColors.Control,
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
        BuildUi();
        var first = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        from.Value = first;
        to.Value = first.AddMonths(1).AddDays(-1);
        Shown += (_,_) => ReloadData();
    }

    public void PrepareForEmbedding()
    {
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
    }

    void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(5) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));

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

        root.Controls.Add(top,0,0);
        root.Controls.Add(grid,0,1);
        root.Controls.Add(status,0,2);
        Controls.Add(root);
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
            grid.DataSource = data;
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
        LegacyDataView.Puantaj => "Puantaj",
        LegacyDataView.PuantajSonuclari => "Puantaj Sonuçları",
        LegacyDataView.Bordro => "Bordro",
        _ => "KYERP PDKS"
    };
}
