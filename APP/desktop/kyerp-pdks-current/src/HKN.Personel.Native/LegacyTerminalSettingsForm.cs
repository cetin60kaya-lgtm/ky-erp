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
        Size = new Size(1180, 720);
        MinimumSize = new Size(1040, 640);
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.FromArgb(244, 247, 251);
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
        var canvas=Color.FromArgb(244,247,251);
        var surface=Color.White;
        var border=Color.FromArgb(226,232,240);
        var text=Color.FromArgb(15,23,42);
        var muted=Color.FromArgb(100,116,139);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, Padding = new Padding(16), BackColor = canvas };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 84));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 190));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));

        var hero = new Panel { Dock = DockStyle.Fill, BackColor = surface, Padding = new Padding(18,12,18,10), Margin = new Padding(0,0,0,10) };
        hero.Paint += (_,e)=>{using var p=new Pen(border);e.Graphics.DrawRectangle(p,0,0,Math.Max(0,hero.Width-1),Math.Max(0,hero.Height-1));};
        var title = new Label { Text="Terminal Merkezi", AutoSize=true, Location=new Point(18,12), Font=new Font("Segoe UI",13f,FontStyle.Bold), ForeColor=text };
        var hint = new Label { Text="Fiziksel kart cihazı bağlantısı, veri aktarımı ve sürücü işlemleri", AutoSize=true, Location=new Point(19,42), ForeColor=muted, Font=new Font("Segoe UI",8.8f) };
        status.Location=new Point(650,18);status.Width=470;status.Height=34;status.TextAlign=ContentAlignment.MiddleRight;
        hero.Controls.Add(title);hero.Controls.Add(hint);hero.Controls.Add(status);
        root.Controls.Add(hero,0,0);

        var setup = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, RowCount=1, BackColor=canvas, Margin=Padding.Empty };
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,64));
        setup.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,36));

        var gridCard=TerminalCard(border);
        var gridHost=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(14),BackColor=surface};
        gridHost.RowStyles.Add(new RowStyle(SizeType.Absolute,34));gridHost.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        gridHost.Controls.Add(new Label{Text="Tanımlı Cihaz",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=text},0,0);
        BuildGrid();grid.BorderStyle=BorderStyle.None;grid.RowHeadersVisible=false;grid.ColumnHeadersHeight=34;grid.RowTemplate.Height=31;grid.Margin=new Padding(0,4,0,0);
        gridHost.Controls.Add(grid,0,1);gridCard.Controls.Add(gridHost);setup.Controls.Add(gridCard,0,0);

        var connectionCard=TerminalCard(border);connectionCard.Margin=new Padding(12,0,0,0);
        var connection=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=7,Padding=new Padding(16),BackColor=surface};
        connection.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,112));connection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        connection.Controls.Add(new Label{Text="Bağlantı Profili",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=text},0,0);connection.SetColumnSpan(connection.GetControlFromPosition(0,0)!,2);
        TerminalRow(connection,1,"Cihaz",deviceName);
        var nums=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty};deviceNo.Width=70;machineNo.Width=70;nums.Controls.Add(new Label{Text="No",AutoSize=true,Padding=new Padding(0,7,4,0),ForeColor=muted});nums.Controls.Add(deviceNo);nums.Controls.Add(new Label{Text="Makine",AutoSize=true,Padding=new Padding(10,7,4,0),ForeColor=muted});nums.Controls.Add(machineNo);TerminalRow(connection,2,"Kimlik",nums);
        var net=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,Margin=Padding.Empty};net.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,52));net.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));net.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));ipAddress.Dock=DockStyle.Fill;ipPort.Dock=DockStyle.Fill;connectionType.Dock=DockStyle.Fill;net.Controls.Add(ipAddress,0,0);net.Controls.Add(ipPort,1,0);net.Controls.Add(connectionType,2,0);TerminalRow(connection,3,"Ağ",net);
        var serial=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Margin=Padding.Empty};serial.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));serial.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));comPort.Dock=DockStyle.Fill;baudRate.Dock=DockStyle.Fill;serial.Controls.Add(comPort,0,0);serial.Controls.Add(baudRate,1,0);TerminalRow(connection,4,"Seri",serial);
        TerminalRow(connection,5,"Yön",direction);
        var editBar=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.LeftToRight,WrapContents=true,Padding=new Padding(0,5,0,0)};
        var add=TerminalButton("EKLE",62,true);var remove=TerminalButton("ÇIKART",68,false);var edit=TerminalButton("DÜZENLE",76,false);
        save.Width=72;save.Height=32;save.FlatStyle=FlatStyle.Flat;save.BackColor=Color.FromArgb(37,99,235);save.ForeColor=Color.White;save.FlatAppearance.BorderColor=save.BackColor;
        add.Click += (_, _) => { ApplyToFields(TerminalDeviceSettings.Default); SetEditing(true); };
        remove.Click += (_, _) => { if(MessageBox.Show("Ana cihaz ayarları varsayılana döndürülsün mü?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;TerminalDeviceSettingsStore.Save(TerminalDeviceSettings.Default);LoadSettings();SetEditing(false); };
        edit.Click += (_,_)=>SetEditing(true);save.Click += (_,_)=>SaveSettings();
        editBar.Controls.Add(save);editBar.Controls.Add(edit);editBar.Controls.Add(remove);editBar.Controls.Add(add);connection.Controls.Add(editBar,1,6);
        connectionCard.Controls.Add(connection);setup.Controls.Add(connectionCard,1,0);
        root.Controls.Add(setup,0,1);

        var operationsCard=TerminalCard(border);
        operationsCard.Margin=new Padding(0,12,0,0);
        var opRoot=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=5,Padding=new Padding(18),BackColor=surface};
        opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,34));opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,52));opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,50));opRoot.RowStyles.Add(new RowStyle(SizeType.Absolute,52));opRoot.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        opRoot.Controls.Add(new Label{Text="Cihaz İşlemleri",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=text},0,0);
        var opButtons=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,6,0,0)};
        Button Action(string label,Func<Task> action,int width=145,bool primary=false){var b=TerminalButton(label,width,primary);b.Click+=async(_,_)=>{b.Enabled=false;try{await action();}finally{if(!IsDisposed)b.Enabled=true;}};opButtons.Controls.Add(b);return b;}
        Action("BAĞLAN TEST",()=>TestConnectionAsync(true),125,true);
        Action("CİHAZ TARİH/SAAT OKU",ReadDeviceTimeAsync,172);
        Action("PC SAATİNE AYARLA",SetDeviceTimeAsync,158);
        Action("CİHAZDAN OKU",PreviewPunchesAsync,132);
        Action("KAYITLARI AKTAR",TransferNowAsync,142,true);
        Action("SÜRÜCÜYÜ ONAR",RepairAsync,142);
        opRoot.Controls.Add(opButtons,0,1);

        var transfer=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=5,RowCount=1};
        transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,118));transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,42));transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,92));transfer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,90));
        transfer.Controls.Add(new Label{Text="Aktarım Dosyası",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=muted,Font=new Font("Segoe UI",8.5f,FontStyle.Bold)},0,0);
        transferFile.Dock=DockStyle.Fill;transferFile.Margin=new Padding(0,7,6,7);transfer.Controls.Add(transferFile,1,0);
        var browse=TerminalButton("…",36,false);browse.Height=30;browse.Click+=(_,_)=>BrowseTransferFile();transfer.Controls.Add(browse,2,0);
        transfer.Controls.Add(new Label{Text="Tolerans",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleRight,ForeColor=muted},3,0);tolerance.Dock=DockStyle.Fill;tolerance.Margin=new Padding(4,7,0,7);transfer.Controls.Add(tolerance,4,0);
        opRoot.Controls.Add(transfer,0,2);

        var flags=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(0,8,0,0)};backup.AutoSize=true;deleteAfter.AutoSize=true;flags.Controls.Add(backup);flags.Controls.Add(deleteAfter);opRoot.Controls.Add(flags,0,3);
        opRoot.Controls.Add(new Label{Text="Güvenlik: cihaz kayıtları otomatik silinmez. Kayıtlar TNF + FDB + canlı arşive doğrulanarak alınır.",Dock=DockStyle.Fill,ForeColor=muted,Font=new Font("Segoe UI",8.5f),TextAlign=ContentAlignment.TopLeft},0,4);
        operationsCard.Controls.Add(opRoot);root.Controls.Add(operationsCard,0,2);

        var bottom=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.RightToLeft,Padding=new Padding(0,9,0,0),BackColor=canvas};var close=TerminalButton("ÇIKIŞ",96,false);close.Click+=(_,_)=>Close();bottom.Controls.Add(close);root.Controls.Add(bottom,0,3);
        Controls.Add(root);
    }

    static Panel TerminalCard(Color border)
    {
        var p=new Panel{Dock=DockStyle.Fill,BackColor=Color.White,Margin=Padding.Empty};p.Paint+=(_,e)=>{using var pen=new Pen(border);e.Graphics.DrawRectangle(pen,0,0,Math.Max(0,p.Width-1),Math.Max(0,p.Height-1));};return p;
    }

    static void TerminalRow(TableLayoutPanel table,int row,string caption,Control control)
    {
        table.RowStyles.Add(new RowStyle(SizeType.Absolute,34));table.Controls.Add(new Label{Text=caption,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=Color.FromArgb(100,116,139),Font=new Font("Segoe UI",8.3f,FontStyle.Bold)},0,row);control.Dock=DockStyle.Fill;control.Margin=new Padding(0,4,0,4);table.Controls.Add(control,1,row);
    }

    static Button TerminalButton(string text,int width,bool primary)
    {
        var b=PdksUiKit.Button(text,width,primary?PdksActionRole.Primary:PdksActionRole.Secondary);
        b.Height=32;b.MinimumSize=new Size(width,32);b.MaximumSize=new Size(width,32);b.Margin=new Padding(0,0,8,0);
        return b;
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
            PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Terminal.Settings");
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
            if (showMessage) PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Terminal.Connection");
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
        if (text.Contains('Ã') || text.Contains('Ä') || text.Contains('Å'))
        {
            try { text = System.Text.Encoding.UTF8.GetString(System.Text.Encoding.Latin1.GetBytes(text)); } catch { }
        }
        status.Text = text;
        status.ForeColor = ok switch { true => Color.DarkGreen, false => Color.Firebrick, _ => Color.FromArgb(31, 92, 180) };
    }
}
