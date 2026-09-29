namespace HKN.Personel.Native;

public sealed class TerminalCenterForm : Form
{
    readonly Form settingsDialog;
    readonly Label sdkStatus = new()
    {
        AutoSize = false,
        Height = 44,
        Dock = DockStyle.Bottom,
        Padding = new Padding(8, 4, 8, 4),
        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
    };
    bool busy;

    public TerminalCenterForm(Form? transferDialog, Form settingsDialog)
    {
        this.settingsDialog = settingsDialog;
        Text = "Terminal & Cihaz Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1040, 680);
        MinimumSize = new Size(900, 560);
        Font = new Font("Segoe UI", 9f);
        Build();
        Shown += async (_, _) => await CheckDeviceAsync(false);
    }

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(16) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 104));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));

        var head = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(16) };
        head.Controls.Add(new Label
        {
            Text = "TERMINAL & CİHAZ MERKEZİ",
            AutoSize = true,
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            Location = new Point(16, 10)
        });
        head.Controls.Add(sdkStatus);
        root.Controls.Add(head, 0, 0);

        var cards = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(8, 20, 8, 8),
            WrapContents = true,
            AutoScroll = true
        };
        cards.Controls.Add(Card("Cihaz Bağlantısı", "Gerçek kart cihazını doğrudan kontrol eder. Kayıt silmez veya değiştirmez.", () => CheckDeviceAsync(true), "Kontrol Et"));
        cards.Controls.Add(Card("Kart Kayıtlarını Şimdi Al", "Cihazdaki yeni basımları okur. Veri yoksa bilgi verir; TNF + FDB doğrulanmadan cihazdan hiçbir kayıt silinmez.", SyncNowAsync, "Şimdi Al"));
        cards.Controls.Add(Card("Cihaz Ayarları", "Hedef PDKS ile aynı cihaz/makine, Ethernet, COM, baudrate, IP, port, giriş/çıkış ve aktarım ayarlarını düzenler.", () => RunSync(OpenSettings), "Ayarlar"));
        cards.Controls.Add(Card("Sürücüyü Onar", "Paket içindeki eşleşen 32-bit OCX/DLL setini Windows'a kaydeder. Yalnız sürücü nedeniyle bağlantı açılamıyorsa kullanılır.", RepairDriverAsync, "Onar"));
        cards.Controls.Add(Card("SDK / Sürücü Kontrolü", "FP_CLOCK.ocx, destek DLL'leri ve x86 TerminalBridge uyumluluğunu kontrol eder.", () => RunSync(ShowSdkDiagnostics), "Kontrol Et"));
        root.Controls.Add(cards, 0, 1);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8, 10, 8, 0) };
        var close = new Button { Text = "Kapat", Width = 110, Height = 36 };
        close.Click += (_, _) => Close();
        bottom.Controls.Add(close);
        root.Controls.Add(bottom, 0, 2);
        Controls.Add(root);
    }

    static Task RunSync(Action action)
    {
        action();
        return Task.CompletedTask;
    }

    Control Card(string title, string text, Func<Task> action, string buttonText)
    {
        var panel = new Panel { Width = 300, Height = 162, BackColor = Color.White, Margin = new Padding(10), Padding = new Padding(14) };
        var t = new Label { Text = title, AutoSize = false, Width = 266, Height = 28, Font = new Font("Segoe UI", 11f, FontStyle.Bold), Location = new Point(14, 14) };
        var d = new Label { Text = text, AutoSize = false, Width = 266, Height = 60, Location = new Point(14, 45) };
        var b = new Button { Text = buttonText, Width = 112, Height = 34, Location = new Point(14, 112), Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        b.Click += async (_, _) =>
        {
            if (busy) return;
            b.Enabled = false;
            try { await action(); }
            finally { if (!IsDisposed) b.Enabled = true; }
        };
        panel.Controls.AddRange([t, d, b]);
        return panel;
    }

    async Task CheckDeviceAsync(bool showDialog)
    {
        if (busy) return;
        busy = true;
        try
        {
            var snapshot = await ProbeDeviceAsync();
            if (snapshot.Connected)
            {
                ShowConnected(snapshot, showDialog);
                return;
            }

            SetStatus("Cihaz bağlantısı yok — " + snapshot.Message, false);
            if (showDialog && TerminalSdkRepair.LooksLikeRegistrationProblem(snapshot.Message))
            {
                if (TerminalSdkRepair.TryRepair(this))
                {
                    SetStatus("Sürücü onarıldı • cihaz yeniden kontrol ediliyor…", null);
                    snapshot = await ProbeDeviceAsync();
                    if (snapshot.Connected)
                    {
                        ShowConnected(snapshot, true);
                        return;
                    }
                    SetStatus("Sürücü onarıldı ancak cihaz bağlantısı açılamadı — " + snapshot.Message, false);
                }
            }

            if (showDialog)
                MessageBox.Show(snapshot.Message, "Kart Cihazı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            SetStatus("Cihaz kontrol hatası — " + ex.GetBaseException().Message, false);
            if (showDialog) MessageBox.Show(ex.GetBaseException().Message, "Kart Cihazı", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { busy = false; }
    }

    async Task<TerminalDeviceSnapshot> ProbeDeviceAsync()
    {
        var files = TerminalSdkDiagnostics.Check();
        if (!files.Ok) return TerminalDeviceSnapshot.Offline(files.Message);
        SetStatus("Cihaz kontrol ediliyor…", null);
        return await TerminalDeviceClient.ReadAsync(false);
    }

    void ShowConnected(TerminalDeviceSnapshot snapshot, bool showDialog)
    {
        var newText = snapshot.NewLogCount >= 0 ? snapshot.NewLogCount.ToString() : "?";
        var userText = snapshot.UserCount >= 0 ? snapshot.UserCount.ToString() : "?";
        var cardText = snapshot.CardCount >= 0 ? snapshot.CardCount.ToString() : "?";
        var message = $"CİHAZ BAĞLI • Saat {snapshot.DeviceTime:HH:mm:ss} • Yeni kayıt {newText} • Kullanıcı {userText} • Kart {cardText}";
        SetStatus(message, true);
        if (showDialog) MessageBox.Show(message, "Kart Cihazı", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    async Task RepairDriverAsync()
    {
        if (busy) return;
        busy = true;
        try
        {
            if (!TerminalSdkRepair.TryRepair(this)) return;
            SetStatus("Sürücü onarıldı • cihaz kontrol ediliyor…", null);
            var snapshot = await ProbeDeviceAsync();
            if (snapshot.Connected) ShowConnected(snapshot, true);
            else
            {
                SetStatus("Sürücü hazır; cihaz bağlantısı yok — " + snapshot.Message, false);
                MessageBox.Show(snapshot.Message, "Kart Cihazı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        finally { busy = false; }
    }

    async Task SyncNowAsync()
    {
        if (busy) return;
        busy = true;
        try
        {
            SetStatus("Kart kayıtları cihazdan okunuyor…", null);
            var result = await TerminalSyncService.SyncAsync("Manuel terminal aktarımı");
            if (result.ReadCount == 0 && result.Inserted == 0 && result.Updated == 0 && result.Duplicates == 0 && result.Skipped == 0)
            {
                SetStatus("CİHAZ BAĞLI • Aktarılacak veri yok.", true);
                MessageBox.Show("Aktarılacak veri yok.", "Terminal Aktarımı", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var ok = !result.Message.Contains("hata", StringComparison.OrdinalIgnoreCase) &&
                     !result.Message.Contains("başarısız", StringComparison.OrdinalIgnoreCase);
            SetStatus(result.Message, ok);
            var detail = result.Message +
                         $"\n\nOkunan: {result.ReadCount}" +
                         $"\nYeni: {result.Inserted}" +
                         $"\nGüncellenen: {result.Updated}" +
                         $"\nMükerrer: {result.Duplicates}" +
                         $"\nAtlanan: {result.Skipped}" +
                         $"\nCihaz kayıtları temizlendi: {(result.DeviceCleared ? "Evet" : "Hayır")}";
            MessageBox.Show(detail, "Terminal Aktarımı", MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            SetStatus("Aktarım hatası — " + ex.GetBaseException().Message, false);
            MessageBox.Show(ex.GetBaseException().Message, "Terminal Aktarımı", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { busy = false; }
    }

    void SetStatus(string text, bool? ok)
    {
        if (IsDisposed) return;
        sdkStatus.Text = text;
        sdkStatus.ForeColor = ok switch
        {
            true => Color.DarkGreen,
            false => Color.Firebrick,
            _ => Color.FromArgb(31, 92, 180)
        };
    }

    void RefreshSdkStatus()
    {
        var result = TerminalSdkDiagnostics.Check();
        SetStatus(result.Ok ? "SDK hazır • fiziksel cihaz kontrolü bekleniyor" : "SDK: " + result.Message, result.Ok ? null : false);
    }

    void ShowSdkDiagnostics()
    {
        var result = TerminalSdkDiagnostics.Check();
        var detail = result.Message + (string.IsNullOrWhiteSpace(result.OcxPath) ? string.Empty : "\n\nDosya: " + result.OcxPath);
        MessageBox.Show(detail, "Terminal SDK Kontrolü", MessageBoxButtons.OK, result.Ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        RefreshSdkStatus();
    }

    void OpenSettings()
    {
        if (settingsDialog.IsDisposed)
        {
            MessageBox.Show("Ayar penceresi kapatılmış. Terminal merkezini yeniden açın.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        settingsDialog.ShowDialog(this);
        RefreshSdkStatus();
    }
}
