namespace HKN.Personel.Native;

public sealed class TerminalCenterForm : Form
{
    readonly Form? transferDialog;
    readonly Form settingsDialog;
    readonly Label sdkStatus = new() { AutoSize = true, Padding = new Padding(8), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };

    public TerminalCenterForm(Form? transferDialog, Form settingsDialog)
    {
        this.transferDialog = transferDialog;
        this.settingsDialog = settingsDialog;
        Text = "Terminal & Cihaz Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(980, 620);
        MinimumSize = new Size(820, 520);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += (_, _) => RefreshSdkStatus();
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(16) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));

        var head = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(16) };
        head.Controls.Add(new Label { Text = "TERMINAL & CİHAZ MERKEZİ", AutoSize = true, Font = new Font("Segoe UI", 16f, FontStyle.Bold), Location = new Point(16, 10) });
        sdkStatus.Location = new Point(12, 46);
        head.Controls.Add(sdkStatus);
        root.Controls.Add(head, 0, 0);

        var cards = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(8, 24, 8, 8), WrapContents = true };
        cards.Controls.Add(Card("Terminal Veri Aktarımı", "Cihazdan kayıt oku, TNF/FDB işleme akışını çalıştır.", OpenTransfer));
        cards.Controls.Add(Card("Cihaz Ayarları", "IP, port, cihaz profili ve eski SDK ayarları.", OpenSettings));
        cards.Controls.Add(Card("SDK Kontrolü", "FP_CLOCK.ocx ve FM_RecordRead uyumluluğunu doğrula.", ShowSdkDiagnostics));
        root.Controls.Add(cards, 0, 1);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8, 12, 8, 0) };
        var close = new Button { Text = "Kapat", Width = 110, Height = 36 };
        close.Click += (_, _) => Close();
        bottom.Controls.Add(close);
        root.Controls.Add(bottom, 0, 2);
        Controls.Add(root);
    }

    Control Card(string title, string text, Action action)
    {
        var panel = new Panel { Width = 280, Height = 150, BackColor = Color.White, Margin = new Padding(10), Padding = new Padding(14) };
        var t = new Label { Text = title, AutoSize = true, Font = new Font("Segoe UI", 11f, FontStyle.Bold), Location = new Point(14, 14) };
        var d = new Label { Text = text, AutoSize = false, Width = 245, Height = 52, Location = new Point(14, 45) };
        var b = new Button { Text = "Aç", Width = 90, Height = 32, Location = new Point(14, 106) };
        b.Click += (_, _) => action();
        panel.Controls.AddRange([t, d, b]);
        return panel;
    }

    void RefreshSdkStatus()
    {
        var result = TerminalSdkDiagnostics.Check();
        sdkStatus.Text = result.Ok ? "SDK: Hazır" : "SDK: Kontrol gerekli — " + result.Message;
        sdkStatus.ForeColor = result.Ok ? Color.DarkGreen : Color.DarkOrange;
    }

    void ShowSdkDiagnostics()
    {
        var result = TerminalSdkDiagnostics.Check();
        var detail = result.Message + (string.IsNullOrWhiteSpace(result.OcxPath) ? string.Empty : "\n\nDosya: " + result.OcxPath);
        MessageBox.Show(detail, "Terminal SDK Kontrolü", MessageBoxButtons.OK, result.Ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        RefreshSdkStatus();
    }

    void OpenTransfer()
    {
        if (!TerminalSdkGuard.EnsureCompatible(this)) return;
        if (transferDialog is null)
        {
            MessageBox.Show("Terminal aktarım ekranı oluşturulamadı.", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        transferDialog.ShowDialog(this);
    }

    void OpenSettings()
    {
        settingsDialog.ShowDialog(this);
        RefreshSdkStatus();
    }
}
