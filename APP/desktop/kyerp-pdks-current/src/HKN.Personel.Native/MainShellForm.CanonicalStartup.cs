namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    bool canonicalStartupApplied;

    void ApplyCanonicalStartup()
    {
        if (canonicalStartupApplied || MainMenuStrip is null) return;
        canonicalStartupApplied = true;

        Text = $"KY PDKS • {branding.ReportHeader}";
        workspace.ApplyLayout(WorkspaceLayoutMode.Single);

        MainMenuStrip.Visible = false;

        BuildModernShell();
    }
}
