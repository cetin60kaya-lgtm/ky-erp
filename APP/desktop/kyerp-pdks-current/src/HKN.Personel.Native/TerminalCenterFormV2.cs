using System.Globalization;

namespace HKN.Personel.Native;

public sealed class TerminalCenterForm : Form
{
    readonly Form settingsDialog;
    readonly Label status = new()
    {
        AutoSize = false,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleRight,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold)
    };

    readonly Label connectionValue = SummaryValue("Kontrol ediliyor");
    readonly Label clockValue = SummaryValue("—");
    readonly Label usersValue = SummaryValue("—");
    readonly Label cardsValue = SummaryValue("—");
    readonly Label logsValue = SummaryValue("—");
    readonly Label syncValue = SummaryValue("—");

    readonly DataGridView usersGrid = Grid();
    readonly DataGridView logsGrid = Grid();
    readonly DataGridView integrationsGrid = Grid();
    readonly TabControl tabs = new() { Dock = DockStyle.Fill };
    bool busy;

    public TerminalCenterForm(Form? transferDialog, Form settingsDialog)
    {
        this.settingsDialog = settingsDialog;
        Text = "Terminal & Kimlik Merkezi";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1220, 760);
        MinimumSize = new Size(980, 640);
        Font = new Font("Segoe UI", 9f);
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        Build();
        Shown += async (_, _) =>
        {
            RefreshSdkStatus();
            await Task.Yield();
            await RefreshDeviceStatusAsync();
        };
    }

    static Label SummaryValue(string text) => new()
    {
        Text = text,
        AutoSize = false,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 11.2f, FontStyle.Bold),
        ForeColor = PdksAppearance.Current.Text
    };

    static DataGridView Grid()
    {
        var p = PdksAppearance.Current;
        return new DataGridView
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            MultiSelect = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            BackgroundColor = p.Surface,
            BorderStyle = BorderStyle.None,
            RowHeadersVisible = false,
            ColumnHeadersHeight = 34,
            RowTemplate = { Height = 30 }
        };
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        BackColor = p.Canvas;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 4,
            Padding = new Padding(16),
            BackColor = p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildSummary(), 0, 1);
        BuildTabs();
        root.Controls.Add(tabs, 0, 2);

        var bottom = PdksUiKit.ActionBar(true, p.Canvas);
        var close = PdksUiKit.Button("Kapat", 110, PdksActionRole.Quiet, Close);
        bottom.Controls.Add(close);
        bottom.Controls.Add(new Label
        {
            Text = "Silme / sıfırlama işlemleri yalnız açık onayla çalışır. Cihaz logları silinmeden önce doğrulama veya ham arşiv yapılır.",
            AutoSize = true,
            Padding = new Padding(8, 9, 12, 0),
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 8.6f)
        });
        root.Controls.Add(bottom, 0, 3);

        Controls.Add(root);
    }

    Control BuildHeader()
    {
        var p = PdksAppearance.Current;
        var card = PdksUiKit.Card(14);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, BackColor = p.Surface };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 64));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 36));

        var left = new Panel { Dock = DockStyle.Fill, BackColor = p.Surface };
        left.Controls.Add(new Label
        {
            Text = "TERMİNAL & KİMLİK MERKEZİ",
            AutoSize = true,
            Location = new Point(4, 4),
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            ForeColor = p.Text
        });
        left.Controls.Add(new Label
        {
            Text = "Kart, PIN, QR, mobil, parmak izi, yüz, avuç ve gelecekteki cihaz adaptörleri için tek merkez",
            AutoSize = true,
            Location = new Point(5, 38),
            Font = new Font("Segoe UI", 8.8f),
            ForeColor = p.Muted
        });
        layout.Controls.Add(left, 0, 0);
        layout.Controls.Add(status, 1, 0);
        card.Controls.Add(layout);
        return card;
    }

    Control BuildSummary()
    {
        var p = PdksAppearance.Current;
        var host = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            WrapContents = false,
            AutoScroll = true,
            Padding = new Padding(0, 10, 0, 8),
            BackColor = p.Canvas
        };
        host.Controls.Add(SummaryCard("Bağlantı", connectionValue));
        host.Controls.Add(SummaryCard("Cihaz Saati", clockValue));
        host.Controls.Add(SummaryCard("Kullanıcı", usersValue));
        host.Controls.Add(SummaryCard("Kart / Kimlik", cardsValue));
        host.Controls.Add(SummaryCard("Yeni Log", logsValue));
        host.Controls.Add(SummaryCard("Son Aktarım", syncValue));
        return host;
    }

    Control SummaryCard(string title, Label value)
    {
        var p = PdksAppearance.Current;
        var card = PdksUiKit.Card(10);
        card.Dock = DockStyle.None;
        card.Size = new Size(180, 68);
        card.Margin = new Padding(0, 0, 10, 0);
        var table = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = p.Surface };
        table.RowStyles.Add(new RowStyle(SizeType.Absolute, 23));
        table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        table.Controls.Add(new Label
        {
            Text = title,
            Dock = DockStyle.Fill,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold)
        }, 0, 0);
        table.Controls.Add(value, 0, 1);
        card.Controls.Add(table);
        return card;
    }

    void BuildTabs()
    {
        tabs.TabPages.Add(BuildDeviceTab());
        tabs.TabPages.Add(BuildUsersTab());
        tabs.TabPages.Add(BuildLogsTab());
        tabs.TabPages.Add(BuildIntegrationsTab());
        tabs.TabPages.Add(BuildServiceTab());
    }

    TabPage BuildDeviceTab()
    {
        var p = PdksAppearance.Current;
        var page = Page("Cihaz");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(12), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var settings = TerminalDeviceSettingsStore.Load();
        var info = PdksUiKit.Card(16);
        var infoTable = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 3, BackColor = p.Surface };
        for (var i = 0; i < 4; i++) infoTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        AddInfo(infoTable, 0, 0, "Cihaz", settings.DeviceName);
        AddInfo(infoTable, 1, 0, "Sağlayıcı", "Hedef / FP_CLOCK");
        AddInfo(infoTable, 2, 0, "Bağlantı", settings.ConnectionType);
        AddInfo(infoTable, 3, 0, "Yön", settings.Direction);
        AddInfo(infoTable, 0, 1, "IP", settings.IpAddress);
        AddInfo(infoTable, 1, 1, "Port", settings.IpPort.ToString(CultureInfo.InvariantCulture));
        AddInfo(infoTable, 2, 1, "Makine No", settings.MachineNo.ToString(CultureInfo.InvariantCulture));
        AddInfo(infoTable, 3, 1, "Seri", $"{settings.ComPort} / {settings.BaudRate}");
        infoTable.Controls.Add(new Label
        {
            Text = "Mevcut cihaz gerçek Hedef/FP_CLOCK adaptörüyle çalışır. Yeni marka geldiğinde aynı merkeze yeni sürücü/adaptör eklenir.",
            Dock = DockStyle.Fill,
            ForeColor = p.Muted,
            Padding = new Padding(0, 7, 0, 0)
        }, 0, 2);
        infoTable.SetColumnSpan(infoTable.GetControlFromPosition(0, 2)!, 4);
        info.Controls.Add(infoTable);
        root.Controls.Add(info, 0, 0);

        var actions = PdksUiKit.Card(14);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, BackColor = p.Surface, Padding = new Padding(0, 6, 0, 0) };
        flow.Controls.Add(ActionButton("Bağlantıyı Kontrol Et", 180, async () => await RefreshDeviceStatusAsync(true), true));
        flow.Controls.Add(ActionButton("Cihazdan Kayıt Oku", 170, async () => await LoadLogsAsync(), false));
        flow.Controls.Add(ActionButton("Kayıtları Aktar", 150, async () => await SyncNowAsync(), true));
        flow.Controls.Add(ActionButton("PC Saatiyle Eşitle", 170, async () => await SetDeviceTimeAsync(), false));
        flow.Controls.Add(ActionButton("Cihaz Ayarları", 145, OpenSettingsAsync, false));
        actions.Controls.Add(flow);
        root.Controls.Add(actions, 0, 1);

        var note = PdksUiKit.Card(16);
        note.Controls.Add(new Label
        {
            Text = "Kimlik yöntemleri cihaz yeteneğine göre açılır: RFID/NFC kart, PIN, QR, mobil kimlik, parmak izi, yüz, avuç/el ve iris. " +
                   "Biyometrik yöntemler teknik olarak bağlanabilir; çalışan mesai takibinde kullanımının hukuki uygunluğu ayrıca değerlendirilmelidir.",
            Dock = DockStyle.Fill,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 9f),
            Padding = new Padding(4)
        });
        root.Controls.Add(note, 0, 2);
        page.Controls.Add(root);
        return page;
    }

    TabPage BuildUsersTab()
    {
        var p = PdksAppearance.Current;
        var page = Page("Kullanıcı / Kart");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Padding = new Padding(12), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 66));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var bar = PdksUiKit.Card(10);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, BackColor = p.Surface, Padding = new Padding(0, 5, 0, 0) };
        flow.Controls.Add(ActionButton("Kullanıcıları Oku", 150, LoadUsersAsync, true));
        flow.Controls.Add(ActionButton("Sistemle Eşleştir", 150, LoadUsersAsync, false));
        flow.Controls.Add(ActionButton("Kartı Başka Sicile Taşı", 190, MoveCardDialogAsync, false));
        flow.Controls.Add(ActionButton("Eşleşmeyenleri Sil", 170, DeleteUnmatchedAsync, false, PdksActionRole.Danger));
        bar.Controls.Add(flow);
        root.Controls.Add(bar, 0, 0);

        usersGrid.Columns.Add("UserId", "Cihaz No");
        usersGrid.Columns.Add("DeviceName", "Cihaz Adı");
        usersGrid.Columns.Add("Credentials", "Kimlik Türleri");
        usersGrid.Columns.Add("SystemCard", "Sistem Kart No");
        usersGrid.Columns.Add("SystemName", "Personel");
        usersGrid.Columns.Add("Status", "Durum");
        var gridCard = PdksUiKit.Card(8);
        gridCard.Controls.Add(usersGrid);
        root.Controls.Add(gridCard, 0, 1);
        page.Controls.Add(root);
        return page;
    }

    TabPage BuildLogsTab()
    {
        var p = PdksAppearance.Current;
        var page = Page("Kayıt / Senkron");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Padding = new Padding(12), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 118));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var bar = PdksUiKit.Card(10);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, BackColor = p.Surface, Padding = new Padding(0, 5, 0, 0) };
        flow.Controls.Add(ActionButton("Logları Oku", 130, LoadLogsAsync, true));
        flow.Controls.Add(ActionButton("TNF + FDB'ye Aktar", 170, SyncNowAsync, true));
        flow.Controls.Add(ActionButton("Aktarıp Logları Temizle", 195, SyncAndClearLogsAsync, false, PdksActionRole.Danger));
        flow.Controls.Add(ActionButton("Arşivle ve Logları Sıfırla", 205, ArchiveAndClearLogsAsync, false, PdksActionRole.Danger));
        flow.Controls.Add(ActionButton("CANLI • Son 7 Günü Koru", 195, ClearLiveExceptWeekAsync, false));
        flow.Controls.Add(ActionButton("CANLI • Tam Sıfırla", 165, ClearAllLiveAsync, false, PdksActionRole.Danger));
        bar.Controls.Add(flow);
        root.Controls.Add(bar, 0, 0);

        logsGrid.Columns.Add("Card", "Kart / Sicil");
        logsGrid.Columns.Add("Date", "Tarih");
        logsGrid.Columns.Add("Time", "Saat");
        logsGrid.Columns.Add("Direction", "Giriş/Çıkış");
        logsGrid.Columns.Add("Verify", "Doğrulama");
        logsGrid.Columns.Add("Terminal", "Terminal");
        var gridCard = PdksUiKit.Card(8);
        gridCard.Controls.Add(logsGrid);
        root.Controls.Add(gridCard, 0, 1);
        page.Controls.Add(root);
        return page;
    }

    TabPage BuildIntegrationsTab()
    {
        var p = PdksAppearance.Current;
        var page = Page("Entegrasyonlar");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Padding = new Padding(12), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));

        integrationsGrid.Columns.Add("Brand", "Marka / Standart");
        integrationsGrid.Columns.Add("Family", "Aile");
        integrationsGrid.Columns.Add("Integration", "Entegrasyon");
        integrationsGrid.Columns.Add("Transport", "Bağlantı");
        integrationsGrid.Columns.Add("Credentials", "Kimlikler");
        integrationsGrid.Columns.Add("Availability", "Durum");
        foreach (var item in TerminalPlatformCatalog.All)
            integrationsGrid.Rows.Add(item.Brand, item.Family, item.Integration, item.Transport, item.CredentialSummary, item.Availability);

        var gridCard = PdksUiKit.Card(8);
        gridCard.Controls.Add(integrationsGrid);
        root.Controls.Add(gridCard, 0, 0);

        var note = PdksUiKit.Card(12);
        note.Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Text = "Mimari markadan bağımsızdır: aktif cihaz Hedef/FP_CLOCK; ZKTeco, Suprema, Hikvision, Anviz, Dahua, HID, REST/Webhook, OSDP ve Wiegand " +
                   "aynı kullanıcı/log modeline adaptör olarak bağlanacak şekilde tanımlandı. Bir üreticiyi 'destekli' saymak için ilgili resmi SDK/API sürücüsünün kurulmuş ve test edilmiş olması gerekir.",
            ForeColor = p.Muted,
            Padding = new Padding(4)
        });
        root.Controls.Add(note, 0, 1);
        page.Controls.Add(root);
        return page;
    }

    TabPage BuildServiceTab()
    {
        var p = PdksAppearance.Current;
        var page = Page("Ayarlar / Servis");
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(12), BackColor = p.Canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 116));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 116));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        root.Controls.Add(ServiceSection("Bağlantı ve sürücü",
            ("Gelişmiş Cihaz Ayarları", OpenSettingsAsync, PdksActionRole.Secondary),
            ("SDK / Sürücü Kontrolü", ShowSdkDiagnosticsAsync, PdksActionRole.Secondary),
            ("Sürücüyü Onar", RepairDriverAsync, PdksActionRole.Secondary)), 0, 0);

        root.Controls.Add(ServiceSection("Temizlik ve sıfırlama",
            ("Eşleşmeyen Kullanıcıları Sil", DeleteUnmatchedAsync, PdksActionRole.Danger),
            ("Kullanıcı / Kartları Sıfırla", ClearUsersAsync, PdksActionRole.Danger),
            ("Cihaz Loglarını Sıfırla", ArchiveAndClearLogsAsync, PdksActionRole.Danger)), 0, 1);

        var legal = PdksUiKit.Card(16);
        legal.Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Text = "Güvenlik: kullanıcı sıfırlama geçmiş geçiş loglarını değiştirmez. Log sıfırlama öncesi ham kayıt arşivlenir. " +
                   "OSDP yeni kurulumlarda güvenli çift yönlü okuyucu-kontrolör iletişimi için tercih edilir; Wiegand yalnız eski sistem uyumluluğu içindir. " +
                   "Biyometrik veriler özel nitelikli kişisel veridir; yalnız teknik destek sunulması kullanımın hukuken uygun olduğu anlamına gelmez.",
            ForeColor = p.Muted,
            Padding = new Padding(4)
        });
        root.Controls.Add(legal, 0, 2);
        page.Controls.Add(root);
        return page;
    }

    Control ServiceSection(string title, params (string Text, Func<Task> Action, PdksActionRole Role)[] actions)
    {
        var p = PdksAppearance.Current;
        var card = PdksUiKit.Card(12);
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, BackColor = p.Surface };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(PdksUiKit.SectionTitle(title, 30), 0, 0);
        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true, BackColor = p.Surface, Padding = new Padding(0, 8, 0, 0) };
        foreach (var item in actions)
            flow.Controls.Add(ActionButton(item.Text, Math.Max(160, item.Text.Length * 8 + 30), item.Action, false, item.Role));
        root.Controls.Add(flow, 0, 1);
        card.Controls.Add(root);
        return card;
    }

    static TabPage Page(string title) => new(title) { BackColor = PdksAppearance.Current.Canvas, Padding = Padding.Empty };

    static void AddInfo(TableLayoutPanel table, int column, int row, string title, string value)
    {
        var p = PdksAppearance.Current;
        var host = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Margin = new Padding(0, 0, 12, 6), BackColor = p.Surface };
        host.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        host.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        host.Controls.Add(new Label { Text = title, Dock = DockStyle.Fill, ForeColor = p.Muted, Font = new Font("Segoe UI", 8.2f, FontStyle.Bold) }, 0, 0);
        host.Controls.Add(new Label { Text = value, Dock = DockStyle.Fill, ForeColor = p.Text, Font = new Font("Segoe UI", 10f, FontStyle.Bold) }, 0, 1);
        table.Controls.Add(host, column, row);
    }

    Button ActionButton(string text, int width, Func<Task> action, bool primary = false, PdksActionRole? role = null)
    {
        var b = PdksUiKit.Button(text, width, role ?? (primary ? PdksActionRole.Primary : PdksActionRole.Secondary));
        b.Margin = new Padding(0, 0, 10, 8);
        b.Click += async (_, _) =>
        {
            if (busy) return;
            b.Enabled = false;
            try { await action(); }
            catch (Exception ex)
            {
                SetStatus("İşlem hatası • " + ex.GetBaseException().Message, false);
                PdksErrorPresenter.Show(this, ex, "Terminal Merkezi", MessageBoxIcon.Error, "TerminalCenter.Action");
            }
            finally { if (!IsDisposed) b.Enabled = true; }
        };
        return b;
    }

    async Task RefreshDeviceStatusAsync(bool showDialog = false)
    {
        if (busy) return;
        busy = true;
        try
        {
            SetStatus("Cihaz bağlantısı kontrol ediliyor…", null);
            var snapshot = await Task.Run(async () => await TerminalDeviceClient.ReadAsync(false));
            ApplySnapshot(snapshot);
            if (showDialog)
                MessageBox.Show(snapshot.Connected
                    ? $"Cihaz bağlı.\nSaat: {snapshot.DeviceTime:dd.MM.yyyy HH:mm:ss}\nKullanıcı: {snapshot.UserCount}\nKart: {snapshot.CardCount}\nYeni log: {snapshot.NewLogCount}"
                    : snapshot.Message,
                    "Kart Cihazı", MessageBoxButtons.OK, snapshot.Connected ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }
        finally { busy = false; }
    }

    void ApplySnapshot(TerminalDeviceSnapshot snapshot)
    {
        connectionValue.Text = snapshot.Connected ? "BAĞLI" : "BAĞLI DEĞİL";
        connectionValue.ForeColor = snapshot.Connected ? PdksAppearance.Current.Success : PdksAppearance.Current.Danger;
        clockValue.Text = snapshot.DeviceTime?.ToString("HH:mm:ss") ?? "—";
        usersValue.Text = snapshot.UserCount >= 0 ? snapshot.UserCount.ToString("N0") : "—";
        cardsValue.Text = snapshot.CardCount >= 0 ? snapshot.CardCount.ToString("N0") : "—";
        logsValue.Text = snapshot.NewLogCount >= 0 ? snapshot.NewLogCount.ToString("N0") : "—";
        var sync = TerminalSyncService.ReadState();
        syncValue.Text = sync?.LastAt?.ToString("dd.MM HH:mm") ?? "—";
        SetStatus(snapshot.Connected
            ? $"CİHAZ BAĞLI • {TerminalDeviceSettingsStore.Load().IpAddress}:{TerminalDeviceSettingsStore.Load().IpPort}"
            : "Cihaz bağlantısı yok • " + snapshot.Message,
            snapshot.Connected);
    }

    async Task LoadUsersAsync()
    {
        if (busy) return;
        busy = true;
        try
        {
            SetStatus("Cihaz kullanıcıları okunuyor ve sistemle eşleştiriliyor…", null);
            var rows = await Task.Run(async () => await TerminalMaintenanceService.AuditUsersAsync());
            usersGrid.Rows.Clear();
            foreach (var row in rows)
                usersGrid.Rows.Add(row.DeviceUserId, row.DeviceName, row.Credentials, row.SystemCardNo, row.SystemName, row.Status);
            var unmatched = rows.Count(x => !x.ExistsInSystem);
            SetStatus($"{rows.Count} cihaz kullanıcısı okundu • {unmatched} eşleşmeyen", unmatched == 0);
            tabs.SelectedIndex = 1;
        }
        finally { busy = false; }
    }

    async Task DeleteUnmatchedAsync()
    {
        var audit = await TerminalMaintenanceService.AuditUsersAsync();
        var unmatched = audit.Where(x => !x.ExistsInSystem).ToArray();
        if (unmatched.Length == 0)
        {
            MessageBox.Show("Eşleşmeyen cihaz kullanıcısı yok.", "Terminal Kullanıcıları", MessageBoxButtons.OK, MessageBoxIcon.Information);
            await LoadUsersAsync();
            return;
        }
        var list = string.Join(", ", unmatched.Take(12).Select(x => x.DeviceUserId));
        if (unmatched.Length > 12) list += "…";
        var answer = MessageBox.Show(
            $"{unmatched.Length} cihaz kullanıcısının sistemde personel karşılığı yok.\n\nCihaz no: {list}\n\nBu kullanıcılar cihazdan ve CANLI arşivdeki eşleşmeyen satırlardan silinsin mi?\nAna TNF/FDB geçmişine dokunulmaz.",
            "Eşleşmeyenleri Temizle", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (answer != DialogResult.Yes) return;

        SetStatus("Eşleşmeyen cihaz kullanıcıları temizleniyor…", null);
        var result = await TerminalMaintenanceService.DeleteUnmatchedUsersAsync();
        SetStatus(result.Message, result.Success);
        MessageBox.Show(result.Message, "Eşleşmeyenleri Temizle", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await LoadUsersAsync();
        await RefreshDeviceStatusAsync();
    }

    async Task MoveCardDialogAsync()
    {
        using var dialog = PdksUiKit.Dialog("Kartı Başka Sicile Taşı", new Size(470, 260), new Size(470, 260), false);
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, ColumnCount = 2, Padding = new Padding(18), BackColor = PdksAppearance.Current.Canvas };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var oldBox = new TextBox { Dock = DockStyle.Fill };
        var newBox = new TextBox { Dock = DockStyle.Fill };
        root.Controls.Add(PdksUiKit.FieldLabel("Mevcut cihaz no"), 0, 0);
        root.Controls.Add(oldBox, 1, 0);
        root.Controls.Add(PdksUiKit.FieldLabel("Yeni sicil / kart no"), 0, 1);
        root.Controls.Add(newBox, 1, 1);
        root.Controls.Add(new Label
        {
            Text = "Yalnız kart kimliği taşınır. Geçmiş basım logları değişmez.",
            Dock = DockStyle.Fill,
            ForeColor = PdksAppearance.Current.Muted,
            Padding = new Padding(0, 8, 0, 0)
        }, 0, 2);
        root.SetColumnSpan(root.GetControlFromPosition(0, 2)!, 2);
        var buttons = PdksUiKit.ActionBar(true, PdksAppearance.Current.Canvas);
        var cancel = PdksUiKit.Button("İptal", 100, PdksActionRole.Quiet, dialog.Close);
        var ok = PdksUiKit.Button("Kartı Taşı", 120, PdksActionRole.Primary);
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);
        root.Controls.Add(buttons, 0, 3);
        root.SetColumnSpan(buttons, 2);
        dialog.Controls.Add(root);

        ok.Click += async (_, _) =>
        {
            if (!int.TryParse(oldBox.Text.Trim(), out var oldId) || !int.TryParse(newBox.Text.Trim(), out var newId))
            {
                MessageBox.Show("Eski ve yeni numara sayısal olmalıdır.", "Kart Taşıma", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            var answer = MessageBox.Show($"{oldId} numaralı kart {newId} siciline taşınsın mı?", "Kart Taşıma", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) return;
            ok.Enabled = false;
            try
            {
                var result = await TerminalMaintenanceService.MoveCardAsync(oldId, newId);
                MessageBox.Show(result.Message, "Kart Taşıma", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
                if (result.Success) dialog.DialogResult = DialogResult.OK;
            }
            finally { ok.Enabled = true; }
        };
        if (dialog.ShowDialog(this) == DialogResult.OK) await LoadUsersAsync();
    }

    async Task LoadLogsAsync()
    {
        if (busy) return;
        busy = true;
        try
        {
            SetStatus("Cihaz logları okunuyor…", null);
            var snapshot = await Task.Run(async () => await TerminalDeviceClient.ReadAsync(true));
            ApplySnapshot(snapshot);
            if (!snapshot.Connected) return;
            logsGrid.Rows.Clear();
            foreach (var row in snapshot.Punches.OrderByDescending(x => x.OccurredAt).Take(2000))
                logsGrid.Rows.Add(row.EmployeeCode, row.OccurredAt.ToString("dd.MM.yyyy"), row.OccurredAt.ToString("HH:mm:ss"),
                    row.InOut, VerifyName(row.VerifyMode), row.TerminalNumber);
            SetStatus($"Cihazdan {snapshot.Punches.Count} fiziksel kayıt okundu • ekranda son {Math.Min(snapshot.Punches.Count, 2000)}", true);
            tabs.SelectedIndex = 2;
        }
        finally { busy = false; }
    }

    static string VerifyName(int value) => value switch
    {
        1 => "Parmak İzi",
        2 => "PIN",
        3 => "Kart",
        _ => value.ToString(CultureInfo.InvariantCulture)
    };

    async Task SyncNowAsync()
    {
        if (busy) return;
        busy = true;
        try
        {
            SetStatus("Kayıtlar TNF + FDB'ye doğrulanarak aktarılıyor…", null);
            var result = await TerminalSyncService.SyncAsync("Manuel terminal aktarımı");
            var ok = !result.Message.Contains("hata", StringComparison.OrdinalIgnoreCase) &&
                     !result.Message.Contains("başarısız", StringComparison.OrdinalIgnoreCase) &&
                     result.Skipped == 0;
            SetStatus(result.Message, ok);
            MessageBox.Show(result.Message +
                            $"\n\nOkunan: {result.ReadCount}\nYeni: {result.Inserted}\nGüncellenen: {result.Updated}\nMükerrer: {result.Duplicates}\nAtlanan: {result.Skipped}\nCihaz kayıtları: KORUNDU",
                "Terminal Aktarımı", MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            await RefreshDeviceStatusAsync();
        }
        finally { busy = false; }
    }

    async Task SyncAndClearLogsAsync()
    {
        if (MessageBox.Show(
            "Cihaz logları önce tarih/saatli CİHAZ TNF + HAM arşivine alınacak, ardından DATA/FDB + yıllık TNF doğrulanacak. Yalnız tüm doğrulama başarılı olursa cihazdan silinecek. Devam edilsin mi?",
            "Aktarıp Logları Temizle", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        SetStatus("Aktarım doğrulanıyor; başarılıysa cihaz logları temizlenecek…", null);
        var result = await TerminalMaintenanceService.SyncAndClearLogsAsync();
        SetStatus(result.Message, result.Success);
        MessageBox.Show(result.Message, "Aktarıp Temizle", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await RefreshDeviceStatusAsync();
        if (result.Success) logsGrid.Rows.Clear();
    }

    async Task ArchiveAndClearLogsAsync()
    {
        if (!ConfirmDanger("Cihazdaki TÜM geçiş logları silinecek. Silmeden önce tarih/saatli CİHAZ_OKUMA TNF, günlük TNF, HAM kayıt ve CANLI arşiv oluşturulacak.\n\nAna FDB/TNF'ye otomatik ekleme yapılmadan sıfırlamak istediğinizden emin misiniz?"))
            return;
        SetStatus("Cihaz logları arşivlenip sıfırlanıyor…", null);
        var result = await TerminalMaintenanceService.ArchiveAndClearLogsAsync();
        SetStatus(result.Message, result.Success);
        MessageBox.Show(result.Message, "Logları Sıfırla", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await RefreshDeviceStatusAsync();
        if (result.Success) logsGrid.Rows.Clear();
    }

    Task ClearLiveExceptWeekAsync()
    {
        if (MessageBox.Show(
            "CANLI arşivde yalnız son 7 takvim günü korunsun, daha eski CANLI kayıtlar temizlensin mi?\n\nAna TNF, FDB ve cihaz kayıtları değişmez.",
            "CANLI Arşiv Temizliği", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            return Task.CompletedTask;

        var result = TerminalMaintenanceService.ClearLiveExceptLastWeek();
        SetStatus(result.Message, true);
        MessageBox.Show(result.Message, "CANLI Arşiv", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return Task.CompletedTask;
    }

    Task ClearAllLiveAsync()
    {
        if (MessageBox.Show(
            "CANLI arşiv tamamen sıfırlansın mı?\n\nBu işlem yalnız CANLI önizleme/ham arşivini temizler; ana TNF, FDB ve cihaz kayıtlarına dokunmaz.",
            "CANLI Arşivi Sıfırla", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
            return Task.CompletedTask;

        var result = TerminalMaintenanceService.ClearAllLive();
        SetStatus(result.Message, true);
        MessageBox.Show(result.Message, "CANLI Arşiv", MessageBoxButtons.OK, MessageBoxIcon.Information);
        return Task.CompletedTask;
    }

    async Task ClearUsersAsync()
    {
        if (!ConfirmDanger("Cihazdaki TÜM kullanıcı/kart/şifre/biyometrik kayıtları sıfırlama işlemi uygulanacak.\n\nGeçmiş geçiş logları ayrı kalır. Bu işlem yalnız cihaz yeniden kurulacaksa kullanılmalıdır."))
            return;
        if (!ConfirmText("SIFIRLA")) return;
        SetStatus("Cihaz kullanıcıları sıfırlanıyor…", null);
        var result = await TerminalMaintenanceService.ClearUsersAsync();
        SetStatus(result.Message, result.Success);
        MessageBox.Show(result.Message, "Kullanıcıları Sıfırla", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await RefreshDeviceStatusAsync();
        if (result.Success) usersGrid.Rows.Clear();
    }

    bool ConfirmDanger(string message) =>
        MessageBox.Show(message, "Dikkat", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes;

    bool ConfirmText(string required)
    {
        using var dialog = PdksUiKit.Dialog("Son Onay", new Size(430, 210), new Size(430, 210), false);
        var box = new TextBox { Width = 300 };
        var ok = PdksUiKit.Button("Devam Et", 110, PdksActionRole.Danger);
        var cancel = PdksUiKit.Button("İptal", 100, PdksActionRole.Quiet, dialog.Close);
        var root = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(20), WrapContents = false };
        root.Controls.Add(new Label { Text = $"İşlemi onaylamak için {required} yazın:", AutoSize = true, Margin = new Padding(0, 0, 0, 8) });
        root.Controls.Add(box);
        var bar = new FlowLayoutPanel { Width = 340, Height = 46, FlowDirection = FlowDirection.RightToLeft, Margin = new Padding(0, 16, 0, 0) };
        bar.Controls.Add(cancel);
        bar.Controls.Add(ok);
        root.Controls.Add(bar);
        dialog.Controls.Add(root);
        ok.Click += (_, _) =>
        {
            if (!box.Text.Trim().Equals(required, StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show($"Onay metni {required} olmalıdır.", "Son Onay", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            dialog.DialogResult = DialogResult.OK;
        };
        return dialog.ShowDialog(this) == DialogResult.OK;
    }

    async Task SetDeviceTimeAsync()
    {
        if (MessageBox.Show("Cihaz tarihi ve saati bu bilgisayarın saatine eşitlensin mi?", "Cihaz Saati", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var result = await TerminalDeviceClient.ExecuteAsync("settime");
        MessageBox.Show(result.Success ? "Cihaz saati PC ile eşitlendi." : result.Message, "Cihaz Saati", MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await RefreshDeviceStatusAsync();
    }

    Task OpenSettingsAsync()
    {
        if (!settingsDialog.IsDisposed)
            settingsDialog.ShowDialog(this);
        else
        {
            using var dialog = new LegacyTerminalSettingsForm();
            dialog.ShowDialog(this);
        }
        return Task.CompletedTask;
    }

    Task ShowSdkDiagnosticsAsync()
    {
        var result = TerminalSdkDiagnostics.Check();
        MessageBox.Show(result.Message + (string.IsNullOrWhiteSpace(result.OcxPath) ? "" : $"\n\nOCX: {result.OcxPath}"),
            "SDK / Sürücü", MessageBoxButtons.OK, result.Ok ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        return Task.CompletedTask;
    }

    async Task RepairDriverAsync()
    {
        if (!TerminalSdkRepair.TryRepair(this)) return;
        await RefreshDeviceStatusAsync(true);
    }

    void RefreshSdkStatus()
    {
        var result = TerminalSdkDiagnostics.Check();
        SetStatus(result.Ok ? "SDK hazır • cihaz bağlantısı arka planda kontrol ediliyor" : "SDK: " + result.Message, result.Ok ? null : false);
    }

    void SetStatus(string text, bool? ok)
    {
        if (IsDisposed) return;
        status.Text = text;
        status.ForeColor = ok switch
        {
            true => PdksAppearance.Current.Success,
            false => PdksAppearance.Current.Danger,
            _ => PdksAppearance.Current.Primary
        };
    }
}
