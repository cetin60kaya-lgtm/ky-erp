using System.Data;
using System.Globalization;
using System.Security.Cryptography;

namespace QuickDataTool;

internal sealed record TnfOutputs(string CorrectedPath, string MissingPath, string BackupPath, int MissingCount);
internal sealed record DirectTnfSyncResult(string SourcePath, string BackupPath, int Added, int RemovedExtra, int RemovedE, int Corrected, int Total);

internal sealed class StagedTnfOutputs(TnfOutputs outputs, string correctedTemporary, string missingTemporary) : IDisposable
{
    bool retain;
    internal TnfOutputs Publish()
    {
        try
        {
            File.Move(correctedTemporary, outputs.CorrectedPath, false);
            if (missingTemporary.Length > 0) File.Move(missingTemporary, outputs.MissingPath, false);
            return outputs;
        }
        catch
        {
            if (File.Exists(outputs.CorrectedPath) && !File.Exists(correctedTemporary))
                File.Move(outputs.CorrectedPath, correctedTemporary, false);
            throw;
        }
    }
    internal string RetainForRecovery()
    {
        retain = true;
        return $"{correctedTemporary}\n{missingTemporary}";
    }
    public void Dispose()
    {
        if (retain) return;
        if (File.Exists(correctedTemporary)) File.Delete(correctedTemporary);
        if (File.Exists(missingTemporary)) File.Delete(missingTemporary);
    }
}

internal static partial class SyncEngine
{
    internal static bool SafeOperation(DataRow row) => row.Field<string>("İşlem") is
        "TNF EKLE" or "TNF SİL FAZLA" or "TNF SİL E" or "TNF DÜZELT";

    internal static string CanonicalLine(DataRow row)
    {
        var card = row.Field<string>("Kart No") ?? "";
        var time = row.Field<string>("DB Saat") ?? "";
        var date = DateTime.ParseExact(row.Field<string>("Tarih")!, "dd.MM.yyyy", CultureInfo.InvariantCulture);
        if (card.Length != 5 || !card.All(char.IsAsciiDigit) ||
            !TimeSpan.TryParseExact(time, @"hh\:mm", CultureInfo.InvariantCulture, out var clock) || clock.TotalHours >= 24 ||
            row.Field<string>("Tür") == "E")
            throw new InvalidOperationException("DB kart/saat/normal tür bilgisi bire bir TNF formatına aktarılamıyor.");
        return $"{card},{time},{date.ToString("ddMMyy", CultureInfo.InvariantCulture)},1,001";
    }

    internal static (string[] Corrected, string[] Missing) PrepareOutputs(AuditSnapshot snapshot, DataRow[] selected, CancellationToken cancellation)
    {
        if (selected.Length == 0 && !snapshot.Request.Exact || selected.Any(row => !ReferenceEquals(row.Table, snapshot.Table) || !SafeOperation(row)))
            throw new InvalidOperationException("Yalnız bu kontrol sonucunun güvenli TNF işlemleri uygulanabilir.");
        var deletions = new HashSet<int>();
        var replacements = new Dictionary<int, string>();
        var missing = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in selected.Distinct())
        {
            cancellation.ThrowIfCancellationRequested();
            var operation = row.Field<string>("İşlem");
            var index = row.Field<int>("TnfIndex");
            if (operation == "TNF EKLE") missing.Add(CanonicalLine(row));
            else
            {
                if (index < 0 || index >= snapshot.Lines.Length) throw new InvalidOperationException("TNF satır adresi geçersiz.");
                if (operation is "TNF SİL FAZLA" or "TNF SİL E") deletions.Add(index);
                else if (!replacements.TryAdd(index, CanonicalLine(row)))
                    throw new InvalidOperationException("Aynı TNF satırı birden fazla işlemle eşleşiyor; kontrolü yenileyin.");
            }
        }
        if (deletions.Overlaps(replacements.Keys)) throw new InvalidOperationException("TNF işlem planı çelişkili.");
        var corrected = new List<string>(snapshot.Lines.Length);
        for (var index = 0; index < snapshot.Lines.Length; index++)
        {
            cancellation.ThrowIfCancellationRequested();
            if (!deletions.Contains(index)) corrected.Add(replacements.GetValueOrDefault(index) ?? snapshot.Lines[index]);
        }
        return snapshot.Request.Exact ? (corrected.Concat(missing.Order(StringComparer.Ordinal)).ToArray(), []) : (corrected.ToArray(), missing.Order(StringComparer.Ordinal).ToArray());
    }

    public static async Task<TnfOutputs> ApplyAsync(KYERP.PDKS.Core.FirebirdDatabase database, AuditSnapshot snapshot,
        DataRow[] selected, CancellationToken cancellation)
    {
        var fresh = await ReadAsync(database, snapshot.Request, cancellation).ConfigureAwait(false);
        if (fresh.FileHash != snapshot.FileHash || fresh.DbHash != snapshot.DbHash)
            throw new InvalidOperationException("DB/personel/TNF değişmiş. Önce yeniden KONTROL ET.");
        var plan = PrepareOutputs(snapshot, selected, cancellation);
        if (snapshot.Request.Exact) VerifyExactOutput(snapshot, plan.Corrected, cancellation);
        return await WriteOutputsAsync(snapshot, plan.Corrected, plan.Missing, cancellation).ConfigureAwait(false);
    }

    internal static async Task<DirectTnfSyncResult> DirectSyncSourceAsync(KYERP.PDKS.Core.FirebirdDatabase database, AuditSnapshot snapshot, CancellationToken cancellation)
    {
        if (!snapshot.Request.Exact) throw new InvalidOperationException("Doğrudan eşitleme yalnız bire bir DB ana kaynak modunda çalışır.");
        var fresh = await ReadAsync(database, snapshot.Request, cancellation).ConfigureAwait(false);
        if (fresh.FileHash != snapshot.FileHash || fresh.DbHash != snapshot.DbHash)
            throw new InvalidOperationException("DB veya TNF değişmiş. Önce yeniden kontrol edin.");

        var review = fresh.Table.AsEnumerable().Where(row => row.Field<string>("İşlem") == "İNCELE").ToArray();
        if (review.Length > 0)
            throw new InvalidOperationException($"DB ana kaynakta {review.Length} belirsiz/teknik kayıt var. TNF değiştirilmedi; önce bu DB kayıtlarını düzeltin.");

        var selected = fresh.Table.AsEnumerable().Where(SafeOperation).ToArray();
        var plan = PrepareOutputs(fresh, selected, cancellation);
        VerifyExactOutput(fresh, plan.Corrected, cancellation);

        var source = Path.GetFullPath(fresh.Request.Path);
        var directory = Path.GetDirectoryName(source)!;
        if (Path.GetFileName(directory).Equals("_TNF_CIKTILARI", StringComparison.OrdinalIgnoreCase))
            directory = Directory.GetParent(directory)!.FullName;
        var backupDirectory = Path.Combine(directory, "_YEDEK");
        Directory.CreateDirectory(backupDirectory);
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture) + "_" + Guid.NewGuid().ToString("N")[..8];
        var backupPath = Path.Combine(backupDirectory, Path.GetFileNameWithoutExtension(source) + "_REV23_ONCESI_" + stamp + Path.GetExtension(source));

        byte[] original;
        await using (var stream = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            original = new byte[stream.Length];
            await stream.ReadExactlyAsync(original, cancellation).ConfigureAwait(false);
        }
        if (Convert.ToHexString(SHA256.HashData(original)) != fresh.FileHash)
            throw new InvalidOperationException("TNF kontrol sırasında değişmiş; eşitleme iptal edildi.");

        await AtomicWriteAsync(backupPath, original, cancellation).ConfigureAwait(false);
        var replacement = EncodeLines(plan.Corrected, fresh.Encoding);
        try
        {
            await AtomicReplaceAsync(source, replacement, cancellation).ConfigureAwait(false);
            var verify = await ReadAsync(database, fresh.Request with { Path = source }, cancellation).ConfigureAwait(false);
            var remaining = verify.Table.AsEnumerable().Where(row => row.Field<string>("İşlem") != "YOK").ToArray();
            if (remaining.Length > 0)
                throw new InvalidOperationException($"Son doğrulamada {remaining.Length} uyumsuzluk kaldı.");
        }
        catch
        {
            await AtomicReplaceAsync(source, original, CancellationToken.None).ConfigureAwait(false);
            throw;
        }

        var counts = selected.GroupBy(row => row.Field<string>("İşlem")!).ToDictionary(group => group.Key, group => group.Count());
        return new(source, backupPath,
            counts.GetValueOrDefault("TNF EKLE"),
            counts.GetValueOrDefault("TNF SİL FAZLA"),
            counts.GetValueOrDefault("TNF SİL E"),
            counts.GetValueOrDefault("TNF DÜZELT"),
            selected.Length);
    }

    static async Task AtomicReplaceAsync(string destination, byte[] bytes, CancellationToken cancellation)
    {
        var temporary = destination + ".rev23." + Guid.NewGuid().ToString("N") + ".tmp";
        var rollback = destination + ".rev23." + Guid.NewGuid().ToString("N") + ".rollback";
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await stream.WriteAsync(bytes, cancellation).ConfigureAwait(false);
                stream.Flush(true);
            }
            cancellation.ThrowIfCancellationRequested();
            try
            {
                File.Replace(temporary, destination, null, true);
            }
            catch (Exception exception) when (exception is IOException or PlatformNotSupportedException or UnauthorizedAccessException)
            {
                File.Move(destination, rollback, false);
                try
                {
                    File.Move(temporary, destination, false);
                    File.Delete(rollback);
                }
                catch
                {
                    if (File.Exists(destination)) File.Delete(destination);
                    if (File.Exists(rollback)) File.Move(rollback, destination, false);
                    throw;
                }
            }
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
            if (File.Exists(rollback)) File.Delete(rollback);
        }
    }

    internal static async Task<TnfOutputs> WriteOutputsAsync(AuditSnapshot snapshot, string[] corrected, string[] missing, CancellationToken cancellation)
    {
        using var staged = await StageOutputsAsync(snapshot, corrected, missing, cancellation).ConfigureAwait(false);
        cancellation.ThrowIfCancellationRequested();
        return staged.Publish();
    }

    internal static async Task<StagedTnfOutputs> StageOutputsAsync(AuditSnapshot snapshot, string[] corrected, string[] missing, CancellationToken cancellation)
    {
        var directory = Path.GetDirectoryName(snapshot.Request.Path)!;
        if (Path.GetFileName(directory).Equals("_TNF_CIKTILARI", StringComparison.OrdinalIgnoreCase))
            directory = Directory.GetParent(directory)!.FullName;
        var backupDirectory = Path.Combine(directory, "_YEDEK");
        var outputDirectory = Path.Combine(directory, "_TNF_CIKTILARI");
        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff", CultureInfo.InvariantCulture) + "_" + Guid.NewGuid().ToString("N")[..8];
        var sourceStem = System.Text.RegularExpressions.Regex.Replace(Path.GetFileNameWithoutExtension(snapshot.Request.Path),
            @"_\d{8}_\d{6}_\d{3}_[0-9a-f]{8}_DUZELTILMIS$", "");
        var stem = sourceStem + "_" + stamp;
        var correctedPath = Path.Combine(outputDirectory, stem + "_DUZELTILMIS.Tnf");
        var missingPath = snapshot.Request.Exact ? "" : Path.Combine(outputDirectory, stem + "_EKSIK.Tnf");
        var backupPath = Path.Combine(backupDirectory, stem + ".Tnf");
        var correctedTemporary = correctedPath + ".pending";
        var missingTemporary = missingPath.Length == 0 ? "" : missingPath + ".pending";
        using var source = new FileStream(snapshot.Request.Path, FileMode.Open, FileAccess.Read, FileShare.Read);
        var bytes = new byte[source.Length];
        await source.ReadExactlyAsync(bytes, cancellation).ConfigureAwait(false);
        if (Convert.ToHexString(SHA256.HashData(bytes)) != snapshot.FileHash)
            throw new InvalidOperationException("Orijinal TNF değişmiş; çıktı hazırlanmadı.");
        cancellation.ThrowIfCancellationRequested();
        Directory.CreateDirectory(backupDirectory);
        Directory.CreateDirectory(outputDirectory);
        await AtomicWriteAsync(backupPath, bytes, cancellation).ConfigureAwait(false);
        try
        {
            await AtomicWriteAsync(correctedTemporary, EncodeLines(corrected, snapshot.Encoding), cancellation).ConfigureAwait(false);
            if (missingTemporary.Length > 0) await AtomicWriteAsync(missingTemporary, EncodeLines(missing, snapshot.Encoding), cancellation).ConfigureAwait(false);
        }
        catch
        {
            if (File.Exists(correctedTemporary)) File.Delete(correctedTemporary);
            if (File.Exists(missingTemporary)) File.Delete(missingTemporary);
            throw;
        }
        return new(new(correctedPath, missingPath, backupPath, missing.Length), correctedTemporary, missingTemporary);
    }

    static byte[] EncodeLines(string[] lines, System.Text.Encoding encoding) =>
        encoding.GetPreamble().Concat(encoding.GetBytes(lines.Length == 0 ? "" : string.Join("\r\n", lines) + "\r\n")).ToArray();

    static async Task AtomicWriteAsync(string destination, byte[] bytes, CancellationToken cancellation)
    {
        var temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                await stream.WriteAsync(bytes, cancellation).ConfigureAwait(false);
                stream.Flush(true);
            }
            cancellation.ThrowIfCancellationRequested();
            File.Move(temporary, destination, false);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
