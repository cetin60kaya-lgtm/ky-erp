namespace KYERP.PDKS.Core.Terminal;

public sealed record TerminalImportResult(
    IReadOnlyList<TerminalRecord> Records,
    IReadOnlyList<string> Errors,
    int DuplicateCount);

public static class TerminalRecordFile
{
    public static TerminalImportResult Parse(IEnumerable<string> lines)
    {
        var records = new List<TerminalRecord>();
        var errors = new List<string>();
        var hashes = new HashSet<string>(StringComparer.Ordinal);
        var duplicates = 0;
        var lineNumber = 0;
        foreach (var line in lines)
        {
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (!TerminalRecord.TryParse(line, out var record, out var error))
            {
                errors.Add($"Satır {lineNumber}: {error}");
                continue;
            }
            if (!hashes.Add(record!.SourceLineHash)) { duplicates++; continue; }
            records.Add(record);
        }
        return new TerminalImportResult(records, errors, duplicates);
    }
}
