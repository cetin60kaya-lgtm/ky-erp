using System.Drawing;
using System.Windows.Forms;

namespace QuickDataTool;

internal static class AppTheme
{
    internal static readonly Color Primary = Color.FromArgb(31, 78, 121);
    internal static readonly Color Accent = Color.FromArgb(39, 125, 90);
    internal static readonly Color Surface = Color.White;
    internal static readonly Color Background = Color.FromArgb(245, 247, 250);
    internal static readonly Color GridAlternate = Color.FromArgb(248, 250, 252);
    internal static readonly Color Border = Color.FromArgb(210, 216, 224);

    internal static void Apply(Control root)
    {
        root.Font = new Font("Segoe UI", 9f);
        if (root is Form form) form.BackColor = Background;

        foreach (Control control in root.Controls)
        {
            switch (control)
            {
                case TabControl tabs:
                    tabs.Font = new Font("Segoe UI Semibold", 9f);
                    tabs.Padding = new Point(14, 5);
                    break;
                case TabPage page:
                    page.BackColor = Surface;
                    break;
                case Button button:
                    button.FlatStyle = FlatStyle.Flat;
                    button.FlatAppearance.BorderColor = Border;
                    button.FlatAppearance.BorderSize = 1;
                    button.Cursor = Cursors.Hand;
                    if (button.BackColor == SystemColors.Control)
                    {
                        button.BackColor = Surface;
                        button.ForeColor = Color.FromArgb(35, 43, 54);
                    }
                    break;
                case DataGridView grid:
                    grid.BackgroundColor = Surface;
                    grid.BorderStyle = BorderStyle.FixedSingle;
                    grid.GridColor = Color.FromArgb(232, 236, 241);
                    grid.EnableHeadersVisualStyles = false;
                    grid.ColumnHeadersDefaultCellStyle.BackColor = Primary;
                    grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
                    grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI Semibold", 9f);
                    grid.ColumnHeadersDefaultCellStyle.SelectionBackColor = Primary;
                    grid.AlternatingRowsDefaultCellStyle.BackColor = GridAlternate;
                    grid.RowHeadersVisible = false;
                    break;
                case GroupBox group:
                    group.ForeColor = Primary;
                    break;
            }
            Apply(control);
        }
    }
}
