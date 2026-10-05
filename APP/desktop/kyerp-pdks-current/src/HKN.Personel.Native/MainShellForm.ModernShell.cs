using System.Drawing.Drawing2D;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    Panel? modernShell;
    Label? modernPageTitle;
    Label? modernPageHint;
    Label? modernDbState;
    Label? modernActivityState;
    Label? modernClock;
    string shellActivityText="Hazır";
    bool? shellActivityOk=true;
    System.Windows.Forms.Timer? modernClockTimer;
    Button? activeNavButton;
    Button? modernManageButton;
    Button? modernBackButton;
    Panel? modernContentPanel;
    Panel? navigationCover;
    bool navigationBusy;
    readonly Dictionary<PdksCommandId,Button> modernNavButtons = [];
    static readonly PdksCommandId[] SidebarOrder =
    [
        PdksCommandId.Home,
        PdksCommandId.EntryExit,
        PdksCommandId.Personnel,
        PdksCommandId.TimesheetMonthly,
        PdksCommandId.PayrollGeneral,
        PdksCommandId.Reports
    ];
    bool appearanceHooked;

    void BuildModernShell()
    {
        if (modernShell is not null) return;
        var p=PdksAppearance.Current;

        MainMenuStrip!.Visible = false;

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
        modernContentPanel = content;
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
        currentWorkspaceCommand ??= PdksCommandId.Home;
        SelectNavForCommand(PdksCommandId.Home);
        RefreshBackButton();
    }

    void AppearanceChanged(object? sender,EventArgs e)
    {
        if(IsDisposed)return;
        void rebuild()
        {
            var title=modernPageTitle?.Text ?? "Genel Bakış";
            var hint=modernPageHint?.Text ?? "KY PDKS çalışma alanı";
            var managementActive=string.Equals(title,"Yönetim Merkezi",StringComparison.OrdinalIgnoreCase);
            var selected=modernNavButtons.FirstOrDefault(x=>x.Value==activeNavButton).Key;

            if(workspace.Parent is not null)workspace.Parent.Controls.Remove(workspace);
            if(modernShell is not null)
            {
                Controls.Remove(modernShell);
                modernShell.Dispose();
            }
            modernShell=null;modernPageTitle=null;modernPageHint=null;modernDbState=null;modernActivityState=null;modernClock=null;activeNavButton=null;modernManageButton=null;modernBackButton=null;modernContentPanel=null;navigationCover=null;navigationBusy=false;
            modernClockTimer?.Stop();modernClockTimer?.Dispose();modernClockTimer=null;
            BuildModernShell();
            SetModernPage(title,hint);
            if(managementActive)SelectManagementNav();
            else if(Enum.IsDefined(selected))SelectNavForCommand(selected);
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

        var layout=new TableLayoutPanel
        {
            Dock=DockStyle.Fill,
            RowCount=3,
            ColumnCount=1,
            BackColor=p.Sidebar,
            Margin=Padding.Empty,
            Padding=Padding.Empty
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,72));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,84));

        var brand = new Panel { Dock = DockStyle.Fill, BackColor = p.Sidebar };
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
        layout.Controls.Add(brand,0,0);

        var nav = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = p.Sidebar,
            Padding = new Padding(0, 6, 0, 0),
            Margin=Padding.Empty
        };

        foreach(var id in SidebarOrder)
        {
            var command=PdksCommandCatalog.Get(id);
            if(CanExecute(command))nav.Controls.Add(NavButton(command));
        }
        layout.Controls.Add(nav,0,1);

        var bottom = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            BackColor = p.Sidebar,
            Padding = new Padding(0, 6, 0, 0),
            Margin=Padding.Empty
        };
        bottom.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        bottom.RowStyles.Add(new RowStyle(SizeType.Percent, 50));

        modernManageButton=CompactButton("Yönetim",PdksToolbarIcon.Groups);
        modernManageButton.Click+=(_,_)=>ShowManagementCenter();
        var theme=CompactButton($"Görünüm • {PdksAppearance.ModeLabel}",PdksToolbarIcon.Home);
        theme.Click+=(_,_)=>OpenThemeSettings();
        bottom.Controls.Add(modernManageButton,0,0);
        bottom.Controls.Add(theme,0,1);
        layout.Controls.Add(bottom,0,2);

        sidebar.Controls.Add(layout);
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
        button.Click += async (_, _) => await NavigateWithTransitionAsync(command.Id);
        modernNavButtons[command.Id]=button;
        return button;
    }

    async Task NavigateWithTransitionAsync(PdksCommandId id)
    {
        if (navigationBusy || currentWorkspaceCommand == id) return;
        navigationBusy = true;
        var command = PdksCommandCatalog.Get(id);
        try
        {
            SelectNavForCommand(id);
            SetModernPage(command.Title, command.Hint);
            ShowNavigationCover(command.Title);
            await Task.Yield();
            ExecuteCommand(id);
        }
        finally
        {
            HideNavigationCover();
            navigationBusy = false;
        }
    }

    void ShowNavigationCover(string title)
    {
        if (modernContentPanel is null || modernContentPanel.IsDisposed) return;
        var p = PdksAppearance.Current;
        navigationCover?.Dispose();

        var cover = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = p.Canvas,
            Padding = new Padding(24)
        };
        cover.Controls.Add(new Label
        {
            Text = title,
            Dock = DockStyle.Top,
            Height = 34,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = p.Text
        });
        cover.Controls.Add(new Label
        {
            Text = "Ekran hazırlanıyor…",
            Dock = DockStyle.Top,
            Height = 28,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 9f),
            ForeColor = p.Muted
        });
        modernContentPanel.Controls.Add(cover);
        cover.BringToFront();
        navigationCover = cover;
        cover.Refresh();
    }

    void HideNavigationCover()
    {
        if (navigationCover is null) return;
        if (modernContentPanel is not null && !modernContentPanel.IsDisposed)
            modernContentPanel.Controls.Remove(navigationCover);
        navigationCover.Dispose();
        navigationCover = null;
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
        var descriptor=PdksCommandCatalog.Get(id);
        if(descriptor.Placement==PdksCommandPlacement.Management ||
           id is PdksCommandId.Definitions or PdksCommandId.Groups or PdksCommandId.Periods or
                 PdksCommandId.Holidays or PdksCommandId.DailyWorkHours or PdksCommandId.AnnualWorkPlan or
                 PdksCommandId.PayrollFields or PdksCommandId.EarningsTypes or PdksCommandId.TerminalCenter or
                 PdksCommandId.TerminalSettings or PdksCommandId.TerminalProfiles or PdksCommandId.DataSources or
                 PdksCommandId.BackupRestore or PdksCommandId.Integrations or PdksCommandId.AuditHistory or
                 PdksCommandId.UserManagement or PdksCommandId.License)
        {
            SelectManagementNav();
            return;
        }
        if(modernManageButton is not null && !modernManageButton.IsDisposed)
        {
            modernManageButton.BackColor=p.Sidebar;
            modernManageButton.ForeColor=p.SidebarMuted;
        }
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

    void SelectManagementNav()
    {
        var p=PdksAppearance.Current;
        if(activeNavButton is not null && !activeNavButton.IsDisposed)
        {
            activeNavButton.BackColor=p.Sidebar;
            activeNavButton.ForeColor=p.SidebarMuted;
        }
        activeNavButton=null;
        if(modernManageButton is null || modernManageButton.IsDisposed)return;
        modernManageButton.BackColor=p.SidebarHover;
        modernManageButton.ForeColor=p.SidebarText;
    }

    static PdksCommandId PrimaryParent(PdksCommandId id) => id switch
    {
        PdksCommandId.Operations or PdksCommandId.LiveAttendance or PdksCommandId.MonthlyAttendanceAdmin or PdksCommandId.AttendanceExceptions or
        PdksCommandId.AttendanceHistory or PdksCommandId.DepartmentAttendanceAnalytics
            => PdksCommandId.EntryExit,
        PdksCommandId.TerminalCenter or PdksCommandId.TerminalSettings or
        PdksCommandId.TerminalProfiles or PdksCommandId.DataSources
            => PdksCommandId.EntryExit,
        PdksCommandId.Leave or PdksCommandId.EarningsDeductions or PdksCommandId.PayrollPayments or PdksCommandId.QuickOperations
            => PdksCommandId.Personnel,
        PdksCommandId.TimesheetDaily or PdksCommandId.TimesheetResults
            => PdksCommandId.TimesheetMonthly,
        PdksCommandId.PayrollAdjustment or PdksCommandId.PeriodControlCenter or
        PdksCommandId.PayrollPayslip or PdksCommandId.PayrollOvertime
            => PdksCommandId.PayrollGeneral,
        PdksCommandId.WorkingDate or PdksCommandId.Periods or PdksCommandId.Groups or
        PdksCommandId.Holidays or PdksCommandId.DailyWorkHours or PdksCommandId.AnnualWorkPlan or
        PdksCommandId.PayrollFields or PdksCommandId.EarningsTypes or PdksCommandId.Definitions
            => PdksCommandId.Home,
        _ => id
    };

    void ShowOperationsCenter()
    {
        var view=new OperationsCenterForm(
            PdksCommandCatalog.All.Where(CanExecute),
            ExecuteCommand);
        ShowEmbedded(view,"attendance-center","Giriş / Çıkış");
        SetModernPage("Giriş / Çıkış","Bugünün durumu, kart kayıtları, eksikler ve devam analizi");
    }

    void ShowManagementCenter()
    {
        if(currentWorkspaceCommand is PdksCommandId previous)
            navigationHistory.Push(previous);
        currentWorkspaceCommand=null;
        RefreshBackButton();

        var view = new ManagementCenterForm(
            PdksCommandCatalog.Management.Where(CanExecute),
            ExecuteCommand);
        ShowEmbedded(view, "management-center", "Yönetim Merkezi");
        SetModernPage("Yönetim Merkezi", "Personel, puantaj, bordro, tanımlar ve sistem işlemleri");
        SelectManagementNav();
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

        var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,BackColor=p.Surface,Margin=Padding.Empty};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,500));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var left = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount=2, RowCount = 1, BackColor = p.Surface };
        left.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,48));
        left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        left.RowStyles.Add(new RowStyle(SizeType.Percent,100));

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
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = p.Surface,
            Padding = new Padding(0, 10, 0, 0)
        };
        var quickSearch = PdksUiKit.Button("İşlem Ara  Ctrl+K",135,PdksActionRole.Secondary,OpenCommandPalette);
        quickSearch.Height=34;quickSearch.MinimumSize=new Size(135,34);quickSearch.MaximumSize=new Size(135,34);
        quickSearch.Margin=new Padding(10,0,0,0);

        var user = new RoundedLabel
        {
            AutoSize = false,
            Width = 128,
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
            Width = 62,
            Height = 34,
            Text = DateTime.Now.ToString("HH:mm"),
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold)
        };
        var testMode = string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_SKIP_LOGIN"),"1",StringComparison.OrdinalIgnoreCase);
        var live = new Label
        {
            AutoSize = false,
            Width = testMode ? 118 : 108,
            Height = 34,
            Text = testMode ? "● TEST MODU" : "● SİSTEM AKTİF",
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = testMode ? p.Warning : p.Success,
            Font = new Font("Segoe UI", 8.2f, FontStyle.Bold)
        };
        right.Controls.Add(user);
        right.Controls.Add(modernClock);
        right.Controls.Add(live);
        right.Controls.Add(quickSearch);

        layout.Controls.Add(left,0,0);
        layout.Controls.Add(right,1,0);
        bar.Controls.Add(layout);

        modernClockTimer = new System.Windows.Forms.Timer { Interval = 15000 };
        modernClockTimer.Tick += (_, _) => { if (modernClock is not null) modernClock.Text = DateTime.Now.ToString("HH:mm"); };
        modernClockTimer.Start();
        return bar;
    }

    Control BuildModernFooter()
    {
        var p=PdksAppearance.Current;
        var bar = new Panel { Dock = DockStyle.Fill, BackColor = p.Surface, Padding = new Padding(14, 0, 14, 0) };
        var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,BackColor=p.Surface,Margin=Padding.Empty};
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,390));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,230));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        modernDbState = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 7.8f)
        };
        modernActivityState = new Label
        {
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.MiddleCenter,
            ForeColor=shellActivityOk==true?p.Success:shellActivityOk==false?p.Warning:p.Muted,
            Font=new Font("Segoe UI",7.8f,FontStyle.Bold),
            AutoEllipsis=true,
            Text=shellActivityText
        };
        var version = new Label
        {
            Dock = DockStyle.Fill,
            Text = $"KY PDKS 6.5  •  {PdksAppearance.ModeLabel} / {PdksAppearance.AccentLabel}",
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = p.Muted,
            Font = new Font("Segoe UI", 7.8f)
        };
        layout.Controls.Add(modernDbState,0,0);
        layout.Controls.Add(modernActivityState,1,0);
        layout.Controls.Add(version,2,0);
        bar.Controls.Add(layout);
        RefreshModernDbState();
        RefreshShellActivity();
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

    void SetShellActivity(string text,bool? ok=null)
    {
        shellActivityText=string.IsNullOrWhiteSpace(text)?"Hazır":text.Trim();
        shellActivityOk=ok;
        RefreshShellActivity();
    }

    void RefreshShellActivity()
    {
        if(modernActivityState is null || modernActivityState.IsDisposed)return;
        var p=PdksAppearance.Current;
        modernActivityState.Text=shellActivityText;
        modernActivityState.ForeColor=shellActivityOk==true?p.Success:shellActivityOk==false?p.Warning:p.Muted;
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
