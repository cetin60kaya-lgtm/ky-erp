using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool employmentScopeFixWired;

    protected override void OnActivated(EventArgs e)
    {
        base.OnActivated(e);
        if (!employmentScopeFixWired)
        {
            employmentScopeFixWired = true;
            scopeActive.CheckedChanged += EmploymentScopeChanged;
            scopePassive.CheckedChanged += EmploymentScopeChanged;
            scopeAll.CheckedChanged += EmploymentScopeChanged;
            searchText.TextChanged += (_, _) => ApplyEmploymentScopeAndSearch();
            searchField.SelectedIndexChanged += (_, _) => ApplyEmploymentScopeAndSearch();
        }
        ApplyEmploymentScopeAndSearch();
    }

    void EmploymentScopeChanged(object? sender, EventArgs e)
    {
        if (sender is RadioButton radio && radio.Checked)
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
            filters.Add(column is "IGTARIH" or "ICTARIH"
                ? $"CONVERT({column}, 'System.String') LIKE '%{term}%'"
                : $"{column} LIKE '%{term}%'");
        }

        dt.DefaultView.RowFilter = string.Join(" AND ", filters);
        UpdateClassicStats();
        if (list.Rows.Count > 0 && list.CurrentRow is null)
            list.CurrentCell = list.Rows[0].Cells[0];
    }
}
