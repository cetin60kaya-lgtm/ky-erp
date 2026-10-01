using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static partial class SyncEngine
{
    public static async Task<string> ApplyAsync(FirebirdDatabase database, AuditSnapshot snapshot,
        DataRow[] selected, bool clean, CancellationToken cancellation)
    {
        if (selected.Length == 0 || selected.Any(row => !ReferenceEquals(row.Table, snapshot.Table)))
            throw new InvalidOperationException("Seçim kontrol sonucuna ait değil.");
        if (clean && (snapshot.Request.Card.Length == 0 || selected.Any(row =>
            !row.Field<bool>("CertainInvalid") || row.Field<string>("Kart No") != snapshot.Request.Card)))
            throw new InvalidOperationException("Temizleme yalnız tek kartın kesin geçersiz seçili kayıtları için yapılır.");
        var fresh = await ReadAsync(database, snapshot.Request, cancellation).ConfigureAwait(false);
        if (fresh.FileHash != snapshot.FileHash || fresh.DbHash != snapshot.DbHash)
            throw new InvalidOperationException("DB/personel/TNF değişmiş. Önce yeniden Kontrol Et.");
        var deletions = new HashSet<int>();
        var replacements = new Dictionary<int, string>();
        var additions = new HashSet<string>(StringComparer.Ordinal);
        var dbSelections = new HashSet<(int Id, string Side)>();
        foreach (var row in selected)
        {
            cancellation.ThrowIfCancellationRequested();
            var operation = row.Field<string>("İşlem")!;
            var index = row.Field<int>("TnfIndex");
            if (clean)
            {
                if (index >= 0) deletions.Add(index);
                if (row.Field<int>("DbId") >= 0) dbSelections.Add((row.Field<int>("DbId"), row.Field<string>("Taraf")!));
                continue;
            }
            if (operation is not ("TNF EKLE" or "TNF SİL E" or "TNF SİL FAZLA" or "TNF DÜZELT"))
                throw new InvalidOperationException("İNCELE veya uyumlu satır otomatik değiştirilemez.");
            if (operation is "TNF SİL E" or "TNF SİL FAZLA") deletions.Add(index);
            else
            {
                var line = snapshot.Request.Format.Build(row.Field<string>("Kart No")!,
                    DateTime.ParseExact(row.Field<string>("Tarih")!, "dd.MM.yyyy", CultureInfo.InvariantCulture), row.Field<string>("DB Saat")!);
                if (operation == "TNF EKLE") additions.Add(line); else replacements[index] = line;
            }
        }
        foreach (var index in deletions.Concat(replacements.Keys))
            if (index < 0 || index >= snapshot.Lines.Length) throw new InvalidOperationException("TNF satır kimliği geçersiz.");
        var output = new List<string>();
        for (var index = 0; index < snapshot.Lines.Length; index++)
            if (!deletions.Contains(index)) output.Add(replacements.GetValueOrDefault(index, snapshot.Lines[index]));
        var existing = output.ToHashSet(StringComparer.Ordinal);
        output.AddRange(additions.Where(line => existing.Add(line)));
        var directory = Path.Combine(Path.GetDirectoryName(snapshot.Request.Path)!, "_YEDEK");
        Directory.CreateDirectory(directory);
        var backup = Path.Combine(directory, Path.GetFileName(snapshot.Request.Path) + $".bak_{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid():N}");
        var temporary = snapshot.Request.Path + $".tmp_REV19_{Guid.NewGuid():N}";
        using var lease = new FileStream(snapshot.Request.Path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
        if (Convert.ToHexString(await SHA256.HashDataAsync(lease, cancellation).ConfigureAwait(false)) != snapshot.FileHash)
            throw new InvalidOperationException("TNF kontrol sonrasında değişmiş.");

        FbConnection? connection = null;
        FbTransaction? transaction = null;
        var replaced = false;
        var commitAttempted = false;
        try
        {
            await File.WriteAllLinesAsync(temporary, output, snapshot.Encoding, cancellation).ConfigureAwait(false);
            cancellation.ThrowIfCancellationRequested();
            if (dbSelections.Count > 0)
            {
                connection = database.OpenConnection();
                transaction = connection.BeginTransaction();
                var byId = snapshot.Db.ToDictionary(movement => (movement.Id, movement.Side));
                var dump = new List<Dictionary<string, object?>>();
                foreach (var id in dbSelections.Select(selection => selection.Id).Distinct())
                {
                    cancellation.ThrowIfCancellationRequested();
                    using var dumpCommand = new FbCommand("select * from GIRCIK where SIRA=@Id", connection, transaction) { CommandTimeout = 60 };
                    dumpCommand.Parameters.Add(new FbParameter("@Id", id));
                    using var reader = await dumpCommand.ExecuteReaderAsync(cancellation).ConfigureAwait(false);
                    if (!await reader.ReadAsync(cancellation).ConfigureAwait(false)) throw new InvalidOperationException("DB yedeği için satır bulunamadı.");
                    var record = new Dictionary<string, object?>();
                    for (var column = 0; column < reader.FieldCount; column++)
                        record[reader.GetName(column)] = reader.IsDBNull(column) ? null : reader.GetValue(column);
                    dump.Add(record);
                }
                var dumpPath = backup + ".GIRCIK.json";
                var dumpBytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new { Version = 19, CapturedAt = DateTime.Now, Rows = dump }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                using (var dumpStream = new FileStream(dumpPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    await dumpStream.WriteAsync(dumpBytes, cancellation).ConfigureAwait(false);
                    dumpStream.Flush(true);
                }
                foreach (var selection in dbSelections)
                {
                    var movement = byId[selection];
                    if (!snapshot.People.TryGetValue(movement.Card, out var rule) || !rule.Evaluate(movement.Date).Certain)
                        throw new InvalidOperationException("Personel dönemi kesin geçersiz değil.");
                    var prefix = movement.Side == "Giriş" ? "G" : "C";
                    using var command = FirebirdDatabase.CreateCommand(connection, transaction,
                        $"update GIRCIK set {prefix}TARIH=null,{prefix}SAAT=null,{prefix}DAKIKA=null,{prefix}TUR=null " +
                        $"where SIRA=@Id and PKNO=@Card and {prefix}TARIH>=@Date and {prefix}TARIH<@End " +
                        $"and trim({prefix}SAAT)=@Time and coalesce(trim({prefix}TUR),'')=@Tur " +
                        "and exists(select 1 from KIMLIK k where k.PKNO=@Card and k.IGTARIH is not distinct from @Hire " +
                        "and k.ICTARIH is not distinct from @Exit and k.DURUM is not distinct from @Status)",
                        new FbParameter("@Id", movement.Id), new FbParameter("@Card", movement.Card),
                        new FbParameter("@Date", movement.Date), new FbParameter("@End", movement.Date.AddDays(1)),
                        new FbParameter("@Time", movement.Time), new FbParameter("@Tur", movement.Tur),
                        new FbParameter("@Hire", (object?)rule.Hire ?? DBNull.Value), new FbParameter("@Exit", (object?)rule.Exit ?? DBNull.Value),
                        new FbParameter("@Status", (object?)rule.StatusCode ?? DBNull.Value));
                    command.CommandTimeout = 60;
                    if (command.ExecuteNonQuery() != 1) throw new InvalidOperationException("Seçili DB kaydı değişmiş; temizlik geri alındı.");
                }
            }
            cancellation.ThrowIfCancellationRequested();
            File.Replace(temporary, snapshot.Request.Path, backup);
            replaced = true;
            if (transaction is not null)
            {
                commitAttempted = true;
                transaction.Commit();
            }
            Log($"correction_completed selected={selected.Length} db_sides={dbSelections.Count} backup_created=true");
            return backup;
        }
        catch (Exception exception)
        {
            if (commitAttempted)
                throw new InvalidOperationException("DB commit sonucu belirsiz. TNF yedeği korundu; tekrar düzeltmeden önce SON TAM KONTROL yapın.", exception);
            transaction?.Rollback();
            if (replaced)
            {
                lease.Dispose();
                File.Copy(backup, temporary, false);
                File.Replace(temporary, snapshot.Request.Path, null);
            }
            throw;
        }
        finally
        {
            transaction?.Dispose();
            connection?.Dispose();
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }
}
