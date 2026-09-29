namespace HKN.Personel.Native;

public static class PdksTheme
{
    static readonly HashSet<Form> ThemedForms = [];
    static readonly Color Surface = Color.White;
    static readonly Color Canvas = Color.FromArgb(246, 249, 253);
    static readonly Color Border = Color.FromArgb(216, 225, 236);
    static readonly Color Text = Color.FromArgb(27, 44, 68);
    static readonly Color Muted = Color.FromArgb(88, 103, 124);
    static readonly Color Primary = Color.FromArgb(36, 107, 230);

    static ThemeMessageFilter? filter;

    public static void Install()
    {
        if (filter is not null) return;
        filter = new ThemeMessageFilter();
        Application.AddMessageFilter(filter);
    }

    sealed class ThemeMessageFilter : IMessageFilter
    {
        const int WmShowWindow = 0x0018;
        public bool PreFilterMessage(ref Message m)
        {
            if (m.Msg != WmShowWindow || m.WParam == IntPtr.Zero) return false;
            if (Control.FromHandle(m.HWnd) is not Form form || form.IsDisposed || ThemedForms.Contains(form)) return false;
            Apply(form);
            ThemedForms.Add(form);
            return false;
        }
    }

    public static void Apply(Form form)
    {
        if (form is MainShellForm or LoginForm) return;
        form.Font = new Font("Segoe UI", 9f);
        form.BackColor = Canvas;
        form.ForeColor = Text;
        form.AutoScaleMode = AutoScaleMode.Dpi;
        if (form.FormBorderStyle != FormBorderStyle.None)
        {
            form.FormBorderStyle = FormBorderStyle.Sizable;
            form.MaximizeBox = true;
            form.MinimizeBox = true;
            form.MinimumSize = new Size(Math.Min(Math.Max(form.Width, 680), 980), Math.Min(Math.Max(form.Height, 480), 720));
            if (form.Width < 760 && form.Height > 360) form.Width = 820;
            if (form.Height < 560 && form.Width > 700) form.Height = 600;
        }
        MakeAdaptive(form);
        StyleControls(form.Controls);
    }

    static void MakeAdaptive(Form form) => AdaptChildren(form);

    static void AdaptChildren(Control parent)
    {
        var baseSize = parent.ClientSize;
        foreach (Control c in parent.Controls)
        {
            if (c.Dock == DockStyle.None && baseSize.Width > 0 && baseSize.Height > 0)
            {
                var anchor = c.Anchor;
                if (c.Right >= baseSize.Width - 70) anchor |= AnchorStyles.Right;
                if (c.Bottom >= baseSize.Height - 70) anchor |= AnchorStyles.Bottom;
                if (c.Width >= baseSize.Width * .50) anchor |= AnchorStyles.Left | AnchorStyles.Right;
                if (c.Height >= baseSize.Height * .42) anchor |= AnchorStyles.Top | AnchorStyles.Bottom;
                if (c is TabControl or DataGridView or ListBox or TreeView)
                    anchor |= AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right | AnchorStyles.Bottom;
                c.Anchor = anchor;
            }
            if (c.HasChildren) AdaptChildren(c);
        }
    }

    static void StyleControls(Control.ControlCollection controls)
    {
        foreach (Control c in controls)
        {
            switch (c)
            {
                case Button b: StyleButton(b); break;
                case TextBox t:
                    t.BorderStyle = BorderStyle.FixedSingle;
                    t.BackColor = Color.White;
                    t.ForeColor = Text;
                    break;
                case ComboBox cb:
                    cb.FlatStyle = FlatStyle.Flat;
                    cb.BackColor = Color.White;
                    cb.ForeColor = Text;
                    break;
                case DateTimePicker dt:
                    dt.CalendarForeColor = Text;
                    dt.CalendarMonthBackground = Color.White;
                    break;
                case DataGridView grid: StyleGrid(grid); break;
                case TabControl tabs: StyleTabs(tabs); break;
                case GroupBox group:
                    group.ForeColor = Color.FromArgb(34, 70, 120);
                    group.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
                    break;
                case Label label:
                    if (label.ForeColor == SystemColors.ControlText) label.ForeColor = Text;
                    break;
                case ListBox list:
                    list.BorderStyle = BorderStyle.FixedSingle;
                    list.BackColor = Color.White;
                    list.ForeColor = Text;
                    break;
                case Panel panel when panel.BackColor == SystemColors.Control: panel.BackColor = Surface; break;
                case TableLayoutPanel table when table.BackColor == SystemColors.Control: table.BackColor = Surface; break;
                case FlowLayoutPanel flow when flow.BackColor == SystemColors.Control: flow.BackColor = Surface; break;
                case SplitContainer split:
                    split.BackColor = Border;
                    split.Panel1.BackColor = Surface;
                    split.Panel2.BackColor = Surface;
                    split.SplitterWidth = Math.Max(split.SplitterWidth, 6);
                    break;
            }
            if (c.HasChildren) StyleControls(c.Controls);
        }
    }

    static void StyleButton(Button b)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderColor = Border;
        b.FlatAppearance.BorderSize = 1;
        b.BackColor = Color.White;
        b.ForeColor = Text;
        b.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        b.Cursor = Cursors.Hand;
        b.Padding = new Padding(6, 1, 6, 1);

        var text = (b.Text ?? string.Empty).Trim();
        if (text.Contains("Kaydet", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("Ekle", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("Hesapla", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("Aktar", StringComparison.OrdinalIgnoreCase) ||
            text.Contains("Giriş", StringComparison.OrdinalIgnoreCase))
        {
            b.BackColor = Primary;
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = Primary;
        }
        else if (text.Contains("Sil", StringComparison.OrdinalIgnoreCase))
        {
            b.BackColor = Color.FromArgb(255, 241, 240);
            b.ForeColor = Color.FromArgb(185, 56, 48);
            b.FlatAppearance.BorderColor = Color.FromArgb(244, 195, 190);
        }
        else if (text.Contains("Kapat", StringComparison.OrdinalIgnoreCase))
        {
            b.BackColor = Color.FromArgb(241, 244, 248);
            b.ForeColor = Muted;
        }
    }

    static void StyleTabs(TabControl tabs)
    {
        tabs.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
        tabs.SizeMode = TabSizeMode.Normal;
        tabs.Padding = new Point(16, 8);
        tabs.Multiline = false;
        tabs.HotTrack = true;
        foreach (TabPage page in tabs.TabPages) page.BackColor = Surface;
        tabs.DrawItem += (_, e) =>
        {
            if (e.Index < 0 || e.Index >= tabs.TabPages.Count) return;
            var selected = e.Index == tabs.SelectedIndex;
            var rect = e.Bounds;
            var back = selected ? Color.FromArgb(232, 241, 255) : Color.FromArgb(248, 250, 253);
            var fore = selected ? Primary : Muted;
            using var brush = new SolidBrush(back);
            using var pen = new Pen(selected ? Color.FromArgb(165, 198, 242) : Border);
            e.Graphics.FillRectangle(brush, rect);
            e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
            TextRenderer.DrawText(e.Graphics, tabs.TabPages[e.Index].Text, tabs.Font, rect, fore,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            if (selected)
            {
                using var accent = new SolidBrush(Primary);
                e.Graphics.FillRectangle(accent, rect.Left + 6, rect.Bottom - 3, Math.Max(4, rect.Width - 12), 3);
            }
        };
    }

    static void StyleGrid(DataGridView grid)
    {
        grid.BackgroundColor = Color.White;
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = Color.FromArgb(228, 234, 242);
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
        grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(236, 243, 252);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.FromArgb(31, 67, 116);
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = Color.FromArgb(236, 243, 252);
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = Color.FromArgb(31, 67, 116);
        grid.DefaultCellStyle.BackColor = Color.White;
        grid.DefaultCellStyle.ForeColor = Text;
        grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(221, 236, 255);
        grid.DefaultCellStyle.SelectionForeColor = Text;
        grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(249, 251, 254);
        grid.RowHeadersVisible = false;
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        grid.RowTemplate.Height = Math.Max(grid.RowTemplate.Height, 28);
        grid.ColumnHeadersHeight = Math.Max(grid.ColumnHeadersHeight, 31);
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.MultiSelect = false;
        grid.AllowUserToOrderColumns = true;
        grid.AllowUserToResizeColumns = true;

        if (!string.IsNullOrWhiteSpace(grid.Name) &&
            !string.Equals(grid.Name, "BordroGrid", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(grid.Name, "OperationalReportGrid", StringComparison.OrdinalIgnoreCase))
        {
            GridLayoutPersistence.AttachAuto(grid);
        }

        EnsureGridContextMenu(grid);
    }

    static void EnsureGridContextMenu(DataGridView grid)
    {
        var menu = grid.ContextMenuStrip ?? new ContextMenuStrip { Font = new Font("Segoe UI", 9f) };
        if (menu.Items.OfType<ToolStripItem>().Any(x => string.Equals(x.Name, "KY_GRID_COPY_CELL", StringComparison.Ordinal)))
        {
            grid.ContextMenuStrip = menu;
            return;
        }

        if (menu.Items.Count > 0 && menu.Items[^1] is not ToolStripSeparator) menu.Items.Add(new ToolStripSeparator());
        var copyCell = new ToolStripMenuItem("Hücreyi Kopyala") { Name = "KY_GRID_COPY_CELL" };
        copyCell.Click += (_, _) =>
        {
            if (grid.CurrentCell?.Value is object value)
                try { Clipboard.SetText(Convert.ToString(value) ?? string.Empty); } catch { }
        };
        var copyRow = new ToolStripMenuItem("Satırı Kopyala") { Name = "KY_GRID_COPY_ROW" };
        copyRow.Click += (_, _) =>
        {
            if (grid.CurrentRow is null) return;
            var values = grid.Columns.Cast<DataGridViewColumn>()
                .Where(c => c.Visible)
                .OrderBy(c => c.DisplayIndex)
                .Select(c => Convert.ToString(grid.CurrentRow.Cells[c.Index].Value) ?? string.Empty);
            try { Clipboard.SetText(string.Join("\t", values)); } catch { }
        };
        var selectAll = new ToolStripMenuItem("Tümünü Seç") { Name = "KY_GRID_SELECT_ALL" };
        selectAll.Click += (_, _) => grid.SelectAll();
        var lockColumn = new ToolStripMenuItem("Sütunu Kilitle / Kilidi Aç") { Name = "KY_GRID_LOCK_COLUMN" };
        lockColumn.Click += (_, _) =>
        {
            var column = grid.CurrentCell?.OwningColumn;
            if (column is null) return;
            column.Frozen = !column.Frozen;
            column.HeaderCell.Style.BackColor = column.Frozen ? Color.FromArgb(255, 244, 203) : Color.FromArgb(236, 243, 252);
            column.HeaderCell.Style.ForeColor = Color.FromArgb(31, 67, 116);
        };
        menu.Items.Add(copyCell);
        menu.Items.Add(copyRow);
        menu.Items.Add(selectAll);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(lockColumn);
        grid.ContextMenuStrip = menu;

        grid.CellMouseDown += (_, e) =>
        {
            if (e.Button != MouseButtons.Right || e.RowIndex < 0 || e.ColumnIndex < 0) return;
            grid.ClearSelection();
            grid.Rows[e.RowIndex].Selected = true;
            grid.CurrentCell = grid.Rows[e.RowIndex].Cells[e.ColumnIndex];
        };
    }
}
