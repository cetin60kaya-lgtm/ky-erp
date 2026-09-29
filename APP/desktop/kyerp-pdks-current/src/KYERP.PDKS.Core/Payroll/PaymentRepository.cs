using FirebirdSql.Data.FirebirdClient;

namespace KYERP.PDKS.Core.Payroll;

public sealed record PaymentRecord(string EmployeeCode,DateTime PeriodStart,DateTime PeriodEnd,decimal SalaryPaid,DateTime SalaryPaidAt,decimal OvertimePaid,DateTime OvertimePaidAt);

public sealed class PaymentRepository(FirebirdDatabase database)
{
    public void Save(PaymentRecord payment,bool rollbackOnly=false)
    {
        PdksValidation.EmployeeCode(payment.EmployeeCode);PdksValidation.EmploymentDates(payment.PeriodStart,payment.PeriodEnd);
        if(payment.SalaryPaid<0||payment.OvertimePaid<0)throw new ArgumentException("Ödeme tutarı negatif olamaz.");
        database.InTransaction((connection,transaction)=>
        {
            Execute(connection,transaction,"delete from ODEME where PKNO=@PK and BASTAR=@A and BITTAR=@B",new FbParameter("@PK",payment.EmployeeCode),new FbParameter("@A",payment.PeriodStart.Date),new FbParameter("@B",payment.PeriodEnd.Date));
            Execute(connection,transaction,"insert into ODEME (PKNO,BASTAR,BITTAR,NODENEN,NOTARIH,FMODENEN,FMOTARIH) values (@PK,@A,@B,@N,@ND,@M,@MD)",new FbParameter("@PK",payment.EmployeeCode),new FbParameter("@A",payment.PeriodStart.Date),new FbParameter("@B",payment.PeriodEnd.Date),new FbParameter("@N",payment.SalaryPaid),new FbParameter("@ND",payment.SalaryPaidAt.Date),new FbParameter("@M",payment.OvertimePaid),new FbParameter("@MD",payment.OvertimePaidAt.Date));return 0;
        },rollbackOnly);
    }
    static int Execute(FbConnection connection,FbTransaction transaction,string sql,params FbParameter[] parameters){using var command=FirebirdDatabase.CreateCommand(connection,transaction,sql,parameters);return command.ExecuteNonQuery();}
}
