using System.Data;
using System.Globalization;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;

namespace HKN.Personel.Native;

public sealed class LegacyPuantajForm : Form
{
    readonly FirebirdDatabase db=new(PdksOptions.FromEnvironment());
    readonly TabControl tabs=new(){Dock=DockStyle.Fill};
    readonly Dictionary<TabPage,FilterSet> filters=[];
    readonly ListBox people=new(){Location=new Point(312,0),Size=new Size(297,321),IntegralHeight=false};
    readonly ProgressBar progress1=new(){Location=new Point(16,328),Size=new Size(630,25)};
    readonly ProgressBar progress2=new(){Location=new Point(16,356),Size=new Size(630,25)};

    public LegacyPuantajForm()
    {
        Text="Günlük ve Aylık Puantaj İşlemleri";StartPosition=FormStartPosition.CenterScreen;Size=new Size(689,504);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;MinimizeBox=false;ShowInTaskbar=false;Font=new Font("Microsoft Sans Serif",8.25f);KeyPreview=true;
        Build();Shown+=(_,_)=>Init();KeyPress+=(_,e)=>{if(e.KeyChar==(char)Keys.Escape)Close();};
    }

    static Label L(string s,int x,int y)=>new(){Text=s,Location=new Point(x,y),AutoSize=true};
    static TextBox E(int x,int y,int w=40)=>new(){Location=new Point(x,y),Size=new Size(w,21)};
    static DateTimePicker D(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),Format=DateTimePickerFormat.Custom,CustomFormat="dd MMM yyyy"};
    static ComboBox C(int x,int y,int w)=>new(){Location=new Point(x,y),Size=new Size(w,21),DropDownStyle=ComboBoxStyle.DropDownList,DisplayMember="TEXT",ValueMember="KOD"};
    static Button B(string t,int x,int y,int w,int h=41)=>new(){Text=t,Location=new Point(x,y),Size=new Size(w,h),ForeColor=Color.Navy,Font=new Font("Microsoft Sans Serif",8.25f,FontStyle.Bold)};

    void Build()
    {
        var daily=new TabPage("Günlük Puantaj");var monthly=new TabPage("Aylık Puantaj");tabs.TabPages.AddRange([daily,monthly]);Controls.Add(tabs);
        filters[daily]=BuildDaily(daily);filters[monthly]=BuildMonthly(monthly);
    }

    FilterSet BuildDaily(TabPage p)
    {
        var f=new FilterSet(E(128,16),E(128,40),D(128,64,177),D(128,88,177),C(80,115,224),C(80,139,224),C(80,163,224),C(80,187,224),C(80,211,224),C(80,235,224));
        p.Controls.AddRange([L("Kart No Başlangıç",40,24),L("Kart No Bitiş",40,48),L("Başlangıç Tarihi",40,72),L("Bitiş Tarihi",40,96),L("Grup",40,123),L("Bölüm",40,147),L("Servis",40,171),L("Durum",40,195),L("Görev",40,219),L("Firma",40,243),f.CardStart,f.CardEnd,f.Start,f.End,f.Group,f.Department,f.Service,f.Status,f.Duty,f.Company,people,progress1,progress2]);
        var calc=B("&Hesapla",96,384,153);var result=B("&Puantaj Sonuçları",408,384,153);calc.Click+=(_,_)=>Calculate(f);result.Click+=(_,_)=>ShowResults(f);p.Controls.AddRange([calc,result]);Hook(f);return f;
    }

    FilterSet BuildMonthly(TabPage p)
    {
        var f=new FilterSet(E(320,32),E(320,56),D(320,80,175),D(320,104,175),C(320,131,200),C(320,155,200),C(320,179,200),C(320,203,200),C(320,227,200),C(320,251,200));
        p.Controls.AddRange([L("Kart No Başlangıç",200,40),L("Kart No Bitiş",200,64),L("Başlangıç Tarihi",200,88),L("Bitiş Tarihi",200,112),L("Grup",200,139),L("Bölüm",200,163),L("Servis",200,187),L("Durum",200,211),L("Görev",200,235),L("Firma",200,259),f.CardStart,f.CardEnd,f.Start,f.End,f.Group,f.Department,f.Service,f.Status,f.Duty,f.Company]);
        var bar=new ProgressBar{Location=new Point(16,324),Size=new Size(630,25)};var calc=B("&Hesapla",240,376,217);calc.Click+=(_,_)=>Calculate(f,bar);p.Controls.AddRange([bar,calc]);Hook(f);return f;
    }

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
        if(!IsHandleCreated)return;try{var q=EmployeeFilter(f);var dt=db.Query($"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH from KIMLIK k where {q.Sql} order by k.PKNO",q.Params.ToArray());people.BeginUpdate();people.Items.Clear();foreach(DataRow r in dt.Rows)people.Items.Add($"{r["PKNO"],-6} {r["AD"]} {r["SOYAD"]}");people.EndUpdate();}catch{ }
    }

    void Calculate(FilterSet f,ProgressBar? bar=null)
    {
        var pb=bar??progress1;try
        {
            if(f.End.Value.Date<f.Start.Value.Date)throw new InvalidOperationException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
            var q=EmployeeFilter(f);var emp=db.Query($"select k.PKNO,k.BOLUM,k.GRUP from KIMLIK k where {q.Sql}",q.Params.ToArray());if(emp.Rows.Count==0){MessageBox.Show("Seçime uygun personel bulunamadı.",Text);return;}
            if(MessageBox.Show($"{f.Start.Value:dd.MM.yyyy} - {f.End.Value:dd.MM.yyyy} aralığındaki giriş-çıkış, izin, tatil ve grup planlarından puantaj oluşturulsun/güncellensin mi?",Text,MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            var employees=emp.AsEnumerable().Select(r=>new Employee(Convert.ToString(r["PKNO"])??"",ReadInt(r,"BOLUM"),ReadInt(r,"GRUP"))).ToArray();var allowed=employees.Select(x=>x.Code).ToHashSet();
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
            pb.Value=pb.Maximum;if(bar is null){progress2.Minimum=0;progress2.Maximum=1;progress2.Value=1;}MessageBox.Show($"Puantaj işlemi tamamlandı. {changed} personel-gün kaydı işlendi.",Text,MessageBoxButtons.OK,MessageBoxIcon.Information);
        }
        catch(Exception ex){MessageBox.Show(ex.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Warning);}
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
        try{var dt=db.Query("select p.PKNO,k.AD,k.SOYAD,p.TARIH,p.GIRIS,p.CIKIS,p.STATUS,p.DEVAMSIZLIKG,p.GECG,p.ERKENG,p.EKSIKG from PUANTAJ p left join KIMLIK k on k.PKNO=p.PKNO where p.TARIH>=@A and p.TARIH<@B order by p.TARIH,p.PKNO",new FbParameter("@A",f.Start.Value.Date),new FbParameter("@B",f.End.Value.Date.AddDays(1)));using var d=new Form{Text="Puantaj Sonuçları",StartPosition=FormStartPosition.CenterParent,ClientSize=new Size(900,520)};var g=new DataGridView{Dock=DockStyle.Fill,DataSource=dt,ReadOnly=true,AutoSizeColumnsMode=DataGridViewAutoSizeColumnsMode.DisplayedCells,AllowUserToAddRows=false};d.Controls.Add(g);d.ShowDialog(this);}catch(Exception ex){MessageBox.Show(ex.Message,"Puantaj Sonuçları",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
    }

    sealed record FilterSet(TextBox CardStart,TextBox CardEnd,DateTimePicker Start,DateTimePicker End,ComboBox Group,ComboBox Department,ComboBox Service,ComboBox Status,ComboBox Duty,ComboBox Company)
    { public IEnumerable<ComboBox> Combos=>[Group,Department,Service,Status,Duty,Company]; }
    sealed record Employee(string Code,int? Department,int? Group);
    sealed record Shift(int Start,int End,int Work);
}
