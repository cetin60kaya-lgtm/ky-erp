using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal enum AttendancePlanMode
{
    FullRepair,
    ConvertToE
}

internal enum AttendancePlanSide
{
    Entry,
    Exit
}

internal sealed record AttendancePlanItem(
    string Card,
    string Name,
    DateTime Day,
    AttendancePlanSide Side,
    string Action,
    int? RowSira,
    DateTime? CurrentAt,
    string CurrentType,
    DateTime PlannedAt,
    string PlannedType,
    bool RemoveOnly = false)
{
    public string SideText => Side == AttendancePlanSide.Entry ? "Sabah / Giriş" : "Akşam / Çıkış";
    public string CurrentText => CurrentAt?.ToString("HH:mm") ?? "—";
    public string PlannedText => RemoveOnly ? "SİL" : PlannedAt.ToString("HH:mm");
    public string TnfText => PlannedType.Equals("E", StringComparison.OrdinalIgnoreCase)
        ? "TNF boş • E uyumlu"
        : "DB + TNF";
}

internal sealed record AttendancePlanPreview(
    AttendancePlanMode Mode,
    DateTime From,
    DateTime To,
    IReadOnlyList<AttendancePlanItem> Items,
    IReadOnlyList<string> Warnings,
    bool CanApply)
{
    public int ChangedCount => Items.Count;
}

internal sealed record AttendancePlanApplyResult(
    int Changed,
    int AffectedDays,
    string Message);

internal static class AttendancePlanService
{
    public static AttendancePlanPreview BuildFullRepair(
        FirebirdDatabase db,
        IEnumerable<string> selectedCards,
        DateTime from,
        DateTime to)
    {
        NormalizeRange(ref from, ref to);
        var cards = NormalizeCards(selectedCards);
        if (cards.Length == 0)
            return new(AttendancePlanMode.FullRepair, from, to, [], ["En az bir personel seçin."], false);

        var employees = LoadEmployees(db, cards, from, to);
        var rows = LoadMovements(db, cards, from, to);
        var exclusions = LoadExcludedDays(db, cards, from, to);
        var result = new List<AttendancePlanItem>();
        var warnings = new List<string>();

        foreach (var employee in employees.OrderBy(x => x.Card))
        {
            var start = employee.Hire.HasValue && employee.Hire.Value.Date > from ? employee.Hire.Value.Date : from;
            var end = employee.Exit.HasValue && employee.Exit.Value.Date < to ? employee.Exit.Value.Date : to;
            if (end < start) continue;

            for (var day = start; day <= end; day = day.AddDays(1))
            {
                if (!IsWorkday(day) || exclusions.Contains((employee.Card, day.Date))) continue;
                var dayRows = rows.Where(r => r.Card == employee.Card &&
                    ((r.EntryAt.HasValue && r.EntryAt.Value.Date == day.Date) ||
                     (r.ExitAt.HasValue && r.ExitAt.Value.Date == day.Date))).ToArray();

                var effectiveRows = NormalizeWrongSides(result, employee, day, dayRows);
                BuildNormalSide(result, employee, day, effectiveRows, AttendancePlanSide.Entry);
                BuildNormalSide(result, employee, day, effectiveRows, AttendancePlanSide.Exit);
            }
        }

        if (result.Count == 0)
            warnings.Add("Seçili aralıkta düzeltilecek normal kayıt bulunamadı.");

        return new(
            AttendancePlanMode.FullRepair,
            from,
            to,
            SortPlan(result),
            warnings,
            true);
    }

    public static AttendancePlanPreview BuildEPlan(
        FirebirdDatabase db,
        IReadOnlyDictionary<string, int> targetECounts,
        DateTime from,
        DateTime to)
    {
        NormalizeRange(ref from, ref to);
        var cards = NormalizeCards(targetECounts.Where(x => x.Value > 0).Select(x => x.Key));
        if (cards.Length == 0)
            return new(AttendancePlanMode.ConvertToE, from, to, [], ["Hedef E adedi girilmiş en az bir personel seçin."], false);

        var employees = LoadEmployees(db, cards, from, to).ToDictionary(x => x.Card, StringComparer.OrdinalIgnoreCase);
        var rows = LoadMovements(db, cards, from, to);
        var exclusions = LoadExcludedDays(db, cards, from, to);
        var result = new List<AttendancePlanItem>();
        var warnings = new List<string>();
        var canApply = true;

        foreach (var card in cards)
        {
            if (!employees.TryGetValue(card, out var employee)) continue;
            var target = Math.Max(0, targetECounts.TryGetValue(card, out var t) ? t : 0);
            var currentE = CountCurrentE(rows, card, from, to);
            var needed = Math.Max(0, target - currentE);
            if (needed == 0) continue;

            var candidates = BuildECandidates(employee, rows, exclusions, from, to);
            if (candidates.Count < needed)
            {
                warnings.Add($"{card} {employee.Name}: hedef {target}, mevcut E {currentE}, uygun normal hareket {candidates.Count}; {needed - candidates.Count} eksik.");
                canApply = false;
                continue;
            }

            var selected = SelectDistributedCandidates(card, candidates, needed);
            result.AddRange(selected.Select(x => new AttendancePlanItem(
                employee.Card,
                employee.Name,
                x.At.Date,
                x.Side,
                "E'YE DÖNÜŞTÜR",
                x.Sira,
                x.At,
                "",
                x.At,
                "E")));
        }

        if (result.Count == 0 && warnings.Count == 0)
            warnings.Add("Seçili hedeflere göre oluşturulacak yeni E kaydı yok.");

        return new(
            AttendancePlanMode.ConvertToE,
            from,
            to,
            SortPlan(result),
            warnings,
            canApply);
    }

    public static AttendancePlanApplyResult Apply(
        FirebirdDatabase db,
        AttendancePlanPreview preview)
    {
        if (!preview.CanApply)
            throw new InvalidOperationException("Önizlemede eksik/uygunsuz kayıt var. Uygulama yapılmadı.");
        if (preview.Items.Count == 0)
            return new(0, 0, "Uygulanacak değişiklik yok.");

        var cards = preview.Items.Select(x => x.Card).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var affected = preview.Items.Select(x => (x.Card, x.Day.Date)).Distinct().ToArray();
        var snapshot = SnapshotRows(db, cards, preview.From, preview.To);
        var audit = new List<string>();

        try
        {
            db.InTransaction((connection, transaction) =>
            {
                foreach (var item in preview.Items)
                {
                    if (preview.Mode == AttendancePlanMode.ConvertToE)
                    {
                        ApplyE(connection, transaction, item);
                    }
                    else
                    {
                        ApplyFullRepair(connection, transaction, item);
                    }

                    audit.Add($"{item.Card};{item.Day:yyyy-MM-dd};{item.SideText};{item.Action};{item.CurrentText};{item.PlannedText};{item.PlannedType}");
                }

                CleanupEmptyRows(connection, transaction, cards, preview.From, preview.To);
                return 0;
            });

            OperationalTnfSyncService.AlignPersonDays(db, affected);
            WriteAudit(preview.Mode, audit);

            var auditResult = OperationalTnfSyncService.AuditRange(db, preview.From, preview.To);
            if (!auditResult.ExactMatch)
                throw new InvalidOperationException("DATA/TNF doğrulaması başarısız: " + auditResult.Message);

            var modeText = preview.Mode == AttendancePlanMode.ConvertToE
                ? "E dönüşümü"
                : "Tam düzeltme / normal kayıt oluşturma";
            return new(
                preview.Items.Count,
                affected.Length,
                $"{modeText}: {preview.Items.Count} değişiklik uygulandı • {affected.Length} kişi-gün doğrulandı • DATA/TNF uyumlu.");
        }
        catch
        {
            RestoreSnapshot(db, cards, preview.From, preview.To, snapshot);
            try { OperationalTnfSyncService.AlignPersonDays(db, affected); } catch { }
            throw;
        }
    }

    public static IReadOnlyList<(string Card, string Name, int CurrentE)> LoadEligibleEmployees(
        FirebirdDatabase db,
        DateTime from,
        DateTime to)
    {
        NormalizeRange(ref from, ref to);
        var table = db.Query(@"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.GRUP,coalesce(g.AD,'') GRUP_AD
            from KIMLIK k left join GRUP g on g.KOD=k.GRUP
            where (k.IGTARIH is null or k.IGTARIH<=@B) and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by k.PKNO",
            new FbParameter("@A", from),
            new FbParameter("@B", to.AddDays(1)));

        var groupPolicies = AttendanceGroupPolicyStore.Load(db);
        var cards = table.AsEnumerable()
            .Where(r => AttendanceGroupPolicyStore.RequiresCardTracking(
                groupPolicies,
                r["GRUP"] == DBNull.Value ? -1 : Convert.ToInt32(r["GRUP"]),
                Convert.ToString(r["GRUP_AD"])?.Trim() ?? ""))
            .Select(r => (Card: (Convert.ToString(r["PKNO"]) ?? "").Trim().PadLeft(5, '0'),
                Name: $"{Convert.ToString(r["AD"])?.Trim()} {Convert.ToString(r["SOYAD"])?.Trim()}".Trim()))
            .Where(x => x.Card.Length > 0)
            .ToArray();

        if (cards.Length == 0) return [];
        var rows = LoadMovements(db, cards.Select(x => x.Card).ToArray(), from, to);
        return cards.Select(x => (x.Card, x.Name, CountCurrentE(rows, x.Card, from, to))).ToArray();
    }

    static IReadOnlyList<MovementRow> NormalizeWrongSides(
        List<AttendancePlanItem> plan,
        Employee employee,
        DateTime day,
        IReadOnlyList<MovementRow> source)
    {
        var rows = source.ToList();
        var normal = rows.Where(r => !IsE(r.EntryType) && !IsE(r.ExitType)).ToArray();
        var properEntries = normal.Where(r => r.EntryAt.HasValue && r.EntryAt.Value.Date == day.Date && r.EntryAt.Value.TimeOfDay < TimeSpan.FromHours(12)).ToArray();
        var properExits = normal.Where(r => r.ExitAt.HasValue && r.ExitAt.Value.Date == day.Date && r.ExitAt.Value.TimeOfDay >= TimeSpan.FromHours(12)).ToArray();

        if (properExits.Length == 0)
        {
            var wrong = normal.Where(r => r.EntryAt.HasValue && r.EntryAt.Value.Date == day.Date && r.EntryAt.Value.TimeOfDay >= TimeSpan.FromHours(12))
                .OrderByDescending(r => r.EntryAt)
                .FirstOrDefault();
            if (wrong is not null && wrong.EntryAt.HasValue)
            {
                var at = wrong.EntryAt.Value;
                var target = InRange(at.TimeOfDay, AttendanceTolerancePolicy.ExitEarliest, AttendanceTolerancePolicy.ExitLatest)
                    ? at
                    : day.Date.AddMinutes(StableMinute(employee.Card, day, AttendancePlanSide.Exit, AttendanceTolerancePolicy.ExitEarliest, AttendanceTolerancePolicy.ExitLatest));
                plan.Add(new(employee.Card, employee.Name, day, AttendancePlanSide.Exit, "TERS TARAFI DÜZELT",
                    wrong.Sira, at, "MOVE_ENTRY_TO_EXIT", target, ""));
                ReplaceRow(rows, wrong with { EntryAt = null, EntryType = "", ExitAt = target, ExitType = "" });
            }
        }

        normal = rows.Where(r => !IsE(r.EntryType) && !IsE(r.ExitType)).ToArray();
        properEntries = normal.Where(r => r.EntryAt.HasValue && r.EntryAt.Value.Date == day.Date && r.EntryAt.Value.TimeOfDay < TimeSpan.FromHours(12)).ToArray();
        if (properEntries.Length == 0)
        {
            var wrong = normal.Where(r => r.ExitAt.HasValue && r.ExitAt.Value.Date == day.Date && r.ExitAt.Value.TimeOfDay < TimeSpan.FromHours(12))
                .OrderBy(r => r.ExitAt)
                .FirstOrDefault();
            if (wrong is not null && wrong.ExitAt.HasValue)
            {
                var at = wrong.ExitAt.Value;
                var target = InRange(at.TimeOfDay, AttendanceTolerancePolicy.EntryEarliest, AttendanceTolerancePolicy.EntryLatest)
                    ? at
                    : day.Date.AddMinutes(StableMinute(employee.Card, day, AttendancePlanSide.Entry, AttendanceTolerancePolicy.EntryEarliest, AttendanceTolerancePolicy.EntryLatest));
                plan.Add(new(employee.Card, employee.Name, day, AttendancePlanSide.Entry, "TERS TARAFI DÜZELT",
                    wrong.Sira, at, "MOVE_EXIT_TO_ENTRY", target, ""));
                ReplaceRow(rows, wrong with { EntryAt = target, EntryType = "", ExitAt = null, ExitType = "" });
            }
        }

        return rows;
    }

    static void ReplaceRow(List<MovementRow> rows, MovementRow replacement)
    {
        var index = rows.FindIndex(x => x.Sira == replacement.Sira);
        if (index >= 0) rows[index] = replacement;
    }

    static bool InRange(TimeSpan value, TimeSpan from, TimeSpan to) => value >= from && value <= to;

    static void BuildNormalSide(
        List<AttendancePlanItem> plan,
        Employee employee,
        DateTime day,
        IReadOnlyList<MovementRow> rows,
        AttendancePlanSide side)
    {
        var eRows = rows.Where(r => SideMatchesDay(r, side, day) && IsE(SideType(r, side))).ToArray();
        if (eRows.Length > 0) return; // E kullanıcı kararıdır; otomatik tam düzeltme dokunmaz.

        var normal = rows.Where(r => SideMatchesDay(r, side, day) && !IsE(SideType(r, side)))
            .OrderBy(r => SideAt(r, side))
            .ToArray();

        MovementRow? primary = null;
        if (normal.Length > 0)
            primary = side == AttendancePlanSide.Entry ? normal.First() : normal.Last();

        foreach (var extra in normal.Where(x => primary is null || x.Sira != primary.Sira))
        {
            var at = SideAt(extra, side);
            if (!at.HasValue) continue;
            plan.Add(new(
                employee.Card,
                employee.Name,
                day,
                side,
                "MÜKERRERİ TEMİZLE",
                extra.Sira,
                at,
                SideType(extra, side),
                at.Value,
                "",
                true));
        }

        var range = side == AttendancePlanSide.Entry
            ? (AttendanceTolerancePolicy.EntryEarliest, AttendanceTolerancePolicy.EntryLatest)
            : (AttendanceTolerancePolicy.ExitEarliest, AttendanceTolerancePolicy.ExitLatest);
        var planned = day.Date.AddMinutes(StableMinute(employee.Card, day, side, range.Item1, range.Item2));

        if (primary is null)
        {
            plan.Add(new(
                employee.Card,
                employee.Name,
                day,
                side,
                side == AttendancePlanSide.Entry ? "GİRİŞ OLUŞTUR" : "ÇIKIŞ OLUŞTUR",
                null,
                null,
                "",
                planned,
                ""));
            return;
        }

        var current = SideAt(primary, side);
        if (!current.HasValue) return;
        var tod = current.Value.TimeOfDay;
        if (tod < range.Item1 || tod > range.Item2)
        {
            plan.Add(new(
                employee.Card,
                employee.Name,
                day,
                side,
                side == AttendancePlanSide.Entry ? "GİRİŞİ DOĞALLAŞTIR" : "ÇIKIŞI DOĞALLAŞTIR",
                primary.Sira,
                current,
                SideType(primary, side),
                planned,
                ""));
        }
    }

    static List<ECandidate> BuildECandidates(
        Employee employee,
        IReadOnlyList<MovementRow> rows,
        HashSet<(string Card, DateTime Day)> exclusions,
        DateTime from,
        DateTime to)
    {
        var start = employee.Hire.HasValue && employee.Hire.Value.Date > from ? employee.Hire.Value.Date : from;
        var end = employee.Exit.HasValue && employee.Exit.Value.Date < to ? employee.Exit.Value.Date : to;
        var result = new List<ECandidate>();

        foreach (var row in rows.Where(x => x.Card == employee.Card))
        {
            if (row.EntryAt.HasValue &&
                row.EntryAt.Value.Date >= start && row.EntryAt.Value.Date <= end &&
                IsWorkday(row.EntryAt.Value.Date) &&
                !exclusions.Contains((employee.Card, row.EntryAt.Value.Date)) &&
                !IsE(row.EntryType))
                result.Add(new(row.Sira, AttendancePlanSide.Entry, row.EntryAt.Value));

            if (row.ExitAt.HasValue &&
                row.ExitAt.Value.Date >= start && row.ExitAt.Value.Date <= end &&
                IsWorkday(row.ExitAt.Value.Date) &&
                !exclusions.Contains((employee.Card, row.ExitAt.Value.Date)) &&
                !IsE(row.ExitType))
                result.Add(new(row.Sira, AttendancePlanSide.Exit, row.ExitAt.Value));
        }

        return result
            .GroupBy(x => (x.Sira, x.Side))
            .Select(g => g.First())
            .OrderBy(x => x.At.Date)
            .ThenBy(x => x.Side)
            .ThenBy(x => x.At)
            .ToList();
    }

    static IReadOnlyList<ECandidate> SelectDistributedCandidates(
        string card,
        IReadOnlyList<ECandidate> candidates,
        int needed)
    {
        var byDay = candidates.GroupBy(x => x.At.Date)
            .OrderBy(g => g.Key)
            .Select(g => new Queue<ECandidate>(OrderDayCandidates(card, g.Key, g.ToArray())))
            .ToList();

        var result = new List<ECandidate>();
        var round = 0;
        while (result.Count < needed && byDay.Any(q => q.Count > 0))
        {
            foreach (var queue in byDay)
            {
                if (queue.Count == 0) continue;
                result.Add(queue.Dequeue());
                if (result.Count >= needed) break;
            }
            round++;
            if (round > 10_000) break;
        }
        return result;
    }

    static IEnumerable<ECandidate> OrderDayCandidates(string card, DateTime day, ECandidate[] values)
    {
        var entry = values.Where(x => x.Side == AttendancePlanSide.Entry).ToArray();
        var exit = values.Where(x => x.Side == AttendancePlanSide.Exit).ToArray();
        var preferEntry = StableBit($"{card}|{day:yyyyMMdd}|E_SIDE") == 0;
        if (preferEntry)
            return entry.Concat(exit);
        return exit.Concat(entry);
    }

    static int CountCurrentE(IReadOnlyList<MovementRow> rows, string card, DateTime from, DateTime to)
    {
        var count = 0;
        foreach (var row in rows.Where(x => x.Card == card))
        {
            if (row.EntryAt.HasValue && row.EntryAt.Value.Date >= from && row.EntryAt.Value.Date <= to && IsE(row.EntryType)) count++;
            if (row.ExitAt.HasValue && row.ExitAt.Value.Date >= from && row.ExitAt.Value.Date <= to && IsE(row.ExitType)) count++;
        }
        return count;
    }

    static void ApplyFullRepair(FbConnection connection, FbTransaction transaction, AttendancePlanItem item)
    {
        if (item.Action == "TERS TARAFI DÜZELT")
        {
            if (!item.RowSira.HasValue) throw new InvalidOperationException("Ters taraf düzeltmesi için kaynak satır bulunamadı.");
            var moveMinute = (int)item.PlannedAt.TimeOfDay.TotalMinutes;
            var moveTime = item.PlannedAt.ToString("HH:mm", CultureInfo.InvariantCulture);
            var moveSql = item.Side == AttendancePlanSide.Exit
                ? "update GIRCIK set GTARIH=null,GSAAT=null,GDAKIKA=null,GTUR=null,CTARIH=@D,CSAAT=@T,CDAKIKA=@M,CTUR='' where SIRA=@S and PKNO=@P"
                : "update GIRCIK set CTARIH=null,CSAAT=null,CDAKIKA=null,CTUR=null,GTARIH=@D,GSAAT=@T,GDAKIKA=@M,GTUR='' where SIRA=@S and PKNO=@P";
            using var move = FirebirdDatabase.CreateCommand(connection, transaction, moveSql,
                new FbParameter("@D", item.Day.Date),
                new FbParameter("@T", moveTime),
                new FbParameter("@M", moveMinute),
                new FbParameter("@S", item.RowSira.Value),
                new FbParameter("@P", item.Card));
            if (move.ExecuteNonQuery() != 1)
                throw new InvalidOperationException($"{item.Card} {item.Day:dd.MM.yyyy}: ters taraf düzeltmesi uygulanamadı.");
            return;
        }

        if (item.RemoveOnly)
        {
            if (!item.RowSira.HasValue) return;
            var sql = item.Side == AttendancePlanSide.Entry
                ? "update GIRCIK set GTARIH=null,GSAAT=null,GDAKIKA=null,GTUR=null where SIRA=@S and PKNO=@P"
                : "update GIRCIK set CTARIH=null,CSAAT=null,CDAKIKA=null,CTUR=null where SIRA=@S and PKNO=@P";
            using var cmd = FirebirdDatabase.CreateCommand(connection, transaction, sql,
                new FbParameter("@S", item.RowSira.Value),
                new FbParameter("@P", item.Card));
            cmd.ExecuteNonQuery();
            return;
        }

        var minute = (int)item.PlannedAt.TimeOfDay.TotalMinutes;
        var time = item.PlannedAt.ToString("HH:mm", CultureInfo.InvariantCulture);

        if (item.RowSira.HasValue)
        {
            var sql = item.Side == AttendancePlanSide.Entry
                ? "update GIRCIK set GTARIH=@D,GSAAT=@T,GDAKIKA=@M,GTUR='' where SIRA=@S and PKNO=@P"
                : "update GIRCIK set CTARIH=@D,CSAAT=@T,CDAKIKA=@M,CTUR='' where SIRA=@S and PKNO=@P";
            using var cmd = FirebirdDatabase.CreateCommand(connection, transaction, sql,
                new FbParameter("@D", item.Day.Date),
                new FbParameter("@T", time),
                new FbParameter("@M", minute),
                new FbParameter("@S", item.RowSira.Value),
                new FbParameter("@P", item.Card));
            cmd.ExecuteNonQuery();
            return;
        }

        var counterpartSql = item.Side == AttendancePlanSide.Entry
            ? "select first 1 SIRA from GIRCIK where PKNO=@P and GTARIH is null and CTARIH>=@D and CTARIH<@N order by SIRA"
            : "select first 1 SIRA from GIRCIK where PKNO=@P and CTARIH is null and GTARIH>=@D and GTARIH<@N order by SIRA";
        int? counterpart = null;
        using (var find = FirebirdDatabase.CreateCommand(connection, transaction, counterpartSql,
            new FbParameter("@P", item.Card),
            new FbParameter("@D", item.Day.Date),
            new FbParameter("@N", item.Day.Date.AddDays(1))))
        {
            var raw = find.ExecuteScalar();
            if (raw is not null && raw != DBNull.Value) counterpart = Convert.ToInt32(raw);
        }

        if (counterpart.HasValue)
        {
            var sql = item.Side == AttendancePlanSide.Entry
                ? "update GIRCIK set GTARIH=@D,GSAAT=@T,GDAKIKA=@M,GTUR='' where SIRA=@S and PKNO=@P"
                : "update GIRCIK set CTARIH=@D,CSAAT=@T,CDAKIKA=@M,CTUR='' where SIRA=@S and PKNO=@P";
            using var cmd = FirebirdDatabase.CreateCommand(connection, transaction, sql,
                new FbParameter("@D", item.Day.Date),
                new FbParameter("@T", time),
                new FbParameter("@M", minute),
                new FbParameter("@S", counterpart.Value),
                new FbParameter("@P", item.Card));
            cmd.ExecuteNonQuery();
            return;
        }

        int nextSira;
        using (var max = FirebirdDatabase.CreateCommand(connection, transaction, "select coalesce(max(SIRA),0)+1 from GIRCIK"))
            nextSira = Convert.ToInt32(max.ExecuteScalar() ?? 1);

        if (item.Side == AttendancePlanSide.Entry)
        {
            using var insert = FirebirdDatabase.CreateCommand(connection, transaction,
                "insert into GIRCIK (SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,MKOD) values (@S,@P,@D,@T,@M,'',0)",
                new FbParameter("@S", nextSira),
                new FbParameter("@P", item.Card),
                new FbParameter("@D", item.Day.Date),
                new FbParameter("@T", time),
                new FbParameter("@M", minute));
            insert.ExecuteNonQuery();
        }
        else
        {
            using var insert = FirebirdDatabase.CreateCommand(connection, transaction,
                "insert into GIRCIK (SIRA,PKNO,CTARIH,CSAAT,CDAKIKA,CTUR,MKOD) values (@S,@P,@D,@T,@M,'',0)",
                new FbParameter("@S", nextSira),
                new FbParameter("@P", item.Card),
                new FbParameter("@D", item.Day.Date),
                new FbParameter("@T", time),
                new FbParameter("@M", minute));
            insert.ExecuteNonQuery();
        }
    }

    static void ApplyE(FbConnection connection, FbTransaction transaction, AttendancePlanItem item)
    {
        if (!item.RowSira.HasValue) throw new InvalidOperationException("E dönüşümü için kaynak satır bulunamadı.");
        var sql = item.Side == AttendancePlanSide.Entry
            ? "update GIRCIK set GTUR='E' where SIRA=@S and PKNO=@P and GTARIH=@D"
            : "update GIRCIK set CTUR='E' where SIRA=@S and PKNO=@P and CTARIH=@D";
        using var cmd = FirebirdDatabase.CreateCommand(connection, transaction, sql,
            new FbParameter("@S", item.RowSira.Value),
            new FbParameter("@P", item.Card),
            new FbParameter("@D", item.Day.Date));
        if (cmd.ExecuteNonQuery() != 1)
            throw new InvalidOperationException($"{item.Card} {item.Day:dd.MM.yyyy} {item.SideText}: E dönüşümü uygulanamadı.");
    }

    static void CleanupEmptyRows(
        FbConnection connection,
        FbTransaction transaction,
        IReadOnlyCollection<string> cards,
        DateTime from,
        DateTime to)
    {
        foreach (var card in cards)
        {
            using var cmd = FirebirdDatabase.CreateCommand(connection, transaction,
                "delete from GIRCIK where PKNO=@P and GTARIH is null and CTARIH is null",
                new FbParameter("@P", card));
            cmd.ExecuteNonQuery();
        }
    }

    static DataTable SnapshotRows(FirebirdDatabase db, string[] cards, DateTime from, DateTime to)
    {
        DataTable? snapshot = null;
        foreach (var card in cards)
        {
            var t = db.Query(@"select * from GIRCIK where PKNO=@P and
                ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B) or (GTARIH is null and CTARIH is null))
                order by SIRA",
                new FbParameter("@P", card),
                new FbParameter("@A", from.Date),
                new FbParameter("@B", to.Date.AddDays(1)));
            if (snapshot is null) snapshot = t.Clone();
            foreach (DataRow row in t.Rows) snapshot.ImportRow(row);
        }
        return snapshot ?? new DataTable("GIRCIK");
    }

    static void RestoreSnapshot(FirebirdDatabase db, string[] cards, DateTime from, DateTime to, DataTable snapshot)
    {
        db.InTransaction((connection, transaction) =>
        {
            foreach (var card in cards)
            {
                using var delete = FirebirdDatabase.CreateCommand(connection, transaction, @"delete from GIRCIK where PKNO=@P and
                    ((GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B) or (GTARIH is null and CTARIH is null))",
                    new FbParameter("@P", card),
                    new FbParameter("@A", from.Date),
                    new FbParameter("@B", to.Date.AddDays(1)));
                delete.ExecuteNonQuery();
            }

            if (snapshot.Columns.Count > 0)
            {
                var columns = snapshot.Columns.Cast<DataColumn>().Select(c => c.ColumnName).ToArray();
                var sql = $"insert into GIRCIK ({string.Join(",", columns)}) values ({string.Join(",", columns.Select((_, i) => "@P" + i))})";
                foreach (DataRow row in snapshot.Rows)
                {
                    var parameters = columns.Select((name, i) =>
                        new FbParameter("@P" + i, row[name] == DBNull.Value ? DBNull.Value : row[name])).ToArray();
                    using var insert = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
                    insert.ExecuteNonQuery();
                }
            }
            return 0;
        });
    }

    static List<Employee> LoadEmployees(FirebirdDatabase db, string[] cards, DateTime from, DateTime to)
    {
        var wanted = cards.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var table = db.Query(@"select k.PKNO,k.AD,k.SOYAD,k.IGTARIH,k.ICTARIH,k.GRUP,coalesce(g.AD,'') GRUP_AD
            from KIMLIK k left join GRUP g on g.KOD=k.GRUP
            where (k.IGTARIH is null or k.IGTARIH<=@B) and (k.ICTARIH is null or k.ICTARIH>=@A)
            order by k.PKNO",
            new FbParameter("@A", from),
            new FbParameter("@B", to.AddDays(1)));
        var policies = AttendanceGroupPolicyStore.Load(db);

        return table.AsEnumerable()
            .Select(r => new Employee(
                (Convert.ToString(r["PKNO"]) ?? "").Trim().PadLeft(5, '0'),
                $"{Convert.ToString(r["AD"])?.Trim()} {Convert.ToString(r["SOYAD"])?.Trim()}".Trim(),
                r["IGTARIH"] == DBNull.Value ? null : Convert.ToDateTime(r["IGTARIH"]).Date,
                r["ICTARIH"] == DBNull.Value ? null : Convert.ToDateTime(r["ICTARIH"]).Date,
                r["GRUP"] == DBNull.Value ? -1 : Convert.ToInt32(r["GRUP"]),
                Convert.ToString(r["GRUP_AD"])?.Trim() ?? ""))
            .Where(x => wanted.Contains(x.Card))
            .Where(x => AttendanceGroupPolicyStore.RequiresCardTracking(policies, x.GroupCode, x.GroupName))
            .ToList();
    }

    static List<MovementRow> LoadMovements(FirebirdDatabase db, string[] cards, DateTime from, DateTime to)
    {
        var wanted = cards.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var table = db.Query(@"select SIRA,PKNO,GTARIH,GSAAT,GDAKIKA,GTUR,CTARIH,CSAAT,CDAKIKA,CTUR
            from GIRCIK where (GTARIH>=@A and GTARIH<@B) or (CTARIH>=@A and CTARIH<@B)
            order by PKNO,SIRA",
            new FbParameter("@A", from.Date),
            new FbParameter("@B", to.Date.AddDays(1)));

        return table.AsEnumerable()
            .Select(r => new MovementRow(
                Convert.ToInt32(r["SIRA"]),
                (Convert.ToString(r["PKNO"]) ?? "").Trim().PadLeft(5, '0'),
                ReadAt(r, "GTARIH", "GSAAT", "GDAKIKA"),
                Convert.ToString(r["GTUR"])?.Trim() ?? "",
                ReadAt(r, "CTARIH", "CSAAT", "CDAKIKA"),
                Convert.ToString(r["CTUR"])?.Trim() ?? ""))
            .Where(x => wanted.Contains(x.Card))
            .ToList();
    }

    static HashSet<(string Card, DateTime Day)> LoadExcludedDays(FirebirdDatabase db, string[] cards, DateTime from, DateTime to)
    {
        var wanted = cards.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var result = new HashSet<(string, DateTime)>();
        foreach (var sql in new[]
        {
            "select PKNO,TARIH from OZELIZIN where TARIH>=@A and TARIH<@B",
            "select PKNO,TARIH from PERPLANTAT where TARIH>=@A and TARIH<@B"
        })
        {
            try
            {
                var table = db.Query(sql,
                    new FbParameter("@A", from.Date),
                    new FbParameter("@B", to.Date.AddDays(1)));
                foreach (DataRow row in table.Rows)
                {
                    var card = (Convert.ToString(row["PKNO"]) ?? "").Trim().PadLeft(5, '0');
                    if (!wanted.Contains(card) || row["TARIH"] == DBNull.Value) continue;
                    result.Add((card, Convert.ToDateTime(row["TARIH"]).Date));
                }
            }
            catch { }
        }
        // Genel tatil takvimi kişi bağımsızdır. Şema eski Hedef sürümlerinde değişebildiği için
        // tarih alanını metadata üzerinden bulup tatil gününün tamamını otomatik üretim dışında bırakırız.
        try
        {
            var meta = db.Query(@"select trim(rf.rdb$field_name) FIELD_NAME
                from rdb$relation_fields rf
                where upper(trim(rf.rdb$relation_name))='TATIL'
                order by rf.rdb$field_position");
            var names = meta.AsEnumerable()
                .Select(r => Convert.ToString(r["FIELD_NAME"])?.Trim() ?? "")
                .Where(x => x.Length > 0)
                .ToArray();
            var dateColumn = new[] { "TARIH", "GUN", "BASTAR", "BASLANGIC", "TARIH1" }
                .FirstOrDefault(x => names.Contains(x, StringComparer.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(dateColumn))
            {
                var holidays = db.Query($"select {dateColumn} TARIH from TATIL where {dateColumn}>=@A and {dateColumn}<@B",
                    new FbParameter("@A", from.Date),
                    new FbParameter("@B", to.Date.AddDays(1)));
                foreach (DataRow row in holidays.Rows)
                {
                    if (row["TARIH"] == DBNull.Value) continue;
                    var day = Convert.ToDateTime(row["TARIH"]).Date;
                    foreach (var card in wanted) result.Add((card, day));
                }
            }
        }
        catch { }

        return result;
    }

    static DateTime? ReadAt(DataRow row, string dateColumn, string timeColumn, string minuteColumn)
    {
        if (row[dateColumn] == DBNull.Value) return null;
        var day = Convert.ToDateTime(row[dateColumn]).Date;
        if (row[minuteColumn] != DBNull.Value)
        {
            var minute = Convert.ToInt32(row[minuteColumn]);
            if (minute is >= 0 and < 1440) return day.AddMinutes(minute);
        }
        var raw = Convert.ToString(row[timeColumn])?.Trim() ?? "";
        return TimeSpan.TryParse(raw, out var time) ? day.Add(time) : null;
    }

    static bool SideMatchesDay(MovementRow row, AttendancePlanSide side, DateTime day) =>
        SideAt(row, side)?.Date == day.Date;

    static DateTime? SideAt(MovementRow row, AttendancePlanSide side) =>
        side == AttendancePlanSide.Entry ? row.EntryAt : row.ExitAt;

    static string SideType(MovementRow row, AttendancePlanSide side) =>
        side == AttendancePlanSide.Entry ? row.EntryType : row.ExitType;

    static bool IsE(string? value) =>
        string.Equals(value?.Trim(), "E", StringComparison.OrdinalIgnoreCase);

    static bool IsWorkday(DateTime day) =>
        day.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday;

    static int StableMinute(string card, DateTime day, AttendancePlanSide side, TimeSpan from, TimeSpan to)
    {
        var min = (int)from.TotalMinutes;
        var max = (int)to.TotalMinutes;
        var span = Math.Max(1, max - min + 1);
        var source = $"{card}|{day:yyyyMMdd}|{side}|NATURAL";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(source));
        return min + (int)(BitConverter.ToUInt32(hash, 0) % (uint)span);
    }

    static int StableBit(string source)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(source));
        return hash[0] & 1;
    }

    static IReadOnlyList<AttendancePlanItem> SortPlan(IEnumerable<AttendancePlanItem> items) =>
        items.OrderBy(x => x.Day)
            .ThenBy(x => x.Side == AttendancePlanSide.Entry ? 0 : 1)
            .ThenBy(x => x.PlannedAt)
            .ThenBy(x => x.Card)
            .ToArray();

    static string[] NormalizeCards(IEnumerable<string> source) =>
        source.Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().PadLeft(5, '0'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    static void NormalizeRange(ref DateTime from, ref DateTime to)
    {
        from = from.Date;
        to = to.Date;
        if (to < from) (from, to) = (to, from);
    }

    static void WriteAudit(AttendancePlanMode mode, IEnumerable<string> rows)
    {
        CompanyDataPaths.Ensure();
        var dir = Path.Combine(CompanyDataPaths.Audit, "MANUEL_ISLEMLER");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"PLANLI_KART_ISLEMLERI_{DateTime.Today:yyyy}.csv");
        if (!File.Exists(path))
            File.WriteAllText(path, "ZAMAN;MOD;KART;TARIH;TARAF;ISLEM;ESKI;YENI;TIP;KULLANICI" + Environment.NewLine, Encoding.UTF8);
        foreach (var row in rows)
            File.AppendAllText(path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss};{mode};{row};{Environment.UserName}{Environment.NewLine}", Encoding.UTF8);
    }

    sealed record Employee(string Card, string Name, DateTime? Hire, DateTime? Exit, int GroupCode, string GroupName);
    sealed record MovementRow(int Sira, string Card, DateTime? EntryAt, string EntryType, DateTime? ExitAt, string ExitType);
    sealed record ECandidate(int Sira, AttendancePlanSide Side, DateTime At);
}
