using System.Data;
using System.Text;

namespace HKN.PDKS.QuickEditor;

public static class CsvExporter
{
    public static string Save(DataTable table, string folder, string prefix)
    {
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, $"HKN_PDKS_{prefix}_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(';', table.Columns.Cast<DataColumn>().Select(c => Escape(c.ColumnName))));
        foreach (DataRow row in table.Rows)
            sb.AppendLine(string.Join(';', table.Columns.Cast<DataColumn>().Select(c => Escape(Convert.ToString(row[c]) ?? ""))));
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
        return path;
    }

    static string Escape(string value)
    {
        if (!value.Contains(';') && !value.Contains('"') && !value.Contains('\n')) return value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}
