using System.Data;

namespace HKN.PDKS.QuickEditor;

public static class BulkPlanner
{
    public static void FillDays(CheckedListBox days, DateTime month)
    {
        days.Items.Clear();
        for (var d = 1; d <= DateTime.DaysInMonth(month.Year, month.Month); d++)
            days.Items.Add(new DateTime(month.Year, month.Month, d), true);
    }

    public static DataTable Prepare(DataGridView peopleGrid, CheckedListBox days)
    {
        var selected = peopleGrid.SelectedRows.Cast<DataGridViewRow>().Where(x => !x.IsNewRow).ToList();
        if (selected.Count == 0) throw new InvalidOperationException("Personel sekmesinden en az bir personel seçin.");
        var checkedDays = days.CheckedItems.Cast<DateTime>().OrderBy(x => x).ToList();
        if (checkedDays.Count == 0) throw new InvalidOperationException("En az bir gün seçin.");

        var dt = new DataTable();
        foreach (var name in new[] { "PKNO", "ADSOYAD", "GIRIS", "CIKIS" }) dt.Columns.Add(name);
        dt.Columns.Add("TARIH", typeof(DateTime));
        foreach (var p in selected)
            foreach (var date in checkedDays)
                dt.Rows.Add(Convert.ToString(p.Cells["PKNO"].Value), $"{p.Cells["AD"].Value} {p.Cells["SOYAD"].Value}", "", "", date);
        return dt;
    }
}
