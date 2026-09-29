namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    protected override void OnLoad(EventArgs e)
    {
        // Build the final menu/toolbar and final window state before the first visible paint.
        // No after-show menu moving or second resize is allowed.
        ApplyCanonicalStartup();
        ApplyStableStartupBounds();
        base.OnLoad(e);
    }

    void ApplyStableStartupBounds()
    {
        StartPosition = FormStartPosition.CenterScreen;
        WindowState = FormWindowState.Maximized;
    }

    void OpenTerminalSettingsDirect()
    {
        if (!Ready(PdksModule.Terminal)) return;
        using var form = new LegacyTerminalSettingsForm();
        PdksTheme.Apply(form);
        form.ShowDialog(this);
    }
}
