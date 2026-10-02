using System.Globalization;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class StagedDbRecordTnf(string path, string backup, string temporary) : IDisposable
{
    bool published;
    internal string BackupPath => backup;
    internal void Publish()
    {
        File.Move(temporary, path, true);
        published = true;
    }
    internal void Restore()
    {
        if (published && File.Exists(backup)) File.Copy(backup, path, true);
    }
    public void Dispose() { if (File.Exists(temporary)) File.Delete(temporary); }
}

internal static class DbRecordTnfCoordinator
{
    internal static StagedDbRecordTnf Stage(FbConnection connection, FbTransaction transaction, string path,
        IEnumerable<(string Card, DateTime Day)> scope, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new FileNotFoundException("DB işlemi için ana TNF dosyası bulunamadı.", path);
        var keys = scope.Select(x => (Card: x.Card.Trim().PadLeft(5, '0'), Day: x.Day.Date)).Distinct().ToHashSet();
        if (keys.Count == 0) throw new InvalidOperationException("TNF eşitleme kapsamı boş.");
        var source = File.ReadAllLines(path).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        source.RemoveAll(line => TryKey(line, out var key) && keys.Contains(key));
        var expected = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in keys)
        {
            token.ThrowIfCancellationRequested();
            using var command = FirebirdDatabase.CreateCommand(connection, transaction,
                @"select PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR from GIRCIK
                  where PKNO=@P and ((GTARIH>=@D and GTARIH<@N) or (CTARIH>=@D and CTARIH<@N)) order by SIRA",
                new FbParameter("@P", key.Card), new FbParameter("@D", key.Day), new FbParameter("@N", key.Day.AddDays(1)));
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                AddSide(expected, reader, key.Card, key.Day, "G");
                AddSide(expected, reader, key.Card, key.Day, "C");
            }
        }
        source.AddRange(expected);
        var sorted = source.Distinct(StringComparer.Ordinal).OrderBy(LineKey).ToArray();
        var directory = Path.GetDirectoryName(path)!;
        var backupDirectory = Path.Combine(directory, "_YEDEK");
        Directory.CreateDirectory(backupDirectory);
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture);
        var backup = Path.Combine(backupDirectory, Path.GetFileNameWithoutExtension(path) + "_DBKAYIT_" + stamp + ".Tnf");
        var temporary = path + ".dbkayit." + Guid.NewGuid().ToString("N") + ".tmp";
        File.Copy(path, backup, false);
        File.WriteAllLines(temporary, sorted, Encoding.ASCII);
        return new(path, backup, temporary);
    }

    static void AddSide(HashSet<string> expected, FbDataReader reader, string card, DateTime day, string prefix)
    {
        var dateOrdinal = reader.GetOrdinal(prefix + "TARIH");
        var timeOrdinal = reader.GetOrdinal(prefix + "SAAT");
        var typeOrdinal = reader.GetOrdinal(prefix + "TUR");
        if (reader.IsDBNull(dateOrdinal) || reader.IsDBNull(timeOrdinal)) return;
        var date = reader.GetDateTime(dateOrdinal).Date;
        if (date != day) return;
        var type = reader.IsDBNull(typeOrdinal) ? "" : Convert.ToString(reader.GetValue(typeOrdinal))?.Trim() ?? "";
        if (string.Equals(type, "E", StringComparison.OrdinalIgnoreCase)) return;
        var raw = Convert.ToString(reader.GetValue(timeOrdinal))?.Trim() ?? "";
        if (!TimeSpan.TryParse(raw, out var time)) return;
        expected.Add($"{card},{time.Hours:00}:{time.Minutes:00},{day:ddMMyy},1,001");
    }

    static bool TryKey(string line, out (string Card, DateTime Day) key)
    {
        key = default;
        var p = line.Split(',');
        if (p.Length != 5 || !DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return false;
        key = (p[0].Trim().PadLeft(5, '0'), day.Date);
        return true;
    }

    static (DateTime Day, TimeSpan Time, string Card, string Raw) LineKey(string line)
    {
        var p = line.Split(',');
        if (p.Length >= 3 && DateTime.TryParseExact(p[2].Trim(), "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)
            && TimeSpan.TryParse(p[1].Trim(), out var time)) return (day.Date, time, p[0].Trim(), line);
        return (DateTime.MaxValue, TimeSpan.MaxValue, line, line);
    }
}
