namespace QuickDataTool;

public sealed class PersonnelEditForm : Form
{
    readonly Dictionary<string, TextBox> boxes = new();
    readonly DateTimePicker hire = new() { Format = DateTimePickerFormat.Short };
    readonly DateTimePicker exit = new() { Format = DateTimePickerFormat.Short };
    readonly CheckBox hasExit = new() { Text = "İşten çıkış tarihi var", AutoSize = true };
    public static readonly string[] EditableFields =
    [
        "AD","SOYAD","SICILNO","GRUP","SERVIS","SIRKET","BOLUM","DURUM","GOREV","MAAS","NSUCRET","MSUCRET","EMAAS","GYUCRET","GYEMUCRET",
        "UKNO","CINSIYET","IL","ILCE","KGB","CILTNO","KSIRANO","SAYFANO","DYER","DTARIH","KAYITNO","BABAAD","ANAAD","VYER","MEDHAL","NCVTAR","NCVNED","UYRUK",
        "VKNO","SSKNO","SGKGIRTAR","ASDURUM","ELBNO","EGTDURUM","AYNO","YDIL","KULIZIN","UALAN","CCKSAY","ESINIF","EVTEL","EVILILCE","GSM","EBELGENO","EVTAR","EKC",
        "ICIKSEBEB","ADRES","BHNO"
    ];
    public bool HasExit => hasExit.Checked;
    public DateTime HireDate => hire.Value.Date;
    public DateTime? ExitDate => hasExit.Checked ? exit.Value.Date : null;
    public string Get(string key) => boxes.TryGetValue(key, out var b) ? b.Text.Trim() : "";

    public PersonnelEditForm(DataGridViewRow row)
    {
        var card = Convert.ToString(row.Cells["PKNO"].Value) ?? "";
        Text = $"Personel Kartı Düzenle - {card}"; Width = 820; Height = 760; StartPosition = FormStartPosition.CenterParent;
        var tabs = new TabControl { Dock = DockStyle.Fill };
        tabs.TabPages.Add(Page("İş / Ücret", row, ["AD","SOYAD","SICILNO","GRUP","SERVIS","SIRKET","BOLUM","DURUM","GOREV","MAAS","NSUCRET","MSUCRET","EMAAS","GYUCRET","GYEMUCRET"]));
        tabs.TabPages.Add(Page("Nüfus / Kimlik", row, ["UKNO","CINSIYET","IL","ILCE","KGB","CILTNO","KSIRANO","SAYFANO","DYER","DTARIH","KAYITNO","BABAAD","ANAAD","VYER","MEDHAL","NCVTAR","NCVNED","UYRUK"]));
        tabs.TabPages.Add(Page("Kişisel / İletişim", row, ["VKNO","SSKNO","SGKGIRTAR","ASDURUM","ELBNO","EGTDURUM","AYNO","YDIL","KULIZIN","UALAN","CCKSAY","ESINIF","EVTEL","EVILILCE","GSM","EBELGENO","EVTAR","EKC","ICIKSEBEB","ADRES","BHNO"]));
        var dates = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 80, Padding = new Padding(12) };
        dates.Controls.Add(new Label { Text = "İşe giriş", AutoSize = true, Padding = new Padding(0,8,4,0) }); dates.Controls.Add(hire);
        dates.Controls.Add(hasExit); dates.Controls.Add(exit);
        if (row.Cells["IGTARIH"].Value is DateTime h) hire.Value = h;
        if (row.Cells["ICTARIH"].Value != DBNull.Value && row.Cells["ICTARIH"].Value is DateTime e) { hasExit.Checked = true; exit.Value = e; }
        hasExit.CheckedChanged += (_,_) => exit.Enabled = hasExit.Checked; exit.Enabled = hasExit.Checked;
        var ok = new Button { Text = "Kaydet", DialogResult = DialogResult.OK, Width = 120 }; var cancel = new Button { Text = "Vazgeç", DialogResult = DialogResult.Cancel, Width = 120 };
        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) }; bar.Controls.Add(ok); bar.Controls.Add(cancel);
        Controls.Add(tabs); Controls.Add(dates); Controls.Add(bar); AcceptButton = ok; CancelButton = cancel;
    }

    TabPage Page(string title, DataGridViewRow row, string[] fields)
    {
        var page = new TabPage(title); var grid = new TableLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(14), ColumnCount = 2 };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 200)); grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var field in fields)
        {
            var value = row.DataGridView?.Columns.Contains(field) == true ? Convert.ToString(row.Cells[field].Value) ?? "" : "";
            var box = new TextBox { Dock = DockStyle.Top, Text = value }; boxes[field] = box;
            grid.Controls.Add(new Label { Text = LabelFor(field), Dock = DockStyle.Top, Height = 28 }, 0, grid.RowCount); grid.Controls.Add(box, 1, grid.RowCount); grid.RowCount++;
        }
        page.Controls.Add(grid); return page;
    }

    static string LabelFor(string key) => key switch
    {
        "AD"=>"Ad","SOYAD"=>"Soyad","SICILNO"=>"Sicil No","GRUP"=>"Grup","SERVIS"=>"Servis","SIRKET"=>"Şirket","BOLUM"=>"Bölüm","DURUM"=>"Durum","GOREV"=>"Görev",
        "MAAS"=>"Maaş","NSUCRET"=>"Saat Ücreti","MSUCRET"=>"Fazla Mesai Ücreti","EMAAS"=>"Eski Maaşı","GYUCRET"=>"Günlük Yol Ücreti","GYEMUCRET"=>"Günlük Yemek Ücreti",
        "UKNO"=>"Ulusal Kimlik No","CINSIYET"=>"Cinsiyet","IL"=>"İl","ILCE"=>"İlçe","KGB"=>"Kan Grubu","DYER"=>"Doğum Yeri","BABAAD"=>"Baba Adı","ANAAD"=>"Ana Adı","MEDHAL"=>"Medeni Hali","UYRUK"=>"Uyruğu",
        "VKNO"=>"Vergi Kimlik No","SSKNO"=>"SSK No","EVTEL"=>"Ev Telefonu","GSM"=>"Cep Telefonu","ICIKSEBEB"=>"İşten Çıkış Sebebi","ADRES"=>"Adres","BHNO"=>"Banka Hesap No",
        _=>key
    };
}
