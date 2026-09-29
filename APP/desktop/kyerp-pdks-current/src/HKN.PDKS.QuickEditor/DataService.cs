using System.Data;
using FirebirdSql.Data.FirebirdClient;

namespace HKN.PDKS.QuickEditor;

public sealed class DataService
{
    public string DatabasePath { get; set; } = @"C:\Hedef500\Data\DATABASE.GDB";
    public string Password { get; set; } = "masterkey";

    FbConnection Open()
    {
        var cs = new FbConnectionStringBuilder
        {
            Database = DatabasePath,
            UserID = "SYSDBA",
            Password = Password,
            DataSource = "127.0.0.1",
            Port = 3050,
            Dialect = 3,
            Charset = "WIN1254",
            Pooling = false
        }.ToString();
        var c = new FbConnection(cs);
        c.Open();
        return c;
    }

    public DataTable Query(string sql, params FbParameter[] p)
    {
        using var c = Open();
        using var cmd = new FbCommand(sql, c);
        if (p.Length > 0) cmd.Parameters.AddRange(p);
        using var da = new FbDataAdapter(cmd);
        var dt = new DataTable();
        da.Fill(dt);
        return dt;
    }

    public DataTable Personnel(bool includePassive = true)
    {
        var where = includePassive ? "1=1" : "k.ICTARIH is null";
        return Query($@"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.MAAS,k.DURUM,k.BOLUM
                       from KIMLIK k where {where} order by k.PKNO");
    }

    public DataTable Attendance(string card, DateTime month)
    {
        var a = new DateTime(month.Year, month.Month, 1);
        var b = a.AddMonths(1);
        return Query(@"select SIRA,PKNO,GTARIH,GSAAT,GTUR,CTARIH,CSAAT,CTUR,BOLUM
                       from GIRCIK where PKNO=@P and GTARIH>=@A and GTARIH<@B order by GTARIH",
            new FbParameter("@P", card), new FbParameter("@A", a), new FbParameter("@B", b));
    }

    public DataTable Payroll(DateTime month)
    {
        var a = new DateTime(month.Year, month.Month, 1);
        var b = a.AddMonths(1).AddDays(-1);
        return Query(@"select u.PKNO,k.AD,k.SOYAD,u.BASTAR,u.BITTAR,u.DMAAS,
                       u.GUN1,u.SAAT1,u.UCRET1,u.NCGUN,u.NCSAAT,u.NCUCRET,
                       u.DEVG,u.DEVS,u.DEVU,u.EKKAZ,u.EKKES,u.NCODENEN,u.NCMAAS,u.NCKALAN
                       from UCRETLER u left join KIMLIK k on k.PKNO=u.PKNO
                       where u.BASTAR=@A and u.BITTAR=@B order by u.PKNO",
            new FbParameter("@A", a), new FbParameter("@B", b));
    }

    public void SetManualSide(string card, DateTime day, bool entry, string time)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        var sql = entry
            ? "update GIRCIK set GSAAT=@T,GTUR='E' where PKNO=@P and GTARIH=@D"
            : "update GIRCIK set CSAAT=@T,CTUR='E' where PKNO=@P and CTARIH=@D";
        using var cmd = new FbCommand(sql, c, tx);
        cmd.Parameters.Add(new FbParameter("@T", time));
        cmd.Parameters.Add(new FbParameter("@P", card));
        cmd.Parameters.Add(new FbParameter("@D", day.Date));
        var n = cmd.ExecuteNonQuery();
        if (n != 1) { tx.Rollback(); throw new InvalidOperationException($"Beklenen 1 kayıt, bulunan {n}."); }
        tx.Commit();
    }

    public void SavePayrollRow(DataRow row)
    {
        using var c = Open();
        using var tx = c.BeginTransaction();
        const string sql = @"update UCRETLER set DMAAS=@DMAAS,GUN1=@GUN1,SAAT1=@SAAT1,UCRET1=@UCRET1,
NCGUN=@NCGUN,NCSAAT=@NCSAAT,NCUCRET=@NCUCRET,DEVG=@DEVG,DEVS=@DEVS,DEVU=@DEVU,
EKKAZ=@EKKAZ,EKKES=@EKKES,NCODENEN=@NCODENEN where PKNO=@PKNO and BASTAR=@BASTAR and BITTAR=@BITTAR";
        using var cmd = new FbCommand(sql, c, tx);
        foreach (var name in new[] { "DMAAS","GUN1","SAAT1","UCRET1","NCGUN","NCSAAT","NCUCRET","DEVG","DEVS","DEVU","EKKAZ","EKKES","NCODENEN","PKNO","BASTAR","BITTAR" })
            cmd.Parameters.Add(new FbParameter("@" + name, row[name] is DBNull ? DBNull.Value : row[name]));
        var n = cmd.ExecuteNonQuery();
        if (n != 1) { tx.Rollback(); throw new InvalidOperationException($"Bordro kaydı tekil değil: {n}"); }
        tx.Commit();
    }
}
