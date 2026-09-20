using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core.Terminal;

namespace KYERP.PDKS.Core.Attendance;

public sealed record AttendanceImportResult(int Inserted, int Updated, int Duplicates, int Skipped);

public sealed class AttendanceImportService(FirebirdDatabase database)
{
    public AttendanceImportResult Import(IReadOnlyList<ProfiledTerminalRecord> records, int duplicateToleranceMinutes = 0, bool rollbackOnly = false) =>
        database.InTransaction((connection, transaction) =>
        {
            if(duplicateToleranceMinutes is < 0 or > 60)throw new ArgumentOutOfRangeException(nameof(duplicateToleranceMinutes),"Terminal toleransı 0-60 dakika arasında olmalıdır.");
            var inserted=0;var updated=0;var duplicates=0;var skipped=0;
            foreach(var record in records.OrderBy(item=>item.OccurredAt))
            {
                if (!EmployeeExists(connection,transaction,record.EmployeeCode)) { skipped++; continue; }
                var date=record.OccurredAt.Date;var minute=record.OccurredAt.Hour*60+record.OccurredAt.Minute;var time=record.OccurredAt.ToString("HH:mm");
                if(record.Direction==TerminalDirection.Entry)
                {
                    if(Exists(connection,transaction,"GTARIH","GDAKIKA",record.EmployeeCode,date,minute,duplicateToleranceMinutes)){duplicates++;continue;}
                    var sequence=NextSequence(connection,transaction);
                    Execute(connection,transaction,"insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values (@S,@PK,@D,@T,@M,@TYPE,@DEVICE)",
                        new FbParameter("@S",sequence),new FbParameter("@PK",record.EmployeeCode),new FbParameter("@D",date),new FbParameter("@T",time),new FbParameter("@M",minute),new FbParameter("@TYPE",record.EventCode),new FbParameter("@DEVICE",record.TerminalCode));inserted++;
                }
                else if(record.Direction==TerminalDirection.Exit)
                {
                    if(Exists(connection,transaction,"CTARIH","CDAKIKA",record.EmployeeCode,date,minute,duplicateToleranceMinutes)){duplicates++;continue;}
                    var open=Scalar(connection,transaction,"select first 1 SIRA from GIRCIK where PKNO=@PK and GTARIH<=@D and CTARIH is null order by GTARIH desc,GDAKIKA desc",new FbParameter("@PK",record.EmployeeCode),new FbParameter("@D",date));
                    if(open is null or DBNull){skipped++;continue;}
                    Execute(connection,transaction,"update GIRCIK set CTARIH=@D,CSAAT=@T,CDAKIKA=@M,CTUR=@TYPE where SIRA=@S and PKNO=@PK",
                        new FbParameter("@D",date),new FbParameter("@T",time),new FbParameter("@M",minute),new FbParameter("@TYPE",record.EventCode),new FbParameter("@S",open),new FbParameter("@PK",record.EmployeeCode));updated++;
                }
                else skipped++;
            }
            return new AttendanceImportResult(inserted,updated,duplicates,skipped);
        },rollbackOnly);

    static bool EmployeeExists(FbConnection c,FbTransaction tx,string employeeCode)=>Convert.ToInt32(Scalar(c,tx,"select count(*) from KIMLIK where PKNO=@PK",new FbParameter("@PK",employeeCode)))>0;
    static bool Exists(FbConnection c,FbTransaction tx,string dateColumn,string minuteColumn,string employeeCode,DateTime date,int minute,int tolerance)
    {
        var range=DuplicateMinuteRange(minute,tolerance);return Convert.ToInt32(Scalar(c,tx,$"select count(*) from GIRCIK where PKNO=@PK and {dateColumn}=@D and {minuteColumn} between @MIN and @MAX",new FbParameter("@PK",employeeCode),new FbParameter("@D",date),new FbParameter("@MIN",range.Min),new FbParameter("@MAX",range.Max)))>0;
    }
    public static (int Min,int Max) DuplicateMinuteRange(int minute,int tolerance)
    {
        if(minute is < 0 or >= 1440)throw new ArgumentOutOfRangeException(nameof(minute));if(tolerance is < 0 or > 60)throw new ArgumentOutOfRangeException(nameof(tolerance));return(Math.Max(0,minute-tolerance),Math.Min(1439,minute+tolerance));
    }
    static int NextSequence(FbConnection c,FbTransaction tx)=>Convert.ToInt32(Scalar(c,tx,"select coalesce(max(SIRA),0)+1 from GIRCIK"));
    static object? Scalar(FbConnection c,FbTransaction tx,string sql,params FbParameter[] parameters){using var command=FirebirdDatabase.CreateCommand(c,tx,sql,parameters);return command.ExecuteScalar();}
    static int Execute(FbConnection c,FbTransaction tx,string sql,params FbParameter[] parameters){using var command=FirebirdDatabase.CreateCommand(c,tx,sql,parameters);return command.ExecuteNonQuery();}
}
