using System.Globalization;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;

namespace KyPdks.Unified;

/// <summary>
/// Firebird write mapping smoke against an isolated gbak-restored COPY only.
/// Hard stop on production paths; every temporary write is rolled back.
/// Does not touch physical terminal RAW, annual TNF, production FDB or Cloud D1.
/// </summary>
internal static class FirebirdIsolatedCopySmoke
{
    internal static async Task<string> RunAsync(CancellationToken cancellationToken = default)
    {
        if (Environment.GetEnvironmentVariable("KY_PDKS_ISOLATED_COPY") != "1")
            throw new InvalidOperationException("COPY_SMOKE_OPT_IN_REQUIRED");
        var path = Environment.GetEnvironmentVariable("KY_PDKS_STAGE_FDB_PATH") ?? "";
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new InvalidOperationException("COPY_SMOKE_FDB_NOT_FOUND");
        var full = Path.GetFullPath(path);
        var separator = Path.DirectorySeparatorChar;
        if (!full.Contains(separator + "_TEMP" + separator + "PDKS_COPY_STAGE_",StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(Path.GetFileName(full),"KY_PDKS_STAGE.FDB",StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("COPY_SMOKE_PATH_NOT_ISOLATED");
        var live = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH") ?? "";
        if (!string.IsNullOrWhiteSpace(live) && string.Equals(
            full,Path.GetFullPath(live),StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("COPY_SMOKE_LIVE_DB_REJECTED");

        var password = Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD") ??
            Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD",EnvironmentVariableTarget.User) ?? "";
        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("COPY_SMOKE_DB_PASSWORD_REQUIRED");

        var connectionString = new FbConnectionStringBuilder
        {
            Database = full, UserID = Environment.GetEnvironmentVariable("KY_PDKS_DB_USER") ?? "SYSDBA",
            Password = password, DataSource = Environment.GetEnvironmentVariable("KY_PDKS_DB_HOST") ?? "127.0.0.1",
            Port = int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_DB_PORT"),out var port)?port:3050,
            Charset = Environment.GetEnvironmentVariable("KY_PDKS_DB_CHARSET") ?? "NONE",
            Pooling = false, Dialect = 3,
        }.ToString();
        await using var connection = new FbConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        var preGroup = await CountAsync(connection,null,"GRUP");
        var preService = await CountAsync(connection,null,"SERVIS");
        var preAdvance = await CountAsync(connection,null,"AVANS");
        var preLeave = await CountAsync(connection,null,"OZELIZIN");
        var personCard = await ScalarAsync(connection,null,
            "SELECT FIRST 1 PKNO FROM KIMLIK WHERE PKNO IS NOT NULL ORDER BY PKNO",cancellationToken);
        if (string.IsNullOrWhiteSpace(Convert.ToString(personCard,CultureInfo.InvariantCulture)))
            throw new InvalidOperationException("COPY_SMOKE_NO_EXISTING_CARD");
        var card = Convert.ToString(personCard,CultureInfo.InvariantCulture)!;
        var groupId = await NextAsync(connection,"GRUP",cancellationToken);
        var serviceId = await NextAsync(connection,"SERVIS",cancellationToken);
        var leaveId = await NextAsync(connection,"OZELIZIN",cancellationToken,"SIRA");
        var advanceId = await NextAsync(connection,"AVANS",cancellationToken);
        var batch = "PDKS_COPY_SMOKE_" + Guid.NewGuid().ToString("N");
        var steps = new List<string>();

        using var transaction = connection.BeginTransaction();
        try
        {
            await ExecAsync(connection,transaction,"INSERT INTO GRUP (KOD,AD) VALUES (@K,@A)",
                cancellationToken,new FbParameter("@K",groupId),new FbParameter("@A",batch));
            await ExecAsync(connection,transaction,"UPDATE GRUP SET AD=@A WHERE KOD=@K",
                cancellationToken,new FbParameter("@A",batch+"_UPDATED"),new FbParameter("@K",groupId));
            steps.Add("GRUP_INSERT_UPDATE");

            await ExecAsync(connection,transaction,"INSERT INTO SERVIS (KOD,AD) VALUES (@K,@A)",
                cancellationToken,new FbParameter("@K",serviceId),new FbParameter("@A",batch));
            await ExecAsync(connection,transaction,"UPDATE SERVIS SET AD=@A WHERE KOD=@K",
                cancellationToken,new FbParameter("@A",batch+"_UPDATED"),new FbParameter("@K",serviceId));
            steps.Add("SERVIS_INSERT_UPDATE");

            await ExecAsync(connection,transaction,
                "UPDATE KIMLIK SET GRUP=@G,SERVIS=@S WHERE PKNO=@P",
                cancellationToken,new FbParameter("@G",groupId),new FbParameter("@S",serviceId),new FbParameter("@P",card));
            var person = await ScalarAsync(connection,transaction,
                "SELECT GRUP FROM KIMLIK WHERE PKNO=@P",cancellationToken,new FbParameter("@P",card));
            if (Convert.ToInt32(person,CultureInfo.InvariantCulture)!=groupId)
                throw new InvalidOperationException("COPY_SMOKE_PERSON_GROUP_MISMATCH");
            steps.Add("KIMLIK_GROUP_SERVICE_ASSIGN");

            await ExecAsync(connection,transaction,
                "INSERT INTO OZELIZIN (PKNO,SURESAAT,SUREDAKIKA,EBALAN,TARIH,TIP,MAZERET,SIRA,OTOCIK) VALUES (@P,'07:30',450,4,@D,'YILLIK',@M,@S,'0')",
                cancellationToken,new FbParameter("@P",card),new FbParameter("@D",new DateTime(2099,5,3)),
                new FbParameter("@M",batch),new FbParameter("@S",leaveId));
            steps.Add("OZELIZIN_LEAVE");

            var avtur = await ScalarAsync(connection,transaction,
                "SELECT FIRST 1 TUR FROM AVTUR WHERE KOD=1 AND ISARET='-'",
                cancellationToken);
            if (avtur is null || !Convert.ToString(avtur,CultureInfo.InvariantCulture)!
                .Contains("AVANS",StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("COPY_SMOKE_ADVANCE_TURKOD_NOT_PROVEN");
            await ExecAsync(connection,transaction,
                "INSERT INTO AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD,TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) VALUES (@P,@D,250,@D,1,@K,250,1,1,@M)",
                cancellationToken,new FbParameter("@P",card),new FbParameter("@D",new DateTime(2099,5,4)),
                new FbParameter("@K",advanceId),new FbParameter("@M",batch));
            var advance = await ScalarAsync(connection,transaction,
                "SELECT FIRST 1 MIKTAR FROM AVANS WHERE PKNO=@P AND ACIKLAMA=@M",
                cancellationToken,new FbParameter("@P",card),new FbParameter("@M",batch));
            if (advance is null || Convert.ToDecimal(advance,CultureInfo.InvariantCulture)!=250m)
                throw new InvalidOperationException("COPY_SMOKE_ADVANCE_MISMATCH");
            steps.Add("AVANS_ADVANCE_CODE_1");
        }
        finally
        {
            // Even successful staging mutations are NEVER committed.
            transaction.Rollback();
        }

        var postGroup = await CountAsync(connection,null,"GRUP");
        var postService = await CountAsync(connection,null,"SERVIS");
        var postAdvance = await CountAsync(connection,null,"AVANS");
        var postLeave = await CountAsync(connection,null,"OZELIZIN");
        var residue = await ScalarAsync(connection,null,
            "SELECT COUNT(*) FROM GRUP WHERE KOD=@K",cancellationToken,new FbParameter("@K",groupId));
        if (preGroup!=postGroup || preService!=postService ||
            preAdvance!=postAdvance || preLeave!=postLeave ||
            Convert.ToInt32(residue,CultureInfo.InvariantCulture)!=0)
            throw new InvalidOperationException("COPY_SMOKE_ROLLBACK_INCOMPLETE");
        return JsonSerializer.Serialize(new
        {
            source="ISOLATED_COPY_TRANSACTION_ROLLBACK",
            database=Path.GetFileName(full),
            mappingActions=steps,
            rollbackVerified=true,
            personnelDetailsExported=false,
            liveDatabaseWritten=false,
            tnfWritten=false,
            terminalRawWritten=false,
        },new JsonSerializerOptions{WriteIndented=true});
    }

    private static async Task<int> CountAsync(FbConnection connection,FbTransaction? transaction,string table)
    {
        // Hardcoded table names only; never interpolate caller supplied SQL names.
        if (table is not ("GRUP" or "SERVIS" or "AVANS" or "OZELIZIN"))
            throw new InvalidOperationException("COPY_SMOKE_TABLE_NOT_ALLOWED");
        var value=await ScalarAsync(connection,transaction,"SELECT COUNT(*) FROM "+table);
        return Convert.ToInt32(value,CultureInfo.InvariantCulture);
    }

    private static async Task<int> NextAsync(FbConnection connection,string table,
        CancellationToken token,string column="KOD")
    {
        if (table is not ("GRUP" or "SERVIS" or "AVANS" or "OZELIZIN") ||
            column is not ("KOD" or "SIRA"))
            throw new InvalidOperationException("COPY_SMOKE_SEQUENCE_NOT_ALLOWED");
        return Convert.ToInt32(await ScalarAsync(connection,null,
            "SELECT COALESCE(MAX("+column+"),0)+1 FROM "+table,token),
            CultureInfo.InvariantCulture);
    }

    private static async Task<object?> ScalarAsync(FbConnection connection,FbTransaction? transaction,
        string sql,CancellationToken token=default,params FbParameter[] args)
    {
        await using var cmd=new FbCommand(sql,connection,transaction);
        foreach(var item in args)cmd.Parameters.Add(item);
        return await cmd.ExecuteScalarAsync(token);
    }

    private static async Task<int> ExecAsync(FbConnection connection,FbTransaction transaction,
        string sql,CancellationToken token,params FbParameter[] args)
    {
        await using var cmd=new FbCommand(sql,connection,transaction);
        foreach(var item in args)cmd.Parameters.Add(item);
        return await cmd.ExecuteNonQueryAsync(token);
    }
}
