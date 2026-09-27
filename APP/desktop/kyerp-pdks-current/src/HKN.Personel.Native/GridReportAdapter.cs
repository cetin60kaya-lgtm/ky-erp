using System.Data;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

internal static class GridReportAdapter
{
    public static ReportTable ToReport(DataGridView grid, DataTable data, string title)
    {
        var columns = grid.Columns.Cast<DataGridViewColumn>()
            .Where(c => c.Visible)
            .OrderBy(c => c.DisplayIndex)
            .ToList();
        var headers = columns.Select(c => c.HeaderText).ToArray();
        var rows = new List<IReadOnlyList<string>>();
        foreach (DataRow row in data.Rows)
        {
            rows.Add(columns.Select(c =>
            {
                var name = !string.IsNullOrWhiteSpace(c.DataPropertyName) ? c.DataPropertyName : c.Name;
                if (!data.Columns.Contains(name)) name = c.HeaderText;
                return data.Columns.Contains(name) ? Convert.ToString(row[name]) ?? string.Empty : string.Empty;
            }).ToArray());
        }
        return CompanyBranding.Decorate(new ReportTable(title, headers, rows));
    }

    public static int[] VisibleWidths(DataGridView grid) => grid.Columns.Cast<DataGridViewColumn>()
        .Where(c => c.Visible)
        .OrderBy(c => c.DisplayIndex)
        .Select(c => c.Width)
        .ToArray();
}
