using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    readonly Dictionary<string, Label> canonicalProfileSummary = new(StringComparer.OrdinalIgnoreCase);

    TabPage BuildCanonicalBasicTab()
    {
        var p=PdksAppearance.Current;
        var page = new TabPage("Temel Bilgiler"){BackColor=p.Surface};
        var host = new TableLayoutPanel { Dock = DockStyle.Top, Height = 250, ColumnCount = 4, RowCount = 6, Padding = new Padding(14), BackColor=p.Surface };
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,125));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        for (var row = 0; row < 6; row++) host.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        var fields = new[]
        {
            ("Kart No","PKNO"),("Ad Soyad","ADSOYAD"),("İşe Giriş","IGTARIH"),("İşten Çıkış","ICTARIH"),
            ("Grup","GRUPAD"),("Bölüm","BOLUMAD"),("Servis","SERVISAD"),("Görev","GOREVAD"),
            ("Durum","DURUMAD"),("Firma","FIRMAAD"),("Net Hakediş Maaşı","HAKEDIS"),("PEK Modu","PEKMODE")
        };
        for (var i = 0; i < fields.Length; i++)
        {
            var row = i / 2; var col = (i % 2) * 2;
            host.Controls.Add(new Label { Text=fields[i].Item1, Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft, ForeColor=p.Muted }, col, row);
            var value = new Label { Text="—", Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft, BorderStyle=BorderStyle.FixedSingle, BackColor=p.SurfaceAlt, ForeColor=p.Text, Padding=new Padding(6,4,4,2) };
            canonicalProfileSummary[fields[i].Item2] = value;
            host.Controls.Add(value, col+1, row);
        }
        page.Controls.Add(host);
        return page;
    }

    TabPage BuildCanonicalIdentityTab()
        => BuildCanonicalFieldTab("Kimlik", new[]
        {
            "Ulusal Kimlik No","UKNO","Doğum Tarihi","DTARIH","Doğum Yeri","DYER","Cinsiyet","CINSIYET",
            "Baba Adı","BABAAD","Ana Adı","ANAAD","Medeni Hali","MEDHAL","Uyruğu","UYRUK",
            "Nüfusa Kayıtlı İl","IL","Nüfusa Kayıtlı İlçe","ILCE","Cilt No","CILTNO","Sayfa No","SAYFANO",
            "Kayıt No","KAYITNO","Kütük Sıra No","KSIRANO","N.C. Verildiği Yer","VYER","N.C. Verildiği Tarih","NCVTAR",
            "N.C. Veriliş Nedeni","NCVNED","Kan Grubu","KGB"
        });

    TabPage BuildCanonicalContactTab()
        => BuildCanonicalFieldTab("İletişim / Kişisel", new[]
        {
            "Vergi Kimlik No","VKNO","Askerlik Durumu","ASDURUM","Eğitim Durumu","EGTDURUM","Yabancı Dil","YDIL",
            "Uzmanlık Alanı","UALAN","Ev Telefonu","EVTEL","Cep Telefonu","GSM","Adres","ADRES",
            "Elbise Beden No","ELBNO","Ayakkabı No","AYNO","Çocuk Sayısı","CCKSAY"
        });

    TabPage BuildCanonicalDocumentsTab()
        => BuildCanonicalFieldTab("Ehliyet / Belgeler", new[]
        {
            "Ehliyet Sınıfı","ESINIF","Ehliyet Verildiği İl / İlçe","EVILILCE",
            "Ehliyet Belge Numarası","EBELGENO","Ehliyet Verildiği Tarih","EVTAR"
        });

    TabPage BuildCanonicalWorkSgkTab()
        => BuildCanonicalFieldTab("İş / SGK", new[]
        {
            "Sicil No","SICILNO","SSK No","SSKNO","Emekli / SGK Durumu","ESDRM","SGK İşe Giriş Tarihi","SGKGIRTAR",
            "Normal Saat Ücreti","NSUCRET","Eski Maaş","EMAAS","İşten Çıkış Sebebi","ICIKSEBEB"
        });

    TabPage BuildCanonicalExtraPaymentsTab()
        => BuildCanonicalFieldTab("Ek Ödemeler", new[]
        {
            "Fazla Mesai Ücreti","MSUCRET","Günlük Yol Ücreti","GYUCRET","Günlük Yemek Ücreti","GYEMUCRET",
            "Kullandığı İzin","KULIZIN","Kullandığı Cihaz","EKC"
        });

    TabPage BuildCanonicalPayrollTab()
    {
        var p=PdksAppearance.Current;
        var page=new TabPage("Bordro / SGK"){BackColor=p.Canvas,Padding=new Padding(12)};
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Canvas};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.Controls.Add(new Label
        {
            Text="Tek seferlik hakediş ve resmî bordro profili",
            Dock=DockStyle.Fill,
            Padding=new Padding(8,8,0,0),
            Font=new Font("Segoe UI",10.5f,FontStyle.Bold),
            ForeColor=p.Text,
            TextAlign=ContentAlignment.MiddleLeft
        },0,0);
        var profile=BuildPayrollProfilePanel();
        profile.Dock=DockStyle.Top;
        profile.Height=190;
        root.Controls.Add(profile,0,1);
        page.Controls.Add(root);
        return page;
    }

    TabPage BuildCanonicalFieldTab(string title, string[] fields)
    {
        var p=PdksAppearance.Current;
        var page = new TabPage(title){BackColor=p.Surface};
        var scroll = new Panel { Dock=DockStyle.Fill, AutoScroll=true, BackColor=p.Surface };
        var rows = (fields.Length / 2 + 1) / 2;
        var table = new TableLayoutPanel { Dock=DockStyle.Top, AutoSize=true, ColumnCount=4, RowCount=rows, Padding=new Padding(10), BackColor=p.Surface };
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,135));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,135));
        table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        for (var i=0; i<fields.Length; i+=2)
        {
            var pair=i/2; var row=pair/2; var col=(pair%2)*2;
            table.RowStyles.Add(new RowStyle(SizeType.Absolute,30));
            table.Controls.Add(new Label { Text=fields[i], Dock=DockStyle.Fill, TextAlign=ContentAlignment.MiddleLeft, ForeColor=p.Muted }, col, row);
            var box = new TextBox { Dock=DockStyle.Fill, BorderStyle=BorderStyle.FixedSingle, Margin=new Padding(0,2,8,2), ReadOnly=true, BackColor=p.SurfaceAlt, ForeColor=p.Text };
            f[fields[i+1]] = box;
            table.Controls.Add(box, col+1, row);
        }
        scroll.Controls.Add(table);
        page.Controls.Add(scroll);
        return page;
    }

    void UpdateCanonicalProfileSummary(DataRow row)
    {
        string Read(string column) => row.Table.Columns.Contains(column) && row[column] != DBNull.Value
            ? (row[column] is DateTime d ? d.ToString("dd.MM.yyyy") : Convert.ToString(row[column])?.Trim() ?? "—")
            : "—";
        void Set(string key, string value) { if (canonicalProfileSummary.TryGetValue(key, out var label)) label.Text = string.IsNullOrWhiteSpace(value) ? "—" : value; }

        Set("PKNO", Read("PKNO"));
        Set("ADSOYAD", (Read("AD") + " " + Read("SOYAD")).Replace("—","").Trim());
        foreach (var key in new[] { "IGTARIH","ICTARIH","GRUPAD","BOLUMAD","SERVISAD","GOREVAD","DURUMAD","FIRMAAD" }) Set(key, Read(key));
        var profile = PayrollProfileStore.Load(Read("PKNO"), ReadDecimal(row, "MAAS"));
        Set("HAKEDIS", profile.NetMonthlyEntitlement.ToString("N2") + " ₺");
        Set("PEKMODE", profile.PekMode == PekMode.LegalAutomatic ? "Mevzuata göre otomatik" : "Sabit PEK (tek tanım)");
    }

    static decimal ReadDecimal(DataRow row, string column)
    {
        if (!row.Table.Columns.Contains(column) || row[column] == DBNull.Value) return 0m;
        try { return Convert.ToDecimal(row[column]); } catch { return 0m; }
    }
}
