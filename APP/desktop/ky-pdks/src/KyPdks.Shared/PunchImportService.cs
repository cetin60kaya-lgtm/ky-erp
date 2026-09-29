using System.Text;

namespace KyPdks.Shared;

public sealed record PunchImportResult(int Files, int Parsed, int Added, int Duplicate, int Rejected, IReadOnlyList<string> Errors);

public sealed class PunchImportService(LocalPdksStore store)
{
    public async Task<PunchImportResult> ImportFilesAsync(IEnumerable<string> files, string encodingName, CancellationToken ct = default)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Encoding encoding;
        try { encoding = Encoding.GetEncoding(string.IsNullOrWhiteSpace(encodingName) ? "windows-1254" : encodingName.Trim()); }
        catch { encoding = new UTF8Encoding(false); }

        var fileCount = 0;
        var parsed = 0;
        var added = 0;
        var duplicate = 0;
        var rejected = 0;
        var errors = new List<string>();

        foreach (var file in files.Where(File.Exists))
        {
            ct.ThrowIfCancellationRequested();
            fileCount++;
            try
            {
                var lines = await File.ReadAllLinesAsync(file, encoding, ct);
                for (var index = 0; index < lines.Length; index++)
                {
                    ct.ThrowIfCancellationRequested();
                    var line = lines[index];
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var sourceRef = $"{Path.GetFileName(file)}:{index + 1}";
                    if (!PunchParser.TryParse(line, sourceRef, out var punch) || punch is null)
                    {
                        rejected++;
                        if (errors.Count < 50) errors.Add($"{sourceRef} · okunamadı: {line}");
                        continue;
                    }

                    parsed++;
                    if (await store.AddAsync(punch, ct)) added++;
                    else duplicate++;
                }
            }
            catch (Exception error)
            {
                rejected++;
                if (errors.Count < 50) errors.Add($"{Path.GetFileName(file)} · {error.Message}");
            }
        }

        return new PunchImportResult(fileCount, parsed, added, duplicate, rejected, errors);
    }
}
