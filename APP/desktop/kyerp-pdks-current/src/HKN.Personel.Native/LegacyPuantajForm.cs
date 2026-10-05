using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Reports;

namespace HKN.Personel.Native;

public sealed class LegacyPuantajForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly TabControl tabs=new(){Dock=DockStyle.Fill};
    readonly Dictionary<TabPage,FilterSet> filters=[];
    readonly ListBox people=new(){Dock=DockStyle.Fill,IntegralHeight=false};
    readonly ProgressBar progress1=new(){Dock=DockStyle.Fill};
    readonly ProgressBar progress2=new(){Dock=DockStyle.Fill};

    public LegacyPuantajForm(int initialTab = 0){Text="Günlük ve Aylık Puantaj İşlemleri";StartPosition=FormStartPosition.CenterScreen;Size=new Size(1180,720);MinimumSize=new Size(960,620);Font=new Font("Segoe UI",9f);BackColor=PdksAppearance.Current.Canvas;KeyPreview=true;Build();tabs.SelectedIndex=Math.Clamp(initialTab,0,tabs.TabPages.Count-1);Shown+=(_,_)=>BeginInvoke((Action)Init);KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};}
    static TextBox E()=>new();
    static DateTimePicker D()=>new(){Format=DateTimePickerFormat.Short};
    static ComboBox C()=>new(){DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Label L(string text)=>new(){Text=text,Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleLeft,ForeColor=PdksAppearance.Current.Muted};
    static void Row(TableLayoutPanel t,int r,string label,Control c){t.RowStyles.Add(new RowStyle(SizeType.Absolute,36));t.Controls.Add(L(label),0,r);c.Dock=DockStyle.Fill;c.Margin=new Padding(3,5,3,5);t.Controls.Add(c,1,r);}
    static Button B(string text,int width=145)=>new(){Text=text,Width=width,Height=36,MinimumSize=new Size(width,36),MaximumSize=new Size(width,36),FlatStyle=FlatStyle.Flat,Font=new Font("Segoe UI",9f,FontStyle.Bold)};

    void Build()
    {
        var p=PdksAppearance.Current;
        BackColor=p.Canvas;
        tabs.Padding=new Point(18,8);
        var daily=new TabPage("Günlük Puantaj"){Padding=new Padding(16),BackColor=p.Canvas};
        var monthly=new TabPage("Aylık Puantaj"){Padding=new Padding(16),BackColor=p.Canvas};
        tabs.TabPages.AddRange([daily,monthly]);
        Controls.Add(tabs);
        filters[daily]=BuildDaily(daily);
        filters[monthly]=BuildMonthly(monthly);
    }

    FilterSet BuildDaily(TabPage page)
    {
        var f=new FilterSet(E(),E(),D(),D(),C(),C(),C(),C(),C(),C());
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,ColumnCount=1,BackColor=page.BackColor};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,226));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));

        root.Controls.Add(FilterPanel(f,"Günlük puantaj filtresi","Kart hareketi, izin, tatil ve vardiya planlarından günlük puantaj oluşturur."),0,0);

        var listCard=Card();
        var listLayout=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Padding=new Padding(16),BackColor=PdksAppearance.Current.Surface};
        listLayout.RowStyles.Add(new RowStyle(SizeType.Absolute,36));
        listLayout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        listLayout.Controls.Add(new Label{Text="İşlenecek Personel",Dock=DockStyle.Fill,Font=new Font("Segoe UI",10.5f,FontStyle.Bold),ForeColor=PdksAppearance.Current.Text,TextAlign=ContentAlignment.MiddleLeft},0,0);
        people.BorderStyle=BorderStyle.None;
        people.BackColor=PdksAppearance.Current.Surface;
        people.ForeColor=PdksAppearance.Current.Text;
        people.Font=new Font("Segoe UI",9f);
        listLayout.Controls.Add(people,0,1);
        listCard.Controls.Add(listLayout);
        root.Controls.Add(listCard,0,1);

        var progressCard=new Panel{Dock=DockStyle.Fill,BackColor=page.BackColor,Padding=new Padding(0,12,0,4)};
        var progressTable=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,BackColor=page.BackColor};
        progressTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        progressTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,50));
        progress1.Height=14;progress2.Height=14;
        progressTable.Controls.Add(progress1,0,0);progressTable.Controls.Add(progress2,1,0);
        progressCard.Controls.Add(progressTable);
        root.Controls.Add(progressCard,0,2);

        var bar=ActionBar();
        var calc=ModernButton("Puantajı Hesapla",155,true);
        var result=ModernButton("Puantaj Sonuçları",155,false);
        calc.Click+=(_,_)=>Calculate(f);
        result.Click+=(_,_)=>ShowResults(f);
        bar.Controls.Add(calc);bar.Controls.Add(result);
        root.Controls.Add(bar,0,3);
        page.Controls.Add(root);
        Hook(f);
        return f;
    }

    FilterSet BuildMonthly(TabPage page)
    {
        var f=new FilterSet(E(),E(),D(),D(),C(),C(),C(),C(),C(),C());
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=4,ColumnCount=1,BackColor=page.BackColor};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,226));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,48));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,54));

        root.Controls.Add(FilterPanel(f,"Aylık puantaj filtresi","Seçilen dönem için personel bazında aylık puantajı toplu olarak hesaplar."),0,0);

        var info=Card();
        info.Padding=new Padding(22);
        info.Controls.Add(new Label{
            Text="Aylık puantaj hesaplaması; giriş / çıkış, izin, resmi tatil ve çalışma grubunu birlikte değerlendirir.\r\nKaynak kayıtları düzeltildikten sonra ayı yeniden hesaplamak güvenlidir.",
            Dock=DockStyle.Fill,Font=new Font("Segoe UI",10f),ForeColor=PdksAppearance.Current.Muted,TextAlign=ContentAlignment.MiddleLeft});
        root.Controls.Add(info,0,1);

        var barProgress=new ProgressBar{Dock=DockStyle.Fill,Margin=new Padding(0,14,0,8),Height=14};
        root.Controls.Add(barProgress,0,2);

        var actions=ActionBar();
        var calc=ModernButton("Ayı Hesapla",145,true);
        var result=ModernButton("Puantaj Sonuçları",155,false);
        calc.Click+=(_,_)=>Calculate(f,barProgress);
        result.Click+=(_,_)=>ShowResults(f);
        actions.Controls.Add(calc);actions.Controls.Add(result);
        root.Controls.Add(actions,0,3);
        page.Controls.Add(root);
        Hook(f);
        return f;
    }

    Control FilterPanel(FilterSet f,string title,string subtitle)
    {
        var card=Card();
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=3,Padding=new Padding(16),BackColor=PdksAppearance.Current.Surface};
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute,26));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.Controls.Add(new Label{Text=title,Dock=DockStyle.Fill,Font=new Font("Segoe UI",11f,FontStyle.Bold),ForeColor=PdksAppearance.Current.Text},0,0);
        root.Controls.Add(new Label{Text=subtitle,Dock=DockStyle.Fill,Font=new Font("Segoe UI",8.5f),ForeColor=PdksAppearance.Current.Muted},0,1);

        var fields=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=5,RowCount=2,Margin=new Padding(0,8,0,0)};
        for(var i=0;i<5;i++)fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,20));
        fields.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        fields.RowStyles.Add(new RowStyle(SizeType.Percent,50));
        var items=new (string Text,Control Control)[]
        {
            ("Kart Başlangıç",f.CardStart),("Kart Bitiş",f.CardEnd),("Başlangıç",f.Start),("Bitiş",f.End),("Grup",f.Group),
            ("Bölüm",f.Department),("Servis",f.Service),("Durum",f.Status),("Görev",f.Duty),("Firma",f.Company)
        };
        for(var i=0;i<items.Length;i++)
        {
            var holder=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,Margin=new Padding(0,0,12,0),BackColor=PdksAppearance.Current.Surface};
            holder.RowStyles.Add(new RowStyle(SizeType.Absolute,20));holder.RowStyles.Add(new RowStyle(SizeType.Percent,100));
            holder.Controls.Add(new Label{Text=items[i].Text,Dock=DockStyle.Fill,ForeColor=PdksAppearance.Current.Muted,Font=new Font("Segoe UI",8f,FontStyle.Bold),TextAlign=ContentAlignment.MiddleLeft},0,0);
            items[i].Control.Dock=DockStyle.Fill;items[i].Control.Margin=new Padding(0,2,0,0);
            holder.Controls.Add(items[i].Control,0,1);
            fields.Controls.Add(holder,i%5,i/5);
        }
        root.Controls.Add(fields,0,2);
        card.Controls.Add(root);
        return card;
    }

    static Panel Card()
    {
        var p=PdksUiKit.Card(0);
        p.Margin=new Padding(0,0,0,10);
        return p;
    }

    static FlowLayoutPanel ActionBar()=>PdksUiKit.ActionBar(true,PdksAppearance.Current.Canvas);

    static Button ModernButton(string text,int width,bool primary)
        => PdksUiKit.Button(text,width,primary?PdksActionRole.Primary:PdksActionRole.Secondary);

    void Init()
    {
        foreach(var f in filters.Values)
        {
            f.Start.Value=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);f.End.Value=DateTime.Today;
            LoadLookup(f.Group,"GRUP");LoadLookup(f.Department,"BOLUM");LoadLookup(f.Service,"SERVIS");LoadLookup(f.Status,"DURUM");LoadLookup(f.Duty,"GOREV");LoadLookup(f.Company,"FIRMA");
        }
        ReloadPeople(filters[tabs.TabPages[0]]);
    }

    void Hook(FilterSet f)
    {
        f.CardStart.TextChanged+=(_,_)=>ReloadPeople(f);f.CardEnd.TextChanged+=(_,_)=>ReloadPeople(f);
        foreach(var c in f.Combos)c.SelectedIndexChanged+=(_,_)=>ReloadPeople(f);
    }

    void LoadLookup(ComboBox c,string table)
    {
        var dt=db.Query($"select KOD,AD from {table} order by KOD");var r=dt.NewRow();r["KOD"]=-1;r["AD"]="Tümü";dt.Rows.InsertAt(r,0);dt.Columns.Add("TEXT",typeof(string),"AD");c.DataSource=dt;c.SelectedValue=-1;
    }

    (string Sql,List<FbParameter> Params) EmployeeFilter(FilterSet f)
    {
        var w=new List<string>{"(k.ICTARIH is null or k.ICTARIH>=@A)","(k.IGTARIH is null or k.IGTARIH<=@B)"};var p=new List<FbParameter>{new("@A",f.Start.Value.Date),new("@B",f.End.Value.Date)};
        if(!string.IsNullOrWhiteSpace(f.CardStart.Text)){w.Add("k.PKNO>=@KS");p.Add(new("@KS",f.CardStart.Text.Trim().PadLeft(5,'0')));}if(!string.IsNullOrWhiteSpace(f.CardEnd.Text)){w.Add("k.PKNO<=@KB");p.Add(new("@KB",f.CardEnd.Text.Trim().PadLeft(5,'0')));}
        Add(w,p,"k.GRUP",f.Group,"G");Add(w,p,"k.BOLUM",f.Department,"D");Add(w,p,"k.SERVIS",f.Service,"S");Add(w,p,"k.DURUM",f.Status,"U");Add(w,p,"k.GOREV",f.Duty,"R");Add(w,p,"k.SIRKET",f.Company,"F");return(string.Join(" and ",w),p);
    }
    static void Add(List<string>w,List<FbParameter>p,string field,ComboBox c,string key){if(c.SelectedValue is int v&&v>=0){w.Add($"{field}=@{key}");p.Add(new FbParameter("@"+key,v));}}

    void ReloadPeople(FilterSet f)
    {
        if(!IsHandleCreated)return;
        try
        {
            var q=EmployeeFilter(f);
            var dt=db.Query($"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.GRUP,coalesce(g.AD,'') GRUP_AD from KIMLIK k left join GRUP g on g.KOD=k.GRUP where {q.Sql} order by k.PKNO",q.Params.ToArray());
            var policies=AttendanceGroupPolicyStore.Load(db);
            people.BeginUpdate();people.Items.Clear();
            foreach(DataRow r in dt.Rows)
            {
                var groupCode=r["GRUP"]==DBNull.Value?-1:Convert.ToInt32(r["GRUP"]);
                var groupName=Convert.ToString(r["GRUP_AD"])?.Trim()??"";
                if(!AttendanceGroupPolicyStore.RequiresCardTracking(policies,groupCode,groupName))continue;
                people.Items.Add($"{r["PKNO"],-6} {r["AD"]} {r["SOYAD"]}");
            }
            people.EndUpdate();
        }
        catch{ }
    }

    void Calculate(FilterSet f,ProgressBar? bar=null)
    {
        var pb=bar??progress1;try
        {
            if(f.End.Value.Date<f.Start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            var kilit = PayrollPeriodLockService.FirstLocked(db, f.Start.Value.Date, f.End.Value.Date);
            if(kilit is not null){ MessageBox.Show($"{kilit.Month:00}.{kilit.Year} bordro dönemi kilitli. Puantaj hesaplama bu aya veri yazamaz.","Dönem Kilitli",MessageBoxButtons.OK,MessageBoxIcon.Warning); return; }
            var q=EmployeeFilter(f);
            var emp=db.Query($"select k.PKNO,k.BOLUM,k.GRUP,coalesce(g.AD,'') GRUP_AD from KIMLIK k left join GRUP g on g.KOD=k.GRUP where {q.Sql}",q.Params.ToArray());
            var policies=AttendanceGroupPolicyStore.Load(db);
            var employees=emp.AsEnumerable()
                .Where(r=>AttendanceGroupPolicyStore.RequiresCardTracking(policies,ReadInt(r,"GRUP")??-1,Convert.ToString(r["GRUP_AD"])??""))
                .Select(r=>new Employee(Convert.ToString(r["PKNO"])??"",ReadInt(r,"BOLUM"),ReadInt(r,"GRUP"))).ToArray();
            if(employees.Length==0){MessageBox.Show("Seçime uygun kart takipli personel bulunamadı. Kart takibi kapalı grupların mevcut puantajı değiştirilmez.",Text);return;}
            var auditMode=string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT"),"1",StringComparison.Ordinal);
            if(!auditMode && MessageBox.Show($"{f.Start.Value:dd.MM.yyyy} - {f.End.Value:dd.MM.yyyy} aralığındaki giriş-çıkış, izin, tatil ve grup planlarından puantaj oluşturulsun/güncellensin mi?\n\nKart takibi kapalı gruplar bu hesaplamaya alınmaz.",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            var allowed=employees.Select(x=>x.Code).ToHashSet();
            var a=f.Start.Value.Date;var b=f.End.Value.Date.AddDays(1);
            var gc=db.Query("select PKNO,GTARIH,GSAAT,CTARIH,CSAAT from GIRCIK where GTARIH>=@A and GTARIH<@B order by PKNO,GTARIH",new FbParameter("@A",a),new FbParameter("@B",b));
            var leave=db.Query("select PKNO,TARIH,SUREDAKIKA,TIP from OZELIZIN where TARIH>=@A and TARIH<@B",new FbParameter("@A",a),new FbParameter("@B",b));
            var holiday=db.Query("select PKNO,TARIH from PERPLANTAT where TARIH>=@A and TARIH<@B",new FbParameter("@A",a),new FbParameter("@B",b));
            var group=db.Query("select KOD,BASSAAT1,BITSAAT1,GDSAAT1,BASSAAT2,BITSAAT2,GDSAAT2,BASSAAT3,BITSAAT3,GDSAAT3,BASSAAT4,BITSAAT4,GDSAAT4,BASSAAT5,BITSAAT5,GDSAAT5 from GRUP");
            var movements=gc.AsEnumerable().Where(r=>allowed.Contains(Convert.ToString(r["PKNO"])??"")).GroupBy(r=>(Pk:Convert.ToString(r["PKNO"])??"",Day:Convert.ToDateTime(r["GTARIH"]).Date)).ToDictionary(g=>g.Key,g=>Movement(g));
            var leaves=leave.AsEnumerable().Where(r=>allowed.Contains(Convert.ToString(r["PKNO"])??"")).GroupBy(r=>(Pk:Convert.ToString(r["PKNO"])??"",Day:Convert.ToDateTime(r["TARIH"]).Date)).ToDictionary(g=>g.Key,g=>LeaveMinutes(g));
            var holidays=holiday.AsEnumerable().Where(r=>allowed.Contains(Convert.ToString(r["PKNO"])??"")).Select(r=>(Pk:Convert.ToString(r["PKNO"])??"",Day:Convert.ToDateTime(r["TARIH"]).Date)).ToHashSet();
            var schedules=group.AsEnumerable().ToDictionary(r=>Convert.ToInt32(r["KOD"]),BuildShifts);
            var dayCount=(f.End.Value.Date-a).Days+1;pb.Minimum=0;pb.Maximum=Math.Max(1,employees.Length*dayCount);pb.Value=0;
            var changed=db.InTransaction((con,tr)=>{var n=0;foreach(var employee in employees)for(var day=a;day<b;day=day.AddDays(1)){movements.TryGetValue((employee.Code,day),out var movement);leaves.TryGetValue((employee.Code,day),out var leaveTime);var shift=ChooseShift(schedules.GetValueOrDefault(employee.Group??-1),movement.Entry);var result=DailyAttendanceCalculator.Calculate(new(day,shift.Start,shift.End,shift.Work,movement.Entry,movement.Exit,leaveTime.Paid,leaveTime.Unpaid,holidays.Contains((employee.Code,day))));Upsert(con,tr,employee,day,result);n++;if(pb.Value<pb.Maximum)pb.Value++;}return n;});
            pb.Value=pb.Maximum;if(bar is null){progress2.Minimum=0;progress2.Maximum=1;progress2.Value=1;}if(!auditMode)MessageBox.Show($"Puantaj işlemi tamamlandı. {changed} personel-gün kaydı işlendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,Text,MessageBoxIcon.Warning,"Timesheet");}
    }

    static (DateTime? Entry,DateTime? Exit) Movement(IEnumerable<DataRow> rows)
    {
        var entries=rows.Select(r=>At(r,"GTARIH","GSAAT")).Where(x=>x.HasValue).Select(x=>x!.Value).ToArray();
        var exits=rows.Select(r=>At(r,r["CTARIH"]==DBNull.Value?"GTARIH":"CTARIH","CSAAT")).Where(x=>x.HasValue).Select(x=>x!.Value).ToArray();
        return(entries.Length==0?null:entries.Min(),entries.Length==0||exits.Length==0?null:exits.Max());
    }

    static DateTime? At(DataRow row,string dateColumn,string timeColumn)
    {
        if(row[dateColumn]==DBNull.Value||row[timeColumn]==DBNull.Value)return null;var text=Convert.ToString(row[timeColumn])?.Trim();if(string.IsNullOrEmpty(text))return null;
        if(!TimeSpan.TryParseExact(text,["h\\:mm","hh\\:mm"],CultureInfo.InvariantCulture,out var time))return null;return Convert.ToDateTime(row[dateColumn]).Date+time;
    }

    static (int Paid,int Unpaid) LeaveMinutes(IEnumerable<DataRow> rows)
    {
        var paid=0;var unpaid=0;foreach(var row in rows){var minutes=ReadInt(row,"SUREDAKIKA")??0;var type=(Convert.ToString(row["TIP"])??"").ToUpper(new CultureInfo("tr-TR"));if(type.Contains("ÜCRETSİZ"))unpaid+=minutes;else paid+=minutes;}return(paid,unpaid);
    }

    static Shift[] BuildShifts(DataRow row)=>Enumerable.Range(1,5).Select(index=>{var start=ReadInt(row,$"BASSAAT{index}")??0;var end=ReadInt(row,$"BITSAAT{index}")??0;var work=ReadInt(row,$"GDSAAT{index}")??0;if(work==0&&end!=start)work=(end-start+1440)%1440;return new Shift(start,end,work);}).Where(x=>x.Work>0).ToArray();

    static Shift ChooseShift(Shift[]? shifts,DateTime? entry)
    {
        if(shifts is null||shifts.Length==0)return new(0,0,0);if(entry is null)return shifts[0];var minute=entry.Value.Hour*60+entry.Value.Minute;return shifts.MinBy(s=>Math.Min(Math.Abs(s.Start-minute),1440-Math.Abs(s.Start-minute)))!;
    }

    static int? ReadInt(DataRow row,string column)=>row[column]==DBNull.Value?null:Convert.ToInt32(row[column]);

    static void Upsert(FbConnection con,FbTransaction tr,Employee employee,DateTime day,DailyAttendanceResult result)
    {
        using var chk=FirebirdDatabase.CreateCommand(con,tr,"select count(*) from PUANTAJ where PKNO=@P and TARIH>=@T and TARIH<@N",new FbParameter("@P",employee.Code),new FbParameter("@T",day),new FbParameter("@N",day.AddDays(1)));var exists=Convert.ToInt32(chk.ExecuteScalar()??0)>0;
        const string values="GIRIS=@GI,CIKIS=@CI,STATUS=@ST,BOLUM=@B,SSKD=@SSK,SAAT1=@S1,DAKIKA1=@D1,GUN1=@G1,SAAT2=@S2,DAKIKA2=@D2,GUN2=@G2,SAAT3=@S3,DAKIKA3=@D3,GUN3=@G3,SAAT4=@S4,DAKIKA4=@D4,GUN4=@G4,DEVAMSIZLIKS=@DS,DEVAMSIZLIKD=@DD,DEVAMSIZLIKG=@DG,GECS=@GS,GECD=@GD,GECG=@GG,ERKENS=@ES,ERKEND=@ED,ERKENG=@EG,EKSIKS=@XS,EKSIKD=@XD,EKSIKG=@XG,DEVCEZAS='00:00',DEVCEZAD=0,GECCEZAS='00:00',GECCEZAD=0,ERCEZAS='00:00',ERCEZAD=0,EKCEZAS='00:00',EKCEZAD=0";
        const string columns="PKNO,TARIH,GIRIS,CIKIS,STATUS,BOLUM,SSKD,SAAT1,DAKIKA1,GUN1,SAAT2,DAKIKA2,GUN2,SAAT3,DAKIKA3,GUN3,SAAT4,DAKIKA4,GUN4,DEVAMSIZLIKS,DEVAMSIZLIKD,DEVAMSIZLIKG,GECS,GECD,GECG,ERKENS,ERKEND,ERKENG,EKSIKS,EKSIKD,EKSIKG,DEVCEZAS,DEVCEZAD,GECCEZAS,GECCEZAD,ERCEZAS,ERCEZAD,EKCEZAS,EKCEZAD";
        const string insertValues="@P,@T,@GI,@CI,@ST,@B,@SSK,@S1,@D1,@G1,@S2,@D2,@G2,@S3,@D3,@G3,@S4,@D4,@G4,@DS,@DD,@DG,@GS,@GD,@GG,@ES,@ED,@EG,@XS,@XD,@XG,'00:00',0,'00:00',0,'00:00',0,'00:00',0";
        var sql=exists?$"update PUANTAJ set {values} where PKNO=@P and TARIH>=@T and TARIH<@N":$"insert into PUANTAJ ({columns}) values ({insertValues})";
        var parameters=new[]{new FbParameter("@P",employee.Code),new FbParameter("@T",day),new FbParameter("@N",day.AddDays(1)),new FbParameter("@GI",result.Entry),new FbParameter("@CI",result.Exit),new FbParameter("@ST",result.Status),new FbParameter("@B",employee.Department??(object)DBNull.Value),new FbParameter("@SSK",result.NormalDay),new FbParameter("@S1",DailyAttendanceResult.AsTime(result.NormalMinutes)),new FbParameter("@D1",result.NormalMinutes),new FbParameter("@G1",result.NormalDay),new FbParameter("@S2",DailyAttendanceResult.AsTime(result.Overtime50Minutes)),new FbParameter("@D2",result.Overtime50Minutes),new FbParameter("@G2",result.Overtime50Day),new FbParameter("@S3",DailyAttendanceResult.AsTime(result.Overtime100Minutes)),new FbParameter("@D3",result.Overtime100Minutes),new FbParameter("@G3",result.Overtime100Day),new FbParameter("@S4",DailyAttendanceResult.AsTime(result.UnpaidLeaveMinutes)),new FbParameter("@D4",result.UnpaidLeaveMinutes),new FbParameter("@G4",result.UnpaidLeaveDay),new FbParameter("@DS",DailyAttendanceResult.AsTime(result.AbsenceMinutes)),new FbParameter("@DD",result.AbsenceMinutes),new FbParameter("@DG",result.AbsenceDay),new FbParameter("@GS",DailyAttendanceResult.AsTime(result.LateMinutes)),new FbParameter("@GD",result.LateMinutes),new FbParameter("@GG",result.LateDay),new FbParameter("@ES",DailyAttendanceResult.AsTime(result.EarlyExitMinutes)),new FbParameter("@ED",result.EarlyExitMinutes),new FbParameter("@EG",result.EarlyExitDay),new FbParameter("@XS",DailyAttendanceResult.AsTime(result.ShortfallMinutes)),new FbParameter("@XD",result.ShortfallMinutes),new FbParameter("@XG",result.ShortfallDay)};
        using var command=FirebirdDatabase.CreateCommand(con,tr,sql,parameters);command.ExecuteNonQuery();
    }

    void ShowResults(FilterSet f)
    {
        try
        {
            var dt=db.Query("select p.PKNO,k.AD,k.SOYAD,p.TARIH,p.GIRIS,p.CIKIS,p.STATUS,p.DEVAMSIZLIKG,p.GECG,p.ERKENG,p.EKSIKG from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO where p.TARIH>=@A and p.TARIH<@B order by p.TARIH,p.PKNO",new FbParameter("@A",f.Start.Value.Date),new FbParameter("@B",f.End.Value.Date.AddDays(1)));
            var report=new ReportTable($"Puantaj Sonuçları • {f.Start.Value:dd.MM.yyyy} - {f.End.Value:dd.MM.yyyy}",dt.Columns.Cast<DataColumn>().Select(c=>c.ColumnName).ToArray(),dt.Rows.Cast<DataRow>().Select(r=>(IReadOnlyList<string>)dt.Columns.Cast<DataColumn>().Select(c=>Convert.ToString(r[c])??string.Empty).ToArray()).ToArray());
            ReportPrintHelper.Preview(this,report,true);
        }
        catch(Exception ex){PdksErrorPresenter.Show(this,ex,"Puantaj Sonuçları",MessageBoxIcon.Warning,"Timesheet.Results");}
    }
    sealed record FilterSet(TextBox CardStart,TextBox CardEnd,DateTimePicker Start,DateTimePicker End,ComboBox Group,ComboBox Department,ComboBox Service,ComboBox Status,ComboBox Duty,ComboBox Company)
    { public IEnumerable<ComboBox> Combos=>[Group,Department,Service,Status,Duty,Company]; }
    sealed record Employee(string Code,int? Department,int? Group);
    sealed record Shift(int Start,int End,int Work);
}
