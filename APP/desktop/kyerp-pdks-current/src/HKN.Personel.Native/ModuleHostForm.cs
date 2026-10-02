namespace HKN.Personel.Native;

internal sealed class ModuleHostForm : Form
{
    readonly Form child;
    readonly Panel content;

    public ModuleHostForm(Form requestedChild, Action showHome)
    {
        child = requestedChild ?? throw new ArgumentNullException(nameof(requestedChild));
        if (child.IsDisposed) throw new ObjectDisposedException(child.GetType().FullName);

        Text = child.Text;
        TopLevel = false;
        FormBorderStyle = FormBorderStyle.None;
        Dock = DockStyle.Fill;
        BackColor = PdksAppearance.Current.Canvas;
        Font = new Font("Segoe UI", 9f);
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

        content = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(0),
            BackColor = PdksAppearance.Current.Canvas
        };

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
        child.Show();

        PdksAppearance.Changed += AppearanceChanged;
    }

    void AppearanceChanged(object? sender,EventArgs e)
    {
        if(IsDisposed)return;
        void apply()
        {
            var p=PdksAppearance.Current;
            BackColor=p.Canvas;
            content.BackColor=p.Canvas;
            PdksTheme.Apply(child);
            child.Invalidate(true);
        }
        if(InvokeRequired)BeginInvoke((Action)apply);else apply();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            PdksAppearance.Changed -= AppearanceChanged;
            if (!child.IsDisposed)
            {
                try { child.Dispose(); } catch { }
            }
        }
        base.Dispose(disposing);
    }

    static void HideEmbeddedCloseButtons(Control.ControlCollection controls)
    {
        foreach (Control control in controls)
        {
            if (control is Button button)
            {
                var text = (button.Text ?? string.Empty).Replace("&", string.Empty).Trim();
                if (text.Equals("Kapat", StringComparison.OrdinalIgnoreCase) ||
                    (text.Equals("Vazgeç", StringComparison.OrdinalIgnoreCase) && button.DialogResult == DialogResult.Cancel))
                    button.Visible = false;
            }
            if (control.HasChildren) HideEmbeddedCloseButtons(control.Controls);
        }
    }
}
