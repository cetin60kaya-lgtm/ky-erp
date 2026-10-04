using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed class ModernHomeDashboard : UserControl
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly IReadOnlyDictionary<PdksCommandId,PdksCommandDescriptor> commands;
    readonly Action<PdksCommandId> execute;
    readonly string displayName;
    Label activeValue = MetricValue();
    Label arrivedValue = MetricValue();
    Label leaveValue = MetricValue();
    Label pendingValue = MetricValue();
    Label attentionState = StatusLabel();
    Label terminalState = StatusLabel();
    Label dbState = StatusLabel();
    Label syncState = StatusLabel();
    readonly System.Windows.Forms.Timer timer = new() { Interval = 30000 };

    static readonly PdksCommandId[] QuickOrder =
    [
        PdksCommandId.EntryExit,
        PdksCommandId.AttendanceExceptions,
        PdksCommandId.Leave,
        PdksCommandId.TimesheetMonthly,
        PdksCommandId.PayrollGeneral,
        PdksCommandId.Reports
    ];

    public ModernHomeDashboard(IEnumerable<PdksCommandDescriptor> commandSet, Action<PdksCommandId> commandExecutor, string? userDisplayName = null)
    {
        commands = commandSet.ToDictionary(x=>x.Id);
        execute = commandExecutor;
        displayName = string.IsNullOrWhiteSpace(userDisplayName) ? "Kullanıcı" : userDisplayName.Trim();
        Dock = DockStyle.Fill;
        Font = new Font("Segoe UI",9f);
        DoubleBuffered = true;
        Build();
        Shown += async (_,_) => await RefreshDashboardAsync();
        timer.Tick += async (_,_) => await RefreshDashboardAsync();
        PdksAppearance.Changed += AppearanceChanged;
        if (Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT") != "1") timer.Start();
        Disposed += (_,_) =>
        {
            timer.Stop();
            PdksAppearance.Changed -= AppearanceChanged;
        };
    }

    event EventHandler? Shown
    {
        add { HandleCreated += value; }
        remove { HandleCreated -= value; }
    }

    void AppearanceChanged(object? sender, EventArgs e)
    {
        if (IsDisposed) return;
        void rebuild()
        {
            Controls.Clear();
            activeValue=MetricValue();arrivedValue=MetricValue();leaveValue=MetricValue();pendingValue=MetricValue();
            attentionState=StatusLabel();terminalState=StatusLabel();dbState=StatusLabel();syncState=StatusLabel();
            Build();
            _ = RefreshDashboardAsync();
        }
        if (InvokeRequired) BeginInvoke((Action)rebuild); else rebuild();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;

        var scroll = new Panel { Dock=DockStyle.Fill, AutoScroll=true, BackColor=p.Canvas };
        var root = new TableLayoutPanel
        {
            Dock=DockStyle.Top,
            AutoSize=true,
            ColumnCount=1,
            RowCount=5,
            Padding=new Padding(6,4,6,24),
            BackColor=p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,64));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,114));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,220));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,252));

        var hero = new Panel { Dock=DockStyle.Fill, BackColor=p.Canvas };
        hero.Controls.Add(new Label
        {
            Text=$"İyi çalışmalar, {displayName}",
            Location=new Point(2,2),
            AutoSize=true,
            Font=new Font("Segoe UI",17f,FontStyle.Bold),
            ForeColor=p.Text
        });
        hero.Controls.Add(new Label
        {
            Text=$"{DateTime.Today:dd MMMM yyyy} • Günlük personel operasyon özeti",
            Location=new Point(4,37),
            AutoSize=true,
            Font=new Font("Segoe UI",9.5f),
            ForeColor=p.Muted
        });
        root.Controls.Add(hero,0,0);

        var metrics = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=4, Padding=new Padding(0,0,0,10), BackColor=p.Canvas };
        for(var i=0;i<4;i++) metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25));
        metrics.Controls.Add(MetricCard("Aktif Personel","Toplam aktif çalışan",activeValue,PdksToolbarIcon.Personnel),0,0);
        metrics.Controls.Add(MetricCard("Bugün Gelen","Kart basan personel",arrivedValue,PdksToolbarIcon.Live),1,0);
        metrics.Controls.Add(MetricCard("İzinli","Bugün izinli",leaveValue,PdksToolbarIcon.Periods),2,0);
        metrics.Controls.Add(MetricCard("Bekleyen","Henüz kart basmayan",pendingValue,PdksToolbarIcon.Results),3,0);
        root.Controls.Add(metrics,0,1);

        root.Controls.Add(new Label
        {
            Text="Hızlı İşlemler",
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.BottomLeft,
            Font=new Font("Segoe UI",11f,FontStyle.Bold),
            ForeColor=p.Text
        },0,2);

        var actionGrid = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=3, RowCount=2, Padding=new Padding(0,8,0,6), BackColor=p.Canvas };
        for(var i=0;i<3;i++) actionGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.333f));
        actionGrid.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        actionGrid.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        var visible=QuickOrder.Where(commands.ContainsKey).Select(id=>commands[id]).ToArray();
        for(var i=0;i<visible.Length;i++)
            actionGrid.Controls.Add(ActionCard(visible[i]),i%3,i/3);
        root.Controls.Add(actionGrid,0,3);

        var lower = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(0,6,0,0), BackColor=p.Canvas };
        lower.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,65));
        lower.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));
        lower.Controls.Add(WorkflowCard(),0,0);
        lower.Controls.Add(SystemCard(),1,0);
        root.Controls.Add(lower,0,4);

        scroll.Controls.Add(root);
        Controls.Add(scroll);
    }

    Control MetricCard(string title,string subtitle,Label value,PdksToolbarIcon icon)
    {
        var p=PdksAppearance.Current;
        var card=CardPanel();
        card.Margin=new Padding(0,0,12,0);
        var iconBox=new PictureBox{Image=PdksToolbarIcons.Create(icon),SizeMode=PictureBoxSizeMode.CenterImage,Location=new Point(18,14),Size=new Size(36,36),BackColor=p.PrimarySoft};
        value.Location=new Point(68,11); value.Size=new Size(150,34);
        var titleLabel=new Label{Text=title,Location=new Point(68,45),AutoSize=true,Font=new Font("Segoe UI",9.3f,FontStyle.Bold),ForeColor=p.Text};
        var sub=new Label{Text=subtitle,Location=new Point(18,72),AutoSize=true,Font=new Font("Segoe UI",8.3f),ForeColor=p.Muted};
        card.Controls.Add(iconBox);card.Controls.Add(value);card.Controls.Add(titleLabel);card.Controls.Add(sub);
        return card;
    }

    static Label MetricValue()
    {
        var p=PdksAppearance.Current;
        return new Label{Text="—",AutoSize=false,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",20f,FontStyle.Bold),ForeColor=p.Text};
    }

    static Label StatusLabel()
    {
        var p=PdksAppearance.Current;
        return new Label{AutoSize=false,Height=24,Dock=DockStyle.Top,TextAlign=ContentAlignment.MiddleLeft,ForeColor=p.Muted};
    }

    Control ActionCard(PdksCommandDescriptor command)
    {
        var p=PdksAppearance.Current;
        var card=CardPanel();
        card.Margin=new Padding(0,0,12,12);
        card.Cursor=Cursors.Hand;
        var pic=new PictureBox{Image=PdksToolbarIcons.Create(command.Icon),Location=new Point(18,19),Size=new Size(38,38),SizeMode=PictureBoxSizeMode.CenterImage,BackColor=Color.Transparent};
        var t=new Label{Text=command.Title,Location=new Point(70,18),AutoSize=true,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=p.Text,BackColor=Color.Transparent};
        var s=new Label{Text=command.Hint,Location=new Point(70,45),AutoSize=true,Font=new Font("Segoe UI",8.6f),ForeColor=p.Muted,BackColor=Color.Transparent};
        var arrow=new Label{Text="›",Dock=DockStyle.Right,Width=36,TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",19f),ForeColor=p.Muted,BackColor=Color.Transparent};
        card.Controls.Add(arrow);card.Controls.Add(pic);card.Controls.Add(t);card.Controls.Add(s);
        void invoke(object? _,EventArgs __)=>execute(command.Id);
        foreach(Control c in new Control[]{card,pic,t,s,arrow}){c.Click+=invoke;c.Cursor=Cursors.Hand;}
        card.MouseEnter+=(_,_)=>card.BackColor=p.SurfaceAlt;
        card.MouseLeave+=(_,_)=>card.BackColor=p.Surface;
        return card;
    }

    Control WorkflowCard()
    {
        var p=PdksAppearance.Current;
        var card=CardPanel();card.Margin=new Padding(0,0,12,0);card.Padding=new Padding(20);
        var steps=PdksWorkflowCatalog.All.OrderBy(x=>x.Order).ToArray();
        var layout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=steps.Length+1,BackColor=p.Surface,Margin=Padding.Empty};
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute,34));
        for(var i=0;i<steps.Length;i++)layout.RowStyles.Add(new RowStyle(SizeType.Percent,100f/steps.Length));
        layout.Controls.Add(new Label{Text="Standart İş Akışı",Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=p.Text},0,0);

        for(var i=0;i<steps.Length;i++)
        {
            var step=steps[i];
            var b=new Button
            {
                Text=$"{i+1}  {step.Title}",
                Dock=DockStyle.Fill,
                FlatStyle=FlatStyle.Flat,
                BackColor=p.Surface,
                ForeColor=p.Muted,
                Font=new Font("Segoe UI",8.6f,FontStyle.Regular),
                TextAlign=ContentAlignment.MiddleLeft,
                Cursor=Cursors.Hand,
                Padding=new Padding(4,0,0,0),
                Margin=new Padding(0,1,0,1),
                MinimumSize=new Size(0,28)
            };
            b.FlatAppearance.BorderSize=0;
            b.FlatAppearance.MouseOverBackColor=p.SurfaceAlt;
            b.Click+=(_,_)=>execute(step.Command);
            layout.Controls.Add(b,0,i+1);
        }
        card.Controls.Add(layout);
        return card;
    }

    Control SystemCard()
    {
        var p=PdksAppearance.Current;
        var card=CardPanel();card.Padding=new Padding(20);card.Margin=Padding.Empty;
        var open=new Button{Text="Terminal Merkezini Aç",Dock=DockStyle.Bottom,Height=36,FlatStyle=FlatStyle.Flat,BackColor=p.Surface,ForeColor=p.Primary,Font=new Font("Segoe UI",9f,FontStyle.Bold),Cursor=Cursors.Hand};
        open.FlatAppearance.BorderColor=p.Border;open.Click+=(_,_)=>execute(PdksCommandId.TerminalCenter);
        attentionState.ForeColor=p.Muted;terminalState.ForeColor=p.Muted;dbState.ForeColor=p.Muted;syncState.ForeColor=p.Muted;
        var body=new Panel{Dock=DockStyle.Fill,Padding=new Padding(0,6,0,2),BackColor=p.Surface};
        body.Controls.Add(syncState);body.Controls.Add(dbState);body.Controls.Add(terminalState);body.Controls.Add(attentionState);
        card.Controls.Add(open);card.Controls.Add(body);card.Controls.Add(new Label{Text="Bugün / Sistem",Dock=DockStyle.Top,Height=34,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=p.Text});
        return card;
    }

    static Panel CardPanel()
    {
        var p=PdksAppearance.Current;
        return new ModernCardPanel{Dock=DockStyle.Fill,BackColor=p.Surface,Padding=new Padding(0),BorderColor=p.Border,Radius=12};
    }

    sealed record DashboardSnapshot(
        int Active,int Arrived,int Leave,int MissingExit,int Late,int Absent,int Overtime,
        bool DbReady,DateTime? LastSync,int LastRead,string? Error);

    async Task RefreshDashboardAsync()
    {
        if (IsDisposed) return;
        DashboardSnapshot snapshot;
        try
        {
            snapshot = await Task.Run(() =>
            {
                try
                {
                    var database = new FirebirdDatabase(PdksOptions.FromEnvironment());
                    var today=DateTime.Today;var tomorrow=today.AddDays(1);
                    var active=Convert.ToInt32(database.Scalar("select count(*) from KIMLIK where ICTARIH is null"));
                    var arrived=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from GIRCIK where GTARIH>=@A and GTARIH<@B",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var leave=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from OZELIZIN where TARIH>=@A and TARIH<@B",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var missingExit=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from GIRCIK where GTARIH>=@A and GTARIH<@B and (CSAAT is null or trim(CSAAT)='')",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var late=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from PUANTAJ where TARIH>=@A and TARIH<@B and coalesce(GECD,0)>0",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var absent=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from PUANTAJ where TARIH>=@A and TARIH<@B and coalesce(DEVAMSIZLIKD,0)>0",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var overtime=Convert.ToInt32(database.Scalar("select count(distinct PKNO) from PUANTAJ where TARIH>=@A and TARIH<@B and (coalesce(DAKIKA2,0)+coalesce(DAKIKA3,0))>0",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
                    var sync=TerminalSyncService.ReadState();
                    return new DashboardSnapshot(active,arrived,leave,missingExit,late,absent,overtime,
                        StartupConfiguration.IsReady(),sync?.LastAt,sync?.ReadCount ?? 0,null);
                }
                catch(Exception ex)
                {
                    return new DashboardSnapshot(0,0,0,0,0,0,0,StartupConfiguration.IsReady(),null,0,ex.GetBaseException().Message);
                }
            });
        }
        catch (Exception ex)
        {
            snapshot = new DashboardSnapshot(0,0,0,0,0,0,0,StartupConfiguration.IsReady(),null,0,ex.GetBaseException().Message);
        }

        if (IsDisposed) return;
        var p=PdksAppearance.Current;
        if(snapshot.Error is not null)
        {
            activeValue.Text=arrivedValue.Text=leaveValue.Text=pendingValue.Text="—";
            attentionState.Text="●  Günlük özet yüklenemedi";
            attentionState.ForeColor=p.Warning;
        }
        else
        {
            activeValue.Text=snapshot.Active.ToString("N0");
            arrivedValue.Text=snapshot.Arrived.ToString("N0");
            leaveValue.Text=snapshot.Leave.ToString("N0");
            pendingValue.Text=Math.Max(0,snapshot.Active-snapshot.Arrived-snapshot.Leave).ToString("N0");
            attentionState.Text=$"●  Dikkat: {snapshot.MissingExit} eksik çıkış • {snapshot.Late} geç • {snapshot.Absent} devamsız • {snapshot.Overtime} mesai";
            attentionState.ForeColor=(snapshot.MissingExit+snapshot.Late+snapshot.Absent)>0?p.Warning:p.Success;
        }

        dbState.Text=snapshot.DbReady?"●  Veritabanı: bağlı":"●  Veritabanı: bağlantı bekliyor";
        dbState.ForeColor=snapshot.DbReady?p.Success:p.Warning;
        if(snapshot.LastSync is null)
        {
            terminalState.Text="●  Terminal: son eşitleme yok";
            terminalState.ForeColor=p.Warning;
            syncState.Text="Son veri alımı: —";
        }
        else
        {
            terminalState.Text="●  Terminal: profil hazır";
            terminalState.ForeColor=p.Muted;
            syncState.Text=$"Son veri alımı: {snapshot.LastSync:dd.MM.yyyy HH:mm} • {snapshot.LastRead:N0} kayıt";
        }
    }

    sealed class ModernCardPanel:Panel
    {
        public Color BorderColor{get;set;}=Color.LightGray;
        public int Radius{get;set;}=12;
        public ModernCardPanel(){DoubleBuffered=true;ResizeRedraw=true;}
        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var path=Round(new Rectangle(0,0,Math.Max(1,Width-1),Math.Max(1,Height-1)),Radius);
            using var pen=new Pen(BorderColor);
            e.Graphics.DrawPath(pen,path);
        }
        static System.Drawing.Drawing2D.GraphicsPath Round(Rectangle r,int radius)
        {
            var d=radius*2;var p=new System.Drawing.Drawing2D.GraphicsPath();
            p.AddArc(r.Left,r.Top,d,d,180,90);p.AddArc(r.Right-d,r.Top,d,d,270,90);
            p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.Left,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;
        }
    }
}
