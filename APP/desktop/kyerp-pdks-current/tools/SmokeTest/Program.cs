using FirebirdSql.Data.FirebirdClient;
using System.Text;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Payroll;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Terminal;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
foreach (var key in new[] { "KY_PDKS_DB_PATH", "KY_PDKS_DB_HOST", "KY_PDKS_DB_PORT", "KY_PDKS_DB_USER", "KY_PDKS_DB_PASSWORD", "KYERP_PDKS_ROOT", "KY_PDKS_RUNTIME_ROOT", "KY_PDKS_REPORT_ROOT", "KY_PDKS_PERSONEL_EXE" })
{
    if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(key))) continue;
    var value = Environment.GetEnvironmentVariable(key, EnvironmentVariableTarget.User);
    if (!string.IsNullOrWhiteSpace(value)) Environment.SetEnvironmentVariable(key, value, EnvironmentVariableTarget.Process);
}

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
    Exec(c,tx,"insert into KIMLIK (PS,PKNO,AD,SOYAD,IGTARIH,GRUP,BOLUM,DURUM,GOREV,MAAS,KULIZIN,CCKSAY,ESDRM) values (@PS,@PK,@AD,@SOY,@G,1,1,2,1,1000,0,0,0)",
        new FbParameter("@PS",ps),new FbParameter("@PK",testPk),new FbParameter("@AD","SMOKE"),new FbParameter("@SOY","TEST"),new FbParameter("@G",new DateTime(2099,1,1)));
    Exec(c,tx,"update KIMLIK set AD='SMOKE2',ICTARIH=@D where PKNO=@PK",new FbParameter("@D",new DateTime(2099,1,31)),new FbParameter("@PK",testPk));
    var ad=Convert.ToString(Scalar(c,tx,"select AD from KIMLIK where PKNO=@PK",new FbParameter("@PK",testPk)));
    if(ad!="SMOKE2") throw new Exception("KIMLIK update doğrulanamadı");
    log.AppendLine("KIMLIK insert/update OK");

    foreach(var defTable in new[]{"GRUP","BOLUM","SERVIS","GOREV","DURUM"})
    {
        int code=Convert.ToInt32(Scalar(c,tx,$"select coalesce(max(KOD),0)+1 from {defTable}"));
        Exec(c,tx,$"insert into {defTable} (KOD,AD) values (@K,@A)",new FbParameter("@K",code),new FbParameter("@A","SMOKE"));
        Exec(c,tx,$"update {defTable} set AD='SMOKE2' where KOD=@K",new FbParameter("@K",code));
        if(Convert.ToString(Scalar(c,tx,$"select AD from {defTable} where KOD=@K",new FbParameter("@K",code)))!="SMOKE2")throw new Exception(defTable+" tanım update doğrulanamadı");
        Exec(c,tx,$"delete from {defTable} where KOD=@K",new FbParameter("@K",code));
        log.AppendLine(defTable+" definition insert/update/delete OK");
    }

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

    int avRequested=Convert.ToInt32(Scalar(c,tx,"select coalesce(max(KOD),0)+1 from AVANS"));
    Exec(c,tx,"insert into AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) values (@PK,@D,@M,@D,2,@K,@A,1,1,'SMOKE')",
        new FbParameter("@PK",testPk),new FbParameter("@D",new DateTime(2099,1,4)),new FbParameter("@M",100m),new FbParameter("@K",avRequested),new FbParameter("@A",100m));
    int av=Convert.ToInt32(Scalar(c,tx,"select first 1 KOD from AVANS where PKNO=@PK and ACIKLAMA='SMOKE' order by KOD desc",new FbParameter("@PK",testPk)));
    log.AppendLine($"AVANS trigger KOD requested={avRequested} actual={av}");
    Exec(c,tx,"update AVANS set MIKTAR=@M,TOPMIKTAR=@A,ACIKLAMA='SMOKE2' where KOD=@K and PKNO=@PK",new FbParameter("@M",125m),new FbParameter("@A",125m),new FbParameter("@K",av),new FbParameter("@PK",testPk));
    var avM=Convert.ToDecimal(Scalar(c,tx,"select MIKTAR from AVANS where KOD=@K and PKNO=@PK",new FbParameter("@K",av),new FbParameter("@PK",testPk)));
    var avT=Convert.ToDecimal(Scalar(c,tx,"select TOPMIKTAR from AVANS where KOD=@K and PKNO=@PK",new FbParameter("@K",av),new FbParameter("@PK",testPk)));
    log.AppendLine($"AVANS values after update MIKTAR={avM} TOPMIKTAR={avT}");
    if(avM!=125m||avT!=125m)throw new Exception($"AVANS update doğrulanamadı MIKTAR={avM} TOPMIKTAR={avT}");
    Exec(c,tx,"delete from AVANS where KOD=@K and PKNO=@PK",new FbParameter("@K",av),new FbParameter("@PK",testPk));
    log.AppendLine("AVANS insert/update/delete OK");

    var payA=new DateTime(2099,1,1);var payB=new DateTime(2099,1,31);
    Exec(c,tx,"insert into ODEME(PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values(@P,@A,@B,500,@D,50,@D)",
        new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB),new FbParameter("@D",new DateTime(2099,2,1)));
    Exec(c,tx,"update ODEME set NODENEN=550 where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB));
    if(Convert.ToDecimal(Scalar(c,tx,"select NODENEN from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB)))!=550m)throw new Exception("ODEME update doğrulanamadı");
    Exec(c,tx,"delete from ODEME where PKNO=@P and BASTAR=@A and BITTAR=@B",new FbParameter("@P",testPk),new FbParameter("@A",payA),new FbParameter("@B",payB));
    log.AppendLine("ODEME insert/update/delete OK");

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
using(var diag=new FbCommand("select PS,PKNO,AD,SOYAD,IGTARIH,ICTARIH,ESDRM from KIMLIK where trim(coalesce(AD,''))='' or trim(coalesce(SOYAD,''))='' or ESDRM is null order by PS desc",c))
using(var dr=diag.ExecuteReader())
{
    var suspicious=new List<string>();
    while(dr.Read()) suspicious.Add($"{dr["PS"]}|{dr["PKNO"]}|{dr["AD"]}|{dr["SOYAD"]}|{dr["IGTARIH"]}|{dr["ICTARIH"]}|{dr["ESDRM"]}");
    log.AppendLine($"DATA_SUSPICIOUS_PERSONNEL={suspicious.Count}");
    foreach(var line in suspicious.Take(30)) log.AppendLine("DATA_SUSPECT|"+line);
}
if(string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_CLEAN_INVALID"),"1",StringComparison.Ordinal))
{
    var testCards=new List<string>();
    using(var find=new FbCommand("select PKNO from KIMLIK where PKNO starting with '999' and (trim(coalesce(AD,''))='' or upper(AD) starting with 'UI TEST')",c))
    using(var fr=find.ExecuteReader()) while(fr.Read()) testCards.Add(Convert.ToString(fr[0])??"");
    foreach(var pk in testCards.Where(x=>x.Length>0))
    {
        foreach(var table in new[]{"GIRCIK","PUANTAJ","OZELIZIN","AVANS","ODEME","UCRETLER"})
        {
            try{using var dep=new FbCommand($"delete from {table} where PKNO=@P",c);dep.Parameters.Add(new FbParameter("@P",pk));dep.ExecuteNonQuery();}catch{}
        }
        using var clean=new FbCommand("delete from KIMLIK where PKNO=@P",c);clean.Parameters.Add(new FbParameter("@P",pk));clean.ExecuteNonQuery();
    }
    log.AppendLine($"DATA_CLEAN_INVALID={testCards.Count}");
}
using(var latest=new FbCommand("select first 12 PS,PKNO,AD,SOYAD,IGTARIH,ICTARIH,ESDRM from KIMLIK order by PS desc",c))
using(var lr=latest.ExecuteReader())
{
    while(lr.Read()) log.AppendLine($"DATA_LATEST|{lr["PS"]}|{lr["PKNO"]}|{lr["AD"]}|{lr["SOYAD"]}|{lr["IGTARIH"]}|{lr["ICTARIH"]}|{lr["ESDRM"]}");
}
var terminalPk=Convert.ToString(Scalar(c,null,"select first 1 PKNO from KIMLIK where PKNO is not null order by PKNO"))??throw new Exception("Terminal smoke testi için personel bulunamadı");
var terminalDate=new DateTime(2099,12,30);var terminalBefore=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",terminalDate)));
var terminalResult=new AttendanceImportService(database).Import([new(terminalPk,terminalDate.AddHours(8),"1","SMOKE",TerminalDirection.Entry,"smoke-a"),new(terminalPk,terminalDate.AddHours(8).AddMinutes(4),"1","SMOKE",TerminalDirection.Entry,"smoke-b")],5,rollbackOnly:true);
var terminalAfter=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",terminalDate)));
if(terminalResult.Inserted!=1||terminalResult.Duplicates!=1||terminalBefore!=terminalAfter)throw new Exception("Terminal tolerans rollback testi başarısız");
log.AppendLine("TERMINAL TOLERANCE ROLLBACK OK");
var autoDate=new DateTime(2099,12,29);var autoBefore=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",autoDate)));
var autoResult=new AttendanceImportService(database).Import([new(terminalPk,autoDate.AddHours(8).AddMinutes(30),"1","001",TerminalDirection.Unknown,"auto-in"),new(terminalPk,autoDate.AddHours(19),"1","001",TerminalDirection.Unknown,"auto-out")],5,rollbackOnly:true);
var autoAfter=Convert.ToInt32(Scalar(c,null,"select count(*) from GIRCIK where PKNO=@P and GTARIH=@D",new FbParameter("@P",terminalPk),new FbParameter("@D",autoDate)));
if(autoResult.Inserted!=1||autoResult.Updated!=1||autoBefore!=autoAfter)throw new Exception("Terminal otomatik giriş/çıkış eşleme rollback testi başarısız");
log.AppendLine("TERMINAL AUTO PAIR ROLLBACK OK");
var reportFrom=new DateTime(2000,1,1);var reportTo=new DateTime(2100,1,1);
ValidateQuery(c,"select a.TARIH,a.PKNO,k.AD,k.SOYAD,v.TUR,v.ISARET,a.MIKTAR,a.ACIKLAMA from AVANS a left join KIMLIK k on k.PKNO=a.PKNO left join AVTUR v on v.KOD=a.TURKOD where a.TARIH>=@A and a.TARIH<@B",new FbParameter("@A",reportFrom),new FbParameter("@B",reportTo));
ValidateQuery(c,"select o.TARIH,o.PKNO,k.AD,k.SOYAD,o.MAZERET,o.TIP,o.SURESAAT,o.BASSAAT,o.BITSAAT from OZELIZIN o left join KIMLIK k on k.PKNO=o.PKNO where o.TARIH>=@A and o.TARIH<@B",new FbParameter("@A",reportFrom),new FbParameter("@B",reportTo));
ValidateQuery(c,"select k.PKNO,k.SICILNO,k.AD,k.SOYAD,k.IGTARIH,g.AD,b.AD,s.AD,d.AD from KIMLIK k left join GRUP g on g.KOD=k.GRUP left join BOLUM b on b.KOD=k.BOLUM left join SERVIS s on s.KOD=k.SERVIS left join DURUM d on d.KOD=k.DURUM");
ValidateQuery(c,"select coalesce(g.AD,'Tanımsız'),count(*) from KIMLIK k left join GRUP g on g.KOD=k.GRUP where k.ICTARIH is null group by g.AD");
ValidateQuery(c,"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,coalesce(k.KULIZIN,0) from KIMLIK k where k.ICTARIH is null");
ValidateQuery(c,"select first 1 u.PKNO,k.AD,k.SOYAD,k.MAAS,u.GUN1,u.SAAT1,u.GUN4,u.SAAT4,u.GUN5,u.SAAT5,u.GUN6,u.SAAT6,u.GUN7,u.SAAT7,u.GUN9,u.SAAT9,u.DEVG,u.DEVS,u.GECG,u.GECS,u.EKG,u.EKS,u.ERG,u.ERS,u.EKKAZ,u.EKKES,u.NCKALAN from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO");
ValidateQuery(c,"select first 1 u.PKNO,k.AD,k.SOYAD,k.MAAS,u.SAAT2,u.UCRET2,u.SAAT3,u.UCRET3,u.SAAT8,u.UCRET8,u.FMKALAN from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO");
ValidateQuery(c,"select first 1 u.PKNO,k.AD,k.SOYAD,b.AD,k.IGTARIH,k.ICTARIH,u.DMAAS,u.GUN1,u.SAAT1,u.UCRET1,u.EX1,u.EX2,u.EX3,u.EX4,u.NCKALAN,u.FMKALAN from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO left join BOLUM b on b.KOD=k.BOLUM");
log.AppendLine("KY6 PAYROLL OUTPUT QUERIES OK");
log.AppendLine("OPERATIONAL REPORT QUERIES OK");
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

static void ValidateQuery(FbConnection c,string sql,params FbParameter[] ps)
{
    using var cmd=new FbCommand(sql,c);if(ps.Length>0)cmd.Parameters.AddRange(ps);using var reader=cmd.ExecuteReader();
}
