namespace HKN.Personel.Native;

internal sealed class ModuleHostForm : Form
{
    static readonly Dictionary<string, Form> moduleCache = new(StringComparer.OrdinalIgnoreCase);
    static bool exitHooked;

    readonly Form child;
    readonly string cacheKey;
    readonly Panel content;

    public ModuleHostForm(Form requestedChild, Action showHome)
    {
        cacheKey = CacheKey(requestedChild);
        child = ResolveCachedChild(requestedChild, cacheKey);

        Text = child.Text;
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        BackColor = Color.FromArgb(246, 249, 253);
        Font = new Font("Segoe UI", 9f);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

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

        content = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14, 12, 14, 14),
            BackColor = Color.FromArgb(246, 249, 253)
        };

        // Tema yalnız ilk kullanımda pahalıdır. Aynı modüle geri dönüldüğünde yaşayan form yeniden kullanılır.
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

        if (child.Parent is not null) child.Parent.Controls.Remove(child);
        content.Controls.Add(child);
        Controls.Add(content);
        Controls.Add(header);
        if (!child.Visible) child.Show();

        // Host kapanınca ağır modül formunu öldürme. Sonraki menü tıklamasında aynı ekran anında geri gelir.
        Disposed += (_, _) =>
        {
            try
            {
                if (!child.IsDisposed && IsDescendantOf(child, this)) content.Controls.Remove(child);
            }
            catch { }
        };

        HookApplicationExit();
    }

    static string CacheKey(Form form)
        => $"{form.GetType().FullName}|{form.Text}";

    static Form ResolveCachedChild(Form requested, string key)
    {
        if (moduleCache.TryGetValue(key, out var cached) && !cached.IsDisposed)
        {
            if (!ReferenceEquals(requested, cached))
            {
                try { requested.Dispose(); } catch { }
            }
            if (cached.Parent is not null)
            {
                try { cached.Parent.Controls.Remove(cached); } catch { }
            }
            return cached;
        }

        moduleCache[key] = requested;
        return requested;
    }

    static bool IsDescendantOf(Control control, Control ancestor)
    {
        for (Control? p = control.Parent; p is not null; p = p.Parent)
            if (ReferenceEquals(p, ancestor)) return true;
        return false;
    }

    static void HookApplicationExit()
    {
        if (exitHooked) return;
        exitHooked = true;
        Application.ApplicationExit += (_, _) =>
        {
            foreach (var form in moduleCache.Values.Distinct().ToArray())
            {
                try { if (!form.IsDisposed) form.Dispose(); } catch { }
            }
            moduleCache.Clear();
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
