using System.Diagnostics;
using System.Text;

namespace HKN.Personel.Native;

/// <summary>
/// Evidence for UI-review failures. Writes ONLY to a temporary diagnostic log,
/// and ONLY when --visual-preview is specified. Does not inspect any staff data.
/// </summary>
public static class PdksPreviewDiagnostics
{
    public static string FilePath => Path.Combine(Path.GetTempPath(),
        "KYERP-PDKS-VISUAL-PREVIEW", "logs", "navigation.log");

    public static void Record(string message)
    {
        if (!PdksPreviewMode.Enabled) return;
        try
        {
            var path = FilePath;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.AppendAllText(path,
                $"{DateTimeOffset.Now:O} [pid:{Environment.ProcessId}] {message}{Environment.NewLine}",
                Encoding.UTF8);
        }
        catch { /* Diagnostics must never crash an interactive application. */ }
    }

    public static void Snapshot(string reason)
    {
        if (!PdksPreviewMode.Enabled) return;
        using var process = Process.GetCurrentProcess();
        Record($"{reason} handles={process.HandleCount} " +
            $"memoryMB={process.WorkingSet64 / 1048576} privateMB={process.PrivateMemorySize64 / 1048576}");
    }
}
