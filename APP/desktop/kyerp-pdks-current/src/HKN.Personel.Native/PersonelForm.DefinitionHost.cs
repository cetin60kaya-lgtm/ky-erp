using FirebirdSql.Data.FirebirdClient;

namespace HKN.Personel.Native;

public partial class PersonelForm
{
    public void OpenOrganizationDefinition(string table)
    {
        var value = OrganizationTypes.FirstOrDefault(x =>
            x.Table.Equals(table, StringComparison.OrdinalIgnoreCase));
        if (value is null)
        {
            ShowOrganizationDefinitions();
            return;
        }

        using var dialog = Dialog(value.Label + " Tanımları", 620, 500);
        var root = Root(2);
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var grid = Grid();
        root.Controls.Add(grid, 0, 0);
        var bar = Bar(out var close, out var edit, out var add, out var delete);
        root.Controls.Add(bar, 0, 1);
        dialog.Controls.Add(root);
        dialog.AcceptButton = close;

        void RefreshGrid()
        {
            grid.DataSource = Q($"select KOD,AD from {value.Table} order by AD");
            if (grid.Columns.Contains("KOD")) grid.Columns["KOD"].HeaderText = "Kod";
            if (grid.Columns.Contains("AD")) grid.Columns["AD"].HeaderText = "Adı";
        }

        void Run(Action action)
        {
            try
            {
                action();
                RefreshGrid();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, value.Label + " Tanımları", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        add.Click += (_,_) => Run(() =>
        {
            if (!NameDialog("Yeni " + value.Label, "", out var name)) return;
            Exec($"insert into {value.Table} (KOD,AD) values (@K,@A)",
                new FbParameter("@K", Next(value.Table, "KOD")),
                new FbParameter("@A", RequiredName(name)));
        });

        edit.Click += (_,_) => Run(() =>
        {
            var row = SelectedRow(grid);
            if (!NameDialog(value.Label + " Düzenle", Convert.ToString(row.Cells["AD"].Value) ?? "", out var name)) return;
            Exec($"update {value.Table} set AD=@A where KOD=@K",
                new FbParameter("@A", RequiredName(name)),
                new FbParameter("@K", row.Cells["KOD"].Value));
        });

        delete.Click += (_,_) => Run(() =>
        {
            var row = SelectedRow(grid);
            var code = row.Cells["KOD"].Value;
            var usage = KYERP.PDKS.Core.Definitions.DefinitionUsageGuard.FindUsage(db, value.Kind, code);
            if (usage.Count > 0)
                throw new InvalidOperationException(KYERP.PDKS.Core.Definitions.DefinitionUsageGuard.BlockMessage(usage));
            if (MessageBox.Show("Seçili tanım silinsin mi?", value.Label + " Tanımları", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
                Exec($"delete from {value.Table} where KOD=@K", new FbParameter("@K", code));
        });

        RefreshGrid();
        dialog.ShowDialog(this);
        Reload();
    }
}
