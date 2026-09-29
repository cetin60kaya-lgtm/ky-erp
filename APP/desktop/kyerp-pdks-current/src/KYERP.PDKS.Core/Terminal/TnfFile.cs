using System.Text;

namespace KYERP.PDKS.Core.Terminal;

public static class TnfFile
{
    public static IReadOnlyList<TnfRecord> Parse(IEnumerable<string> lines)
    {
        var records = new List<TnfRecord>();
        var unique = new HashSet<string>(StringComparer.Ordinal);
        var lineNumber = 0;
        foreach (var line in lines)
        {
            lineNumber++;
            if (string.IsNullOrWhiteSpace(line)) throw new FormatException($"TNF satır {lineNumber}: boş satır kabul edilmez.");
            TnfRecord record;
            try { record = TnfRecord.Parse(line); }
            catch (FormatException exception) { throw new FormatException($"TNF satır {lineNumber}: {exception.Message}", exception); }
            if (!unique.Add(record.ToString())) throw new FormatException($"TNF satır {lineNumber}: duplicate kayıt kabul edilmez.");
            records.Add(record);
        }
        if (records.Count == 0) throw new FormatException("TNF dosyası en az bir kayıt içermelidir.");
        return records;
    }

    public static string Export(IEnumerable<TnfRecord> records)
    {
        var lines = records.Select(record => record.ToString()).ToArray();
        if (lines.Length == 0) throw new InvalidOperationException("Boş TNF dosyası üretilemez.");
        if (lines.Distinct(StringComparer.Ordinal).Count() != lines.Length)
            throw new InvalidOperationException("Duplicate TNF kayıtları dışa aktarılamaz.");
        return string.Join("\r\n", lines);
    }

    public static async Task<IReadOnlyList<TnfRecord>> ImportAsync(string path, CancellationToken cancellationToken = default) =>
        Parse(await File.ReadAllLinesAsync(path, Encoding.UTF8, cancellationToken));

    public static Task ExportAsync(string path, IEnumerable<TnfRecord> records, CancellationToken cancellationToken = default) =>
        File.WriteAllTextAsync(path, Export(records), new UTF8Encoding(false), cancellationToken);
}
