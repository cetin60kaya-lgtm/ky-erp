namespace HKN.Personel.Native;

public sealed class OperationsCenterForm : Form
{
    readonly IReadOnlyDictionary<PdksCommandId,PdksCommandDescriptor> commands;
    readonly Action<PdksCommandId> execute;

    static readonly PdksCommandId[] Daily =
    [
        PdksCommandId.LiveAttendance,
        PdksCommandId.AttendanceExceptions,
        PdksCommandId.AttendanceHistory,
        PdksCommandId.DepartmentAttendanceAnalytics,
        PdksCommandId.EntryExit,
        PdksCommandId.Leave,
        PdksCommandId.EarningsDeductions,
        PdksCommandId.TimesheetMonthly,
        PdksCommandId.TerminalCenter
    ];

    public OperationsCenterForm(IEnumerable<PdksCommandDescriptor> commandSet,Action<PdksCommandId> commandExecutor)
    {
        commands=commandSet.Where(x=>Daily.Contains(x.Id)).ToDictionary(x=>x.Id);
        execute=commandExecutor;
        Text="Operasyon";
        FormBorderStyle=FormBorderStyle.None;
        TopLevel=false;
        Dock=DockStyle.Fill;
        Font=new Font("Segoe UI",9f);
        Build();
        PdksAppearance.Changed+=AppearanceChanged;
        Disposed+=(_,_)=>PdksAppearance.Changed-=AppearanceChanged;
    }

    void AppearanceChanged(object? sender,EventArgs e)
    {
        if(IsDisposed)return;
        void rebuild(){Controls.Clear();Build();}
        if(InvokeRequired)BeginInvoke((Action)rebuild);else rebuild();
    }

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;

        var root=new TableLayoutPanel
        {
            Dock=DockStyle.Fill,
            RowCount=4,
            ColumnCount=1,
            Padding=new Padding(8,4,8,18),
            BackColor=p.Canvas
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,112));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,32));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var hero=new Panel{Dock=DockStyle.Fill,BackColor=p.Canvas};
        hero.Controls.Add(new Label{
            Text="Günlük Operasyon",
            Location=new Point(4,4),
            AutoSize=true,
            Font=new Font("Segoe UI",17f,FontStyle.Bold),
            ForeColor=p.Text
        });
        hero.Controls.Add(new Label{
            Text="Önce istisnaları gör, sonra düzelt; puantaja temiz veri gönder.",
            Location=new Point(6,40),
            AutoSize=true,
            Font=new Font("Segoe UI",9.2f),
            ForeColor=p.Muted
        });
        root.Controls.Add(hero,0,0);

        var flow=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=6,BackColor=p.Canvas,Padding=new Padding(0,0,0,10)};
        for(var i=0;i<6;i++)flow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,16.666f));
        var steps=new (string Title,string Text,PdksCommandId Id)[]
        {
            ("1","Terminalden Al",PdksCommandId.TerminalCenter),
            ("2","Canlı Kontrol",PdksCommandId.LiveAttendance),
            ("3","İstisnaları Gör",PdksCommandId.AttendanceExceptions),
            ("4","Eksikleri Düzelt",PdksCommandId.EntryExit),
            ("5","İzin / Ek Kayıt",PdksCommandId.Leave),
            ("6","Puantaja Geç",PdksCommandId.TimesheetMonthly)
        };
        for(var i=0;i<steps.Length;i++)flow.Controls.Add(Step(steps[i].Title,steps[i].Text,steps[i].Id),i,0);
        root.Controls.Add(flow,0,1);

        root.Controls.Add(new Label{
            Text="İşlemler",
            Dock=DockStyle.Fill,
            TextAlign=ContentAlignment.BottomLeft,
            Font=new Font("Segoe UI",10.5f,FontStyle.Bold),
            ForeColor=p.Text
        },0,2);

        var grid=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=3,BackColor=p.Canvas,Padding=new Padding(0,8,0,0)};
        for(var i=0;i<3;i++)grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,33.333f));
        var visible=Daily.Where(commands.ContainsKey).Select(id=>commands[id]).ToArray();
        for(var i=0;i<visible.Length;i++)grid.Controls.Add(CommandCard(visible[i]),i%3,i/3);
        root.Controls.Add(grid,0,3);

        Controls.Add(root);
    }

    Control Step(string number,string title,PdksCommandId id)
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(12);
        card.Margin=new Padding(0,0,10,0);
        card.Cursor=Cursors.Hand;
        var num=new Label{
            Text=number,
            Location=new Point(10,12),
            Size=new Size(30,30),
            TextAlign=ContentAlignment.MiddleCenter,
            Font=new Font("Segoe UI",10f,FontStyle.Bold),
            BackColor=p.PrimarySoft,
            ForeColor=p.Primary
        };
        var text=new Label{
            Text=title,
            Location=new Point(50,14),
            Size=new Size(150,32),
            AutoEllipsis=true,
            Font=new Font("Segoe UI",8.8f,FontStyle.Bold),
            ForeColor=p.Text
        };
        card.Controls.Add(num);card.Controls.Add(text);
        void open(object? _,EventArgs __)=>execute(id);
        foreach(Control c in new Control[]{card,num,text}){c.Click+=open;c.Cursor=Cursors.Hand;}
        return card;
    }

    Control CommandCard(PdksCommandDescriptor command)
    {
        var p=PdksAppearance.Current;
        var card=PdksUiKit.Card(0);
        card.Height=94;
        card.MinimumSize=new Size(250,94);
        card.Margin=new Padding(0,0,12,12);
        card.Cursor=Cursors.Hand;

        var icon=new PictureBox{
            Image=PdksToolbarIcons.Create(command.Icon),
            Location=new Point(16,22),
            Size=new Size(38,38),
            SizeMode=PictureBoxSizeMode.CenterImage,
            BackColor=p.PrimarySoft
        };
        var title=new Label{
            Text=command.Title,
            Location=new Point(68,14),
            Size=new Size(260,26),
            AutoEllipsis=true,
            Font=new Font("Segoe UI",9.8f,FontStyle.Bold),
            ForeColor=p.Text
        };
        var hint=new Label{
            Text=command.Hint,
            Location=new Point(68,42),
            Size=new Size(300,36),
            AutoEllipsis=true,
            Font=new Font("Segoe UI",8.2f),
            ForeColor=p.Muted
        };
        var arrow=new Label{
            Text="›",
            Dock=DockStyle.Right,
            Width=30,
            TextAlign=ContentAlignment.MiddleCenter,
            Font=new Font("Segoe UI",18f),
            ForeColor=p.Muted
        };
        card.Controls.Add(arrow);card.Controls.Add(icon);card.Controls.Add(title);card.Controls.Add(hint);
        void open(object? _,EventArgs __)=>execute(command.Id);
        foreach(Control c in new Control[]{card,icon,title,hint,arrow}){c.Click+=open;c.Cursor=Cursors.Hand;}
        card.MouseEnter+=(_,_)=>card.BackColor=p.SurfaceAlt;
        card.MouseLeave+=(_,_)=>card.BackColor=p.Surface;
        return card;
    }
}
