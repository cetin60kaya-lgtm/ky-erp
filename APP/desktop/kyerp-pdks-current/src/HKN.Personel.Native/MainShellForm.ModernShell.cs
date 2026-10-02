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

    static readonly Color ShellNavy = Color.FromArgb(15, 23, 42);
    static readonly Color ShellNavyHover = Color.FromArgb(30, 41, 59);
    static readonly Color ShellCanvas = Color.FromArgb(244, 247, 251);
    static readonly Color ShellSurface = Color.White;
    static readonly Color ShellText = Color.FromArgb(15, 23, 42);
    static readonly Color ShellMuted = Color.FromArgb(100, 116, 139);
    static readonly Color ShellPrimary = Color.FromArgb(37, 99, 235);
    static readonly Color ShellBorder = Color.FromArgb(226, 232, 240);

    void BuildModernShell()
    {
        if (modernShell is not null) return;

        MainMenuStrip!.Visible = false;
        tool.Visible = false;
        status.Visible = false;

        modernShell = new Panel { Dock = DockStyle.Fill, BackColor = ShellCanvas };

        var frame = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = ShellCanvas
        };
        frame.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 214));
        frame.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        frame.Controls.Add(BuildModernSidebar(), 0, 0);

        var main = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Margin = Padding.Empty,
            Padding = Padding.Empty,
            BackColor = ShellCanvas
        };
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        main.Controls.Add(BuildModernTopbar(), 0, 0);

        var content = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = ShellCanvas,
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
        SetModernPage("Genel Bakış", "Günlük personel, puantaj ve bordro işlemleri");
    }

    Control BuildModernSidebar()
    {
        var sidebar = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = ShellNavy,
            Padding = new Padding(12, 14, 12, 12)
        };

        var brand = new Panel { Dock = DockStyle.Top, Height = 76, BackColor = ShellNavy };
        var badge = new RoundedLabel
        {
            Text = "KY",
            Location = new Point(8, 10),
            Size = new Size(42, 42),
            BackColor = ShellPrimary,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 12.5f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleCenter,
            Radius = 11
        };
        brand.Controls.Add(badge);
        brand.Controls.Add(new Label
        {
            Text = "KY PDKS",
            Location = new Point(62, 8),
            Size = new Size(122, 25),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            TextAlign = ContentAlignment.BottomLeft
        });
        brand.Controls.Add(new Label
        {
            Text = branding.ReportHeader,
            Location = new Point(62, 34),
            Size = new Size(128, 22),
            ForeColor = Color.FromArgb(148, 163, 184),
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
            BackColor = ShellNavy,
            Padding = new Padding(0, 8, 0, 0)
        };
        nav.Controls.Add(NavButton("Genel Bakış", PdksToolbarIcon.Home, ShowHome, true));
        nav.Controls.Add(NavButton("Canlı Denetim", PdksToolbarIcon.Live, OpenLiveAttendance));
        nav.Controls.Add(NavButton("Giriş / Çıkış", PdksToolbarIcon.EntryExit, OpenLegacyGirisCikis));
        nav.Controls.Add(NavButton("Personel", PdksToolbarIcon.Personnel, OpenPersonel));
        nav.Controls.Add(NavButton("Puantaj", PdksToolbarIcon.Timesheet, () => OpenPuantaj(1)));
        nav.Controls.Add(NavButton("Bordro", PdksToolbarIcon.Payroll, () => OpenBordro(0)));
        nav.Controls.Add(NavButton("Raporlar", PdksToolbarIcon.Results, () => OpenReportCenter(null)));
        nav.Controls.Add(NavButton("Tanımlar", PdksToolbarIcon.Departments, () => OpenDefinitions("Bölümler")));
        sidebar.Controls.Add(nav);

        var bottom = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 112,
            RowCount = 3,
            BackColor = ShellNavy,
            Padding = new Padding(0, 6, 0, 0)
        };
        bottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        bottom.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        bottom.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        bottom.Controls.Add(CompactNavButton("Terminal", PdksToolbarIcon.Terminal, OpenTerminalCenter), 0, 0);
        bottom.Controls.Add(CompactNavButton("Yönetim", PdksToolbarIcon.Settings, ShowManagementMenu), 0, 1);
        bottom.Controls.Add(new Label
        {
            Text = "v6.4",
            Dock = DockStyle.Fill,
            ForeColor = Color.FromArgb(100, 116, 139),
            Font = new Font("Segoe UI", 8f),
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(10, 2, 0, 0)
        }, 0, 2);
        sidebar.Controls.Add(bottom);
        return sidebar;
    }

    Button NavButton(string text, PdksToolbarIcon icon, Action action, bool selected = false)
    {
        var button = new Button
        {
            Text = text,
            Image = PdksToolbarIcons.Create(icon),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            Height = 44,
            Width = 186,
            FlatStyle = FlatStyle.Flat,
            BackColor = selected ? ShellNavyHover : ShellNavy,
            ForeColor = selected ? Color.White : Color.FromArgb(203, 213, 225),
            Font = new Font("Segoe UI", 9.2f, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft,
            Cursor = Cursors.Hand,
            Margin = new Padding(0, 0, 0, 3),
            Padding = new Padding(12, 0, 6, 0)
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = ShellNavyHover;
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(51, 65, 85);
        button.Click += (_, _) =>
        {
            if (activeNavButton is not null && !activeNavButton.IsDisposed)
            {
                activeNavButton.BackColor = ShellNavy;
                activeNavButton.ForeColor = Color.FromArgb(203, 213, 225);
            }
            activeNavButton = button;
            button.BackColor = ShellNavyHover;
            button.ForeColor = Color.White;
            action();
        };
        if (selected) activeNavButton = button;
        return button;
    }

    Button CompactNavButton(string text, PdksToolbarIcon icon, Action action)
    {
        var button = NavButton(text, icon, action);
        button.Width = 186;
        button.Height = 38;
        button.Font = new Font("Segoe UI", 8.8f, FontStyle.Bold);
        return button;
    }

    void ShowManagementMenu()
    {
        var menu = new ContextMenuStrip
        {
            Font = new Font("Segoe UI", 9f),
            BackColor = Color.White,
            ShowImageMargin = false,
            Padding = new Padding(6)
        };
        void Add(string text, Action action, bool enabled = true)
        {
            var item = new ToolStripMenuItem(text) { Enabled = enabled, Padding = new Padding(8, 5, 8, 5) };
            item.Click += (_, _) => action();
            menu.Items.Add(item);
        }

        Add("Dönemler", () => OpenDialogModule(PdksModule.Donemler));
        Add("Kazanç / Kesinti / Avans", OpenLegacyKazancKesinti);
        Add("Aylık Düzeltme / Hızlı Ödeme", () => ShowModule(new MonthlyPayrollAdjustmentForm(), PdksModule.Bordro),
            currentUser.IsCompanyResponsible || currentUser.IsSuperAdmin);
        menu.Items.Add(new ToolStripSeparator());
        Add("Entegrasyonlar", () => new IntegrationCenterForm(this, currentUser).ShowDialog(this));
        Add("İşlem Geçmişi", () => new AuditHistoryForm().ShowDialog(this));
        Add("Kullanıcı / Yetki", OpenUserManagement, currentUser.IsAdmin);
        menu.Show(Cursor.Position);
    }

    Control BuildModernTopbar()
    {
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = ShellSurface, Padding = new Padding(22, 8, 22, 8) };
        bar.Paint += (_, e) =>
        {
            using var pen = new Pen(ShellBorder);
            e.Graphics.DrawLine(pen, 0, bar.Height - 1, bar.Width, bar.Height - 1);
        };

        var left = new TableLayoutPanel { Dock = DockStyle.Left, Width = 720, RowCount = 2, BackColor = ShellSurface };
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 60));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 40));
        modernPageTitle = new Label
        {
            Dock = DockStyle.Fill,
            Text = "Genel Bakış",
            TextAlign = ContentAlignment.BottomLeft,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            ForeColor = ShellText
        };
        modernPageHint = new Label
        {
            Dock = DockStyle.Fill,
            Text = "Günlük personel, puantaj ve bordro işlemleri",
            TextAlign = ContentAlignment.TopLeft,
            Font = new Font("Segoe UI", 8.7f),
            ForeColor = ShellMuted
        };
        left.Controls.Add(modernPageTitle, 0, 0);
        left.Controls.Add(modernPageHint, 0, 1);

        var right = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            Width = 430,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = ShellSurface,
            Padding = new Padding(0, 10, 0, 0)
        };
        var user = new RoundedLabel
        {
            AutoSize = false,
            Width = 155,
            Height = 34,
            Text = currentUser.UserName,
            TextAlign = ContentAlignment.MiddleCenter,
            BackColor = Color.FromArgb(241, 245, 249),
            ForeColor = ShellText,
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold),
            Radius = 8,
            Margin = new Padding(10, 0, 0, 0)
        };
        modernClock = new Label
        {
            AutoSize = false,
            Width = 90,
            Height = 34,
            Text = DateTime.Now.ToString("HH:mm"),
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = ShellMuted,
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold)
        };
        var live = new Label
        {
            AutoSize = false,
            Width = 120,
            Height = 34,
            Text = "● SİSTEM AKTİF",
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.FromArgb(22, 163, 74),
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold)
        };
        right.Controls.Add(user);
        right.Controls.Add(modernClock);
        right.Controls.Add(live);

        bar.Controls.Add(right);
        bar.Controls.Add(left);

        modernClockTimer = new System.Windows.Forms.Timer { Interval = 15000 };
        modernClockTimer.Tick += (_, _) => { if (modernClock is not null) modernClock.Text = DateTime.Now.ToString("HH:mm"); };
        modernClockTimer.Start();
        Disposed += (_, _) => modernClockTimer?.Stop();
        return bar;
    }

    Control BuildModernFooter()
    {
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = ShellSurface, Padding = new Padding(18, 0, 18, 0) };
        modernDbState = new Label
        {
            Dock = DockStyle.Left,
            Width = 620,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = ShellMuted,
            Font = new Font("Segoe UI", 7.8f)
        };
        var version = new Label
        {
            Dock = DockStyle.Right,
            Width = 150,
            Text = "KY PDKS 6.4",
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = ShellMuted,
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

    void RefreshModernDbState()
    {
        if (modernDbState is null) return;
        var path = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH", EnvironmentVariableTarget.User)
            ?? Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        modernDbState.Text = StartupConfiguration.IsReady()
            ? "● Veritabanı bağlı  •  " + (Path.GetFileName(path) ?? "KY_PDKS_DATA.FDB")
            : "● Veritabanı bağlantısı bekleniyor";
        modernDbState.ForeColor = StartupConfiguration.IsReady()
            ? Color.FromArgb(22, 163, 74)
            : Color.FromArgb(202, 118, 35);
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
