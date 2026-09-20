using System.Data;
using System.Text.RegularExpressions;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

public sealed class LegacyTableBrowserForm : Form
{
    static readonly Regex SafeName = new("^[A-Z0-9_]+$", RegexOptions.Compiled);
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly string table;
    readonly bool allowEdit;
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false,
        AllowUserToDeleteRows = false, MultiSelect = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        BackgroundColor = Color.White, RowHeadersWidth = 20
    };
    DataTable? data;

    public LegacyTableBrowserForm(string title, string table, bool allowEdit = true, Size? legacySize = null)
    {
        if (!SafeName.IsMatch(table)) throw new ArgumentException("Geçersiz tablo adı.", nameof(table));
        this.table = table;
        this.allowEdit = allowEdit;
        Text = title;
        Font = new Font("Microsoft Sans Serif", 8.25f);
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = legacySize ?? new Size(640, 430);
        BuildUi();
        Shown += (_, _) => Reload();
    }

    void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Padding = new Padding(6) };
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        root.Controls.Add(grid, 0, 0);

        var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(2, 6, 2, 0) };
        var close = Button("Kapat", 82); close.DialogResult = DialogResult.Cancel;
        var refresh = Button("Yenile", 82); refresh.Click += (_, _) => Reload();
        bar.Controls.Add(close); bar.Controls.Add(refresh);
        if (allowEdit)
        {
            var del = Button("Sil", 72); del.Click += (_, _) => DeleteRow();
            var edit = Button("Değiştir", 90); edit.Click += (_, _) => EditRow(false);
            var add = Button("Yeni Ekle", 94); add.Click += (_, _) => EditRow(true);
            bar.Controls.Add(del); bar.Controls.Add(edit); bar.Controls.Add(add);
        }
        root.Controls.Add(bar, 0, 1);
        Controls.Add(root);
        CancelButton = close;
    }

    static Button Button(string text, int width) => new()
    {
        Text = text, Width = width, Height = 29, ForeColor = Color.Navy,
        Font = new Font("Microsoft Sans Serif", 8.25f, FontStyle.Bold), UseVisualStyleBackColor = true
    };

    void Reload()
    {
        try
        {
            data = db.Query($"select * from {table}");
            grid.DataSource = data;
            foreach (DataGridViewColumn col in grid.Columns)
                if (col.ValueType == typeof(byte[])) col.Visible = false;
        }
        catch (Exception ex)
        {
            grid.DataSource = null;
            MessageBox.Show($"{table} okunamadı: {ex.Message}", Text, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    DataGridViewRow CurrentRow() => grid.CurrentRow ?? throw new InvalidOperationException("Bir kayıt seçin.");

    string KeyColumn()
    {
        if (data is null || data.Columns.Count == 0) throw new InvalidOperationException("Tablo şeması okunamadı.");
        foreach (var name in new[] { "KOD", "ID", "PKNO", "TARIH" }) if (data.Columns.Contains(name)) return name;
        return data.Columns[0].ColumnName;
    }

    void EditRow(bool isNew)
    {
        try
        {
            if (data is null) Reload();
            if (data is null) return;
            var key = KeyColumn();
            DataRow? source = isNew ? null : ((DataRowView)CurrentRow().DataBoundItem).Row;
            using var dlg = new GenericRowDialog(Text + (isNew ? " - Yeni" : " - Değiştir"), data, source, key, isNew);
            if (dlg.ShowDialog(this) != DialogResult.OK) return;

            var values = dlg.Values;
            if (isNew)
            {
                if (data.Columns.Contains("KOD") && IsNumber(data.Columns["KOD"]!.DataType) && (values["KOD"] is null || Convert.ToInt64(values["KOD"]) == 0))
                    values["KOD"] = Convert.ToInt64(db.Scalar($"select coalesce(max(KOD),0)+1 from {table}") ?? 1);
                var cols = values.Where(x => x.Value is not null && SafeName.IsMatch(x.Key)).Select(x => x.Key).ToArray();
                if (cols.Length == 0) throw new InvalidOperationException("Kaydedilecek alan yok.");
                var sql = $"insert into {table} ({string.Join(',', cols)}) values ({string.Join(',', cols.Select((_, i) => "@P" + i))})";
                var ps = cols.Select((c, i) => new FbParameter("@P" + i, values[c] ?? DBNull.Value)).ToArray();
                db.Execute(sql, ps);
            }
            else
            {
                var oldKey = source![key];
                var cols = values.Keys.Where(c => !c.Equals(key, StringComparison.OrdinalIgnoreCase) && SafeName.IsMatch(c)).ToArray();
                var sql = $"update {table} set {string.Join(',', cols.Select((c, i) => c + "=@P" + i))} where {key}=@KEY";
                var ps = cols.Select((c, i) => new FbParameter("@P" + i, values[c] ?? DBNull.Value)).Append(new FbParameter("@KEY", oldKey)).ToArray();
                db.Execute(sql, ps);
            }
            Reload();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    void DeleteRow()
    {
        try
        {
            if (data is null) return;
            var row = (DataRowView)CurrentRow().DataBoundItem;
            var key = KeyColumn();
            if (MessageBox.Show("Seçili kayıt silinsin mi?", Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            db.Execute($"delete from {table} where {key}=@K", new FbParameter("@K", row[key]));
            Reload();
        }
        catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    static bool IsNumber(Type t) => t == typeof(short) || t == typeof(int) || t == typeof(long) || t == typeof(decimal) || t == typeof(double) || t == typeof(float);

    sealed class GenericRowDialog : Form
    {
        readonly Dictionary<string, Control> editors = new(StringComparer.OrdinalIgnoreCase);
        readonly DataTable schema;
        readonly string key;
        readonly bool isNew;
        public Dictionary<string, object?> Values { get; } = new(StringComparer.OrdinalIgnoreCase);

        public GenericRowDialog(string title, DataTable schema, DataRow? source, string key, bool isNew)
        {
            this.schema = schema; this.key = key; this.isNew = isNew;
            Text = title; StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false; Font = new Font("Microsoft Sans Serif", 8.25f);
            ClientSize = new Size(470, Math.Min(650, Math.Max(180, schema.Columns.Count * 31 + 70)));
            Build(source);
        }

        void Build(DataRow? source)
        {
            var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, AutoScroll = true, Padding = new Padding(8) };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150)); root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
            int row = 0;
            foreach (DataColumn col in schema.Columns)
            {
                if (col.DataType == typeof(byte[])) continue;
                root.RowStyles.Add(new RowStyle(SizeType.Absolute,29));
                root.Controls.Add(new Label { Text = col.ColumnName, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft }, 0, row);
                Control editor;
                if (col.DataType == typeof(DateTime))
                    editor = new DateTimePicker { Dock = DockStyle.Fill, Format = DateTimePickerFormat.Custom, CustomFormat = "dd.MM.yyyy HH:mm", ShowCheckBox = col.AllowDBNull };
                else if (col.DataType == typeof(bool)) editor = new CheckBox { Dock = DockStyle.Left };
                else editor = new TextBox { Dock = DockStyle.Fill };
                if (!isNew && col.ColumnName.Equals(key, StringComparison.OrdinalIgnoreCase)) editor.Enabled = false;
                if (source is not null && source[col] != DBNull.Value)
                {
                    if (editor is DateTimePicker dp) dp.Value = Convert.ToDateTime(source[col]);
                    else if (editor is CheckBox cb) cb.Checked = Convert.ToBoolean(source[col]);
                    else editor.Text = Convert.ToString(source[col]) ?? "";
                }
                editors[col.ColumnName] = editor; root.Controls.Add(editor, 1, row++);
            }
            root.RowStyles.Add(new RowStyle(SizeType.Absolute,42));
            var bar = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
            var cancel = Button("Vazgeç", 82); cancel.DialogResult = DialogResult.Cancel;
            var save = Button("Kaydet", 82); save.Click += (_, _) => Save();
            bar.Controls.Add(cancel); bar.Controls.Add(save); root.Controls.Add(bar,0,row); root.SetColumnSpan(bar,2);
            Controls.Add(root); CancelButton = cancel; AcceptButton = save;
        }

        void Save()
        {
            try
            {
                Values.Clear();
                foreach (DataColumn col in schema.Columns)
                {
                    if (!editors.TryGetValue(col.ColumnName, out var editor)) continue;
                    object? value;
                    if (editor is DateTimePicker dp) value = dp.ShowCheckBox && !dp.Checked ? null : dp.Value;
                    else if (editor is CheckBox cb) value = cb.Checked;
                    else
                    {
                        var s = editor.Text.Trim();
                        if (s.Length == 0) value = null;
                        else if (col.DataType == typeof(short)) value = short.Parse(s);
                        else if (col.DataType == typeof(int)) value = int.Parse(s);
                        else if (col.DataType == typeof(long)) value = long.Parse(s);
                        else if (col.DataType == typeof(decimal)) value = decimal.Parse(s);
                        else if (col.DataType == typeof(double)) value = double.Parse(s);
                        else if (col.DataType == typeof(float)) value = float.Parse(s);
                        else value = s;
                    }
                    Values[col.ColumnName] = value;
                }
                DialogResult = DialogResult.OK; Close();
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }
    }
}
