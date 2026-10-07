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
        if (sender is not RadioButton radio || !radio.Checked || !IsHandleCreated || IsDisposed) return;
        ApplyEmploymentScopeAndSearch();
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

        var selectedPk = list.CurrentRow?.DataBoundItem is DataRowView current
            ? Convert.ToString(current.Row["PKNO"])?.Trim()
            : currentPk;

        list.SuspendLayout();
        try
        {
            // Filtre değişirken CurrentCell eski/filtre dışı veya görünmez kolonda kalırsa
            // WinForms "Geçerli hücre görünmez bir hücreye ayarlanamaz" hatası verebilir.
            list.CurrentCell = null;

            try
            {
                dt.DefaultView.RowFilter = string.Join(" AND ", filters);
            }
            catch
            {
                dt.DefaultView.RowFilter = scopeActive.Checked ? "ICTARIH IS NULL" : scopePassive.Checked ? "ICTARIH IS NOT NULL" : string.Empty;
            }

            ConfigureListColumns();
            list.ClearSelection();

            DataGridViewRow? target = null;
            if (!string.IsNullOrWhiteSpace(selectedPk))
            {
                target = list.Rows.Cast<DataGridViewRow>().FirstOrDefault(r =>
                    r.DataBoundItem is DataRowView drv &&
                    string.Equals(Convert.ToString(drv.Row["PKNO"])?.Trim(), selectedPk, StringComparison.OrdinalIgnoreCase));
            }
            target ??= list.Rows.Cast<DataGridViewRow>().FirstOrDefault(r => r.Visible && !r.IsNewRow);

            var visibleColumn = list.Columns.Cast<DataGridViewColumn>()
                .Where(col => col.Visible)
                .OrderBy(col => col.DisplayIndex)
                .FirstOrDefault();

            if (target is not null && visibleColumn is not null)
            {
                target.Selected = true;
                list.CurrentCell = target.Cells[visibleColumn.Index];
            }
        }
        finally
        {
            list.ResumeLayout();
        }

        UpdateClassicStats();
    }
}
