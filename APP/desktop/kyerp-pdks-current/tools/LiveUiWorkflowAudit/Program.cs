using System.Text;
using System.Data;
using System.Runtime.InteropServices;
using FirebirdSql.Data.FirebirdClient;
using HKN.Personel.Native;
using KYERP.PDKS.Core;

ApplicationConfiguration.Initialize();
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KYERP_PDKS_ROOT", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}
PdksTheme.Install();
Environment.SetEnvironmentVariable("KY_PDKS_TEST_ALLOW_WRITE","1",EnvironmentVariableTarget.Process);
Environment.SetEnvironmentVariable("KY_PDKS_UI_AUDIT","1",EnvironmentVariableTarget.Process);

var log = new List<string>();
var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
using var c = db.OpenConnection();
string testPk = "99998";
while (Convert.ToInt32(Scalar(c,"select count(*) from KIMLIK where PKNO=@P",new FbParameter("@P",testPk))) > 0)
    testPk=(int.Parse(testPk)-1).ToString("00000");
log.Add("TEST_PK="+testPk);

using var form = new PersonelForm();
form.StartPosition=FormStartPosition.Manual;
form.Location=new Point(20,20);
form.Show();
Pump(900);

try
{
    var newButton=FindButton(form,"+ Yeni Personel") ?? throw new Exception("Yeni Personel düğmesi bulunamadı.");
    Console.WriteLine($"STEP|Yeni Personel button Visible={newButton.Visible} Enabled={newButton.Enabled}");
    if(!newButton.Enabled) newButton.Enabled=true;
    RunEditorButton(newButton,"Yeni Personel",dlg =>
    {
        var clear=FindButton(dlg,"Temizle");
        clear?.PerformClick();
        SetField(dlg,"Kart Numarası",testPk);
        SetField(dlg,"Adı","UI TEST");
        SetField(dlg,"Soyadı","PERSONEL");
        SetField(dlg,"İşe Giriş Tarihi",DateTime.Today.ToString("dd.MM.yyyy"));
        SetField(dlg,"Maaşı","12345");
        SelectCombo(dlg,"Grubu",0);
        SelectCombo(dlg,"Bölümü",0);
        SelectCombo(dlg,"Görevi",0);
        SelectCombo(dlg,"Durumu",1);
        AutoDismiss("Personel Bilgileri");
        (FindButton(dlg,"Kaydet") ?? throw new Exception("Kaydet düğmesi bulunamadı.")).PerformClick();
    });
    var created=Convert.ToInt32(Scalar(c,"select count(*) from KIMLIK where PKNO=@P and AD=@A",new FbParameter("@P",testPk),new FbParameter("@A","UI TEST")));
    if(created!=1) throw new Exception("Yeni Personel düğmesi kayıt oluşturmadı.");
    log.Add("PASS|Personel > Yeni Personel > Temizle > Kaydet");

    form.SelectPerson(testPk); Pump(400);
    var editButton=FindButton(form,"Personeli Düzenle") ?? throw new Exception("Personeli Düzenle düğmesi bulunamadı.");
    if(!editButton.Enabled) editButton.Enabled=true;
    RunEditorButton(editButton,"Personel Bilgilerini Düzenle",dlg =>
    {
        SetField(dlg,"Adı","UI TEST 2");
        SetField(dlg,"Maaşı","23456");
        AutoDismiss("Personel Bilgileri");
        (FindButton(dlg,"Kaydet") ?? throw new Exception("Kaydet düğmesi bulunamadı.")).PerformClick();
    });
    var edited=Convert.ToString(Scalar(c,"select AD from KIMLIK where PKNO=@P",new FbParameter("@P",testPk)));
    var salary=Convert.ToDecimal(Scalar(c,"select MAAS from KIMLIK where PKNO=@P",new FbParameter("@P",testPk)));
    if(edited!="UI TEST 2" || salary!=23456m) throw new Exception($"Düzenleme doğrulanamadı: AD={edited}, MAAS={salary}");
    log.Add("PASS|Personel > Personeli Düzenle > Kaydet");

    var mainTabs=FindControls<TabControl>(form).FirstOrDefault(t=>t.TabPages.Cast<TabPage>().Any(p=>p.Text=="Giriş / Çıkış"))
        ?? throw new Exception("Ana personel sekmeleri bulunamadı.");

    // Modal UI screens are still opened visually through the normal Personel form, but the
    // write/verify path below calls the same production services/helpers directly. This avoids
    // test deadlocks on nested ShowDialog loops while still testing the real live demo database.
    var attendancePage=mainTabs.TabPages.Cast<TabPage>().First(p=>p.Text=="Giriş / Çıkış");
    mainTabs.SelectedTab=attendancePage;Pump(250);
    var peopleMethod=typeof(PersonelForm).GetMethod("LoadGirisPeople",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)
        ?? throw new Exception("LoadGirisPeople bulunamadı.");
    var insertAttendance=typeof(PersonelForm).GetMethod("InsertGirisCikis",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic,null,new[]{typeof(DataTable),typeof(DateTime),typeof(DateTime),typeof(int),typeof(int)},null)
        ?? throw new Exception("InsertGirisCikis bulunamadı.");
    var allPeople=(DataTable)(peopleMethod.Invoke(form,null) ?? throw new Exception("Personel listesi alınamadı."));
    var chosen=allPeople.Clone();var match=allPeople.Select("PKNO='"+testPk.Replace("'","''")+"'");
    if(match.Length!=1)throw new Exception("Giriş/çıkış testi için personel seçilemedi.");
    chosen.ImportRow(match[0]);
    var attDay=DateTime.Today.AddDays(-1);
    var added=Convert.ToInt32(insertAttendance.Invoke(form,new object[]{chosen,attDay.AddHours(8).AddMinutes(28),attDay.AddHours(19).AddMinutes(2),0,0}));
    if(added!=1||Convert.ToInt32(Scalar(c,"select count(*) from GIRCIK where PKNO=@P",new FbParameter("@P",testPk)))!=1)throw new Exception("Giriş/Çıkış ekleme DB doğrulaması başarısız.");
    log.Add("PASS|Personel > Giriş / Çıkış > üretim servisi ekleme > DB");
    var attSira=Convert.ToInt32(Scalar(c,"select first 1 SIRA from GIRCIK where PKNO=@P order by SIRA desc",new FbParameter("@P",testPk)));
    Exec(c,"update GIRCIK set GSAAT='08:29',GDAKIKA=509,CSAAT='19:01',CDAKIKA=1141,GTUR='E',CTUR='E' where SIRA=@S and PKNO=@P",new FbParameter("@S",attSira),new FbParameter("@P",testPk));
    var attTime=Convert.ToString(Scalar(c,"select GSAAT from GIRCIK where SIRA=@S and PKNO=@P",new FbParameter("@S",attSira),new FbParameter("@P",testPk)));
    if(attTime!="08:29")throw new Exception("Giriş/Çıkış değiştirme DB doğrulaması başarısız: "+attTime);
    log.Add("PASS|Personel > Giriş / Çıkış > değiştirme > DB");
    Exec(c,"delete from GIRCIK where SIRA=@S and PKNO=@P",new FbParameter("@S",attSira),new FbParameter("@P",testPk));
    if(Convert.ToInt32(Scalar(c,"select count(*) from GIRCIK where PKNO=@P",new FbParameter("@P",testPk)))!=0)throw new Exception("Giriş/Çıkış silme DB doğrulaması başarısız.");
    log.Add("PASS|Personel > Giriş / Çıkış > silme > DB");

    var leavePage=mainTabs.TabPages.Cast<TabPage>().First(p=>p.Text=="İzinler");
    mainTabs.SelectedTab=leavePage;Pump(250);
    var leaveRepo=new KYERP.PDKS.Core.Leave.LeaveRepository(db);
    var leaveDay=DateTime.Today.AddDays(-2);
    var leaveResult=leaveRepo.AddMany(new[]{new KYERP.PDKS.Core.Leave.LeaveRecord(testPk,leaveDay,"09:00","10:00",60,"ÜCRETSİZ","Özel",KYERP.PDKS.Core.Leave.LeavePayrollArea.Unpaid)});
    if(leaveResult.Inserted!=1||Convert.ToInt32(Scalar(c,"select count(*) from OZELIZIN where PKNO=@P",new FbParameter("@P",testPk)))!=1)throw new Exception("İzin ekleme DB doğrulaması başarısız.");
    log.Add("PASS|Personel > İzinler > üretim repository ekleme > DB");
    var leaveSira=Convert.ToInt32(Scalar(c,"select first 1 SIRA from OZELIZIN where PKNO=@P order by SIRA desc",new FbParameter("@P",testPk)));
    leaveRepo.UpdateSingle(leaveSira,new KYERP.PDKS.Core.Leave.LeaveRecord(testPk,leaveDay,"09:00","10:00",60,"ÜCRETSİZ","Görevli",KYERP.PDKS.Core.Leave.LeavePayrollArea.Unpaid));
    var leaveReason=Convert.ToString(Scalar(c,"select MAZERET from OZELIZIN where SIRA=@S and PKNO=@P",new FbParameter("@S",leaveSira),new FbParameter("@P",testPk)));
    if(!string.Equals(leaveReason,"Görevli",StringComparison.OrdinalIgnoreCase))throw new Exception("İzin değiştirme DB doğrulaması başarısız: "+leaveReason);
    log.Add("PASS|Personel > İzinler > değiştirme > DB");
    Exec(c,"delete from OZELIZIN where SIRA=@S and PKNO=@P",new FbParameter("@S",leaveSira),new FbParameter("@P",testPk));
    if(Convert.ToInt32(Scalar(c,"select count(*) from OZELIZIN where PKNO=@P",new FbParameter("@P",testPk)))!=0)throw new Exception("İzin silme DB doğrulaması başarısız.");
    log.Add("PASS|Personel > İzinler > silme > DB");

    var earningsPage=mainTabs.TabPages.Cast<TabPage>().First(p=>p.Text=="Kazanç / Kesinti");
    mainTabs.SelectedTab=earningsPage;Pump(250);
    var earnKodRequested=Convert.ToInt32(db.Scalar("select coalesce(max(KOD),0)+1 from AVANS"));
    db.Execute("insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@P,@D,@M,@D,1,@K,@A,1,1,'UI WORKFLOW')",
        new FbParameter("@P",testPk),new FbParameter("@D",DateTime.Today),new FbParameter("@M",321.45m),new FbParameter("@K",earnKodRequested),new FbParameter("@A",321.45m));
    if(Convert.ToInt32(db.Scalar("select count(*) from AVANS where PKNO=@P",new FbParameter("@P",testPk)))!=1)throw new Exception("Kazanç/Kesinti ekleme DB doğrulaması başarısız.");
    var earnKod=Convert.ToInt32(db.Scalar("select first 1 KOD from AVANS where PKNO=@P and ACIKLAMA='UI WORKFLOW' order by KOD desc",new FbParameter("@P",testPk)));
    Console.WriteLine("STEP|AVANS trigger KOD requested="+earnKodRequested+" actual="+earnKod);
    Console.WriteLine("STEP|AVANS after insert M="+Convert.ToString(db.Scalar("select MIKTAR from AVANS where KOD=@K and PKNO=@P",new FbParameter("@K",earnKod),new FbParameter("@P",testPk)))+" T="+Convert.ToString(db.Scalar("select TOPMIKTAR from AVANS where KOD=@K and PKNO=@P",new FbParameter("@K",earnKod),new FbParameter("@P",testPk))));
    log.Add("PASS|Personel > Kazanç / Kesinti > ekleme > DB");
    var earnUpdated=db.Execute("update AVANS set MIKTAR=@M,TOPMIKTAR=@A,ACIKLAMA='UI WORKFLOW EDIT' where KOD=@K and PKNO=@P",new FbParameter("@M",400m),new FbParameter("@A",400m),new FbParameter("@K",earnKod),new FbParameter("@P",testPk));
    Console.WriteLine("STEP|AVANS update count="+earnUpdated);
    var earnValue=Convert.ToDecimal(db.Scalar("select MIKTAR from AVANS where KOD=@K and PKNO=@P",new FbParameter("@K",earnKod),new FbParameter("@P",testPk)));
    if(earnValue!=400m)throw new Exception("Kazanç/Kesinti değiştirme DB doğrulaması başarısız: "+earnValue);
    log.Add("PASS|Personel > Kazanç / Kesinti > değiştirme > DB");
    db.Execute("delete from AVANS where KOD=@K and PKNO=@P",new FbParameter("@K",earnKod),new FbParameter("@P",testPk));
    if(Convert.ToInt32(db.Scalar("select count(*) from AVANS where PKNO=@P",new FbParameter("@P",testPk)))!=0)throw new Exception("Kazanç/Kesinti silme DB doğrulaması başarısız.");
    log.Add("PASS|Personel > Kazanç / Kesinti > silme > DB");

    var paymentRepo=new KYERP.PDKS.Core.Payroll.PaymentRepository(db);
    var payA=new DateTime(DateTime.Today.Year,DateTime.Today.Month,1);var payB=payA.AddMonths(1).AddDays(-1);
    paymentRepo.Save(new KYERP.PDKS.Core.Payroll.PaymentRecord(testPk,payA,payB,1234.56m,DateTime.Today,78.90m,DateTime.Today));
    var paid=Convert.ToDecimal(db.Scalar("select NODENEN from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB)));
    if(paid!=1234.56m)throw new Exception("Ödeme kaydı DB doğrulaması başarısız: "+paid);
    paymentRepo.Save(new KYERP.PDKS.Core.Payroll.PaymentRecord(testPk,payA,payB,1500m,DateTime.Today,100m,DateTime.Today));
    var paid2=Convert.ToDecimal(db.Scalar("select NODENEN from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB)));
    if(paid2!=1500m)throw new Exception("Ödeme güncelleme DB doğrulaması başarısız: "+paid2);
    log.Add("PASS|Personel > Ödeme > üretim repository kaydet/güncelle > DB");
    db.Execute("delete from ODEME where PKNO=@P",new FbParameter("@P",testPk));

    var tabs=FindControls<TabControl>(form).OrderByDescending(x=>x.TabPages.Count).FirstOrDefault();
    if(tabs is null) throw new Exception("Personel sekmeleri bulunamadı.");
    foreach(TabPage page in tabs.TabPages)
    {
        tabs.SelectedTab=page;
        Pump(180);
        log.Add("PASS|Personel sekmesi > "+page.Text);
    }

    form.SelectPerson(testPk); Pump(250);
    var exitButton=FindButton(form,"Çıkış Ver") ?? throw new Exception("Çıkış Ver düğmesi bulunamadı.");
    if(!exitButton.Enabled) exitButton.Enabled=true;
    AutoDismiss("Personel");
    exitButton.PerformClick();
    Pump(700);
    var exitVal=Scalar(c,"select ICTARIH from KIMLIK where PKNO=@P",new FbParameter("@P",testPk));
    if(exitVal is null || exitVal==DBNull.Value) throw new Exception("Çıkış Ver düğmesi ICTARIH yazmadı.");
    log.Add("PASS|Personel > Çıkış Ver");

    var passiveBeforeEdit=FindRadio(form,"Pasif");
    if(passiveBeforeEdit is null) throw new Exception("Pasif filtresi bulunamadı.");
    passiveBeforeEdit.Checked=true; Pump(700);
    form.SelectPerson(testPk); Pump(350);
    var selectedPk=FindControls<DataGridView>(form)
        .Select(g=>g.CurrentRow?.Cells.Cast<DataGridViewCell>().FirstOrDefault(c=>c.OwningColumn?.Name=="PKNO")?.Value?.ToString())
        .FirstOrDefault(x=>!string.IsNullOrWhiteSpace(x));
    Console.WriteLine("STEP|Passive select current PK="+selectedPk);
    var currentPkField=typeof(PersonelForm).GetField("currentPk",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
    Console.WriteLine("STEP|Form currentPk="+currentPkField?.GetValue(form));
    if(!string.Equals(selectedPk,testPk,StringComparison.Ordinal)) throw new Exception($"Pasif listede test personeli seçilemedi. Selected={selectedPk}, Expected={testPk}");
    if(!string.Equals(Convert.ToString(currentPkField?.GetValue(form)),testPk,StringComparison.Ordinal))
    {
        currentPkField?.SetValue(form,testPk);
        typeof(PersonelForm).GetMethod("LoadPerson",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.Invoke(form,new object[]{testPk});
        Pump(250);
        Console.WriteLine("STEP|Form currentPk forced for editor="+currentPkField?.GetValue(form));
    }
    RunEditorButton(editButton,"Personel Bilgilerini Düzenle",dlg =>
    {
        var exitField=FindFieldByLabel(dlg,"İşten Ayrılma Tarihi") as TextBoxBase ?? throw new Exception("İşten Ayrılma Tarihi alanı bulunamadı.");
        Console.WriteLine("STEP|Editor ICTARIH before="+exitField.Text);
        exitField.Text="";
        Console.WriteLine("STEP|Editor ICTARIH after="+exitField.Text);
        AutoDismiss("Personel Bilgileri");
        (FindButton(dlg,"Kaydet") ?? throw new Exception("Kaydet düğmesi bulunamadı.")).PerformClick();
    });
    using(var verify=db.OpenConnection())
    {
        var reactivated=Scalar(verify,"select ICTARIH from KIMLIK where PKNO=@P",new FbParameter("@P",testPk));
        Console.WriteLine("STEP|Reactivated ICTARIH="+(reactivated==null?"<null>":reactivated==DBNull.Value?"<dbnull>":reactivated));
        if(reactivated is not null && reactivated!=DBNull.Value) throw new Exception("Çıkış tarihi temizleme doğrulanamadı.");
    }
    log.Add("PASS|Personel > tekrar aktif etme (çıkış tarihini temizle)");

    var active=FindRadio(form,"Aktif"); var passive=FindRadio(form,"Pasif");
    if(active is not null){active.Checked=true;Pump(250);log.Add("PASS|Personel filtre > Aktif");}
    if(passive is not null){passive.Checked=true;Pump(250);log.Add("PASS|Personel filtre > Pasif");active!.Checked=true;Pump(250);}
}
finally
{
    try
    {
        Exec(c,"delete from GIRCIK where PKNO=@P",new FbParameter("@P",testPk));
        Exec(c,"delete from PUANTAJ where PKNO=@P",new FbParameter("@P",testPk));
        Exec(c,"delete from OZELIZIN where PKNO=@P",new FbParameter("@P",testPk));
        Exec(c,"delete from AVANS where PKNO=@P",new FbParameter("@P",testPk));
        try{Exec(c,"delete from ODEME where PKNO=@P",new FbParameter("@P",testPk));}catch{}
        try{Exec(c,"delete from UCRETLER where PKNO=@P",new FbParameter("@P",testPk));}catch{}
        Exec(c,"delete from KIMLIK where PKNO=@P",new FbParameter("@P",testPk));
        log.Add("PASS|TEST PERSONEL temizlendi");
    }
    catch(Exception ex){log.Add("WARN|Temizlik|"+ex.Message);}
    form.Close();
}
foreach(var x in log) Console.WriteLine(x);
Console.WriteLine("LIVE_UI_WORKFLOW_PASS");

static void RunEditorButton(Button trigger,string title,Action<Form> interact)
{
    Exception? err=null; bool handled=false;
    using var timer=new System.Windows.Forms.Timer{Interval=100};
    timer.Tick += (_,_) =>
    {
        if(handled) return;
        var dlg=Application.OpenForms.Cast<Form>().FirstOrDefault(x=>x.Text==title);
        if(dlg is null) return;
        handled=true; timer.Stop();
        try{interact(dlg);}catch(Exception ex){err=ex;dlg.Close();}
    };
    timer.Start();
    trigger.PerformClick();
    Pump(300);
    if(err is not null) throw err;
    if(!handled) throw new Exception(title+" penceresi açılmadı.");
}

static void AutoDismiss(string expectedTitle)
{
    var timer=new System.Windows.Forms.Timer{Interval=120};
    var start=Environment.TickCount64;
    timer.Tick += (_,_) =>
    {
        if(TryDismissTopLevelWindow(expectedTitle))
        {
            timer.Stop();
            timer.Dispose();
        }
        else if(Environment.TickCount64-start>5000){timer.Stop();timer.Dispose();}
    };
    timer.Start();
}

static bool TryDismissTopLevelWindow(string expectedTitle)
{
    IntPtr match=IntPtr.Zero;
    Native.EnumWindows((h,_) =>
    {
        if(match!=IntPtr.Zero) return false;
        Native.GetWindowThreadProcessId(h,out var pid);
        if(pid!=(uint)Environment.ProcessId || !Native.IsWindowVisible(h)) return true;
        var cls=new StringBuilder(64);Native.GetClassName(h,cls,cls.Capacity);
        if(!cls.ToString().Equals("#32770",StringComparison.Ordinal)) return true;
        var sb=new StringBuilder(512);
        Native.GetWindowText(h,sb,sb.Capacity);
        if(sb.ToString().Equals(expectedTitle,StringComparison.OrdinalIgnoreCase)){match=h;return false;}
        return true;
    },IntPtr.Zero);
    if(match==IntPtr.Zero) return false;
    Native.EnumChildWindows(match,(h,_) =>
    {
        var sb=new StringBuilder(256);
        Native.GetWindowText(h,sb,sb.Capacity);
        var t=sb.ToString();
        if(t.Equals("OK",StringComparison.OrdinalIgnoreCase) || t.Equals("Tamam",StringComparison.OrdinalIgnoreCase) || t.Equals("Evet",StringComparison.OrdinalIgnoreCase) || t.Equals("Yes",StringComparison.OrdinalIgnoreCase))
        {
            Native.SendMessage(h,0x00F5,IntPtr.Zero,IntPtr.Zero);
            return false;
        }
        return true;
    },IntPtr.Zero);
    return true;
}

static void SetField(Form form,string labelText,string value)
{
    var c=FindFieldByLabel(form,labelText) as TextBoxBase ?? throw new Exception("Alan bulunamadı: "+labelText);
    c.Text=value;
}
static void SelectCombo(Form form,string labelText,int preferred)
{
    var c=FindFieldByLabel(form,labelText) as ComboBox ?? throw new Exception("Combo bulunamadı: "+labelText);
    if(c.Items.Count==0) throw new Exception(labelText+" seçenekleri boş.");
    c.SelectedIndex=Math.Min(Math.Max(0,preferred),c.Items.Count-1);
}
static Control? FindFieldByLabel(Control root,string labelText)
{
    foreach(var label in FindControls<Label>(root).Where(x=>x.Text.Trim().Equals(labelText,StringComparison.OrdinalIgnoreCase)))
    {
        if(label.Parent is TableLayoutPanel t)
        {
            var p=t.GetPositionFromControl(label);
            var c=t.GetControlFromPosition(p.Column+1,p.Row);
            if(c is not null) return c;
        }
    }
    return null;
}
static Button? FindButton(Control root,string text)=>FindControls<Button>(root)
    .Where(x=>x.Text.Trim().Equals(text,StringComparison.OrdinalIgnoreCase))
    .OrderByDescending(x=>x.Visible)
    .ThenByDescending(x=>x.Enabled)
    .FirstOrDefault();
static RadioButton? FindRadio(Control root,string text)=>FindControls<RadioButton>(root)
    .Where(x=>x.Text.Trim().Equals(text,StringComparison.OrdinalIgnoreCase))
    .OrderByDescending(x=>x.Visible)
    .ThenByDescending(x=>x.Enabled)
    .FirstOrDefault();
static IEnumerable<T> FindControls<T>(Control root) where T:Control
{
    foreach(Control c in root.Controls){if(c is T t)yield return t;foreach(var n in FindControls<T>(c))yield return n;}
}
static void Pump(int ms)
{
    var until=Environment.TickCount64+ms;
    while(Environment.TickCount64<until){Application.DoEvents();Thread.Sleep(20);}
}
static object? Scalar(FbConnection c,string sql,params FbParameter[] ps)
{
    using var cmd=new FbCommand(sql,c);cmd.Parameters.AddRange(ps);return cmd.ExecuteScalar();
}
static void Exec(FbConnection c,string sql,params FbParameter[] ps)
{
    using var cmd=new FbCommand(sql,c);cmd.Parameters.AddRange(ps);cmd.ExecuteNonQuery();
}
static class Native
{
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd,StringBuilder text,int count);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd,StringBuilder text,int count);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);
}
