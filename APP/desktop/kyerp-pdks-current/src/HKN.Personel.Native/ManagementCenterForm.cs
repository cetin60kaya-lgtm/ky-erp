namespace HKN.Personel.Native;

internal sealed class ManagementCenterForm : Form
{
    readonly IReadOnlyList<PdksCommandDescriptor> commands;
    readonly Action<PdksCommandId> execute;
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
        Build();
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

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 1,
            Padding = new Padding(8, 6, 8, 24),
            BackColor = p.Canvas,
            Margin = Padding.Empty
        };

        var hero = new Panel { Dock = DockStyle.Top, Height = 76, BackColor = p.Canvas, Margin = new Padding(0,0,0,8) };
        hero.Controls.Add(new Label
        {
            Text = "Yönetim Merkezi",
            Location = new Point(4, 6),
            AutoSize = true,
            Font = new Font("Segoe UI", 17f, FontStyle.Bold),
            ForeColor = p.Text
        });
        hero.Controls.Add(new Label
        {
            Text = "Personel, puantaj, bordro, tanımlar ve sistem işlemleri tek noktada.",
            Location = new Point(6, 42),
            AutoSize = true,
            Font = new Font("Segoe UI", 9.2f),
            ForeColor = p.Muted
        });
        root.Controls.Add(hero);

        foreach (var group in commands.GroupBy(x=>x.Group).OrderBy(x=>x.Min(c=>c.Order)))
        {
            root.Controls.Add(Section(group.Key, group.OrderBy(x=>x.Order).ToArray()));
        }

        host.Controls.Add(root);
        Controls.Add(host);
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
            Margin = new Padding(0, 0, 0, 14)
        };

        section.Controls.Add(new Label
        {
            Text = title,
            Dock = DockStyle.Top,
            Height = 34,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
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
        card.Height = 92;
        card.MinimumSize = new Size(250, 92);
        card.Margin = new Padding(0, 0, 12, 12);
        card.Cursor = Cursors.Hand;

        var icon = new PictureBox
        {
            Image = PdksToolbarIcons.Create(command.Icon),
            Location = new Point(16, 19),
            Size = new Size(38, 38),
            SizeMode = PictureBoxSizeMode.CenterImage,
            BackColor = p.PrimarySoft
        };
        var title = new Label
        {
            Text = command.Title,
            Location = new Point(68, 14),
            Size = new Size(280, 25),
            AutoEllipsis = true,
            Font = new Font("Segoe UI", 9.6f, FontStyle.Bold),
            ForeColor = p.Text,
            BackColor = Color.Transparent
        };
        var hint = new Label
        {
            Text = command.Hint,
            Location = new Point(68, 40),
            Size = new Size(315, 36),
            AutoEllipsis = true,
            Font = new Font("Segoe UI", 8.3f),
            ForeColor = p.Muted,
            BackColor = Color.Transparent
        };
        var arrow = new Label
        {
            Text = "›",
            Dock = DockStyle.Right,
            Width = 30,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 18f),
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
