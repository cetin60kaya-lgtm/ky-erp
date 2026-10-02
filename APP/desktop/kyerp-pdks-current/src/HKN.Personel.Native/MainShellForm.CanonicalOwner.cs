namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    void BuildCanonicalMenuHost()
    {
        MainMenuStrip = new MenuStrip
        {
            Dock = DockStyle.Top,
            Visible = false,
            AutoSize = false,
            Height = 1
        };
    }
}
