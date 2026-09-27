using System.Runtime.InteropServices;

namespace HKN.Personel.Native;

internal static class TerminalSdkDiagnostics
{
    public sealed record Result(bool Ok, string Message, string? OcxPath = null);

    static readonly string[] RequiredExports = ["FM_RecordRead"];

    public static Result Check()
    {
        try
        {
            var candidates = CandidateOcxFiles().Distinct(StringComparer.OrdinalIgnoreCase).Where(File.Exists).ToArray();
            if (candidates.Length == 0)
                return new Result(false, "Terminal SDK bulunamadı. FP_CLOCK.ocx paket içinde veya TerminalSdk klasöründe olmalı.");

            foreach (var file in candidates)
            {
                if (!NativeLibrary.TryLoad(file, out var handle)) continue;
                try
                {
                    var missing = RequiredExports.Where(name => !NativeLibrary.TryGetExport(handle, name, out _)).ToArray();
                    if (missing.Length == 0)
                        return new Result(true, $"Terminal SDK hazır: {Path.GetFileName(file)}", file);
                }
                finally { NativeLibrary.Free(handle); }
            }

            return new Result(false,
                "Yüklü FP_CLOCK.ocx bu sürümün istediği FM_RecordRead giriş noktasını içermiyor. Doğru TerminalSdk paketi kullanılmalı.",
                candidates.FirstOrDefault());
        }
        catch (BadImageFormatException)
        {
            return new Result(false, "Terminal SDK mimarisi uyumsuz (32-bit / 64-bit). KY PDKS Terminal SDK x86 bileşenlerini doğru kayıt yöntemiyle kullanmalı.");
        }
        catch (Exception ex)
        {
            return new Result(false, "Terminal SDK kontrolü başarısız: " + ex.Message);
        }
    }

    static IEnumerable<string> CandidateOcxFiles()
    {
        var baseDir = AppContext.BaseDirectory;
        yield return Path.Combine(baseDir, "TerminalSdk", "FP_CLOCK.ocx");
        yield return Path.Combine(baseDir, "FP_CLOCK.ocx");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.SystemX86), "FP_CLOCK.ocx");
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "FP_CLOCK.ocx");
    }

    public static string RegistrationCommand(string ocxPath)
    {
        var syswow64 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "SysWOW64", "regsvr32.exe");
        var regsvr = File.Exists(syswow64) ? syswow64 : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "regsvr32.exe");
        return $"\"{regsvr}\" /s \"{ocxPath}\"";
    }
}
