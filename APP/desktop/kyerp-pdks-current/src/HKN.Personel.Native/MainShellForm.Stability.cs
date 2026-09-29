namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    protected override void OnLoad(EventArgs e)
    {
        // Apply the final footprint before the first visible paint. The constructor historically
        // set Maximized and OnShown later shrank the form, which caused the visible SHOW/jump.
        ApplyStableStartupBounds();
        base.OnLoad(e);
    }

    void ApplyStableStartupBounds()
    {
        WindowState = FormWindowState.Normal;
        StartPosition = FormStartPosition.Manual;
        var area = Screen.FromControl(this).WorkingArea;
        var targetWidth = Math.Clamp((int)Math.Round(area.Width * 0.88), 1180, 1500);
        var targetHeight = Math.Clamp((int)Math.Round(area.Height * 0.86), 720, 900);
        Size = new Size(Math.Min(targetWidth, Math.Max(1100, area.Width - 50)), Math.Min(targetHeight, Math.Max(700, area.Height - 50)));
        Location = new Point(
            area.Left + Math.Max(0, (area.Width - Width) / 2),
            area.Top + Math.Max(0, (area.Height - Height) / 2));
    }

    void OpenTerminalSettingsDirect()
    {
        if (!Ready(PdksModule.Terminal)) return;
        using var form = new LegacyTerminalSettingsForm();
        PdksTheme.Apply(form);
        form.ShowDialog(this);
    }
}
