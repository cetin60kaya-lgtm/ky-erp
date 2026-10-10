using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KyPdks.Unified;

internal sealed record AtomicTnfReplaceResult(
    string TargetPath,
    string BackupPath,
    string BeforeSha256,
    string AfterSha256,
    int LineCount);

internal static partial class AtomicTnfFileStore
{
    [GeneratedRegex(@"^[0-9]{5},([01][0-9]|2[0-3]):[0-5][0-9],[0-3][0-9][01][0-9][0-9]{2},1,001$",
        RegexOptions.CultureInvariant)]
    private static partial Regex TnfLinePattern();

    internal static async Task<AtomicTnfReplaceResult> ReplaceYearAsync(
        string targetPath,
        IEnumerable<string> inputLines,
        string backupRoot,
        string batchId,
        string expectedBeforeSha256,
        CancellationToken cancellationToken = default)
    {
        var fileName = Path.GetFileName(targetPath);
        if (!TryTargetYear(fileName, out var targetYear))
            throw new InvalidOperationException("TNF_TARGET_YEAR_INVALID");
        if (string.IsNullOrWhiteSpace(batchId) ||
            batchId.Any(ch => !(char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_')))
            throw new InvalidOperationException("TNF_BATCH_ID_INVALID");

        var normalized = inputLines
            .Select(line => (line ?? string.Empty).Trim())
            .ToArray();
        if (normalized.Any(string.IsNullOrWhiteSpace))
            throw new InvalidOperationException("TNF_BLANK_LINE_FORBIDDEN");
        if (normalized.Distinct(StringComparer.Ordinal).Count() != normalized.Length)
            throw new InvalidOperationException("TNF_DUPLICATE_LINE");
        foreach (var line in normalized)
            ValidateLineForYear(line, targetYear);

        var sorted = normalized.OrderBy(LineKey).ToArray();
        Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
        Directory.CreateDirectory(backupRoot);
        if (expectedBeforeSha256.Length != 64 ||
            expectedBeforeSha256.Any(ch => !Uri.IsHexDigit(ch)))
            throw new InvalidOperationException("TNF_EXPECTED_HASH_REQUIRED");
        // Named-by-target exclusive OS file handle blocks competing KY Agent
        // processes without creating an extra file in the official TNF folder.
        var lockRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "KYERP-PDKS", "tnf-locks");
        Directory.CreateDirectory(lockRoot);
        var lockId = Hash(Encoding.UTF8.GetBytes(Path.GetFullPath(targetPath).ToUpperInvariant()));
        var lockPath = Path.Combine(lockRoot, lockId + ".lock");
        await using var exclusiveLock = new FileStream(lockPath, FileMode.OpenOrCreate,
            FileAccess.ReadWrite, FileShare.None);

        var targetExisted = File.Exists(targetPath);
        var beforeHash = targetExisted
            ? await HashFileAsync(targetPath, cancellationToken)
            : Hash(Array.Empty<byte>());
        if (!string.Equals(beforeHash, expectedBeforeSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("TNF_STALE_EXPECTED_HASH");
        var backupPath = Path.Combine(
            backupRoot,
            $"{Path.GetFileNameWithoutExtension(fileName)}_{DateTime.Now:yyyyMMdd_HHmmssfff}_{batchId}.Tnf");
        if (targetExisted)
            File.Copy(targetPath, backupPath, false);
        else
            await File.WriteAllBytesAsync(backupPath, Array.Empty<byte>(), cancellationToken);

        var temp = targetPath + $".{batchId}.tmp";
        var replaced = false;
        var candidateHash = "";
        try
        {
            var payload = string.Join(Environment.NewLine, sorted);
            if (sorted.Length > 0) payload += Environment.NewLine;
            await File.WriteAllTextAsync(temp, payload, Encoding.ASCII, cancellationToken);
            var tempHash = await HashFileAsync(temp, cancellationToken);
            candidateHash = tempHash;
            var verifyLines = (await File.ReadAllLinesAsync(temp, cancellationToken))
                .Where(line => line.Length > 0)
                .ToArray();
            if (!verifyLines.SequenceEqual(sorted, StringComparer.Ordinal))
                throw new InvalidOperationException("TNF_TEMP_VERIFY_FAILED");

            // Another writer may ignore our private lock. Detect the change
            // immediately before rename rather than losing its update.
            if (targetExisted != File.Exists(targetPath) ||
                !string.Equals(
                    targetExisted ? await HashFileAsync(targetPath, cancellationToken) : Hash(Array.Empty<byte>()),
                    beforeHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("TNF_CONCURRENT_CHANGE_DETECTED");
            File.Move(temp, targetPath, true);
            replaced = true;
            var afterHash = await HashFileAsync(targetPath, cancellationToken);
            if (!string.Equals(tempHash, afterHash, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("TNF_ATOMIC_HASH_MISMATCH");
            return new(targetPath, backupPath, beforeHash, afterHash, sorted.Length);
        }
        catch
        {
            try
            {
                if (File.Exists(temp)) File.Delete(temp);
                if (replaced)
                {
                    // Never overwrite a newer third-party modification during
                    // recovery. Preserve both versions for manual reconciliation.
                    var currentHash = File.Exists(targetPath)
                        ? await HashFileAsync(targetPath, CancellationToken.None) : "";
                    if (!StringComparer.OrdinalIgnoreCase.Equals(currentHash, candidateHash))
                        throw new InvalidOperationException("TNF_RECOVERY_CONFLICT");
                    if (targetExisted && File.Exists(backupPath))
                        File.Copy(backupPath, targetPath, true);
                    else if (!targetExisted && File.Exists(targetPath))
                        File.Delete(targetPath);
                }
            }
            catch { }
            throw;
        }
    }

    internal static async Task AssertContractAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "ky-pdks-tnf-contract-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var target = Path.Combine(root, "TR2026.Tnf");
            var backup = Path.Combine(root, "backup");
            var first = new[]
            {
                "00003,08:28,250526,1,001",
                "00003,19:01,250526,1,001",
            };
            await File.WriteAllTextAsync(target,
                string.Join(Environment.NewLine, first) + Environment.NewLine,
                Encoding.ASCII);
            var originalHash = await HashFileAsync(target, default);
            var result = await ReplaceYearAsync(target,
            [
                "00004,18:59,250526,1,001",
                "00003,19:01,250526,1,001",
                "00003,08:28,250526,1,001",
            ], backup, "selftest", originalHash);
            if (!File.Exists(result.BackupPath) || result.LineCount != 3 ||
                string.Equals(result.BeforeSha256, result.AfterSha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("TNF_SELFTEST_REPLACE_FAILED");
            var lines = (await File.ReadAllLinesAsync(target)).Where(x => x.Length > 0).ToArray();
            if (lines.Length != 3 || lines[0] != "00003,08:28,250526,1,001")
                throw new InvalidOperationException("TNF_SELFTEST_SORT_FAILED");

            var hashBeforeReject = await HashFileAsync(target, default);
            try
            {
                await ReplaceYearAsync(target,
                    ["00003,08:28,250527,1,001"], backup, "reject-year", hashBeforeReject);
                throw new InvalidOperationException("TNF_SELFTEST_INVALID_YEAR_NOT_REJECTED");
            }
            catch (InvalidOperationException error) when (error.Message == "TNF_LINE_YEAR_MISMATCH") { }
            var hashAfterReject = await HashFileAsync(target, default);
            if (!string.Equals(hashBeforeReject, hashAfterReject, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("TNF_SELFTEST_REJECT_CHANGED_TARGET");
        }
        finally
        {
            try { Directory.Delete(root, true); } catch { }
        }
    }

    private static void ValidateLineForYear(string line, int year)
    {
        if (!TnfLinePattern().IsMatch(line))
            throw new InvalidOperationException("TNF_LINE_FORMAT_INVALID");
        var token = line.Split(',')[2];
        if (!DateTime.TryParseExact(token, "ddMMyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var day))
            throw new InvalidOperationException("TNF_LINE_DATE_INVALID");
        if (day.Year != year)
            throw new InvalidOperationException("TNF_LINE_YEAR_MISMATCH");
    }

    private static (DateTime Day, TimeSpan Time, string Card) LineKey(string line)
    {
        var p = line.Split(',');
        var day = DateTime.ParseExact(p[2], "ddMMyy", CultureInfo.InvariantCulture);
        var time = TimeSpan.ParseExact(p[1], @"hh\:mm", CultureInfo.InvariantCulture);
        return (day.Date, time, p[0]);
    }

    private static bool TryTargetYear(string fileName, out int year)
    {
        year = 0;
        if (fileName.Length != 10 ||
            !fileName.StartsWith("TR", StringComparison.OrdinalIgnoreCase) ||
            !fileName.EndsWith(".Tnf", StringComparison.OrdinalIgnoreCase))
            return false;
        return int.TryParse(fileName.AsSpan(2, 4), NumberStyles.None, CultureInfo.InvariantCulture, out year)
            && year is >= 2000 and <= 2199;
    }

    private static async Task<string> HashFileAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(path);
        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string Hash(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
