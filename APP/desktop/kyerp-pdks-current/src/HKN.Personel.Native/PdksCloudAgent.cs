using System.Net.Http.Json;
using System.Text.Json;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Attendance;
using KYERP.PDKS.Core.Sync;
using KYERP.PDKS.Core.Terminal;

namespace HKN.Personel.Native;

internal sealed record PdksCloudCredential(string DeviceId,string Secret,string Company);
internal sealed record PdksCloudJob(string Id,string Command,JsonElement Payload);

internal static class PdksCloudAgent
{
    static readonly HttpClient Http = new(){BaseAddress=new Uri("https://api.kyerp.net"),Timeout=TimeSpan.FromSeconds(25)};
    static readonly SemaphoreSlim Gate = new(1,1);
    static DateTime lastHeartbeat=DateTime.MinValue;
    static string? lastMessage;
    static string OutboxRoot => Path.Combine(CompanyDataPaths.Config,"CloudOutbox");
    public static string Status => lastMessage ?? "Bulut bağlantısı bekleniyor";

    public static PdksCloudCredential? LoadCredential()
    {
        string Read(string name)
        {
            var value=Environment.GetEnvironmentVariable(name);
            if(!string.IsNullOrWhiteSpace(value))return value.Trim();
            try{return Environment.GetEnvironmentVariable(name,EnvironmentVariableTarget.User)?.Trim()??"";}catch{return "";}
        }
        var id=Read("KY_PDKS_DEVICE_ID");var secret=Read("KY_PDKS_DEVICE_SECRET");var company=Read("KY_PDKS_DEVICE_COMPANY");
        if(string.IsNullOrWhiteSpace(id)||string.IsNullOrWhiteSpace(secret))return null;
        return new(id,secret,string.IsNullOrWhiteSpace(company)?"mecit-hakan":company);
    }

    public static async Task EnqueueTerminalSyncAsync(IReadOnlyList<TerminalDevicePunch> punches,AttendanceImportResult imported,CancellationToken ct=default)
    {
        var options=PdksOptions.FromEnvironment();
        var tenant=options.TenantId??"kyerp";var company=options.CompanyId??LoadCredential()?.Company??"mecit-hakan";var workplace=options.WorkplaceId??"main";
        var envelope=new SyncEnvelope(Guid.NewGuid(),tenant,company,workplace,"TERMINAL_BATCH","UPSERT",$"terminal:{DateTimeOffset.UtcNow:O}",DateTimeOffset.UtcNow,
            JsonSerializer.Serialize(new{
                source="TERMINAL",deviceId=LoadCredential()?.DeviceId??Environment.MachineName,version=1,syncStatus="PENDING",
                count=punches.Count,inserted=imported.Inserted,updated=imported.Updated,duplicates=imported.Duplicates,skipped=imported.Skipped,
                firstAt=punches.Count>0?punches.Min(x=>x.OccurredAt):DateTime.MinValue,lastAt=punches.Count>0?punches.Max(x=>x.OccurredAt):DateTime.MinValue
            }));
        await new FileOutbox(OutboxRoot).EnqueueAsync(envelope,ct);
    }

    public static async Task<string> RunOnceAsync(CancellationToken ct=default)
    {
        if(!await Gate.WaitAsync(0,ct))return Status;
        try
        {
            var credential=LoadCredential();
            if(credential is null){lastMessage="Bulut cihaz anahtarı bekleniyor";return lastMessage;}
            await FlushOutboxAsync(credential,ct);
            if(DateTime.Now-lastHeartbeat>TimeSpan.FromMinutes(1)){await SendAsync(credential,HttpMethod.Post,"/api/auth/pdks-device/heartbeat",new{},ct);lastHeartbeat=DateTime.Now;}
            var job=await NextJobAsync(credential,ct);
            if(job is not null)await ExecuteJobAsync(credential,job,ct);
            lastMessage=$"Bulut bağlı • {DateTime.Now:HH:mm:ss}";
            return lastMessage;
        }
        catch(Exception ex){lastMessage="Bulut bekliyor • "+ex.Message;return lastMessage;}
        finally{Gate.Release();}
    }

    static async Task FlushOutboxAsync(PdksCloudCredential credential,CancellationToken ct)
    {
        var outbox=new FileOutbox(OutboxRoot);
        foreach(var item in outbox.ReadPending(100))
        {
            try
            {
                await SendAsync(credential,HttpMethod.Post,"/api/auth/pdks-device/sync-events/push",new{
                    id=item.Id.ToString(),idempotencyKey=item.IdempotencyKey,item.EntityType,item.Operation,item.EntityId,item.OccurredAtUtc,item.PayloadJson
                },ct,item.IdempotencyKey);
                outbox.MarkCompleted(item.Id);
            }
            catch(Exception ex){outbox.MarkFailed(item.Id,ex.Message);break;}
        }
    }

    static async Task<PdksCloudJob?> NextJobAsync(PdksCloudCredential credential,CancellationToken ct)
    {
        var root=await SendAsync(credential,HttpMethod.Get,"/api/auth/pdks-device/jobs/next",null,ct);
        if(!root.TryGetProperty("data",out var data)||data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)return null;
        var id=data.TryGetProperty("id",out var idNode)?idNode.GetString()??"":"";
        var command=data.TryGetProperty("command",out var cmdNode)?cmdNode.GetString()??"":"";
        var payload=data.TryGetProperty("payload",out var p)?p.Clone():JsonDocument.Parse("{}").RootElement.Clone();
        return string.IsNullOrWhiteSpace(id)?null:new(id,command,payload);
    }

    static async Task ExecuteJobAsync(PdksCloudCredential credential,PdksCloudJob job,CancellationToken ct)
    {
        if(!string.Equals(job.Command,"SYNC_TERMINAL",StringComparison.OrdinalIgnoreCase))
        {
            await CompleteJobAsync(credential,job.Id,false,new{message="Desteklenmeyen komut"},ct);return;
        }
        var result=await TerminalSyncService.SyncAsync("Web/Tablet",null,ct);
        var success=result.ReadCount==0 || (result.DeviceCleared && result.Skipped==0);
        await CompleteJobAsync(credential,job.Id,success,new{
            ok=success,result.ReadCount,result.Inserted,result.Updated,result.Duplicates,result.Skipped,result.DeviceCleared,result.Message,lastAt=result.LastAt
        },ct);
    }

    static async Task CompleteJobAsync(PdksCloudCredential credential,string id,bool success,object detail,CancellationToken ct)
    {
        await SendAsync(credential,HttpMethod.Post,$"/api/auth/pdks-device/jobs/{Uri.EscapeDataString(id)}/result",new{ok=success,status=success?"SUCCESS":"ERROR",detail},ct);
    }

    static async Task<JsonElement> SendAsync(PdksCloudCredential credential,HttpMethod method,string path,object? body,CancellationToken ct,string? idempotencyKey=null)
    {
        using var request=new HttpRequestMessage(method,path);
        request.Headers.Add("X-KYERP-PDKS-Device",credential.DeviceId);request.Headers.Add("X-KYERP-PDKS-Secret",credential.Secret);
        if(!string.IsNullOrWhiteSpace(idempotencyKey))request.Headers.Add("Idempotency-Key",idempotencyKey);
        if(body is not null)request.Content=JsonContent.Create(body);
        using var response=await Http.SendAsync(request,ct);var raw=await response.Content.ReadAsStringAsync(ct);
        using var doc=JsonDocument.Parse(string.IsNullOrWhiteSpace(raw)?"{}":raw);var root=doc.RootElement.Clone();
        if(!response.IsSuccessStatusCode)throw new InvalidOperationException(root.TryGetProperty("error",out var error)&&error.TryGetProperty("message",out var message)?message.GetString()??$"HTTP {(int)response.StatusCode}":$"HTTP {(int)response.StatusCode}");
        return root;
    }
}
