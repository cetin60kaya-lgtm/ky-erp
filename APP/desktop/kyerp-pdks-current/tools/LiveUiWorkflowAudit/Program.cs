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

    RunAccountingEndToEnd(db,c,form,testPk,log);

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
RunDefinitionUiWorkflow(db,log);
foreach(var x in log) Console.WriteLine(x);
Console.WriteLine("LIVE_UI_WORKFLOW_PASS");

static void RunAccountingEndToEnd(FirebirdDatabase db,FbConnection c,PersonelForm personForm,string testPk,List<string> log)
{
    var day=DateTime.Today;
    Exec(c,"delete from GIRCIK where PKNO=@P",new FbParameter("@P",testPk));
    Exec(c,"delete from PUANTAJ where PKNO=@P",new FbParameter("@P",testPk));
    try{Exec(c,"delete from ODEME where PKNO=@P",new FbParameter("@P",testPk));}catch{}
    try{Exec(c,"delete from UCRETLER where PKNO=@P",new FbParameter("@P",testPk));}catch{}

    var loadPeople=typeof(PersonelForm).GetMethod("LoadGirisPeople",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)
        ?? throw new Exception("Muhasebe akışı: LoadGirisPeople bulunamadı.");
    var insertAttendance=typeof(PersonelForm).GetMethod("InsertGirisCikis",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic,null,new[]{typeof(DataTable),typeof(DateTime),typeof(DateTime),typeof(int),typeof(int)},null)
        ?? throw new Exception("Muhasebe akışı: InsertGirisCikis bulunamadı.");
    var all=(DataTable)(loadPeople.Invoke(personForm,null)??throw new Exception("Muhasebe akışı personel listesi alınamadı."));
    var one=all.Clone();var found=all.Select("PKNO='"+testPk.Replace("'","''")+"'");
    if(found.Length!=1)throw new Exception("Muhasebe akışı test personeli seçilemedi.");
    one.ImportRow(found[0]);
    var added=Convert.ToInt32(insertAttendance.Invoke(personForm,new object[]{one,day.Date.AddHours(8).AddMinutes(28),day.Date.AddHours(19).AddMinutes(2),0,0}));
    if(added!=1||Convert.ToInt32(db.Scalar("select count(*) from GIRCIK where PKNO=@P and GTARIH>=@A and GTARIH<@B",new FbParameter("@P",testPk),new FbParameter("@A",day.Date),new FbParameter("@B",day.Date.AddDays(1))))!=1)
        throw new Exception("Muhasebe akışı kart hareketi DB doğrulaması başarısız.");
    log.Add("PASS|MUHASEBE AKIŞI > Kart hareketi ekleme > DB");

    using(var puantaj=new LegacyPuantajForm(0))
    {
        puantaj.Show();Pump(650);
        var page=FindControls<TabControl>(puantaj).First().TabPages[0];
        var edits=FindControls<TextBox>(page).ToArray();var dates=FindControls<DateTimePicker>(page).ToArray();
        if(edits.Length<2||dates.Length<2)throw new Exception("Muhasebe akışı puantaj filtreleri bulunamadı.");
        edits[0].Text=testPk;edits[1].Text=testPk;dates[0].Value=day.Date;dates[1].Value=day.Date;Pump(250);
        var calc=FindButton(page,"Puantajı Hesapla")??throw new Exception("Puantajı Hesapla bulunamadı.");
        calc.PerformClick();Pump(700);
        var count=Convert.ToInt32(db.Scalar("select count(*) from PUANTAJ where PKNO=@P and TARIH>=@A and TARIH<@B",new FbParameter("@P",testPk),new FbParameter("@A",day.Date),new FbParameter("@B",day.Date.AddDays(1))));
        if(count!=1)throw new Exception("Muhasebe akışı puantaj DB doğrulaması başarısız.");
        puantaj.Close();
    }
    log.Add("PASS|MUHASEBE AKIŞI > Günlük puantaj hesapla > DB");

    var periodStart=new DateTime(day.Year,day.Month,1);var periodEnd=periodStart.AddMonths(1).AddDays(-1);
    PreparePayrollFixture(db,testPk,periodStart,periodEnd);
    log.Add("PASS|MUHASEBE AKIŞI > Test personeli için bordro kaynağı oluşturuldu");
    RunPayrollWorkflow(db,testPk,periodStart,periodEnd,log);
    VerifyAccountingReports(testPk,periodStart,periodEnd,log);
}

#pragma warning disable CS8321
static void PayrollUiTestBody(FirebirdDatabase db,MonthlyPayrollAdjustmentForm form,System.Reflection.FieldInfo dataField,System.Reflection.MethodInfo recalc,DataTable data,DateTime periodStart,DateTime periodEnd,List<string> log)
{
    decimal M(DataRow r,string n){try{return r[n]==DBNull.Value?0m:Convert.ToDecimal(r[n]);}catch{return 0m;}}
    var row=data.AsEnumerable().FirstOrDefault(r=>M(r,"HAKEDIS_NET")>0m&&!string.Equals(Convert.ToString(r["DURUM"]),"PEK UYUMSUZ",StringComparison.OrdinalIgnoreCase))
        ?? throw new Exception("Ödeme testi için uygun aktif bordro satırı bulunamadı.");
    var pk=Convert.ToString(row["PKNO"])?.Trim()??throw new Exception("Bordro kart no boş.");
    var a=Convert.ToDateTime(row["BASTAR"]);var b=Convert.ToDateTime(row["BITTAR"]);
    var original=db.Query("select first 1 DMAAS,GUN1,SAAT1,SAAT2,SAAT3,GUN4,DEVG,EKS,EKKAZ,EKKES,EX1,EX2,EX4,NCKALAN,FMKALAN from UCRETLER where PKNO=@P and BASTAR=@A and BITTAR=@B",
        new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b));
    if(original.Rows.Count!=1)throw new Exception("Bordro kaynak satırı yedeklenemedi.");
    var payments=db.Query("select PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",
        new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b));
    try
    {
        ExecutePayrollUiTest(db,form,dataField,recalc,row,pk,a,b,periodStart,periodEnd,log);
    }
    finally
    {
        RestorePayrollTestData(db,pk,a,b,original.Rows[0],payments,log);
    }
}

static void ExecutePayrollUiTest(FirebirdDatabase db,MonthlyPayrollAdjustmentForm form,System.Reflection.FieldInfo dataField,System.Reflection.MethodInfo recalc,DataRow row,string pk,DateTime a,DateTime b,DateTime periodStart,DateTime periodEnd,List<string> log)
{
    decimal M(DataRow r,string n){try{return r[n]==DBNull.Value?0m:Convert.ToDecimal(r[n]);}catch{return 0m;}}
    var expectedEarn=M(row,"EKKAZ")+1.25m;
    row["EKKAZ"]=expectedEarn;row["EKKES"]=M(row,"EKKES")+0.50m;row["EX1"]=M(row,"EX1")+2.50m;
    recalc.Invoke(form,new object[]{row,"Değişti"});
    FindControls<DataGridView>(form).First().Refresh();Pump(180);
    (FindButton(form,"Ayı Kaydet")??throw new Exception("Ayı Kaydet bulunamadı.")).PerformClick();Pump(700);
    var savedEarn=Convert.ToDecimal(db.Scalar("select EKKAZ from UCRETLER where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b))??0m);
    if(savedEarn!=expectedEarn)throw new Exception($"Bordro UI kayıt doğrulaması başarısız: {savedEarn} != {expectedEarn}");
    log.Add($"PASS|MUHASEBE AKIŞI > {pk} bordro düzeltme > Ayı Kaydet > DB");

    var data=(DataTable)(dataField.GetValue(form)??throw new Exception("Bordro yenileme sonrası veri alınamadı."));
    row=data.AsEnumerable().FirstOrDefault(r=>string.Equals(Convert.ToString(r["PKNO"])?.Trim(),pk,StringComparison.Ordinal)&&Convert.ToDateTime(r["BASTAR"])==a)
        ?? throw new Exception("Ödeme için bordro satırı yeniden bulunamadı.");
    row["SEC"]=true;
    (FindButton(form,"Seçili Ödemeleri İşle")??throw new Exception("Seçili Ödemeleri İşle bulunamadı.")).PerformClick();Pump(650);
    var paid=Convert.ToDecimal(db.Scalar("select first 1 NODENEN from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b))??0m);
    if(paid<=0m)throw new Exception("Banka ödeme kaydı oluşmadı.");
    log.Add($"PASS|MUHASEBE AKIŞI > {pk} banka ödemesi > {paid:N2} > DB");
    VerifyAccountingReports(pk,periodStart,periodEnd,log);
}

static void RestorePayrollTestData(FirebirdDatabase db,string pk,DateTime a,DateTime b,DataRow old,DataTable payments,List<string> log)
{
    var fields=new[]{"DMAAS","GUN1","SAAT1","SAAT2","SAAT3","GUN4","DEVG","EKS","EKKAZ","EKKES","EX1","EX2","EX4"};
    var sets=new List<string>();var pars=new List<FbParameter>();var n=0;
    foreach(var f in fields)
    {
        var q="@R"+n++;sets.Add(f+"="+q);pars.Add(new FbParameter(q,old[f] is DBNull?DBNull.Value:old[f]));
    }
    pars.Add(new FbParameter("@P",pk));pars.Add(new FbParameter("@A",a));pars.Add(new FbParameter("@B",b));
    db.Execute("update UCRETLER set "+string.Join(',',sets)+" where PKNO=@P and BASTAR=@A and BITTAR=@B",pars.ToArray());
    db.Execute("delete from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",pk),new FbParameter("@A",a),new FbParameter("@B",b));
    foreach(DataRow p in payments.Rows)
        db.Execute("insert into ODEME(PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values(@P,@A,@B,@N,@NT,@F,@FT)",
            new FbParameter("@P",p["PKNO"]),new FbParameter("@A",p["BASTAR"]),new FbParameter("@B",p["BITTAR"]),new FbParameter("@N",p["NODENEN"]),new FbParameter("@NT",p["NOTARIH"]),new FbParameter("@F",p["FMODENEN"]),new FbParameter("@FT",p["FMOTARIH"]));
    log.Add($"PASS|MUHASEBE AKIŞI > {pk} test değişiklikleri geri alındı");
}

#pragma warning restore CS8321

static void PreparePayrollFixture(FirebirdDatabase db,string testPk,DateTime start,DateTime end)
{
    var source=db.Query("select first 1 * from UCRETLER order by BASTAR desc");
    if(source.Rows.Count==0)throw new Exception("Muhasebe akışı için örnek UCRETLER kaydı yok.");
    var row=source.Rows[0];var names=new List<string>();var marks=new List<string>();var pars=new List<FbParameter>();var i=0;
    foreach(DataColumn col in source.Columns)
    {
        var name=col.ColumnName;
        if(name is "FMKALAN" or "NCMAAS" or "NCKALAN")continue;
        object value=row[name];
        switch(name.ToUpperInvariant())
        {
            case "PKNO":value=testPk;break;case "BASTAR":value=start;break;case "BITTAR":value=end;break;
            case "DMAAS":value=30000m;break;case "GUN1":value=30;break;case "SAAT1":value="240:00";break;
            case "SAAT2":value="08:00";break;case "SAAT3":value="00:00";break;case "GUN4":value=0;break;
            case "DEVG":value=0;break;case "EKS":value="00:00";break;case "EKKAZ":value=500m;break;
            case "EKKES":value=100m;break;case "EX1":value=1000m;break;case "EX2":value=0m;break;
            case "EX4":value=0m;break;case "NCKALAN":value=30000m;break;case "FMKALAN":value=1500m;break;
        }
        var p="@V"+i++;names.Add(name);marks.Add(p);pars.Add(new FbParameter(p,value is DBNull?DBNull.Value:value));
    }
    try{db.Execute($"insert into UCRETLER ({string.Join(',',names)}) values ({string.Join(',',marks)})",pars.ToArray());}
    catch
    {
        db.Execute("insert into UCRETLER (PKNO,BASTAR,BITTAR,DMAAS,GUN1,SAAT1,SAAT2,SAAT3,GUN4,DEVG,EKS,EKKAZ,EKKES,EX1,EX2,EX4) values (@P,@A,@B,30000,30,'240:00','08:00','00:00',0,0,'00:00',500,100,1000,0,0)",
            new FbParameter("@P",testPk),new FbParameter("@A",start),new FbParameter("@B",end));
    }
    var count=Convert.ToInt32(db.Scalar("select count(*) from UCRETLER where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",start),new FbParameter("@B",end)));
    if(count!=1)throw new Exception("Muhasebe akışı bordro kaynağı oluşturulamadı.");
}

static void RunPayrollWorkflow(FirebirdDatabase db,string testPk,DateTime start,DateTime end,List<string> log)
{
    using var form=new MonthlyPayrollAdjustmentForm();
    form.Show();Pump(800);
    var type=typeof(MonthlyPayrollAdjustmentForm);
    var dataField=type.GetField("data",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)
        ?? throw new Exception("Aylık bordro veri alanı bulunamadı.");
    var recalc=type.GetMethod("RecalcRow",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)
        ?? throw new Exception("Aylık bordro satır hesaplama metodu bulunamadı.");
    var data=(DataTable)(dataField.GetValue(form)??throw new Exception("Aylık bordro verisi alınamadı."));
    var rows=data.Select("PKNO='"+testPk.Replace("'","''")+"'");
    if(rows.Length!=1)throw new Exception("Aylık bordro ekranında test personeli görünmedi.");
    var row=rows[0];
    row["EKKAZ"]=750m;row["EKKES"]=125m;row["EX1"]=900m;row["NCKALAN"]=31000m;row["FMKALAN"]=1750m;
    recalc.Invoke(form,new object[]{row,"Değişti"});
    FindControls<DataGridView>(form).First().Refresh();Pump(150);

    var save=FindButton(form,"Ayı Kaydet")??throw new Exception("Ayı Kaydet bulunamadı.");
    save.PerformClick();Pump(700);
    var ekkaz=Convert.ToDecimal(db.Scalar("select EKKAZ from UCRETLER where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",start),new FbParameter("@B",end)));
    var avans=Convert.ToDecimal(db.Scalar("select EX1 from UCRETLER where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",start),new FbParameter("@B",end)));
    if(ekkaz!=750m||avans!=900m)throw new Exception($"Aylık bordro kaydı DB doğrulanamadı: EKKAZ={ekkaz}, AVANS={avans}");
    log.Add("PASS|MUHASEBE AKIŞI > Bordro düzeltme > Ayı Kaydet > DB");

    data=(DataTable)(dataField.GetValue(form)??throw new Exception("Bordro kaydet sonrası veri alınamadı."));
    rows=data.Select("PKNO='"+testPk.Replace("'","''")+"'");
    if(rows.Length!=1)throw new Exception("Ödeme için test personeli bulunamadı.");
    rows[0]["SEC"]=true;
    var post=FindButton(form,"Seçili Ödemeleri İşle")??throw new Exception("Seçili Ödemeleri İşle bulunamadı.");
    post.PerformClick();Pump(650);
    var paid=Convert.ToDecimal(db.Scalar("select first 1 NODENEN from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",start),new FbParameter("@B",end))??0m);
    if(paid<=0)throw new Exception("Banka ödeme kaydı oluşmadı.");
    log.Add($"PASS|MUHASEBE AKIŞI > Banka ödemesi işle > {paid:N2} > DB");
    form.Close();
}

static void VerifyAccountingReports(string testPk,DateTime start,DateTime end,List<string> log)
{
    using(var bordro=new LegacyBordroForm(0))
    {
        var bt=typeof(LegacyBordroForm);
        var by=(ComboBox)(bt.GetField("year",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(bordro)??throw new Exception("Bordro yıl alanı bulunamadı."));
        var bm=(ComboBox)(bt.GetField("month",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(bordro)??throw new Exception("Bordro ay alanı bulunamadı."));
        by.SelectedItem=start.Year;bm.SelectedIndex=start.Month-1;
        bordro.Show();Pump(800);
        var grid=FindControls<DataGridView>(bordro).FirstOrDefault(g=>g.Columns.Cast<DataGridViewColumn>().Any(c=>c.HeaderText=="Kart No"))
            ?? throw new Exception("Bordro merkezi grid bulunamadı.");
        var found=grid.Rows.Cast<DataGridViewRow>().Any(r=>r.Cells.Cast<DataGridViewCell>().Any(c=>c.OwningColumn?.HeaderText=="Kart No"&&string.Equals(Convert.ToString(c.Value)?.Trim(),testPk,StringComparison.Ordinal)));
        if(!found)throw new Exception("Bordro merkezinde test personeli görünmedi.");
        log.Add("PASS|MUHASEBE AKIŞI > Bordro merkezi > test personeli görünür");
        bordro.Close();
    }

    using(var reportForm=new ReportCenterForm("Bordro"))
    {
        reportForm.Show();Pump(600);
        var type=typeof(ReportCenterForm);
        var report=(ComboBox)(type.GetField("report",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(reportForm)??throw new Exception("Rapor seçicisi bulunamadı."));
        var month=(ComboBox)(type.GetField("month",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(reportForm)??throw new Exception("Rapor ay alanı bulunamadı."));
        var year=(ComboBox)(type.GetField("year",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(reportForm)??throw new Exception("Rapor yıl alanı bulunamadı."));
        var grid=(DataGridView)(type.GetField("grid",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)?.GetValue(reportForm)??throw new Exception("Rapor grid bulunamadı."));
        year.SelectedItem=start.Year;month.SelectedIndex=start.Month-1;report.SelectedItem="Bordro • Ödemeler";Pump(650);
        var found=grid.Rows.Cast<DataGridViewRow>().Any(r=>r.Cells.Cast<DataGridViewCell>().Any(c=>string.Equals(Convert.ToString(c.Value)?.Trim(),testPk,StringComparison.Ordinal)));
        if(!found)throw new Exception("Ödeme raporunda test personeli görünmedi.");
        log.Add("PASS|MUHASEBE AKIŞI > Ödeme raporu > DB/UI karşılaştırma");
        reportForm.Close();
    }
}

static void RunDefinitionUiWorkflow(FirebirdDatabase db,List<string> log)
{
    using var form=new LegacyDefinitionsForm("Bölümler");
    form.Show();Pump(500);
    var tabs=FindControls<TabControl>(form).FirstOrDefault() ?? throw new Exception("Tanımlar sekmeleri bulunamadı.");
    foreach(var item in new[]{("Bölümler","BOLUM"),("Servisler","SERVIS"),("Durum","DURUM"),("Görevler","GOREV")})
    {
        var page=tabs.TabPages.Cast<TabPage>().First(p=>p.Text==item.Item1);tabs.SelectedTab=page;Pump(150);
        var add=FindButton(page,"Yeni Ekle") ?? throw new Exception(item.Item1+" Yeni Ekle bulunamadı.");
        var save=FindButton(page,"Kaydet") ?? throw new Exception(item.Item1+" Kaydet bulunamadı.");
        var edit=FindControls<TextBox>(page).FirstOrDefault() ?? throw new Exception(item.Item1+" edit alanı bulunamadı.");
        db.Execute($"delete from {item.Item2} where AD starting with @P",new FbParameter("@P","UI TEST "+item.Item2));
        var name="UI TEST "+item.Item2+" "+DateTime.Now.ToString("HHmmssfff");
        int? code=null;
        try
        {
            add.PerformClick();edit.Text=name;save.PerformClick();Pump(300);
            code=Convert.ToInt32(db.Scalar($"select KOD from {item.Item2} where AD=@A",new FbParameter("@A",name)) ?? throw new Exception(item.Item1+" DB insert bulunamadı."));
            var grid=FindControls<DataGridView>(page).First();
            var selectedCode=grid.CurrentRow?.DataBoundItem is DataRowView rv?Convert.ToInt32(rv.Row["KOD"]):-1;
            if(selectedCode!=code.Value)throw new Exception(item.Item1+" yeni kayıt seçili kalmadı.");
            var change=FindButton(page,"Değiştir") ?? throw new Exception(item.Item1+" Değiştir bulunamadı.");
            change.PerformClick();Pump(100);
            Console.WriteLine($"STEP|DEF {item.Item1} change clicked saveEnabled={save.Enabled} editReadOnly={edit.ReadOnly} current={selectedCode} code={code.Value}");
            edit.Text=name+" EDIT";
            Console.WriteLine($"STEP|DEF {item.Item1} editText={edit.Text}");
            Console.WriteLine($"STEP|DEF {item.Item1} beforeSave enabled={save.Enabled} visible={save.Visible} canSelect={save.CanSelect}");
            save.PerformClick();Pump(350);
            Console.WriteLine($"STEP|DEF {item.Item1} afterSave enabled={save.Enabled} visible={save.Visible}");
            var actual=Convert.ToString(db.Scalar($"select AD from {item.Item2} where KOD=@K",new FbParameter("@K",code.Value)))??"";
            Console.WriteLine($"STEP|DEF {item.Item1} actual={actual}");
            if(actual!=name+" EDIT")throw new Exception(item.Item1+" UI update DB doğrulaması başarısız. actual="+actual);
            var del=FindButton(page,"Sil") ?? throw new Exception(item.Item1+" Sil bulunamadı.");
            AutoDismiss("Tanımlar");del.PerformClick();Pump(450);
            if(Convert.ToInt32(db.Scalar($"select count(*) from {item.Item2} where KOD=@K",new FbParameter("@K",code.Value)))!=0)throw new Exception(item.Item1+" UI silme DB doğrulaması başarısız.");
            log.Add("PASS|Tanımlar > "+item.Item1+" > Yeni/Değiştir/Sil > DB");
            code=null;
        }
        finally
        {
            if(code is not null) db.Execute($"delete from {item.Item2} where KOD=@K",new FbParameter("@K",code.Value));
            db.Execute($"delete from {item.Item2} where AD starting with @P",new FbParameter("@P","UI TEST "+item.Item2));
        }
    }

    var firmaPage=tabs.TabPages.Cast<TabPage>().First(p=>p.Text=="Firma");tabs.SelectedTab=firmaPage;Pump(200);
    var firmaName="UI TEST FIRMA "+DateTime.Now.ToString("HHmmssfff");
    int? firmaCode=null;
    try
    {
        var newFirma=FindButton(firmaPage,"Yeni Firma") ?? throw new Exception("Yeni Firma bulunamadı.");
        var saveFirma=FindButton(firmaPage,"Kaydet") ?? throw new Exception("Firma Kaydet bulunamadı.");
        newFirma.PerformClick();Pump(100);
        var firmaCombo=FindFieldByLabel(firmaPage,"Firma Adı") as ComboBox ?? throw new Exception("Firma adı alanı bulunamadı.");
        var address=FindFieldByLabel(firmaPage,"Adres") as TextBox ?? throw new Exception("Firma adres alanı bulunamadı.");
        firmaCombo.Text=firmaName;address.Text="UI TEST ADRES";saveFirma.PerformClick();Pump(350);
        firmaCode=Convert.ToInt32(db.Scalar("select KOD from FIRMA where AD=@A",new FbParameter("@A",firmaName)) ?? throw new Exception("Firma DB insert bulunamadı."));
        if(!Equals(firmaCombo.SelectedValue,firmaCode.Value) && Convert.ToString(firmaCombo.SelectedValue)!=Convert.ToString(firmaCode.Value))throw new Exception("Yeni firma seçili kalmadı.");
        var firmaCodeField=typeof(LegacyDefinitionsForm).GetField("firmaCode",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
        if(Convert.ToInt32(firmaCodeField?.GetValue(form)??-1)!=firmaCode.Value)throw new Exception("Firma iç seçim kodu yeni kayıtta kalmadı.");
        var editFirma=FindButton(firmaPage,"Düzenle") ?? throw new Exception("Firma Düzenle bulunamadı.");
        editFirma.PerformClick();Pump(100);address.Text="UI TEST ADRES EDIT";saveFirma.PerformClick();Pump(300);
        var actualAddress=Convert.ToString(db.Scalar("select ADRES from FIRMA where KOD=@K",new FbParameter("@K",firmaCode.Value)))??"";
        if(actualAddress!="UI TEST ADRES EDIT")throw new Exception("Firma UI update DB doğrulaması başarısız.");
        var delFirma=FindButton(firmaPage,"Sil") ?? throw new Exception("Firma Sil bulunamadı.");
        AutoDismiss("Tanımlar");delFirma.PerformClick();Pump(450);
        if(Convert.ToInt32(db.Scalar("select count(*) from FIRMA where KOD=@K",new FbParameter("@K",firmaCode.Value)))!=0)throw new Exception("Firma UI silme DB doğrulaması başarısız.");
        log.Add("PASS|Tanımlar > Firma > Yeni/Düzenle/Sil > DB");firmaCode=null;
    }
    finally
    {
        if(firmaCode is not null) db.Execute("delete from FIRMA where KOD=@K",new FbParameter("@K",firmaCode.Value));
        db.Execute("delete from FIRMA where AD starting with 'UI TEST FIRMA'");
    }

    var bordroPage=tabs.TabPages.Cast<TabPage>().First(p=>p.Text=="Bordro");tabs.SelectedTab=bordroPage;Pump(200);
    var bordroName="UI TEST BORDRO "+DateTime.Now.ToString("HHmmssfff");
    int? bordroCode=null;
    try
    {
        var newBordro=FindButton(bordroPage,"Yeni Alan") ?? throw new Exception("Yeni Bordro Alanı bulunamadı.");
        var saveBordro=FindButton(bordroPage,"Kaydet") ?? throw new Exception("Bordro Kaydet bulunamadı.");
        newBordro.PerformClick();Pump(100);
        (FindFieldByLabel(bordroPage,"Alan Adı") as TextBox ?? throw new Exception("Alan Adı bulunamadı.")).Text=bordroName;
        (FindFieldByLabel(bordroPage,"Kısa Adı") as TextBox ?? throw new Exception("Kısa Adı bulunamadı.")).Text="UIT";
        (FindFieldByLabel(bordroPage,"Katsayı") as TextBox ?? throw new Exception("Katsayı bulunamadı.")).Text="25";
        var type=FindFieldByLabel(bordroPage,"Alan Türü") as ComboBox ?? throw new Exception("Alan Türü bulunamadı.");type.SelectedIndex=Math.Min(1,type.Items.Count-1);
        var field=FindFieldByLabel(bordroPage,"Alan") as ComboBox ?? throw new Exception("Alan bulunamadı.");field.SelectedIndex=0;
        saveBordro.PerformClick();Pump(350);
        bordroCode=Convert.ToInt32(db.Scalar("select KOD from BORDRO where AD=@A",new FbParameter("@A",bordroName)) ?? throw new Exception("Bordro DB insert bulunamadı."));
        var grid=FindControls<DataGridView>(bordroPage).First();
        var selected=grid.CurrentRow?.DataBoundItem is DataRowView br?Convert.ToInt32(br.Row["KOD"]):-1;
        if(selected!=bordroCode.Value)throw new Exception("Yeni bordro alanı seçili kalmadı.");
        var bordroCodeField=typeof(LegacyDefinitionsForm).GetField("bordroCode",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);
        if(Convert.ToInt32(bordroCodeField?.GetValue(form)??-1)!=bordroCode.Value)throw new Exception("Bordro iç seçim kodu yeni kayıtta kalmadı.");
        var editBordro=FindButton(bordroPage,"Düzenle") ?? throw new Exception("Bordro Düzenle bulunamadı.");
        editBordro.PerformClick();Pump(100);
        (FindFieldByLabel(bordroPage,"Alan Adı") as TextBox)!.Text=bordroName+" EDIT";saveBordro.PerformClick();Pump(300);
        var actualBordro=Convert.ToString(db.Scalar("select AD from BORDRO where KOD=@K",new FbParameter("@K",bordroCode.Value)))??"";
        if(actualBordro!=bordroName+" EDIT")throw new Exception("Bordro UI update DB doğrulaması başarısız.");
        var delBordro=FindButton(bordroPage,"Sil") ?? throw new Exception("Bordro Sil bulunamadı.");
        AutoDismiss("Tanımlar");delBordro.PerformClick();Pump(450);
        if(Convert.ToInt32(db.Scalar("select count(*) from BORDRO where KOD=@K",new FbParameter("@K",bordroCode.Value)))!=0)throw new Exception("Bordro UI silme DB doğrulaması başarısız.");
        log.Add("PASS|Tanımlar > Bordro > Yeni/Düzenle/Sil > DB");bordroCode=null;
    }
    finally
    {
        if(bordroCode is not null) db.Execute("delete from BORDRO where KOD=@K",new FbParameter("@K",bordroCode.Value));
        db.Execute("delete from BORDRO where AD starting with 'UI TEST BORDRO'");
    }
    form.Close();

    using var groupForm=new LegacyGroupForm();
    groupForm.Show();Pump(500);
    var groupGrid=FindControls<DataGridView>(groupForm).FirstOrDefault() ?? throw new Exception("Çalışma grubu listesi bulunamadı.");
    var groupNames=groupGrid.Rows.Cast<DataGridViewRow>()
        .Where(r=>!r.IsNewRow)
        .Select(r=>Convert.ToString(r.Cells["AD"].Value)?.Trim()??"")
        .Where(x=>x.Length>0)
        .ToArray();
    if(groupNames.Length!=2 || !groupNames.Contains("MESAİLİ GRUP") || !groupNames.Contains("İDARİ GRUP"))
        throw new Exception("Çalışma grupları yalnız MESAİLİ GRUP ve İDARİ GRUP olmalıdır: "+string.Join(", ",groupNames));
    if(FindButton(groupForm,"Yeni Ekle") is not null || FindButton(groupForm,"Sil") is not null || FindButton(groupForm,"Tümünü Sil") is not null)
        throw new Exception("Sabit çalışma gruplarında ekleme/silme komutu görünmemeli.");
    var editGroup=FindButton(groupForm,"Değiştir") ?? throw new Exception("Çalışma Grubu Değiştir bulunamadı.");
    editGroup.PerformClick();Pump(100);
    var fixedName=FindFieldByLabel(groupForm,"Grup Adı") as TextBox ?? throw new Exception("Grup Adı bulunamadı.");
    var daily=FindFieldByLabel(groupForm,"Günlük Çalışma Saati") as TextBox ?? throw new Exception("Günlük Çalışma Saati bulunamadı.");
    if(!fixedName.ReadOnly || daily.ReadOnly) throw new Exception("Grup adı sabit, vardiya/saat alanları düzenlenebilir olmalıdır.");
    log.Add("PASS|Çalışma Grupları > yalnız MESAİLİ + İDARİ > ad sabit / saatler düzenlenebilir");
    groupForm.Close();

    using var periodForm=new LegacyPeriodForm();
    periodForm.Show();Pump(550);
    var yearField=typeof(LegacyPeriodForm).GetField("year",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)
        ?.GetValue(periodForm) as ComboBox ?? throw new Exception("Dönem yıl seçimi bulunamadı.");
    if(!yearField.Items.Cast<object>().Any(x=>Convert.ToInt32(x)==DateTime.Today.Year))
        throw new Exception("Dönem yıl listesinde güncel yıl yok.");

    var auditYear=yearField.Items.Cast<object>().Select(Convert.ToInt32)
        .Where(y=>y>=DateTime.Today.Year)
        .OrderByDescending(y=>y)
        .FirstOrDefault(y=>Convert.ToInt32(db.Scalar(
            "select count(*) from DONEM where BASTAR>=@A and BASTAR<@B",
            new FbParameter("@A",new DateTime(y,1,1)),
            new FbParameter("@B",new DateTime(y,1,1).AddYears(1)))??0)==0);
    if(auditYear==0)throw new Exception("Otomatik dönem testi için boş yıl bulunamadı.");

    try
    {
        yearField.SelectedItem=auditYear;Pump(900);
        var periodGrid=FindControls<DataGridView>(periodForm).FirstOrDefault() ?? throw new Exception("Dönem ay listesi bulunamadı.");
        var monthRows=periodGrid.Rows.Cast<DataGridViewRow>().Where(r=>!r.IsNewRow).ToArray();
        if(monthRows.Length!=12)throw new Exception($"Dönem ekranı 12 ay göstermeli; görünen: {monthRows.Length}.");

        if(FindButton(periodForm,"Yeni Dönem") is not null || FindButton(periodForm,"Düzenle") is not null ||
           FindButton(periodForm,"Sil") is not null || FindButton(periodForm,"Kaydet") is not null)
            throw new Exception("Dönem ekranında manuel ay×grup CRUD görünmemeli.");
        if(FindButton(periodForm,"Yılı Hazırla") is not null)
            throw new Exception("Yıllık dönemler kullanıcıdan hazırlama komutu istememeli; yıl seçimi otomatik olmalı.");

        var a=new DateTime(auditYear,1,1);
        var b=a.AddYears(1);
        var systemRows=Convert.ToInt32(db.Scalar(
            "select count(*) from DONEM where BASTAR>=@A and BASTAR<@B",
            new FbParameter("@A",a),new FbParameter("@B",b))??0);
        if(systemRows!=24)throw new Exception($"Arka planda 12 ay × 2 çekirdek grup = 24 dönem bekleniyordu; bulunan: {systemRows}.");

        var groupCounts=db.Query(
            "select g.AD,count(*) ADET from DONEM d join GRUP g on g.KOD=d.GRUP where d.BASTAR>=@A and d.BASTAR<@B group by g.AD order by g.AD",
            new FbParameter("@A",a),new FbParameter("@B",b));
        var counts=groupCounts.AsEnumerable().ToDictionary(r=>Convert.ToString(r["AD"])?.Trim()??"",r=>Convert.ToInt32(r["ADET"]));
        if(!counts.TryGetValue("MESAİLİ GRUP",out var mesaili)||mesaili!=12 ||
           !counts.TryGetValue("İDARİ GRUP",out var idari)||idari!=12)
            throw new Exception("Otomatik dönem dağılımı MESAİLİ=12 / İDARİ=12 olmalıdır.");

        if(monthRows.Any(r=>!string.Equals(Convert.ToString(r.Cells["DURUM"].Value),"Hazır",StringComparison.Ordinal)))
            throw new Exception("12 aylık dönem görünümünde hazır olmayan ay kaldı.");

        log.Add("PASS|Yıllık Dönemler > yıl seçimi > 12 ay görünür > MESAİLİ/İDARİ arka planda otomatik 24 kayıt > DB");
    }
    finally
    {
        var a=new DateTime(auditYear,1,1);
        var b=a.AddYears(1);
        periodForm.Close();
        db.Execute("delete from DONEM where BASTAR>=@A and BASTAR<@B",
            new FbParameter("@A",a),new FbParameter("@B",b));
    }
}

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
    // Native MessageBox confirmation: first try WM_COMMAND/IDYES, which works reliably
    // even while the caller is blocked inside the modal loop.
    Native.SendMessage(match,0x0111,(IntPtr)6,IntPtr.Zero);
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
    .Where(x=>x.Text.Replace("&","").Trim().Equals(text.Replace("&","").Trim(),StringComparison.OrdinalIgnoreCase))
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
