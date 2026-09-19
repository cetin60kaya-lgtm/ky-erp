using System.Text.Json;

namespace KYERP.PDKS.Core.Sync;

public sealed record SyncEnvelope(
    Guid Id,
    string TenantId,
    string CompanyId,
    string WorkplaceId,
    string EntityType,
    string Operation,
    string EntityId,
    DateTimeOffset OccurredAtUtc,
    string PayloadJson,
    int AttemptCount = 0,
    DateTimeOffset? NextAttemptAtUtc = null,
    string? LastError = null)
{
    public static SyncEnvelope Create(
        PdksOptions options,
        string entityType,
        string operation,
        string entityId,
        object payload,
        DateTimeOffset? occurredAtUtc = null)
    {
        var tenant = Require(options.TenantId, "KY_PDKS_TENANT_ID");
        var company = Require(options.CompanyId, "KY_PDKS_COMPANY_ID");
        var workplace = Require(options.WorkplaceId, "KY_PDKS_WORKPLACE_ID");
        return new SyncEnvelope(
            Guid.NewGuid(), tenant, company, workplace,
            Require(entityType, nameof(entityType)),
            Require(operation, nameof(operation)),
            Require(entityId, nameof(entityId)),
            occurredAtUtc ?? DateTimeOffset.UtcNow,
            JsonSerializer.Serialize(payload));
    }

    public string IdempotencyKey => $"pdks:{TenantId}:{CompanyId}:{WorkplaceId}:{Id:N}";

    private static string Require(string? value, string name) =>
        string.IsNullOrWhiteSpace(value) ? throw new InvalidOperationException($"{name} zorunludur.") : value.Trim();
}
