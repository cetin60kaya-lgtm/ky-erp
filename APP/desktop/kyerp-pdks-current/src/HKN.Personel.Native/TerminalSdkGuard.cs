namespace HKN.Personel.Native;

internal static class TerminalSdkGuard
{
    public static bool EnsureCompatible(IWin32Window owner)
    {
        var result = TerminalSdkDiagnostics.Check();
        if (result.Ok) return true;
        MessageBox.Show(result.Message, "Terminal SDK", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }
}
