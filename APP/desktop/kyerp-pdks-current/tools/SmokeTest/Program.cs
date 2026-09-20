using FirebirdSql.Data.FirebirdClient;
using System.Text;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var options = PdksOptions.FromEnvironment();
var database = new FirebirdDatabase(options);
var logPath = Environment.GetEnvironmentVariable("KY_PDKS_SMOKE_LOG")
    ?? Path.Combine(AppContext.BaseDirectory, "PDKS_SMOKE_TEST.log");
var log = new StringBuilder();
log.AppendLine($"HKN Personel final smoke test: {DateTime.Now:yyyy-MM-dd HH:mm:ss}");

using var c = database.OpenConnection();
int activeBefore = Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK where ICTARIH is null"));
int totalBefore = Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK"));
log.AppendLine($"BEFORE active={activeBefore} left={totalBefore-activeBefore} total={totalBefore}");

string testPk="99999";
while(Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK where PKNO=@P",new FbParameter("@P",testPk)))>0)
    testPk=(int.Parse(testPk)-1).ToString("00000");
log.AppendLine($"TEST_PK={testPk}");
using var tx = c.BeginTransaction();
try
{
    int ps=Convert.ToInt32(Scalar(c,tx,"select coalesce(max(PS),0)+1 from KIMLIK"));
    Exec(c,tx,"insert into KIMLIK (PS,PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,DURUM,GOREV,MAAS,KULIZIN,CCKSAY) values (@PS,@PK,@AD,@SOY,@G,1,1,2,1,1000,0,0)",
        new FbParameter("@PS",ps),new FbParameter("@PK",testPk),new FbParameter("@AD","SMOKE"),new FbParameter("@SOY","TEST"),new FbParameter("@G",new DateTime(2099,1,1)));
    Exec(c,tx,"update KIMLIK set AD='SMOKE2',ICTARIH=@D where PKNO=@PK",new FbParameter("@D",new DateTime(2099,1,31)),new FbParameter("@PK",testPk));
    var ad=Convert.ToString(Scalar(c,tx,"select AD from KIMLIK where PKNO=@PK",new FbParameter("@PK",testPk)));
    if(ad!="SMOKE2") throw new Exception("KIMLIK update doğrulanamadı");
    log.AppendLine("KIMLIK insert/update OK");

    int gs=Convert.ToInt32(Scalar(c,tx,"select coalesce(max(SIRA),0)+1 from GIRCIK"));
    Exec(c,tx,"insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,CTARIH,CSAAT,CDAKIKA,MKOD) values (@S,@PK,@D,'08:30',510,@D,'19:00',1140,'000')",
        new FbParameter("@S",gs),new FbParameter("@PK",testPk),new FbParameter("@D",new DateTime(2099,1,2)));
    Exec(c,tx,"update GIRCIK set GSAAT='08:31',GDAKIKA=511 where SIRA=@S and PKNO=@PK",new FbParameter("@S",gs),new FbParameter("@PK",testPk));
    Exec(c,tx,"delete from GIRCIK where SIRA=@S and PKNO=@PK",new FbParameter("@S",gs),new FbParameter("@PK",testPk));
    log.AppendLine("GIRCIK insert/update/delete OK");

    var puantajDate=new DateTime(2099,1,2);var puantaj=DailyAttendanceCalculator.Calculate(new(puantajDate,510,1020,450,puantajDate.AddMinutes(520),puantajDate.AddMinutes(1030)));
    Exec(c,tx,"insert into PUANTAJ (PKNO,TARIH,GIRIS,CIKIS,STATUS,BOLUM,SSKD,SAAT1,DAKIKA1,GUN1,SAAT2,DAKIKA2,GUN2,SAAT3,DAKIKA3,GUN3,SAAT4,DAKIKA4,GUN4,DEVAMSIZLIKS,DEVAMSIZLIKD,DEVAMSIZLIKG,GECS,GECD,GECG,ERKENS,ERKEND,ERKENG,EKSIKS,EKSIKD,EKSIKG,DEVCEZAS,DEVCEZAD,GECCEZAS,GECCEZAD,ERCEZAS,ERCEZAD,EKCEZAS,EKCEZAD) values (@P,@T,@GI,@CI,@ST,1,@SSK,@S1,@D1,@G1,@S2,@D2,@G2,'00:00',0,0,'00:00',0,0,@DS,@DD,@DG,@GS,@GD,@GG,@ES,@ED,@EG,@XS,@XD,@XG,'00:00',0,'00:00',0,'00:00',0,'00:00',0)",
        new FbParameter("@P",testPk),new FbParameter("@T",puantajDate),new FbParameter("@GI",puantaj.Entry),new FbParameter("@CI",puantaj.Exit),new FbParameter("@ST",puantaj.Status),new FbParameter("@SSK",puantaj.NormalDay),new FbParameter("@S1",DailyAttendanceResult.AsTime(puantaj.NormalMinutes)),new FbParameter("@D1",puantaj.NormalMinutes),new FbParameter("@G1",puantaj.NormalDay),new FbParameter("@S2",DailyAttendanceResult.AsTime(puantaj.Overtime50Minutes)),new FbParameter("@D2",puantaj.Overtime50Minutes),new FbParameter("@G2",puantaj.Overtime50Day),new FbParameter("@DS",DailyAttendanceResult.AsTime(puantaj.AbsenceMinutes)),new FbParameter("@DD",puantaj.AbsenceMinutes),new FbParameter("@DG",puantaj.AbsenceDay),new FbParameter("@GS",DailyAttendanceResult.AsTime(puantaj.LateMinutes)),new FbParameter("@GD",puantaj.LateMinutes),new FbParameter("@GG",puantaj.LateDay),new FbParameter("@ES",DailyAttendanceResult.AsTime(puantaj.EarlyExitMinutes)),new FbParameter("@ED",puantaj.EarlyExitMinutes),new FbParameter("@EG",puantaj.EarlyExitDay),new FbParameter("@XS",DailyAttendanceResult.AsTime(puantaj.ShortfallMinutes)),new FbParameter("@XD",puantaj.ShortfallMinutes),new FbParameter("@XG",puantaj.ShortfallDay));
    using(var payrollTotals=new FbCommand("select coalesce(sum(GUN1),0),coalesce(sum(DAKIKA2),0),coalesce(sum(DAKIKA3),0) from PUANTAJ where PKNO=@P and TARIH=@T",c,tx)){payrollTotals.Parameters.Add(new FbParameter("@P",testPk));payrollTotals.Parameters.Add(new FbParameter("@T",puantajDate));using var reader=payrollTotals.ExecuteReader();if(!reader.Read()||reader.GetInt16(0)!=1||reader.GetInt32(1)!=10||reader.GetInt32(2)!=0)throw new Exception("PUANTAJ bordro toplamları doğrulanamadı");}
    log.AppendLine("PUANTAJ payroll totals OK");
    Exec(c,tx,"update PUANTAJ set STATUS='SMOKE2' where PKNO=@P and TARIH=@T",new FbParameter("@P",testPk),new FbParameter("@T",puantajDate));
    if(Convert.ToString(Scalar(c,tx,"select STATUS from PUANTAJ where PKNO=@P and TARIH=@T",new FbParameter("@P",testPk),new FbParameter("@T",puantajDate)))!="SMOKE2")throw new Exception("PUANTAJ update doğrulanamadı");
    Exec(c,tx,"delete from PUANTAJ where PKNO=@P and TARIH=@T",new FbParameter("@P",testPk),new FbParameter("@T",puantajDate));
    log.AppendLine("PUANTAJ insert/update/delete OK");

    int iz=Convert.ToInt32(Scalar(c,tx,"select coalesce(max(SIRA),0)+1 from OZELIZIN"));
    Exec(c,tx,"insert into OZELIZIN (PKNO,SURESAAT,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) values (@PK,'07:30',450,4,@D,'TEST','SMOKE',@S,'0')",
        new FbParameter("@PK",testPk),new FbParameter("@D",new DateTime(2099,1,3)),new FbParameter("@S",iz));
    Exec(c,tx,"update OZELIZIN set MAZERET='SMOKE2' where SIRA=@S and PKNO=@PK",new FbParameter("@S",iz),new FbParameter("@PK",testPk));
    Exec(c,tx,"delete from OZELIZIN where SIRA=@S and PKNO=@PK",new FbParameter("@S",iz),new FbParameter("@PK",testPk));
    log.AppendLine("OZELIZIN insert/update/delete OK");

    int av=Convert.ToInt32(Scalar(c,tx,"select coalesce(max(KOD),0)+1 from AVANS"));
    Exec(c,tx,"insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@PK,@D,100,@D,2,@K,100,1,1,'SMOKE')",
        new FbParameter("@PK",testPk),new FbParameter("@D",new DateTime(2099,1,4)),new FbParameter("@K",av));
    Exec(c,tx,"update AVANS set MIKTAR=125,TOPMIKTAR=125,ACIKLAMA='SMOKE2' where KOD=@K and PKNO=@PK",new FbParameter("@K",av),new FbParameter("@PK",testPk));
    Exec(c,tx,"delete from AVANS where KOD=@K and PKNO=@PK",new FbParameter("@K",av),new FbParameter("@PK",testPk));
    log.AppendLine("AVANS insert/update/delete OK");

    Exec(c,tx,"delete from KIMLIK where PKNO=@PK",new FbParameter("@PK",testPk));
    log.AppendLine("KIMLIK delete OK");
    tx.Rollback();
    log.AppendLine("TRANSACTION ROLLBACK OK");
}
catch(Exception ex)
{
    try{tx.Rollback();}catch{}
    log.AppendLine("FAILED: "+ex);
    File.WriteAllText(logPath,log.ToString(),Encoding.UTF8);
    throw;
}

int activeAfter = Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK where ICTARIH is null"));
int totalAfter = Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK"));
int residue = Convert.ToInt32(Scalar(c,null,"select count(*) from KIMLIK where PKNO=@P",new FbParameter("@P",testPk)));
log.AppendLine($"AFTER active={activeAfter} left={totalAfter-activeAfter} total={totalAfter} residue={residue}");
if(activeBefore!=activeAfter || totalBefore!=totalAfter || residue!=0) throw new Exception("Rollback sonrası üretim DB sayıları değişti");
log.AppendLine("PRODUCTION_DB_UNCHANGED OK");
var terminalPk=Convert.ToString(Scalar(c,null,"select first 1 PKNO from KIMLIK where PKNO is not null order by PKNO"))??throw new Exception("Terminal smoke testi için personel bulunamadı");
var terminalDate=new DateTime(2099,12,30);var terminalBefore=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",terminalDate)));
var terminalResult=new AttendanceImportService(database).Import([new(terminalPk,terminalDate.AddHours(8),"1","SMOKE",TerminalDirection.Entry,"smoke-a"),new(terminalPk,terminalDate.AddHours(8).AddMinutes(4),"1","SMOKE",TerminalDirection.Entry,"smoke-b")],5,rollbackOnly:true);
var terminalAfter=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",terminalDate)));
if(terminalResult.Inserted!=1||terminalResult.Duplicates!=1||terminalBefore!=terminalAfter)throw new Exception("Terminal tolerans rollback testi başarısız");
log.AppendLine("TERMINAL TOLERANCE ROLLBACK OK");
log.AppendLine("FINAL_RESULT=PASS");
File.WriteAllText(logPath,log.ToString(),Encoding.UTF8);
Console.WriteLine(log.ToString());

static object? Scalar(FbConnection c,FbTransaction? tx,string sql,params FbParameter[] ps)
{
    using var cmd=new FbCommand(sql,c,tx);
    if(ps.Length>0) cmd.Parameters.AddRange(ps);
    return cmd.ExecuteScalar();
}

static int Exec(FbConnection c,FbTransaction tx,string sql,params FbParameter[] ps)
{
    using var cmd=new FbCommand(sql,c,tx);
    if(ps.Length>0) cmd.Parameters.AddRange(ps);
    return cmd.ExecuteNonQuery();
}
