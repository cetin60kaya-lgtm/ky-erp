using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record DbRecordPerson(string Card, string Name)
{
    public override string ToString() => $"{Card}  {Name}";
}
internal sealed record DbRecordDay(string Card, string Name, DateTime Day, string ExistingEntry, string Entry,
    string ExistingExit, string Exit, string Operation, int EntryId, int ExitId);
internal enum DbRecordMode { Normalize, AddEntry, AddExit, AddBoth, CorrectTime, RemoveDuplicates, RemoveExtra }
internal sealed record DbRecordChange(string Card, string Name, DateTime Day, string Side, string ExistingTime,
    string NewTime, string Operation, int Id, string ExistingSide);
internal sealed record DbRecordSnapshot(DateTime Start, DateTime End, string[] Cards, DateTime[] Days,
    DataTable Records, DbRecordPerson[] People, DbRecordDay[] Plan, string Fingerprint, DbRecordMode Mode = DbRecordMode.Normalize)
{
    internal DbRecordChange[] Changes { get; init; } = [];
    internal WorkTimePolicy WorkHours { get; init; } = WorkTimePolicy.Default;
}

internal static partial class DbRecordService
{
    internal static DbRecordPerson[] ReadPeople(FirebirdDatabase database, CancellationToken token,
        FbConnection? existingConnection = null, FbTransaction? transaction = null)
    {
        using var owned = existingConnection is null ? database.OpenConnection() : null;
        var connection = existingConnection ?? owned!;
        using var command = new FbCommand("select PKNO,AD,SOYAD from KIMLIK order by PKNO", connection, transaction) { CommandTimeout = 60 };
        using var registration = token.Register(command.Cancel);
        using var adapter = new FbDataAdapter(command);
        var table = new DataTable();
        adapter.Fill(table);
        return table.AsEnumerable().Select(row => new DbRecordPerson(Convert.ToString(row["PKNO"])!.Trim(),
            $"{row["AD"]} {row["SOYAD"]}".Trim())).Where(person => person.Card.Length > 0).Distinct().ToArray();
    }

    internal static DbRecordSnapshot Read(FirebirdDatabase database, IEnumerable<string> selectedCards,
        IEnumerable<DateTime> selectedDays, CancellationToken token, FbConnection? existingConnection = null, FbTransaction? existingTransaction = null,
        DbRecordMode mode = DbRecordMode.Normalize)
    {
        var cards = selectedCards.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        var days = selectedDays.Select(day => day.Date).Distinct().Order().ToArray();
        if (cards.Length == 0 || days.Length == 0 || cards.Length > 1000 || days.Length > 366 || (long)cards.Length * days.Length > 200000)
            throw new InvalidOperationException("Personel ve gün seçin; bir işlem en fazla 366 gün / 1000 personel / 200.000 personel-gün olabilir.");
        using var owned = existingConnection is null ? database.OpenConnection() : null;
        var connection = existingConnection ?? owned!;
        using var ownedTransaction = existingTransaction is null ? connection.BeginTransaction(new FbTransactionOptions {
            TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait }) : null;
        var transaction = existingTransaction ?? ownedTransaction!;
        var selected = cards.ToHashSet(StringComparer.Ordinal);
        var people = ReadPeople(database, token, connection, transaction).Where(person => selected.Contains(person.Card)).ToArray();
        if (people.Select(person => person.Card).Distinct().Count() != cards.Length || people.Length != cards.Length)
            throw new InvalidOperationException("Seçilen kart KIMLIK'te yok veya birden fazla personel ile eşleşiyor.");
        var start = days[0];
        var end = days[^1].AddDays(1);
        var cardParameters = cards.Select((_, index) => $"@P{index}").ToArray();
        using var command = new FbCommand("select * from GIRCIK where PKNO in (" + string.Join(",", cardParameters) +
            ") and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by SIRA", connection, transaction) { CommandTimeout = 60 };
        command.Parameters.Add(new FbParameter("@A", start));
        command.Parameters.Add(new FbParameter("@B", end));
        for (var index = 0; index < cards.Length; index++) command.Parameters.Add(new FbParameter(cardParameters[index], cards[index]));
        using var registration = token.Register(command.Cancel);
        using var adapter = new FbDataAdapter(command);
        var records = new DataTable();
        adapter.Fill(records);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new {
            People = people, Rows = records.AsEnumerable().Select(row => row.ItemArray.Select(value => value == DBNull.Value ? null : value)).ToArray() }))));
        var workHours = WorkTimePolicy.Read(connection, transaction, token);
        var snapshot = new DbRecordSnapshot(start, end, cards, days, records, people, [], fingerprint, mode) { WorkHours = workHours };
        snapshot = mode == DbRecordMode.Normalize ? snapshot with { Plan = Plan(snapshot, token) }
            : snapshot with { Changes = PlanChanges(snapshot, token) };
        ownedTransaction?.Rollback();
        return snapshot;
    }

    internal static List<DbMovement> Movements(DbRecordSnapshot snapshot) => MonthlyDbAudit.Movements(snapshot.Records,
        new AuditRequest("", snapshot.Start, snapshot.End, "", new()));

    internal static DbRecordDay[] Plan(DbRecordSnapshot snapshot, CancellationToken token)
    {
        var grouped = Movements(snapshot).ToLookup(move => (move.Card, move.Date));
        var names = snapshot.People.ToDictionary(person => person.Card, person => person.Name);
        var previous = new Dictionary<(string Card, string Side), int>();
        var result = new List<DbRecordDay>();
        foreach (var card in snapshot.Cards)
        foreach (var day in snapshot.Days)
        {
            token.ThrowIfCancellationRequested();
            var moves = grouped[(card, day)].OrderBy(move => move.Id).ToArray();
            if (moves.Any(move => !MonthlyDbAudit.Clock(move.Time, out _)))
                throw new InvalidOperationException($"{card} / {day:dd.MM.yyyy}: bozuk DB saati; önizleme uygulanamaz.");
            DbMovement? Keeper(string side) => moves.Where(move => IntendedSide(move.Time, snapshot.WorkHours) == side)
                .OrderByDescending(move => InRange(snapshot.WorkHours, side, move.Time))
                .ThenByDescending(move => move.Side == side).ThenBy(move => Distance(move.Time, side, snapshot.WorkHours)).ThenBy(move => move.Id).FirstOrDefault();
            var entry = Keeper("Giriş");
            var exit = Keeper("Çıkış");
            string Time(DbMovement? keeper, string side)
            {
                var minute = keeper is not null && MonthlyDbNormalization.InRange(side, keeper.Time)
                    ? ParseMinute(keeper.Time) : GenerateMinute(card, side, previous, snapshot.WorkHours);
                previous[(card, side)] = minute;
                return TimeSpan.FromMinutes(minute).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
            }
            var entryTime = Time(entry, "Giriş");
            var exitTime = Time(exit, "Çıkış");
            var actions = new List<string>();
            if (entry is null || exit is null) actions.Add("EKLENECEK");
            if (moves.Length > (entry is null ? 0 : 1) + (exit is null ? 0 : 1)) actions.Add("MÜKERRER / FAZLA SİLİNECEK");
            if (entry is not null && (entry.Side != "Giriş" || entry.Time != entryTime || entry.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)) ||
                exit is not null && (exit.Side != "Çıkış" || exit.Time != exitTime || exit.Tur.Equals("E", StringComparison.OrdinalIgnoreCase))) actions.Add("DÜZELTİLECEK");
            result.Add(new(card, names[card], day, string.Join(" / ", moves.Where(move => move.Side == "Giriş").Select(move => move.Time)), entryTime,
                string.Join(" / ", moves.Where(move => move.Side == "Çıkış").Select(move => move.Time)), exitTime,
                actions.Count == 0 ? "UYUMLU" : string.Join("; ", actions), entry?.Id ?? -1, exit?.Id ?? -1));
        }
        return result.ToArray();
    }

    internal static bool InRange(WorkTimePolicy policy, string side, string time) => MonthlyDbAudit.Clock(time, out var minute) &&
        (side == "Giriş" ? minute >= policy.EntryEarly && minute <= policy.EntryLate :
         side == "Çıkış" && minute >= policy.ExitEarly && minute <= policy.ExitLate);
    internal static string IntendedSide(string time, WorkTimePolicy policy) => Distance(time, "Giriş", policy) <= Distance(time, "Çıkış", policy) ? "Giriş" : "Çıkış";
    static int ParseMinute(string time) => MonthlyDbAudit.Clock(time, out var minute) ? minute : throw new InvalidOperationException("Bozuk saat.");
    static int Distance(string time, string side, WorkTimePolicy policy) => Math.Abs(ParseMinute(time) - (side == "Giriş" ? policy.Entry : policy.Exit));
    static int GenerateMinute(string card, string side, Dictionary<(string Card, string Side), int> previous, WorkTimePolicy policy)
    {
        var minimum = side == "Giriş" ? policy.EntryEarly : policy.ExitEarly;
        var maximum = side == "Giriş" ? policy.EntryLate : policy.ExitLate;
        var minute = RandomNumberGenerator.GetInt32(minimum, maximum + 1);
        if (previous.TryGetValue((card, side), out var last) && last == minute && maximum > minimum)
            minute = minimum + (minute - minimum + 1) % (maximum - minimum + 1);
        previous[(card, side)] = minute;
        return minute;
    }

    internal static Task<string> ApplyAsync(FirebirdDatabase database, DbRecordSnapshot snapshot, CancellationToken token) =>
        ApplyAsync(database, snapshot, null, token);

    internal static async Task<string> ApplyAsync(FirebirdDatabase database, DbRecordSnapshot snapshot, string? tnfPath, CancellationToken token)
    {
        if (snapshot.Mode != DbRecordMode.Normalize) return await ApplyChangesAsync(database, snapshot, tnfPath, token).ConfigureAwait(false);
        var cards = snapshot.Cards.ToHashSet(StringComparer.Ordinal);
        var days = snapshot.Days.ToHashSet();
        var structural = Plan(snapshot, token).ToDictionary(plan => (plan.Card, plan.Day));
        if (snapshot.Plan.Any(plan => !structural.TryGetValue((plan.Card, plan.Day), out var original) ||
            plan.EntryId != original.EntryId || plan.ExitId != original.ExitId || plan.Operation != original.Operation))
            throw new InvalidOperationException("Önizleme kayıt kimlikleri değişmiş; yeniden önizleyin.");
        if (snapshot.Plan.Length != (long)snapshot.Cards.Length * snapshot.Days.Length || snapshot.Plan.Select(plan => (plan.Card, plan.Day)).Distinct().Count() != snapshot.Plan.Length ||
            snapshot.Plan.Any(plan => !cards.Contains(plan.Card) || !days.Contains(plan.Day) ||
                !InRange(snapshot.WorkHours, "Giriş", plan.Entry) || !InRange(snapshot.WorkHours, "Çıkış", plan.Exit)))
            throw new InvalidOperationException("Önizleme planı kapsam/saat koşullarını sağlamıyor.");
        var backup = await MonthlyDbWriter.BackupAsync(database, token).ConfigureAwait(false);
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(new FbTransactionOptions {
            TransactionBehavior = FbTransactionBehavior.Write | FbTransactionBehavior.Consistency | FbTransactionBehavior.NoWait });
        try
        {
            var fresh = Read(database, snapshot.Cards, snapshot.Days, token, connection, transaction);
            if (fresh.Fingerprint != snapshot.Fingerprint || fresh.WorkHours != snapshot.WorkHours) throw new InvalidOperationException("DB/personel/çalışma saati ayarı değişti; önizlemeyi yenileyin. DB değişmedi.");
            await File.WriteAllTextAsync(backup + ".rows.json", JsonSerializer.Serialize(new {
                Before = snapshot.Records.AsEnumerable().Select(row => snapshot.Records.Columns.Cast<DataColumn>().ToDictionary(column => column.ColumnName, column => row[column] == DBNull.Value ? null : row[column])).ToArray(), snapshot.Plan }), token).ConfigureAwait(false);
            int Execute(string sql, params FbParameter[] parameters)
            {
                token.ThrowIfCancellationRequested();
                using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
                command.CommandTimeout = 60;
                using var registration = token.Register(command.Cancel);
                return command.ExecuteNonQuery();
            }
            var changed = snapshot.Plan.Where(plan => plan.Operation != "UYUMLU").ToArray();
            var keys = changed.Select(plan => (plan.Card, plan.Day)).ToHashSet();
            var before = Movements(snapshot);
            var protectedSlots = before.Where(move => !keys.Contains((move.Card, move.Date))).Select(move => (move.Id, move.Side)).ToHashSet();
            foreach (DataRow original in snapshot.Records.Rows)
            foreach (var side in new[] { (Prefix: "G", Name: "Giriş"), (Prefix: "C", Name: "Çıkış") })
            {
                var date = original[side.Prefix + "TARIH"] == DBNull.Value ? (DateTime?)null : Convert.ToDateTime(original[side.Prefix + "TARIH"]).Date;
                if ((date is not null || !string.IsNullOrWhiteSpace(Convert.ToString(original[side.Prefix + "SAAT"]))) &&
                    (date is null || !keys.Contains((Convert.ToString(original["PKNO"])!.Trim(), date.Value))))
                    protectedSlots.Add((Convert.ToInt32(original["SIRA"]), side.Name));
            }
            var removals = before.Where(move => keys.Contains((move.Card, move.Date))).ToArray();
            foreach (var move in removals)
            {
                var prefix = move.Side == "Giriş" ? "G" : "C";
                if (Execute($"update GIRCIK set {prefix}TARIH=null,{prefix}SAAT=null,{prefix}DAKIKA=null,{prefix}TUR=null where SIRA=@I and PKNO=@P and {prefix}TARIH=@D and {prefix}SAAT=@T",
                    new("@I", move.Id), new("@P", move.Card), new("@D", move.Date), new("@T", move.Time)) != 1) throw new InvalidOperationException("DB satırı tekil değil/değişti; rollback.");
            }
            using var maxCommand = new FbCommand("select coalesce(max(SIRA),0) from GIRCIK", connection, transaction);
            var nextId = Convert.ToInt32(maxCommand.ExecuteScalar()) + 1;
            var occupied = new HashSet<(int Id, string Side)>();
            foreach (var plan in changed)
            {
                var newId = -1;
                foreach (var side in new[] { "Giriş", "Çıkış" })
                {
                    var id = side == "Giriş" ? plan.EntryId : plan.ExitId;
                    if (id >= 0 && (occupied.Contains((id, side)) || protectedSlots.Contains((id, side)))) id = -1;
                    if (id < 0)
                    {
                        if (newId < 0)
                        {
                            newId = nextId++;
                            Execute("insert into GIRCIK (SIRA,PKNO,MKOD) values (@I,@P,'000')", new("@I", newId), new("@P", plan.Card));
                        }
                        id = newId;
                    }
                    occupied.Add((id, side));
                    var prefix = side == "Giriş" ? "G" : "C";
                    var time = side == "Giriş" ? plan.Entry : plan.Exit;
                    if (Execute($"update GIRCIK set {prefix}TARIH=@D,{prefix}SAAT=@T,{prefix}DAKIKA=@M,{prefix}TUR='' where SIRA=@I and PKNO=@P and {prefix}TARIH is null and ({prefix}SAAT is null or trim({prefix}SAAT)='')",
                        new("@D", plan.Day), new("@T", time), new("@M", ParseMinute(time)), new("@I", id), new("@P", plan.Card)) != 1) throw new InvalidOperationException("Hedef taraf boş değil; rollback.");
                }
            }
            foreach (var id in removals.Select(move => move.Id).Distinct()) Execute("delete from GIRCIK where SIRA=@I and GTARIH is null and CTARIH is null and (GSAAT is null or trim(GSAAT)='') and (CSAAT is null or trim(CSAAT)='')", new FbParameter("@I", id));
            var after = Read(database, snapshot.Cards, snapshot.Days, token, connection, transaction);
            Verify(snapshot, after);
            token.ThrowIfCancellationRequested();
            using var stagedTnf = string.IsNullOrWhiteSpace(tnfPath) ? null :
                DbRecordTnfCoordinator.Stage(connection, transaction, tnfPath, snapshot.Cards.SelectMany(card => snapshot.Days.Select(day => (card, day))), token);
            stagedTnf?.Publish();
            try { transaction.Commit(); }
            catch { stagedTnf?.Restore(); throw; }
            SyncEngine.Log($"REV21 db_record_committed people={snapshot.Cards.Length} days={snapshot.Days.Length} changed={changed.Length} tnf={(stagedTnf is null ? "off" : "aligned")}");
            return backup;
        }
        catch { try { transaction.Rollback(); } catch { } throw; }
    }

    internal static void Verify(DbRecordSnapshot expected, DbRecordSnapshot actual)
    {
        var groups = Movements(actual).ToLookup(move => (move.Card, move.Date));
        foreach (var plan in expected.Plan)
        {
            var moves = groups[(plan.Card, plan.Day)].ToArray();
            if (moves.Length != 2 || moves.Count(move => move.Side == "Giriş" && move.Time == plan.Entry && !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)) != 1 ||
                moves.Count(move => move.Side == "Çıkış" && move.Time == plan.Exit && !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)) != 1)
                throw new InvalidOperationException("Sonuç 1 giriş + 1 çıkış değil; tüm işlem rollback.");
        }
        var keys = expected.Plan.Select(plan => (plan.Card, plan.Day)).ToHashSet();
        static string Shape(DbMovement move) => JsonSerializer.Serialize(move);
        if (!Movements(expected).Where(move => !keys.Contains((move.Card, move.Date))).Select(Shape).Order().SequenceEqual(
            Movements(actual).Where(move => !keys.Contains((move.Card, move.Date))).Select(Shape).Order())) throw new InvalidOperationException("Seçilmeyen gün değişti; rollback.");
    }
}
