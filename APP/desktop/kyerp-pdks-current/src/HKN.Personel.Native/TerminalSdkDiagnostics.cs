using System.Diagnostics;

namespace HKN.Personel.Native;

internal static class TerminalSdkDiagnostics
{
    public sealed record Result(bool Ok, string Message, string? OcxPath = null);

    public static Result Check()
    {
        try
        {
            var bridge = Path.Combine(AppContext.BaseDirectory, "KYERP.TerminalBridge.exe");
            if (!File.Exists(bridge))
                return new Result(false, "KYERP.TerminalBridge.exe bulunamadı. Tam self-contained paket yeniden kurulmalı.");

            var sdk = TerminalSdkLocator.Resolve();
            return new Result(sdk.CanAttemptConnection, sdk.Message, sdk.OcxPath);
        }
        catch (Exception ex)
        {
            return new Result(false, "Terminal SDK kontrolü başarısız: " + ex.Message);
        }
    }

    public static Result ProbeBridge(string ip, int port, int machine, int timeoutMs = 8000)
    {
        var baseDir = AppContext.BaseDirectory;
        var bridge = Path.Combine(baseDir, "KYERP.TerminalBridge.exe");
        if (!File.Exists(bridge)) return new Result(false, "KYERP.TerminalBridge.exe bulunamadı.");

        var sdk = TerminalSdkLocator.Resolve();
        if (!sdk.CanAttemptConnection) return new Result(false, sdk.Message, sdk.OcxPath);

        try
        {
            var workingDirectory = Directory.Exists(sdk.WorkingDirectory) ? sdk.WorkingDirectory : baseDir;
            var psi = new ProcessStartInfo
            {
                FileName = bridge,
                Arguments = $"status {ip} {port} {machine}",
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            psi.Environment["PATH"] = workingDirectory + Path.PathSeparator + (Environment.GetEnvironmentVariable("PATH") ?? string.Empty);
            psi.Environment["KY_PDKS_TERMINAL_SDK"] = workingDirectory;

            using var process = new Process { StartInfo = psi };
            process.Start();
            if (!process.WaitForExit(timeoutMs))
            {
                try { process.Kill(true); } catch { }
                return new Result(false, "TerminalBridge zaman aşımına uğradı. IP/port ve ağ erişimini kontrol edin.", sdk.OcxPath);
            }
            var output = process.StandardOutput.ReadToEnd() + " " + process.StandardError.ReadToEnd();
            if (output.Contains("FM_RecordRead", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("EntryPoint", StringComparison.OrdinalIgnoreCase))
                return new Result(false, "FP_CLOCK.ocx / destek DLL sürümü uyumsuz. Hedef PDKS'nin çalışan SDK klasörü kullanılmalı.", sdk.OcxPath);
            if (output.Contains("STATUS|OK|", StringComparison.OrdinalIgnoreCase))
                return new Result(true, "Terminal SDK ve cihaz bağlantısı hazır. " + sdk.Message, sdk.OcxPath);
            if (output.Contains("class not registered", StringComparison.OrdinalIgnoreCase) || output.Contains("80040154", StringComparison.OrdinalIgnoreCase))
                return new Result(false, "FP_CLOCK 32-bit ActiveX kayıtlı değil. Terminal Merkezi > Sürücüyü Onar işlemini kullanın.", sdk.OcxPath);
            return new Result(false, "TerminalBridge kontrol sonucu: " + output.Trim(), sdk.OcxPath);
        }
        catch (Exception ex)
        {
            return new Result(false, "TerminalBridge başlatılamadı: " + ex.Message, sdk.OcxPath);
        }
    }

    public static string RegistrationCommand(string ocxPath)
    {
        var regsvr = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64", "regsvr32.exe");
        if (!File.Exists(regsvr)) regsvr = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "regsvr32.exe");
        return $"\"{regsvr}\" /s \"{ocxPath}\"";
    }
}
