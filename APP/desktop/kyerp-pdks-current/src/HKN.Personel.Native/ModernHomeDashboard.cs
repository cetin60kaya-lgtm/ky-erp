using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed class ModernHomeDashboard : UserControl
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly Label activeValue = MetricValue();
    readonly Label arrivedValue = MetricValue();
    readonly Label leaveValue = MetricValue();
    readonly Label pendingValue = MetricValue();
    readonly Label terminalState = new() { AutoSize=false, Height=24, Dock=DockStyle.Top, TextAlign=ContentAlignment.MiddleLeft };
    readonly Label dbState = new() { AutoSize=false, Height=24, Dock=DockStyle.Top, TextAlign=ContentAlignment.MiddleLeft };
    readonly Label syncState = new() { AutoSize=false, Height=24, Dock=DockStyle.Top, TextAlign=ContentAlignment.MiddleLeft };
    readonly System.Windows.Forms.Timer timer = new() { Interval = 30000 };

    static readonly Color Canvas = Color.FromArgb(245,247,250);
    static readonly Color Surface = Color.White;
    static readonly Color Border = Color.FromArgb(226,232,240);
    static readonly Color Text = Color.FromArgb(26,38,58);
    static readonly Color Muted = Color.FromArgb(100,116,139);
    static readonly Color Blue = Color.FromArgb(37,99,235);

    public ModernHomeDashboard(
        Action liveAttendance,
        Action entryExit,
        Action personnel,
        Action timesheet,
        Action payroll,
        Action reports,
        Action terminal)
    {
        Dock = DockStyle.Fill;
        BackColor = Canvas;
        Font = new Font("Segoe UI",9f);
        DoubleBuffered = true;
        Build(liveAttendance,entryExit,personnel,timesheet,payroll,reports,terminal);
        Shown += (_,_) => RefreshDashboard();
        timer.Tick += (_,_) => RefreshDashboard();
        if (Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT") != "1") timer.Start();
        Disposed += (_,_) => timer.Stop();
        RefreshDashboard();
    }

    event EventHandler? Shown
    {
        add { HandleCreated += value; }
        remove { HandleCreated -= value; }
    }

    void Build(Action liveAttendance, Action entryExit, Action personnel, Action timesheet, Action payroll, Action reports, Action terminal)
    {
        var scroll = new Panel { Dock=DockStyle.Fill, AutoScroll=true, BackColor=Canvas };
        var root = new TableLayoutPanel
        {
            Dock=DockStyle.Top,
            AutoSize=true,
            ColumnCount=1,
            RowCount=5,
            Padding=new Padding(6,4,6,24),
            BackColor=Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,82));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,132));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,258));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,220));

        var hero = new Panel { Dock=DockStyle.Fill, BackColor=Canvas };
        hero.Controls.Add(new Label
        {
            Text=$"İyi çalışmalar, {Environment.UserName}",
            Location=new Point(2,8),
            AutoSize=true,
            Font=new Font("Segoe UI",18f,FontStyle.Bold),
            ForeColor=Text
        });
        hero.Controls.Add(new Label
        {
            Text=$"{DateTime.Today:dd MMMM yyyy} • Günlük personel operasyon özeti",
            Location=new Point(4,46),
            AutoSize=true,
            Font=new Font("Segoe UI",9.5f),
            ForeColor=Muted
        });
        root.Controls.Add(hero,0,0);

        var metrics = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=4, Padding=new Padding(0,0,0,10), BackColor=Canvas };
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
            ForeColor=Text
        },0,2);

        var actionGrid = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=3, RowCount=2, Padding=new Padding(0,8,0,6), BackColor=Canvas };
        for(var i=0;i<3;i++) actionGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.333f));
        actionGrid.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        actionGrid.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        actionGrid.Controls.Add(ActionCard("Canlı Denetim","Anlık giriş, çıkış ve eksik kayıtlar",PdksToolbarIcon.Live,liveAttendance),0,0);
        actionGrid.Controls.Add(ActionCard("Giriş / Çıkış","Kart hareketlerini görüntüle ve düzenle",PdksToolbarIcon.EntryExit,entryExit),1,0);
        actionGrid.Controls.Add(ActionCard("Personel","Personel kartı ve özlük bilgileri",PdksToolbarIcon.Personnel,personnel),2,0);
        actionGrid.Controls.Add(ActionCard("Puantaj","Günlük ve aylık çalışma sonuçları",PdksToolbarIcon.Timesheet,timesheet),0,1);
        actionGrid.Controls.Add(ActionCard("Bordro","Hakediş, resmî bordro ve ödeme",PdksToolbarIcon.Payroll,payroll),1,1);
        actionGrid.Controls.Add(ActionCard("Raporlar","Operasyon ve bordro raporları",PdksToolbarIcon.Results,reports),2,1);
        root.Controls.Add(actionGrid,0,3);

        var lower = new TableLayoutPanel { Dock=DockStyle.Fill, ColumnCount=2, Padding=new Padding(0,6,0,0), BackColor=Canvas };
        lower.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,65));
        lower.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));
        lower.Controls.Add(InfoCard("Günün Akışı",BuildFlowText()),0,0);
        lower.Controls.Add(SystemCard(terminal),1,0);
        root.Controls.Add(lower,0,4);

        scroll.Controls.Add(root);
        Controls.Add(scroll);
    }

    Control MetricCard(string title,string subtitle,Label value,PdksToolbarIcon icon)
    {
        var card=CardPanel();
        card.Margin=new Padding(0,0,12,0);
        var iconBox=new PictureBox{Image=PdksToolbarIcons.Create(icon),SizeMode=PictureBoxSizeMode.CenterImage,Location=new Point(18,18),Size=new Size(38,38),BackColor=Color.FromArgb(239,246,255)};
        value.Location=new Point(72,15); value.Size=new Size(150,36);
        var titleLabel=new Label{Text=title,Location=new Point(72,51),AutoSize=true,Font=new Font("Segoe UI",9.5f,FontStyle.Bold),ForeColor=Text};
        var sub=new Label{Text=subtitle,Location=new Point(18,82),AutoSize=true,Font=new Font("Segoe UI",8.5f),ForeColor=Muted};
        card.Controls.Add(iconBox);card.Controls.Add(value);card.Controls.Add(titleLabel);card.Controls.Add(sub);
        return card;
    }

    static Label MetricValue()=>new(){Text="—",AutoSize=false,TextAlign=ContentAlignment.MiddleLeft,Font=new Font("Segoe UI",20f,FontStyle.Bold),ForeColor=Text};

    Control ActionCard(string title,string subtitle,PdksToolbarIcon icon,Action action)
    {
        var card=CardPanel();
        card.Margin=new Padding(0,0,12,12);
        card.Cursor=Cursors.Hand;
        var pic=new PictureBox{Image=PdksToolbarIcons.Create(icon),Location=new Point(18,19),Size=new Size(38,38),SizeMode=PictureBoxSizeMode.CenterImage,BackColor=Color.Transparent};
        var t=new Label{Text=title,Location=new Point(70,18),AutoSize=true,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=Text,BackColor=Color.Transparent};
        var s=new Label{Text=subtitle,Location=new Point(70,45),AutoSize=true,Font=new Font("Segoe UI",8.6f),ForeColor=Muted,BackColor=Color.Transparent};
        var arrow=new Label{Text="›",Dock=DockStyle.Right,Width=36,TextAlign=ContentAlignment.MiddleCenter,Font=new Font("Segoe UI",19f),ForeColor=Color.FromArgb(148,163,184),BackColor=Color.Transparent};
        card.Controls.Add(arrow);card.Controls.Add(pic);card.Controls.Add(t);card.Controls.Add(s);
        void invoke(object? _,EventArgs __)=>action();
        foreach(Control c in new Control[]{card,pic,t,s,arrow}){c.Click+=invoke;c.Cursor=Cursors.Hand;}
        card.MouseEnter+=(_,_)=>card.BackColor=Color.FromArgb(248,250,252);
        card.MouseLeave+=(_,_)=>card.BackColor=Surface;
        return card;
    }

    Control InfoCard(string title,string body)
    {
        var card=CardPanel();card.Margin=new Padding(0,0,12,0);card.Padding=new Padding(20);
        card.Controls.Add(new Label{Text=body,Dock=DockStyle.Fill,Font=new Font("Segoe UI",9f),ForeColor=Muted,TextAlign=ContentAlignment.TopLeft,Padding=new Padding(0,44,0,0)});
        card.Controls.Add(new Label{Text=title,Dock=DockStyle.Top,Height=34,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Text});
        return card;
    }

    Control SystemCard(Action terminal)
    {
        var card=CardPanel();card.Padding=new Padding(20);card.Margin=Padding.Empty;
        var open=new Button{Text="Terminal Merkezini Aç",Dock=DockStyle.Bottom,Height=36,FlatStyle=FlatStyle.Flat,BackColor=Color.White,ForeColor=Blue,Font=new Font("Segoe UI",9f,FontStyle.Bold),Cursor=Cursors.Hand};
        open.FlatAppearance.BorderColor=Color.FromArgb(191,219,254);open.Click+=(_,_)=>terminal();
        terminalState.ForeColor=Muted;dbState.ForeColor=Muted;syncState.ForeColor=Muted;
        var body=new Panel{Dock=DockStyle.Fill,Padding=new Padding(0,44,0,0),BackColor=Surface};
        body.Controls.Add(syncState);body.Controls.Add(dbState);body.Controls.Add(terminalState);
        card.Controls.Add(open);card.Controls.Add(body);card.Controls.Add(new Label{Text="Sistem Durumu",Dock=DockStyle.Top,Height=34,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=Text});
        return card;
    }

    static Panel CardPanel()=>new ModernCardPanel{Dock=DockStyle.Fill,BackColor=Surface,Padding=new Padding(0),BorderColor=Border,Radius=12};

    static string BuildFlowText() =>
        "1. Terminal hareketleri alınır ve doğrulanır\r\n\r\n" +
        "2. Eksik / hatalı giriş-çıkışlar kontrol edilir\r\n\r\n" +
        "3. İzin ve çalışma planı puantaja işlenir\r\n\r\n" +
        "4. Hakediş ve resmî bordro ayrı motorlarda hesaplanır";

    void RefreshDashboard()
    {
        try
        {
            var today=DateTime.Today;var tomorrow=today.AddDays(1);
            var active=Convert.ToInt32(db.Scalar("select count(*) from KIMLIK where ICTARIH is null"));
            var arrived=Convert.ToInt32(db.Scalar("select count(distinct PKNO) from GIRCIK where GTARIH>=@A and GTARIH<@B",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
            var leave=Convert.ToInt32(db.Scalar("select count(distinct PKNO) from OZELIZIN where TARIH>=@A and TARIH<@B",new FbParameter("@A",today),new FbParameter("@B",tomorrow)));
            activeValue.Text=active.ToString("N0");arrivedValue.Text=arrived.ToString("N0");leaveValue.Text=leave.ToString("N0");pendingValue.Text=Math.Max(0,active-arrived-leave).ToString("N0");
        }
        catch
        {
            activeValue.Text=arrivedValue.Text=leaveValue.Text=pendingValue.Text="—";
        }

        var path=Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH",EnvironmentVariableTarget.User)??Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH");
        dbState.Text=StartupConfiguration.IsReady()?"●  Veritabanı: bağlı":"●  Veritabanı: bağlantı bekliyor";
        dbState.ForeColor=StartupConfiguration.IsReady()?Color.FromArgb(22,163,74):Color.FromArgb(202,118,35);
        var state=TerminalSyncService.ReadState();
        if(state?.LastAt is null)
        {
            terminalState.Text="●  Terminal: son eşitleme yok";
            terminalState.ForeColor=Color.FromArgb(202,118,35);
            syncState.Text="Son veri alımı: —";
        }
        else
        {
            terminalState.Text="●  Terminal: bağlantı profili hazır";
            terminalState.ForeColor=Color.FromArgb(22,163,74);
            syncState.Text=$"Son veri alımı: {state.LastAt:dd.MM.yyyy HH:mm} • {state.ReadCount:N0} kayıt";
        }
    }

    sealed class ModernCardPanel:Panel
    {
        public Color BorderColor{get;set;}=Border;
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
