using System.Data;
using System.Globalization;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal sealed class CompletionPublicationException(string message, Exception inner) : IOException(message, inner);

internal static partial class SyncEngine
{
    internal static (string[] Corrected, string[] Missing) PrepareCompletedOutputs(AuditSnapshot projected, MonthlyIssue[] additions, CancellationToken token)
    {
        var rowsByKey = projected.Table.AsEnumerable().ToLookup(row => (row.Field<string>("Kart No"), row.Field<string>("Tarih"), row.Field<string>("Taraf")));
        var generated = new HashSet<string>(StringComparer.Ordinal);
        foreach (var addition in additions)
        {
            token.ThrowIfCancellationRequested();
            if (addition.Kind != "EKLE" || !addition.Safe) throw new InvalidOperationException("Yalnız onaylı eksik DB tarafı TNF'ye aktarılabilir.");
            var candidates = rowsByKey[(addition.Card, addition.Day.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture), addition.Side)].ToArray();
            if (candidates.Length != 1 || candidates[0].Field<string>("DB Saat") != addition.Time ||
                candidates[0].Field<string>("Tür") == "E" || candidates[0].Field<string>("İşlem") == "İNCELE")
                throw new InvalidOperationException("Yeni DB tarafının TNF eşleşmesi belirsiz. DB/TNF değiştirilmedi; önce bu günü kontrol edin.");
            generated.Add(CanonicalLine(candidates[0]));
        }
        var selected = projected.Table.AsEnumerable().Where(SafeOperation).ToArray();
        var plan = selected.Length == 0 ? (Corrected: projected.Lines, Missing: Array.Empty<string>()) : PrepareOutputs(projected, selected, token);
        var corrected = plan.Corrected.ToList();
        var written = corrected.ToHashSet(StringComparer.Ordinal);
        foreach (var line in generated.Order(StringComparer.Ordinal))
            if (written.Add(line)) corrected.Add(line);
        return (corrected.ToArray(), plan.Missing.Where(line => !generated.Contains(line)).ToArray());
    }

    internal static async Task<(string Backup, TnfOutputs Outputs)> CompleteDbAndTnfAsync(FirebirdDatabase database, AuditSnapshot sync,
        MonthlyDbSnapshot monthly, MonthlyIssue[] additions, CancellationToken token)
    {
        MonthlyDbWriter.ValidatePlan(monthly, additions);
        if (additions.Any(addition => addition.Kind != "EKLE")) throw new InvalidOperationException("Bu akış yalnız yeni DB kayıtları içindir.");
        using var sourceLock = new FileStream(sync.Request.Path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var fresh = await ReadAsync(database, sync.Request, token).ConfigureAwait(false);
        if (fresh.FileHash != sync.FileHash || fresh.DbHash != sync.DbHash)
            throw new InvalidOperationException("DB/TNF kontrol sonrası değişti. Yeniden kontrol edin; DB değişmedi.");
        var moves = MonthlyDbAudit.Movements(monthly.Records, monthly.Request);
        var nextId = moves.Select(move => move.Id).DefaultIfEmpty(0).Max() + 1;
        var newIds = new Dictionary<(string Card, DateTime Day), int>();
        foreach (var addition in additions)
        {
            var id = addition.Id;
            if (id < 0 && !newIds.TryGetValue((addition.Card, addition.Day), out id))
                newIds.Add((addition.Card, addition.Day), id = nextId++);
            moves.Add(new(id, addition.Card, addition.Day, addition.Side, addition.Time, ""));
        }
        var terminal = new List<TnfMovement>();
        for (var index = 0; index < sync.Lines.Length; index++)
        {
            token.ThrowIfCancellationRequested();
            if (sync.Request.Format.TryParse(sync.Lines[index], index, out var movement) && movement.Date >= sync.Request.Start && movement.Date < sync.Request.End)
                terminal.Add(movement);
        }
        var projected = sync with { Db = moves, People = monthly.People,
            Table = Compare(moves, terminal, monthly.People, sync.Request.Format, token) };
        var plan = PrepareCompletedOutputs(projected, additions, token);
        using var staged = await StageOutputsAsync(sync, plan.Corrected, plan.Missing, token).ConfigureAwait(false);
        var backup = await MonthlyDbWriter.ApplyAsync(database, sync, monthly, additions, token).ConfigureAwait(false);
        try
        {
            var outputs = staged.Publish();
            Log($"REV21 db_completion_tnf_exact sides={additions.Length} missing={outputs.MissingCount} original_preserved=true");
            return (backup, outputs);
        }
        catch (Exception exception)
        {
            var recovery = staged.RetainForRecovery();
            throw new CompletionPublicationException($"DB kayıtları COMMIT edildi; TNF çıktısı yayınlanamadı. DB'ye aynı kayıtları yeniden eklemeyin. Hazır TNF dosyaları korunuyor:\n{recovery}\nDB yedeği ve işlem dump'ı: {backup}", exception);
        }
    }
}
