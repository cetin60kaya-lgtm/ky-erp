using System.Runtime.CompilerServices;
using System.Text.Json;

namespace HKN.Personel.Native;

internal static class GridLayoutPersistence
{
    sealed class GridState
    {
        public bool Locked { get; set; }
        public List<ColumnState> Columns { get; set; } = [];
    }

    sealed class ColumnState
    {
        public string Name { get; set; } = string.Empty;
        public int DisplayIndex { get; set; }
        public int Width { get; set; }
        public bool Visible { get; set; } = true;
    }

    sealed class AttachmentMarker;

    static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    static readonly ConditionalWeakTable<DataGridView, AttachmentMarker> Attached = new();

    static string FileFor(string key)
    {
        CompanyDataPaths.Ensure();
        var safe = string.Concat(key.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        return Path.Combine(CompanyDataPaths.Config, $"grid-{safe}.json");
    }

    public static string AutoKey(DataGridView grid)
    {
        var form = grid.FindForm();
        var formName = form?.GetType().Name ?? "Form";
        var gridName = string.IsNullOrWhiteSpace(grid.Name) ? "Grid" : grid.Name;
        return $"auto-{formName}-{gridName}";
    }

    public static void Attach(DataGridView grid, string key, bool allowUserCustomization = true)
    {
        if (Attached.TryGetValue(grid, out _))
        {
            Apply(grid, key);
            return;
        }
        Attached.Add(grid, new AttachmentMarker());
        grid.AllowUserToOrderColumns = allowUserCustomization;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
        grid.ColumnAdded += (_, _) => BeginApply(grid, key);
        grid.DataBindingComplete += (_, _) => Apply(grid, key);
        grid.ColumnDisplayIndexChanged += (_, _) => SaveIfReady(grid, key);
        grid.ColumnWidthChanged += (_, _) => SaveIfReady(grid, key);
        grid.VisibleChanged += (_, _) => SaveIfReady(grid, key);
        BeginApply(grid, key);
    }

    public static void AttachAuto(DataGridView grid) => Attach(grid, AutoKey(grid));

    static void BeginApply(DataGridView grid, string key)
    {
        if (!grid.IsHandleCreated) return;
        try { grid.BeginInvoke(() => Apply(grid, key)); } catch { }
    }

    public static bool IsLocked(string key) => Load(key)?.Locked == true;

    public static void SetLocked(DataGridView grid, string key, bool locked)
    {
        var state = Capture(grid, locked);
        Save(key, state);
        grid.AllowUserToOrderColumns = !locked;
        foreach (DataGridViewColumn c in grid.Columns)
            c.Resizable = locked ? DataGridViewTriState.False : DataGridViewTriState.True;
    }

    public static void Reset(DataGridView grid, string key)
    {
        var file = FileFor(key);
        if (File.Exists(file)) File.Delete(file);
        for (var i = 0; i < grid.Columns.Count; i++)
        {
            grid.Columns[i].Visible = true;
            grid.Columns[i].DisplayIndex = i;
            grid.Columns[i].Width = Math.Max(70, grid.Columns[i].Width);
            grid.Columns[i].Resizable = DataGridViewTriState.True;
        }
        grid.AllowUserToOrderColumns = true;
    }

    public static void Apply(DataGridView grid, string key)
    {
        if (grid.Tag as string == "GRID_LAYOUT_APPLYING") return;
        var state = Load(key);
        if (state is null || state.Columns.Count == 0)
        {
            foreach (DataGridViewColumn c in grid.Columns)
            {
                if (c.Width < 55) c.Width = 90;
                c.Resizable = DataGridViewTriState.True;
            }
            return;
        }

        try
        {
            grid.Tag = "GRID_LAYOUT_APPLYING";
            foreach (var saved in state.Columns.OrderBy(c => c.DisplayIndex))
            {
                var column = grid.Columns.Cast<DataGridViewColumn>()
                    .FirstOrDefault(c => string.Equals(c.Name, saved.Name, StringComparison.OrdinalIgnoreCase) ||
                                         string.Equals(c.DataPropertyName, saved.Name, StringComparison.OrdinalIgnoreCase) ||
                                         string.Equals(c.HeaderText, saved.Name, StringComparison.OrdinalIgnoreCase));
                if (column is null) continue;
                column.Visible = saved.Visible;
                column.Width = Math.Clamp(saved.Width, 35, 1200);
                var maxIndex = Math.Max(0, grid.Columns.Count - 1);
                column.DisplayIndex = Math.Clamp(saved.DisplayIndex, 0, maxIndex);
                column.Resizable = state.Locked ? DataGridViewTriState.False : DataGridViewTriState.True;
            }
            grid.AllowUserToOrderColumns = !state.Locked;
        }
        finally { grid.Tag = null; }
    }

    public static void ShowEditor(IWin32Window owner, DataGridView grid, string key, string title = "Ekran Düzeni")
    {
        using var form = new Form
        {
            Text = title,
            StartPosition = FormStartPosition.CenterParent,
            Size = new Size(680, 680),
            MinimumSize = new Size(580, 500),
            Font = new Font("Segoe UI", 9f)
        };
        var list = new DataGridView
        {
            Dock = DockStyle.Fill,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = false,
            RowHeadersVisible = false,
            AutoGenerateColumns = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect
        };
        list.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Visible", HeaderText = "Göster", Width = 60 });
        list.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", HeaderText = "Alan", AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill, ReadOnly = true });
        list.Columns.Add(new DataGridViewTextBoxColumn { Name = "Width", HeaderText = "Genişlik", Width = 90 });
        foreach (DataGridViewColumn c in grid.Columns.Cast<DataGridViewColumn>().OrderBy(c => c.DisplayIndex))
            list.Rows.Add(c.Visible, c.HeaderText, c.Width);

        var actions = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 58, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var save = new Button { Text = "Kaydet", Width = 100, Height = 34 };
        var reset = new Button { Text = "Varsayılana Dön", Width = 130, Height = 34 };
        var up = new Button { Text = "Yukarı", Width = 90, Height = 34 };
        var down = new Button { Text = "Aşağı", Width = 90, Height = 34 };
        var locked = new CheckBox { Text = "Düzeni Kilitle", Checked = IsLocked(key), AutoSize = true, Padding = new Padding(8, 8, 8, 0) };
        actions.Controls.AddRange([save, reset, down, up, locked]);
        form.Controls.Add(list);
        form.Controls.Add(actions);

        up.Click += (_, _) => Move(list, -1);
        down.Click += (_, _) => Move(list, +1);
        reset.Click += (_, _) => { Reset(grid, key); form.DialogResult = DialogResult.OK; form.Close(); };
        save.Click += (_, _) =>
        {
            var byHeader = grid.Columns.Cast<DataGridViewColumn>()
                .ToDictionary(c => c.HeaderText, c => c, StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < list.Rows.Count; i++)
            {
                var header = Convert.ToString(list.Rows[i].Cells["Title"].Value) ?? string.Empty;
                if (!byHeader.TryGetValue(header, out var c)) continue;
                c.Visible = Convert.ToBoolean(list.Rows[i].Cells["Visible"].Value ?? true);
                if (int.TryParse(Convert.ToString(list.Rows[i].Cells["Width"].Value), out var width))
                    c.Width = Math.Clamp(width, 35, 1200);
                c.DisplayIndex = Math.Min(i, grid.Columns.Count - 1);
            }
            SetLocked(grid, key, locked.Checked);
            form.DialogResult = DialogResult.OK;
            form.Close();
        };
        form.ShowDialog(owner);
    }

    static void Move(DataGridView list, int direction)
    {
        if (list.CurrentRow is null) return;
        var i = list.CurrentRow.Index;
        var j = i + direction;
        if (j < 0 || j >= list.Rows.Count) return;
        var values = list.Rows[i].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        var other = list.Rows[j].Cells.Cast<DataGridViewCell>().Select(c => c.Value).ToArray();
        for (var c = 0; c < values.Length; c++)
        {
            list.Rows[i].Cells[c].Value = other[c];
            list.Rows[j].Cells[c].Value = values[c];
        }
        list.CurrentCell = list.Rows[j].Cells[1];
    }

    static void SaveIfReady(DataGridView grid, string key)
    {
        if (grid.Tag as string == "GRID_LAYOUT_APPLYING" || grid.Columns.Count == 0) return;
        try { Save(key, Capture(grid, IsLocked(key))); } catch { }
    }

    static GridState Capture(DataGridView grid, bool locked) => new()
    {
        Locked = locked,
        Columns = grid.Columns.Cast<DataGridViewColumn>()
            .Select(c => new ColumnState
            {
                Name = !string.IsNullOrWhiteSpace(c.DataPropertyName) ? c.DataPropertyName : (!string.IsNullOrWhiteSpace(c.Name) ? c.Name : c.HeaderText),
                DisplayIndex = c.DisplayIndex,
                Width = c.Width,
                Visible = c.Visible
            }).ToList()
    };

    static GridState? Load(string key)
    {
        try
        {
            var file = FileFor(key);
            return File.Exists(file) ? JsonSerializer.Deserialize<GridState>(File.ReadAllText(file)) : null;
        }
        catch { return null; }
    }

    static void Save(string key, GridState state)
    {
        var file = FileFor(key);
        File.WriteAllText(file, JsonSerializer.Serialize(state, JsonOptions));
    }
}
