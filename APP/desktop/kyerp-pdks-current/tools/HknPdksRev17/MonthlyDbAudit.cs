using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed record MonthlyIssue(string Card, DateTime Day, string Kind, string Detail, bool Safe = false, int Id = -1, string Side = "", string Time = "", string NewSide = "", string NewTime = "");
internal sealed record DailySchedule(string Card, DateTime Day, string Entry, string Exit);
internal sealed record MonthlyDbSnapshot(AuditRequest Request, DataTable Records, Dictionary<string, EmploymentRule> People,
    List<DailySchedule> Schedules, HashSet<(string Card, DateTime Day)> Excluded, HashSet<string> LockedCards,
    string TriggerHash, bool WritesBlocked, List<MonthlyIssue> Issues, string Fingerprint, long Milliseconds)
{
    internal WorkTimePolicy WorkHours { get; init; } = WorkTimePolicy.Default;
    internal HashSet<(string Card, DateTime Day)> ShiftDays { get; init; } = [];
}
internal sealed record CompletionSettings(bool SelectedPerson, bool SingleSide, bool WholeDay, bool Natural)
{
    internal int Entry { get; init; } = WorkTimePolicy.Default.Entry;
    internal int Exit { get; init; } = WorkTimePolicy.Default.Exit;
    internal int EntryMin { get; init; } = WorkTimePolicy.Default.EntryEarly;
    internal int EntryMax { get; init; } = WorkTimePolicy.Default.EntryLate;
    internal int ExitMin { get; init; } = WorkTimePolicy.Default.ExitEarly;
    internal int ExitMax { get; init; } = WorkTimePolicy.Default.ExitLate;
    internal static CompletionSettings For(WorkTimePolicy policy, bool selectedPerson, bool singleSide, bool wholeDay, bool natural)
        => new(selectedPerson, singleSide, wholeDay, natural) { Entry = policy.Entry, Exit = policy.Exit, EntryMin = policy.EntryEarly, EntryMax = policy.EntryLate, ExitMin = policy.ExitEarly, ExitMax = policy.ExitLate };
}

internal static class MonthlyDbAudit
{
    internal static readonly string[] SafeKinds = ["MÜKERRER", "TARİH DIŞI", "FAZLA TARAF"];
    static string Text(DataRow row, string field) => Convert.ToString(row[field], CultureInfo.InvariantCulture)?.Trim() ?? "";
    static DateTime? Date(DataRow row, string field) => row[field] == DBNull.Value ? null : Convert.ToDateTime(row[field]).Date;
    internal static bool Clock(string text, out int minutes)
    {
        minutes = 0;
        if (!TimeSpan.TryParseExact(text, @"hh\:mm", CultureInfo.InvariantCulture, out var time)) return false;
        minutes = (int)time.TotalMinutes;
        return true;
    }
    static string Time(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";
    static string ScheduleTime(DataRow row, string field)
    {
        var value = Text(row, field);
        return int.TryParse(value, out var minutes) && minutes is >= 0 and < 1440 ? Time(minutes) : value;
    }
    internal static bool Holiday(DateTime day) => day.Year != 2026 ||
        (day.Month, day.Day) is (1, 1) or (4, 23) or (5, 1) or (5, 19) or (7, 15) or (8, 30) or (10, 28) or (10, 29) ||
        day.Month == 3 && day.Day is >= 19 and <= 22 || day.Month == 5 && day.Day is >= 26 and <= 30;

    internal static List<DbMovement> Movements(DataTable records, AuditRequest request)
    {
        var moves = new List<DbMovement>();
        foreach (DataRow row in records.Rows)
        {
            foreach (var side in new[] { (Prefix: "G", Label: "Giriş"), (Prefix: "C", Label: "Çıkış") })
            {
                var date = Date(row, side.Prefix + "TARIH");
                if (date >= request.Start && date < request.End)
                    moves.Add(new(Convert.ToInt32(row["SIRA"]), Text(row, "PKNO"), date.Value, side.Label, Text(row, side.Prefix + "SAAT"), Text(row, side.Prefix + "TUR")));
            }
        }
        return moves;
    }

    internal static MonthlyDbSnapshot Read(FirebirdDatabase database, AuditSnapshot sync, CancellationToken token, FbConnection? existingConnection = null, FbTransaction? existingTransaction = null)
    {
        var request = sync.Request;
        if (request.Start.Day != 1 || request.End != request.Start.AddMonths(1))
            throw new InvalidOperationException("DB aylık işlemleri için tek bir ay seçin.");
        var timer = Stopwatch.StartNew();
        using var ownedConnection = existingConnection is null ? database.OpenConnection() : null;
        var connection = existingConnection ?? ownedConnection!;
        using var ownedTransaction = existingTransaction is null ? connection.BeginTransaction(new FbTransactionOptions { TransactionBehavior = FbTransactionBehavior.Read | FbTransactionBehavior.Concurrency | FbTransactionBehavior.NoWait }) : null;
        var transaction = existingTransaction ?? ownedTransaction!;
        DataTable Query(string sql, bool range = true)
        {
            token.ThrowIfCancellationRequested();
            using var command = new FbCommand(sql, connection, transaction) { CommandTimeout = 60 };
            if (range) command.Parameters.AddRange([new FbParameter("@A", request.Start), new FbParameter("@B", request.End)]);
            using var registration = token.Register(command.Cancel);
            using var adapter = new FbDataAdapter(command);
            var table = new DataTable();
            adapter.Fill(table);
            return table;
        }
        var records = Query("select * from GIRCIK where (GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B) order by SIRA,PKNO");
        var peopleTable = Query("select k.PKNO,k.AD,k.SOYAD,k.GRUP,k.IGTARIH,k.ICTARIH,k.DURUM,d.AD DURUMAD from KIMLIK k left join DURUM d on d.KOD=k.DURUM where k.IGTARIH<@B and (k.ICTARIH is null or k.ICTARIH>=@A or k.ICTARIH<k.IGTARIH) order by k.PKNO");
        var people = new Dictionary<string, EmploymentRule>(sync.People);
        var groups = new Dictionary<string, string>();
        var seen = new HashSet<string>();
        foreach (DataRow row in peopleTable.Rows)
        {
            var card = Text(row, "PKNO");
            var raw = Text(row, "DURUMAD");
            var rule = new EmploymentRule(card, $"{Text(row, "AD")} {Text(row, "SOYAD")}", Date(row, "IGTARIH"), Date(row, "ICTARIH"), SyncEngine.ActiveStatus(raw), !seen.Add(card), Text(row, "DURUM"), raw);
            people[card] = people.TryGetValue(card, out var existing) && existing.Ambiguous ? rule with { Ambiguous = true } : rule;
            groups[card] = Text(row, "GRUP");
        }
        var plans = Query("select p.TARIH,p.GKOD,b.IGIRISS,b.DCIKISS from PLANA p join PUANBILGI b on b.KOD=p.MTKOD where p.TARIH>=@A and p.TARIH<@B");
        var scheduleMap = plans.AsEnumerable().GroupBy(row => (Group: Text(row, "GKOD"), Day: Date(row, "TARIH")!.Value))
            .Where(group => group.Count() == 1).ToDictionary(group => group.Key, group => group.Single());
        var schedules = new List<DailySchedule>();
        foreach (var person in groups)
            for (var day = request.Start; day < request.End; day = day.AddDays(1))
                if (scheduleMap.TryGetValue((person.Value, day), out var plan))
                    schedules.Add(new(person.Key, day, ScheduleTime(plan, "IGIRISS"), ScheduleTime(plan, "DCIKISS")));
        var excluded = new HashSet<(string Card, DateTime Day)>();
        var shiftDays = new HashSet<(string Card, DateTime Day)>();
        var exclusions = new[] {
            Query("select PKNO,TARIH from OZELIZIN where TARIH>=@A and TARIH<@B"),
            Query("select PKNO,TARIH from PERPLANTAT where TARIH>=@A and TARIH<@B"),
            Query("select PKNO,TARIH from PERPLANMES where TARIH>=@A and TARIH<@B") };
        foreach (var table in exclusions)
            foreach (DataRow row in table.Rows) excluded.Add((Text(row, "PKNO"), Date(row, "TARIH")!.Value));
        foreach (var table in exclusions.Skip(1))
            foreach (DataRow row in table.Rows) shiftDays.Add((Text(row, "PKNO"), Date(row, "TARIH")!.Value));
        var holidays = Query("select TARIH,GKOD from PLANG where TARIH>=@A and TARIH<@B and TTKOD is not null");
        foreach (DataRow row in holidays.Rows)
            foreach (var person in groups.Where(person => person.Value == Text(row, "GKOD"))) excluded.Add((person.Key, Date(row, "TARIH")!.Value));
        var overrides = Query("select PKNO,STARTDATE,ENDDATE from PERTIMESHIFT where STARTDATE<@B and (ENDDATE is null or ENDDATE>=@A)");
        foreach (DataRow row in overrides.Rows)
            for (var day = request.Start; day < request.End; day = day.AddDays(1))
                if (day >= Date(row, "STARTDATE") && (Date(row, "ENDDATE") is null || day <= Date(row, "ENDDATE")))
                {
                    excluded.Add((Text(row, "PKNO"), day));
                    shiftDays.Add((Text(row, "PKNO"), day));
                }
        var triggers = Query("select RDB$TRIGGER_NAME,RDB$RELATION_NAME,RDB$TRIGGER_INACTIVE,RDB$TRIGGER_SOURCE from RDB$TRIGGERS where coalesce(RDB$SYSTEM_FLAG,0)=0 order by RDB$TRIGGER_NAME", false);
        var locked = new HashSet<string>();
        foreach (DataRow row in triggers.Rows)
        {
            if (Convert.ToInt32(row["RDB$TRIGGER_INACTIVE"]) != 0) continue;
            var source = Text(row, "RDB$TRIGGER_SOURCE");
            if (!Text(row, "RDB$TRIGGER_NAME").Contains("KILIT", StringComparison.OrdinalIgnoreCase)) continue;
            var dates = Regex.Matches(source, @"'(?<date>\d{4}-\d{2}-\d{2})'").Select(match => DateTime.ParseExact(match.Groups["date"].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture)).ToArray();
            if (dates.Length == 0 || dates.Any(day => day >= request.Start && day < request.End))
                foreach (Match match in Regex.Matches(source, @"'(?<card>\d{5})'")) locked.Add(match.Groups["card"].Value);
        }
        var blocked = triggers.AsEnumerable().Any(row => Convert.ToInt32(row["RDB$TRIGGER_INACTIVE"]) == 0 &&
            (Text(row, "RDB$RELATION_NAME") == "GIRCIK" || Text(row, "RDB$RELATION_NAME").Length == 0));
        var moves = Movements(records, request);
        if (SyncEngine.DbFingerprint(moves, sync.People) != sync.DbHash) throw new InvalidOperationException("DB kontrol sırasında değişti; kontrolü yenileyin.");
        var workHours = WorkTimePolicy.Read(connection, transaction, token);
        var issues = Analyze(request, moves, people, schedules, excluded, locked, token, workHours, shiftDays);
        var fingerprint = Fingerprint(new[] { records, peopleTable, plans, holidays, overrides, triggers }.Concat(exclusions).ToArray()) + ":" + JsonSerializer.Serialize(workHours);
        if (ownedTransaction is not null) transaction.Rollback();
        return new(request, records, people, schedules, excluded, locked, Hash(triggers), blocked, issues, fingerprint, timer.ElapsedMilliseconds) { WorkHours = workHours, ShiftDays = shiftDays };
    }

    static string Hash(DataTable table) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(table.AsEnumerable().Select(row => row.ItemArray.Select(value => value == DBNull.Value ? null : value is DateTime date ? date.ToString("O", CultureInfo.InvariantCulture) : Convert.ToString(value, CultureInfo.InvariantCulture)).ToArray()).ToArray()))));
    static string Fingerprint(params DataTable[] tables) => string.Join(":", tables.Select(Hash));

    internal static List<MonthlyIssue> Analyze(AuditRequest request, List<DbMovement> moves, Dictionary<string, EmploymentRule> people,
        List<DailySchedule> schedules, HashSet<(string Card, DateTime Day)> excluded, HashSet<string> locked, CancellationToken token, WorkTimePolicy? workHours = null,
        HashSet<(string Card, DateTime Day)>? shiftDays = null)
    {
        var policy = workHours ?? WorkTimePolicy.Default;
        var issues = new List<MonthlyIssue>();
        var days = moves.GroupBy(move => (move.Card, move.Date)).ToDictionary(group => group.Key, group => group.ToArray());
        var scheduleMap = schedules.ToDictionary(schedule => (schedule.Card, schedule.Day));
        foreach (var group in days)
        {
            token.ThrowIfCancellationRequested();
            var person = people.GetValueOrDefault(group.Key.Card);
            var validity = person?.Evaluate(group.Key.Date) ?? ("KIMLIK YOK", false);
            var isLocked = locked.Contains(group.Key.Card);
            var normal = group.Value.Where(move => !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).ToArray();
            foreach (var move in group.Value)
            {
                if (move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)) issues.Add(new(move.Card, move.Date, "E KAYIT", "TNF kaynağı değildir; DB kaydı korunur.", Id: move.Id, Side: move.Side, Time: move.Time));
                if (validity.Item1 is not null) issues.Add(new(move.Card, move.Date, validity.Item2 ? "TARİH DIŞI" : "İNCELE", validity.Item1, validity.Item2 && !isLocked && !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase), move.Id, move.Side, move.Time));
                else if (!move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) && !Clock(move.Time, out _)) issues.Add(new(move.Card, move.Date, "İNCELE", "Teknik bozuk saat; gerçek değer üretilmez.", Id: move.Id, Side: move.Side, Time: move.Time));
            }
            if (validity.Item1 is not null) continue;
            var unique = new List<DbMovement>();
            foreach (var duplicates in normal.GroupBy(move => (move.Side, move.Time, move.Tur)))
            {
                var sorted = duplicates.OrderBy(move => move.Id).ToArray();
                unique.Add(sorted[0]);
                foreach (var duplicate in sorted.Skip(1)) issues.Add(new(duplicate.Card, duplicate.Date, "MÜKERRER", "Kart/tarih/saat/taraf/tür bire bir aynı; yalnız bu taraf temizlenir.", !isLocked, duplicate.Id, duplicate.Side, duplicate.Time));
            }
            var entries = unique.Where(move => move.Side == "Giriş").ToArray();
            var exits = unique.Where(move => move.Side == "Çıkış").ToArray();
            var plannedEntry = -1;
            var plannedExit = -1;
            var ordinary = scheduleMap.TryGetValue(group.Key, out var schedule) && Clock(schedule.Entry, out plannedEntry) && Clock(schedule.Exit, out plannedExit) && plannedEntry < plannedExit;
            var pair = entries.Length == 2 && exits.Length == 1 ? entries.SingleOrDefault(entry => entry.Id == exits[0].Id) : null;
            var extra = pair is null ? null : entries.Single(entry => entry != pair);
            var extraSafe = ordinary && shiftDays?.Contains(group.Key) != true && pair is not null && extra is not null && Clock(pair.Time, out var entryMinutes) && Clock(exits[0].Time, out var exitMinutes) && Clock(extra.Time, out var extraMinutes) &&
                entryMinutes >= policy.DayRollover && entryMinutes <= policy.EntryLate && exitMinutes >= policy.ExitEarly && exitMinutes <= policy.ExitLate && extraMinutes >= policy.ExitEarly && extraMinutes <= policy.ExitLate && extraMinutes > exitMinutes && plannedEntry == policy.Entry && plannedExit == policy.Exit;
            if (extraSafe)
            {
                issues.Add(new(extra!.Card, extra.Date, "FAZLA TARAF",
                    $"{WorkTimePolicy.Format(policy.Entry)}–{WorkTimePolicy.Format(policy.Exit)} tek günlük DB planı; tamamlanmış satırdan sonra çıkış aralığında tek fazla giriş. İkinci çıkış/çift yok.", !isLocked, extra.Id, extra.Side, extra.Time));
                entries = [pair!];
            }
            else if (entries.Length > 1 || exits.Length > 1)
                issues.Add(new(group.Key.Card, group.Key.Date, "İNCELE", "Çoklu taraf / olası iki vardiya. Gerçek çiftler otomatik silinmez."));
            if (normal.Length > 0 && entries.Length == 0 && !group.Value.Any(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)))
                issues.Add(new(group.Key.Card, group.Key.Date, "EKSİK GİRİŞ", "Yeni saat yalnız ayrı tamamlama onayıyla eklenebilir."));
            if (normal.Length > 0 && exits.Length == 0 && !group.Value.Any(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)))
                issues.Add(new(group.Key.Card, group.Key.Date, "EKSİK ÇIKIŞ", "Yeni saat yalnız ayrı tamamlama onayıyla eklenebilir."));
            if (ordinary && plannedEntry == policy.Entry && plannedExit == policy.Exit && !excluded.Contains(group.Key) && entries.Length <= 1 && exits.Length <= 1)
            {
                foreach (var entry in entries)
                    if (Clock(entry.Time, out var minute) && policy.ClassifyEntry(minute) is var kind && kind != "NORMAL")
                        issues.Add(new(entry.Card, entry.Date, kind, $"Gerçek saat korunur. Giriş aralığı {WorkTimePolicy.Format(policy.EntryEarly)}–{WorkTimePolicy.Format(policy.EntryLate)}. Kaynak: {policy.Source}." + (kind == "ERKEN GELİŞ" ? " Bilgi; hata/ceza değildir." : ""), Id: entry.Id, Side: entry.Side, Time: entry.Time));
                foreach (var exit in exits)
                    if (Clock(exit.Time, out var minute) && policy.ClassifyExit(minute) is var kind && kind != "NORMAL")
                        issues.Add(new(exit.Card, exit.Date, kind, $"Gerçek saat korunur. Çıkış aralığı {WorkTimePolicy.Format(policy.ExitEarly)}–{WorkTimePolicy.Format(policy.ExitLate)}. Kaynak: {policy.Source}.", Id: exit.Id, Side: exit.Side, Time: exit.Time));
            }
        }
        foreach (var person in people.Values)
            for (var day = request.Start; day < request.End && day <= DateTime.Today; day = day.AddDays(1))
            {
                token.ThrowIfCancellationRequested();
                if (days.ContainsKey((person.Card, day)) || person.Ambiguous || person.Hire is null || person.Evaluate(day).Reason is not null || !scheduleMap.ContainsKey((person.Card, day))) continue;
                if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || Holiday(day) || excluded.Contains((person.Card, day))) continue;
                issues.Add(new(person.Card, day, "HİÇ BASMAMIŞ", "Tam gün üretimi için açık kullanıcı onayı gerekir."));
            }
        var normalization = MonthlyDbNormalization.Plan(request, moves, people, schedules, excluded, locked, shiftDays ?? [], true, "", token);
        issues.RemoveAll(issue => normalization.NormalDays.Contains((issue.Card, issue.Day)) &&
            (issue.Kind is "MÜKERRER" or "FAZLA TARAF" or "EKSİK GİRİŞ" or "EKSİK ÇIKIŞ" or "HİÇ BASMAMIŞ" ||
             issue.Kind == "İNCELE" && issue.Detail == "Çoklu taraf / olası iki vardiya. Gerçek çiftler otomatik silinmez."));
        var presentKinds = issues.Select(issue => (issue.Card, issue.Day, issue.Kind)).ToHashSet();
        var presentOperations = issues.Select(issue => (issue.Card, issue.Day, issue.Id, issue.Side, issue.Kind)).ToHashSet();
        foreach (var operation in normalization.Operations)
        {
            if (operation.Kind == "EKLE")
            {
                var kind = !days.ContainsKey((operation.Card, operation.Day)) ? "HİÇ BASMAMIŞ" : operation.Side == "Giriş" ? "EKSİK GİRİŞ" : "EKSİK ÇIKIŞ";
                if (presentKinds.Add((operation.Card, operation.Day, kind)))
                    issues.Add(operation with { Kind = kind, Safe = false });
            }
            else if (presentOperations.Add((operation.Card, operation.Day, operation.Id, operation.Side, operation.Kind)))
                issues.Add(operation);
        }
        foreach (var card in locked) issues.Add(new(card, request.Start, "İNCELE", "Geçmiş dönem kilidi; bu kart için DB yazması engellendi."));
        return issues;
    }

    internal static MonthlyIssue[] Complete(MonthlyDbSnapshot snapshot, CompletionSettings settings, string card, CancellationToken token)
    {
        if (!settings.SingleSide && !settings.WholeDay) return [];
        var policy = snapshot.WorkHours;
        if (settings.EntryMin < policy.EntryEarly || settings.EntryMax > policy.EntryLate || settings.EntryMin > settings.EntryMax || settings.ExitMin < policy.ExitEarly || settings.ExitMax > policy.ExitLate || settings.ExitMin > settings.ExitMax ||
            settings.Entry < settings.EntryMin || settings.Entry > settings.EntryMax || settings.Exit < settings.ExitMin || settings.Exit > settings.ExitMax)
            throw new InvalidOperationException("Saatler izinli giriş/çıkış aralıklarında olmalıdır.");
        var moves = Movements(snapshot.Records, snapshot.Request).GroupBy(move => (move.Card, move.Date)).ToDictionary(group => group.Key, group => group.ToArray());
        var plans = snapshot.Schedules.ToDictionary(schedule => (schedule.Card, schedule.Day));
        var result = new List<MonthlyIssue>();
        var previous = new Dictionary<(string Card, string Side), int>();
        int NaturalMinute(string card, string side, int minimum, int maximum)
        {
            var minute = RandomNumberGenerator.GetInt32(minimum, maximum + 1);
            if (maximum > minimum && previous.TryGetValue((card, side), out var last) && minute == last)
                minute = minimum + (minute - minimum + 1) % (maximum - minimum + 1);
            previous[(card, side)] = minute;
            return minute;
        }
        foreach (var issue in snapshot.Issues.Where(issue => issue.Kind is "EKSİK GİRİŞ" or "EKSİK ÇIKIŞ" or "HİÇ BASMAMIŞ"))
        {
            token.ThrowIfCancellationRequested();
            if (settings.SelectedPerson && issue.Card != card || issue.Kind == "HİÇ BASMAMIŞ" && !settings.WholeDay || issue.Kind != "HİÇ BASMAMIŞ" && !settings.SingleSide) continue;
            var key = (issue.Card, issue.Day);
            var person = snapshot.People.GetValueOrDefault(issue.Card);
            if (snapshot.LockedCards.Contains(issue.Card) || person is null || person.Hire is null || issue.Day < person.Hire || person.Ambiguous || person.Evaluate(issue.Day).Reason is not null || issue.Day > DateTime.Today ||
                issue.Day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || Holiday(issue.Day) || snapshot.Excluded.Contains(key) || !plans.TryGetValue(key, out var schedule) ||
                !Clock(schedule.Entry, out var plannedEntry) || !Clock(schedule.Exit, out var plannedExit) || plannedEntry != policy.Entry || plannedExit != policy.Exit) continue;
            var existing = moves.GetValueOrDefault(key) ?? [];
            if (existing.Length > 1 || existing.Any(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) || !Clock(move.Time, out _))) continue;
            var entry = NaturalMinute(issue.Card, "Giriş", settings.EntryMin, settings.EntryMax);
            var exit = NaturalMinute(issue.Card, "Çıkış", settings.ExitMin, settings.ExitMax);
            if (issue.Kind == "EKSİK GİRİŞ" && Clock(existing[0].Time, out var currentExit) && entry >= currentExit || issue.Kind == "EKSİK ÇIKIŞ" && Clock(existing[0].Time, out var currentEntry) && exit <= currentEntry) continue;
            if (issue.Kind is "EKSİK GİRİŞ" or "HİÇ BASMAMIŞ") result.Add(new(issue.Card, issue.Day, "EKLE", "Kullanıcı onaylı üretilmiş eksik taraf", true, existing.FirstOrDefault()?.Id ?? -1, "Giriş", Time(entry)));
            if (issue.Kind is "EKSİK ÇIKIŞ" or "HİÇ BASMAMIŞ") result.Add(new(issue.Card, issue.Day, "EKLE", "Kullanıcı onaylı üretilmiş eksik taraf", true, existing.FirstOrDefault()?.Id ?? -1, "Çıkış", Time(exit)));
        }
        return result.ToArray();
    }

    internal static string Summary(MonthlyDbSnapshot snapshot)
    {
        var counts = snapshot.Issues.GroupBy(issue => issue.Kind).ToDictionary(group => group.Key, group => group.Count());
        return "DB | " + string.Join(" | ", new[] { "MÜKERRER", "FAZLA TARAF", "TARAF DÜZELT", "SAAT DÜZELT", "EKSİK GİRİŞ", "EKSİK ÇIKIŞ", "HİÇ BASMAMIŞ", "TARİH DIŞI", "E KAYIT", "GEÇ GİRİŞ", "ERKEN ÇIKIŞ", "ERKEN GELİŞ", "GEÇ ÇIKIŞ / mesai adayı", "İNCELE" }.Select(kind => $"{kind}: {counts.GetValueOrDefault(kind)}")) +
            $" | Güvenli: {snapshot.Issues.Count(issue => issue.Safe)}" + (snapshot.WritesBlocked ? " | DB YAZMA KİLİTLİ: GIRCIK/DB trigger" : "");
    }
}
