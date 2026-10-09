using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;

namespace KyPdks.Unified;

/// <summary>
/// Exercise durable Firebird transaction idempotency and Cloud-master->legacy-key
/// mapping on a gbak-restored disposable COPY. Never part of Agent apply routing.
/// Creates two KY_PDKS_AGENT_* tables in the isolated copy, not production.
/// </summary>
internal static class FirebirdIsolatedLedgerSmoke
{
    internal static async Task<string> RunAsync(CancellationToken cancellationToken = default)
    {
        if (Environment.GetEnvironmentVariable("KY_PDKS_ISOLATED_COPY") != "1")
            throw new InvalidOperationException("STAGE_LEDGER_OPT_IN_REQUIRED");
        var path = Environment.GetEnvironmentVariable("KY_PDKS_STAGE_FDB_PATH") ?? "";
        var stageCard = Environment.GetEnvironmentVariable("KY_PDKS_STAGE_CARD_NO") ?? "";
        var full = Path.GetFullPath(path);
        if (!System.Text.RegularExpressions.Regex.IsMatch(full,
                @"^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase |
                System.Text.RegularExpressions.RegexOptions.CultureInvariant) ||
            !File.Exists(full) ||
            (File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidOperationException("STAGE_LEDGER_PATH_NOT_ISOLATED");
        if (stageCard.Length != 5 || stageCard.Any(ch => ch is < '0' or > '9'))
            throw new InvalidOperationException("STAGE_LEDGER_CARD_REQUIRED");
        var live = Environment.GetEnvironmentVariable("KY_PDKS_DB_PATH") ?? "";
        if (live.Length > 0 && Path.GetFullPath(live).Equals(full, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("STAGE_LEDGER_LIVE_FDB_REJECTED");
        var password = Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD") ??
            Environment.GetEnvironmentVariable("KY_PDKS_DB_PASSWORD",
                EnvironmentVariableTarget.User) ?? "";
        if (password.Length == 0)
            throw new InvalidOperationException("STAGE_LEDGER_PASSWORD_REQUIRED");

        var builder = new FbConnectionStringBuilder
        {
            Database = full,
            UserID = Environment.GetEnvironmentVariable("KY_PDKS_DB_USER") ?? "SYSDBA",
            Password = password,
            DataSource = Environment.GetEnvironmentVariable("KY_PDKS_DB_HOST") ?? "127.0.0.1",
            Port = int.TryParse(Environment.GetEnvironmentVariable("KY_PDKS_DB_PORT"), out var port) ? port : 3050,
            Charset = Environment.GetEnvironmentVariable("KY_PDKS_DB_CHARSET") ?? "NONE",
            Dialect = 3, Pooling = false,
        };
        await using var connection = new FbConnection(builder.ToString());
        await connection.OpenAsync(cancellationToken);
        await EnsureStageTablesAsync(connection, cancellationToken);
        var cardExists = Convert.ToInt32(await ScalarAsync(connection, null,
            "SELECT COUNT(*) FROM KIMLIK WHERE PKNO=@P", cancellationToken,
            new FbParameter("@P", stageCard)), CultureInfo.InvariantCulture);
        if (cardExists != 1) throw new InvalidOperationException("STAGE_LEDGER_CARD_NOT_IN_COPY");

        var originalService = await ScalarAsync(connection, null,
            "SELECT SERVIS FROM KIMLIK WHERE PKNO=@P", cancellationToken,
            new FbParameter("@P", stageCard));
        var oldValue = originalService is null or DBNull ? DBNull.Value : originalService;
        var unique = Guid.NewGuid().ToString("N");
        var tenant = "COPY-" + unique[..12];
        var serviceCmd = "svc-" + unique;
        var assignCmd = "asg-" + unique;
        var advanceCmd = "adv-" + unique;
        var advanceNote = "KY" + unique[..8].ToUpperInvariant();
        var serviceName = "KY" + unique[..8].ToUpperInvariant();
        var serviceHash = Hash("service|" + serviceCmd + "|" + serviceName);
        var assignHash = Hash("assign-service|" + assignCmd + "|" + stageCard + "|" + serviceCmd);
        var advanceHash = Hash("advance|" + advanceCmd + "|" + stageCard + "|250.00|2099-05-04");
        var serviceKey = -1;
        var advanceKey = -1;
        var assignmentCommitted = false;
        try
        {
            serviceKey = await ApplyServiceAsync(connection, tenant, serviceCmd,
                serviceHash, serviceName, cancellationToken);
            var replayKey = await ApplyServiceAsync(connection, tenant, serviceCmd,
                serviceHash, serviceName, cancellationToken);
            if (replayKey != serviceKey)
                throw new InvalidOperationException("STAGE_SERVICE_NOT_IDEMPOTENT");
            try
            {
                await ApplyServiceAsync(connection, tenant, serviceCmd,
                    Hash("different-request"), serviceName, cancellationToken);
                throw new InvalidOperationException("STAGE_CHANGED_HASH_NOT_REJECTED");
            }
            catch (InvalidOperationException error)
                when (error.Message == "STAGE_LEDGER_COMMAND_CONFLICT") { }

            var first = await ApplyAssignmentAsync(connection, tenant, assignCmd,
                assignHash, serviceCmd, stageCard, cancellationToken);
            assignmentCommitted = true;
            var replay = await ApplyAssignmentAsync(connection, tenant, assignCmd,
                assignHash, serviceCmd, stageCard, cancellationToken);
            if (first != serviceKey || replay != first)
                throw new InvalidOperationException("STAGE_ASSIGNMENT_NOT_IDEMPOTENT");
            var assigned = await ScalarAsync(connection, null,
                "SELECT SERVIS FROM KIMLIK WHERE PKNO=@P", cancellationToken,
                new FbParameter("@P", stageCard));
            if (Convert.ToInt32(assigned, CultureInfo.InvariantCulture) != serviceKey)
                throw new InvalidOperationException("STAGE_SERVICE_ASSIGNMENT_NOT_COMMITTED");
            advanceKey = await ApplyAdvanceAsync(connection, tenant, advanceCmd,
                advanceHash, stageCard, advanceNote, cancellationToken);
            var advanceReplay = await ApplyAdvanceAsync(connection, tenant, advanceCmd,
                advanceHash, stageCard, advanceNote, cancellationToken);
            if (advanceKey != advanceReplay)
                throw new InvalidOperationException("STAGE_ADVANCE_NOT_IDEMPOTENT");
            var amount = await ScalarAsync(connection, null,
                "SELECT MIKTAR FROM AVANS WHERE KOD=@K AND PKNO=@P AND ACIKLAMA=@M",
                cancellationToken, new FbParameter("@K", advanceKey),
                new FbParameter("@P", stageCard), new FbParameter("@M", advanceNote));
            if (amount is null or DBNull ||
                Convert.ToDecimal(amount, CultureInfo.InvariantCulture) != 250m)
                throw new InvalidOperationException("STAGE_ADVANCE_AMOUNT_MISMATCH");
            var ledgerCount = Convert.ToInt32(await ScalarAsync(connection, null,
                "SELECT COUNT(*) FROM KY_PDKS_AGENT_LEDGER WHERE COMPANY_ID=@C",
                cancellationToken, new FbParameter("@C", tenant)), CultureInfo.InvariantCulture);
            if (ledgerCount != 3)
                throw new InvalidOperationException("STAGE_LEDGER_DUPLICATE_COMMIT");
        }
        finally
        {
            // Always restore the copied employee and remove every synthetic
            // service and ledger row; no persistent employee/test service change.
            using var transaction = connection.BeginTransaction();
            try
            {
                if (assignmentCommitted)
                    await ExecAsync(connection, transaction,
                        "UPDATE KIMLIK SET SERVIS=@S WHERE PKNO=@P", cancellationToken,
                        new FbParameter("@S", oldValue), new FbParameter("@P", stageCard));
                if (advanceKey >= 0)
                    await ExecAsync(connection, transaction,
                        "DELETE FROM AVANS WHERE KOD=@K AND PKNO=@P AND ACIKLAMA=@M",
                        cancellationToken,new FbParameter("@K",advanceKey),
                        new FbParameter("@P",stageCard),new FbParameter("@M",advanceNote));
                await ExecAsync(connection, transaction,
                    "DELETE FROM KY_PDKS_AGENT_LEDGER WHERE COMPANY_ID=@C",
                    cancellationToken, new FbParameter("@C", tenant));
                await ExecAsync(connection, transaction,
                    "DELETE FROM KY_PDKS_AGENT_MAP WHERE COMPANY_ID=@C",
                    cancellationToken, new FbParameter("@C", tenant));
                if (serviceKey >= 0)
                    await ExecAsync(connection, transaction,
                        "DELETE FROM SERVIS WHERE KOD=@K AND AD=@N", cancellationToken,
                        new FbParameter("@K", serviceKey), new FbParameter("@N", serviceName));
                transaction.Commit();
            }
            catch
            {
                transaction.Rollback();
                throw new InvalidOperationException("STAGE_LEDGER_CLEANUP_FAILED");
            }
        }

        var leftover = Convert.ToInt32(await ScalarAsync(connection, null,
            "SELECT COUNT(*) FROM KY_PDKS_AGENT_LEDGER WHERE COMPANY_ID=@C",
            cancellationToken, new FbParameter("@C", tenant)), CultureInfo.InvariantCulture);
        var serviceResidue = Convert.ToInt32(await ScalarAsync(connection, null,
            "SELECT COUNT(*) FROM SERVIS WHERE KOD=@K AND AD=@N",
            cancellationToken, new FbParameter("@K", serviceKey),
            new FbParameter("@N", serviceName)), CultureInfo.InvariantCulture);
        var advanceResidue = Convert.ToInt32(await ScalarAsync(connection, null,
            "SELECT COUNT(*) FROM AVANS WHERE KOD=@K AND PKNO=@P AND ACIKLAMA=@M",
            cancellationToken, new FbParameter("@K", advanceKey),
            new FbParameter("@P", stageCard), new FbParameter("@M", advanceNote)),
            CultureInfo.InvariantCulture);
        var restored = await ScalarAsync(connection, null,
            "SELECT SERVIS FROM KIMLIK WHERE PKNO=@P",
            cancellationToken, new FbParameter("@P", stageCard));
        if (leftover != 0 || serviceResidue != 0 || advanceResidue != 0 ||
            !Equals(restored is null or DBNull ? DBNull.Value : restored, oldValue))
            throw new InvalidOperationException("STAGE_LEDGER_RESIDUE_DETECTED");
        return JsonSerializer.Serialize(new
        {
            source = "ISOLATED_COPY_DURABLE_LEDGER",
            operations = new[] { "SERVICE_TRANSACTION", "ASSIGN_SERVICE_TRANSACTION",
                "ADVANCE_CODE1_TRANSACTION" },
            durableCommitReplayVerified = true,
            payloadHashConflictRejected = true,
            syntheticRowsCleaned = true,
            copiedPersonRestored = true,
            stageLedgerSchemaOnly = true,
            productionFirebirdWritten = false,
            annualTnfWritten = false,
            terminalWritten = false,
        }, new JsonSerializerOptions { WriteIndented = true });
    }

    private static async Task<int> ApplyServiceAsync(
        FbConnection c, string company, string command, string hash,
        string name, CancellationToken token)
    {
        using var tx = c.BeginTransaction();
        var existing = await GetReceiptAsync(c, tx, company, command, "service", hash, token);
        if (existing.HasValue) { tx.Commit(); return existing.Value; }
        var next = Convert.ToInt32(await ScalarAsync(c, tx,
            "SELECT COALESCE(MAX(KOD),0)+1 FROM SERVIS", token),
            CultureInfo.InvariantCulture);
        await ExecAsync(c, tx, "INSERT INTO SERVIS(KOD,AD) VALUES(@K,@N)", token,
            new FbParameter("@K", next), new FbParameter("@N", name));
        await ExecAsync(c, tx,
            "INSERT INTO KY_PDKS_AGENT_MAP(COMPANY_ID,CLOUD_ID,LEGACY_KEY) VALUES(@C,@I,@K)",
            token, new FbParameter("@C", company), new FbParameter("@I", command),
            new FbParameter("@K", next));
        await InsertLedgerAsync(c, tx, company, command, "service", hash, next, token);
        tx.Commit();
        return next;
    }

    private static async Task<int> ApplyAssignmentAsync(
        FbConnection c, string company, string command, string hash,
        string cloudServiceId, string card, CancellationToken token)
    {
        using var tx = c.BeginTransaction();
        var existing = await GetReceiptAsync(c, tx, company, command,
            "assign-service", hash, token);
        if (existing.HasValue) { tx.Commit(); return existing.Value; }
        var mapped = await ScalarAsync(c, tx,
            "SELECT LEGACY_KEY FROM KY_PDKS_AGENT_MAP WHERE COMPANY_ID=@C AND CLOUD_ID=@I",
            token, new FbParameter("@C", company), new FbParameter("@I", cloudServiceId));
        if (mapped is null or DBNull)
            throw new InvalidOperationException("STAGE_CLOUD_SERVICE_KEY_NOT_MAPPED");
        var key = Convert.ToInt32(mapped, CultureInfo.InvariantCulture);
        var count = await ExecAsync(c, tx, "UPDATE KIMLIK SET SERVIS=@S WHERE PKNO=@P",
            token, new FbParameter("@S", key), new FbParameter("@P", card));
        if (count != 1)
            throw new InvalidOperationException("STAGE_KIMLIK_ASSIGNMENT_NOT_UNIQUE");
        await InsertLedgerAsync(c, tx, company, command, "assign-service", hash, key, token);
        tx.Commit();
        return key;
    }

    private static async Task<int> ApplyAdvanceAsync(
        FbConnection c, string company, string command, string hash,
        string card, string note, CancellationToken token)
    {
        using var tx = c.BeginTransaction();
        var existing = await GetReceiptAsync(c, tx, company, command, "advance", hash, token);
        if (existing.HasValue) { tx.Commit(); return existing.Value; }
        // Legacy code 1 alone is proved as an actual AVANS deduction.
        // Do not infer a generic Cloud deduction code from any other AVTUR.
        var type = await ScalarAsync(c, tx,
            "SELECT TUR FROM AVTUR WHERE KOD=1 AND ISARET='-'", token);
        if (type is null or DBNull ||
            !Convert.ToString(type, CultureInfo.InvariantCulture)!
                .Contains("AVANS", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("STAGE_AVANS_CODE_NOT_PROVEN");
        var next = Convert.ToInt32(await ScalarAsync(c, tx,
            "SELECT COALESCE(MAX(KOD),0)+1 FROM AVANS", token),
            CultureInfo.InvariantCulture);
        var date = new DateTime(2099, 5, 4);
        var count = await ExecAsync(c, tx,
            "INSERT INTO AVANS (PKNO,TARIH,MIKTAR,VTARIH,TURKOD,KOD," +
            "TOPMIKTAR,TAKSITSAYISI,TAKSITNO,ACIKLAMA) " +
            "VALUES (@P,@D,@AM,@V,1,@K,@TOTAL,1,1,@M)", token,
            new FbParameter("@P", card), new FbParameter("@D", date),
            new FbParameter("@AM", 250m), new FbParameter("@V", date),
            new FbParameter("@K", next), new FbParameter("@TOTAL", 250m),
            new FbParameter("@M", note));
        if (count != 1) throw new InvalidOperationException("STAGE_AVANS_INSERT_NOT_UNIQUE");
        await InsertLedgerAsync(c, tx, company, command, "advance", hash, next, token);
        tx.Commit();
        return next;
    }

    private static async Task<int?> GetReceiptAsync(FbConnection c, FbTransaction tx,
        string company, string command, string action, string hash, CancellationToken token)
    {
        await using var read = new FbCommand(
            "SELECT ACTION_NAME,PAYLOAD_HASH,LEGACY_KEY FROM KY_PDKS_AGENT_LEDGER " +
            "WHERE COMPANY_ID=@C AND COMMAND_ID=@I", c, tx);
        read.Parameters.AddWithValue("@C", company);
        read.Parameters.AddWithValue("@I", command);
        await using var reader = await read.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        if (!string.Equals(reader["ACTION_NAME"].ToString()?.Trim(), action,
                StringComparison.Ordinal) ||
            !string.Equals(reader["PAYLOAD_HASH"].ToString()?.Trim(), hash,
                StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("STAGE_LEDGER_COMMAND_CONFLICT");
        return Convert.ToInt32(reader["LEGACY_KEY"], CultureInfo.InvariantCulture);
    }

    private static Task<int> InsertLedgerAsync(FbConnection c, FbTransaction tx,
        string company, string command, string action, string hash, int key,
        CancellationToken token) =>
        ExecAsync(c, tx,
            "INSERT INTO KY_PDKS_AGENT_LEDGER " +
            "(COMPANY_ID,COMMAND_ID,ACTION_NAME,PAYLOAD_HASH,LEGACY_KEY,APPLIED_AT) " +
            "VALUES(@C,@I,@A,@H,@K,CURRENT_TIMESTAMP)", token,
            new FbParameter("@C", company), new FbParameter("@I", command),
            new FbParameter("@A", action), new FbParameter("@H", hash),
            new FbParameter("@K", key));

    private static async Task EnsureStageTablesAsync(FbConnection c, CancellationToken token)
    {
        foreach (var table in new[]
        {
            (Name:"KY_PDKS_AGENT_LEDGER",
             Sql:"CREATE TABLE KY_PDKS_AGENT_LEDGER (" +
                 "COMPANY_ID VARCHAR(100) NOT NULL,COMMAND_ID VARCHAR(100) NOT NULL," +
                 "ACTION_NAME VARCHAR(32) NOT NULL,PAYLOAD_HASH CHAR(64) NOT NULL," +
                 "LEGACY_KEY INTEGER NOT NULL,APPLIED_AT TIMESTAMP NOT NULL," +
                 "CONSTRAINT PK_KY_PDKS_AGENT_LEDGER PRIMARY KEY(COMPANY_ID,COMMAND_ID))"),
            (Name:"KY_PDKS_AGENT_MAP",
             Sql:"CREATE TABLE KY_PDKS_AGENT_MAP (" +
                 "COMPANY_ID VARCHAR(100) NOT NULL,CLOUD_ID VARCHAR(100) NOT NULL," +
                 "LEGACY_KEY INTEGER NOT NULL," +
                 "CONSTRAINT PK_KY_PDKS_AGENT_MAP PRIMARY KEY(COMPANY_ID,CLOUD_ID))"),
        })
        {
            var count = Convert.ToInt32(await ScalarAsync(c, null,
                "SELECT COUNT(*) FROM RDB$RELATIONS WHERE TRIM(RDB$RELATION_NAME)=@T",
                token, new FbParameter("@T", table.Name)), CultureInfo.InvariantCulture);
            if (count != 0) continue;
            await ExecAsync(c, null, table.Sql, token);
        }
    }

    private static async Task<object?> ScalarAsync(
        FbConnection c, FbTransaction? tx, string sql, CancellationToken token,
        params FbParameter[] parameters)
    {
        await using var command = new FbCommand(sql, c, tx);
        foreach (var p in parameters) command.Parameters.Add(p);
        return await command.ExecuteScalarAsync(token);
    }

    private static async Task<int> ExecAsync(
        FbConnection c, FbTransaction? tx, string sql, CancellationToken token,
        params FbParameter[] parameters)
    {
        await using var command = new FbCommand(sql, c, tx);
        foreach (var p in parameters) command.Parameters.Add(p);
        return await command.ExecuteNonQueryAsync(token);
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
