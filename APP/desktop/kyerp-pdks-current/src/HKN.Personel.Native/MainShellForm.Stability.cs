namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    protected override void OnLoad(EventArgs e)
    {
        ApplyCanonicalStartup();
        ApplyStableStartupBounds();
        base.OnLoad(e);
    }

    void ApplyStableStartupBounds()
    {
        StartPosition = FormStartPosition.Manual;
        WindowState = FormWindowState.Normal;

        var screen = Screen.FromPoint(Cursor.Position);
        var area = screen.WorkingArea;
        var width = Math.Min(1500, Math.Max(1180, area.Width - 180));
        var height = Math.Min(900, Math.Max(720, area.Height - 140));
        Size = new Size(width, height);
        Location = new Point(
            area.Left + Math.Max(0, (area.Width - width) / 2),
            area.Top + Math.Max(0, (area.Height - height) / 2));
    }

    void OpenTerminalSettingsDirect()
    {
        if (!Ready(PdksModule.Terminal)) return;
        using var form = new LegacyTerminalSettingsForm();
        PdksTheme.Apply(form);
        form.ShowDialog(this);
    }
}
