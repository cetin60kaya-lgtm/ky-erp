using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal static class CompanyDatabaseBootstrap
{
    public static void Ensure()
    {
        var db = new FirebirdDatabase(PdksOptions.FromEnvironment());
        using var connection = db.OpenConnection();
        using var transaction = connection.BeginTransaction();

        var code = FindCompany(connection, transaction);
        if (code is null)
        {
            code = NextCompanyCode(connection, transaction);
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = "insert into FIRMA (KOD,AD,AKTIF) values (@K,@AD,'E')";
            insert.Parameters.Add(new FbParameter("@K", code.Value));
            insert.Parameters.Add(new FbParameter("@AD", CompanyDataPaths.CompanyName));
            insert.ExecuteNonQuery();
        }
        else
        {
            using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = "update FIRMA set AD=@AD,AKTIF='E' where KOD=@K";
            update.Parameters.Add(new FbParameter("@AD", CompanyDataPaths.CompanyName));
            update.Parameters.Add(new FbParameter("@K", code.Value));
            update.ExecuteNonQuery();
        }

        using (var people = connection.CreateCommand())
        {
            people.Transaction = transaction;
            people.CommandText = "update KIMLIK set SIRKET=@K where SIRKET is null";
            people.Parameters.Add(new FbParameter("@K", code.Value));
            people.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    static int? FindCompany(FbConnection connection, FbTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "select first 1 KOD from FIRMA where upper(trim(AD))=upper(trim(@AD)) order by KOD";
        command.Parameters.Add(new FbParameter("@AD", CompanyDataPaths.CompanyName));
        var value = command.ExecuteScalar();
        return value is null or DBNull ? null : Convert.ToInt32(value);
    }
    static int NextCompanyCode(FbConnection connection, FbTransaction transaction)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "select coalesce(max(KOD),0)+1 from FIRMA";
        return Convert.ToInt32(command.ExecuteScalar());
    }
}
