using System.Data;
using System.Globalization;

namespace QuickDataTool;

internal static class MonthlyDbAudit
{
    static string Text(DataRow row, string field) =>
        Convert.ToString(row[field], CultureInfo.InvariantCulture)?.Trim() ?? "";

    static DateTime? Date(DataRow row, string field) =>
        row[field] == DBNull.Value ? null : Convert.ToDateTime(row[field]).Date;

    internal static bool Clock(string text, out int minutes)
    {
        minutes = 0;
        if (!TimeSpan.TryParseExact(text?.Trim(), @"hh\:mm", CultureInfo.InvariantCulture, out var time))
            return false;
        minutes = (int)time.TotalMinutes;
        return minutes is >= 0 and < 1440;
    }

    internal static List<DbMovement> Movements(DataTable records, AuditRequest request)
    {
        var moves = new List<DbMovement>();
        foreach (DataRow row in records.Rows)
        {
            foreach (var side in new[] { (Prefix: "G", Label: "Giriş"), (Prefix: "C", Label: "Çıkış") })
            {
                var date = Date(row, side.Prefix + "TARIH");
                if (date is null || date.Value < request.Start || date.Value >= request.End) continue;
                moves.Add(new(
                    Convert.ToInt32(row["SIRA"]),
                    Text(row, "PKNO"),
                    date.Value,
                    side.Label,
                    Text(row, side.Prefix + "SAAT"),
                    Text(row, side.Prefix + "TUR")));
            }
        }
        return moves;
    }
}
