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

    public static void Install()
    {
        Application.Idle += (_, _) =>
        {
            foreach (Form form in Application.OpenForms)
            {
                if (form.IsDisposed || ThemedForms.Contains(form)) continue;
                Apply(form);
                ThemedForms.Add(form);
            }
        };
    }

    public static void Apply(Form form)
    {
        if (form is MainShellForm or LoginForm) return;
        form.Font = new Font("Segoe UI", 9f);
        form.BackColor = Canvas;
        form.ForeColor = Text;
        if (form.FormBorderStyle != FormBorderStyle.None)
            form.FormBorderStyle = FormBorderStyle.FixedSingle;
        StyleControls(form.Controls);
    }

    static void StyleControls(Control.ControlCollection controls)
    {
        foreach (Control c in controls)
        {
            switch (c)
            {
                case Button b:
                    StyleButton(b);
                    break;
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
                case DataGridView grid:
                    StyleGrid(grid);
                    break;
                case TabControl tabs:
                    StyleTabs(tabs);
                    break;
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
                case Panel panel when panel.BackColor == SystemColors.Control:
                    panel.BackColor = Surface;
                    break;
                case TableLayoutPanel table when table.BackColor == SystemColors.Control:
                    table.BackColor = Surface;
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
        b.Padding = new Padding(4, 1, 4, 1);

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
        tabs.Padding = new Point(16, 6);
        tabs.ItemSize = new Size(120, 30);
        tabs.DrawItem += (_, e) =>
        {
            if (e.Index < 0 || e.Index >= tabs.TabPages.Count) return;
            var selected = e.Index == tabs.SelectedIndex;
            var rect = e.Bounds;
            var back = selected ? Color.FromArgb(232, 241, 255) : Color.FromArgb(248, 250, 253);
            var fore = selected ? Primary : Muted;
            using var brush = new SolidBrush(back);
            using var textBrush = new SolidBrush(fore);
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
        grid.RowTemplate.Height = Math.Max(grid.RowTemplate.Height, 26);
    }
}
