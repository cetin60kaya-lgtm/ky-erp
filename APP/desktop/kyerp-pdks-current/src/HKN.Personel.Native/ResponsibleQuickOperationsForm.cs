namespace HKN.Personel.Native;

internal sealed class ResponsibleQuickOperationsForm : Form
{
    readonly MainShellForm shell;
    readonly ToolTip tips = new();

    public ResponsibleQuickOperationsForm(MainShellForm owner)
    {
        shell = owner;
        Text = "Hızlı İşlemler • Firma Sorumlusu";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(1040, 660);
        MinimumSize = new Size(920, 600);
        Font = new Font("Segoe UI", 9f);
        BackColor = PdksAppearance.Current.Canvas;
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 4,
            ColumnCount = 1,
            Padding = new Padding(24),
            BackColor = PdksAppearance.Current.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));

        root.Controls.Add(new Label
        {
            Text = "Hızlı İşlemler",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 18f, FontStyle.Bold),
            ForeColor = PdksAppearance.Current.Text,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);

        root.Controls.Add(new Label
        {
            Text = "Firma sorumlusu için günlük düzeltme ve kontrol kısayolları. Bu merkez ayrı veri mantığı oluşturmaz; mevcut güvenli PDKS ekranlarını açar.",
            Dock = DockStyle.Fill,
            ForeColor = PdksAppearance.Current.Muted,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 1);

        var cards = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 3,
            Padding = new Padding(0, 6, 0, 8)
        };
        cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        for (var i = 0; i < 3; i++) cards.RowStyles.Add(new RowStyle(SizeType.Percent, 33.333f));

        cards.Controls.Add(Card("1. PERSONEL",
            "Personel Veri Düzeltme\r\nAktif / Pasif Kontrol",
            "Personel kartındaki kart no, tarih, maaş, bölüm, görev, banka, telefon, grup, servis ve şirket gibi alanları kullanıcı dostu adlarla düzenler.",
            () => shell.OpenPersonelForResponsible()), 0, 0);

        cards.Controls.Add(Card("2. KART HAREKETLERİ",
            "Giriş / Çıkış Düzelt\r\nEksik Giriş / Çıkış Ekle\r\nToplu Kart İşlemi",
            "GIRCIK kayıtlarının günlük düzeltme ekranını açar. Toplu işlemlerde Önizleme → Uygula kuralı geçerlidir.",
            () => shell.OpenEntryExitForResponsible()), 1, 0);

        cards.Controls.Add(Card("3. E / HARİÇ TUTMA",
            "E İşareti Ver\r\nE İşaretini Kaldır\r\nToplu E İşlemi",
            "Giriş ve çıkış tarafındaki E işaretini kontrollü yönetmek için kart hareketi ekranını açar.",
            () => shell.OpenEntryExitForResponsible()), 0, 1);

        cards.Controls.Add(Card("4. DATA KONTROL",
            "Genel Kontrol\r\nEksik TNF • Fazla TNF • Saat Farkı\r\nİncelenecekler",
            "FDB/GDB ve TNF kaynaklarının kontrol merkezini açar. Belirsiz çoklu eşleşmeler otomatik değiştirilmez.",
            () => shell.OpenQuickDataForResponsible()), 1, 1);

        cards.Controls.Add(Card("5. TNF",
            "TNF Listele • TNF Sırala\r\nEksikleri Ekle • Fazlaları Temizle\r\nYedek / Geri Yükleme",
            "Canonical TNF kaynağını seçme ve yönetim merkezini açar. Riskli dosya değişikliklerinde önce yedek alınmalıdır.",
            () => shell.OpenQuickDataForResponsible()), 0, 2);

        cards.Controls.Add(Card("6. BORDRO / ÖDEME",
            "Bordro Veri Düzeltme\r\nÖdeme Düzeltme\r\nAvans Düzeltme",
            "UCRETLER / ODEME / AVANS verilerini mevcut bordro ve hızlı ödeme ekranları üzerinden kontrollü düzenler.",
            () => shell.OpenPayrollAdjustmentForResponsible()), 1, 2);

        root.Controls.Add(cards, 0, 2);

        var footer = new Panel { Dock = DockStyle.Fill, BackColor = PdksAppearance.Current.PrimarySoft, Padding = new Padding(14, 9, 14, 8) };
        footer.Controls.Add(new Label
        {
            Text = "Güvenlik: toplu ve riskli işlemlerde Önizleme → Uygula zorunludur. Çoklu / belirsiz TNF eşleşmeleri otomatik düzeltilmez. Manuel değişiklikler işlem geçmişine yazılır.",
            Dock = DockStyle.Fill,
            ForeColor = PdksAppearance.Current.Primary,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        });
        root.Controls.Add(footer, 0, 3);
        Controls.Add(root);
    }

    Control Card(string title, string body, string help, Action action)
    {
        var p=PdksAppearance.Current;
        var panel = PdksUiKit.Card(16);
        panel.Margin=new Padding(7);
        panel.Cursor=Cursors.Hand;
        var titleLabel = new Label
        {
            Text = title,
            Dock = DockStyle.Top,
            Height = 30,
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            ForeColor = p.Primary,
            Cursor = Cursors.Hand
        };
        var bodyLabel = new Label
        {
            Text = body,
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.2f),
            ForeColor = p.Text,
            TextAlign = ContentAlignment.MiddleLeft,
            Cursor = Cursors.Hand
        };
        var open = new Label
        {
            Text = "İlgili ekranı aç  ›",
            Dock = DockStyle.Bottom,
            Height = 24,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = p.Primary,
            TextAlign = ContentAlignment.MiddleRight,
            Cursor = Cursors.Hand
        };

        void Run()
        {
            Close();
            action();
        }
        panel.Click += (_, _) => Run();
        titleLabel.Click += (_, _) => Run();
        bodyLabel.Click += (_, _) => Run();
        open.Click += (_, _) => Run();
        tips.SetToolTip(panel, help);
        tips.SetToolTip(titleLabel, help);
        tips.SetToolTip(bodyLabel, help);
        tips.SetToolTip(open, help);

        panel.Controls.Add(bodyLabel);
        panel.Controls.Add(open);
        panel.Controls.Add(titleLabel);
        return panel;
    }
}
