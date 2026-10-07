using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using QuickDataTool;

internal static class PayrollOverrideTests
{
    internal static void Run(Action<bool,string> check)
    {
        var dir = Path.Combine(Path.GetTempPath(), "HKN_REV25_PAYROLL_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var dbPath = Path.Combine(dir, "PAYROLL.GDB");
        var options = PdksOptions.FromEnvironment() with
        {
            DatabasePath = dbPath,
            DatabaseUser = "SYSDBA",
            DatabasePassword = "masterkey",
            DatabaseCharset = "UTF8"
        };
        var cs = new FbConnectionStringBuilder
        {
            Database = dbPath, DataSource = options.DatabaseHost, Port = options.DatabasePort,
            UserID = options.DatabaseUser, Password = options.DatabasePassword,
            Dialect = 1, Charset = "UTF8", Pooling = false
        }.ToString();
        FbConnection.CreateDatabase(cs);
        var db = new FirebirdDatabase(options);

        foreach (var sql in new[]
        {
            "create table KIMLIK(PKNO varchar(5),AD varchar(30),SOYAD varchar(30),IGTARIH timestamp,ICTARIH timestamp,MAAS double precision)",
            @"create table UCRETLER(
                PKNO varchar(5), BASTAR timestamp, BITTAR timestamp,
                DMAAS double precision, GUN1 double precision, SAAT1 varchar(7), UCRET1 double precision,
                SAAT2 varchar(7), UCRET2 double precision, SAAT3 varchar(7), UCRET3 double precision,
                GUN4 double precision, SAAT4 varchar(7), NCGUN double precision, NCSAAT varchar(7), NCUCRET double precision,
                NCODENEN double precision, FMSAAT varchar(7), FMUCRET double precision, FMODENEN double precision, FMKALAN double precision,
                DEVS varchar(7), DEVG double precision, GECS varchar(7), EKS varchar(7), EKKAZ double precision, EKKES double precision,
                EX2 double precision, NCMAAS double precision, NCKALAN double precision)",
            "create table PUANTAJ(PKNO varchar(5),TARIH timestamp,GIRIS varchar(5),CIKIS varchar(5),STATUS varchar(30),GUN1 smallint,SAAT1 varchar(5),DAKIKA1 integer)",
            "create table AVANS(KOD integer,PKNO varchar(5),TARIH timestamp,MIKTAR double precision)",
            "create table ODEME(PKNO varchar(5),BASTAR timestamp,BITTAR timestamp,NODENEN double precision,NOTARIH timestamp,FMODENEN double precision,FMOTARIH timestamp)"
        }) db.Execute(sql);

        foreach (var card in new[] { "00002", "00003" })
        {
            db.Execute("insert into KIMLIK values(@P,'TEST','PERSONEL','2025-01-01',null,45000)", new FbParameter("@P", card));
            db.Execute(@"insert into UCRETLER(PKNO,BASTAR,BITTAR,DMAAS,GUN1,SAAT1,UCRET1,NCGUN,NCSAAT,NCUCRET,EX2,EKKES,EKKAZ,NCMAAS,NCKALAN)
                values(@P,'2026-08-01','2026-08-31',45000,10,'75:00',10000,10,'75:00',10000,123,5,7,45000,35000)",
                new FbParameter("@P", card));
        }
        db.Execute("insert into PUANTAJ values('00002','2026-08-14','08:30','19:00','N',1,'07:30',450)");

        PayrollOverrideService.EnsureSchema(db);
        check(Convert.ToInt32(db.Scalar("select count(*) from rdb$relations where rdb$relation_name='PDKS_BORDRO_OVERRIDE'")) == 1,
            "REV25 payroll override schema created");
        check(Convert.ToInt32(db.Scalar("select count(*) from rdb$relations where rdb$relation_name='PDKS_DONEM_KILIT'")) == 1,
            "REV25 period lock schema created");

        var row = PayrollOverrideService.PreferredRow(db, "00002", 2026, 8)!;
        var values = PayrollOverrideService.RowValues(row);
        values["GUN1"] = "4";
        var changed = PayrollOverrideService.SaveOverrides(db, "00002", 2026, 8, values, true, "REV25 TEST");
        check(changed.Contains("GUN1") && changed.Contains("SAAT1") && changed.Contains("NCGUN") && changed.Contains("NCSAAT"),
            "REV25 day edit persists day/hour pair as explicit override");
        check(Convert.ToDouble(db.Scalar("select GUN1 from UCRETLER where PKNO='00002'")) == 4 &&
              Convert.ToString(db.Scalar("select SAAT1 from UCRETLER where PKNO='00002'"))!.Trim() == "30:00",
            "REV25 4 workdays equals 30:00 with 7:30 daily policy");

        db.Execute("update UCRETLER set GUN1=20,SAAT1='150:00',EX2=777 where PKNO='00002'");
        check(Convert.ToDouble(db.Scalar("select GUN1 from UCRETLER where PKNO='00002'")) == 4 &&
              Convert.ToString(db.Scalar("select SAAT1 from UCRETLER where PKNO='00002'"))!.Trim() == "30:00" &&
              Convert.ToDouble(db.Scalar("select EX2 from UCRETLER where PKNO='00002'")) == 777,
            "REV25 recalculation reapplies only overridden fields and preserves unrelated recalculated values");

        PayrollOverrideService.SetPersonLock(db, "00002", 2026, 8, true, "REV25 TEST");

        var lockedRow = PayrollOverrideService.PreferredRow(db, "00002", 2026, 8)!;
        var lockedValues = PayrollOverrideService.RowValues(lockedRow);
        lockedValues["GUN1"] = "5";
        PayrollOverrideService.SaveOverrides(db, "00002", 2026, 8, lockedValues, true, "REV25 LOCKED EDIT");
        check(Convert.ToDouble(db.Scalar("select GUN1 from UCRETLER where PKNO='00002'")) == 5 &&
              Convert.ToString(db.Scalar("select SAAT1 from UCRETLER where PKNO='00002'"))!.Trim() == "37:30",
            "REV25 explicit user edit can update a locked person through connection-scoped bypass");

        using (var bypassConnection = db.OpenConnection())
        using (var bypassTx = bypassConnection.BeginTransaction())
        {
            using var bypass = FirebirdDatabase.CreateCommand(bypassConnection, bypassTx,
                "insert into PDKS_BYPASS(CONNECTION_ID) values(CURRENT_CONNECTION)");
            bypass.ExecuteNonQuery();
            bypassTx.Commit();
        }
        db.Execute("update UCRETLER set GUN1=30,SAAT1='225:00',EX2=888 where PKNO='00002'");
        check(Convert.ToDouble(db.Scalar("select GUN1 from UCRETLER where PKNO='00002'")) == 5 &&
              Convert.ToDouble(db.Scalar("select EX2 from UCRETLER where PKNO='00002'")) == 777,
            "REV25 person lock freezes UCRETLER even when another connection left a bypass row");
        db.Execute("delete from PDKS_BYPASS");

        db.Execute("update UCRETLER set GUN1=22 where PKNO='00003'");
        check(Convert.ToDouble(db.Scalar("select GUN1 from UCRETLER where PKNO='00003'")) == 22,
            "REV25 another person remains recalculable while one person is locked");

        var reopened = new FirebirdDatabase(options);
        PayrollOverrideService.EnsureSchema(reopened);
        check(PayrollOverrideService.IsPersonLocked(reopened, "00002", 2026, 8),
            "REV25 person lock persists after reconnect");

        PayrollOverrideService.SetPeriodLock(reopened, 2026, 8, true, "REV25 TEST");
        reopened.Execute("update UCRETLER set GUN1=1 where PKNO='00003'");
        reopened.Execute("update PUANTAJ set STATUS='CHANGED' where PKNO='00002' and TARIH='2026-08-14'");
        check(Convert.ToDouble(reopened.Scalar("select GUN1 from UCRETLER where PKNO='00003'")) == 22 &&
              Convert.ToString(reopened.Scalar("select STATUS from PUANTAJ where PKNO='00002'"))!.Trim() == "N",
            "REV25 period lock freezes both UCRETLER and PUANTAJ updates");

        PayrollOverrideService.SetPeriodLock(reopened, 2026, 8, false, "REV25 TEST");
        PayrollOverrideService.SetPersonLock(reopened, "00002", 2026, 8, false, "REV25 TEST");
        PayrollOverrideService.ClearOverrides(reopened, "00002", 2026, 8);
        reopened.Execute("update UCRETLER set GUN1=25,SAAT1='187:30' where PKNO='00002'");
        check(Convert.ToDouble(reopened.Scalar("select GUN1 from UCRETLER where PKNO='00002'")) == 25,
            "REV25 unlock plus override clear returns payroll to normal recalculation");

        reopened.Execute(@"insert into UCRETLER(PKNO,BASTAR,BITTAR,DMAAS,GUN1,SAAT1,UCRET1,NCGUN,NCSAAT,NCUCRET)
            values('00002','2026-08-01','2026-09-30',45000,14,'105:00',14000,14,'105:00',14000)");
        check(PayrollOverrideService.Status(reopened, "00002", 2026, 8).HasOverlap,
            "REV25 overlapping payroll periods are detected");
        var cleaned = PayrollOverrideService.CleanSafeOverlap(reopened, "00002", 2026, 8);
        check(cleaned == 1 && PayrollOverrideService.GetOverlaps(reopened, "00002", 2026, 8).Rows.Count == 1,
            "REV25 safe overlap cleanup keeps the exact monthly row");
    }
}
