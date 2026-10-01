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
        table.BeginLoadData();
        foreach (var key in dbGroups.Select(group => group.Key).Union(tnfGroups.Select(group => group.Key)).OrderBy(key => key.Card).ThenBy(key => key.Date))
        {
            token.ThrowIfCancellationRequested();
            var db = dbGroups[key].ToArray();
            var lines = tnfGroups[key].OrderBy(line => line.Index).ToArray();
            var buckets = new Dictionary<string, List<TnfMovement>> { ["Giriş"] = [], ["Çıkış"] = [] };
            var times = db.GroupBy(move => move.Time).ToDictionary(group => group.Key, group => group.Select(move => move.Side).Distinct().ToArray());
            var invalid = db.Any(move => move.Side is not ("Giriş" or "Çıkış") || !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) && !CanBuild(move, new TnfFormat())) ||
                db.GroupBy(move => move.Side).Any(group => group.Count() > 1) || times.Any(group => group.Value.Length > 1);
            void Add(DbMovement? move, TnfMovement? line, string side, string status, string operation, string detail)
                => table.Rows.Add(key.Card, people.GetValueOrDefault(key.Card)?.Name ?? "KIMLIK YOK", key.Date.ToString("dd.MM.yyyy"), side,
                    move?.Time ?? "", move?.Tur ?? "", line?.Time ?? "", line?.Raw ?? "", status, operation, move?.Id ?? -1, line?.Index ?? -1, false, detail, false);
            if (invalid)
            {
                var count = Math.Max(db.Length, lines.Length);
                for (var index = 0; index < count; index++) Add(index < db.Length ? db[index] : null, index < lines.Length ? lines[index] : null,
                    index < db.Length ? db[index].Side : ClockSide(lines[index].Time), "DB HAZIRLANMALI", "İNCELE", "DB tekil/aktarılabilir değil. Önce DB KAYIT'ta seçilen günü hazırlayın; TNF mükerreri tek başına incele nedeni değildir.");
                continue;
            }
            foreach (var line in lines)
            {
                var exact = times.GetValueOrDefault(line.Time);
                var side = exact is { Length: 1 } ? exact[0] : DbRecordService.IntendedSide(line.Time);
                buckets[side].Add(line);
            }
            foreach (var side in new[] { "Giriş", "Çıkış" })
            {
                var source = db.SingleOrDefault(move => move.Side == side);
                var candidates = buckets[side].OrderByDescending(line => line.Time == source?.Time).ThenBy(line => line.Index).ToArray();
                if (source is null)
                {
                    foreach (var line in candidates) Add(null, line, side, "FAZLA TNF", "TNF SİL FAZLA", "DB'de bu taraf yok; TNF silinecek.");
                    continue;
                }
                if (source.Tur.Equals("E", StringComparison.OrdinalIgnoreCase))
                {
                    if (candidates.Length == 0) Add(source, null, side, "E KAYDI", "YOK", "E doğru: TNF yok, eksik=0.");
                    foreach (var line in candidates) Add(source, line, side, "E HATASI", "TNF SİL E", "E tarafının tüm TNF karşılıkları silinecek; normal kayıt üretilmez.");
                    continue;
                }
                if (candidates.Length == 0) { Add(source, null, side, "TNF EKSİK", "TNF EKLE", "DB kart/tarih/saati bire bir düzeltilmiş TNF'ye eklenecek."); continue; }
                var keeper = candidates[0];
                var canonical = $"{source.Card},{source.Time},{source.Date:ddMMyy},1,001";
                var equal = keeper.Raw.TrimStart('\uFEFF') == canonical;
                Add(source, keeper, side, equal ? "✓ UYUMLU" : "SAAT / FORMAT FARKI", equal ? "YOK" : "TNF DÜZELT", "Tek DB kaydına uyan ilk TNF tutulur; diğer satırlar güvenli silinir.");
                foreach (var duplicate in candidates.Skip(1)) Add(null, duplicate, side, "FAZLA TNF", "TNF SİL FAZLA", "Tekil DB tarafı için fazla/mükerrer TNF satırı; otomatik silinecek.");
            }
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
