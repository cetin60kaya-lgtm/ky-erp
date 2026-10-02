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

/// <summary>
/// Owns the lifetime of hosted module controls. Module changes are swapped atomically so
/// the workspace never becomes visibly empty between two screens.
/// </summary>
internal sealed class WorkspaceDockHost : UserControl
{
    sealed class BufferedPanel : Panel
    {
        public BufferedPanel()
        {
            DoubleBuffered = true;
            ResizeRedraw = false;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
            UpdateStyles();
        }
    }

    sealed class Slot
    {
        public BufferedPanel Host { get; } = new() { Dock = DockStyle.Fill, BackColor = Color.White };
        public Label Title { get; } = new() { Dock = DockStyle.Top, Height = 34, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(10,0,0,0) };
        public Control? Content { get; set; }
        public string Key { get; set; } = string.Empty;
    }

    readonly string userKey;
    readonly List<Slot> slots = [];
    readonly BufferedPanel root = new() { Dock = DockStyle.Fill, BackColor = Color.FromArgb(241, 245, 250) };
    readonly Dictionary<string, int> splitDistances = new(StringComparer.OrdinalIgnoreCase);
    WorkspaceLayoutMode mode = WorkspaceLayoutMode.Single;
    int activeIndex;
    bool layoutBuilt;

    public WorkspaceDockHost(string userName)
    {
        userKey = Sanitize(userName);
        Dock = DockStyle.Fill;
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
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
        slot.Title.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        slot.Title.ForeColor = Color.FromArgb(51, 65, 85);
        slot.Title.BackColor = Color.White;
        slot.Title.Cursor = Cursors.Hand;
        slot.Title.Click += (_, _) => SetActive(index);
        slot.Host.Click += (_, _) => SetActive(index);
        slot.Host.Controls.Add(slot.Title);
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
        if (control is null || control.IsDisposed) return;

        var existingIndex = slots.FindIndex(s => string.Equals(s.Key, key, StringComparison.OrdinalIgnoreCase) && s.Content is not null);
        var targetIndex = existingIndex >= 0 ? existingIndex : activeIndex;
        if (existingIndex < 0 && slots[targetIndex].Content is not null)
        {
            var empty = slots.FindIndex(0, VisibleSlotCount(), s => s.Content is null);
            if (empty >= 0) targetIndex = empty;
        }

        SetActive(targetIndex);
        Replace(slots[targetIndex], control, key, title);
    }

    public void ShowSingle(Control control, string key, string title)
    {
        if (mode != WorkspaceLayoutMode.Single || !layoutBuilt)
            ApplyLayout(WorkspaceLayoutMode.Single, false);

        for (var i = 1; i < slots.Count; i++) DetachSlot(slots[i], true);
        SetActive(0);
        Replace(slots[0], control, key, title);
    }

    void Replace(Slot slot, Control control, string key, string title)
    {
        if (ReferenceEquals(slot.Content, control))
        {
            slot.Content.Visible = true;
            slot.Content.BringToFront();
            slot.Title.BringToFront();
            return;
        }

        var old = slot.Content;
        slot.Host.SuspendLayout();
        try
        {
            slot.Key = key;
            slot.Content = control;
            slot.Title.Text = "  " + title;
            control.Dock = DockStyle.Fill;
            control.Visible = false;
            slot.Host.Controls.Add(control);
            control.BringToFront();
            slot.Title.BringToFront();
            control.Visible = true;

            if (old is not null)
            {
                slot.Host.Controls.Remove(old);
                try { old.Dispose(); } catch { }
            }
        }
        finally
        {
            slot.Host.ResumeLayout(true);
        }
        RefreshHeaders();
    }

    public void ApplyLayout(WorkspaceLayoutMode layout, bool save = true)
    {
        if (layoutBuilt && mode == layout)
        {
            if (save) SaveMode();
            return;
        }

        mode = layout;
        root.SuspendLayout();
        try
        {
            foreach (var host in slots.Select(s => s.Host).ToArray()) host.Parent = null;
            root.Controls.Clear();
            Control layoutControl = layout switch
            {
                WorkspaceLayoutMode.TwoColumns => TwoColumns(),
                WorkspaceLayoutMode.TwoRows => TwoRows(),
                WorkspaceLayoutMode.ThreeFocusRight => ThreeFocusRight(),
                WorkspaceLayoutMode.FourGrid => FourGrid(),
                _ => Single()
            };
            layoutControl.Dock = DockStyle.Fill;
            root.Controls.Add(layoutControl);
            activeIndex = Math.Clamp(activeIndex, 0, Math.Max(0, VisibleSlotCount() - 1));
            layoutBuilt = true;
            RefreshHeaders();
        }
        finally
        {
            root.ResumeLayout(true);
        }
        if (IsHandleCreated) BeginInvoke(new Action(NormalizeSplitters));
        if (save) SaveMode();
    }

    Control Single()
    {
        var p = new BufferedPanel { Dock = DockStyle.Fill, BackColor = Color.White };
        p.Controls.Add(slots[0].Host);
        return p;
    }

    Control TwoColumns()
    {
        var s = Split("two-columns", Orientation.Vertical, .5);
        s.Panel1.Controls.Add(slots[0].Host);
        s.Panel2.Controls.Add(slots[1].Host);
        return s;
    }

    Control TwoRows()
    {
        var s = Split("two-rows", Orientation.Horizontal, .5);
        s.Panel1.Controls.Add(slots[0].Host);
        s.Panel2.Controls.Add(slots[1].Host);
        return s;
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
            Panel1MinSize = 80,
            Panel2MinSize = 80,
            BackColor = Color.FromArgb(223, 231, 241),
            Tag = new SplitState(key, ratio)
        };
        split.HandleCreated += (_, _) => QueueNormalize(split);
        split.SizeChanged += (_, _) => QueueNormalize(split);
        split.SplitterMoved += (_, _) =>
        {
            if (split.Tag is not SplitState state) return;
            splitDistances[state.Key] = split.SplitterDistance;
            SaveMode();
        };
        return split;
    }

    void QueueNormalize(SplitContainer split)
    {
        if (!split.IsHandleCreated || split.IsDisposed) return;
        BeginInvoke(new Action(() => NormalizeSplitter(split)));
    }

    void NormalizeSplitters()
    {
        foreach (var split in Descendants(root).OfType<SplitContainer>()) NormalizeSplitter(split);
    }

    void NormalizeSplitter(SplitContainer split)
    {
        if (split.IsDisposed || split.Tag is not SplitState state) return;
        var span = split.Orientation == Orientation.Vertical ? split.ClientSize.Width : split.ClientSize.Height;
        var min = split.Panel1MinSize;
        var max = span - split.SplitterWidth - split.Panel2MinSize;
        if (max < min) return;
        var requested = splitDistances.TryGetValue(state.Key, out var saved) ? saved : (int)Math.Round(span * state.Ratio);
        split.SplitterDistance = Math.Clamp(requested, min, max);
    }

    static IEnumerable<Control> Descendants(Control control)
    {
        foreach (Control child in control.Controls)
        {
            yield return child;
            foreach (var nested in Descendants(child)) yield return nested;
        }
    }

    sealed record SplitState(string Key, double Ratio);

    public void CloseActive()
    {
        if (activeIndex >= 0 && activeIndex < slots.Count) DetachSlot(slots[activeIndex], true);
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
            var old = slot.Content;
            slot.Host.Controls.Remove(old);
            if (dispose)
            {
                try { old.Dispose(); } catch { }
            }
            else old.Visible = false;
        }
        slot.Content = null;
        slot.Key = string.Empty;
        slot.Title.Text = "  Boş çalışma alanı";
    }

    void RefreshHeaders()
    {
        for (var i = 0; i < slots.Count; i++)
        {
            var active = i == activeIndex && i < VisibleSlotCount();
            slots[i].Title.Visible = mode != WorkspaceLayoutMode.Single;
            slots[i].Title.BackColor = active ? Color.FromArgb(239, 246, 255) : Color.White;
            slots[i].Title.ForeColor = active ? Color.FromArgb(37, 99, 235) : Color.FromArgb(71, 85, 105);
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
            var data = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path));
            if (data is null) return WorkspaceLayoutMode.Single;
            foreach (var pair in data.Where(x => x.Key.StartsWith("split:", StringComparison.OrdinalIgnoreCase)))
                if (int.TryParse(pair.Value, out var distance)) splitDistances[pair.Key[6..]] = distance;
            if (data.TryGetValue("mode", out var value) && Enum.TryParse<WorkspaceLayoutMode>(value, out var parsed)) return parsed;
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

    string SettingsPath() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KYERP", "PDKS", $"workspace-{userKey}.json");

    static string Sanitize(string value)
    {
        foreach (var c in Path.GetInvalidFileNameChars()) value = value.Replace(c, '_');
        return string.IsNullOrWhiteSpace(value) ? "user" : value;
    }
}
