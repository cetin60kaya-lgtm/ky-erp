using System.Data;
using System.Text;

namespace HKN.PDKS.QuickEditor;

public static class BulkPlanExporter
{
    public static string Save(DataTable table, string folder)
    {
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, $"HKN_PDKS_TOPLU_PLAN_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
        var sb = new StringBuilder();
        sb.AppendLine("PKNO;ADSOYAD;TARIH;GIRIS;CIKIS");
        foreach (DataRow r in table.Rows)
        {
            var date = Convert.ToDateTime(r["TARIH"]).ToString("dd.MM.yyyy");
            sb.AppendLine($"{r["PKNO"]};{r["ADSOYAD"]};{date};{r["GIRIS"]};{r["CIKIS"]}");
        }
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
        return path;
    }
}
