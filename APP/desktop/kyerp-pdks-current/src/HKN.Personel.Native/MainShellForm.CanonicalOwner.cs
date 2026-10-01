namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    // Canonical shell owns the visible menu from process start. The legacy menu builder
    // remains available only as reference code; it is never constructed on the live shell.
    void BuildCanonicalMenuHost()
    {
        var menu = new MenuStrip
        {
            Dock = DockStyle.Top,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            BackColor = Color.FromArgb(247, 249, 252),
            ForeColor = Color.FromArgb(28, 46, 72),
            AutoSize = false,
            Height = 30,
            Padding = new Padding(8, 2, 0, 2),
            RenderMode = ToolStripRenderMode.ManagerRenderMode,
            ImageScalingSize = new Size(18, 18)
        };
        MainMenuStrip = menu;
    }

    void BuildCanonicalToolbarSeed()
    {
        tool.Items.Clear();
        tool.Height = 58;
        tool.ImageScalingSize = new Size(24, 24);
        tool.Padding = new Padding(8, 2, 0, 2);
        AddLegacyTool("Genel Bakış", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Home), ShowHome, 72);
        AddLegacyTool("Canlı İzleme", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Live), OpenLiveAttendance, 80);
        AddLegacyTool("Terminal", PdksModule.Terminal, PdksToolbarIcons.Create(PdksToolbarIcon.Transfer), OpenTerminalCenter, 72);
        AddLegacyTool("Giriş-Çıkış", PdksModule.GirisCikis, PdksToolbarIcons.Create(PdksToolbarIcon.EntryExit), OpenLegacyGirisCikis, 82);
        AddLegacyTool("Personel", PdksModule.Personel, PdksToolbarIcons.Create(PdksToolbarIcon.Personnel), OpenPersonel, 72);
        AddLegacyTool("Puantaj", PdksModule.Puantaj, PdksToolbarIcons.Create(PdksToolbarIcon.Timesheet), OpenLegacyPuantaj, 72);
        AddLegacyTool("Bordro", PdksModule.Bordro, PdksToolbarIcons.Create(PdksToolbarIcon.Payroll), OpenLegacyBordro, 72);
    }
}
