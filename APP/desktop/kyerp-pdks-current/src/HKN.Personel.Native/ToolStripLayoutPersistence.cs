using System.Text.Json;

namespace HKN.Personel.Native;

internal static class ToolStripLayoutPersistence
{
    sealed class State { public List<ItemState> Items { get; set; } = []; }
    sealed class ItemState { public string Key { get; set; } = string.Empty; public int Order { get; set; } public bool Visible { get; set; } = true; }

    static string FileFor(string key)
    {
        CompanyDataPaths.Ensure();
        var safe = string.Concat(key.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        return Path.Combine(CompanyDataPaths.Config, $"toolbar-{safe}.json");
    }

    static string ItemKey(ToolStripItem item) => !string.IsNullOrWhiteSpace(item.Name) ? item.Name : item.Text;

    public static void Attach(ToolStrip strip, string key)
    {
        Apply(strip, key);
        var menu = new ContextMenuStrip();
        menu.Items.Add("Menü / Buton Düzenini Özelleştir", null, (_, _) => ShowEditor(strip.FindForm() ?? strip, strip, key));
        menu.Items.Add("Mevcut Düzeni Kaydet", null, (_, _) => Save(strip, key));
        menu.Items.Add("Varsayılan Düzene Dön", null, (_, _) => Reset(strip, key));
        strip.ContextMenuStrip = menu;
    }

    public static void Apply(ToolStrip strip, string key)
    {
        try
        {
            var file = FileFor(key);
            if (!File.Exists(file)) return;
            var state = JsonSerializer.Deserialize<State>(File.ReadAllText(file));
            if (state is null) return;
            var originals = strip.Items.Cast<ToolStripItem>().ToList();
            foreach (var s in state.Items)
            {
                var item = originals.FirstOrDefault(i => string.Equals(ItemKey(i), s.Key, StringComparison.OrdinalIgnoreCase));
                if (item is not null) item.Visible = s.Visible;
            }
            var ordered = originals.OrderBy(i => state.Items.FirstOrDefault(s => string.Equals(s.Key, ItemKey(i), StringComparison.OrdinalIgnoreCase))?.Order ?? int.MaxValue).ToList();
            strip.SuspendLayout();
            strip.Items.Clear();
            strip.Items.AddRange(ordered.ToArray());
            strip.ResumeLayout();
        }
        catch { }
    }

    public static void Save(ToolStrip strip, string key)
    {
        var state = new State
        {
            Items = strip.Items.Cast<ToolStripItem>().Select((i, n) => new ItemState { Key = ItemKey(i), Order = n, Visible = i.Visible }).ToList()
        };
        File.WriteAllText(FileFor(key), JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
    }

    public static void Reset(ToolStrip strip, string key)
    {
        var file = FileFor(key);
        if (File.Exists(file)) File.Delete(file);
        foreach (ToolStripItem item in strip.Items) item.Visible = true;
        MessageBox.Show("Düzen sıfırlandı. Varsayılan sıranın tamamen geri gelmesi için uygulamayı yeniden açın.", "KY PDKS 6.0", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    static void ShowEditor(IWin32Window owner, ToolStrip strip, string key)
    {
        using var form = new Form { Text = "Menü / Buton Düzeni", StartPosition = FormStartPosition.CenterParent, Size = new Size(560, 620), Font = new Font("Segoe UI", 9f) };
        var grid = new DataGridView { Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false, RowHeadersVisible = false, AutoGenerateColumns = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect };
        grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Visible", HeaderText = "Göster", Width = 60 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", HeaderText = "Menü / Buton", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true });
        foreach (ToolStripItem item in strip.Items) grid.Rows.Add(item.Visible, item.Text);

        var bar = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 54, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var save = new Button { Text = "Kaydet", Width = 100, Height = 34 };
        var up = new Button { Text = "Yukarı", Width = 90, Height = 34 };
        var down = new Button { Text = "Aşağı", Width = 90, Height = 34 };
        bar.Controls.AddRange([save, down, up]);
        form.Controls.Add(grid); form.Controls.Add(bar);
        up.Click += (_, _) => Move(grid, -1); down.Click += (_, _) => Move(grid, +1);
        save.Click += (_, _) =>
        {
            var items = strip.Items.Cast<ToolStripItem>().ToList();
            var reordered = new List<ToolStripItem>();
            foreach (DataGridViewRow row in grid.Rows)
            {
                var text = Convert.ToString(row.Cells["Title"].Value) ?? string.Empty;
                var item = items.FirstOrDefault(i => string.Equals(i.Text, text, StringComparison.Ordinal));
                if (item is null) continue;
                item.Visible = Convert.ToBoolean(row.Cells["Visible"].Value ?? true);
                reordered.Add(item);
            }
            strip.Items.Clear(); strip.Items.AddRange(reordered.ToArray()); Save(strip, key);
            form.DialogResult = DialogResult.OK; form.Close();
        };
        form.ShowDialog(owner);
    }

    static void Move(DataGridView grid, int direction)
    {
        if (grid.CurrentRow is null) return;
        var i = grid.CurrentRow.Index; var j = i + direction;
        if (j < 0 || j >= grid.Rows.Count) return;
        var a = grid.Rows[i].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        var b = grid.Rows[j].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        for (var c = 0; c < a.Length; c++) { grid.Rows[i].Cells[c].Value = b[c]; grid.Rows[j].Cells[c].Value = a[c]; }
        grid.CurrentCell = grid.Rows[j].Cells[1];
    }
}
