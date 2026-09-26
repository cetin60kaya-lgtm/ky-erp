namespace HKN.Personel.Native;

internal sealed class ModuleHostForm : Form
{
    readonly Form child;

    public ModuleHostForm(Form child, Action showHome)
    {
        this.child = child;
        Text = child.Text;
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(246, 249, 253);
        Font = new Font("Segoe UI", 9f);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 68,
            BackColor = Color.White,
            Padding = new Padding(16, 8, 12, 7)
        };
        var icon = new PictureBox
        {
            Image = PdksToolbarIcons.Create(IconFor(child.Text)),
            Dock = DockStyle.Left,
            Width = 48,
            SizeMode = PictureBoxSizeMode.CenterImage,
            BackColor = Color.Transparent
        };
        var titleBox = new TableLayoutPanel
        {
            Dock = DockStyle.Left, Width = 650, RowCount = 2, ColumnCount = 1,
            BackColor = Color.Transparent, Padding = new Padding(6, 0, 0, 0)
        };
        titleBox.RowStyles.Add(new RowStyle(SizeType.Percent, 62));
        titleBox.RowStyles.Add(new RowStyle(SizeType.Percent, 38));
        titleBox.Controls.Add(new Label
        {
            Text = child.Text, Dock = DockStyle.Fill, TextAlign = ContentAlignment.BottomLeft,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold), ForeColor = Color.FromArgb(27, 44, 68)
        }, 0, 0);
        titleBox.Controls.Add(new Label
        {
            Text = $"KY ERP  •  PDKS  •  {CompanyBranding.Current.ReportHeader}", Dock = DockStyle.Fill, TextAlign = ContentAlignment.TopLeft,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = Color.FromArgb(36, 107, 230)
        }, 0, 1);

        var back = new Button
        {
            Text = "⌂  Ana Sayfa", Dock = DockStyle.Right, Width = 126,
            FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(238, 245, 255),
            ForeColor = Color.FromArgb(31, 92, 180), Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        back.FlatAppearance.BorderColor = Color.FromArgb(196, 214, 240);
        back.Click += (_, _) => showHome();
        var accent = new Panel { Dock = DockStyle.Bottom, Height = 3, BackColor = Color.FromArgb(36, 107, 230) };
        header.Controls.Add(back);
        header.Controls.Add(titleBox);
        header.Controls.Add(icon);
        header.Controls.Add(accent);

        var content = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14, 12, 14, 14),
            BackColor = Color.FromArgb(246, 249, 253)
        };

        // Tema ve anchor hesabını legacy form kendi tasarım boyutundayken uygula.
        // Sonra formu çalışma alanına büyüt; böylece tablo/sekme/alt butonlar doğru esner.
        PdksTheme.Apply(child);
        child.TopLevel = false;
        child.FormBorderStyle = FormBorderStyle.None;
        child.MinimumSize = Size.Empty;
        child.Dock = DockStyle.Fill;
        child.ShowInTaskbar = false;
        child.AutoScroll = true;
        if (child.MainMenuStrip is not null) child.MainMenuStrip.Visible = false;
        foreach (var menu in child.Controls.OfType<MenuStrip>()) menu.Visible = false;
        HideEmbeddedCloseButtons(child.Controls);
        content.Controls.Add(child);
        Controls.Add(content);
        Controls.Add(header);
        child.Show();
        Disposed += (_, _) =>
        {
            if (!child.IsDisposed) child.Dispose();
        };
    }

    static void HideEmbeddedCloseButtons(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Button button)
            {
                var text = (button.Text ?? string.Empty).Replace("&", string.Empty).Trim();
                if (text.Equals("Kapat", StringComparison.OrdinalIgnoreCase) ||
                    text.Equals("Vazgeç", StringComparison.OrdinalIgnoreCase) && button.DialogResult == DialogResult.Cancel)
                    button.Visible = false;
            }
            if (control.HasChildren) HideEmbeddedCloseButtons(control.Controls);
        }
    }
    static PdksToolbarIcon IconFor(string text)
    {
        var value = (text ?? string.Empty).ToLower(new System.Globalization.CultureInfo("tr-TR"));
        if (value.Contains("personel")) return PdksToolbarIcon.Personnel;
        if (value.Contains("puantaj")) return PdksToolbarIcon.Timesheet;
        if (value.Contains("bordro") || value.Contains("ödeme") || value.Contains("kazanç")) return PdksToolbarIcon.Payroll;
        if (value.Contains("giriş") || value.Contains("çıkış")) return PdksToolbarIcon.EntryExit;
        if (value.Contains("canlı")) return PdksToolbarIcon.Live;
        if (value.Contains("terminal") || value.Contains("aktar")) return PdksToolbarIcon.Transfer;
        if (value.Contains("dönem") || value.Contains("tarih")) return PdksToolbarIcon.Periods;
        if (value.Contains("grup")) return PdksToolbarIcon.Groups;
        if (value.Contains("rapor") || value.Contains("sonuç")) return PdksToolbarIcon.Results;
        return PdksToolbarIcon.Departments;
    }
}
