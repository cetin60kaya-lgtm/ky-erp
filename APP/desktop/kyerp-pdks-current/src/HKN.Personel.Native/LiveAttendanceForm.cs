using System.Data;
using System.Globalization;
using System.Reflection;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

public sealed partial class LiveAttendanceForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker date = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd",Width=225};
    readonly CheckBox live = new(){Text="Otomatik yenile",Checked=true,AutoSize=true,Padding=new Padding(8,6,0,0)};
    readonly Label device = new(){AutoSize=false,Width=430,Height=28,TextAlign=ContentAlignment.MiddleLeft};
    readonly Button refresh = new(){Text="Yenile",Width=85,Height=30};
    readonly Button syncNow = new(){Text="Eşitle",Width=85,Height=30};
    readonly Button clearLive = new(){Text="Canlıyı Temizle",Width=125,Height=30};
    readonly FlowLayoutPanel cards = new(){Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(2)};
    readonly TabControl tabs = new(){Dock=DockStyle.Fill};
    readonly Dictionary<string,DataGridView> grids = new();
    readonly System.Windows.Forms.Timer timer = new(){Interval=20000};
    readonly CancellationTokenSource closing = new();
    bool busy;
    DateTime? recoveredLegacyDay;
    string legacyRecoveryText = "";
    string lastUiFingerprint = "";
    DateTime lastRenderedDay = DateTime.MinValue;
    readonly List<(string Code,DateTime At,string Source)> unmatched = new();
    readonly Action<string,DateTime>? openEntryExit;
    readonly Action<string>? openPerson;

    public LiveAttendanceForm(Action<string,DateTime>? openEntryExit=null, Action<string>? openPerson=null)
    {
        this.openEntryExit=openEntryExit;this.openPerson=openPerson;Text="Canlı Personel Denetim";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1180,720);
        MinimumSize=new Size(1000,620);Font=new Font("Segoe UI",9f);BackColor=Color.FromArgb(246,249,253);
        DoubleBuffered=true;SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.AllPaintingInWmPaint|ControlStyles.UserPaint,true);
        date.Value=DateTime.Today;
        Build();
        EnableDoubleBuffer(this);
        Shown+=async (_,_)=>{timer.Start();await SyncAndLoadAsync(false,true);};
        refresh.Click+=async (_,_)=>await SyncAndLoadAsync(false,true);
        syncNow.Click+=async (_,_)=>await SyncAndLoadAsync(true,true);
        clearLive.Click+=(_,_)=>{TerminalSyncService.ClearLive();ShowLastSync();};
        date.ValueChanged+=async (_,_)=>{lastUiFingerprint="";await SyncAndLoadAsync(false,true);};
        timer.Tick+=async (_,_)=>{if(live.Checked&&Visible&&date.Value.Date==DateTime.Today)await SyncAndLoadAsync(false,false);};
        VisibleChanged+=(_,_)=>{if(IsDisposed)return;if(Visible)timer.Start();else timer.Stop();};
        FormClosed+=(_,_)=>{timer.Stop();closing.Cancel();};
    }

    static void EnableDoubleBuffer(Control root)
    {
        try
        {
            var property=typeof(Control).GetProperty("DoubleBuffered",BindingFlags.Instance|BindingFlags.NonPublic);
            if(property is not null)property.SetValue(root,true);
            foreach(Control child in root.Controls)EnableDoubleBuffer(child);
        }
        catch { }
    }

    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,Padding=new Padding(14),BackColor=Color.FromArgb(246,249,253)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,92));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,166));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));

        var header=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,Padding=new Padding(16,8,16,8),BackColor=Color.White};
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,38));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,27));
        var titleBox=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2};
        titleBox.RowStyles.Add(new RowStyle(SizeType.Percent,60));titleBox.RowStyles.Add(new RowStyle(SizeType.Percent,40));
        titleBox.Controls.Add(new Label{Text="Canlı Personel Denetimi",Dock=DockStyle.Fill,TextAlign=ContentAlignment.BottomLeft,Font=new Font("Segoe UI",16f,FontStyle.Bold),ForeColor=Color.FromArgb(27,44,68)},0,0);
        titleBox.Controls.Add(new Label{Text="Kart hareketleri • eksik basımlar • izin • içeride kalanlar",Dock=DockStyle.Fill,TextAlign=ContentAlignment.TopLeft,ForeColor=Color.FromArgb(88,103,124)},0,1);
        header.Controls.Add(titleBox,0,0);
        var controls=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,FlowDirection=FlowDirection.LeftToRight,Padding=new Padding(0,12,0,0)};
        controls.Controls.Add(date);controls.Controls.Add(live);controls.Controls.Add(refresh);controls.Controls.Add(syncNow);controls.Controls.Add(clearLive);header.Controls.Add(controls,1,0);
        device.Dock=DockStyle.Fill;device.TextAlign=ContentAlignment.MiddleRight;device.Font=new Font("Segoe UI",9f,FontStyle.Bold);device.ForeColor=Color.FromArgb(24,145,84);header.Controls.Add(device,2,0);
        root.Controls.Add(header,0,0);

        cards.BackColor=Color.Transparent;cards.Padding=new Padding(0,8,0,6);root.Controls.Add(cards,0,1);
        root.Controls.Add(BuildAssistantPanel(),0,2);
        AddTab("Genel");AddTab("Kart Basmayan");AddTab("İçeride / Çıkış Bekleyen");AddTab("İzinli");AddTab("Tamamlanan");AddTab("Eşleşmeyen Kart");
        root.Controls.Add(BuildTrackingWorkspace(),0,3);Controls.Add(root);
    }
    void AddTab(string title)
    {
        var grid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
            AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,SelectionMode=DataGridViewSelectionMode.FullRowSelect,
            MultiSelect=false,BackgroundColor=Color.White,RowHeadersVisible=false};
        grid.DataBindingComplete+=(_,_)=>PaintRows(grid);
        grid.SelectionChanged+=(_,_)=>UpdatePersonPreview(grid);
        grid.CellClick+=(_,_)=>UpdatePersonPreview(grid);
        var page=new TabPage(title);page.Controls.Add(grid);tabs.TabPages.Add(page);grids[title]=grid;
    }

    Label Card(string title,int value,Color back)
    {
        var cardWidth=Math.Clamp((Math.Max(880,cards.ClientSize.Width)-70)/8,105,165);
        var label=new Label{Width=cardWidth,Height=70,Margin=new Padding(4),BorderStyle=BorderStyle.None,
            Padding=new Padding(10,8,10,6),TextAlign=ContentAlignment.MiddleCenter,
            Font=new Font("Segoe UI",10f,FontStyle.Bold),ForeColor=Color.FromArgb(27,44,68),
            BackColor=back,Text=$"{title}\n{value:N0}",Cursor=Cursors.Hand};
        label.Paint+=(_,e)=>{using var p=new Pen(Color.FromArgb(214,225,238));e.Graphics.DrawRectangle(p,0,0,label.Width-1,label.Height-1);};
        label.Click+=(_,_)=>SelectStatusTab(title);
        cards.Controls.Add(label);return label;
    }

    void SelectStatusTab(string title)
    {
        var target = title switch
        {
            "Kart Basmayan" => "Kart Basmayan",
            "İçeride" or "Çıkış Eksik" => "İçeride / Çıkış Bekleyen",
            "İzinli" => "İzinli",
            "Tamamlanan" => "Tamamlanan",
            "Eşleşmeyen" => "Eşleşmeyen Kart",
            _ => "Genel"
        };
        var page = tabs.TabPages.Cast<TabPage>().FirstOrDefault(x => x.Text == target);
        if (page is not null) tabs.SelectedTab = page;
    }

    void OpenGridRow(DataGridView grid)
    {
        if (openEntryExit is null || grid.CurrentRow is null) return;
        if (!grid.Columns.Contains("Kart No")) return;
        var code = Convert.ToString(grid.CurrentRow.Cells["Kart No"].Value)?.Trim();
        if (string.IsNullOrWhiteSpace(code)) return;
        openEntryExit(code, date.Value.Date);
    }

    async Task SyncAndLoadAsync(bool syncDevice=false,bool forceUi=false)
    {
        if(busy||IsDisposed)return;busy=true;refresh.Enabled=false;syncNow.Enabled=false;
        try
        {
            if(syncDevice&&date.Value.Date==DateTime.Today)
            {
                RecoverLegacyBackup(date.Value.Date);
                var state=await TerminalSyncService.SyncAsync("Canlı ekran",null,closing.Token);
                if(state.ReadCount>0)device.ForeColor=state.DeviceCleared?Color.DarkGreen:Color.DarkOrange;
            }
            ShowLastSync();
            LoadDay(date.Value.Date,forceUi);
        }
        catch(OperationCanceledException){ }
        catch(Exception ex){device.Text="Denetim hatası: "+ex.Message;device.ForeColor=Color.DarkRed;}
        finally{busy=false;if(!IsDisposed){refresh.Enabled=true;syncNow.Enabled=true;}}
    }

    void ShowLastSync()
    {
        var s=TerminalSyncService.ReadState();
        if(s?.LastAt is null){device.Text="Son eşitleme: yok";device.ForeColor=Color.FromArgb(202,118,35);return;}
        device.Text=$"Son eşitleme {s.LastAt:dd.MM HH:mm:ss}   Okunan {s.ReadCount}   Eklenen/Güncellenen {s.Inserted}/{s.Updated}";
        device.ForeColor=s.ReadCount==0?Color.DarkGreen:Color.DarkOrange;
    }

    static ProfiledTerminalRecord ToRecord(TerminalDevicePunch punch)
    {
        var source=$"DEVICE|{punch.EmployeeCode}|{punch.OccurredAt:s}|{punch.InOut}|{punch.VerifyMode}|{punch.EventCode}|{punch.TerminalNumber}";
        return new ProfiledTerminalRecord(punch.EmployeeCode,punch.OccurredAt,punch.EventCode.ToString(CultureInfo.InvariantCulture),
            punch.TerminalNumber.ToString("000",CultureInfo.InvariantCulture),TerminalDirection.Unknown,source);
    }

    void ShowDevice(TerminalDeviceSnapshot s)
    {
        if(!s.Connected){device.Text="Kart cihazı: BAĞLI DEĞİL — "+s.Message;device.ForeColor=Color.DarkRed;return;}
        device.Text=$"Kart cihazı: BAĞLI   Cihaz saati {s.DeviceTime:HH:mm:ss}   Yeni kayıt {Math.Max(0,s.NewLogCount)}   Kart {Math.Max(0,s.CardCount)}{legacyRecoveryText}";
        device.ForeColor=Color.DarkGreen;
    }

    void RecoverLegacyBackup(DateTime day)
    {
        if(recoveredLegacyDay==day)return;recoveredLegacyDay=day;
        var options=PdksOptions.FromEnvironment();
        var file=Path.Combine(options.RuntimeRoot,"Terminal Bilgi Aktar","backup",$"{day.Day}&{day.Month}&{day.Year}.txt");
        if(!File.Exists(file))file=Path.Combine(@"D:\Hedef500\Hedef500","Terminal Bilgi Aktar","backup",$"{day.Day}&{day.Month}&{day.Year}.txt");
        if(!File.Exists(file))return;
        try
        {
            var profile=TerminalTransferProfile.CreateCanonicalTnf(options);
            var records=File.ReadAllLines(file).Where(x=>!string.IsNullOrWhiteSpace(x)).Select(x=>ProfiledTerminalParser.Parse(profile,x)).Where(x=>x.OccurredAt.Date==day).ToArray();
            if(records.Length==0)return;
            CaptureUnmatched(records.Select(x=>(x.EmployeeCode,x.OccurredAt,"Legacy yedek")),day);
            var result=new AttendanceImportService(db).Import(records,5);
            legacyRecoveryText=$"   Yedek kurtarma +{result.Inserted}/{result.Updated}";
        }
        catch(Exception ex){legacyRecoveryText="   Yedek kurtarma uyarısı: "+ex.Message;}
    }

    void LoadDay(DateTime day,bool forceUi)
    {
        var next=day.AddDays(1);
        var employees=db.Query(@"select k.PKNO,k.AD,k.SOYAD,k.GRUP,coalesce(g.AD,'') GRUP_AD
            from KIMLIK k left join GRUP g on g.KOD=k.GRUP
            where (k.IGTARIH is null or k.IGTARIH<@B) and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by k.PKNO",new FbParameter("@A",day),new FbParameter("@B",next));
        var moves=db.Query(@"select PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA from GIRCIK
            where GTARIH>=@A and GTARIH<@B order by PKNO,GTARIH,GDAKIKA",new FbParameter("@A",day),new FbParameter("@B",next));
        var leaves=db.Query(@"select PKNO,TIP,MAZERET,SUREDAKIKA,BASSAAT,BITSAAT from OZELIZIN
            where TARIH>=@A and TARIH<@B order by PKNO",new FbParameter("@A",day),new FbParameter("@B",next));
        var plans=db.Query(@"select p.GKOD,p.MTKOD,b.AD PLAN_AD,b.IGIRISS,b.GGTOL,b.DCIKISS,b.ECTOL,b.DEVAMSIZLIK
            from PLANA p left join PUANBILGI b on b.KOD=p.MTKOD where p.TARIH>=@A and p.TARIH<@B",
            new FbParameter("@A",day),new FbParameter("@B",next));
        var fallback=db.Query("select KOD,AD,IGIRISS,GGTOL,DCIKISS,ECTOL,DEVAMSIZLIK from PUANBILGI");
        var moveMap=moves.AsEnumerable().GroupBy(r=>S(r,"PKNO")).ToDictionary(g=>g.Key,g=>Movement(g));
        var leaveMap=leaves.AsEnumerable().GroupBy(r=>S(r,"PKNO")).ToDictionary(g=>g.Key,g=>LeaveInfo(g));
        var planMap=plans.AsEnumerable().GroupBy(r=>I(r,"GKOD")).ToDictionary(g=>g.Key,g=>ReadSchedule(g.First()));
        var fallbackMap=fallback.AsEnumerable().ToDictionary(r=>I(r,"KOD"),ReadSchedule);
        var rows=new List<DailyRow>();
        foreach(DataRow employee in employees.Rows)
        {
            var code=S(employee,"PKNO");var group=employee["GRUP"]==DBNull.Value?-1:I(employee,"GRUP");
            var groupName=S(employee,"GRUP_AD");var schedule=planMap.GetValueOrDefault(group)??FallbackSchedule(groupName,day,fallbackMap);
            moveMap.TryGetValue(code,out var movement);leaveMap.TryGetValue(code,out var leaveInfo);
            var fullLeave=leaveInfo.Minutes>0&&leaveInfo.Minutes>=Math.Max(420,schedule.WorkMinutes);
            var expected=schedule.WorkMinutes>0&&!fullLeave;
            var status=Status(day,schedule,expected,fullLeave,movement.Entry,movement.Exit);
            var warning=Warning(schedule,movement.Entry,movement.Exit,status);
            rows.Add(new DailyRow(code,$"{S(employee,"AD")} {S(employee,"SOYAD")}".Trim(),groupName,schedule.Name,
                movement.Entry?.ToString("HH:mm")??"",movement.Exit?.ToString("HH:mm")??"",status,warning,
                expected,fullLeave,movement.Entry.HasValue,movement.Exit.HasValue));
        }
        Bind(rows,day,forceUi);
    }

    void Bind(List<DailyRow> rows,DateTime day,bool forceUi)
    {
        var fingerprint=day.ToString("yyyyMMdd",CultureInfo.InvariantCulture)+"|"+
            string.Join("|",rows.Select(r=>$"{r.Code}~{r.Entry}~{r.Exit}~{r.Status}~{r.Warning}"))+"|"+
            string.Join("|",unmatched.Where(x=>x.At.Date==day.Date).OrderBy(x=>x.At).Select(x=>$"{x.Code}~{x.At:HHmmss}"));
        if(!forceUi&&lastRenderedDay==day.Date&&string.Equals(lastUiFingerprint,fingerprint,StringComparison.Ordinal))return;

        var selected=grids.ToDictionary(
            x=>x.Key,
            x=>x.Value.CurrentRow is not null&&x.Value.Columns.Contains("Kart No")?Convert.ToString(x.Value.CurrentRow.Cells["Kart No"].Value):null);

        SuspendLayout();cards.SuspendLayout();tabs.SuspendLayout();foreach(var grid in grids.Values)grid.SuspendLayout();
        try
        {
            grids["Genel"].DataSource=Table(rows);
            grids["Kart Basmayan"].DataSource=Table(rows.Where(r=>r.Status=="Kart Basmadı"));
            grids["İçeride / Çıkış Bekleyen"].DataSource=Table(rows.Where(r=>r.Status is "İçeride" or "Çıkış Kartı Yok"));
            grids["İzinli"].DataSource=Table(rows.Where(r=>r.FullLeave));
            grids["Tamamlanan"].DataSource=Table(rows.Where(r=>r.HasEntry&&r.HasExit));
            grids["Eşleşmeyen Kart"].DataSource=UnmatchedTable();
            cards.Controls.Clear();
            Card("Beklenen",rows.Count(r=>r.Expected),Color.AliceBlue);Card("Gelen",rows.Count(r=>r.Expected&&r.HasEntry),Color.Honeydew);
            Card("Kart Basmayan",rows.Count(r=>r.Status=="Kart Basmadı"),Color.MistyRose);Card("İzinli",rows.Count(r=>r.FullLeave),Color.LemonChiffon);
            Card("İçeride",rows.Count(r=>r.Status=="İçeride"),Color.Honeydew);Card("Çıkış Eksik",rows.Count(r=>r.Status=="Çıkış Kartı Yok"),Color.MistyRose);
            Card("Tamamlanan",rows.Count(r=>r.HasEntry&&r.HasExit),Color.WhiteSmoke);Card("Eşleşmeyen",unmatched.Count(x=>x.At.Date==day.Date),Color.LavenderBlush);

            foreach(var pair in selected)
            {
                if(string.IsNullOrWhiteSpace(pair.Value)||!grids.TryGetValue(pair.Key,out var grid)||!grid.Columns.Contains("Kart No"))continue;
                foreach(DataGridViewRow row in grid.Rows)
                {
                    if(!string.Equals(Convert.ToString(row.Cells["Kart No"].Value),pair.Value,StringComparison.OrdinalIgnoreCase))continue;
                    row.Selected=true;grid.CurrentCell=row.Cells[0];break;
                }
            }
            lastUiFingerprint=fingerprint;lastRenderedDay=day.Date;
        }
        finally
        {
            foreach(var grid in grids.Values)grid.ResumeLayout(false);tabs.ResumeLayout(false);cards.ResumeLayout(false);ResumeLayout(false);
        }
    }

    void CaptureUnmatched(IEnumerable<(string Code,DateTime At,string Source)> punches,DateTime day)
    {
        var next=day.AddDays(1);
        var active=db.Query("select PKNO from KIMLIK where (IGTARIH is null or IGTARIH<@B) and (ICTARIH is null or ICTARIH>=@A)",new FbParameter("@A",day),new FbParameter("@B",next))
            .AsEnumerable().Select(r=>S(r,"PKNO")).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var punch in punches.Where(x=>x.At.Date==day&&!active.Contains(x.Code)))
            if(!unmatched.Any(x=>x.Code==punch.Code&&x.At==punch.At))unmatched.Add(punch);
    }

    DataTable UnmatchedTable()
    {
        var table=new DataTable();foreach(var name in new[]{"Kart No","Saat","Kaynak","Durum"})table.Columns.Add(name);
        foreach(var x in unmatched.OrderBy(x=>x.At))table.Rows.Add(x.Code,x.At.ToString("HH:mm:ss"),x.Source,"Personel kartı eşleşmiyor");
        return table;
    }

    static DataTable Table(IEnumerable<DailyRow> source)
    {
        var table=new DataTable();foreach(var name in new[]{"Kart No","Ad Soyad","Grup","Gün Planı","Giriş","Çıkış","Durum","Uyarı"})table.Columns.Add(name);
        foreach(var r in source)table.Rows.Add(r.Code,r.Name,r.Group,r.Plan,r.Entry,r.Exit,r.Status,r.Warning);
        return table;
    }

    static (DateTime? Entry,DateTime? Exit) Movement(IEnumerable<DataRow> rows)
    {
        var entries=rows.Where(r=>r["GTARIH"]!=DBNull.Value).Select(r=>At(r,"GTARIH","GSAAT","GDAKIKA")).Where(x=>x.HasValue).Select(x=>x!.Value).ToArray();
        var exits=rows.Where(r=>r["CTARIH"]!=DBNull.Value).Select(r=>At(r,"CTARIH","CSAAT","CDAKIKA")).Where(x=>x.HasValue).Select(x=>x!.Value).ToArray();
        return(entries.Length==0?null:entries.Min(),exits.Length==0?null:exits.Max());
    }

    static DateTime? At(DataRow r,string dateCol,string timeCol,string minuteCol)
    {
        if(r[dateCol]==DBNull.Value)return null;var d=Convert.ToDateTime(r[dateCol]).Date;
        if(r[minuteCol]!=DBNull.Value){var m=Convert.ToInt32(r[minuteCol]);if(m>=0&&m<1440)return d.AddMinutes(m);}
        return TimeSpan.TryParse(S(r,timeCol),out var t)?d+t:null;
    }

    static (int Minutes,string Text) LeaveInfo(IEnumerable<DataRow> rows)
    {
        var list=rows.ToArray();var minutes=list.Sum(r=>r["SUREDAKIKA"]==DBNull.Value?0:Convert.ToInt32(r["SUREDAKIKA"]));
        var text=string.Join(", ",list.Select(r=>S(r,"TIP")).Where(x=>x.Length>0).Distinct());
        return(minutes,text);
    }
    static Schedule ReadSchedule(DataRow r)=>new(S(r,"PLAN_AD").Length>0?S(r,"PLAN_AD"):S(r,"AD"),
        I0(r,"IGIRISS"),I0(r,"GGTOL"),I0(r,"DCIKISS"),I0(r,"ECTOL"),I0(r,"DEVAMSIZLIK"));

    static Schedule FallbackSchedule(string group,DateTime day,Dictionary<int,Schedule> map)
    {
        var administrative=group.ToUpper(new CultureInfo("tr-TR")).Contains("İDARİ");
        var code=administrative
            ? day.DayOfWeek==DayOfWeek.Saturday?8:day.DayOfWeek==DayOfWeek.Sunday?9:7
            : day.DayOfWeek==DayOfWeek.Saturday?2:day.DayOfWeek==DayOfWeek.Sunday?3:1;
        return map.GetValueOrDefault(code)??new Schedule("Tanımsız",510,515,1140,1110,day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday?0:450);
    }

    static string Status(DateTime day,Schedule s,bool expected,bool fullLeave,DateTime? entry,DateTime? exit)
    {
        if(fullLeave)return "İzinli";if(!expected)return entry.HasValue?"Plansız Kart":"Çalışma Yok";
        var now=DateTime.Now;var historical=day.Date<now.Date;var today=day.Date==now.Date;var minute=now.Hour*60+now.Minute;
        if(!entry.HasValue)return historical||(today&&minute>s.EntryTolerance)?"Kart Basmadı":"Bekleniyor";
        if(!exit.HasValue)return historical||(today&&minute>s.ExpectedExit+15)?"Çıkış Kartı Yok":"İçeride";
        return "Tamamlandı";
    }

    static string Warning(Schedule s,DateTime? entry,DateTime? exit,string status)
    {
        if(status is "İzinli" or "Çalışma Yok" or "Kart Basmadı" or "Çıkış Kartı Yok")return status;
        var list=new List<string>();
        if(entry.HasValue&&Minute(entry.Value)>s.EntryTolerance)list.Add($"Geç giriş +{Minute(entry.Value)-s.ExpectedEntry} dk");
        if(exit.HasValue&&Minute(exit.Value)<s.ExitTolerance)list.Add($"Erken çıkış {s.ExpectedExit-Minute(exit.Value)} dk");
        return string.Join(" / ",list);
    }
    static void PaintRows(DataGridView grid)
    {
        foreach(DataGridViewRow row in grid.Rows)
        {
            var status=Convert.ToString(row.Cells["Durum"].Value)??"";
            row.DefaultCellStyle.BackColor=status switch
            {
                "Kart Basmadı" or "Çıkış Kartı Yok"=>Color.MistyRose,
                "İzinli"=>Color.LemonChiffon,
                "İçeride"=>Color.Honeydew,
                "Tamamlandı"=>Color.White,
                _=>Color.WhiteSmoke
            };
        }
    }

    static int Minute(DateTime value)=>value.Hour*60+value.Minute;
    static string S(DataRow r,string c)=>r.Table.Columns.Contains(c)&&r[c]!=DBNull.Value?Convert.ToString(r[c])??"":"";
    static int I(DataRow r,string c)=>Convert.ToInt32(r[c]);
    static int I0(DataRow r,string c)=>r.Table.Columns.Contains(c)&&r[c]!=DBNull.Value?Convert.ToInt32(r[c]):0;

    sealed record Schedule(string Name,int ExpectedEntry,int EntryTolerance,int ExpectedExit,int ExitTolerance,int WorkMinutes);
    sealed record DailyRow(string Code,string Name,string Group,string Plan,string Entry,string Exit,string Status,string Warning,
        bool Expected,bool FullLeave,bool HasEntry,bool HasExit);
}
