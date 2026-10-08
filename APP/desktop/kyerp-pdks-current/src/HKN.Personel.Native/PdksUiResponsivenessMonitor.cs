using System.Diagnostics;
using System.Threading;

namespace HKN.Personel.Native;

/// <summary>
/// Single diagnostic watchdog for the interactive preview. It measures real UI
/// message-pump responsiveness, not merely whether Windows reports the process
/// as alive. Disabled in production and never reads personnel records.
/// </summary>
internal sealed class PdksUiResponsivenessMonitor : IDisposable
{
    readonly System.Windows.Forms.Timer uiPulse;
    readonly System.Threading.Timer watchdog;
    long lastPulse = Stopwatch.GetTimestamp();
    int stallReported;
    int disposed;

    public PdksUiResponsivenessMonitor(Form shell)
    {
        if (!PdksPreviewMode.Enabled)
            throw new InvalidOperationException("Preview diagnostics cannot be enabled in production.");
        uiPulse = new System.Windows.Forms.Timer { Interval = 250 };
        uiPulse.Tick += (_, _) =>
        {
            Volatile.Write(ref lastPulse, Stopwatch.GetTimestamp());
            if (Interlocked.Exchange(ref stallReported, 0) != 0)
                PdksPreviewDiagnostics.Record("ui-stall-recovered");
        };
        shell.FormClosed += (_, _) => Dispose();
        uiPulse.Start();
        watchdog = new System.Threading.Timer(Check, null, 1200, 1000);
    }

    void Check(object? _)
    {
        if (Volatile.Read(ref disposed) != 0) return;
        var delta = Stopwatch.GetElapsedTime(Volatile.Read(ref lastPulse));
        if (delta > TimeSpan.FromSeconds(3) &&
            Interlocked.Exchange(ref stallReported, 1) == 0)
        {
            PdksPreviewDiagnostics.Record(
                "ui-stall durationMs=" + ((long)delta.TotalMilliseconds));
            PdksPreviewDiagnostics.Snapshot("ui-stall");
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        uiPulse.Stop();
        uiPulse.Dispose();
        watchdog.Dispose();
    }
}
