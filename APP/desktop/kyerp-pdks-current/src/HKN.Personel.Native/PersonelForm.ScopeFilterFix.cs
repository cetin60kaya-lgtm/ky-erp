using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool employmentScopeFixWired;

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (!Visible || IsDisposed) return;

        if (!employmentScopeFixWired)
        {
            employmentScopeFixWired = true;
            // Existing classic handlers reload the table. These handlers are deliberately wired
            // afterwards and apply the visible scope to the freshly loaded DataTable.
            scopeActive.CheckedChanged += EmploymentScopeChanged;
            scopePassive.CheckedChanged += EmploymentScopeChanged;
            scopeAll.CheckedChanged += EmploymentScopeChanged;
            searchText.TextChanged += (_, _) => ApplyEmploymentScopeAndSearch();
            searchField.SelectedIndexChanged += (_, _) => ApplyEmploymentScopeAndSearch();
        }

        BeginInvoke(new Action(ApplyEmploymentScopeAndSearch));
    }

    void EmploymentScopeChanged(object? sender, EventArgs e)
    {
        if (sender is RadioButton radio && radio.Checked && IsHandleCreated && !IsDisposed)
            BeginInvoke(new Action(ApplyEmploymentScopeAndSearch));
    }

    void ApplyEmploymentScopeAndSearch()
    {
        if (IsDisposed || list.DataSource is not DataTable dt) return;

        var filters = new List<string>();
        if (scopeActive.Checked) filters.Add("ICTARIH IS NULL");
        else if (scopePassive.Checked) filters.Add("ICTARIH IS NOT NULL");

        var term = (searchText.Text ?? string.Empty).Trim().Replace("'", "''");
        if (term.Length > 0)
        {
            var column = searchField.SelectedIndex switch
            {
                1 => "AD",
                2 => "SOYAD",
                3 => "IGTARIH",
                4 => "ICTARIH",
                _ => "PKNO"
            };
            filters.Add($"CONVERT({column}, 'System.String') LIKE '%{term}%'");
        }

        try
        {
            dt.DefaultView.RowFilter = string.Join(" AND ", filters);
        }
        catch
        {
            // Never leave a stale filter if a legacy database exposes a different column type.
            dt.DefaultView.RowFilter = scopeActive.Checked ? "ICTARIH IS NULL" : scopePassive.Checked ? "ICTARIH IS NOT NULL" : string.Empty;
        }

        if (list.Columns.Contains("ICTARIH"))
            list.Columns["ICTARIH"].Visible = !scopeActive.Checked;
        if (list.Columns.Contains("MAAS"))
            list.Columns["MAAS"].Visible = true;

        UpdateClassicStats();
        if (list.Rows.Count > 0 && list.CurrentRow is null)
            list.CurrentCell = list.Rows[0].Cells[0];
    }
}
