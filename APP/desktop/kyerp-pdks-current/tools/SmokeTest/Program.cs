using FirebirdSql.Data.FirebirdClient;
using System.Text;
using KYERP.PDKS.Core;

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
