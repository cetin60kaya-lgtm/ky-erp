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
            .Take(limit)
            .Select(path => JsonSerializer.Deserialize<SyncEnvelope>(File.ReadAllText(path), JsonOptions)
                ?? throw new InvalidDataException($"Outbox kaydı okunamadı: {Path.GetFileName(path)}"))
            .ToArray();
    }

    public void MarkCompleted(Guid id)
    {
        var source = PendingPath(id);
        if (!File.Exists(source)) return;
        File.Move(source, CompletedPath(id), true);
    }

    private string PendingPath(Guid id) => Path.Combine(pendingDirectory, $"{id:N}.json");
    private string CompletedPath(Guid id) => Path.Combine(completedDirectory, $"{id:N}.json");
}
