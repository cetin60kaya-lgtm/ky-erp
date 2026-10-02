namespace HKN.Personel.Native;

public partial class PersonelForm
{
    void RepairRecordActionBars()
    {
        RepairRecordActionBar("Giriş / Çıkış", gGiris, AddGiris, EditGiris, DeleteGiris, DeleteAllGiris);
        RepairRecordActionBar("İzinler", gIzin, AddIzinFull, EditIzinFull, DeleteIzin, DeleteAllIzin);
        RepairRecordActionBar("Kazanç / Kesinti", gEkk, AddEkkFull, EditEkkFull, DeleteEkk, DeleteAllEkk);
    }

    void RepairRecordActionBar(string tabTitle, DataGridView grid, Action add, Action edit, Action delete, Action deleteAll)
    {
        var page = tabs.TabPages.Cast<TabPage>()
            .FirstOrDefault(x => x.Text.Equals(tabTitle, StringComparison.OrdinalIgnoreCase));
        if (page is null) return;

        var layout = page.Controls.OfType<TableLayoutPanel>().FirstOrDefault();
        if (layout is null) return;

        layout.RowCount = 3;
        while (layout.RowStyles.Count < 3) layout.RowStyles.Add(new RowStyle());
        layout.RowStyles[0].SizeType = SizeType.Absolute;
        layout.RowStyles[0].Height = Math.Max(72, layout.RowStyles[0].Height);
        layout.RowStyles[1].SizeType = SizeType.Percent;
        layout.RowStyles[1].Height = 100;
        layout.RowStyles[2].SizeType = SizeType.Absolute;
        layout.RowStyles[2].Height = 58;

        var old = layout.GetControlFromPosition(0, 2);
        if (old is not null)
        {
            layout.Controls.Remove(old);
            old.Dispose();
        }

        var bar = new FlowLayoutPanel
        {
            Name = "RecordActionBar",
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(10, 10, 18, 7),
            Margin = Padding.Empty,
            BackColor = Color.FromArgb(247, 249, 252)
        };

        var all = RecordActionButton("Tümünü Sil", deleteAll, destructive: true);
        var del = RecordActionButton("Sil", delete, destructive: true);
        var change = RecordActionButton("Değiştir", edit);
        var create = RecordActionButton("Yeni Ekle", add, primary: true);
        bar.Controls.AddRange([all, del, change, create]);
        layout.Controls.Add(bar, 0, 2);

        var readOnly = Tag is string tag && tag.Contains("READONLY", StringComparison.OrdinalIgnoreCase);
        void UpdateState()
        {
            var hasRows = grid.Rows.Cast<DataGridViewRow>().Any(r => !r.IsNewRow);
            var selected = grid.CurrentRow is not null && !grid.CurrentRow.IsNewRow;
            create.Enabled = !readOnly;
            change.Enabled = !readOnly && selected;
            del.Enabled = !readOnly && selected;
            all.Enabled = !readOnly && hasRows;
        }

        grid.SelectionChanged += (_, _) => UpdateState();
        grid.DataBindingComplete += (_, _) => UpdateState();
        grid.CellDoubleClick += (_, e) =>
        {
            if (!readOnly && e.RowIndex >= 0) edit();
        };

        var menu = new ContextMenuStrip();
        var miAdd = new ToolStripMenuItem("Yeni Ekle");
        var miEdit = new ToolStripMenuItem("Değiştir");
        var miDelete = new ToolStripMenuItem("Sil");
        var miDeleteAll = new ToolStripMenuItem("Tümünü Sil");
        miAdd.Click += (_, _) => add();
        miEdit.Click += (_, _) => edit();
        miDelete.Click += (_, _) => delete();
        miDeleteAll.Click += (_, _) => deleteAll();
        menu.Items.AddRange([miAdd, miEdit, miDelete, new ToolStripSeparator(), miDeleteAll]);
        menu.Opening += (_, _) =>
        {
            var hasRows = grid.Rows.Cast<DataGridViewRow>().Any(r => !r.IsNewRow);
            var selected = grid.CurrentRow is not null && !grid.CurrentRow.IsNewRow;
            miAdd.Enabled = !readOnly;
            miEdit.Enabled = !readOnly && selected;
            miDelete.Enabled = !readOnly && selected;
            miDeleteAll.Enabled = !readOnly && hasRows;
        };
        grid.ContextMenuStrip = menu;
        UpdateState();
        bar.BringToFront();
    }

    static Button RecordActionButton(string text, Action action, bool primary = false, bool destructive = false)
    {
        var button = new Button
        {
            Text = text,
            Width = text == "Tümünü Sil" ? 112 : 102,
            Height = 34,
            Margin = new Padding(8, 0, 0, 0),
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Color.FromArgb(31, 111, 235) : Color.White,
            ForeColor = primary ? Color.White : destructive ? Color.FromArgb(177, 42, 42) : Color.FromArgb(35, 61, 90),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderColor = primary
            ? Color.FromArgb(31, 111, 235)
            : destructive ? Color.FromArgb(226, 183, 183) : Color.FromArgb(205, 216, 231);
        button.Click += (_, _) => action();
        return button;
    }
}
