namespace HKN.Personel.Native;

public sealed class ResponsibleQuickOperationsForm : Form
{
    readonly MainShellForm shell;
    readonly ToolTip tips = new();

    public ResponsibleQuickOperationsForm(MainShellForm owner)
    {
        shell = owner;
        Text = "Hızlı İşlemler • Yetkili Kullanıcı";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(1120, 760);
        MinimumSize = new Size(980, 680);
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
            Text = "Muhasebe ve personel operasyonunda en sık kullanılan işlemler. Personel → kart/izin → puantaj → bordro/ödeme → rapor akışını tek noktadan yürütür.",
            Dock = DockStyle.Fill,
            ForeColor = PdksAppearance.Current.Muted,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 1);

        var cards = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(0, 6, 0, 8)
        };
        cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        for (var i = 0; i < 4; i++) cards.RowStyles.Add(new RowStyle(SizeType.Percent, 25));

        cards.Controls.Add(Card("1. PERSONEL",
            "Yeni Personel • Düzenle\r\nAktif / Pasif • Özlük",
            "Personel kartı, işe giriş/çıkış tarihi, maaş, bölüm, görev, banka, telefon, grup, servis ve şirket alanlarını yönetir.",
            () => shell.NavigateToCommand(PdksCommandId.Personnel)), 0, 0);

        cards.Controls.Add(Card("2. KART HAREKETLERİ",
            "Giriş / Çıkış Düzelt\r\nEksik Kaydı Tamamla • E İşareti",
            "GIRCIK kayıtlarını günlük olarak kontrol eder; eksik ve hatalı kart hareketlerini doğrulanmış şekilde düzeltir.",
            () => shell.NavigateToCommand(PdksCommandId.EntryExit)), 1, 0);

        cards.Controls.Add(Card("3. İZİN / MAZERET",
            "İzin Gir • İzin Düzelt\r\nÜcretli / Ücretsiz • Saatlik",
            "İzin kayıtlarını kişi ve tarih bazında yönetir; puantaja girecek mazeret ve süreyi doğrular.",
            () => shell.NavigateToCommand(PdksCommandId.Leave)), 0, 1);

        cards.Controls.Add(Card("4. İSTİSNA / PUANTAJ",
            "Eksik • Geç • Erken • Devamsız\r\nMesai • İzin Uyuşmazlığı",
            "Önce sorunlu personel-gün kayıtlarını tek listede gösterir; buradan düzeltme veya puantaj ekranına geçilir.",
            () => shell.NavigateToCommand(PdksCommandId.AttendanceExceptions)), 1, 1);

        cards.Controls.Add(Card("5. AVANS / KAZANÇ / KESİNTİ",
            "Avans Gir • Ek Kazanç\r\nKesinti ve Açıklama Kontrolü",
            "Muhasebenin dönem içinde girdiği avans, ek kazanç ve kesinti kayıtlarını personel bazında yönetir.",
            () => shell.NavigateToCommand(PdksCommandId.EarningsDeductions)), 0, 2);

        cards.Controls.Add(Card("6. BORDRO / ÖDEME",
            "Bordro Düzelt • Resmî Net\r\nBanka Ödemesi • Kalan",
            "UCRETLER ve ODEME verilerini aylık bordro düzeltme ve hızlı ödeme ekranından kontrollü yönetir.",
            () => shell.NavigateToCommand(PdksCommandId.PayrollAdjustment)), 1, 2);

        cards.Controls.Add(Card("7. RAPOR / ÇIKTI",
            "Puantaj • Bordro • Ödeme\r\nPDF / Excel • Kontrol Listeleri",
            "Muhasebe ve personel raporlarını tek merkezden görüntüler, filtreler ve çıktı alır.",
            () => shell.NavigateToCommand(PdksCommandId.Reports)), 0, 3);

        cards.Controls.Add(Card("8. VERİ / TERMİNAL",
            "Terminal • TNF • Veri Kontrol\r\nYedek / Entegrasyon",
            "Kart cihazı ve TNF/FDB veri kaynaklarını kontrol eder. Riskli veri işlemlerinde yedek kuralı geçerlidir.",
            () => shell.OpenQuickDataForResponsible()), 1, 3);

        root.Controls.Add(cards, 0, 2);

        var footer = new Panel { Dock = DockStyle.Fill, BackColor = PdksAppearance.Current.PrimarySoft, Padding = new Padding(14, 9, 14, 8) };
        footer.Controls.Add(new Label
        {
            Text = "Önerilen sıra: Personel → Kart / İzin → Puantaj → Avans / Kesinti → Bordro / Ödeme → Rapor. Toplu ve riskli veri işlemlerinde önce yedek alınır.",
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
