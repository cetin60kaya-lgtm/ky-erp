using System.Text.Json;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    sealed class ShellLayoutState
    {
        public List<ShellItemState> Toolbar { get; set; } = [];
        public List<ShellItemState> Menu { get; set; } = [];
    }

    sealed class ShellItemState
    {
        public string Text { get; set; } = string.Empty;
        public int Order { get; set; }
        public int Width { get; set; }
        public bool Visible { get; set; } = true;
    }

    bool shellLayoutInitialized;
    static string ShellLayoutFile => Path.Combine(CompanyDataPaths.Config, "shell-layout.json");

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        InitializeShellLayoutCustomization();
    }

    void InitializeShellLayoutCustomization()
    {
        if (shellLayoutInitialized) return;
        shellLayoutInitialized = true;
        CompanyDataPaths.Ensure();
        ApplySavedShellLayout();

        var toolbarMenu = new ContextMenuStrip();
        toolbarMenu.Items.Add("Araç Çubuğu Düzeni...", null, (_, _) => ShowShellLayoutEditor(true));
        toolbarMenu.Items.Add("Varsayılan Araç Çubuğu", null, (_, _) => ResetShellLayout(true));
        tool.ContextMenuStrip = toolbarMenu;

        if (MainMenuStrip is not null)
        {
            var menuMenu = new ContextMenuStrip();
            menuMenu.Items.Add("Menü Düzeni...", null, (_, _) => ShowShellLayoutEditor(false));
            menuMenu.Items.Add("Varsayılan Menü Düzeni", null, (_, _) => ResetShellLayout(false));
            MainMenuStrip.ContextMenuStrip = menuMenu;
        }
    }

    void ShowShellLayoutEditor(bool toolbarMode)
    {
        var source = toolbarMode
            ? tool.Items.Cast<ToolStripItem>().Where(i => i is ToolStripButton).ToList()
            : (MainMenuStrip?.Items.Cast<ToolStripItem>()
                .Where(i => i.Alignment != ToolStripItemAlignment.Right).ToList() ?? []);

        using var form = new Form
        {
            Text = toolbarMode ? "Araç Çubuğu Düzeni" : "Ana Menü Düzeni",
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(650, 650),
            MinimumSize = new Size(560, 480),
            Font = new Font("Segoe UI", 9f)
        };
        var grid = new DataGridView
        {
            Dock = DockStyle.Fill,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            RowHeadersVisible = false,
            AutoGenerateColumns = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect
        };
        grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Visible", HeaderText = "Göster", Width = 65 });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Text", HeaderText = "Menü / Buton", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true });
        grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Width", HeaderText = "Genişlik", Width = 90 });
        foreach (var item in source) grid.Rows.Add(item.Visible, item.Text, Math.Max(40, item.Width));

        var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 58, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var save = new Button { Text = "Kaydet", Width = 100, Height = 34 };
        var reset = new Button { Text = "Varsayılana Dön", Width = 130, Height = 34 };
        var up = new Button { Text = "Yukarı", Width = 90, Height = 34 };
        var down = new Button { Text = "Aşağı", Width = 90, Height = 34 };
        actions.Controls.AddRange([save, reset, down, up]);
        form.Controls.Add(grid);
        form.Controls.Add(actions);

        up.Click += (_, _) => MoveShellRow(grid, -1);
        down.Click += (_, _) => MoveShellRow(grid, +1);
        reset.Click += (_, _) => { ResetShellLayout(toolbarMode); form.Close(); };
        save.Click += (_, _) =>
        {
            var current = source.ToDictionary(i => i.Text, StringComparer.OrdinalIgnoreCase);
            var ordered = new List<ToolStripItem>();
            foreach (DataGridViewRow row in grid.Rows)
            {
                var text = Convert.ToString(row.Cells["Text"].Value) ?? string.Empty;
                if (!current.TryGetValue(text, out var item)) continue;
                item.Visible = Convert.ToBoolean(row.Cells["Visible"].Value ?? true);
                if (int.TryParse(Convert.ToString(row.Cells["Width"].Value), out var width))
                {
                    item.AutoSize = false;
                    item.Width = Math.Clamp(width, 45, 260);
                }
                ordered.Add(item);
            }
            ReorderShellItems(toolbarMode, ordered);
            SaveShellLayout();
            form.Close();
        };
        form.ShowDialog(this);
    }

    static void MoveShellRow(DataGridView grid, int direction)
    {
        if (grid.CurrentRow is null) return;
        var a = grid.CurrentRow.Index;
        var b = a + direction;
        if (b < 0 || b >= grid.Rows.Count) return;
        var va = grid.Rows[a].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        var vb = grid.Rows[b].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        for (var i = 0; i < va.Length; i++)
        {
            grid.Rows[a].Cells[i].Value = vb[i];
            grid.Rows[b].Cells[i].Value = va[i];
        }
        grid.CurrentCell = grid.Rows[b].Cells[1];
    }

    void ReorderShellItems(bool toolbarMode, IReadOnlyList<ToolStripItem> ordered)
    {
        var collection = toolbarMode ? tool.Items : MainMenuStrip?.Items;
        if (collection is null) return;
        for (var index = 0; index < ordered.Count; index++)
        {
            var item = ordered[index];
            if (!collection.Contains(item)) continue;
            collection.Remove(item);
            collection.Insert(Math.Min(index, collection.Count), item);
        }
    }

    void ApplySavedShellLayout()
    {
        try
        {
            if (!File.Exists(ShellLayoutFile)) return;
            var state = JsonSerializer.Deserialize<ShellLayoutState>(File.ReadAllText(ShellLayoutFile));
            if (state is null) return;
            ApplyShellItems(tool.Items, state.Toolbar, false);
            if (MainMenuStrip is not null) ApplyShellItems(MainMenuStrip.Items, state.Menu, true);
        }
        catch { }
    }

    static void ApplyShellItems(ToolStripItemCollection collection, IReadOnlyList<ShellItemState> states, bool preserveRightAligned)
    {
        if (states.Count == 0) return;
        var map = collection.Cast<ToolStripItem>().ToDictionary(i => i.Text, StringComparer.OrdinalIgnoreCase);
        var ordered = new List<ToolStripItem>();
        foreach (var state in states.OrderBy(s => s.Order))
        {
            if (!map.TryGetValue(state.Text, out var item)) continue;
            if (preserveRightAligned && item.Alignment == ToolStripItemAlignment.Right) continue;
            item.Visible = state.Visible;
            item.AutoSize = false;
            item.Width = Math.Clamp(state.Width, 45, 260);
            ordered.Add(item);
        }
        for (var i = 0; i < ordered.Count; i++)
        {
            var item = ordered[i];
            collection.Remove(item);
            collection.Insert(Math.Min(i, collection.Count), item);
        }
    }

    void SaveShellLayout()
    {
        try
        {
            CompanyDataPaths.Ensure();
            var state = new ShellLayoutState
            {
                Toolbar = tool.Items.Cast<ToolStripItem>()
                    .Where(i => i is ToolStripButton)
                    .Select((i, n) => new ShellItemState { Text = i.Text, Order = n, Width = i.Width, Visible = i.Visible }).ToList(),
                Menu = (MainMenuStrip?.Items.Cast<ToolStripItem>() ?? Enumerable.Empty<ToolStripItem>())
                    .Where(i => i.Alignment != ToolStripItemAlignment.Right)
                    .Select((i, n) => new ShellItemState { Text = i.Text, Order = n, Width = i.Width, Visible = i.Visible }).ToList()
            };
            File.WriteAllText(ShellLayoutFile, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }

    void ResetShellLayout(bool toolbarMode)
    {
        try
        {
            if (File.Exists(ShellLayoutFile)) File.Delete(ShellLayoutFile);
        }
        catch { }
        MessageBox.Show(
            toolbarMode ? "Araç çubuğu düzeni varsayılana döndü. Uygulamayı yeniden açınca ilk düzen yüklenecek." : "Menü düzeni varsayılana döndü. Uygulamayı yeniden açınca ilk düzen yüklenecek.",
            "KY PDKS 6.0", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
