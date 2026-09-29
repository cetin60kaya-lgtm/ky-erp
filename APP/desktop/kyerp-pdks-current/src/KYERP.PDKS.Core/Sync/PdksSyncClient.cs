using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace KYERP.PDKS.Core.Sync;

public sealed record SyncPushResponse(bool Accepted,string? Cursor=null);
public sealed record SyncPullResponse(string? Cursor,IReadOnlyList<JsonElement> Changes);

public sealed class PdksSyncClient(HttpClient httpClient,PdksOptions options)
{
    public async Task<SyncPushResponse> PushAsync(SyncEnvelope envelope,CancellationToken cancellationToken=default)
    {
        EnsureReady();using var request=new HttpRequestMessage(HttpMethod.Post,new Uri(options.ApiBaseUri!,"api/pdks/sync/push"));
        request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",options.ApiAccessToken);request.Headers.Add("Idempotency-Key",envelope.IdempotencyKey);request.Content=JsonContent.Create(envelope);
        using var response=await httpClient.SendAsync(request,cancellationToken);if(!response.IsSuccessStatusCode)throw new HttpRequestException($"PDKS sync push HTTP {(int)response.StatusCode}.",null,response.StatusCode);
        return await response.Content.ReadFromJsonAsync<SyncPushResponse>(cancellationToken:cancellationToken)??new SyncPushResponse(true);
    }

    public async Task<SyncPullResponse> PullAsync(string? cursor,CancellationToken cancellationToken=default)
    {
        EnsureReady();var query=$"api/pdks/sync/pull?tenantId={Uri.EscapeDataString(options.TenantId!)}&companyId={Uri.EscapeDataString(options.CompanyId!)}&workplaceId={Uri.EscapeDataString(options.WorkplaceId!)}"+(string.IsNullOrWhiteSpace(cursor)?"":"&cursor="+Uri.EscapeDataString(cursor));
        using var request=new HttpRequestMessage(HttpMethod.Get,new Uri(options.ApiBaseUri!,query));request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",options.ApiAccessToken);
        using var response=await httpClient.SendAsync(request,cancellationToken);if(!response.IsSuccessStatusCode)throw new HttpRequestException($"PDKS sync pull HTTP {(int)response.StatusCode}.",null,response.StatusCode);
        return await response.Content.ReadFromJsonAsync<SyncPullResponse>(cancellationToken:cancellationToken)??new SyncPullResponse(cursor,[]);
    }

    void EnsureReady()
    {
        if(options.ApiBaseUri is null)throw new InvalidOperationException("KY_PDKS_API_BASE_URL tanımlı değil.");
        if(string.IsNullOrWhiteSpace(options.ApiAccessToken))throw new InvalidOperationException("KY_PDKS_API_TOKEN/session tanımlı değil.");
        if(string.IsNullOrWhiteSpace(options.TenantId)||string.IsNullOrWhiteSpace(options.CompanyId)||string.IsNullOrWhiteSpace(options.WorkplaceId))throw new InvalidOperationException("Tenant/company/workplace bağlamı eksik.");
    }
}
