using System.Diagnostics;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class MonthlyDbWriter
{
    internal static async Task<string> BackupAsync(FirebirdDatabase database, CancellationToken token)
    {
        using var connection = database.OpenConnection();
        var settings = new FbConnectionStringBuilder(connection.ConnectionString);
        if (settings.DataSource is not "127.0.0.1" and not "localhost" &&
            !settings.DataSource.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("gbak yedeği için DB sunucusu bu bilgisayarda olmalıdır; uzak DB yazması engellendi.");
        if (!File.Exists(settings.Database))
            throw new FileNotFoundException("gbak için yerel DB dosyası bulunamadı.");

        var executable = FindGbak();
        var directory = Path.Combine(Path.GetDirectoryName(settings.Database)!, "_YEDEK");
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, $"DATABASE_REV25_{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid():N}.fbk");

        var start = new ProcessStartInfo(executable)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true
        };
        start.ArgumentList.Add("-b");
        start.ArgumentList.Add("-g");
        start.ArgumentList.Add($"{settings.DataSource}/{settings.Port}:{settings.Database}");
        start.ArgumentList.Add(target);
        start.Environment["ISC_USER"] = settings.UserID;
        start.Environment["ISC_PASSWORD"] = settings.Password;

        using var process = Process.Start(start) ??
            throw new InvalidOperationException("gbak başlatılamadı. DB değişmedi.");
        var errors = process.StandardError.ReadToEndAsync();
        var output = process.StandardOutput.ReadToEndAsync();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(10));
        try
        {
            await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
        }
        catch
        {
            if (!process.HasExited) process.Kill(true);
            throw;
        }
        await Task.WhenAll(errors, output).ConfigureAwait(false);

        if (process.ExitCode != 0 || !File.Exists(target) || new FileInfo(target).Length == 0)
            throw new InvalidOperationException(
                $"gbak yedeği başarısız (kod {process.ExitCode}); DB değişmedi. Firebird erişimini ve yedek klasörünü kontrol edin.");

        SyncEngine.Log($"REV25 gbak_backup_ok file={Path.GetFileName(target)} bytes={new FileInfo(target).Length}");
        return target;
    }

    static string FindGbak()
    {
        var candidates = new List<string> { Path.Combine(AppContext.BaseDirectory, "gbak.exe") };
        foreach (var root in new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
        })
        {
            var firebird = Path.Combine(root, "Firebird");
            if (Directory.Exists(firebird))
                candidates.AddRange(Directory.GetFiles(firebird, "gbak.exe", SearchOption.AllDirectories));
        }
        foreach (var path in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            if (!string.IsNullOrWhiteSpace(path))
                candidates.Add(Path.Combine(path, "gbak.exe"));

        return candidates.FirstOrDefault(File.Exists) ??
            throw new FileNotFoundException("Firebird gbak.exe yok. Yedeksiz DB işlemi yapılamaz; DB değişmedi.");
    }
}
