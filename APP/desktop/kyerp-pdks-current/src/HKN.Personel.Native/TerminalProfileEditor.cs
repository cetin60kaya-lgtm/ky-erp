using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal static class TerminalProfileEditor
{
    public static bool Edit(IWin32Window owner, Font font, TerminalTransferProfile profile, out TerminalTransferProfile edited)
    {
        if (profile.IsCanonical) throw new InvalidOperationException("Canonical preset doğrudan değiştirilemez; önce kopyalayın.");
        using var dialog = new Form { Text = "Terminal Profili Düzenle", StartPosition = FormStartPosition.CenterParent, Size = new Size(840, 720), MinimumSize = new Size(720, 620), Font = font };
        var tabs = new TabControl { Dock = DockStyle.Fill };
        var general = FormTable(165, 90);
        var positions = FormTable(210, 150);
        var mappings = FormTable(180, 0);
        AddPage(tabs, "Genel", general); AddPage(tabs, "Alan Konumları", positions); AddPage(tabs, "Kod Eşlemeleri", mappings);

        var name = TextField(general, "Profil adı", profile.Name);
        var tenant = TextField(general, "Tenant", profile.TenantId);
        var company = TextField(general, "Firma", profile.CompanyId);
        var workplace = TextField(general, "İşyeri", profile.WorkplaceId);
        var device = TextField(general, "Cihaz", profile.DeviceId);
        var format = ComboField(general, "Format", Enum.GetValues<TerminalFormatType>(), profile.FormatType);
        var separator = TextField(general, "Ayraç", profile.Separator);
        var encoding = TextField(general, "Kodlama", profile.Encoding);
        var dateFormat = TextField(general, "Tarih biçimi", profile.DateFormat);
        var timeFormat = TextField(general, "Saat biçimi", profile.TimeFormat);
        var programPath = PathField(general, "Terminal programı", profile.ProgramPath, dialog);
        var transferPath = PathField(general, "Aktarım dosyası", profile.TransferFilePath, dialog);
        var isDefault = CheckField(general, "Kullanım", "Varsayılan profil", profile.IsDefault);

        AddPositionHeader(positions);
        var employee = SliceField(positions, "Personel kodu", profile.EmployeeCode);
        var year = SliceField(positions, "Yıl", profile.Year);
        var month = SliceField(positions, "Ay", profile.Month);
        var day = SliceField(positions, "Gün / Tarih alanı", profile.Day);
        var hour = SliceField(positions, "Saat / Saat alanı", profile.Hour);
        var minute = SliceField(positions, "Dakika", profile.Minute);
        var eventCode = SliceField(positions, "Olay kodu", profile.EventCode);
        var terminalCode = SliceField(positions, "Terminal kodu", profile.TerminalCode);
        AddNote(positions, "Delimited formatta Başlangıç sıfır tabanlı kolon numarasıdır; FixedWidth formatta karakter başlangıcıdır.", 3);

        var entryMapping = MappingField(mappings, "Giriş kodları", profile.EntryCodeMapping);
        var exitMapping = MappingField(mappings, "Çıkış kodları", profile.ExitCodeMapping);
        AddNote(mappings, "Her eşlemeyi kod=değer biçiminde yazın; birden çok eşlemeyi noktalı virgül veya yeni satırla ayırın.", 2);

        void RefreshFormat()
        {
            var selected = (TerminalFormatType)format.SelectedItem!;
            separator.Enabled = selected == TerminalFormatType.Delimited;
            positions.Enabled = selected != TerminalFormatType.Tnf;
            dateFormat.Enabled = selected != TerminalFormatType.Tnf;
            timeFormat.Enabled = selected != TerminalFormatType.Tnf;
        }
        format.SelectedValueChanged += (_, _) => RefreshFormat(); RefreshFormat();

        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 50, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(6) };
        var cancel = new Button { Text = "İptal", Width = 90, DialogResult = DialogResult.Cancel };
        var save = new Button { Text = "Doğrula ve Kaydet", Width = 145 };
        bar.Controls.Add(cancel); bar.Controls.Add(save); dialog.Controls.Add(tabs); dialog.Controls.Add(bar); dialog.CancelButton = cancel;
        TerminalTransferProfile? result = null;
        save.Click += (_, _) =>
        {
            try
            {
                result = profile with
                {
                    Name = name.Text.Trim(), TenantId = tenant.Text.Trim(), CompanyId = company.Text.Trim(), WorkplaceId = workplace.Text.Trim(), DeviceId = device.Text.Trim(),
                    FormatType = (TerminalFormatType)format.SelectedItem!, Separator = separator.Text, Encoding = encoding.Text.Trim(), DateFormat = dateFormat.Text.Trim(), TimeFormat = timeFormat.Text.Trim(),
                    EmployeeCode = ReadSlice(employee), Year = ReadSlice(year), Month = ReadSlice(month), Day = ReadSlice(day), Hour = ReadSlice(hour), Minute = ReadSlice(minute), EventCode = ReadSlice(eventCode), TerminalCode = ReadSlice(terminalCode),
                    EntryCodeMapping = TerminalCodeMappingText.Parse(entryMapping.Text, "Giriş kodları"), ExitCodeMapping = TerminalCodeMappingText.Parse(exitMapping.Text, "Çıkış kodları"),
                    ProgramPath = Optional(programPath.Text), TransferFilePath = Optional(transferPath.Text), IsDefault = isDefault.Checked
                };
                result.Validate(); dialog.DialogResult = DialogResult.OK; dialog.Close();
            }
            catch (Exception exception) { MessageBox.Show(exception.Message, "Profil Doğrulama", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        };
        var accepted = dialog.ShowDialog(owner) == DialogResult.OK && result is not null;
        edited = result ?? profile; return accepted;
    }

    static TableLayoutPanel FormTable(int firstWidth, int lastWidth)
    {
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = lastWidth == 0 ? 2 : 3, AutoScroll = true, Padding = new Padding(12) };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, firstWidth)); panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        if (lastWidth > 0) panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, lastWidth)); return panel;
    }
    static void AddPage(TabControl tabs, string title, Control content) { var page = new TabPage(title) { Padding = new Padding(4) }; page.Controls.Add(content); tabs.TabPages.Add(page); }
    static int AddRow(TableLayoutPanel panel, int height = 38) { var row = panel.RowCount++; panel.RowStyles.Add(new RowStyle(SizeType.Absolute, height)); return row; }
    static TextBox TextField(TableLayoutPanel panel, string label, string? value) { var row = AddRow(panel); AddLabel(panel, label, row); var box = new TextBox { Text = value ?? "", Dock = DockStyle.Fill, Margin = new Padding(3, 7, 3, 4) }; panel.Controls.Add(box, 1, row); return box; }
    static TextBox PathField(TableLayoutPanel panel, string label, string? value, Form owner) { var box = TextField(panel, label, value); var row = panel.GetRow(box); var button = new Button { Text = "Gözat...", Dock = DockStyle.Fill, Margin = new Padding(4) }; button.Click += (_, _) => { using var picker = new OpenFileDialog { FileName = box.Text, CheckFileExists = false }; if (picker.ShowDialog(owner) == DialogResult.OK) box.Text = picker.FileName; }; panel.Controls.Add(button, 2, row); return box; }
    static ComboBox ComboField<T>(TableLayoutPanel panel, string label, T[] values, T selected) { var row = AddRow(panel); AddLabel(panel, label, row); var box = new ComboBox { Dock = DockStyle.Fill, DropDownStyle = ComboBoxStyle.DropDownList, DataSource = values, Margin = new Padding(3, 6, 3, 4) }; box.SelectedItem = selected; panel.Controls.Add(box, 1, row); return box; }
    static CheckBox CheckField(TableLayoutPanel panel, string label, string text, bool value) { var row = AddRow(panel); AddLabel(panel, label, row); var box = new CheckBox { Text = text, Checked = value, Dock = DockStyle.Fill }; panel.Controls.Add(box, 1, row); return box; }
    static void AddPositionHeader(TableLayoutPanel panel) { var row = AddRow(panel); panel.Controls.Add(new Label { Text = "Alan", Font = new Font(panel.Font, FontStyle.Bold), Dock = DockStyle.Fill }, 0, row); panel.Controls.Add(new Label { Text = "Başlangıç / Kolon", Font = new Font(panel.Font, FontStyle.Bold), Dock = DockStyle.Fill }, 1, row); panel.Controls.Add(new Label { Text = "Uzunluk", Font = new Font(panel.Font, FontStyle.Bold), Dock = DockStyle.Fill }, 2, row); }
    static (NumericUpDown Start, NumericUpDown Length) SliceField(TableLayoutPanel panel, string label, FieldSlice? slice) { var row = AddRow(panel); AddLabel(panel, label, row); var start = Number(slice?.Start ?? 0, 0); var length = Number(Math.Max(1, slice?.Length ?? 1), 1); panel.Controls.Add(start, 1, row); panel.Controls.Add(length, 2, row); return (start, length); }
    static NumericUpDown Number(int value, int minimum) => new() { Minimum = minimum, Maximum = 9999, Value = value, Dock = DockStyle.Fill, Margin = new Padding(3, 6, 3, 4) };
    static TextBox MappingField(TableLayoutPanel panel, string label, Dictionary<string, string> value) { var row = AddRow(panel, 78); AddLabel(panel, label + "\n(kod=değer)", row); var box = new TextBox { Text = TerminalCodeMappingText.Format(value), Dock = DockStyle.Fill, Multiline = true, ScrollBars = ScrollBars.Vertical }; panel.Controls.Add(box, 1, row); return box; }
    static void AddNote(TableLayoutPanel panel, string text, int span) { var row = AddRow(panel, 50); var label = new Label { Text = text, AutoSize = true, Dock = DockStyle.Fill, ForeColor = Color.DimGray, Padding = new Padding(2, 8, 2, 2) }; panel.Controls.Add(label, 0, row); panel.SetColumnSpan(label, span); }
    static void AddLabel(TableLayoutPanel panel, string text, int row) => panel.Controls.Add(new Label { Text = text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, row);
    static FieldSlice ReadSlice((NumericUpDown Start, NumericUpDown Length) value) => new((int)value.Start.Value, (int)value.Length.Value);
    static string? Optional(string value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
