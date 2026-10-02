using System.Reflection;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool modernTabLayoutApplied;

    void ApplyModernTabLayoutAndPerformance()
    {
        if (modernTabLayoutApplied) return;
        modernTabLayoutApplied = true;

        try
        {
            ReplacePeriodHeader("Giriş / Çıkış", periodG, gFrom, gTo);
            ReplacePeriodHeader("İzinler", periodI, iFrom, iTo);
            ReplacePeriodHeader("Kazanç / Kesinti", periodE, eFrom, eTo);
            ReplaceRecordActionBar("Giriş / Çıkış", gGiris);
            ReplaceRecordActionBar("İzinler", gIzin);
            ReplaceRecordActionBar("Kazanç / Kesinti", gEkk);
            ReplacePaymentHeader();
            InstallRecordContextMenus();
            EnableSmoothGrid(list);
            EnableSmoothGrid(gGiris);
            EnableSmoothGrid(gIzin);
            EnableSmoothGrid(gEkk);
            EnableSmoothGrid(gBilgi);
            EnableSmoothGrid(gOdeme);
        }
        catch
        {
            // Görsel iyileştirme ana işleyişi engellememeli.
        }
    }

    void ReplacePeriodHeader(string tabTitle, ComboBox periodBox, DateTimePicker from, DateTimePicker to)
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals(tabTitle, StringComparison.OrdinalIgnoreCase));
        if (page?.Controls.OfType<TableLayoutPanel>().FirstOrDefault() is not TableLayoutPanel layout) return;
        if (layout.RowStyles.Count < 1) return;

        var old = layout.GetControlFromPosition(0, 0);
        if (old is not null) layout.Controls.Remove(old);
        layout.RowStyles[0].SizeType = SizeType.Absolute;
        layout.RowStyles[0].Height = 72;

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 7,
            RowCount = 2,
            BackColor = Color.White,
            Padding = new Padding(10, 6, 10, 5),
            Margin = Padding.Empty
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 82));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 24));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 108));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 24));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 108));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        header.Controls.Add(HeaderLabel("Dönem"), 0, 0);
        periodBox.Dock = DockStyle.Fill;
        periodBox.Margin = new Padding(0, 1, 8, 2);
        periodBox.FlatStyle = FlatStyle.Flat;
        header.Controls.Add(periodBox, 1, 0);

        var show = ModernHeaderButton("Seçili Dönemi Göster", 160);
        show.Dock = DockStyle.Right;
        show.Click += (_, _) => RefreshSelectedTab();
        header.Controls.Add(show, 6, 0);
        header.SetRowSpan(show, 2);

        header.Controls.Add(HeaderLabel("Tarih Aralığı"), 0, 1);
        from.Dock = DockStyle.Fill;
        from.Margin = new Padding(0, 1, 0, 1);
        to.Dock = DockStyle.Fill;
        to.Margin = new Padding(0, 1, 0, 1);
        header.Controls.Add(from, 1, 1);
        header.Controls.Add(new Label { Text = "—", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(90, 105, 125) }, 2, 1);
        header.Controls.Add(to, 3, 1);
        header.SetColumnSpan(to, 2);

        layout.Controls.Add(header, 0, 0);
        old?.Dispose();
    }

    void ReplaceRecordActionBar(string tabTitle, DataGridView grid)
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals(tabTitle, StringComparison.OrdinalIgnoreCase));
        if (page?.Controls.OfType<TableLayoutPanel>().FirstOrDefault() is not TableLayoutPanel layout) return;
        if (layout.RowStyles.Count < 3) return;

        var old = layout.GetControlFromPosition(0, 2);
        if (old is not null) layout.Controls.Remove(old);
        layout.RowStyles[2].SizeType = SizeType.Absolute;
        layout.RowStyles[2].Height = 54;

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(8, 9, 12, 6),
            BackColor = Color.FromArgb(248, 250, 253),
            Margin = Padding.Empty
        };

        foreach (var text in new[] { "Tümünü Sil", "Sil", "Değiştir", "Yeni Ekle" })
        {
            var button = new Button
            {
                Text = text,
                Name = $"crud_{grid.Name}_{text.Replace(" ", string.Empty)}",
                Width = text == "Tümünü Sil" ? 116 : 104,
                Height = 34,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.White,
                ForeColor = text.Contains("Sil", StringComparison.OrdinalIgnoreCase) ? Color.FromArgb(173, 47, 47) : Color.FromArgb(31, 78, 139),
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Image = ClassicGlyph(text),
                ImageAlign = ContentAlignment.MiddleLeft,
                TextImageRelation = TextImageRelation.ImageBeforeText,
                Cursor = Cursors.Hand,
                Margin = new Padding(5, 0, 0, 0)
            };
            button.FlatAppearance.BorderColor = Color.FromArgb(210, 219, 231);
            bar.Controls.Add(button);
        }

        layout.Controls.Add(bar, 0, 2);
        old?.Dispose();
    }

    void InstallRecordContextMenus()
    {
        InstallRecordContextMenu(gGiris, AddGiris, EditGiris, DeleteGiris, DeleteAllGiris);
        InstallRecordContextMenu(gIzin, AddIzinFull, EditIzinFull, DeleteIzin, DeleteAllIzin);
        InstallRecordContextMenu(gEkk, AddEkkFull, EditEkkFull, DeleteEkk, DeleteAllEkk);
    }

    void InstallRecordContextMenu(DataGridView grid, Action add, Action edit, Action delete, Action deleteAll)
    {
        var menu = new ContextMenuStrip { Font = new Font("Segoe UI", 9f) };
        var miAdd = new ToolStripMenuItem("Yeni Ekle", ClassicGlyph("Yeni Ekle"), (_, _) => add());
        var miEdit = new ToolStripMenuItem("Değiştir", ClassicGlyph("Değiştir"), (_, _) => edit());
        var miDelete = new ToolStripMenuItem("Sil", ClassicGlyph("Sil"), (_, _) => delete());
        var miDeleteAll = new ToolStripMenuItem("Tümünü Sil", ClassicGlyph("Tümünü Sil"), (_, _) => deleteAll());
        menu.Items.AddRange([miAdd, miEdit, miDelete, new ToolStripSeparator(), miDeleteAll]);
        menu.Opening += (_, _) =>
        {
            var hasRow = grid.CurrentRow is not null && !grid.CurrentRow.IsNewRow;
            var hasRows = grid.Rows.Cast<DataGridViewRow>().Any(r => !r.IsNewRow);
            miAdd.Enabled = !string.IsNullOrWhiteSpace(currentPk);
            miEdit.Enabled = hasRow;
            miDelete.Enabled = hasRow;
            miDeleteAll.Enabled = hasRows;
        };
        grid.ContextMenuStrip = menu;
        grid.CellMouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Right && e.RowIndex >= 0 && e.ColumnIndex >= 0)
            {
                grid.ClearSelection();
                grid.Rows[e.RowIndex].Selected = true;
                grid.CurrentCell = grid.Rows[e.RowIndex].Cells[e.ColumnIndex];
            }
        };
        grid.CellDoubleClick += (_, e) => { if (e.RowIndex >= 0) edit(); };
    }

    void ReplacePaymentHeader()
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals("Ödemeler", StringComparison.OrdinalIgnoreCase));
        if (page?.Controls.OfType<TableLayoutPanel>().FirstOrDefault() is not TableLayoutPanel layout) return;
        if (layout.RowStyles.Count < 1) return;

        var old = layout.GetControlFromPosition(0, 0);
        if (old is not null) layout.Controls.Remove(old);
        layout.RowStyles[0].SizeType = SizeType.Absolute;
        layout.RowStyles[0].Height = 56;

        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 1,
            BackColor = Color.White,
            Padding = new Padding(12, 9, 12, 8),
            Margin = Padding.Empty
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 70));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 250));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 108));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        header.Controls.Add(HeaderLabel("Dönem"), 0, 0);
        periodO.Dock = DockStyle.Fill;
        periodO.Margin = new Padding(0, 1, 12, 1);
        periodO.FlatStyle = FlatStyle.Flat;
        header.Controls.Add(periodO, 1, 0);

        var refresh = ModernHeaderButton("Yenile", 96);
        refresh.Dock = DockStyle.Fill;
        refresh.Margin = new Padding(0, 0, 8, 0);
        refresh.Click += (_, _) => RefreshSelectedTab();
        header.Controls.Add(refresh, 2, 0);

        layout.Controls.Add(header, 0, 0);
        old?.Dispose();
    }

    static Label HeaderLabel(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(48, 69, 96),
        Margin = Padding.Empty
    };

    static Button ModernHeaderButton(string text, int width)
    {
        var button = new Button
        {
            Text = text,
            Width = width,
            Height = 32,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(31, 111, 235),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderSize = 0;
        return button;
    }

    static void EnableSmoothGrid(DataGridView grid)
    {
        typeof(DataGridView)
            .GetProperty("DoubleBuffered", BindingFlags.Instance | BindingFlags.NonPublic)?
            .SetValue(grid, true);
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        grid.RowTemplate.Height = Math.Max(20, grid.RowTemplate.Height);
    }
}
