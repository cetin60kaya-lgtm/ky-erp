using System.Globalization;
using System.Security.Cryptography;

namespace QuickDataTool;

internal sealed record MonthlyNormalizationPlan(MonthlyIssue[] Operations, HashSet<(string Card, DateTime Day)> NormalDays);

internal static class MonthlyDbNormalization
{
    internal const int EntryMin = 495;
    internal const int EntryMax = 525;
    internal const int ExitMin = 1110;
    internal const int ExitMax = 1170;
    internal const string Information = "Normalleştirme: 08:15–08:45 / 18:30–19:30 | Kaynak: ortak çalışma kuralı | Normal gün: 1 giriş + 1 çıkış";
    internal static bool IsReplacement(MonthlyIssue operation) => operation.Kind is "SAAT DÜZELT" or "TARAF DÜZELT";
    internal static bool InRange(string side, string time) => MonthlyDbAudit.Clock(time, out var minute) &&
        (side == "Giriş" ? minute >= EntryMin && minute <= EntryMax : side == "Çıkış" && minute >= ExitMin && minute <= ExitMax);
    static string IntendedSide(DbMovement movement)
    {
        MonthlyDbAudit.Clock(movement.Time, out var minute);
        return Math.Abs(minute - 510) <= Math.Abs(minute - 1140) ? "Giriş" : "Çıkış";
    }
    static string Clock(string side, bool natural, string card, Dictionary<(string Card, string Side), int> previous)
    {
        var minimum = side == "Giriş" ? EntryMin : ExitMin;
        var maximum = side == "Giriş" ? EntryMax : ExitMax;
        var minute = side == "Giriş" ? 510 : 1140;
        if (natural)
        {
            minute = RandomNumberGenerator.GetInt32(minimum, maximum + 1);
            if (previous.TryGetValue((card, side), out var last) && minute == last)
                minute = minimum + (minute - minimum + RandomNumberGenerator.GetInt32(1, maximum - minimum + 1)) % (maximum - minimum + 1);
        }
        previous[(card, side)] = minute;
        return TimeSpan.FromMinutes(minute).ToString(@"hh\:mm", CultureInfo.InvariantCulture);
    }

    internal static MonthlyNormalizationPlan Plan(MonthlyDbSnapshot snapshot, bool natural, string card, CancellationToken token)
        => Plan(snapshot.Request, MonthlyDbAudit.Movements(snapshot.Records, snapshot.Request), snapshot.People, snapshot.Schedules,
            snapshot.Excluded, snapshot.LockedCards, snapshot.ShiftDays, natural, card, token);

    internal static MonthlyNormalizationPlan Plan(AuditRequest request, List<DbMovement> moves, Dictionary<string, EmploymentRule> people,
        List<DailySchedule> schedules, HashSet<(string Card, DateTime Day)> excluded, HashSet<string> locked,
        HashSet<(string Card, DateTime Day)> shiftDays, bool natural, string card, CancellationToken token)
    {
        var operations = new List<MonthlyIssue>();
        var normalDays = new HashSet<(string Card, DateTime Day)>();
        var days = moves.GroupBy(move => (move.Card, move.Date)).ToDictionary(group => group.Key, group => group.OrderBy(move => move.Id).ToArray());
        var plans = schedules.GroupBy(schedule => (schedule.Card, schedule.Day)).Where(group => group.Count() == 1).ToDictionary(group => group.Key, group => group.Single());
        var keys = days.Keys.Concat(plans.Keys).Distinct().OrderBy(key => key.Card, StringComparer.Ordinal).ThenBy(key => key.Item2);
        var previous = new Dictionary<(string Card, string Side), int>();
        foreach (var key in keys)
        {
            token.ThrowIfCancellationRequested();
            var day = key.Item2;
            if (card.Length > 0 && key.Card != card || locked.Contains(key.Card) || day < request.Start || day >= request.End || day > DateTime.Today) continue;
            var existing = days.GetValueOrDefault(key) ?? [];
            var person = people.GetValueOrDefault(key.Card);
            var validity = person?.Evaluate(day) ?? ("KIMLIK YOK", false);
            if (validity.Item1 is not null)
            {
                if (validity.Item2)
                    operations.AddRange(existing.Where(move => !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).Select(move =>
                        new MonthlyIssue(move.Card, move.Date, "TARİH DIŞI", validity.Item1, true, move.Id, move.Side, move.Time)));
                continue;
            }
            if (existing.Any(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) || !MonthlyDbAudit.Clock(move.Time, out _) || move.Side is not ("Giriş" or "Çıkış"))) continue;
            var unique = existing.GroupBy(move => (move.Side, move.Time)).Select(group => group.First()).ToArray();
            foreach (var duplicate in existing.Except(unique))
                operations.Add(new(duplicate.Card, day, "MÜKERRER", "Kart/tarih/taraf/saat aynı; ilk SIRA korunur.", true, duplicate.Id, duplicate.Side, duplicate.Time));
            var planned = plans.TryGetValue(key, out var schedule) && MonthlyDbAudit.Clock(schedule.Entry, out var entry) && entry == 510 &&
                MonthlyDbAudit.Clock(schedule.Exit, out var exit) && exit == 1140 && !shiftDays.Contains(key);
            if (!planned) continue;
            if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || MonthlyDbAudit.Holiday(day)) continue;
            var canGenerate = person?.Hire is not null && day >= person.Hire && day.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday) &&
                !MonthlyDbAudit.Holiday(day) && !excluded.Contains(key);
            if (!canGenerate && !(unique.Any(move => move.Side == "Giriş" && InRange("Giriş", move.Time)) && unique.Any(move => move.Side == "Çıkış" && InRange("Çıkış", move.Time)))) continue;
            var retained = new List<(DbMovement Movement, string Side)>();
            foreach (var side in new[] { "Giriş", "Çıkış" })
            {
                var candidates = unique.Where(move => IntendedSide(move) == side)
                    .OrderByDescending(move => InRange(side, move.Time)).ThenByDescending(move => move.Side == side)
                    .ThenBy(move => { MonthlyDbAudit.Clock(move.Time, out var minute); return Math.Abs(minute - (side == "Giriş" ? 510 : 1140)); }).ThenBy(move => move.Id).ToArray();
                if (candidates.Length == 0)
                {
                    if (canGenerate) operations.Add(new(key.Card, day, "EKLE", "Onaylı normal iş gününün eksik tarafı.", true, -1, side, Clock(side, natural, key.Card, previous)));
                    continue;
                }
                var keeper = candidates[0];
                retained.Add((keeper, side));
                var time = keeper.Time;
                if (!InRange(side, time))
                {
                    if (!canGenerate) continue;
                    time = Clock(side, natural, key.Card, previous);
                }
                else if (MonthlyDbAudit.Clock(time, out var retainedMinute)) previous[(key.Card, side)] = retainedMinute;
                if (keeper.Side != side || keeper.Time != time)
                    operations.Add(new(key.Card, day, keeper.Side != side ? "TARAF DÜZELT" : "SAAT DÜZELT",
                        $"{keeper.Side} {keeper.Time} → {side} {time}; normal gün tek çift kuralı.", true, keeper.Id, keeper.Side, keeper.Time, side, time));
            }
            foreach (var extra in unique.Where(move => !retained.Any(kept => kept.Movement == move)))
                operations.Add(new(key.Card, day, "FAZLA TARAF", "Normal günün en uygun tek giriş/çıkışı korunur; diğer taraf silinir.", true, extra.Id, extra.Side, extra.Time));
            normalDays.Add(key);
        }
        return new(operations.ToArray(), normalDays);
    }

    internal static List<DbMovement> Project(List<DbMovement> source, MonthlyIssue[] operations)
    {
        var removed = operations.Where(operation => operation.Kind != "EKLE").Select(operation => (operation.Id, operation.Card, operation.Day, operation.Side)).ToHashSet();
        var result = source.Where(move => !removed.Contains((move.Id, move.Card, move.Date, move.Side))).ToList();
        var originalTypes = source.ToDictionary(move => (move.Id, move.Card, move.Date, move.Side), move => move.Tur);
        var nextId = source.Select(move => move.Id).DefaultIfEmpty(0).Max() + 1;
        var newIds = new Dictionary<(string Card, DateTime Day), int>();
        foreach (var operation in operations.Where(operation => operation.Kind == "EKLE" || IsReplacement(operation)))
        {
            var side = IsReplacement(operation) ? operation.NewSide : operation.Side;
            var time = IsReplacement(operation) ? operation.NewTime : operation.Time;
            var id = operation.Id;
            if (IsReplacement(operation) && operation.NewSide != operation.Side || id < 0)
            {
                if (!newIds.TryGetValue((operation.Card, operation.Day), out id)) newIds.Add((operation.Card, operation.Day), id = nextId++);
            }
            var type = IsReplacement(operation) ? originalTypes[(operation.Id, operation.Card, operation.Day, operation.Side)] : "";
            result.Add(new(id, operation.Card, operation.Day, side, time, type));
        }
        return result;
    }

    internal static void Validate(MonthlyDbSnapshot snapshot, MonthlyIssue[] operations)
    {
        var expected = Plan(snapshot, false, "", CancellationToken.None);
        var touched = operations.Select(operation => (operation.Card, operation.Day)).ToHashSet();
        var permitted = expected.Operations.Where(operation => touched.Contains((operation.Card, operation.Day))).ToArray();
        static object Shape(MonthlyIssue operation) => (operation.Card, operation.Day, operation.Kind, operation.Id, operation.Side,
            operation.Kind == "EKLE" ? "" : operation.Time, operation.NewSide);
        if (operations.Length == 0 || operations.Length != permitted.Length || operations.Any(operation => !operation.Safe) ||
            operations.Select(Shape).Distinct().Count() != operations.Length || !operations.Select(Shape).ToHashSet().SetEquals(permitted.Select(Shape)))
            throw new InvalidOperationException("Normal gün planı eksik/değişmiş veya güvenli değil; DB değiştirilmedi.");
        foreach (var operation in operations)
        {
            if (operation.Kind == "EKLE" && !InRange(operation.Side, operation.Time)) throw new InvalidOperationException("Yeni saat normal gün aralığında değil.");
            if (!IsReplacement(operation)) continue;
            if (!InRange(operation.NewSide, operation.NewTime) || InRange(operation.NewSide, operation.Time) && operation.NewTime != operation.Time)
                throw new InvalidOperationException("Taraf/saat dönüşümü onaylı normal gün kuralıyla eşleşmiyor.");
        }
        VerifyResult(snapshot, operations, Project(MonthlyDbAudit.Movements(snapshot.Records, snapshot.Request), operations));
    }

    internal static void VerifyResult(MonthlyDbSnapshot snapshot, MonthlyIssue[] operations, List<DbMovement> actual)
    {
        static object Identity(DbMovement movement) => (movement.Card, movement.Date, movement.Side, movement.Time, movement.Tur);
        var projected = Project(MonthlyDbAudit.Movements(snapshot.Records, snapshot.Request), operations);
        var expectedCounts = projected.GroupBy(Identity).ToDictionary(group => group.Key, group => group.Count());
        var actualCounts = actual.GroupBy(Identity).ToDictionary(group => group.Key, group => group.Count());
        if (expectedCounts.Count != actualCounts.Count || expectedCounts.Any(pair => actualCounts.GetValueOrDefault(pair.Key) != pair.Value))
            throw new InvalidOperationException("DB sonucu onaylı planla eşleşmiyor; transaction geri alınacak.");
        var normal = Plan(snapshot, false, "", CancellationToken.None).NormalDays;
        var touched = operations.Select(operation => (operation.Card, operation.Day)).ToHashSet();
        var days = actual.GroupBy(move => (move.Card, move.Date)).ToDictionary(group => group.Key, group => group.ToArray());
        foreach (var key in touched.Where(normal.Contains))
        {
            var result = days.GetValueOrDefault(key) ?? [];
            if (result.Length != 2 || result.Count(move => move.Side == "Giriş") != 1 || result.Count(move => move.Side == "Çıkış") != 1 || result.Any(move => !InRange(move.Side, move.Time)))
                throw new InvalidOperationException("Normal gün tek giriş/tek çıkış doğrulanamadı; transaction geri alınacak.");
        }
    }
}
