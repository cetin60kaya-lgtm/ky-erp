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
        var card=PdksUiKit.Card(0);
        card.Margin=new Padding(8,6,8,10);

        var layout=new TableLayoutPanel
        {
            Dock=DockStyle.Fill,
            ColumnCount=3,
            RowCount=1,
            Padding=new Padding(16,10,16,10),
            BackColor=p.Surface,
            Margin=Padding.Empty
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,310));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,190));

        var titleArea=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface,Margin=Padding.Empty};
        titleArea.RowStyles.Add(new RowStyle(SizeType.Percent,58));
        titleArea.RowStyles.Add(new RowStyle(SizeType.Percent,42));
        titleArea.Controls.Add(new Label
        {
            Text="Yönetim Merkezi",
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.BottomLeft,
            Font=new Font("Segoe UI",16f,FontStyle.Bold),
            ForeColor=p.Text
        },0,0);
        titleArea.Controls.Add(new Label
        {
            Text="Tüm alt işlemler tek merkezde • menü sırası ve yetkiler tek katalogdan yönetilir",
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.TopLeft,
            Font=new Font("Segoe UI",8.8f),
            ForeColor=p.Muted
        },0,1);
        layout.Controls.Add(titleArea,0,0);

        search.BackColor=p.Input;search.ForeColor=p.Text;search.BorderStyle=BorderStyle.FixedSingle;
        search.Dock=DockStyle.Fill;search.Margin=new Padding(8,11,8,11);search.Font=new Font("Segoe UI",9.2f);
        layout.Controls.Add(search,1,0);

        groupFilter.BackColor=p.Input;groupFilter.ForeColor=p.Text;
        groupFilter.Dock=DockStyle.Fill;groupFilter.Margin=new Padding(0,11,0,11);
        layout.Controls.Add(groupFilter,2,0);

        card.Controls.Add(layout);
        return card;
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

            if(groupFilter.SelectedIndex>0 && groupFilter.SelectedItem is string selectedGroup)
                filtered=filtered.Where(x=>x.Group==selectedGroup);

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
