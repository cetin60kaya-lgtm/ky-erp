namespace HKN.Personel.Native;

internal sealed class IntegrationCenterForm : Form
{
    readonly MainShellForm shell;
    readonly LocalUser user;

    public IntegrationCenterForm(MainShellForm shell, LocalUser user)
    {
        this.shell = shell;
        this.user = user;
        Text = "Entegrasyonlar";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(920, 600);
        MinimumSize = new Size(760, 520);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        Build();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(20) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        root.Controls.Add(new Label
        {
            Text = "ENTEGRASYON MERKEZİ\r\nHedef 5.0.29, fiziksel terminal ve KY PDKS veri kaynakları tek noktadan yönetilir.",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = Color.FromArgb(28, 55, 90)
        }, 0, 0);

        var cards = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(6), WrapContents = true };
        cards.Controls.Add(Card("Fiziksel Terminal", "192.168.1.224:5005 • durum, saat ve güvenli veri alımı", "Terminal Merkezini Aç", shell.OpenTerminalForIntegration));
        cards.Controls.Add(Card("FDB / TNF", "Canonical veritabanı ve TNF veri kaynaklarını görüntüle ve doğrula.", "Veri Kaynaklarını Aç", shell.OpenQuickDataForResponsible));

        var hedef = Card("Hedef PDKS 5.0.29", @"Kaynak: C:\Hedef500\Data\DATABASE.GDB. Canlı dosya doğrudan değiştirilmez; güncelleme yedek + doğrulama ile hazırlanır.",
            "Hedef'ten Veri Al", async () => await shell.RefreshFromHedefForIntegrationAsync());
        hedef.Enabled = user.IsSuperAdmin;
        cards.Controls.Add(hedef);

        cards.Controls.Add(Card("KY ERP / Gelecek API", "Mobil, QR, NFC veya ikinci terminal ileride aynı kayıt-kaynağı sözleşmesiyle bağlanabilir. Şu an üretim kaynağı fiziksel terminaldir.",
            "Bilgi", () => MessageBox.Show("Bu entegrasyon noktası geleceğe açık tutuldu. Aktif olmayan provider sahte şekilde bağlı gösterilmez.", Text)));
        root.Controls.Add(cards, 0, 1);

        var close = new Button { Text = "Kapat", Width = 110, Height = 34, Anchor = AnchorStyles.Right };
        close.Click += (_, _) => Close();
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0) };
        footer.Controls.Add(close);
        root.Controls.Add(footer, 0, 2);
        Controls.Add(root);
    }

    static Control Card(string title, string description, string buttonText, Action action)
        => Card(title, description, buttonText, () => { action(); return Task.CompletedTask; });

    static Control Card(string title, string description, string buttonText, Func<Task> action)
    {
        var panel = new Panel { Width = 405, Height = 185, Margin = new Padding(8), Padding = new Padding(14), BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
        var head = new Label { Text = title, Dock = DockStyle.Top, Height = 32, Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = Color.FromArgb(30, 79, 145) };
        var body = new Label { Text = description, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 9f), ForeColor = Color.FromArgb(65, 78, 96) };
        var button = new Button { Text = buttonText, Dock = DockStyle.Bottom, Height = 34, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        button.Click += async (_, _) =>
        {
            button.Enabled = false;
            try { await action(); }
            finally { if (!button.IsDisposed) button.Enabled = true; }
        };
        panel.Controls.Add(body);
        panel.Controls.Add(button);
        panel.Controls.Add(head);
        return panel;
    }
}
