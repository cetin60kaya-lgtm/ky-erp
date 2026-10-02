namespace HKN.Personel.Native;

internal sealed class ManagementCenterForm : Form
{
    readonly IReadOnlyList<PdksCommandDescriptor> commands;
    readonly Action<PdksCommandId> execute;
    readonly TextBox search = new(){Width=300,PlaceholderText="İşlem ara..."};
    readonly ComboBox groupFilter = new(){Width=180,DropDownStyle=ComboBoxStyle.DropDownList};
    Panel? host;

    public ManagementCenterForm(IEnumerable<PdksCommandDescriptor> commandSet, Action<PdksCommandId> commandExecutor)
    {
        commands = commandSet.OrderBy(x=>x.Order).ToArray();
        execute = commandExecutor;
        Text = "Yönetim Merkezi";
        FormBorderStyle = FormBorderStyle.None;
        TopLevel = false;
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI", 9f);

        groupFilter.Items.Add("Tüm Bölümler");
        foreach(var group in commands.Select(x=>x.Group).Distinct().OrderBy(x=>x))
            groupFilter.Items.Add(group);
        groupFilter.SelectedIndex=0;

        Build();
        search.TextChanged += (_,_)=>RebuildContent();
        groupFilter.SelectedIndexChanged += (_,_)=>RebuildContent();
        PdksAppearance.Changed += AppearanceChanged;
        Disposed += (_,_) => PdksAppearance.Changed -= AppearanceChanged;
    }

    void AppearanceChanged(object? sender, EventArgs e)
    {
        if (IsDisposed) return;
        void rebuild()
        {
            Controls.Clear();
            Build();
        }
        if (InvokeRequired) BeginInvoke((Action)rebuild); else rebuild();
    }

    void Build()
    {
        var p = PdksAppearance.Current;
        BackColor = p.Canvas;
        host = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = p.Canvas, Padding = new Padding(6) };

        var shell = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            ColumnCount = 1,
            Padding = Padding.Empty,
            BackColor = p.Canvas
        };
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute,88));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        shell.Controls.Add(BuildHeader(),0,0);
        shell.Controls.Add(host,0,1);
        Controls.Add(shell);
        RebuildContent();
    }

    Control BuildHeader()
    {
        var p=PdksAppearance.Current;
        var header=PdksUiKit.Card(0);
        header.Margin=new Padding(8,6,8,10);

        var title=new Label
        {
            Text="Yönetim Merkezi",
            Location=new Point(18,13),
            AutoSize=true,
            Font=new Font("Segoe UI",16f,FontStyle.Bold),
            ForeColor=p.Text
        };
        var hint=new Label
        {
            Text="Tüm alt işlemler tek merkezde • menü sırası ve yetkiler tek katalogdan yönetilir",
            Location=new Point(20,47),
            AutoSize=true,
            Font=new Font("Segoe UI",8.8f),
            ForeColor=p.Muted
        };

        search.BackColor=p.Input;search.ForeColor=p.Text;search.BorderStyle=BorderStyle.FixedSingle;
        search.Location=new Point(Math.Max(520,ClientSize.Width-560),20);search.Height=32;search.Anchor=AnchorStyles.Top|AnchorStyles.Right;
        groupFilter.BackColor=p.Input;groupFilter.ForeColor=p.Text;
        groupFilter.Location=new Point(Math.Max(830,ClientSize.Width-250),20);groupFilter.Height=32;groupFilter.Anchor=AnchorStyles.Top|AnchorStyles.Right;

        header.Controls.Add(title);header.Controls.Add(hint);header.Controls.Add(search);header.Controls.Add(groupFilter);
        return header;
    }

    void RebuildContent()
    {
        if(host is null || host.IsDisposed)return;
        var p=PdksAppearance.Current;
        host.SuspendLayout();
        try
        {
            host.Controls.Clear();
            var filtered=commands.AsEnumerable();
            var q=search.Text.Trim();
            if(q.Length>0)
                filtered=filtered.Where(x=>
                    x.Title.Contains(q,StringComparison.CurrentCultureIgnoreCase) ||
                    x.Hint.Contains(q,StringComparison.CurrentCultureIgnoreCase) ||
                    x.Group.Contains(q,StringComparison.CurrentCultureIgnoreCase));

            if(groupFilter.SelectedIndex>0 && groupFilter.SelectedItem is string group)
                filtered=filtered.Where(x=>x.Group==group);

            var groups=filtered.GroupBy(x=>x.Group).OrderBy(x=>x.Min(c=>c.Order)).ToArray();
            var root=new TableLayoutPanel
            {
                Dock=DockStyle.Top,
                AutoSize=true,
                ColumnCount=1,
                Padding=new Padding(8,2,8,24),
                BackColor=p.Canvas,
                Margin=Padding.Empty
            };

            if(groups.Length==0)
            {
                root.Controls.Add(new Label
                {
                    Text="Aramaya uygun işlem bulunamadı.",
                    Dock=DockStyle.Top,
                    Height=54,
                    Padding=new Padding(12,16,0,0),
                    ForeColor=p.Muted,
                    Font=new Font("Segoe UI",9f,FontStyle.Bold)
                });
            }
            else
            {
                foreach(var group in groups)
                    root.Controls.Add(Section(group.Key,group.OrderBy(x=>x.Order).ToArray()));
            }

            host.Controls.Add(root);
        }
        finally{host.ResumeLayout();}
    }

    Control Section(string title, IReadOnlyList<PdksCommandDescriptor> items)
    {
        var p = PdksAppearance.Current;
        var section = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 1,
            BackColor = p.Canvas,
            Margin = new Padding(0, 0, 0, 8)
        };

        section.Controls.Add(new Label
        {
            Text = $"{title}   {items.Count}",
            Dock = DockStyle.Top,
            Height = 28,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold),
            ForeColor = p.Muted,
            Padding = new Padding(4, 0, 0, 0)
        });

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 3,
            BackColor = p.Canvas,
            Padding = Padding.Empty,
            Margin = Padding.Empty
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.334f));

        for (var i=0;i<items.Count;i++)
            grid.Controls.Add(CommandCard(items[i]), i%3, i/3);

        section.Controls.Add(grid);
        return section;
    }

    Control CommandCard(PdksCommandDescriptor command)
    {
        var p = PdksAppearance.Current;
        var card = PdksUiKit.Card(0);
        card.Height = 74;
        card.MinimumSize = new Size(240, 74);
        card.Margin = new Padding(0, 0, 10, 8);
        card.Cursor = Cursors.Hand;

        var icon = new PictureBox
        {
            Image = PdksToolbarIcons.Create(command.Icon),
            Location = new Point(14, 18),
            Size = new Size(34, 34),
            SizeMode = PictureBoxSizeMode.CenterImage,
            BackColor = p.PrimarySoft
        };
        var title = new Label
        {
            Text = command.Title,
            Location = new Point(60, 10),
            Size = new Size(270, 23),
            AutoEllipsis = true,
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            ForeColor = p.Text,
            BackColor = Color.Transparent
        };
        var hint = new Label
        {
            Text = command.Hint,
            Location = new Point(60, 34),
            Size = new Size(285, 30),
            AutoEllipsis = true,
            Font = new Font("Segoe UI", 7.9f),
            ForeColor = p.Muted,
            BackColor = Color.Transparent
        };
        var arrow = new Label
        {
            Text = "›",
            Dock = DockStyle.Right,
            Width = 26,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 17f),
            ForeColor = p.Muted,
            BackColor = Color.Transparent
        };

        card.Controls.Add(arrow);
        card.Controls.Add(icon);
        card.Controls.Add(title);
        card.Controls.Add(hint);

        void open(object? _, EventArgs __) => execute(command.Id);
        foreach (Control c in new Control[]{card, icon, title, hint, arrow})
        {
            c.Click += open;
            c.Cursor = Cursors.Hand;
        }
        card.MouseEnter += (_,_) => card.BackColor = p.SurfaceAlt;
        card.MouseLeave += (_,_) => card.BackColor = p.Surface;
        return card;
    }
}
