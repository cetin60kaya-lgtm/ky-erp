using System.Text.Json;

namespace HKN.Personel.Native;

internal enum WorkspaceLayoutMode
{
    Single,
    TwoColumns,
    TwoRows,
    ThreeFocusRight,
    FourGrid
}

internal sealed class WorkspaceDockHost : UserControl
{
    sealed class Slot
    {
        public Panel Host { get; } = new() { Dock = DockStyle.Fill, BackColor = Color.White };
        public Label Title { get; } = new() { Dock = DockStyle.Top, Height = 28, TextAlign = ContentAlignment.MiddleLeft };
        public Control? Content { get; set; }
        public string Key { get; set; } = string.Empty;
    }

    readonly string userKey;
    readonly List<Slot> slots = new();
    readonly Panel root = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(241,245,250) };
    WorkspaceLayoutMode mode = WorkspaceLayoutMode.Single;
    int activeIndex;
    readonly Dictionary<string, int> splitDistances = new(StringComparer.OrdinalIgnoreCase);
    public WorkspaceDockHost(string userName)
    {
        userKey = Sanitize(userName);
        Dock = DockStyle.Fill;
        Controls.Add(root);
        for (var i = 0; i < 4; i++) slots.Add(CreateSlot(i));
        ApplyLayout(LoadMode(), false);
    }

    public WorkspaceLayoutMode Mode => mode;
    public int ActiveSlot => activeIndex;

    Slot CreateSlot(int index)
    {
        var slot = new Slot();
        slot.Title.Text = $"  Çalışma Alanı {index + 1}";
        slot.Title.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        slot.Title.ForeColor = Color.FromArgb(45, 68, 96);
        slot.Title.BackColor = Color.FromArgb(246, 249, 253);
        slot.Title.Cursor = Cursors.Hand;
        slot.Title.Click += (_, _) => SetActive(index);
        slot.Host.Controls.Add(slot.Title);
        slot.Host.Click += (_, _) => SetActive(index);
        return slot;
    }

    public void SetActive(int index)
    {
        if (index < 0 || index >= VisibleSlotCount()) return;
        activeIndex = index;
        RefreshHeaders();
    }
    public void Open(Control control, string key, string title)
    {
        var existing = slots.FindIndex(s => s.Key == key && s.Content is not null);
        if (existing >= 0)
        {
            SetActive(existing);
            BringContentFront(slots[existing]);
            return;
        }

        var index = activeIndex;
        if (slots[index].Content is not null)
        {
            var empty = slots.FindIndex(0, VisibleSlotCount(), s => s.Content is null);
            if (empty >= 0) index = empty;
        }
        SetActive(index);
        Attach(slots[index], control, key, title);
    }

    public void ShowSingle(Control control, string key, string title)
    {
        CloseAll(true);
        ApplyLayout(WorkspaceLayoutMode.Single, false);
        SetActive(0);
        Attach(slots[0], control, key, title);
    }

    void Attach(Slot slot, Control control, string key, string title)
    {
        DetachSlot(slot, true);
        slot.Key = key;
        slot.Content = control;
        slot.Title.Text = "  " + title;
        control.Dock = DockStyle.Fill;
        slot.Host.Controls.Add(control);
        control.BringToFront();
        slot.Title.BringToFront();
        RefreshHeaders();
    }
    public void ApplyLayout(WorkspaceLayoutMode layout, bool save = true)
    {
        mode = layout;
        root.SuspendLayout();
        var controls = slots.Select(s => s.Host).ToArray();
        foreach (var host in controls) host.Parent = null;
        root.Controls.Clear();

        Control layoutControl = layout switch
        {
            WorkspaceLayoutMode.TwoColumns => TwoColumns(),
            WorkspaceLayoutMode.TwoRows => TwoRows(),
            WorkspaceLayoutMode.ThreeFocusRight => ThreeFocusRight(),
            WorkspaceLayoutMode.FourGrid => FourGrid(),
            _ => Single()
        };
        root.Controls.Add(layoutControl);
        layoutControl.Dock = DockStyle.Fill;
        activeIndex = Math.Min(activeIndex, VisibleSlotCount() - 1);
        RefreshHeaders();
        root.ResumeLayout(true);
        if (save) SaveMode();
    }

    Control Single()
    {
        var panel = new Panel { Dock = DockStyle.Fill };
        panel.Controls.Add(slots[0].Host);
        return panel;
    }

    Control TwoColumns()
    {
        var split = Split("two-columns", Orientation.Vertical, .5);
        split.Panel1.Controls.Add(slots[0].Host);
        split.Panel2.Controls.Add(slots[1].Host);
        return split;
    }

    Control TwoRows()
    {
        var split = Split("two-rows", Orientation.Horizontal, .5);
        split.Panel1.Controls.Add(slots[0].Host);
        split.Panel2.Controls.Add(slots[1].Host);
        return split;
    }
    Control ThreeFocusRight()
    {
        var outer = Split("three-outer", Orientation.Vertical, .38);
        var left = Split("three-left", Orientation.Horizontal, .5);
        left.Panel1.Controls.Add(slots[0].Host);
        left.Panel2.Controls.Add(slots[1].Host);
        outer.Panel1.Controls.Add(left);
        outer.Panel2.Controls.Add(slots[2].Host);
        return outer;
    }

    Control FourGrid()
    {
        var outer = Split("four-outer", Orientation.Vertical, .5);
        var left = Split("four-left", Orientation.Horizontal, .5);
        var right = Split("four-right", Orientation.Horizontal, .5);
        left.Panel1.Controls.Add(slots[0].Host);
        left.Panel2.Controls.Add(slots[1].Host);
        right.Panel1.Controls.Add(slots[2].Host);
        right.Panel2.Controls.Add(slots[3].Host);
        outer.Panel1.Controls.Add(left);
        outer.Panel2.Controls.Add(right);
        return outer;
    }

    SplitContainer Split(string key, Orientation orientation, double ratio)
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = orientation,
            SplitterWidth = 7,
            BackColor = Color.FromArgb(223, 231, 241),
            Panel1MinSize = 220,
            Panel2MinSize = 220
        };
        split.HandleCreated += (_, _) =>
        {
            if (splitDistances.TryGetValue(key, out var saved)) SetDistance(split, saved);
            else SetRatio(split, ratio);
        };
        split.SplitterMoved += (_, _) =>
        {
            if (!split.IsHandleCreated) return;
            splitDistances[key] = split.SplitterDistance;
            SaveMode();
        };
        return split;
    }

    static void SetDistance(SplitContainer split, int distance)
    {
        var span = split.Orientation == Orientation.Vertical ? split.ClientSize.Width : split.ClientSize.Height;
        if (span > split.Panel1MinSize + split.Panel2MinSize)
            split.SplitterDistance = Math.Max(split.Panel1MinSize, Math.Min(distance, span - split.Panel2MinSize));
    }

    static void SetRatio(SplitContainer split, double ratio)
    {
        var span = split.Orientation == Orientation.Vertical ? split.ClientSize.Width : split.ClientSize.Height;
        if (span > split.Panel1MinSize + split.Panel2MinSize)
            split.SplitterDistance = Math.Max(split.Panel1MinSize, Math.Min((int)(span * ratio), span - split.Panel2MinSize));
    }
    public void CloseActive()
    {
        if (activeIndex < 0 || activeIndex >= slots.Count) return;
        DetachSlot(slots[activeIndex], true);
        RefreshHeaders();
    }

    public void CloseAll(bool dispose = true)
    {
        foreach (var slot in slots) DetachSlot(slot, dispose);
        RefreshHeaders();
    }

    void DetachSlot(Slot slot, bool dispose)
    {
        if (slot.Content is not null)
        {
            slot.Host.Controls.Remove(slot.Content);
            if (dispose && slot.Content is IDisposable d) d.Dispose();
        }
        slot.Content = null;
        slot.Key = string.Empty;
        slot.Title.Text = "  Boş çalışma alanı";
    }

    void BringContentFront(Slot slot)
    {
        slot.Content?.BringToFront();
        slot.Title.BringToFront();
    }

    void RefreshHeaders()
    {
        for (var i = 0; i < slots.Count; i++)
        {
            var active = i == activeIndex && i < VisibleSlotCount();
            slots[i].Title.BackColor = active ? Color.FromArgb(226, 238, 255) : Color.FromArgb(246, 249, 253);
            slots[i].Title.ForeColor = active ? Color.FromArgb(26, 91, 184) : Color.FromArgb(72, 88, 110);
        }
    }

    int VisibleSlotCount() => mode switch
    {
        WorkspaceLayoutMode.Single => 1,
        WorkspaceLayoutMode.TwoColumns or WorkspaceLayoutMode.TwoRows => 2,
        WorkspaceLayoutMode.ThreeFocusRight => 3,
        _ => 4
    };
    WorkspaceLayoutMode LoadMode()
    {
        try
        {
            var path = SettingsPath();
            if (!File.Exists(path)) return WorkspaceLayoutMode.Single;
            var json = File.ReadAllText(path);
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
            if (data is not null)
            {
                foreach (var pair in data.Where(x => x.Key.StartsWith("split:", StringComparison.OrdinalIgnoreCase)))
                    if (int.TryParse(pair.Value, out var distance)) splitDistances[pair.Key[6..]] = distance;
                if (data.TryGetValue("mode", out var value) && Enum.TryParse<WorkspaceLayoutMode>(value, out var parsed))
                    return parsed;
            }
        }
        catch { }
        return WorkspaceLayoutMode.Single;
    }

    void SaveMode()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath())!);
            var data = new Dictionary<string, string> { ["mode"] = mode.ToString() };
            foreach (var pair in splitDistances) data["split:" + pair.Key] = pair.Value.ToString();
            File.WriteAllText(SettingsPath(), JsonSerializer.Serialize(data));
        }
        catch { }
    }

    string SettingsPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KYERP", "PDKS", $"workspace-{userKey}.json");

    static string Sanitize(string value)
    {
        foreach (var c in Path.GetInvalidFileNameChars()) value = value.Replace(c, '_');
        return string.IsNullOrWhiteSpace(value) ? "user" : value;
    }
}
