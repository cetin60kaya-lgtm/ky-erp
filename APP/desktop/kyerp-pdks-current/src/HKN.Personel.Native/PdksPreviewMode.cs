namespace HKN.Personel.Native;

// Real Windows application shell, isolated visual-review mode.
// This flag is intentionally opt-in and never persisted as a production setting.
internal static class PdksPreviewMode
{
    public static bool Enabled =>
        Environment.GetCommandLineArgs().Any(arg =>
            string.Equals(arg, "--visual-preview", StringComparison.OrdinalIgnoreCase));
}
