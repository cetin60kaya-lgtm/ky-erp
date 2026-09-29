using System.ComponentModel;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    string TerminalProfilePath => Path.Combine(CompanyDataPaths.Config, "terminal-transfer-profiles.json");

    void ShowTerminalProfiles()
    {
        using var dialog = CreateTerminalTransferDialog();
        dialog.ShowDialog(DialogOwner());
    }

    public Form CreateTerminalTransferDialog()
    {
        var device = TerminalDeviceSettingsStore.Load();
        CompanyDataPaths.Ensure();

        var dialog = new Form
        {
            Text = "Terminal Veri Transferi",
            StartPosition = FormStartPosition.CenterScreen,
            Size = new Size(620, 610),
            MinimumSize = new Size(620, 610),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = false,
            Font = Font
        };

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 6, Padding = new Padding(12) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));

        var head = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(12, 8, 12, 8) };
        head.Controls.Add(new Label { Text = "Terminalden Gelen Kart Kayıtları", AutoSize = true, Location = new Point(12, 8), Font = new Font(Font.FontFamily, 12f, FontStyle.Bold), ForeColor = Color.FromArgb(27, 44, 68) });
        head.Controls.Add(new Label { Text = $"{device.DeviceName} • {device.IpAddress}:{device.IpPort} • Makine {device.MachineNo}", AutoSize = true, Location = new Point(12, 36), ForeColor = Color.FromArgb(36, 107, 230) });
        root.Controls.Add(head, 0, 0);

        var info = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4 };
        info.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 95));
        info.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        info.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        info.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
        info.Controls.Add(new Label { Text = "TNF Dosyası", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, 0);
        var fileBox = new TextBox { Dock = DockStyle.Fill, ReadOnly = true, Text = CompanyDataPaths.CurrentTnf, Margin = new Padding(3, 12, 3, 8) };
        info.Controls.Add(fileBox, 1, 0);
        info.Controls.Add(new Label { Text = "Tolerans", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight }, 2, 0);
        var tolerance = new NumericUpDown { Minimum = 0, Maximum = 60, Value = device.ToleranceMinutes, Dock = DockStyle.Fill, Margin = new Padding(8, 10, 3, 8) };
        info.Controls.Add(tolerance, 3, 0);
        root.Controls.Add(info, 0, 1);

        var log = new DataGridView
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            AutoGenerateColumns = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            BackgroundColor = Color.White,
            RowHeadersVisible = false
        };
        log.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Kart No", DataPropertyName = nameof(TerminalDevicePunch.EmployeeCode), Width = 100 });
        log.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Tarih / Saat", DataPropertyName = nameof(TerminalDevicePunch.OccurredAt), Width = 170, DefaultCellStyle = new DataGridViewCellStyle { Format = "dd.MM.yyyy HH:mm:ss" } });
        log.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "G/Ç", DataPropertyName = nameof(TerminalDevicePunch.InOut), Width = 65 });
        log.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Doğrulama", DataPropertyName = nameof(TerminalDevicePunch.VerifyMode), Width = 90 });
        log.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Terminal", DataPropertyName = nameof(TerminalDevicePunch.TerminalNumber), Width = 80 });
        root.Controls.Add(log, 0, 2);

        var count = new Label { Dock = DockStyle.Fill, Text = "Aktarılan / Okunan Kayıt: 0", TextAlign = ContentAlignment.MiddleLeft, Font = new Font(Font, FontStyle.Bold) };
        root.Controls.Add(count, 0, 3);
        var progress = new ProgressBar { Dock = DockStyle.Fill, Minimum = 0, Maximum = 100 };
        root.Controls.Add(progress, 0, 4);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 7, 0, 0), WrapContents = false };
        var transfer = new Button { Text = "Aktar", Width = 135, Height = 34, Font = new Font(Font, FontStyle.Bold), ForeColor = Color.Navy };
        var read = new Button { Text = "Cihaz Okut", Width = 135, Height = 34, Font = new Font(Font, FontStyle.Bold), ForeColor = Color.Navy };
        var close = new Button { Text = "Kapat", Width = 100, Height = 34 };
        actions.Controls.AddRange([close, transfer, read]);
        root.Controls.Add(actions, 0, 5);
        dialog.Controls.Add(root);

        void ShowRecords(IReadOnlyList<TerminalDevicePunch> records)
        {
            log.DataSource = records.ToList();
            count.Text = $"Aktarılan / Okunan Kayıt: {records.Count}";
            progress.Value = records.Count == 0 ? 0 : 100;
        }

        read.Click += async (_, _) =>
        {
            read.Enabled = false;
            transfer.Enabled = false;
            try
            {
                var snapshot = await TerminalDeviceClient.ReadAsync(true);
                if (!snapshot.Connected)
                {
                    ShowRecords(Array.Empty<TerminalDevicePunch>());
                    MessageBox.Show(snapshot.Message, "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                ShowRecords(snapshot.Punches);
                if (snapshot.Punches.Count == 0)
                    MessageBox.Show("Cihaz bağlı. Yeni kart kaydı yok.", "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.GetBaseException().Message, "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally
            {
                read.Enabled = true;
                transfer.Enabled = true;
            }
        };

        transfer.Click += async (_, _) =>
        {
            read.Enabled = false;
            transfer.Enabled = false;
            try
            {
                var current = TerminalDeviceSettingsStore.Load();
                if ((int)tolerance.Value != current.ToleranceMinutes)
                    TerminalDeviceSettingsStore.Save(current with { ToleranceMinutes = (int)tolerance.Value });

                var result = await TerminalSyncService.SyncAsync("Terminal Veri Transferi");
                if (result.Message.StartsWith("Cihaz bağlantısı başarısız", StringComparison.OrdinalIgnoreCase) || result.Message.StartsWith("Eşitleme hatası", StringComparison.OrdinalIgnoreCase))
                {
                    MessageBox.Show(result.Message, "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (result.ReadCount == 0 && result.Inserted == 0 && result.Updated == 0 && result.Duplicates == 0)
                {
                    ShowRecords(Array.Empty<TerminalDevicePunch>());
                    MessageBox.Show("Aktarılacak veri yok.", "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                count.Text = $"Aktarılan / Okunan Kayıt: {result.ReadCount}";
                progress.Value = result.Skipped == 0 ? 100 : 50;
                RefreshFullTabs();
                MessageBox.Show(
                    result.Message + $"\n\nOkunan: {result.ReadCount}\nYeni: {result.Inserted}\nGüncellenen: {result.Updated}\nMükerrer: {result.Duplicates}\nAtlanan: {result.Skipped}\nCihaz temizlendi: {(result.DeviceCleared ? "Evet" : "Hayır")}",
                    "Terminal Veri Transferi",
                    MessageBoxButtons.OK,
                    result.Skipped == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.GetBaseException().Message, "Terminal Veri Transferi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            finally
            {
                read.Enabled = true;
                transfer.Enabled = true;
            }
        };

        close.Click += (_, _) => dialog.Close();
        return dialog;
    }

    string ResolveLegacyTransferPath()
    {
        var env = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_FILE");
        if (!string.IsNullOrWhiteSpace(env)) return env;
        return TerminalDeviceSettingsStore.Load().TransferFile;
    }

    public void ShowTerminalProfileManager()
    {
        var store = new TerminalProfileStore(TerminalProfilePath, options);
        var profiles = new BindingList<TerminalTransferProfile>(store.Load().ToList());
        using var dialog = new Form { Text = "Terminal Aktarım Profilleri", StartPosition = FormStartPosition.CenterParent, Size = new Size(1040, 590), MinimumSize = new Size(900, 520), Font = Font, ShowInTaskbar = false };
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, Padding = new Padding(8) };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        var heading = new Label { Text = "Terminal Aktarım Profilleri", Dock = DockStyle.Fill, Font = new Font(Font.FontFamily, 12, FontStyle.Bold), ForeColor = Color.Navy, TextAlign = ContentAlignment.MiddleLeft }; root.Controls.Add(heading, 0, 0);
        var grid = new DataGridView { Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AutoGenerateColumns = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false, DataSource = profiles, BackgroundColor = Color.White };
        void Column(string property, string title, int width) { grid.Columns.Add(new DataGridViewTextBoxColumn { DataPropertyName = property, HeaderText = title, Width = width }); }
        Column(nameof(TerminalTransferProfile.Name), "Profil", 210); Column(nameof(TerminalTransferProfile.FormatType), "Format", 90); Column(nameof(TerminalTransferProfile.DeviceId), "Cihaz", 100); Column(nameof(TerminalTransferProfile.TenantId), "Tenant", 105); Column(nameof(TerminalTransferProfile.CompanyId), "Firma", 105); Column(nameof(TerminalTransferProfile.WorkplaceId), "İşyeri", 105); Column(nameof(TerminalTransferProfile.Encoding), "Encoding", 85);
        grid.Columns.Add(new DataGridViewCheckBoxColumn { DataPropertyName = nameof(TerminalTransferProfile.IsDefault), HeaderText = "Varsayılan", Width = 80 });
        grid.Columns.Add(new DataGridViewCheckBoxColumn { DataPropertyName = nameof(TerminalTransferProfile.IsCanonical), HeaderText = "Korumalı", Width = 70 }); root.Controls.Add(grid, 0, 1);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(2, 7, 2, 2), WrapContents = false };
        Button Add(string text, Action action) { var button = new Button { Text = text, AutoSize = true, Height = 31, ForeColor = Color.Navy }; button.Click += (_, _) => { try { action(); } catch (Exception ex) { MessageBox.Show(ex.Message, "Terminal Profilleri", MessageBoxButtons.OK, MessageBoxIcon.Warning); } }; actions.Controls.Add(button); return button; }
        TerminalTransferProfile? Selected() => grid.CurrentRow?.DataBoundItem as TerminalTransferProfile;
        void Persist() { store.Save(profiles); profiles.ResetBindings(); }
        Add("Yeni Profil", () => { var profile = NewTerminalProfile(); if (EditTerminalProfile(profile, out var edited)) { profiles.Add(edited); Persist(); } });
        Add("Profili Kopyala", () => { var selected = Selected() ?? throw new InvalidOperationException("Bir profil seçin."); var copy = selected.Copy(selected.Name + " Kopya"); if (EditTerminalProfile(copy, out var edited)) { profiles.Add(edited); Persist(); } });
        Add("Düzenle", () => { var selected = Selected() ?? throw new InvalidOperationException("Bir profil seçin."); if (selected.IsCanonical) throw new InvalidOperationException("Canonical preset doğrudan değiştirilemez; önce kopyalayın."); if (EditTerminalProfile(selected, out var edited)) { var index = profiles.IndexOf(selected); profiles[index] = edited; Persist(); } });
        Add("Sil", () => { var selected = Selected() ?? throw new InvalidOperationException("Bir profil seçin."); if (selected.IsCanonical) throw new InvalidOperationException("Canonical preset silinemez."); if (MessageBox.Show($"{selected.Name} profili silinsin mi?", "Terminal Profilleri", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) { profiles.Remove(selected); Persist(); } });
        Add("Varsayılan Yap", () => { var selected = Selected() ?? throw new InvalidOperationException("Bir profil seçin."); for (int i = 0; i < profiles.Count; i++) profiles[i] = profiles[i] with { IsDefault = profiles[i].Id == selected.Id }; Persist(); });
        var close = new Button { Text = "Kapat", Width = 95, Height = 31, DialogResult = DialogResult.OK, Anchor = AnchorStyles.Right }; actions.Controls.Add(close); root.Controls.Add(actions, 0, 2); dialog.Controls.Add(root); dialog.AcceptButton = close; dialog.ShowDialog(DialogOwner());
    }

    TerminalTransferProfile NewTerminalProfile() => new()
    {
        Id = Guid.NewGuid(), Name = "Yeni Terminal Profili", TenantId = options.TenantId ?? "*", CompanyId = options.CompanyId ?? "*", WorkplaceId = options.WorkplaceId ?? "*", DeviceId = "TNF-001",
        FormatType = TerminalFormatType.Tnf, Separator = ",", Encoding = "utf-8", DateFormat = "ddMMyy", TimeFormat = "HH:mm", EntryCodeMapping = new() { ["1"] = "ENTRY" }
    };

    bool EditTerminalProfile(TerminalTransferProfile profile, out TerminalTransferProfile edited)
    {
        return TerminalProfileEditor.Edit(this, Font, profile, out edited);
    }
}
