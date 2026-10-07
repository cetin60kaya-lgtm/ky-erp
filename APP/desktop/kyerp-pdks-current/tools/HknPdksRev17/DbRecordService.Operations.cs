using System.Data;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static partial class DbRecordService
{
    internal static DbRecordChange[] PlanChanges(DbRecordSnapshot snapshot, CancellationToken token)
    {
        var grouped = Movements(snapshot).ToLookup(move => (move.Card, move.Date));
        var names = snapshot.People.ToDictionary(person => person.Card, person => person.Name);
        var previous = new Dictionary<(string Card, string Side), int>();
        var changes = new List<DbRecordChange>();

        foreach (var card in snapshot.Cards)
        foreach (var day in snapshot.Days)
        {
            token.ThrowIfCancellationRequested();
            var movements = grouped[(card, day)].OrderBy(move => move.Id).ThenBy(move => move.Side).ToArray();
            if (movements.Any(move => !MonthlyDbAudit.Clock(move.Time, out _)))
                throw new InvalidOperationException($"{card} / {day:dd.MM.yyyy}: bozuk DB saati; işlem yapılmadı.");

            var normal = movements.Where(move => !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).ToArray();
            var protectedSides = movements.Where(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase))
                .Select(move => move.Side).ToHashSet(StringComparer.Ordinal);
            var name = names[card];

            void AddOnly(string side)
            {
                // Kullanıcının açık "ekle" işlemi mevcut fiziksel tarafı ve E tarafını asla ezmez.
                if (movements.Any(move => move.Side == side)) return;
                changes.Add(new(card, name, day, side, "BOŞ",
                    FormatMinute(GenerateMinute(card, side, previous, snapshot.WorkHours)),
                    "EKLE", -1, ""));
            }

            DbMovement Keeper(IEnumerable<DbMovement> candidates, string side) => candidates
                .OrderByDescending(move => InRange(snapshot.WorkHours, side, move.Time))
                .ThenByDescending(move => move.Side == side)
                .ThenBy(move => Distance(move.Time, side, snapshot.WorkHours))
                .ThenBy(move => move.Id)
                .First();

            void RepairSide(string side)
            {
                // E gerçek bir istisnadır. O fiziksel taraf kullanıcıya ait özel kayıt sayılır ve otomatik tamir dokunmaz.
                if (protectedSides.Contains(side)) return;

                var candidates = normal
                    .Where(move => IntendedSide(move.Time, snapshot.WorkHours) == side)
                    .ToArray();

                if (candidates.Length == 0)
                {
                    changes.Add(new(card, name, day, side, "BOŞ",
                        FormatMinute(GenerateMinute(card, side, previous, snapshot.WorkHours)),
                        "EKLE", -1, ""));
                    return;
                }

                var keeper = Keeper(candidates, side);
                var targetTime = InRange(snapshot.WorkHours, side, keeper.Time)
                    ? keeper.Time
                    : FormatMinute(GenerateMinute(card, side, previous, snapshot.WorkHours));

                if (keeper.Side != side || keeper.Time != targetTime)
                    changes.Add(new(card, name, day, side, keeper.Time, targetTime,
                        "DÜZELT", keeper.Id, keeper.Side));

                foreach (var extra in candidates.Where(move => move.Id != keeper.Id || move.Side != keeper.Side).OrderBy(move => move.Id).ThenBy(move => move.Side))
                    changes.Add(new(card, name, day, side, extra.Time, "-",
                        "SİL", extra.Id, extra.Side));
            }

            switch (snapshot.Mode)
            {
                case DbRecordMode.AddEntry:
                    AddOnly("Giriş");
                    break;
                case DbRecordMode.AddExit:
                    AddOnly("Çıkış");
                    break;
                case DbRecordMode.AddBoth:
                    AddOnly("Giriş");
                    AddOnly("Çıkış");
                    break;
                case DbRecordMode.RepairAll:
                    RepairSide("Giriş");
                    RepairSide("Çıkış");
                    break;
                default:
                    throw new InvalidOperationException("İşlem seçimi geçersiz.");
            }
        }

        return changes
            .OrderBy(change => change.Card)
            .ThenBy(change => change.Day)
            .ThenBy(change => change.Side == "Giriş" ? 0 : 1)
            .ThenBy(change => change.Operation == "DÜZELT" ? 0 : change.Operation == "SİL" ? 1 : 2)
            .ThenBy(change => change.Id)
            .ToArray();
    }

    internal static async Task<string> ApplyChangesAsync(FirebirdDatabase database, DbRecordSnapshot snapshot, string? tnfPath, CancellationToken token)
    {
        if (!Enum.IsDefined(snapshot.Mode) || snapshot.Changes.Length == 0)
            throw new InvalidOperationException("Önizlenecek DB işlemi bulunamadı.");
        var structural = PlanChanges(snapshot, token);
        if (snapshot.Changes.Length != structural.Length || snapshot.Changes.Where((change, index) =>
            change with { NewTime = structural[index].NewTime } != structural[index] ||
            change.Operation != "SİL" && !InRange(snapshot.WorkHours, change.Side, change.NewTime) ||
            change.Operation == "DÜZELT" && InRange(snapshot.WorkHours, change.Side, change.ExistingTime) && change.NewTime != change.ExistingTime).Any())
            throw new InvalidOperationException("Önizleme değişmiş veya saat kapsam dışında; yeniden önizleyin.");
        var backup = await MonthlyDbWriter.BackupAsync(database, token).ConfigureAwait(false);
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(new FbTransactionOptions {
            TransactionBehavior = FbTransactionBehavior.Write | FbTransactionBehavior.Consistency | FbTransactionBehavior.NoWait });
        try
        {
            var fresh = Read(database, snapshot.Cards, snapshot.Days, token, connection, transaction, snapshot.Mode);
            if (fresh.Fingerprint != snapshot.Fingerprint || fresh.WorkHours != snapshot.WorkHours) throw new InvalidOperationException("DB/personel/çalışma saati ayarı değişti; önizlemeyi yenileyin. DB değişmedi.");
            await File.WriteAllTextAsync(backup + ".rows.json", JsonSerializer.Serialize(new {
                Before = snapshot.Records.AsEnumerable().Select(row => snapshot.Records.Columns.Cast<DataColumn>()
                    .ToDictionary(column => column.ColumnName, column => row[column] == DBNull.Value ? null : row[column])).ToArray(), snapshot.Changes }), token).ConfigureAwait(false);
            int Execute(string sql, params FbParameter[] parameters)
            {
                token.ThrowIfCancellationRequested();
                using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
                command.CommandTimeout = 60;
                using var registration = token.Register(command.Cancel);
                return command.ExecuteNonQuery();
            }
            var affected = snapshot.Changes.Where(change => change.Id >= 0).ToArray();
            var removedSlots = affected.Select(change => (change.Id, change.ExistingSide)).ToHashSet();
            var protectedSlots = new HashSet<(int Id, string Side)>();
            foreach (DataRow row in snapshot.Records.Rows)
            foreach (var side in new[] { (Prefix: "G", Name: "Giriş"), (Prefix: "C", Name: "Çıkış") })
            {
                var id = Convert.ToInt32(row["SIRA"]);
                if (!removedSlots.Contains((id, side.Name)) &&
                    (row[side.Prefix + "TARIH"] != DBNull.Value || !string.IsNullOrWhiteSpace(Convert.ToString(row[side.Prefix + "SAAT"]))))
                    protectedSlots.Add((id, side.Name));
            }
            foreach (var change in affected)
            {
                var prefix = change.ExistingSide == "Giriş" ? "G" : "C";
                if (Execute($"update GIRCIK set {prefix}TARIH=null,{prefix}SAAT=null,{prefix}DAKIKA=null,{prefix}TUR=null where SIRA=@I and PKNO=@P and {prefix}TARIH=@D and {prefix}SAAT=@T",
                    new("@I", change.Id), new("@P", change.Card), new("@D", change.Day), new("@T", change.ExistingTime)) != 1)
                    throw new InvalidOperationException("DB kaydı değişti; tüm işlem geri alındı.");
            }
            using var maxCommand = new FbCommand("select coalesce(max(SIRA),0) from GIRCIK", connection, transaction);
            var nextId = Convert.ToInt32(maxCommand.ExecuteScalar()) + 1;
            var occupied = new HashSet<(int Id, string Side)>();
            foreach (var change in snapshot.Changes.Where(change => change.Operation != "SİL"))
            {
                var id = change.Id;
                if (id < 0 || protectedSlots.Contains((id, change.Side)) || !occupied.Add((id, change.Side)))
                {
                    id = nextId++;
                    Execute("insert into GIRCIK (SIRA,PKNO,MKOD) values (@I,@P,'000')", new("@I", id), new("@P", change.Card));
                    occupied.Add((id, change.Side));
                }
                var prefix = change.Side == "Giriş" ? "G" : "C";
                if (Execute($"update GIRCIK set {prefix}TARIH=@D,{prefix}SAAT=@T,{prefix}DAKIKA=@M,{prefix}TUR='' where SIRA=@I and PKNO=@P and {prefix}TARIH is null and ({prefix}SAAT is null or trim({prefix}SAAT)='')",
                    new("@D", change.Day), new("@T", change.NewTime), new("@M", ParseMinute(change.NewTime)), new("@I", id), new("@P", change.Card)) != 1)
                    throw new InvalidOperationException("Hedef DB tarafı boş değil; tüm işlem geri alındı.");
            }
            foreach (var id in affected.Select(change => change.Id).Distinct())
                Execute("delete from GIRCIK where SIRA=@I and GTARIH is null and CTARIH is null and (GSAAT is null or trim(GSAAT)='') and (CSAAT is null or trim(CSAAT)='')", new FbParameter("@I", id));
            VerifyChanges(snapshot, Read(database, snapshot.Cards, snapshot.Days, token, connection, transaction, snapshot.Mode));
            token.ThrowIfCancellationRequested();
            var tnfScope = snapshot.Changes.Select(change => (change.Card, change.Day)).Distinct().ToArray();
            using var stagedTnf = string.IsNullOrWhiteSpace(tnfPath) ? null : DbRecordTnfCoordinator.Stage(connection, transaction, tnfPath, tnfScope, token);
            stagedTnf?.Publish();
            try { transaction.Commit(); }
            catch { stagedTnf?.Restore(); throw; }
            SyncEngine.Log($"REV25 db_record_operation={snapshot.Mode} changed={snapshot.Changes.Length} tnf={(stagedTnf is null ? "off" : "aligned")}");
            return backup;
        }
        catch { try { transaction.Rollback(); } catch { } throw; }
    }

    internal static void VerifyChanges(DbRecordSnapshot expected, DbRecordSnapshot actual)
    {
        var original = Movements(expected);
        var final = Movements(actual);
        var removed = expected.Changes.Where(change => change.Id >= 0).Select(change => (change.Id, change.ExistingSide)).ToHashSet();
        static string Shape(DbMovement move) => JsonSerializer.Serialize(new { move.Card, move.Date, move.Side, move.Time, move.Tur });
        var predicted = original.Where(move => !removed.Contains((move.Id, move.Side))).Select(Shape).ToList();
        foreach (var change in expected.Changes.Where(change => change.Operation != "SİL"))
            predicted.Add(Shape(new(-1, change.Card, change.Day, change.Side, change.NewTime, "")));
        if (!predicted.Order(StringComparer.Ordinal).SequenceEqual(final.Select(Shape).Order(StringComparer.Ordinal)))
            throw new InvalidOperationException("DB sonucu yalnız önizlenen işlemlerle eşleşmiyor; tüm işlem geri alındı.");
    }
}
