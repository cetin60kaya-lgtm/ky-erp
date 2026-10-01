namespace HKN.Personel.Native;

public sealed class LegacyTerminalSettingsForm : Form
{
    readonly DataGridView grid = new();
    readonly NumericUpDown deviceNo = Number(1, 9999);
    readonly TextBox deviceName = new();
    readonly NumericUpDown machineNo = Number(1, 9999);
    readonly ComboBox connectionType = Combo("Ethernet", "Seri");
    readonly ComboBox comPort = Combo("COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8");
    readonly ComboBox baudRate = Combo("9600", "19200", "38400", "57600", "115200");
    readonly TextBox ipAddress = new();
    readonly NumericUpDown ipPort = Number(1, 65535);
    readonly ComboBox direction = Combo("GİRİŞ", "ÇIKIŞ");
    readonly TextBox transferFile = new();
    readonly NumericUpDown tolerance = Number(0, 60);
    readonly CheckBox deleteAfter = new() { Text = "Cihaz kayıtlarını otomatik silme (güvenlik gereği kapalı)", Enabled = false, Checked = false };
    readonly CheckBox backup = new() { Text = "Veriler yedek alınsın" };
    readonly Label status = new() { AutoSize = false, Height = 30, TextAlign = ContentAlignment.MiddleLeft, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
    readonly Button save = Cmd("KAYDET", 110);
    bool editing;

    public LegacyTerminalSettingsForm()
    {
        Text = "Terminal / Kart Cihazı Ayarları";
        StartPosition = FormStartPosition.CenterParent;
        Size = new Size(1040, 690);
        MinimumSize = new Size(960, 640);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(246, 249, 253);
        Build();
        Shown += async (_, _) =>
        {
            LoadSettings();
            SetEditing(false);
            await TestConnectionAsync(false);
        };
    }

    static NumericUpDown Number(int min, int max) => new() { Minimum = min, Maximum = max, ThousandsSeparator = false };
    static ComboBox Combo(params string[] items)
    {
        var box = new ComboBox { DropDownStyle = ComboBoxStyle.DropDown };
        box.Items.AddRange(items.Cast<object>().ToArray());
        return box;
    }
    static Button Cmd(string text, int width = 122) => new() { Text = text, Width = width, Height = 36, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
    static Label L(string text) => new() { Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, ForeColor = Color.FromArgb(55, 70, 92) };

    void Build()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 5, Padding = new Padding(14), BackColor = BackColor };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 150));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 158));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 115));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));

        BuildGrid();
        root.Controls.Add(grid, 0, 0);

        var devicePanel = new GroupBox { Text = "Cihaz Bağlantı Ayarları", Dock = DockStyle.Fill, Padding = new Padding(12) };
        var deviceFields = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 10, RowCount = 2 };
        for (var i = 0; i < 10; i++) deviceFields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 10));
        deviceFields.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        deviceFields.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        AddField(deviceFields, 0, "Cihaz No", deviceNo);
        AddField(deviceFields, 1, "Cihaz Adı", deviceName);
        AddField(deviceFields, 2, "Makine No", machineNo);
        AddField(deviceFields, 3, "Bağlantı Tipi", connectionType);
        AddField(deviceFields, 4, "Com No", comPort);
        AddField(deviceFields, 5, "Baudrate", baudRate);
        AddField(deviceFields, 6, "IP Adres", ipAddress);
        AddField(deviceFields, 7, "IP Port", ipPort);
        AddField(deviceFields, 8, "Giriş / Çıkış", direction);
        var statusBox = new Panel { Dock = DockStyle.Fill, Padding = new Padding(4, 2, 4, 2) };
        status.Dock = DockStyle.Fill;
        statusBox.Controls.Add(status);
        deviceFields.Controls.Add(L("İşlem Durumu"), 9, 0);
        deviceFields.Controls.Add(statusBox, 9, 1);
        devicePanel.Controls.Add(deviceFields);
        root.Controls.Add(devicePanel, 0, 1);

        var rowActions = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(8, 12, 8, 0), WrapContents = false };
        var add = Cmd("EKLE", 105);
        var remove = Cmd("ÇIKART", 105);
        var edit = Cmd("DÜZENLE", 105);
        add.Click += (_, _) => { ApplyToFields(TerminalDeviceSettings.Default); SetEditing(true); };
        remove.Click += (_, _) =>
        {
            if (MessageBox.Show("Ana cihaz ayarları varsayılana döndürülsün mü?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            TerminalDeviceSettingsStore.Save(TerminalDeviceSettings.Default);
            LoadSettings();
            SetEditing(false);
        };
        edit.Click += (_, _) => SetEditing(true);
        save.Click += (_, _) => SaveSettings();
        rowActions.Controls.AddRange([add, remove, edit, save]);
        root.Controls.Add(rowActions, 0, 2);

        var operations = new GroupBox { Text = "Cihaz İşlemleri", Dock = DockStyle.Fill, Padding = new Padding(12) };
        var opRoot = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1 };
        opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute, 80));
        opRoot.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var opButtons = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = true };
        Button Action(string text, Func<Task> action, int width = 135)
        {
            var b = Cmd(text, width);
            b.Click += async (_, _) =>
            {
                b.Enabled = false;
                try { await action(); }
                finally { if (!IsDisposed) b.Enabled = true; }
            };
            opButtons.Controls.Add(b);
            return b;
        }
        Action("BAĞLAN TEST", () => TestConnectionAsync(true));
        Action("CİHAZ TARİH/SAAT OKU", ReadDeviceTimeAsync, 178);
        Action("PC SAATİNE AYARLA", SetDeviceTimeAsync, 165);
        Action("CİHAZDAN OKU", PreviewPunchesAsync, 135);
        Action("KAYITLARI AKTAR", TransferNowAsync, 145);
        Action("SÜRÜCÜYÜ ONAR", RepairAsync, 145);
        opRoot.Controls.Add(opButtons, 0, 0);

        var transfer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 2 };
        transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 48));
        transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        transfer.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        transfer.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        transfer.Controls.Add(L("Veri Aktarım Yolu"), 0, 0);
        transferFile.Dock = DockStyle.Fill;
        transferFile.Margin = new Padding(4, 7, 4, 7);
        transfer.Controls.Add(transferFile, 1, 0);
        var browse = Cmd("…", 40);
        browse.Height = 29;
        browse.Click += (_, _) => BrowseTransferFile();
        transfer.Controls.Add(browse, 2, 0);
        transfer.Controls.Add(L("Tolerans (dk)"), 3, 0);
        tolerance.Dock = DockStyle.Fill;
        tolerance.Margin = new Padding(4, 7, 4, 7);
        transfer.Controls.Add(tolerance, 3, 1);
        backup.Dock = DockStyle.Fill;
        deleteAfter.Dock = DockStyle.Fill;
        transfer.Controls.Add(backup, 0, 1);
        transfer.SetColumnSpan(backup, 2);
        transfer.Controls.Add(deleteAfter, 2, 1);
        transfer.SetColumnSpan(deleteAfter, 1);
        opRoot.Controls.Add(transfer, 0, 1);

        var note = new Label
        {
            Dock = DockStyle.Fill,
            AutoSize = false,
            Text = "Güvenlik: cihaz kayıtları otomatik silinmez. Kayıtlar önce TNF + FDB + canlı arşive doğrulanarak alınır; yedekleme açık tutulur. Veri yoksa işlem hata üretmez.",
            ForeColor = Color.FromArgb(70, 84, 103),
            Padding = new Padding(4, 6, 4, 0)
        };
        opRoot.Controls.Add(note, 0, 2);
        operations.Controls.Add(opRoot);
        root.Controls.Add(operations, 0, 3);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 8, 0, 0) };
        var close = Cmd("ÇIKIŞ", 110);
        close.Click += (_, _) => Close();
        bottom.Controls.Add(close);
        root.Controls.Add(bottom, 0, 4);

        Controls.Add(root);
    }

    void BuildGrid()
    {
        grid.Dock = DockStyle.Fill;
        grid.ReadOnly = true;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.MultiSelect = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.BackgroundColor = Color.White;
        foreach (var name in new[] { "CihazNo", "CihazAdı", "MakineNo", "BağlantıTipi", "ComPort", "Baudrate", "IP Adres", "IP Port", "Giriş/Çıkış", "İşlem Durumu" })
            grid.Columns.Add(name.Replace(" ", ""), name);
        grid.CellDoubleClick += (_, _) => SetEditing(true);
    }

    static void AddField(TableLayoutPanel table, int column, string label, Control control)
    {
        table.Controls.Add(L(label), column, 0);
        control.Dock = DockStyle.Fill;
        control.Margin = new Padding(3, 7, 3, 7);
        table.Controls.Add(control, column, 1);
    }

    void LoadSettings()
    {
        var value = TerminalDeviceSettingsStore.Load();
        ApplyToFields(value);
        RefreshGrid(value, "Kontrol bekliyor");
    }

    void ApplyToFields(TerminalDeviceSettings value)
    {
        deviceNo.Value = Math.Clamp(value.DeviceNo, (int)deviceNo.Minimum, (int)deviceNo.Maximum);
        deviceName.Text = value.DeviceName;
        machineNo.Value = Math.Clamp(value.MachineNo, (int)machineNo.Minimum, (int)machineNo.Maximum);
        connectionType.Text = value.ConnectionType;
        comPort.Text = value.ComPort;
        baudRate.Text = value.BaudRate.ToString();
        ipAddress.Text = value.IpAddress;
        ipPort.Value = Math.Clamp(value.IpPort, (int)ipPort.Minimum, (int)ipPort.Maximum);
        direction.Text = value.Direction;
        transferFile.Text = value.TransferFile;
        deleteAfter.Checked = value.DeleteAfterValidatedTransfer;
        backup.Checked = value.BackupBeforeTransfer;
        tolerance.Value = Math.Clamp(value.ToleranceMinutes, (int)tolerance.Minimum, (int)tolerance.Maximum);
    }

    TerminalDeviceSettings ReadFields()
    {
        if (string.IsNullOrWhiteSpace(ipAddress.Text)) throw new InvalidOperationException("IP adresi boş bırakılamaz.");
        if (!int.TryParse(baudRate.Text.Trim(), out var baud) || baud <= 0) throw new InvalidOperationException("Baudrate geçersiz.");
        return new TerminalDeviceSettings(
            (int)deviceNo.Value,
            string.IsNullOrWhiteSpace(deviceName.Text) ? "Cihaz1" : deviceName.Text.Trim(),
            (int)machineNo.Value,
            string.IsNullOrWhiteSpace(connectionType.Text) ? "Ethernet" : connectionType.Text.Trim(),
            string.IsNullOrWhiteSpace(comPort.Text) ? "COM1" : comPort.Text.Trim(),
            baud,
            ipAddress.Text.Trim(),
            (int)ipPort.Value,
            string.IsNullOrWhiteSpace(direction.Text) ? "GİRİŞ" : direction.Text.Trim(),
            string.IsNullOrWhiteSpace(transferFile.Text) ? TerminalDeviceSettings.Default.TransferFile : transferFile.Text.Trim(),
            deleteAfter.Checked,
            backup.Checked,
            (int)tolerance.Value);
    }

    void SaveSettings()
    {
        try
        {
            var value = ReadFields();
            TerminalDeviceSettingsStore.Save(value);
            RefreshGrid(value, "Kaydedildi");
            SetEditing(false);
            MessageBox.Show("Kart cihazı ayarları kaydedildi.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    void SetEditing(bool value)
    {
        editing = value;
        foreach (var c in new Control[] { deviceNo, deviceName, machineNo, connectionType, comPort, baudRate, ipAddress, ipPort, direction, transferFile, tolerance, backup }) c.Enabled = value;
        deleteAfter.Enabled = false;
        deleteAfter.Checked = false;
        save.Enabled = value;
    }

    void RefreshGrid(TerminalDeviceSettings value, string state)
    {
        grid.Rows.Clear();
        grid.Rows.Add(value.DeviceNo, value.DeviceName, value.MachineNo, value.ConnectionType, value.ComPort, value.BaudRate, value.IpAddress, value.IpPort, value.Direction, state);
        if (grid.Rows.Count > 0) grid.Rows[0].Selected = true;
    }

    async Task TestConnectionAsync(bool showMessage)
    {
        try
        {
            var saved = TerminalDeviceSettingsStore.Load();
            SetStatus("Bağlantı test ediliyor…", null);
            var snap = await TerminalDeviceClient.ReadAsync(false);
            if (snap.Connected)
            {
                SetStatus($"Bağlantı var • {snap.DeviceTime:dd.MM.yyyy HH:mm:ss}", true);
                RefreshGrid(saved, "Bağlantı var");
                if (showMessage) MessageBox.Show($"Cihaz bağlantısı başarılı.\nIP: {saved.IpAddress}:{saved.IpPort}\nMakine: {saved.MachineNo}\nCihaz saati: {snap.DeviceTime:dd.MM.yyyy HH:mm:ss}", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                SetStatus("Bağlantı yok • " + snap.Message, false);
                RefreshGrid(saved, "Bağlantı yok");
                if (showMessage) MessageBox.Show(snap.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            SetStatus("Bağlantı hatası • " + ex.GetBaseException().Message, false);
            if (showMessage) MessageBox.Show(ex.GetBaseException().Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    async Task ReadDeviceTimeAsync()
    {
        var snap = await TerminalDeviceClient.ReadAsync(false);
        if (!snap.Connected) { MessageBox.Show(snap.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        MessageBox.Show($"Cihaz tarih / saat: {snap.DeviceTime:dd.MM.yyyy HH:mm:ss}", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    async Task SetDeviceTimeAsync()
    {
        if (MessageBox.Show("Cihaz tarihi ve saati bu bilgisayarın saatine ayarlansın mı?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        var result = await TerminalDeviceClient.ExecuteAsync("settime");
        MessageBox.Show(result.Success ? "Cihaz tarihi / saati PC saatine ayarlandı." : result.Message, Text, MessageBoxButtons.OK, result.Success ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        await TestConnectionAsync(false);
    }

    async Task PreviewPunchesAsync()
    {
        var snap = await TerminalDeviceClient.ReadAsync(true);
        if (!snap.Connected) { MessageBox.Show(snap.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (snap.Punches.Count == 0)
        {
            MessageBox.Show("Cihaz bağlı. Yeni kart kaydı yok.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var preview = new Form { Text = $"Cihaz Kayıtları • {snap.Punches.Count}", StartPosition = FormStartPosition.CenterParent, Size = new Size(680, 520), Font = Font };
        var list = new DataGridView { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AutoGenerateColumns = false, BackgroundColor = Color.White };
        list.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Kart No", DataPropertyName = nameof(TerminalDevicePunch.EmployeeCode), Width = 100 });
        list.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Tarih / Saat", DataPropertyName = nameof(TerminalDevicePunch.OccurredAt), Width = 180 });
        list.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Giriş/Çıkış", DataPropertyName = nameof(TerminalDevicePunch.InOut), Width = 100 });
        list.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Terminal", DataPropertyName = nameof(TerminalDevicePunch.TerminalNumber), Width = 90 });
        list.DataSource = snap.Punches.ToList();
        preview.Controls.Add(list);
        preview.ShowDialog(this);
    }

    async Task TransferNowAsync()
    {
        var result = await TerminalSyncService.SyncAsync("Manuel terminal aktarımı");
        if (result.ReadCount == 0 && result.Inserted == 0 && result.Updated == 0 && result.Duplicates == 0)
        {
            MessageBox.Show("Aktarılacak veri yok.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var detail = result.Message + $"\n\nOkunan: {result.ReadCount}\nYeni: {result.Inserted}\nGüncellenen: {result.Updated}\nMükerrer: {result.Duplicates}\nAtlanan: {result.Skipped}\nCihaz temizlendi: {(result.DeviceCleared ? "Evet" : "Hayır")}";
        MessageBox.Show(detail, Text, MessageBoxButtons.OK, result.Skipped == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
    }

    async Task RepairAsync()
    {
        if (!TerminalSdkRepair.TryRepair(this)) return;
        await TestConnectionAsync(true);
    }

    void BrowseTransferFile()
    {
        using var dlg = new OpenFileDialog { CheckFileExists = false, FileName = Path.GetFileName(transferFile.Text), InitialDirectory = Directory.Exists(Path.GetDirectoryName(transferFile.Text)) ? Path.GetDirectoryName(transferFile.Text) : null, Filter = "Terminal kayıt dosyası (*.txt;*.tnf)|*.txt;*.tnf|Tüm dosyalar (*.*)|*.*" };
        if (dlg.ShowDialog(this) == DialogResult.OK) transferFile.Text = dlg.FileName;
    }

    void SetStatus(string text, bool? ok)
    {
        status.Text = text;
        status.ForeColor = ok switch { true => Color.DarkGreen, false => Color.Firebrick, _ => Color.FromArgb(31, 92, 180) };
    }
}
