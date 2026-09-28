namespace HKN.Personel.Native;

internal sealed class ResponsibleQuickOperationsForm : Form
{
    readonly MainShellForm owner;
    public ResponsibleQuickOperationsForm(MainShellForm owner)
    {
        this.owner = owner;
        Text = "Hızlı İşlemler • Firma Sorumlusu";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(980, 620);
        MinimumSize = new Size(860, 540);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246,249,253);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(22) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        root.Controls.Add(new Label { Text = "Firma Sorumlusu • Hızlı İşlemler", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 20f, FontStyle.Bold), ForeColor = Color.FromArgb(27,44,68), TextAlign = ContentAlignment.MiddleLeft }, 0, 0);

        var cards = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 2 };
        for (var i = 0; i < 3; i++) cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        cards.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); cards.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        cards.Controls.Add(Card("1. PERSONEL", "Personel Veri Düzeltme\nAktif / Pasif Kontrol", () => owner.OpenPersonelForResponsible()), 0, 0);
        cards.Controls.Add(Card("2. KART HAREKETLERİ", "Giriş / Çıkış Düzelt\nEksik Kayıt Ekle\nToplu Kart İşlemi", () => owner.OpenEntryExitForResponsible()), 1, 0);
        cards.Controls.Add(Card("3. E / HARİÇ TUTMA", "Giriş E / Çıkış E\nE İşaretini Kaldır\nToplu E İşlemi", () => owner.OpenEntryExitForResponsible()), 2, 0);
        cards.Controls.Add(Card("4. DATA KONTROL", "FDB / GDB ↔ TNF Kontrol\nEksik / Fazla / Saat Farkı\nİncelenecekler", () => owner.OpenQuickDataForResponsible()), 0, 1);
        cards.Controls.Add(Card("5. TNF YÖNETİMİ", "TNF Aç • Kontrol Et • Sırala\nYedekle • Kaydet", () => owner.OpenQuickDataForResponsible()), 1, 1);
        cards.Controls.Add(Card("6. BORDRO / ÖDEME", "Bordro Veri Düzeltme\nÖdeme / Avans Düzeltme", () => owner.OpenPayrollAdjustmentForResponsible()), 2, 1);
        root.Controls.Add(cards, 0, 1);
        root.Controls.Add(new Label { Text = "Toplu ve riskli işlemlerde Önizleme → Uygula zorunludur. Belirsiz/çoklu eşleşmeler otomatik değiştirilmez.", Dock = DockStyle.Fill, ForeColor = Color.FromArgb(78,92,112), TextAlign = ContentAlignment.MiddleLeft }, 0, 2);
        Controls.Add(root);
    }

    static Control Card(string title, string description, Action action)
    {
        var p = new Panel { Dock = DockStyle.Fill, Margin = new Padding(8), Padding = new Padding(16), BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle, Cursor = Cursors.Hand };
        var l1 = new Label { Text = title, Dock = DockStyle.Top, Height = 34, Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = Color.FromArgb(36,107,230), Cursor = Cursors.Hand };
        var l2 = new Label { Text = description, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 10f), ForeColor = Color.FromArgb(55,70,92), Cursor = Cursors.Hand };
        EventHandler h = (_,_) => action();
        p.Click += h; l1.Click += h; l2.Click += h;
        p.Controls.Add(l2); p.Controls.Add(l1); return p;
    }
}
