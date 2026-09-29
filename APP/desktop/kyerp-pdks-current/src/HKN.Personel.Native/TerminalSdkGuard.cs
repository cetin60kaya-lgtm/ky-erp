namespace HKN.Personel.Native;

internal static class TerminalSdkGuard
{
    public static bool EnsureCompatible(IWin32Window owner)
    {
        var files = TerminalSdkDiagnostics.Check();
        if (!files.Ok)
        {
            MessageBox.Show(files.Message, "Terminal SDK", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }

        var ip = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_IP") ?? "192.168.1.224";
        var port = int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_PORT"), out var parsedPort) ? parsedPort : 5005;
        var machine = int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_MACHINE"), out var parsedMachine) ? parsedMachine : 1;
        var probe = TerminalSdkDiagnostics.ProbeBridge(ip, port, machine);
        if (probe.Ok) return true;

        MessageBox.Show(probe.Message, "Terminal SDK", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return false;
    }
}
