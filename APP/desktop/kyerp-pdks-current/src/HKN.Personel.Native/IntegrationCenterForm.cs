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
        BackColor = PdksAppearance.Current.Canvas;
        Build();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(20), BackColor=p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        root.Controls.Add(new Label
        {
            Text = "ENTEGRASYON MERKEZİ\r\nHedef 5.0.29, fiziksel terminal ve KY PDKS veri kaynakları tek noktadan yönetilir.",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = p.Text
        }, 0, 0);

        var cards = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(6), WrapContents = true, BackColor=p.Canvas };
        cards.Controls.Add(Card("Fiziksel Terminal", "192.168.1.224:5005 • durum, saat ve güvenli veri alımı", "Terminal Merkezini Aç", shell.OpenTerminalForIntegration));
        cards.Controls.Add(Card("FDB / TNF", "Canonical veritabanı ve TNF veri kaynaklarını görüntüle ve doğrula.", "Veri Kaynaklarını Aç", shell.OpenQuickDataForResponsible));

        var hedef = Card("Hedef PDKS 5.0.29", @"Kaynak: C:\Hedef500\Data\DATABASE.GDB. Canlı dosya doğrudan değiştirilmez; güncelleme yedek + doğrulama ile hazırlanır.",
            "Hedef'ten Veri Al", async () => await shell.RefreshFromHedefForIntegrationAsync());
        hedef.Enabled = user.IsSuperAdmin;
        cards.Controls.Add(hedef);

        cards.Controls.Add(Card("KY ERP / Gelecek API", "Mobil, QR, NFC veya ikinci terminal ileride aynı kayıt-kaynağı sözleşmesiyle bağlanabilir. Şu an üretim kaynağı fiziksel terminaldir.",
            "Bilgi", () => MessageBox.Show("Bu entegrasyon noktası geleceğe açık tutuldu. Aktif olmayan provider sahte şekilde bağlı gösterilmez.", Text)));
        root.Controls.Add(cards, 0, 1);

        var close = PdksUiKit.Button("Kapat",110,PdksActionRole.Quiet,Close);
        var footer = PdksUiKit.ActionBar(true,p.Canvas);
        footer.Controls.Add(close);
        root.Controls.Add(footer, 0, 2);
        Controls.Add(root);
    }

    static Control Card(string title, string description, string buttonText, Action action)
        => Card(title, description, buttonText, () => { action(); return Task.CompletedTask; });

    static Control Card(string title, string description, string buttonText, Func<Task> action)
    {
        var p=PdksAppearance.Current;
        var panel = PdksUiKit.Card(14);
        panel.Dock=DockStyle.None;panel.Size=new Size(405,185);panel.MinimumSize=new Size(405,185);panel.MaximumSize=new Size(405,185);panel.Margin=new Padding(8);
        var head = new Label { Text = title, Dock = DockStyle.Top, Height = 32, Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = p.Text };
        var body = new Label { Text = description, Dock = DockStyle.Fill, Font = new Font("Segoe UI", 9f), ForeColor = p.Muted };
        var button = PdksUiKit.Button(buttonText,150,PdksActionRole.Primary);
        button.Dock=DockStyle.Bottom;
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
