using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;

namespace QuickDataTool;

internal static class MonthlyDbWriter
{
    internal static async Task<string> BackupAsync(FirebirdDatabase database, CancellationToken token)
    {
        using var connection = database.OpenConnection();
        var settings = new FbConnectionStringBuilder(connection.ConnectionString);
        if (settings.DataSource is not "127.0.0.1" and not "localhost" && !settings.DataSource.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("gbak yedeği için DB sunucusu bu bilgisayarda olmalıdır; uzak DB yazması engellendi.");
        if (!File.Exists(settings.Database)) throw new FileNotFoundException("gbak için yerel DB dosyası bulunamadı.");
        var executable = FindGbak();
        var directory = Path.Combine(Path.GetDirectoryName(settings.Database)!, "_YEDEK");
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, $"DATABASE_REV21_{DateTime.Now:yyyyMMdd_HHmmss_fff}_{Guid.NewGuid():N}.fbk");
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        start.ArgumentList.Add("-b");
        start.ArgumentList.Add("-g");
        start.ArgumentList.Add($"{settings.DataSource}/{settings.Port}:{settings.Database}");
        start.ArgumentList.Add(target);
        start.Environment["ISC_USER"] = settings.UserID;
        start.Environment["ISC_PASSWORD"] = settings.Password;
        using var process = Process.Start(start) ?? throw new InvalidOperationException("gbak başlatılamadı. DB değişmedi.");
        var errors = process.StandardError.ReadToEndAsync();
        var output = process.StandardOutput.ReadToEndAsync();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMinutes(10));
        try { await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false); }
        catch { if (!process.HasExited) process.Kill(true); throw; }
        await Task.WhenAll(errors, output).ConfigureAwait(false);
        if (process.ExitCode != 0 || !File.Exists(target) || new FileInfo(target).Length == 0)
            throw new InvalidOperationException($"gbak yedeği başarısız (kod {process.ExitCode}); DB değişmedi. Firebird erişimini ve yedek klasörünü kontrol edin.");
        SyncEngine.Log($"REV21 gbak_backup_ok file={Path.GetFileName(target)} bytes={new FileInfo(target).Length}");
        return target;
    }

    static string FindGbak()
    {
        var candidates = new List<string> { Path.Combine(AppContext.BaseDirectory, "gbak.exe") };
        foreach (var root in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) })
        {
            var firebird = Path.Combine(root, "Firebird");
            if (Directory.Exists(firebird)) candidates.AddRange(Directory.GetFiles(firebird, "gbak.exe", SearchOption.AllDirectories));
        }
        foreach (var path in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            if (!string.IsNullOrWhiteSpace(path)) candidates.Add(Path.Combine(path, "gbak.exe"));
        return candidates.FirstOrDefault(File.Exists) ?? throw new FileNotFoundException("Firebird gbak.exe yok. Yedeksiz DB işlemi yapılamaz; DB değişmedi.");
    }

    internal static void ValidatePlan(MonthlyDbSnapshot snapshot, MonthlyIssue[] operations)
    {
        if (snapshot.WritesBlocked) throw new InvalidOperationException("GIRCIK veya DB trigger'ı mevcut. Trigger ezilmez; DB yazması engellendi.");
        if (snapshot.Request.End != snapshot.Request.Start.AddMonths(1)) throw new InvalidOperationException("DB işlemi yalnız seçili ayda yapılabilir.");
        if (operations.Length == 0 || operations.Any(operation => !operation.Safe || operation.Day < snapshot.Request.Start || operation.Day >= snapshot.Request.End || snapshot.LockedCards.Contains(operation.Card) ||
            operation.Kind != "EKLE" && !MonthlyDbAudit.SafeKinds.Contains(operation.Kind))) throw new InvalidOperationException("DB işlem planı güvenli değil veya dönem/kilit dışı.");
        if (operations.GroupBy(operation => (operation.Card, operation.Day, operation.Id, operation.Side)).Any(group => group.Count() > 1)) throw new InvalidOperationException("DB planında tekrarlı taraf var.");
        var eligible = MonthlyDbAudit.Complete(snapshot, CompletionSettings.For(snapshot.WorkHours, false, true, true, false), "", CancellationToken.None)
            .Select(operation => (operation.Card, operation.Day, operation.Id, operation.Side)).ToHashSet();
        foreach (var operation in operations)
        {
            if (operation.Kind == "EKLE")
            {
                if (!eligible.Contains((operation.Card, operation.Day, operation.Id, operation.Side)) || !MonthlyDbAudit.Clock(operation.Time, out var minute) ||
                    (operation.Side == "Giriş" ? minute < snapshot.WorkHours.EntryEarly || minute > snapshot.WorkHours.EntryLate : minute < snapshot.WorkHours.ExitEarly || minute > snapshot.WorkHours.ExitLate)) throw new InvalidOperationException("Eksik taraf üretimi takvim/tarih/saat koşullarını sağlamıyor.");
            }
            else if (!snapshot.Issues.Any(issue => issue.Safe && issue.Card == operation.Card && issue.Day == operation.Day && issue.Id == operation.Id && issue.Side == operation.Side && issue.Kind == operation.Kind && issue.Time == operation.Time))
                throw new InvalidOperationException("Silme planı DB kontrol sonucuyla eşleşmiyor.");
        }
    }

    internal static async Task<string> ApplyAsync(FirebirdDatabase database, AuditSnapshot sync, MonthlyDbSnapshot snapshot, MonthlyIssue[] operations, CancellationToken token)
    {
        ValidatePlan(snapshot, operations);
        var backup = await BackupAsync(database, token).ConfigureAwait(false);
        token.ThrowIfCancellationRequested();
        using var connection = database.OpenConnection();
        using var transaction = connection.BeginTransaction(new FbTransactionOptions { TransactionBehavior = FbTransactionBehavior.Write | FbTransactionBehavior.Consistency | FbTransactionBehavior.NoWait });
        try
        {
            var fresh = MonthlyDbAudit.Read(database, sync, token, connection, transaction);
            if (fresh.Fingerprint != snapshot.Fingerprint) throw new InvalidOperationException("DB/personel/izin/plan/trigger değişti; yeniden kontrol edin. İşlem geri alındı.");
            ValidatePlan(fresh, operations);
            var dump = snapshot.Records.AsEnumerable().Select(row => snapshot.Records.Columns.Cast<DataColumn>().ToDictionary(column => column.ColumnName, column => row[column] == DBNull.Value ? null : row[column])).ToArray();
            var dumpPath = backup + ".rows.json";
            await File.WriteAllTextAsync(dumpPath, JsonSerializer.Serialize(new { Period = snapshot.Request.Start, Before = dump, Operations = operations }, new JsonSerializerOptions { WriteIndented = true }), token).ConfigureAwait(false);
            int Execute(string sql, params FbParameter[] parameters)
            {
                token.ThrowIfCancellationRequested();
                using var command = FirebirdDatabase.CreateCommand(connection, transaction, sql, parameters);
                command.CommandTimeout = 30;
                using var registration = token.Register(command.Cancel);
                return command.ExecuteNonQuery();
            }
            foreach (var operation in operations.Where(operation => operation.Kind != "EKLE"))
            {
                var prefix = operation.Side == "Giriş" ? "G" : operation.Side == "Çıkış" ? "C" : throw new InvalidOperationException("Taraf belirsiz.");
                var affected = Execute($"update GIRCIK set {prefix}TARIH=null,{prefix}SAAT=null,{prefix}DAKIKA=null,{prefix}TUR=null where SIRA=@I and PKNO=@P and {prefix}TARIH=@D and {prefix}SAAT=@T",
                    new("@I", operation.Id), new("@P", operation.Card), new("@D", operation.Day), new("@T", operation.Time));
                if (affected != 1) throw new InvalidOperationException("DB satırı değişti/tekil değil; tüm işlem geri alındı.");
                Execute("delete from GIRCIK where SIRA=@I and PKNO=@P and GTARIH is null and CTARIH is null and (GSAAT is null or trim(GSAAT)='') and (CSAAT is null or trim(CSAAT)='')", new("@I", operation.Id), new("@P", operation.Card));
            }
            using var maxCommand = new FbCommand("select coalesce(max(SIRA),0) from GIRCIK", connection, transaction);
            var nextId = Convert.ToInt32(maxCommand.ExecuteScalar()) + 1;
            foreach (var group in operations.Where(operation => operation.Kind == "EKLE").GroupBy(operation => (operation.Card, operation.Day, operation.Id)))
            {
                var id = group.Key.Id;
                if (id < 0)
                {
                    id = nextId++;
                    if (Execute("insert into GIRCIK (SIRA,PKNO,MKOD) values (@I,@P,'000')", new("@I", id), new("@P", group.Key.Card)) != 1) throw new InvalidOperationException("Yeni satır oluşturulamadı.");
                }
                foreach (var operation in group)
                {
                    if (!MonthlyDbAudit.Clock(operation.Time, out var minute)) throw new InvalidOperationException("Üretilen saat geçersiz.");
                    var prefix = operation.Side == "Giriş" ? "G" : "C";
                    var affected = Execute($"update GIRCIK set {prefix}TARIH=@D,{prefix}SAAT=@T,{prefix}DAKIKA=@M,{prefix}TUR='' where SIRA=@I and PKNO=@P and {prefix}TARIH is null and ({prefix}SAAT is null or trim({prefix}SAAT)='')",
                        new("@D", operation.Day), new("@T", operation.Time), new("@M", minute), new("@I", id), new("@P", operation.Card));
                    if (affected != 1) throw new InvalidOperationException("Eksik taraf artık boş değil; gerçek saat korunarak işlem geri alındı.");
                }
            }
            token.ThrowIfCancellationRequested();
            transaction.Commit();
            SyncEngine.Log($"REV21 db_batch_committed count={operations.Length} backup={Path.GetFileName(backup)}");
            return backup;
        }
        catch { try { transaction.Rollback(); } catch { } throw; }
    }
}
