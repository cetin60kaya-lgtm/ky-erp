using FirebirdSql.Data.FirebirdClient;

namespace KYERP.PDKS.Core.Leave;

public sealed record LeaveRecord(string EmployeeCode,DateTime Date,string StartTime,string EndTime,int Minutes,string Type,string Reason,int PayrollArea);
public sealed record LeaveSaveResult(int Inserted,int Duplicates);

public sealed class LeaveRepository(FirebirdDatabase database)
{
    public LeaveSaveResult AddMany(IReadOnlyList<LeaveRecord> records,bool rollbackOnly=false) => database.InTransaction((connection,transaction)=>
    {
        var inserted=0;var duplicates=0;var sequence=NextSequence(connection,transaction);
        foreach(var record in records.DistinctBy(item=>(item.EmployeeCode,item.Date.Date,item.PayrollArea)))
        {
            Validate(record);
            if(Exists(connection,transaction,record.EmployeeCode,record.Date,record.PayrollArea,null)){duplicates++;continue;}
            Execute(connection,transaction,"insert into OZELIZIN (PKNO,BASSAAT,BITSAAT,SURESAAT,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) values (@PK,@BS,@BT,@SS,@SM,@EA,@D,@T,@M,@S,'0')",
                new("@PK",record.EmployeeCode),new("@BS",record.StartTime),new("@BT",record.EndTime),new("@SS",Duration(record.Minutes)),new("@SM",record.Minutes),new("@EA",record.PayrollArea),new("@D",record.Date.Date),new("@T",record.Type),new("@M",record.Reason),new("@S",sequence++));inserted++;
        }
        return new LeaveSaveResult(inserted,duplicates);
    },rollbackOnly);

    public void UpdateSingle(int sequence,LeaveRecord record,bool rollbackOnly=false) => database.InTransaction((connection,transaction)=>
    {
        Validate(record);
        if(Exists(connection,transaction,record.EmployeeCode,record.Date,record.PayrollArea,sequence))throw new InvalidOperationException("Aynı personel, tarih ve izin alanı için kayıt zaten var.");
        Execute(connection,transaction,"update OZELIZIN set TARIH=@D,BASSAAT=@BS,BITSAAT=@BT,SURESAAT=@SS,SUREDAKIKA=@SM,EBALAN=@EA,TIP=@T,MAZERET=@M where SIRA=@S and PKNO=@PK",
            new("@D",record.Date.Date),new("@BS",record.StartTime),new("@BT",record.EndTime),new("@SS",Duration(record.Minutes)),new("@SM",record.Minutes),new("@EA",record.PayrollArea),new("@T",record.Type),new("@M",record.Reason),new("@S",sequence),new("@PK",record.EmployeeCode));return 0;
    },rollbackOnly);

    static void Validate(LeaveRecord record){PdksValidation.EmployeeCode(record.EmployeeCode);LeavePayrollArea.Validate(record.PayrollArea);if(record.Minutes<=0)throw new ArgumentException("İzin süresi sıfırdan büyük olmalıdır.");}
    static bool Exists(FbConnection connection,FbTransaction transaction,string employeeCode,DateTime date,int area,int? excludedSequence)
    {
        var sql="select count(*) from OZELIZIN where PKNO=@PK and TARIH=@D and EBALAN=@EA"+(excludedSequence.HasValue?" and SIRA<>@S":"");
        using var command=FirebirdDatabase.CreateCommand(connection,transaction,sql,new("@PK",employeeCode),new("@D",date.Date),new("@EA",area));if(excludedSequence.HasValue)command.Parameters.AddWithValue("@S",excludedSequence.Value);return Convert.ToInt32(command.ExecuteScalar())>0;
    }
    static int NextSequence(FbConnection connection,FbTransaction transaction){using var command=FirebirdDatabase.CreateCommand(connection,transaction,"select coalesce(max(SIRA),0)+1 from OZELIZIN");return Convert.ToInt32(command.ExecuteScalar());}
    static int Execute(FbConnection connection,FbTransaction transaction,string sql,params FbParameter[] parameters){using var command=FirebirdDatabase.CreateCommand(connection,transaction,sql,parameters);return command.ExecuteNonQuery();}
    static string Duration(int minutes)=>$"{minutes/60:00}:{minutes%60:00}";
}
