using System.Data;
using System.Globalization;

namespace QuickDataTool;

internal static partial class SyncEngine
{
    internal static DataTable CompareExact(List<DbMovement> database, List<TnfMovement> terminal,
        Dictionary<string, EmploymentRule> people, CancellationToken token)
    {
        var table = EmptyTable();
        var dbGroups = database.ToLookup(move => (move.Card, move.Date));
        var tnfGroups = terminal.ToLookup(move => (move.Card, move.Date));
        var format = new TnfFormat();
        table.BeginLoadData();

        foreach (var key in dbGroups.Select(group => group.Key).Union(tnfGroups.Select(group => group.Key))
                     .OrderBy(key => key.Card).ThenBy(key => key.Date))
        {
            token.ThrowIfCancellationRequested();
            var allDb = dbGroups[key].OrderBy(move => move.Id).ToArray();
            var normalDb = allDb.Where(move => !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).ToArray();
            var eDb = allDb.Where(move => move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).ToArray();
            var lines = tnfGroups[key].OrderBy(line => line.Index).ToList();
            var used = new HashSet<int>();
            var name = people.GetValueOrDefault(key.Card)?.Name ?? "KIMLIK YOK";

            void Add(DbMovement? move, TnfMovement? line, string status, string operation, string detail)
                => table.Rows.Add(key.Card, name, key.Date.ToString("dd.MM.yyyy"),
                    move?.Side ?? (line is null ? "Belirsiz" : ClockSide(line.Time)),
                    move?.Time ?? "", move?.Tur ?? (line is null ? "" : "TNF"),
                    line?.Time ?? "", line?.Raw ?? "", status, operation,
                    move?.Id ?? -1, line?.Index ?? -1, false, detail, false);

            foreach (var source in normalDb)
            {
                token.ThrowIfCancellationRequested();
                if (!CanBuild(source, format))
                {
                    Add(source, null, "DB AKTARILAMAZ", "İNCELE",
                        "DB kart/tarih/saat bilgisi standart TNF satırına dönüştürülemiyor.");
                    continue;
                }

                TnfMovement? match = null;
                foreach (var line in lines)
                {
                    if (used.Contains(line.Index) || line.Time != source.Time) continue;
                    match = line;
                    break;
                }

                if (match is null)
                {
                    Add(source, null, "TNF EKSİK", "TNF EKLE",
                        "DB normal hareketi TNF'de yok; aynen eklenecek.");
                    continue;
                }

                used.Add(match.Index);
                var canonical = format.Build(source.Card, source.Date, source.Time);
                var equal = match.Standard && match.Raw.TrimStart('﻿') == canonical;
                Add(source, match, equal ? "✓ UYUMLU" : "FORMAT FARKI",
                    equal ? "YOK" : "TNF DÜZELT",
                    equal ? "DB ve TNF bire bir aynı." : "Aynı DB saati var; TNF satırı standart biçime çekilecek.");
            }

            foreach (var line in lines.Where(line => !used.Contains(line.Index)))
            {
                token.ThrowIfCancellationRequested();
                var isECounterpart = eDb.Any(move => move.Time == line.Time);
                Add(isECounterpart ? eDb.First(move => move.Time == line.Time) : null, line,
                    isECounterpart ? "E KAYDI TNF'DE" : "FAZLA TNF",
                    isECounterpart ? "TNF SİL E" : "TNF SİL FAZLA",
                    isECounterpart
                        ? "DB'de E olan hareket TNF'de bulunmaz; satır silinecek."
                        : "DB'de karşılığı olmayan/fazla/mükerrer TNF satırı silinecek.");
            }

            foreach (var e in eDb.Where(e => lines.All(line => line.Time != e.Time)))
                Add(e, null, "E KAYDI", "YOK", "DB'de E kaydı var; TNF'de olmaması doğru.");
        }

        table.EndLoadData();
        return table;
    }

    internal static void VerifyExactOutput(AuditSnapshot snapshot, string[] corrected, CancellationToken token)
    {
        var movements = new List<TnfMovement>();
        var format = new TnfFormat();
        for (var index = 0; index < corrected.Length; index++)
        {
            token.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(corrected[index])) continue;
            if (!format.TryParse(corrected[index], index, out var move)) throw new InvalidOperationException("Bozuk TNF çıktı satırı; dosya yayınlanmadı.");
            if (move.Date >= snapshot.Request.Start && move.Date < snapshot.Request.End && (snapshot.Request.Card.Length == 0 || snapshot.Request.Card == move.Card)) movements.Add(move);
        }
        var result = CompareExact(snapshot.Db, movements, snapshot.People, token);
        if (result.AsEnumerable().Any(row => row.Field<string>("İşlem") != "YOK")) throw new InvalidOperationException("TNF son kontrolü DB ile bire bir değil; çıktı yayınlanmadı.");
    }
}
