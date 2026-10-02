using System.Data;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal sealed class ReportCenterForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly ComboBox report = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 330 };
    readonly DateTimePicker from = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly DateTimePicker to = new() { Format = DateTimePickerFormat.Short, Width = 120 };
    readonly TextBox card = new() { Width = 90 };
    readonly DataGridView grid = new()
    {
        Name = "ReportCenterGrid",
        Dock = DockStyle.Fill,
        ReadOnly = true,
        AllowUserToAddRows = false,
        AllowUserToDeleteRows = false,
        AllowUserToOrderColumns = true,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
        BackgroundColor = Color.White
    };
    readonly Label summary = new() { AutoSize = true, Padding = new Padding(8, 10, 8, 0) };
    DataTable data = new();

    static readonly string[] Reports =
    [
        "Personel • Ad Soyad", "Personel • Kart No / Ad Soyad", "Personel • Kart / Ad Soyad / Maaş",
        "Personel • Kart / Ad Soyad / Maaş / İşe Giriş", "Personel • Kart / Ad Soyad / Bölüm",
        "Giriş Çıkış • Tarihe Göre", "Giriş Çıkış • Ad Soyada Göre", "Giriş Çıkış • Bölüme Göre",
        "Puantaj • Genel", "Puantaj • Kişiye Göre", "Puantaj • Tarihe Göre", "Puantaj • Bölüme Göre", "Puantaj • Çalışan", "Puantaj • Devamsızlık", "Puantaj • Geç",
        "Puantaj • Erken", "Puantaj • Eksik Çalışma", "Puantaj • Eksik Süre", "Puantaj • Mesai Kalan", "Puantaj • Mesai Kalmayan",
        "İzin • Genel", "İzin • Yıllık Hakediş", "Ek Kazanç / Kesinti", "Avanslar",
        "Bordro • Genel Maaş", "Bordro • Mesai", "Bordro • Maaş Pusulası", "Bordro • Ücret Dönemleri", "Bordro • Ödemeler", "Bordro • Maaş Geçmişi",
        "Tanımlar • Bölümler", "Tanımlar • Servisler", "Tanımlar • Görevler", "Tanımlar • Gruplar", "Tanımlar • Durumlar", "Tanımlar • Firmalar"
    ];

    public ReportCenterForm(string? initialCategory = null)
    {
        Text = "KY PDKS 6.0 • Rapor ve Çıktı Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1240, 760);
        MinimumSize = new Size(980, 620);
        Font = new Font("Segoe UI", 9f);
        from.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        to.Value = DateTime.Today;
        Build();
        report.Items.AddRange(Reports);
        var initialIndex = 0;
        if (!string.IsNullOrWhiteSpace(initialCategory))
        {
            var found = Array.FindIndex(Reports, x => x.StartsWith(initialCategory, StringComparison.OrdinalIgnoreCase));
            if (found >= 0) initialIndex = found;
        }
        report.SelectedIndex = initialIndex;
        Shown += (_, _) => LoadData();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        BackColor = p.Canvas;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(14), BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(12, 8, 8, 0), BackColor=p.Surface };
        filter.Controls.Add(Label("Rapor")); filter.Controls.Add(report);
        filter.Controls.Add(Label("Başlangıç")); filter.Controls.Add(from);
        filter.Controls.Add(Label("Bitiş")); filter.Controls.Add(to);
        filter.Controls.Add(Label("Kart")); filter.Controls.Add(card);
        filter.Controls.Add(Button("Göster", LoadData, true));
        filter.Controls.Add(Button("Alanlar / Sıralama", () => GridLayoutPersistence.ShowEditor(this, grid, "report-center", "Rapor Alanları / Sıralama")));
        filter.Controls.Add(summary);
        root.Controls.Add(filter, 0, 0);
        root.Controls.Add(grid, 0, 1);
        var actions = PdksUiKit.ActionBar(true,p.Canvas);
        actions.Controls.Add(Button("CSV Aktar", ExportCsv));
        actions.Controls.Add(Button("Excel Aktar", () => Export(true)));
        actions.Controls.Add(Button("PDF Aktar", () => Export(false)));
        actions.Controls.Add(Button("Yazdır", Print));
        actions.Controls.Add(Button("Önizle", Preview));
        root.Controls.Add(actions, 0, 2);
        Controls.Add(root);
        report.SelectedIndexChanged += (_, _) => LoadData();
    }

    static Label Label(string text) => new() { Text = text, AutoSize = true, Padding = new Padding(10, 7, 4, 0), ForeColor=PdksAppearance.Current.Muted };
    static Button Button(string text, Action action, bool primary = false)
    {
        var role=primary?PdksActionRole.Primary:text.Contains("Kapat",StringComparison.OrdinalIgnoreCase)?PdksActionRole.Quiet:PdksActionRole.Secondary;
        return PdksUiKit.Button(text,text.Contains("Alanlar")?140:112,role,action);
    }

    FbParameter[] Range() => [new("@A", from.Value.Date), new("@B", to.Value.Date.AddDays(1))];
    string CardWhere(string field = "k.PKNO") => string.IsNullOrWhiteSpace(card.Text) ? "1=1" : $"{field}=@P";
    FbParameter[] RangeCard() => string.IsNullOrWhiteSpace(card.Text) ? Range() : [..Range(), new FbParameter("@P", card.Text.Trim().PadLeft(5, '0'))];

    void LoadData()
    {
        try
        {
            if (report.SelectedItem is not string name) return;
            data = Query(name);
            grid.DataSource = data;
            foreach (DataGridViewColumn c in grid.Columns)
            {
                if (c.HeaderText.Contains("Ad", StringComparison.OrdinalIgnoreCase) || c.HeaderText.Contains("Açıklama", StringComparison.OrdinalIgnoreCase)) c.Width = 150;
                else if (c.HeaderText.Contains("Tarih", StringComparison.OrdinalIgnoreCase)) c.Width = 95;
                else if (c.Width < 70) c.Width = 90;
            }
            GridLayoutPersistence.Apply(grid, "report-center");
            summary.Text = $"{data.Rows.Count} kayıt";
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    DataTable Query(string name) => name switch
    {
        "Personel • Ad Soyad" => db.Query("select AD \"Ad\",SOYAD \"Soyad\" from KIMLIK order by AD,SOYAD"),
        "Personel • Kart No / Ad Soyad" => db.Query("select PKNO \"Kart No\",AD \"Ad\",SOYAD \"Soyad\" from KIMLIK order by PKNO"),
        "Personel • Kart / Ad Soyad / Maaş" => db.Query("select PKNO \"Kart No\",AD \"Ad\",SOYAD \"Soyad\",MAAS \"Maaş\" from KIMLIK order by PKNO"),
        "Personel • Kart / Ad Soyad / Maaş / İşe Giriş" => db.Query("select PKNO \"Kart No\",AD \"Ad\",SOYAD \"Soyad\",MAAS \"Maaş\",IGTARIH \"İşe Giriş\" from KIMLIK order by PKNO"),
        "Personel • Kart / Ad Soyad / Bölüm" => db.Query("select k.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",b.AD \"Bölüm\" from KIMLIK k left join BOLUM b on b.KOD=k.BOLUM order by k.PKNO"),
        "Giriş Çıkış • Tarihe Göre" => GirisCikis("g.GTARIH,g.PKNO"),
        "Giriş Çıkış • Ad Soyada Göre" => GirisCikis("k.AD,k.SOYAD,g.GTARIH"),
        "Giriş Çıkış • Bölüme Göre" => GirisCikis("b.AD,g.GTARIH,k.AD,k.SOYAD"),
        "Puantaj • Genel" => Puantaj("1=1"),
        "Puantaj • Kişiye Göre" => Puantaj("1=1", "p.PKNO,p.TARIH"),
        "Puantaj • Tarihe Göre" => Puantaj("1=1", "p.TARIH,k.AD,k.SOYAD"),
        "Puantaj • Bölüme Göre" => Puantaj("1=1", "b.AD,p.TARIH,k.AD,k.SOYAD", true),
        "Puantaj • Çalışan" => Puantaj("coalesce(p.GUN1,0)>0"),
        "Puantaj • Devamsızlık" => Puantaj("coalesce(p.DEVAMSIZLIKG,0)>0"),
        "Puantaj • Geç" => Puantaj("coalesce(p.GECG,0)>0 or coalesce(p.GECD,0)>0"),
        "Puantaj • Erken" => Puantaj("coalesce(p.ERKENG,0)>0 or coalesce(p.ERKEND,0)>0"),
        "Puantaj • Eksik Çalışma" => Puantaj("coalesce(p.EKSIKG,0)>0"),
        "Puantaj • Eksik Süre" => Puantaj("coalesce(p.EKSIKD,0)>0"),
        "Puantaj • Mesai Kalan" => Puantaj("coalesce(p.DAKIKA2,0)>0 or coalesce(p.DAKIKA3,0)>0"),
        "Puantaj • Mesai Kalmayan" => Puantaj("coalesce(p.DAKIKA2,0)=0 and coalesce(p.DAKIKA3,0)=0"),
        "İzin • Genel" => db.Query("select o.TARIH \"Tarih\",o.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",o.MAZERET \"Mazeret\",o.TIP \"Tür\",o.SURESAAT \"Süre\",o.BASSAAT \"Başlangıç\",o.BITSAAT \"Bitiş\" from OZELIZIN o left join KIMLIK k on k.PKNO=o.PKNO where o.TARIH>=@A and o.TARIH<@B and " + CardWhere("o.PKNO") + " order by o.TARIH,o.PKNO", RangeCard()),
        "İzin • Yıllık Hakediş" => db.Query("select PKNO \"Kart No\",AD \"Ad\",SOYAD \"Soyad\",IGTARIH \"İşe Giriş\",coalesce(KULIZIN,0) \"İzin Hakedişi\" from KIMLIK order by PKNO"),
        "Ek Kazanç / Kesinti" => db.Query("select a.TARIH \"Tarih\",a.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",v.TUR \"Tür\",v.ISARET \"İşaret\",a.MIKTAR \"Miktar\",a.ACIKLAMA \"Açıklama\" from AVANS a left join KIMLIK k on k.PKNO=a.PKNO left join AVTUR v on v.KOD=a.TURKOD where a.TARIH>=@A and a.TARIH<@B and " + CardWhere("a.PKNO") + " order by a.TARIH,a.PKNO", RangeCard()),
        "Avanslar" => db.Query("select a.TARIH \"Tarih\",a.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",a.MIKTAR \"Miktar\",a.ACIKLAMA \"Açıklama\" from AVANS a left join KIMLIK k on k.PKNO=a.PKNO where a.TARIH>=@A and a.TARIH<@B and " + CardWhere("a.PKNO") + " order by a.TARIH,a.PKNO", RangeCard()),
        "Bordro • Genel Maaş" => GeneralSalaryReport(),
        "Bordro • Mesai" => OvertimeReport(),
        "Bordro • Maaş Pusulası" => SalarySlipReport(),
        "Bordro • Ücret Dönemleri" => db.Query("select u.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",u.BASTAR \"Başlangıç\",u.BITTAR \"Bitiş\",u.DONEM \"Dönem\",u.NCUCRET \"Normal Ücret\",u.NCODENEN \"Normal Ödenen\",u.FMUCRET \"Mesai Ücreti\",u.FMODENEN \"Mesai Ödenen\",u.FMKALAN \"Mesai Kalan\",u.EKKAZ \"Ek Kazanç\",u.EKKES \"Kesinti\",u.NCMAAS \"Maaş\",u.NCKALAN \"Kalan\" from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A and " + CardWhere("u.PKNO") + " order by u.BASTAR,u.PKNO", RangeCard()),
        "Bordro • Ödemeler" => db.Query("select o.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",o.BASTAR \"Başlangıç\",o.BITTAR \"Bitiş\",o.NODENEN \"Normal Ödenen\",o.NOTARIH \"Normal Ödeme Tarihi\",o.FMODENEN \"Mesai Ödenen\",o.FMOTARIH \"Mesai Ödeme Tarihi\" from ODEME o left join KIMLIK k on k.PKNO=o.PKNO where o.BASTAR<@B and coalesce(o.BITTAR,o.BASTAR)>=@A and " + CardWhere("o.PKNO") + " order by o.BASTAR,o.PKNO", RangeCard()),
        "Bordro • Maaş Geçmişi" => db.Query("select PKNO \"Kart No\",AD \"Ad\",SOYAD \"Soyad\",MAAS \"Güncel Maaş\",EMAAS \"Eski Maaş\",NSUCRET \"Saat Ücreti\",MSUCRET \"Mesai Ücreti\" from KIMLIK order by PKNO"),
        "Tanımlar • Bölümler" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from BOLUM order by KOD"),
        "Tanımlar • Servisler" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from SERVIS order by KOD"),
        "Tanımlar • Görevler" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from GOREV order by KOD"),
        "Tanımlar • Gruplar" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from GRUP order by KOD"),
        "Tanımlar • Durumlar" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from DURUM order by KOD"),
        "Tanımlar • Firmalar" => db.Query("select KOD \"Kod\",AD \"Açıklama\" from FIRMA order by KOD"),
        _ => new DataTable()
    };

    DataTable GirisCikis(string order) => db.Query(
        "select g.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",g.GTARIH \"Giriş Tarihi\",g.GSAAT \"Giriş Saati\",g.GTUR \"Giriş Türü\",g.CTARIH \"Çıkış Tarihi\",g.CSAAT \"Çıkış Saati\",g.CTUR \"Çıkış Türü\",b.AD \"Bölüm\" " +
        "from GIRCIK g left join KIMLIK k on k.PKNO=g.PKNO left join BOLUM b on b.KOD=k.BOLUM where g.GTARIH>=@A and g.GTARIH<@B and " + CardWhere("g.PKNO") + " order by " + order, RangeCard());

    DataTable Puantaj(string condition, string order = "p.TARIH,p.PKNO", bool withDepartment = false) => db.Query(
        "select p.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",p.TARIH \"Tarih\",p.GIRIS \"Giriş\",p.CIKIS \"Çıkış\",p.STATUS \"Durum\"," +
        "p.SAAT1 \"Normal\",p.SAAT2 \"%50 Mesai\",p.SAAT3 \"%100 Mesai\",p.DEVAMSIZLIKS \"Devamsızlık\",p.GECS \"Geç\",p.ERKENS \"Erken\",p.EKSIKS \"Eksik Süre\" " +
        "from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO " + (withDepartment ? "left join BOLUM b on b.KOD=k.BOLUM " : "") +
        "where p.TARIH>=@A and p.TARIH<@B and " + condition + " and " + CardWhere("p.PKNO") + " order by " + order, RangeCard());

    DataTable GeneralSalaryReport() => db.Query(
        "select u.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",u.DMAAS \"Maaş\",u.GUN1 \"Normal Gün\",u.SAAT1 \"Normal Saat\",u.SAAT2 \"%50 Mesai\",u.SAAT3 \"%100 Mesai\",u.GUN4 \"Ücretsiz İzin Gün\",u.DEVG \"Devamsız Gün\",u.DEVS \"Devamsız Saat\",u.EKG \"Eksik Gün\",u.EKS \"Eksik Saat\",u.EKKAZ \"Ek Kazanç\",u.EKKES \"Kesinti\",u.EX1 \"Avans\",u.EX4 \"İcra\",u.NCKALAN \"Maaş Kalan\",u.FMKALAN \"Mesai Kalan\",(coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0)) \"Net\",u.EX2 \"Banka\",u.EX3 \"BES\",((coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0))-coalesce(u.EX2,0)) \"Elden\" " +
        "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A and " + CardWhere("u.PKNO") + " order by u.PKNO", RangeCard());

    DataTable OvertimeReport() => db.Query(
        "select u.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",u.DMAAS \"Maaş\",u.SAAT2 \"%50 Mesai Saat\",u.UCRET2 \"%50 Mesai Ücret\",u.SAAT3 \"%100 Mesai Saat\",u.UCRET3 \"%100 Mesai Ücret\",u.SAAT8 \"Toplam Mesai Saat\",u.UCRET8 \"Toplam Mesai Ücret\",u.FMKALAN \"Mesai Kalan\" " +
        "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A and " + CardWhere("u.PKNO") + " order by u.PKNO", RangeCard());

    DataTable SalarySlipReport() => db.Query(
        "select u.PKNO \"Kart No\",k.AD \"Ad\",k.SOYAD \"Soyad\",b.AD \"Bölüm\",k.IGTARIH \"İşe Giriş\",k.ICTARIH \"İşten Çıkış\",u.DMAAS \"Maaş\",u.GUN1 \"Normal Gün\",u.SAAT1 \"Normal Saat\",u.UCRET1 \"Normal Ücret\",u.SAAT2 \"%50 Mesai\",u.UCRET2 \"%50 Ücret\",u.SAAT3 \"%100 Mesai\",u.UCRET3 \"%100 Ücret\",u.DEVG \"Devamsız Gün\",u.DEVS \"Devamsız Saat\",u.DEVU \"Devamsız Tutar\",u.GUN9 \"Yıllık İzin Gün\",u.GUN5 \"Ücretli İzin Gün\",u.GUN4 \"Ücretsiz İzin Gün\",u.EX1 \"Avans\",u.EX4 \"İcra\",u.NCKALAN \"Maaş Kalan\",u.FMKALAN \"Mesai Kalan\",(coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0)) \"Net Kazanç\",u.EX2 \"Banka\",u.EX3 \"BES\",((coalesce(u.NCKALAN,0)+coalesce(u.FMKALAN,0))-coalesce(u.EX2,0)) \"Elden\" " +
        "from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO left join BOLUM b on b.KOD=k.BOLUM where u.BASTAR<@B and coalesce(u.BITTAR,u.BASTAR)>=@A and " + CardWhere("u.PKNO") + " order by u.PKNO", RangeCard());

    ReportTable Table() => GridReportAdapter.ToReport(grid, data, $"{report.SelectedItem} • {from.Value:dd.MM.yyyy} - {to.Value:dd.MM.yyyy}");
    IReadOnlyList<int> Widths() => GridReportAdapter.VisibleWidths(grid);
    void Preview() { try { LoadData(); ReportPrintHelper.Preview(this, Table(), grid.Columns.Count > 7, Widths()); } catch (Exception ex) { Error(ex); } }
    void Print() { try { LoadData(); ReportPrintHelper.Print(this, Table(), grid.Columns.Count > 7, Widths()); } catch (Exception ex) { Error(ex); } }

    void Export(bool excel)
    {
        try
        {
            LoadData();
            using var save = new SaveFileDialog { Filter = excel ? "Excel (*.xlsx)|*.xlsx" : "PDF (*.pdf)|*.pdf", DefaultExt = excel ? "xlsx" : "pdf", FileName = SafeName(report.SelectedItem?.ToString() ?? "Rapor") };
            if (save.ShowDialog(this) != DialogResult.OK) return;
            if (excel) ReportExporter.ExportExcel(save.FileName, Table()); else ReportExporter.ExportPdf(save.FileName, Table());
            MessageBox.Show("Çıktı oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { Error(ex); }
    }

    void ExportCsv()
    {
        try
        {
            LoadData();
            using var save = new SaveFileDialog { Filter = "CSV (*.csv)|*.csv", DefaultExt = "csv", FileName = SafeName(report.SelectedItem?.ToString() ?? "Rapor") };
            if (save.ShowDialog(this) != DialogResult.OK) return;
            var table = Table();
            using var sw = new StreamWriter(save.FileName, false, new UTF8Encoding(true));
            sw.WriteLine(string.Join(";", table.Columns.Select(Csv)));
            foreach (var row in table.Rows) sw.WriteLine(string.Join(";", row.Select(Csv)));
            MessageBox.Show("CSV oluşturuldu:\n" + save.FileName, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex) { Error(ex); }
    }

    static string Csv(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
    static string SafeName(string value)
    {
        foreach (var ch in Path.GetInvalidFileNameChars()) value = value.Replace(ch, '-');
        return value.Replace(' ', '-');
    }
    void Error(Exception ex) => MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
}
