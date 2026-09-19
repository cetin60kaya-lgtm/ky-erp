using System.Data;
using FirebirdSql.Data.FirebirdClient;

namespace KYERP.PDKS.Core;

public sealed class FirebirdDatabase
{
    private readonly string connectionString;

    public FirebirdDatabase(PdksOptions options)
    {
        options.ValidateDatabase();
        connectionString = new FbConnectionStringBuilder
        {
            Database = options.DatabasePath,
            UserID = options.DatabaseUser,
            Password = options.RequireDatabasePassword(),
            DataSource = options.DatabaseHost,
            Port = options.DatabasePort,
            Dialect = 3,
            Charset = options.DatabaseCharset,
            Pooling = false
        }.ToString();
    }

    public FbConnection OpenConnection()
    {
        var connection = new FbConnection(connectionString);
        connection.Open();
        return connection;
    }

    public DataTable Query(string sql, params FbParameter[] parameters)
    {
        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, sql, parameters);
        using var adapter = new FbDataAdapter(command);
        var table = new DataTable();
        adapter.Fill(table);
        return table;
    }

    public object? Scalar(string sql, params FbParameter[] parameters)
    {
        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, sql, parameters);
        return command.ExecuteScalar();
    }

    public int Execute(string sql, params FbParameter[] parameters)
    {
        using var connection = OpenConnection();
        using var command = CreateCommand(connection, null, sql, parameters);
        return command.ExecuteNonQuery();
    }

    public T InRollbackTransaction<T>(Func<FbConnection, FbTransaction, T> action)
    {
        using var connection = OpenConnection();
        using var transaction = connection.BeginTransaction();
        try { return action(connection, transaction); }
        finally { transaction.Rollback(); }
    }

    public static FbCommand CreateCommand(FbConnection connection, FbTransaction? transaction, string sql, params FbParameter[] parameters)
    {
        var command = new FbCommand(sql, connection, transaction);
        if (parameters.Length > 0) command.Parameters.AddRange(parameters);
        return command;
    }
}
