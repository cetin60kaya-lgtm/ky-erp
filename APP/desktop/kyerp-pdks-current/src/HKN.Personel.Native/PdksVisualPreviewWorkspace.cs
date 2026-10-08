namespace HKN.Personel.Native;

/// <summary>
/// The real WinForms navigation workspace in review mode. There are no dummy
/// attendance rows, no connections and no writes; users review the actual layout.
/// </summary>
public sealed class PdksVisualPreviewWorkspace : Form
{
    readonly PdksCommandDescriptor command;
    readonly Color canvas = PdksAppearance.Current.Canvas;
    readonly Color surface = PdksAppearance.Current.Surface;
    readonly Color ink = PdksAppearance.Current.Text;
    readonly Color muted = PdksAppearance.Current.Muted;

    public PdksVisualPreviewWorkspace(PdksCommandDescriptor descriptor)
    {
        command = descriptor;
        Text = descriptor.Title;
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        BackColor = canvas;
        Font = new Font("Segoe UI", 9f);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3,
            Padding = new Padding(10, 8, 10, 12), BackColor = canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 74));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));

        var heading = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = canvas };
        heading.RowStyles.Add(new RowStyle(SizeType.Absolute, 39));
        heading.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        heading.Controls.Add(Label(command.Title, 17, true, ink), 0, 0);
        var description = command.Id switch
        {
            PdksCommandId.Personnel => "Soldan personeli seçin; özlük, kart ve çalışma detaylarını sağda görün",
            PdksCommandId.EntryExit => "Giriş ve çıkış hareketleri • kaynak • E durumu • tarih ve saat",
            PdksCommandId.TimesheetMonthly => "Günlük ve aylık puantaj • ay ve yıl ayrı • doğrulanmış kayıtlardan hesaplama",
            PdksCommandId.PayrollGeneral => "Bordro ve ödeme özeti • yetkili kullanıcı düzenlemeleri",
            PdksCommandId.Reports => "Rapor kategorisi • rapor • ay • yıl • personel",
            _ => command.Hint
        };
        heading.Controls.Add(Label(description, 9, false, muted), 0, 1);
        root.Controls.Add(heading, 0, 0);

        var body = command.Id switch
        {
            PdksCommandId.Personnel => BuildPersonnel(),
            PdksCommandId.EntryExit => BuildAttendance(),
            PdksCommandId.TimesheetMonthly => BuildPeriodTable("Puantaj kayıtları",
                new[] { "Kart No", "Personel", "Çalışılan", "İzin", "Eksik", "Mesai", "Durum" }),
            PdksCommandId.PayrollGeneral => BuildPeriodTable("Bordro / ödeme listesi",
                new[] { "Kart No", "Personel", "Maaş", "Yol", "Mesai", "Avans", "Kesinti", "Ödenen" }),
            PdksCommandId.Reports => BuildPeriodTable("Rapor sonuçları",
                new[] { "Kart No", "Personel", "Tarih", "Rapor", "Açıklama", "Durum" }),
            _ => BuildPeriodTable(command.Title, new[] { "Tarih", "İşlem", "Açıklama", "Durum" })
        };
        root.Controls.Add(body, 0, 1);
        root.Controls.Add(Label("GÖRSEL ÖNİZLEME  •  Canlı Firebird/TNF ve terminal bağlantısı kapalı  •  Gerçek kayıt gösterilmiyor",
            8.5f, false, PdksAppearance.Current.Warning), 0, 2);
        Controls.Add(root);
    }

    Control BuildPersonnel()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1,
            BackColor = canvas
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 350));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        var left = PanelCard();
        left.Margin = new Padding(0, 0, 9, 0);
        var leftLayout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(14), BackColor = surface };
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 47));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        leftLayout.Controls.Add(Label("Personel Listesi", 11.5f, true, ink), 0, 0);
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, BackColor = surface };
        var search = new TextBox { Width = 142, PlaceholderText = "Kart / ad / grup ara", Margin = new Padding(0, 7, 7, 0) };
        var status = Combo(new[] { "Aktif", "Pasif", "Tümü" }, 112);
        status.Margin = new Padding(0, 7, 0, 0);
        toolbar.Controls.Add(search);
        toolbar.Controls.Add(status);
        leftLayout.Controls.Add(toolbar, 0, 1);
        leftLayout.Controls.Add(Grid("Kart No", "Ad Soyad", "Grup"), 0, 2);
        leftLayout.Controls.Add(Label("0 kayıt  •  Veri bağlantısı kapalı", 8.5f, false, muted), 0, 3);
        left.Controls.Add(leftLayout);
        layout.Controls.Add(left, 0, 0);

        var right = PanelCard();
        right.Margin = new Padding(9, 0, 0, 0);
        var detail = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(16), BackColor = surface };
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 43));
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        detail.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 43));
        detail.Controls.Add(Label("Personel Detayı", 13f, true, ink), 0, 0);
        detail.Controls.Add(Label("Henüz personel seçilmedi. İnceleme modunda canlı bilgiler yüklenmez.",
            9, false, muted), 0, 1);
        var tabs = new TabControl { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        foreach (var name in new[] { "Temel Bilgiler", "Giriş / Çıkış", "İzinler", "Kazanç / Kesinti", "Puantaj", "Bordro / Ödeme" })
        {
            var page = new TabPage(name) { BackColor = surface, Padding = new Padding(16) };
            page.Controls.Add(Label("Bu bölüm canlı veya kopya veritabanı bağlandığında açılacaktır.",
                9, false, muted));
            tabs.TabPages.Add(page);
        }
        detail.Controls.Add(tabs, 0, 2);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, BackColor = surface, WrapContents = false };
        foreach (var name in new[] { "+ Yeni Personel", "Düzenle", "Kaydet", "Kart Geçmişi" })
        {
            var b = new Button { Text = name, Width = name.Length > 9 ? 135 : 85,
                Height = 31, Enabled = false, Margin = new Padding(0, 4, 8, 0) };
            actions.Controls.Add(b);
        }
        detail.Controls.Add(actions, 0, 3);
        right.Controls.Add(detail);
        layout.Controls.Add(right, 1, 0);
        return layout;
    }

    Control BuildAttendance()
    {
        var container = PanelCard();
        var content = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(14), BackColor = surface };
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        var filter = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, BackColor = surface };
        filter.Controls.Add(new DateTimePicker
        {
            Width = 144, Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy",
            Margin = new Padding(0, 11, 10, 0)
        });
        var side = Combo(new[] { "Tüm Hareketler", "Giriş", "Çıkış", "E Kayıtları" }, 138);
        side.Margin = new Padding(0, 11, 10, 0);
        filter.Controls.Add(side);
        filter.Controls.Add(new TextBox { Width = 190, PlaceholderText = "Kart / personel ara",
            Margin = new Padding(0, 11, 10, 0) });
        var refresh = new Button { Text = "Yenile", Width = 88, Height = 27, Margin = new Padding(0, 10, 0, 0) };
        refresh.Click += (_, _) => MessageBox.Show("Veri kaynağı önizleme için kapalı. Fiziksel kart kayıtları değiştirilmedi.",
            "KY PDKS Önizleme", MessageBoxButtons.OK, MessageBoxIcon.Information);
        filter.Controls.Add(refresh);
        content.Controls.Add(filter, 0, 0);
        content.Controls.Add(Grid("Tarih", "Kart No", "Personel", "Giriş", "Çıkış", "Kaynak", "E", "Durum"), 0, 1);
        content.Controls.Add(Label("0 hareket  •  Ham terminal kaydı / normal / E ayrımı canlı bağlantıdan sonra okunur",
            9, false, muted), 0, 2);
        container.Controls.Add(content);
        return container;
    }

    Control BuildPeriodTable(string title, string[] headings)
    {
        var container = PanelCard();
        var content = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(14), BackColor = surface };
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        content.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        content.Controls.Add(Label(title, 12, true, ink), 0, 0);
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, BackColor = surface };
        if (command.Id == PdksCommandId.Reports)
        {
            toolbar.Controls.Add(Combo(new[] { "Tüm Kategoriler", "Personel", "Kart / Devam", "Puantaj", "Bordro" }, 149));
            toolbar.Controls.Add(Combo(new[] { "Rapor Seçiniz" }, 135));
        }
        toolbar.Controls.Add(Combo(new[] { "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
            "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık" }, 100, DateTime.Today.Month-1));
        toolbar.Controls.Add(new NumericUpDown { Width = 82, Minimum = 2020, Maximum = 2100, Value = DateTime.Today.Year,
            Margin = new Padding(6, 5, 10, 0) });
        toolbar.Controls.Add(new TextBox { Width = 160, PlaceholderText = "Kart / personel",
            Margin = new Padding(6, 5, 0, 0) });
        content.Controls.Add(toolbar, 0, 1);
        content.Controls.Add(Grid(headings), 0, 2);
        content.Controls.Add(Label("Veri bağlantısı kapalı • Hesaplama ve rapor sonuçları gösterilmiyor",
            9, false, muted), 0, 3);
        container.Controls.Add(content);
        return container;
    }

    static ComboBox Combo(string[] items, int width, int selected = 0)
    {
        var combo = new ComboBox { Width = width, DropDownStyle = ComboBoxStyle.DropDownList,
            Margin = new Padding(0, 5, 8, 0), Font = new Font("Segoe UI", 9f) };
        combo.Items.AddRange(items);
        combo.SelectedIndex = selected;
        return combo;
    }

    DataGridView Grid(params string[] headings)
    {
        var grid = new DataGridView
        {
            Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false,
            AllowUserToDeleteRows = false, RowHeadersVisible = false,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            BackgroundColor = surface, BorderStyle = BorderStyle.None,
            EnableHeadersVisualStyles = false,
            ColumnHeadersHeight = 40, RowTemplate = { Height = 34 },
            GridColor = PdksAppearance.Current.Border
        };
        grid.ColumnHeadersDefaultCellStyle.BackColor = PdksAppearance.Current.SurfaceAlt;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = ink;
        grid.DefaultCellStyle.BackColor = surface;
        grid.DefaultCellStyle.ForeColor = ink;
        grid.DefaultCellStyle.SelectionBackColor = PdksAppearance.Current.Selection;
        for(var i = 0; i < headings.Length; i++)
            grid.Columns.Add("PREVIEW_" + i, headings[i]);
        return grid;
    }

    Panel PanelCard() => new()
    {
        Dock = DockStyle.Fill, BackColor = surface,
        Padding = Padding.Empty, BorderStyle = BorderStyle.FixedSingle
    };

    static Label Label(string text, float size, bool bold, Color color) => new()
    {
        Text = text, Dock = DockStyle.Fill, AutoEllipsis = true,
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
        TextAlign = ContentAlignment.MiddleLeft, ForeColor = color
    };
}
