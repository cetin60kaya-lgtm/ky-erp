using System.Diagnostics;
using Microsoft.Win32;

namespace HKN.Personel.Native;

internal sealed record TerminalSdkResolution(
    bool ActiveXRegistered,
    bool CompleteSdk,
    string WorkingDirectory,
    string? OcxPath,
    string? SourceFolder,
    string Message)
{
    public bool CanAttemptConnection => ActiveXRegistered || CompleteSdk;
}

internal static class TerminalSdkLocator
{
    const string ClockClsid = "{87733EE1-D095-442B-A200-6DE90C5C8318}";
    static readonly string[] RequiredFiles = ["FP_CLOCK.ocx", "TMPCCOMM.dll", "CH375DLL.DLL", "MFC42.DLL"];

    public static TerminalSdkResolution Resolve()
    {
        var registeredOcx = FindRegisteredOcx();
        var candidates = CandidateFolders(registeredOcx).Where(Directory.Exists).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var complete = candidates.FirstOrDefault(IsCompleteSdk);

        if (complete is null)
        {
            foreach (var root in HedefRoots().Where(Directory.Exists).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var found = FindCompleteSdkUnder(root);
                if (found is null) continue;
                complete = found;
                break;
            }
        }

        var registered = !string.IsNullOrWhiteSpace(registeredOcx);
        var working = complete
            ?? (!string.IsNullOrWhiteSpace(registeredOcx) ? Path.GetDirectoryName(registeredOcx) : null)
            ?? AppContext.BaseDirectory;

        if (complete is not null && registered)
            return new(true, true, working!, registeredOcx, complete, $"Terminal SDK hazır • Windows 32-bit ActiveX kayıtlı • Kaynak: {complete}");
        if (registered)
            return new(true, false, working!, registeredOcx, null, $"Terminal SDK Windows'ta kayıtlı • Mevcut Hedef/Windows ActiveX kullanılacak: {registeredOcx}");
        if (complete is not null)
            return new(false, true, working!, Path.Combine(complete, "FP_CLOCK.ocx"), complete, $"Terminal SDK dosyaları bulundu ancak 32-bit ActiveX kaydı doğrulanamadı • Kaynak: {complete}");

        return new(false, false, AppContext.BaseDirectory, null, null,
            "Terminal SDK bulunamadı. Hedef PDKS kurulumundaki FP_CLOCK.ocx veya Windows 32-bit ActiveX kaydı gerekli.");
    }

    public static bool IsCompleteSdk(string folder) =>
        Directory.Exists(folder) && RequiredFiles.All(name => File.Exists(Path.Combine(folder, name)));

    static IEnumerable<string> CandidateFolders(string? registeredOcx)
    {
        var configured = Environment.GetEnvironmentVariable("KY_PDKS_TERMINAL_SDK");
        if (!string.IsNullOrWhiteSpace(configured)) yield return configured.Trim().Trim('"');

        yield return Path.Combine(AppContext.BaseDirectory, "TerminalSdk");
        yield return AppContext.BaseDirectory;

        if (!string.IsNullOrWhiteSpace(registeredOcx))
        {
            var folder = Path.GetDirectoryName(registeredOcx);
            if (!string.IsNullOrWhiteSpace(folder)) yield return folder;
        }

        var transfer = TerminalDeviceSettingsStore.Load().TransferFile;
        if (!string.IsNullOrWhiteSpace(transfer))
        {
            var transferDir = Path.GetDirectoryName(transfer);
            if (!string.IsNullOrWhiteSpace(transferDir))
            {
                yield return transferDir;
                var root = Directory.GetParent(transferDir)?.FullName;
                if (!string.IsNullOrWhiteSpace(root))
                {
                    yield return root;
                    yield return Path.Combine(root, "Hedef500");
                    yield return Path.Combine(root, "Terminal Bilgi Aktar");
                }
            }
        }

        foreach (var folder in RunningHedefFolders()) yield return folder;
        foreach (var root in HedefRoots()) yield return root;

        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        yield return Path.Combine(windows, "SysWOW64");
        yield return Path.Combine(windows, "System32");
    }

    static IEnumerable<string> HedefRoots()
    {
        yield return @"C:\Hedef500";
        yield return @"C:\Hedef500\Hedef500";
        yield return @"C:\Hedef500\Terminal Bilgi Aktar";
        yield return @"D:\Hedef500";
        yield return @"D:\Hedef500\Hedef500";
        yield return @"D:\Hedef500\Terminal Bilgi Aktar";
    }

    static IEnumerable<string> RunningHedefFolders()
    {
        Process[] processes;
        try { processes = Process.GetProcesses(); }
        catch { yield break; }

        foreach (var process in processes)
        {
            try
            {
                if (!process.ProcessName.Contains("Hedef", StringComparison.OrdinalIgnoreCase)) continue;
                var file = process.MainModule?.FileName;
                var folder = string.IsNullOrWhiteSpace(file) ? null : Path.GetDirectoryName(file);
                if (!string.IsNullOrWhiteSpace(folder)) yield return folder;
            }
            catch { }
            finally { process.Dispose(); }
        }
    }

    static string? FindCompleteSdkUnder(string root)
    {
        try
        {
            if (IsCompleteSdk(root)) return root;
            foreach (var ocx in Directory.EnumerateFiles(root, "FP_CLOCK.ocx", SearchOption.AllDirectories))
            {
                var folder = Path.GetDirectoryName(ocx);
                if (!string.IsNullOrWhiteSpace(folder) && IsCompleteSdk(folder)) return folder;
            }
        }
        catch { }
        return null;
    }

    static string? FindRegisteredOcx()
    {
        try
        {
            using var classes = RegistryKey.OpenBaseKey(RegistryHive.ClassesRoot, RegistryView.Registry32);
            using var key = classes.OpenSubKey($@"CLSID\{ClockClsid}\InprocServer32");
            var raw = Convert.ToString(key?.GetValue(null));
            var path = NormalizeRegistryPath(raw);
            if (!string.IsNullOrWhiteSpace(path) && File.Exists(path)) return path;
        }
        catch { }

        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        foreach (var path in new[]
        {
            Path.Combine(windows, "SysWOW64", "FP_CLOCK.ocx"),
            Path.Combine(windows, "System32", "FP_CLOCK.ocx")
        })
            if (File.Exists(path)) return path;

        return null;
    }

    static string? NormalizeRegistryPath(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var value = Environment.ExpandEnvironmentVariables(raw.Trim());
        if (value.StartsWith('"'))
        {
            var end = value.IndexOf('"', 1);
            if (end > 1) value = value[1..end];
        }
        else
        {
            var comma = value.IndexOf(',');
            if (comma > 0) value = value[..comma];
        }
        return value.Trim().Trim('"');
    }
}
