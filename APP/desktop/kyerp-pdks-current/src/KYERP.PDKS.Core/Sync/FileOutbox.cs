using System.Text.Json;

namespace KYERP.PDKS.Core.Sync;

public sealed class FileOutbox
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string pendingDirectory;
    private readonly string completedDirectory;

    public FileOutbox(string rootDirectory)
    {
        if (string.IsNullOrWhiteSpace(rootDirectory)) throw new ArgumentException("Outbox klasörü zorunludur.");
        pendingDirectory = Path.Combine(rootDirectory, "pending");
        completedDirectory = Path.Combine(rootDirectory, "completed");
        Directory.CreateDirectory(pendingDirectory);
        Directory.CreateDirectory(completedDirectory);
    }

    public async Task EnqueueAsync(SyncEnvelope envelope, CancellationToken cancellationToken = default)
    {
        var target = PendingPath(envelope.Id);
        if (File.Exists(target) || File.Exists(CompletedPath(envelope.Id))) return;
        var temporary = target + ".tmp-" + Guid.NewGuid().ToString("N");
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(envelope, JsonOptions), cancellationToken);
        File.Move(temporary, target, false);
    }

    public IReadOnlyList<SyncEnvelope> ReadPending(int limit = 100)
    {
        if (limit is < 1 or > 1000) throw new ArgumentOutOfRangeException(nameof(limit));
        return Directory.EnumerateFiles(pendingDirectory, "*.json")
            .OrderBy(path => path, StringComparer.Ordinal)
            .Select(path => JsonSerializer.Deserialize<SyncEnvelope>(File.ReadAllText(path), JsonOptions)
                ?? throw new InvalidDataException($"Outbox kaydı okunamadı: {Path.GetFileName(path)}"))
            .Where(item => item.NextAttemptAtUtc is null || item.NextAttemptAtUtc <= DateTimeOffset.UtcNow)
            .Take(limit)
            .ToArray();
    }

    public void MarkCompleted(Guid id)
    {
        var source = PendingPath(id);
        if (!File.Exists(source)) return;
        File.Move(source, CompletedPath(id), true);
    }

    public void MarkFailed(Guid id, string error, DateTimeOffset? now = null)
    {
        var path=PendingPath(id);if(!File.Exists(path))return;
        var item=JsonSerializer.Deserialize<SyncEnvelope>(File.ReadAllText(path),JsonOptions)??throw new InvalidDataException("Outbox kaydı okunamadı.");
        var attempts=item.AttemptCount+1;var delay=TimeSpan.FromSeconds(Math.Min(3600,Math.Pow(2,Math.Min(attempts,11))));
        var updated=item with {AttemptCount=attempts,NextAttemptAtUtc=(now??DateTimeOffset.UtcNow)+delay,LastError=error.Length>500?error[..500]:error};
        var temporary=path+".tmp-"+Guid.NewGuid().ToString("N");File.WriteAllText(temporary,JsonSerializer.Serialize(updated,JsonOptions));File.Move(temporary,path,true);
    }

    private string PendingPath(Guid id) => Path.Combine(pendingDirectory, $"{id:N}.json");
    private string CompletedPath(Guid id) => Path.Combine(completedDirectory, $"{id:N}.json");
}
