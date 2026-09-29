using System.Diagnostics;

namespace HKN.Personel.Native;

internal static class TerminalSdkDiagnostics
{
    public sealed record Result(bool Ok, string Message, string? OcxPath = null);

    static readonly string[] SupportFiles = ["FP_CLOCK.ocx", "TMPCCOMM.dll", "CH375DLL.DLL", "MFC42.DLL"];

    public static Result Check()
    {
        try
        {
            var baseDir = AppContext.BaseDirectory;
            var sdkDir = Path.Combine(baseDir, "TerminalSdk");
            var ocx = Path.Combine(sdkDir, "FP_CLOCK.ocx");
            var bridge = Path.Combine(baseDir, "KYERP.TerminalBridge.exe");

            if (!File.Exists(bridge))
                return new Result(false, "KYERP.TerminalBridge.exe bulunamadı. Tam self-contained paket yeniden kurulmalı.");

            if (!File.Exists(ocx))
            {
                var registered = CandidateRegisteredOcx().FirstOrDefault(File.Exists);
                if (registered is null)
                    return new Result(false, "FP_CLOCK.ocx bulunamadı. TerminalSdk klasörü eksik; tam kurulum paketini kullanın.");
                return new Result(true, "Terminal SDK sistemde kayıtlı. Cihaz bağlantısı x86 TerminalBridge üzerinden doğrulanacak.", registered);
            }

            var missing = SupportFiles.Where(name => !File.Exists(Path.Combine(sdkDir, name))).ToArray();
            if (missing.Length > 0)
                return new Result(false, "TerminalSdk eksik dosya: " + string.Join(", ", missing), ocx);

            return new Result(true,
                "Terminal SDK paketi hazır. FP_CLOCK.ocx 32-bit kayıt/çalışma doğrulaması KYERP.TerminalBridge üzerinden yapılır.", ocx);
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
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = bridge,
                    Arguments = $"status {ip} {port} {machine}",
                    WorkingDirectory = baseDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                }
            };
            process.Start();
            if (!process.WaitForExit(timeoutMs))
            {
                try { process.Kill(true); } catch { }
                return new Result(false, "TerminalBridge zaman aşımına uğradı.");
            }
            var output = process.StandardOutput.ReadToEnd() + " " + process.StandardError.ReadToEnd();
            if (output.Contains("FM_RecordRead", StringComparison.OrdinalIgnoreCase) ||
                output.Contains("EntryPoint", StringComparison.OrdinalIgnoreCase))
                return new Result(false, "FP_CLOCK.ocx / destek DLL sürümü uyumsuz. Paket içindeki TerminalSdk yeniden kurulmalı.");
            if (output.Contains("STATUS|OK|", StringComparison.OrdinalIgnoreCase))
                return new Result(true, "Terminal SDK ve cihaz bağlantısı hazır.");
            if (output.Contains("bağlant", StringComparison.OrdinalIgnoreCase) || output.Contains("baglant", StringComparison.OrdinalIgnoreCase))
                return new Result(true, "Terminal SDK yüklendi; cihaz şu anda erişilemiyor. SDK uyumluluğu geçti.");
            return new Result(false, "TerminalBridge kontrol sonucu: " + output.Trim());
        }
        catch (Exception ex)
        {
            return new Result(false, "TerminalBridge başlatılamadı: " + ex.Message);
        }
    }

    static IEnumerable<string> CandidateRegisteredOcx()
    {
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        yield return Path.Combine(windows, "SysWOW64", "FP_CLOCK.ocx");
        yield return Path.Combine(windows, "System32", "FP_CLOCK.ocx");
        yield return Path.Combine(AppContext.BaseDirectory, "FP_CLOCK.ocx");
    }

    public static string RegistrationCommand(string ocxPath)
    {
        var regsvr = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64", "regsvr32.exe");
        if (!File.Exists(regsvr)) regsvr = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "regsvr32.exe");
        return $"\"{regsvr}\" /s \"{ocxPath}\"";
    }
}
