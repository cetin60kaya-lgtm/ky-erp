namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    void BuildCanonicalMenuHost()
    {
        MainMenuStrip = new MenuStrip
        {
            Dock = DockStyle.Top,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            BackColor = Color.FromArgb(247, 249, 252),
            ForeColor = Color.FromArgb(28, 46, 72),
            AutoSize = false,
            Height = 34,
            Padding = new Padding(8, 2, 0, 2),
            RenderMode = ToolStripRenderMode.ManagerRenderMode,
            ImageScalingSize = new Size(18, 18)
        };
    }

    void BuildCanonicalToolbarSeed()
    {
        tool.Items.Clear();
        tool.Height = 58;
        tool.ImageScalingSize = new Size(24, 24);
        tool.Padding = new Padding(8, 2, 0, 2);
        AddLegacyTool("Ana Sayfa", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Home), ShowHome, 78);
        AddLegacyTool("Canlı", PdksModule.GunlukOperasyon, PdksToolbarIcons.Create(PdksToolbarIcon.Live), OpenLiveAttendance, 78);
        AddLegacyTool("Giriş / Çıkış", PdksModule.GirisCikis, PdksToolbarIcons.Create(PdksToolbarIcon.EntryExit), OpenLegacyGirisCikis, 88);
        AddLegacyTool("Personel", PdksModule.Personel, PdksToolbarIcons.Create(PdksToolbarIcon.Personnel), OpenPersonel, 78);
        AddLegacyTool("Puantaj", PdksModule.Puantaj, PdksToolbarIcons.Create(PdksToolbarIcon.Timesheet), () => OpenPuantaj(0), 78);
        AddLegacyTool("Bordro", PdksModule.Bordro, PdksToolbarIcons.Create(PdksToolbarIcon.Payroll), () => OpenBordro(0), 78);
    }
}
