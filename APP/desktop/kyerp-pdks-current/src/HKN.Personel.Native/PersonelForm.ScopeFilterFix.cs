using System.Data;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    bool employmentScopeFixWired;
    bool employmentFilterApplying;

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
        if (employmentFilterApplying || IsDisposed || !IsHandleCreated || list.DataSource is not DataTable dt) return;

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

        var wanted = string.Join(" AND ", filters);
        var view = dt.DefaultView;
        // Opening an already filtered tab should never reset the current cell.
        if (string.Equals(view.RowFilter, wanted, StringComparison.Ordinal))
        {
            UpdateClassicStats();
            return;
        }

        employmentFilterApplying = true;
        personLoadTimer.Stop();
        pendingPersonPk = string.Empty;
        var selectedPk = list.CurrentRow?.DataBoundItem is DataRowView current
            ? Convert.ToString(current.Row["PKNO"])?.Trim()
            : currentPk;

        list.SuspendLayout();
        try
        {
            // Release the current cell before RowFilter changes binding visibility.
            // The old code tried to select a cell that had just become invisible.
            try { list.CurrentCell = null; }
            catch (InvalidOperationException) { list.ClearSelection(); }

            try { view.RowFilter = wanted; }
            catch (EvaluateException)
            {
                view.RowFilter = scopeActive.Checked ? "ICTARIH IS NULL"
                    : scopePassive.Checked ? "ICTARIH IS NOT NULL" : string.Empty;
            }
            catch (SyntaxErrorException)
            {
                view.RowFilter = scopeActive.Checked ? "ICTARIH IS NULL"
                    : scopePassive.Checked ? "ICTARIH IS NOT NULL" : string.Empty;
            }

            list.ClearSelection();
            var visibleColumn = list.Columns.Cast<DataGridViewColumn>()
                .Where(column => column.Visible)
                .OrderBy(column => column.DisplayIndex)
                .FirstOrDefault();

            DataGridViewRow? target = null;
            if (!string.IsNullOrWhiteSpace(selectedPk))
            {
                target = list.Rows.Cast<DataGridViewRow>().FirstOrDefault(row =>
                    row.Visible && !row.IsNewRow &&
                    row.DataBoundItem is DataRowView bound &&
                    string.Equals(Convert.ToString(bound.Row["PKNO"])?.Trim(), selectedPk, StringComparison.OrdinalIgnoreCase));
            }
            target ??= list.Rows.Cast<DataGridViewRow>()
                .FirstOrDefault(row => row.Visible && !row.IsNewRow);

            if (target is not null && visibleColumn is not null)
            {
                var cell = target.Cells[visibleColumn.Index];
                if (target.Visible && visibleColumn.Visible && cell.Visible)
                {
                    try
                    {
                        list.CurrentCell = cell;
                        target.Selected = true;
                    }
                    catch (InvalidOperationException)
                    {
                        // A binding reset can invalidate the row between the visibility
                        // check and assignment; keep the filter without crashing the UI.
                        list.ClearSelection();
                    }
                }
            }
        }
        finally
        {
            list.ResumeLayout();
            employmentFilterApplying = false;
        }
        UpdateClassicStats();
    }

}
