using System.Drawing.Drawing2D;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    Panel? modernShell;
    Label? modernPageTitle;
    Label? modernPageHint;
    Label? modernDbState;
    Label? modernClock;
    System.Windows.Forms.Timer? modernClockTimer;
    Button? activeNavButton;
    Button? modernBackButton;
    readonly Dictionary<PdksCommandId,Button> modernNavButtons = [];
    bool appearanceHooked;

    void BuildModernShell()
    {
        if (modernShell is not null) return;
        var p=PdksAppearance.Current;

        MainMenuStrip!.Visible = false;
        tool.Visible = false;
        status.Visible = false;

        modernNavButtons.Clear();
        modernShell = new Panel { Dock = DockStyle.Fill, BackColor = p.Canvas };

        var frame = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = p.Canvas
        };
        frame.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 224));
        frame.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        frame.Controls.Add(BuildModernSidebar(), 0, 0);

        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = p.Canvas
        };
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 74));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        main.Controls.Add(BuildModernTopbar(), 0, 0);

        var content = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = p.Canvas,
            Padding = new Padding(18, 14, 18, 16),
            Margin = Padding.Empty
        };
        if (workspace.Parent is not null) workspace.Parent.Controls.Remove(workspace);
        workspace.Dock = DockStyle.Fill;
        content.Controls.Add(workspace);
        main.Controls.Add(content, 0, 1);
        main.Controls.Add(BuildModernFooter(), 0, 2);

        frame.Controls.Add(main, 1, 0);
        modernShell.Controls.Add(frame);
        Controls.Add(modernShell);
        modernShell.BringToFront();

        if (!appearanceHooked)
        {
            appearanceHooked=true;
            PdksAppearance.Changed += AppearanceChanged;
            Disposed += (_,_) => PdksAppearance.Changed -= AppearanceChanged;
        }

        SetModernPage("Genel Bakış", "Günün personel hareketleri ve hızlı işlemler");
        SelectNavForCommand(PdksCommandId.Home);
    }

    void AppearanceChanged(object? sender,EventArgs e)
    {
        if(IsDisposed)return;
        void rebuild()
        {
            var title=modernPageTitle?.Text ?? "Genel Bakış";
            var hint=modernPageHint?.Text ?? "KY PDKS çalışma alanı";
            var selected=modernNavButtons.FirstOrDefault(x=>x.Value==activeNavButton).Key;

            if(workspace.Parent is not null)workspace.Parent.Controls.Remove(workspace);
            if(modernShell is not null)
            {
                Controls.Remove(modernShell);
                modernShell.Dispose();
            }
            modernShell=null;modernPageTitle=null;modernPageHint=null;modernDbState=null;modernClock=null;activeNavButton=null;modernBackButton=null;
            modernClockTimer?.Stop();modernClockTimer?.Dispose();modernClockTimer=null;
            BuildModernShell();
            SetModernPage(title,hint);
            if(Enum.IsDefined(selected))SelectNavForCommand(selected);
        }
        if(InvokeRequired)BeginInvoke((Action)rebuild);else rebuild();
    }

    Control BuildModernSidebar()
    {
        var p=PdksAppearance.Current;
        var sidebar = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = p.Sidebar,
            Padding = new Padding(14, 14, 14, 12)
        };

        var brand = new Panel { Dock = DockStyle.Top, Height = 72, BackColor = p.Sidebar };
        var badge = new RoundedLabel
        {
            Text = "KY",
            Location = new Point(6, 8),
            Size = new Size(42, 42),
            BackColor = p.Primary,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 12.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleCenter,
            Radius = 11
        };
        brand.Controls.Add(badge);
        brand.Controls.Add(new Label
        {
            Text = "KY PDKS",
            Location = new Point(60, 7),
            Size = new Size(132, 24),
            ForeColor = p.SidebarText,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            TextAlign = ContentAlignment.BottomLeft
        });
        brand.Controls.Add(new Label
        {
            Text = branding.ReportHeader,
            Location = new Point(60, 33),
            Size = new Size(136, 22),
            ForeColor = p.SidebarMuted,
            Font = new Font("Segoe UI", 8.2f),
            AutoEllipsis = true
        });
        sidebar.Controls.Add(brand);

        var nav = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = p.Sidebar,
            Padding = new Padding(0, 6, 0, 0)
        };

        foreach(var group in VisiblePrimaryCommands().GroupBy(x=>x.Group))
        {
            nav.Controls.Add(SectionLabel(group.Key));
            foreach(var command in group.OrderBy(x=>x.Order))
                nav.Controls.Add(NavButton(command));
        }
        sidebar.Controls.Add(nav);

        var bottom = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 102,
            RowCount = 3,
            BackColor = p.Sidebar,
            Padding = new Padding(0, 6, 0, 0)
        };
        bottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        bottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        bottom.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var manage=CompactButton("Yönetim",PdksToolbarIcon.Groups);
        manage.Click+=(_,_)=>ShowManagementCenter();
        var theme=CompactButton($"Tema • {PdksAppearance.ModeLabel}",PdksToolbarIcon.Home);
        theme.Click+=(_,_)=>OpenThemeSettings();
        bottom.Controls.Add(manage,0,0);
        bottom.Controls.Add(theme,0,1);
        bottom.Controls.Add(new Label
        {
            Text = $"v6.4  •  {PdksAppearance.AccentLabel}",
            Dock = DockStyle.Fill,
            ForeColor = p.SidebarMuted,
            Font = new Font("Segoe UI", 7.8f),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(10, 2, 0, 0)
        }, 0, 2);
        sidebar.Controls.Add(bottom);
        nav.SendToBack();
        brand.BringToFront();
        bottom.BringToFront();
        return sidebar;
    }

    Control SectionLabel(string text)
    {
        var p=PdksAppearance.Current;
        return new Label
        {
            Text=text,
            Width=182,
            Height=25,
            Margin=new Padding(0,7,0,2),
            Padding=new Padding(10,5,0,0),
            ForeColor=p.SidebarMuted,
            BackColor=p.Sidebar,
            Font=new Font("Segoe UI",7.4f,FontStyle.Bold),
            TextAlign=ContentAlignment.MiddleLeft
        };
    }

    Button NavButton(PdksCommandDescriptor command)
    {
        var p=PdksAppearance.Current;
        var button = new Button
        {
            Text = command.Title,
            Image = PdksToolbarIcons.Create(command.Icon),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            Height = 42,
            Width = 182,
            FlatStyle = FlatStyle.Flat,
            BackColor = p.Sidebar,
            ForeColor = p.SidebarMuted,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft,
            Cursor = Cursors.Hand,
            Margin = new Padding(0, 0, 0, 2),
            Padding = new Padding(10, 0, 5, 0),
            Tag = command.Id
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = p.SidebarHover;
        button.FlatAppearance.MouseDownBackColor = p.SidebarHover;
        button.Click += (_, _) => ExecuteCommand(command.Id);
        modernNavButtons[command.Id]=button;
        return button;
    }

    Button CompactButton(string text,PdksToolbarIcon icon)
    {
        var p=PdksAppearance.Current;
        var button=new Button
        {
            Text=text,
            Image=PdksToolbarIcons.Create(icon),
            ImageAlign=ContentAlignment.MiddleLeft,
            TextImageRelation=TextImageRelation.ImageBeforeText,
            Width=182,
            Height=34,
            FlatStyle=FlatStyle.Flat,
            BackColor=p.Sidebar,
            ForeColor=p.SidebarMuted,
            Font=new Font("Segoe UI",8.6f,FontStyle.Bold),
            TextAlign=ContentAlignment.MiddleLeft,
            Padding=new Padding(10,0,5,0),
            Cursor=Cursors.Hand,
            Margin=Padding.Empty
        };
        button.FlatAppearance.BorderSize=0;
        button.FlatAppearance.MouseOverBackColor=p.SidebarHover;
        return button;
    }

    void SelectNavForCommand(PdksCommandId id)
    {
        var p=PdksAppearance.Current;
        var primary=PrimaryParent(id);
        if(!modernNavButtons.TryGetValue(primary,out var button))return;

        if(activeNavButton is not null && !activeNavButton.IsDisposed)
        {
            activeNavButton.BackColor=p.Sidebar;
            activeNavButton.ForeColor=p.SidebarMuted;
        }
        activeNavButton=button;
        button.BackColor=p.SidebarHover;
        button.ForeColor=p.SidebarText;
    }

    static PdksCommandId PrimaryParent(PdksCommandId id) => id switch
    {
        PdksCommandId.Leave or PdksCommandId.EarningsDeductions or PdksCommandId.QuickOperations or PdksCommandId.PayrollPayments => PdksCommandId.Personnel,
        PdksCommandId.TimesheetDaily or PdksCommandId.TimesheetResults => PdksCommandId.TimesheetMonthly,
        PdksCommandId.PayrollAdjustment or PdksCommandId.PayrollPayslip or PdksCommandId.PayrollOvertime => PdksCommandId.PayrollGeneral,
        PdksCommandId.Groups or PdksCommandId.Periods or PdksCommandId.WorkingDate or PdksCommandId.Holidays or
        PdksCommandId.DailyWorkHours or PdksCommandId.AnnualWorkPlan or PdksCommandId.PayrollFields or PdksCommandId.EarningsTypes => PdksCommandId.Definitions,
        PdksCommandId.TerminalSettings or PdksCommandId.TerminalProfiles or PdksCommandId.DataSources => PdksCommandId.TerminalCenter,
        _ => id
    };

    void ShowManagementCenter()
    {
        var view = new ManagementCenterForm(
            PdksCommandCatalog.Management.Where(CanExecute),
            ExecuteCommand);
        ShowEmbedded(view, "management-center", "Yönetim Merkezi");
        SetModernPage("Yönetim Merkezi", "Personel, puantaj, bordro, tanımlar ve sistem işlemleri");
    }

    Control BuildModernTopbar()
    {
        var p=PdksAppearance.Current;
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = p.Surface, Padding = new Padding(22, 8, 22, 8) };
        bar.Paint += (_, e) =>
        {
            using var pen = new Pen(PdksAppearance.Current.Border);
            e.Graphics.DrawLine(pen, 0, bar.Height - 1, bar.Width, bar.Height - 1);
        };

        var left = new TableLayoutPanel { Dock = DockStyle.Left, Width = 700, ColumnCount=2, RowCount = 1, BackColor = p.Surface };
        left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,48));
        left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));

        modernBackButton=PdksUiKit.Button("‹",34,PdksActionRole.Quiet,NavigateBack);
        modernBackButton.Font=new Font("Segoe UI",16f,FontStyle.Bold);
        modernBackButton.Margin=new Padding(0,12,10,0);
        modernBackButton.Enabled=navigationHistory.Count>0;
        left.Controls.Add(modernBackButton,0,0);

        var titleArea=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,BackColor=p.Surface};
        titleArea.RowStyles.Add(new RowStyle(SizeType.Percent,60));
        titleArea.RowStyles.Add(new RowStyle(SizeType.Percent,40));
        modernPageTitle = new Label
        {
            Dock = DockStyle.Fill,
            Text = "Genel Bakış",
            TextAlign = ContentAlignment.BottomLeft,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            ForeColor = p.Text
        };
        modernPageHint = new Label
        {
            Dock = DockStyle.Fill,
            Text = "Günün personel hareketleri ve hızlı işlemler",
            TextAlign = ContentAlignment.TopLeft,
            Font = new Font("Segoe UI", 8.7f),
            ForeColor = p.Muted
        };
        titleArea.Controls.Add(modernPageTitle,0,0);
        titleArea.Controls.Add(modernPageHint,0,1);
        left.Controls.Add(titleArea,1,0);

        var right = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            Width = 560,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = p.Surface,
            Padding = new Padding(0, 10, 0, 0)
        };
        var quickSearch = PdksUiKit.Button("İşlem Ara   Ctrl+K",132,PdksActionRole.Secondary,OpenCommandPalette);
        quickSearch.Height=34;quickSearch.MinimumSize=new Size(132,34);quickSearch.MaximumSize=new Size(132,34);
        quickSearch.Margin=new Padding(10,0,0,0);

        var user = new RoundedLabel
        {
            AutoSize = false,
            Width = 150,
            Height = 34,
            Text = currentUser.UserName,
            TextAlign = ContentAlignment.MiddleCenter,
            BackColor = p.SurfaceAlt,
            ForeColor = p.Text,
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold),
            Radius = 8,
            Margin = new Padding(10, 0, 0, 0)
        };
        modernClock = new Label
        {
            AutoSize = false,
            Width = 80,
            Height = 34,
            Text = DateTime.Now.ToString("HH:mm"),
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold)
        };
        var live = new Label
        {
            AutoSize = false,
            Width = 125,
            Height = 34,
            Text = "● SİSTEM AKTİF",
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = p.Success,
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold)
        };
        right.Controls.Add(user);
        right.Controls.Add(modernClock);
        right.Controls.Add(live);
        right.Controls.Add(quickSearch);

        bar.Controls.Add(right);
        bar.Controls.Add(left);

        modernClockTimer = new System.Windows.Forms.Timer { Interval = 15000 };
        modernClockTimer.Tick += (_, _) => { if (modernClock is not null) modernClock.Text = DateTime.Now.ToString("HH:mm"); };
        modernClockTimer.Start();
        return bar;
    }

    Control BuildModernFooter()
    {
        var p=PdksAppearance.Current;
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = p.Surface, Padding = new Padding(18, 0, 18, 0) };
        modernDbState = new Label
        {
            Dock = DockStyle.Left,
            Width = 650,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 7.8f)
        };
        var version = new Label
        {
            Dock = DockStyle.Right,
            Width = 210,
            Text = $"KY PDKS 6.4  •  {PdksAppearance.ModeLabel} / {PdksAppearance.AccentLabel}",
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 7.8f)
        };
        bar.Controls.Add(version);
        bar.Controls.Add(modernDbState);
        RefreshModernDbState();
        return bar;
    }

    void SetModernPage(string title, string hint)
    {
        if (modernPageTitle is not null) modernPageTitle.Text = title;
        if (modernPageHint is not null) modernPageHint.Text = hint;
        RefreshModernDbState();
    }

    void RefreshBackButton()
    {
        if(modernBackButton is null || modernBackButton.IsDisposed)return;
        modernBackButton.Enabled=navigationHistory.Count>0;
        modernBackButton.Text=navigationHistory.Count>0?"‹":"·";
    }

    void RefreshModernDbState()
    {
        if (modernDbState is null) return;
        var p=PdksAppearance.Current;
        var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User)
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        modernDbState.Text = StartupConfiguration.IsReady()
            ? "● Veritabanı bağlı  •  " + (Path.GetFileName(path) ?? "KY_PDKS_DATA.FDB")
            : "● Veritabanı bağlantısı bekleniyor";
        modernDbState.ForeColor = StartupConfiguration.IsReady() ? p.Success : p.Warning;
    }

    sealed class RoundedLabel : Label
    {
        public int Radius { get; set; } = 10;
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            using var path = RoundedRect(ClientRectangle, Radius);
            Region = new Region(path);
        }

        static GraphicsPath RoundedRect(Rectangle rect, int radius)
        {
            var d = Math.Max(2, radius * 2);
            var r = new Rectangle(rect.X, rect.Y, Math.Max(1, rect.Width - 1), Math.Max(1, rect.Height - 1));
            var p = new GraphicsPath();
            p.AddArc(r.Left, r.Top, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }
}
