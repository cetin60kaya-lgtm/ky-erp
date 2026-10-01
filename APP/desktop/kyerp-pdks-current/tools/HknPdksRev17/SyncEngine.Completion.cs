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

    internal static (string[] Corrected, string[] Missing) PrepareNormalizationOutputs(AuditSnapshot projected, MonthlyIssue[] operations, CancellationToken token)
    {
        var days = operations.Select(operation => (operation.Card, operation.Day)).ToHashSet();
        var safe = projected.Table.AsEnumerable().Where(SafeOperation).ToArray();
        var plan = safe.Length == 0 ? (Corrected: projected.Lines, Missing: Array.Empty<string>()) : PrepareOutputs(projected, safe, token);
        bool Unchanged(string line)
        {
            token.ThrowIfCancellationRequested();
            return !projected.Request.Format.TryParse(line, 0, out var movement) || !movement.Standard || !days.Contains((movement.Card, movement.Date));
        }
        var corrected = plan.Corrected.Where(Unchanged).ToList();
        var written = corrected.ToHashSet(StringComparer.Ordinal);
        foreach (var movement in projected.Db.Where(move => days.Contains((move.Card, move.Date)) && !move.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)).OrderBy(move => move.Card, StringComparer.Ordinal).ThenBy(move => move.Date).ThenBy(move => move.Time, StringComparer.Ordinal))
        {
            token.ThrowIfCancellationRequested();
            var line = projected.Request.Format.Build(movement.Card, movement.Date, movement.Time);
            if (written.Add(line)) corrected.Add(line);
        }
        return (corrected.ToArray(), plan.Missing.Where(Unchanged).ToArray());
    }

    internal static async Task<(string Backup, TnfOutputs Outputs)> CompleteDbAndTnfAsync(FirebirdDatabase database, AuditSnapshot sync,
        MonthlyDbSnapshot monthly, MonthlyIssue[] additions, CancellationToken token, bool normalize = false)
    {
        MonthlyDbWriter.ValidatePlan(monthly, additions, normalize);
        if (!normalize && additions.Any(addition => addition.Kind != "EKLE")) throw new InvalidOperationException("Bu akış yalnız yeni DB kayıtları içindir.");
        using var sourceLock = new FileStream(sync.Request.Path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var fresh = await ReadAsync(database, sync.Request, token).ConfigureAwait(false);
        if (fresh.FileHash != sync.FileHash || fresh.DbHash != sync.DbHash)
            throw new InvalidOperationException("DB/TNF kontrol sonrası değişti. Yeniden kontrol edin; DB değişmedi.");
        var moves = MonthlyDbNormalization.Project(MonthlyDbAudit.Movements(monthly.Records, monthly.Request), additions);
        var terminal = new List<TnfMovement>();
        for (var index = 0; index < sync.Lines.Length; index++)
        {
            token.ThrowIfCancellationRequested();
            if (sync.Request.Format.TryParse(sync.Lines[index], index, out var movement) && movement.Date >= sync.Request.Start && movement.Date < sync.Request.End)
                terminal.Add(movement);
        }
        var projected = sync with { Db = moves, People = monthly.People,
            Table = Compare(moves, terminal, monthly.People, sync.Request.Format, token) };
        var generated = additions.Where(operation => operation.Kind == "EKLE" || MonthlyDbNormalization.IsReplacement(operation)).Select(operation =>
            MonthlyDbNormalization.IsReplacement(operation) ? operation with { Kind = "EKLE", Side = operation.NewSide, Time = operation.NewTime } : operation).ToArray();
        var plan = normalize ? PrepareNormalizationOutputs(projected, additions, token) : PrepareCompletedOutputs(projected, generated, token);
        using var staged = await StageOutputsAsync(sync, plan.Corrected, plan.Missing, token).ConfigureAwait(false);
        var backup = await MonthlyDbWriter.ApplyAsync(database, sync, monthly, additions, token, normalize).ConfigureAwait(false);
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
