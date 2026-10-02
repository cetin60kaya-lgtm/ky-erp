namespace HKN.Personel.Native;

public static class PdksTheme
{
    static readonly HashSet<Form> ThemedForms = [];
    static readonly HashSet<TabControl> StyledTabs = [];
    static ThemeMessageFilter? filter;

    public static void Install()
    {
        if (filter is not null) return;
        filter = new ThemeMessageFilter();
        Application.AddMessageFilter(filter);
        PdksAppearance.Changed += (_,_) => ReapplyOpenForms();
    }

    public static void ReapplyOpenForms()
    {
        ThemedForms.Clear();
        foreach (Form form in Application.OpenForms.Cast<Form>().ToArray())
        {
            if (form.IsDisposed || form is MainShellForm or LoginForm or ThemeSettingsForm) continue;
            Apply(form);
            form.Invalidate(true);
        }
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
        if (form is MainShellForm or LoginForm or ThemeSettingsForm) return;
        var p = PdksAppearance.Current;

        form.Font = new Font("Segoe UI", 9.2f);
        form.BackColor = p.Canvas;
        form.ForeColor = p.Text;
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
        StyleControls(form.Controls, p);
        if (form.GetType().Name.Equals("LegacyPuantajForm", StringComparison.Ordinal)) PolishPuantaj(form, p);
    }

    static void MakeAdaptive(Form form) => AdaptChildren(form);

    static void AdaptChildren(Control parent)
    {
        var baseSize = parent.ClientSize;
        foreach (Control c in parent.Controls)
        {
            if (c.Dock == DockStyle.None && c is not Button && baseSize.Width > 0 && baseSize.Height > 0)
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

    static IEnumerable<Control> Descendants(Control parent)
    {
        foreach (Control child in parent.Controls)
        {
            yield return child;
            foreach (var nested in Descendants(child)) yield return nested;
        }
    }

    static void PolishPuantaj(Form form, PdksPalette p)
    {
        form.Text = "Puantaj Kontrol ve Yeniden Hesaplama";
        foreach (var button in Descendants(form).OfType<Button>())
        {
            if (string.Equals(button.Text, "Hesapla", StringComparison.OrdinalIgnoreCase))
                button.Text = "Seçimi Yeniden Hesapla";
            else if (button.Text.Contains("Aylık Puantajı Hesapla", StringComparison.OrdinalIgnoreCase))
                button.Text = "Ayı Yeniden Hesapla";
        }

        foreach (var progress in Descendants(form).OfType<ProgressBar>())
        {
            progress.Dock = DockStyle.Top;
            progress.Height = 20;
            progress.Margin = new Padding(0, 8, 0, 4);
            if (progress.Parent is TableLayoutPanel table)
            {
                var row = table.GetRow(progress);
                if (row >= 0 && row < table.RowStyles.Count)
                {
                    table.RowStyles[row].SizeType = SizeType.Absolute;
                    table.RowStyles[row].Height = 32;
                }
            }
        }

        var tabs = Descendants(form).OfType<TabControl>().FirstOrDefault();
        if (tabs is null) return;
        foreach (TabPage page in tabs.TabPages)
        {
            if (page.Controls.OfType<Label>().Any(x => string.Equals(x.Name, "KY_PUANTAJ_INFO", StringComparison.Ordinal))) continue;
            var banner = new Label
            {
                Name = "KY_PUANTAJ_INFO",
                Text = "Puantaj; giriş-çıkış, izin, vardiya ve tatil kayıtlarından oluşur. Kaynak kaydı düzeltin; bu ekran seçili aralık için kontrol ve gerektiğinde yeniden hesaplama içindir.",
                Dock = DockStyle.Top,
                Height = 42,
                Padding = new Padding(12, 8, 12, 6),
                BackColor = p.PrimarySoft,
                ForeColor = p.Primary,
                Font = new Font("Segoe UI", 8.8f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft
            };
            page.Controls.Add(banner);
            banner.BringToFront();
        }
    }

    static void StyleControls(Control.ControlCollection controls, PdksPalette p)
    {
        foreach (Control c in controls)
        {
            switch (c)
            {
                case Button b:
                    StyleButton(b, p);
                    break;
                case TextBox t:
                    t.BorderStyle = BorderStyle.FixedSingle;
                    t.BackColor = t.ReadOnly ? p.SurfaceAlt : p.Input;
                    t.ForeColor = p.Text;
                    break;
                case MaskedTextBox mt:
                    mt.BorderStyle = BorderStyle.FixedSingle;
                    mt.BackColor = mt.ReadOnly ? p.SurfaceAlt : p.Input;
                    mt.ForeColor = p.Text;
                    break;
                case RichTextBox rt:
                    rt.BorderStyle = BorderStyle.FixedSingle;
                    rt.BackColor = rt.ReadOnly ? p.SurfaceAlt : p.Input;
                    rt.ForeColor = p.Text;
                    break;
                case ComboBox cb:
                    cb.FlatStyle = FlatStyle.Flat;
                    cb.BackColor = p.Input;
                    cb.ForeColor = p.Text;
                    break;
                case NumericUpDown num:
                    num.BackColor = p.Input;
                    num.ForeColor = p.Text;
                    break;
                case DateTimePicker dt:
                    dt.CalendarForeColor = p.Text;
                    dt.CalendarMonthBackground = p.Surface;
                    dt.BackColor = p.Input;
                    dt.ForeColor = p.Text;
                    break;
                case DataGridView grid:
                    StyleGrid(grid, p);
                    break;
                case TabControl tabs:
                    StyleTabs(tabs);
                    break;
                case GroupBox group:
                    group.ForeColor = p.Primary;
                    group.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
                    group.BackColor = p.Surface;
                    break;
                case Label label:
                    StyleLabel(label, p);
                    break;
                case CheckBox check:
                    check.ForeColor = p.Text;
                    if (NeutralBack(check.BackColor)) check.BackColor = p.Surface;
                    break;
                case RadioButton radio:
                    radio.ForeColor = p.Text;
                    if (NeutralBack(radio.BackColor)) radio.BackColor = p.Surface;
                    break;
                case ListBox list:
                    list.BorderStyle = BorderStyle.FixedSingle;
                    list.BackColor = p.Surface;
                    list.ForeColor = p.Text;
                    break;
                case TreeView tree:
                    tree.BackColor = p.Surface;
                    tree.ForeColor = p.Text;
                    break;
                case TableLayoutPanel table:
                    table.BackColor = MapBack(table.BackColor, p);
                    break;
                case FlowLayoutPanel flow:
                    flow.BackColor = MapBack(flow.BackColor, p);
                    break;
                case Panel panel:
                    panel.BackColor = MapBack(panel.BackColor, p);
                    break;
                case SplitContainer split:
                    split.BackColor = p.Border;
                    split.Panel1.BackColor = p.Surface;
                    split.Panel2.BackColor = p.Surface;
                    split.SplitterWidth = Math.Max(split.SplitterWidth, 6);
                    break;
            }
            if (c.HasChildren) StyleControls(c.Controls, p);
        }
    }

    static void StyleLabel(Label label, PdksPalette p)
    {
        if (IsStatusColor(label.ForeColor)) return;
        var current = label.ForeColor;
        if (current == Color.FromArgb(100,116,139) || current == Color.FromArgb(88,103,124) || current == Color.Gray || current == Color.DimGray)
            label.ForeColor = p.Muted;
        else if (current == Color.Blue || current == Color.Navy || current.B > current.R * 1.4)
            label.ForeColor = p.Primary;
        else
            label.ForeColor = p.Text;

        if (NeutralBack(label.BackColor)) label.BackColor = Color.Transparent;
    }

    static void StyleButton(Button b, PdksPalette p)
    {
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderColor = p.Border;
        b.FlatAppearance.BorderSize = 1;
        b.BackColor = p.Surface;
        b.ForeColor = p.Text;
        b.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        b.Cursor = Cursors.Hand;
        b.Padding = new Padding(6, 1, 6, 1);
        if (b.Parent is FlowLayoutPanel) b.MinimumSize = new Size(b.MinimumSize.Width, 30);

        var text = (b.Text ?? string.Empty).Trim();
        if (IsPrimaryAction(text))
        {
            b.BackColor = p.Primary;
            b.ForeColor = Color.White;
            b.FlatAppearance.BorderColor = p.Primary;
        }
        else if (text.Contains("Sil", StringComparison.OrdinalIgnoreCase) || text.Contains("Çıkart", StringComparison.OrdinalIgnoreCase))
        {
            b.BackColor = p.DangerSoft;
            b.ForeColor = p.Danger;
            b.FlatAppearance.BorderColor = p.Danger;
        }
        else if (text.Contains("Kapat", StringComparison.OrdinalIgnoreCase) || text.Contains("Çıkış", StringComparison.OrdinalIgnoreCase))
        {
            b.BackColor = p.SurfaceAlt;
            b.ForeColor = p.Muted;
        }
    }

    static bool IsPrimaryAction(string text) =>
        text.Contains("Kaydet", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("Ekle", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("Oluştur", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("Hesapla", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("Aktar", StringComparison.OrdinalIgnoreCase) ||
        text.Equals("Göster", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("Giriş", StringComparison.OrdinalIgnoreCase) && !text.Contains("Çıkış", StringComparison.OrdinalIgnoreCase);

    static void StyleTabs(TabControl tabs)
    {
        var p = PdksAppearance.Current;
        tabs.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        tabs.DrawMode = TabDrawMode.OwnerDrawFixed;
        tabs.SizeMode = TabSizeMode.Normal;
        tabs.Padding = new Point(18, 9);
        tabs.Multiline = true;
        tabs.HotTrack = true;
        tabs.BackColor = p.Canvas;
        foreach (TabPage page in tabs.TabPages)
        {
            page.BackColor = p.Surface;
            page.ForeColor = p.Text;
        }

        if (StyledTabs.Add(tabs))
        {
            tabs.DrawItem += (_, e) =>
            {
                if (e.Index < 0 || e.Index >= tabs.TabPages.Count) return;
                var palette = PdksAppearance.Current;
                var selected = e.Index == tabs.SelectedIndex;
                var rect = e.Bounds;
                var back = selected ? palette.PrimarySoft : palette.SurfaceAlt;
                var fore = selected ? palette.Primary : palette.Muted;
                using var brush = new SolidBrush(back);
                using var pen = new Pen(selected ? palette.Primary : palette.Border);
                e.Graphics.FillRectangle(brush, rect);
                e.Graphics.DrawRectangle(pen, rect.X, rect.Y, rect.Width - 1, rect.Height - 1);
                TextRenderer.DrawText(e.Graphics, tabs.TabPages[e.Index].Text, tabs.Font, rect, fore,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                if (selected)
                {
                    using var accent = new SolidBrush(palette.Primary);
                    e.Graphics.FillRectangle(accent, rect.Left + 6, rect.Bottom - 3, Math.Max(4, rect.Width - 12), 3);
                }
            };
        }
        tabs.Invalidate();
    }

    static void StyleGrid(DataGridView grid, PdksPalette p)
    {
        grid.BackgroundColor = p.Surface;
        grid.BorderStyle = BorderStyle.None;
        grid.GridColor = p.Border;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
        grid.ColumnHeadersDefaultCellStyle.BackColor = p.GridHeader;
        grid.ColumnHeadersDefaultCellStyle.ForeColor = p.Text;
        grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = p.GridHeader;
        grid.ColumnHeadersDefaultCellStyle.SelectionForeColor = p.Text;
        grid.DefaultCellStyle.BackColor = p.Surface;
        grid.DefaultCellStyle.ForeColor = p.Text;
        grid.DefaultCellStyle.SelectionBackColor = p.Selection;
        grid.DefaultCellStyle.SelectionForeColor = p.Text;
        grid.AlternatingRowsDefaultCellStyle.BackColor = p.SurfaceAlt;
        grid.AlternatingRowsDefaultCellStyle.ForeColor = p.Text;
        grid.RowHeadersDefaultCellStyle.BackColor = p.SurfaceAlt;
        grid.RowHeadersDefaultCellStyle.ForeColor = p.Text;
        grid.RowHeadersVisible = false;
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        grid.RowTemplate.Height = Math.Max(grid.RowTemplate.Height, 31);
        grid.ColumnHeadersHeight = Math.Max(grid.ColumnHeadersHeight, 36);
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

        EnsureGridContextMenu(grid, p);
    }

    static void EnsureGridContextMenu(DataGridView grid, PdksPalette p)
    {
        var menu = grid.ContextMenuStrip ?? new ContextMenuStrip { Font = new Font("Segoe UI", 9f) };
        menu.BackColor = p.Surface;
        menu.ForeColor = p.Text;
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
            column.HeaderCell.Style.BackColor = column.Frozen ? PdksAppearance.Current.PrimarySoft : PdksAppearance.Current.GridHeader;
            column.HeaderCell.Style.ForeColor = PdksAppearance.Current.Text;
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

    static Color MapBack(Color color, PdksPalette p)
    {
        if (!NeutralBack(color)) return color;
        if (color == Color.White || color == SystemColors.Window) return p.Surface;
        return p.Canvas;
    }

    static bool NeutralBack(Color color) =>
        color == Color.Transparent ||
        color == SystemColors.Control ||
        color == SystemColors.Window ||
        color == Color.White ||
        color == Color.FromArgb(244,247,251) ||
        color == Color.FromArgb(245,247,250) ||
        color == Color.FromArgb(246,249,253) ||
        color == Color.FromArgb(248,250,252) ||
        color == Color.FromArgb(247,249,252);

    static bool IsStatusColor(Color color) =>
        color == Color.Green || color == Color.DarkGreen || color == Color.Firebrick ||
        color == Color.Red || color == Color.Orange || color == Color.DarkOrange ||
        (color.G > color.R * 1.35 && color.G > color.B * 1.2);
}
