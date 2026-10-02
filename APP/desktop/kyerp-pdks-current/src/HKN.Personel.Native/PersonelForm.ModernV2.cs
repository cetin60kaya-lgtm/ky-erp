namespace HKN.Personel.Native;

public partial class PersonelForm
{
    static readonly Color UiCanvas = Color.FromArgb(244,247,251);
    static readonly Color UiSurface = Color.White;
    static readonly Color UiBorder = Color.FromArgb(226,232,240);
    static readonly Color UiText = Color.FromArgb(15,23,42);
    static readonly Color UiMuted = Color.FromArgb(100,116,139);
    static readonly Color UiPrimary = Color.FromArgb(37,99,235);

    void BuildUiModernV2()
    {
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Segoe UI", 9f);
        BackColor = UiCanvas;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            Padding = new Padding(14),
            BackColor = UiCanvas,
            Margin = Padding.Empty
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 350));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 12));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var left = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = UiSurface,
            Padding = new Padding(0),
            Margin = Padding.Empty
        };
        left.Paint += PaintCardBorder;

        var leftLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 4,
            Padding = new Padding(14),
            BackColor = UiSurface
        };
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        leftLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        leftLayout.Controls.Add(BuildModernPersonnelFilter(), 0, 0);

        BuildClassicList();
        list.Margin = new Padding(0, 4, 0, 8);
        list.BackgroundColor = UiSurface;
        list.BorderStyle = BorderStyle.None;
        list.RowHeadersVisible = false;
        list.RowTemplate.Height = 32;
        list.ColumnHeadersHeight = 36;
        list.EnableHeadersVisualStyles = false;
        list.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(248,250,252);
        list.ColumnHeadersDefaultCellStyle.ForeColor = UiMuted;
        list.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        list.DefaultCellStyle.BackColor = UiSurface;
        list.DefaultCellStyle.ForeColor = UiText;
        list.DefaultCellStyle.SelectionBackColor = Color.FromArgb(219,234,254);
        list.DefaultCellStyle.SelectionForeColor = UiText;
        list.GridColor = Color.FromArgb(241,245,249);
        leftLayout.Controls.Add(list, 0, 1);

        leftLayout.Controls.Add(BuildModernListActions(), 0, 2);
        leftLayout.Controls.Add(BuildModernListStatus(), 0, 3);
        left.Controls.Add(leftLayout);
        root.Controls.Add(left, 0, 0);

        var spacer = new Panel { Dock = DockStyle.Fill, BackColor = UiCanvas };
        root.Controls.Add(spacer, 1, 0);

        var right = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = UiSurface,
            Padding = new Padding(0),
            Margin = Padding.Empty
        };
        right.Paint += PaintCardBorder;
        var rightLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 3,
            Padding = new Padding(16),
            BackColor = UiSurface
        };
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 122));
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        rightLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        rightLayout.Controls.Add(BuildModernPersonHeader(), 0, 0);

        BuildTabsClassic();
        tabs.Margin = new Padding(0, 10, 0, 8);
        tabs.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        rightLayout.Controls.Add(tabs, 0, 1);
        rightLayout.Controls.Add(BuildModernPersonActions(), 0, 2);
        right.Controls.Add(rightLayout);
        root.Controls.Add(right, 2, 0);

        Controls.Add(root);

        list.DataBindingComplete += (_,_) => { ConfigureListColumns(); UpdateClassicStats(); };
        tabs.SelectedIndexChanged += (_,_) => { ApplyClassicGridStyles(); RefreshSelectedTab(); };
        personLoadTimer.Tick += (_,_) =>
        {
            personLoadTimer.Stop();
            var pk = pendingPersonPk;
            if (pk.Length > 0 && pk != currentPk) LoadPerson(pk);
        };
    }

    Control BuildModernPersonnelFilter()
    {
        var box = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            BackColor = UiSurface,
            Padding = Padding.Empty
        };
        box.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        box.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        var title = new Label
        {
            Text = "Personel",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = UiText,
            TextAlign = ContentAlignment.MiddleLeft
        };
        box.Controls.Add(title, 0, 0);

        var filter = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            BackColor = UiSurface,
            Padding = new Padding(0, 7, 0, 0)
        };
        searchField.Items.Clear();
        searchField.Items.AddRange(new object[]{"Kart No","Ad","Soyad","İşe Giriş Tarihi","İşten Çıkış Tarihi"});
        searchField.SelectedIndex = 0;
        searchField.Width = 82;
        searchField.FlatStyle = FlatStyle.Flat;
        searchText.Width = 112;
        searchText.PlaceholderText = "Ara...";
        filter.Controls.Add(searchField);
        filter.Controls.Add(searchText);
        filter.Controls.Add(scopeActive);
        filter.Controls.Add(scopePassive);
        filter.Controls.Add(scopeAll);

        searchText.TextChanged += (_,_) => ApplyClassicSearch();
        searchField.SelectedIndexChanged += (_,_) => ApplyClassicSearch();
        scopeActive.CheckedChanged += (_,_) => { if(scopeActive.Checked) Reload(); };
        scopePassive.CheckedChanged += (_,_) => { if(scopePassive.Checked) Reload(); };
        scopeAll.CheckedChanged += (_,_) => { if(scopeAll.Checked) Reload(); };

        box.Controls.Add(filter, 0, 1);
        return box;
    }

    Control BuildModernListActions()
    {
        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            BackColor = UiSurface,
            Padding = new Padding(0, 3, 0, 0)
        };
        var add = ModernActionButton("Yeni Personel", true, () => OpenPersonEditor(true), 118);
        var edit = ModernActionButton("Düzenle", false, () => OpenPersonEditor(false), 88);
        bar.Controls.Add(add);
        bar.Controls.Add(edit);
        return bar;
    }

    Control BuildModernListStatus()
    {
        var panel = new Panel { Dock = DockStyle.Fill, BackColor = UiSurface };
        stListed.Dock = DockStyle.Left;
        stListed.Width = 150;
        stListed.ForeColor = UiMuted;
        stListed.Font = new Font("Segoe UI", 8f);
        stListed.TextAlign = ContentAlignment.MiddleLeft;
        stActive.Dock = DockStyle.Right;
        stActive.Width = 160;
        stActive.ForeColor = UiMuted;
        stActive.Font = new Font("Segoe UI", 8f);
        stActive.TextAlign = ContentAlignment.MiddleRight;
        panel.Controls.Add(stListed);
        panel.Controls.Add(stActive);
        return panel;
    }

    Control BuildModernPersonHeader()
    {
        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 4,
            BackColor = UiSurface,
            Padding = new Padding(0, 0, 0, 6)
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 78));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 86));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));

        AddModernHeaderField(header, 0, "Kart No", "PKNO");
        AddModernHeaderField(header, 1, "Grup", "GRUPAD", false);
        AddModernHeaderField(header, 2, "Ad", "AD");
        AddModernHeaderField(header, 3, "Bölüm", "BOLUMAD", false);
        AddModernHeaderField(header, 4, "Soyad", "SOYAD");
        AddModernHeaderField(header, 5, "Görev", "GOREVAD", false);
        AddModernHeaderField(header, 6, "Maaş", "MAAS");
        AddModernHeaderField(header, 7, "Firma", "FIRMAAD", false);
        return header;
    }

    void AddModernHeaderField(TableLayoutPanel table, int index, string label, string key, bool editable = true)
    {
        var row = index / 2;
        var col = (index % 2) * 2;
        table.Controls.Add(new Label
        {
            Text = label,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = UiMuted,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold)
        }, col, row);
        var box = new TextBox
        {
            Dock = DockStyle.Fill,
            ReadOnly = !editable,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = editable ? Color.White : Color.FromArgb(248,250,252),
            ForeColor = UiText,
            Margin = new Padding(0, 3, 12, 3)
        };
        f[key] = box;
        table.Controls.Add(box, col + 1, row);
    }

    Control BuildModernPersonActions()
    {
        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = UiSurface,
            Padding = new Padding(0, 6, 0, 0)
        };
        bar.Controls.Add(ModernActionButton("Personel Bilgisi", false, () => { if(currentPk!="") LoadPerson(currentPk); }, 112));
        bar.Controls.Add(ModernActionButton("Çıkış Ver", false, MarkExit, 94, danger:true));
        bar.Controls.Add(ModernActionButton("Düzenle", false, () => OpenPersonEditor(false), 92));
        bar.Controls.Add(ModernActionButton("Yeni Personel", true, () => OpenPersonEditor(true), 118));
        return bar;
    }

    Button ModernActionButton(string text, bool primary, Action action, int width, bool danger = false)
    {
        var button=PdksUiKit.Button(text,width,primary?PdksActionRole.Primary:danger?PdksActionRole.Danger:PdksActionRole.Secondary,action);
        button.Height=30;button.MinimumSize=new Size(width,30);button.MaximumSize=new Size(width,30);
        return button;
    }

    void PaintCardBorder(object? sender, PaintEventArgs e)
    {
        if (sender is not Panel panel) return;
        using var pen = new Pen(UiBorder);
        e.Graphics.DrawRectangle(pen, 0, 0, Math.Max(0, panel.Width - 1), Math.Max(0, panel.Height - 1));
    }
}
