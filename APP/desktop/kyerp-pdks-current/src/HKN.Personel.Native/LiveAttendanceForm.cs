using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

public sealed class LiveAttendanceForm : Form
{
    readonly FirebirdDatabase db = new(PdksOptions.FromEnvironment());
    readonly DateTimePicker date = new(){Format=DateTimePickerFormat.Custom,CustomFormat="dd MMMM yyyy dddd",Width=225};
    readonly CheckBox live = new(){Text="Canlı cihaz takibi",Checked=true,AutoSize=true,Padding=new Padding(8,6,0,0)};
    readonly Label device = new(){AutoSize=false,Width=430,Height=28,TextAlign=ContentAlignment.MiddleLeft};
    readonly Button refresh = new(){Text="Şimdi Yenile",Width=105,Height=30};
    readonly FlowLayoutPanel cards = new(){Dock=DockStyle.Fill,WrapContents=false,Padding=new Padding(2)};
    readonly TabControl tabs = new(){Dock=DockStyle.Fill};
    readonly Dictionary<string,DataGridView> grids = new();
    readonly System.Windows.Forms.Timer timer = new(){Interval=5000};
    readonly CancellationTokenSource closing = new();
    bool busy;

    public LiveAttendanceForm()
    {
        Text="Canlı Personel Denetim";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1180,720);
        MinimumSize=new Size(1000,620);Font=new Font("Microsoft Sans Serif",9f);Build();
        Shown+=async (_,_)=>await SyncAndLoadAsync();refresh.Click+=async (_,_)=>await SyncAndLoadAsync();
        date.ValueChanged+=async (_,_)=>await SyncAndLoadAsync(false);timer.Tick+=async (_,_)=>await SyncAndLoadAsync();
        FormClosed+=(_,_)=>{timer.Stop();closing.Cancel();};timer.Start();
    }
    void Build()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(8)};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,46));root.RowStyles.Add(new RowStyle(SizeType.Absolute,78));root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        var top=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false};
        top.Controls.Add(new Label{Text="Denetim Tarihi",AutoSize=true,Padding=new Padding(0,8,5,0)});
        top.Controls.Add(date);top.Controls.Add(live);top.Controls.Add(refresh);top.Controls.Add(device);root.Controls.Add(top,0,0);
        root.Controls.Add(cards,0,1);
        AddTab("Genel");AddTab("Kart Basmayan");AddTab("İçeride / Çıkış Bekleyen");AddTab("İzinli");AddTab("Tamamlanan");
        root.Controls.Add(tabs,0,2);Controls.Add(root);
    }

    void AddTab(string title)
    {
        var grid=new DataGridView{Dock=DockStyle.Fill,ReadOnly=true,AllowUserToAddRows=false,AllowUserToDeleteRows=false,
            AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.Fill,SelectionMode=DataGridViewSelectionMode.FullRowSelect,
            MultiSelect=false,BackgroundColor=Color.White,RowHeadersVisible=false};
        grid.DataBindingComplete+=(_,_)=>PaintRows(grid);
        var page=new TabPage(title);page.Controls.Add(grid);tabs.TabPages.Add(page);grids[title]=grid;
    }

    Label Card(string title,int value,Color back)
    {
        var label=new Label{Width=145,Height=62,Margin=new Padding(4),BorderStyle=BorderStyle.FixedSingle,
            TextAlign=ContentAlignment.MiddleCenter,Font=new Font(Font.FontFamily,10f,FontStyle.Bold),
            BackColor=back,Text=$"{title}\n{value}"};
        cards.Controls.Add(label);return label;
    }
    async Task SyncAndLoadAsync(bool syncDevice=true)
    {
        if(busy||IsDisposed)return;busy=true;refresh.Enabled=false;
        try
        {
            TerminalDeviceSnapshot? snapshot=null;
            if(syncDevice&&live.Checked&&date.Value.Date==DateTime.Today)
            {
                snapshot=await TerminalDeviceClient.ReadAsync(true,closing.Token);
                if(snapshot.Connected&&snapshot.Punches.Count>0)
                {
                    var records=snapshot.Punches.Select(ToRecord).ToArray();
                    _=new AttendanceImportService(db).Import(records,5);
                }
            }
            if(snapshot is not null)ShowDevice(snapshot);
            LoadDay(date.Value.Date);
        }
        catch(OperationCanceledException){ }
        catch(Exception ex){device.Text="Denetim hatası: "+ex.Message;device.ForeColor=Color.DarkRed;}
        finally{busy=false;if(!IsDisposed)refresh.Enabled=true;}
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
        device.Text=$"Kart cihazı: BAĞLI   Cihaz saati {s.DeviceTime:HH:mm:ss}   Yeni kayıt {Math.Max(0,s.NewLogCount)}   Kart {Math.Max(0,s.CardCount)}";
        device.ForeColor=Color.DarkGreen;
    }
    void LoadDay(DateTime day)
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
        Bind(rows);
    }

    void Bind(List<DailyRow> rows)
    {
        grids["Genel"].DataSource=Table(rows);
        grids["Kart Basmayan"].DataSource=Table(rows.Where(r=>r.Status=="Kart Basmadı"));
        grids["İçeride / Çıkış Bekleyen"].DataSource=Table(rows.Where(r=>r.Status is "İçeride" or "Çıkış Kartı Yok"));
        grids["İzinli"].DataSource=Table(rows.Where(r=>r.FullLeave));
        grids["Tamamlanan"].DataSource=Table(rows.Where(r=>r.HasEntry&&r.HasExit));
        cards.Controls.Clear();
        Card("Beklenen",rows.Count(r=>r.Expected),Color.AliceBlue);Card("Gelen",rows.Count(r=>r.Expected&&r.HasEntry),Color.Honeydew);
        Card("Kart Basmayan",rows.Count(r=>r.Status=="Kart Basmadı"),Color.MistyRose);Card("İzinli",rows.Count(r=>r.FullLeave),Color.LemonChiffon);
        Card("İçeride",rows.Count(r=>r.Status=="İçeride"),Color.Honeydew);Card("Çıkış Eksik",rows.Count(r=>r.Status=="Çıkış Kartı Yok"),Color.MistyRose);
        Card("Tamamlanan",rows.Count(r=>r.HasEntry&&r.HasExit),Color.WhiteSmoke);
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
