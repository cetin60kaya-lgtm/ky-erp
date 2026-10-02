namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        // Canonical shell is fully built in OnLoad. No post-paint menu mutation is allowed.
    }
}
