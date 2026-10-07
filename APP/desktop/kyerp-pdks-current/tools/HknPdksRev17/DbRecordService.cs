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

internal enum DbRecordMode
{
    AddEntry,
    AddExit,
    AddBoth,
    RepairAll
}

internal sealed record DbRecordChange(string Card, string Name, DateTime Day, string Side, string ExistingTime,
    string NewTime, string Operation, int Id, string ExistingSide);

internal sealed record DbRecordSnapshot(DateTime Start, DateTime End, string[] Cards, DateTime[] Days,
    DataTable Records, DbRecordPerson[] People, string Fingerprint, DbRecordMode Mode)
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
        using var command = new FbCommand("select PKNO,AD,SOYAD from KIMLIK order by PKNO", connection, transaction)
        {
            CommandTimeout = 60
        };
        using var registration = token.Register(command.Cancel);
        using var adapter = new FbDataAdapter(command);
        var table = new DataTable();
        adapter.Fill(table);
        return table.AsEnumerable()
            .Select(row => new DbRecordPerson(
                Convert.ToString(row["PKNO"])?.Trim() ?? "",
                $"{row["AD"]} {row["SOYAD"]}".Trim()))
            .Where(person => person.Card.Length > 0)
            .Distinct()
            .ToArray();
    }

    internal static DbRecordSnapshot Read(FirebirdDatabase database, IEnumerable<string> selectedCards,
        IEnumerable<DateTime> selectedDays, CancellationToken token,
        FbConnection? existingConnection = null, FbTransaction? existingTransaction = null,
        DbRecordMode mode = DbRecordMode.RepairAll)
    {
        var cards = selectedCards.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        var days = selectedDays.Select(day => day.Date).Distinct().Order().ToArray();
        if (cards.Length == 0 || days.Length == 0 || cards.Length > 1000 || days.Length > 366 ||
            (long)cards.Length * days.Length > 200000)
            throw new InvalidOperationException("Personel ve gün seçin; bir işlem en fazla 366 gün / 1000 personel / 200.000 personel-gün olabilir.");

        using var owned = existingConnection is null ? database.OpenConnection() : null;
        var connection = existingConnection ?? owned!;
        using var ownedTransaction = existingTransaction is null
            ? connection.BeginTransaction(new FbTransactionOptions
            {
                TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.Wait
            })
            : null;
        var transaction = existingTransaction ?? ownedTransaction!;

        var selected = cards.ToHashSet(StringComparer.Ordinal);
        var people = ReadPeople(database, token, connection, transaction)
            .Where(person => selected.Contains(person.Card)).ToArray();
        if (people.Select(person => person.Card).Distinct().Count() != cards.Length || people.Length != cards.Length)
            throw new InvalidOperationException("Seçilen kart KIMLIK'te yok veya birden fazla personel ile eşleşiyor.");

        var start = days[0];
        var end = days[^1].AddDays(1);
        var cardParameters = cards.Select((_, index) => $"@P{index}").ToArray();
        using var command = new FbCommand(
            "select * from GIRCIK where PKNO in (" + string.Join(",", cardParameters) +
            ") and ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)) order by SIRA",
            connection, transaction)
        {
            CommandTimeout = 60
        };
        command.Parameters.Add(new FbParameter("@A", start));
        command.Parameters.Add(new FbParameter("@B", end));
        for (var index = 0; index < cards.Length; index++)
            command.Parameters.Add(new FbParameter(cardParameters[index], cards[index]));

        using var registration = token.Register(command.Cancel);
        using var adapter = new FbDataAdapter(command);
        var records = new DataTable();
        adapter.Fill(records);

        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new
        {
            People = people,
            Rows = records.AsEnumerable()
                .Select(row => row.ItemArray.Select(value => value == DBNull.Value ? null : value).ToArray()).ToArray()
        }))));

        var workHours = WorkTimePolicy.Read(connection, transaction, token);
        var snapshot = new DbRecordSnapshot(start, end, cards, days, records, people, fingerprint, mode)
        {
            WorkHours = workHours
        };
        snapshot = snapshot with { Changes = PlanChanges(snapshot, token) };
        ownedTransaction?.Rollback();
        return snapshot;
    }

    internal static List<DbMovement> Movements(DbRecordSnapshot snapshot) =>
        MonthlyDbAudit.Movements(snapshot.Records,
            new AuditRequest("", snapshot.Start, snapshot.End, "", new TnfFormat(), true));

    internal static bool InRange(WorkTimePolicy policy, string side, string time) =>
        MonthlyDbAudit.Clock(time, out var minute) &&
        (side == "Giriş"
            ? minute >= policy.EntryEarly && minute <= policy.EntryLate
            : side == "Çıkış" && minute >= policy.ExitEarly && minute <= policy.ExitLate);

    internal static string IntendedSide(string time, WorkTimePolicy policy) =>
        Distance(time, "Giriş", policy) <= Distance(time, "Çıkış", policy) ? "Giriş" : "Çıkış";

    internal static int ParseMinute(string time) =>
        MonthlyDbAudit.Clock(time, out var minute) ? minute : throw new InvalidOperationException("Bozuk saat.");

    internal static int Distance(string time, string side, WorkTimePolicy policy) =>
        Math.Abs(ParseMinute(time) - (side == "Giriş" ? policy.Entry : policy.Exit));

    internal static int GenerateMinute(string card, string side,
        Dictionary<(string Card, string Side), int> previous, WorkTimePolicy policy)
    {
        var minimum = side == "Giriş" ? policy.EntryEarly : policy.ExitEarly;
        var maximum = side == "Giriş" ? policy.EntryLate : policy.ExitLate;
        var minute = RandomNumberGenerator.GetInt32(minimum, maximum + 1);
        if (previous.TryGetValue((card, side), out var last) && last == minute && maximum > minimum)
            minute = minimum + (minute - minimum + 1) % (maximum - minimum + 1);
        previous[(card, side)] = minute;
        return minute;
    }

    internal static string FormatMinute(int minute) =>
        TimeSpan.FromMinutes(minute).ToString(@"hh\:mm", CultureInfo.InvariantCulture);

    internal static Task<string> ApplyAsync(FirebirdDatabase database, DbRecordSnapshot snapshot,
        CancellationToken token) =>
        ApplyChangesAsync(database, snapshot, null, token);

    internal static Task<string> ApplyAsync(FirebirdDatabase database, DbRecordSnapshot snapshot,
        string? tnfPath, CancellationToken token) =>
        ApplyChangesAsync(database, snapshot, tnfPath, token);
}
