using System.Text;
using System.Text.Json;

namespace KyPdks.Unified;

/// <summary>
/// Headless Windows polling runner. No automatic startup or Cloud deployment.
/// User-approved deployment can schedule --agent-loop only after staging.
/// </summary>
/// <remarks>
/// Default 5-minute polling protects Cloud quota. Missing credentials stop the
/// loop rather than repeatedly making unauthorized requests.
/// </remarks>
internal static class UnifiedAgentRunner
{
    internal static async Task<string> RunLoopAsync(CancellationToken cancellationToken)
    {
        var companyRoot = Environment.GetEnvironmentVariable("KY_PDKS_COMPANY_ROOT") ??
            Environment.GetEnvironmentVariable("KY_PDKS_COMPANY_ROOT",EnvironmentVariableTarget.User);
        if (string.IsNullOrWhiteSpace(companyRoot) || !Directory.Exists(companyRoot))
            return "AGENT_COMPANY_ROOT_REQUIRED";
        var dir = Path.Combine(companyRoot,"SISTEM","AgentState");
        Directory.CreateDirectory(dir);
        var lockPath=Path.Combine(dir,"unified-agent.lock");
        FileStream instanceLock;
        try
        {
            instanceLock=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
        }
        catch(IOException)
        {
            return "AGENT_ALREADY_RUNNING";
        }

        await using (instanceLock)
        {
            var minuteValue=Environment.GetEnvironmentVariable("KY_PDKS_AGENT_POLL_MINUTES");
            var pollMinutes=int.TryParse(minuteValue,out var minutes)
                ? Math.Clamp(minutes,1,60) : 5;
            var runs=0;
            while(!cancellationToken.IsCancellationRequested)
            {
                runs++;
                var started=DateTimeOffset.UtcNow;
                var result=await UnifiedSyncAgent.RunOnceAsync(cancellationToken);
                var status=new
                {
                    kind="KY_PDKS_UNIFIED_WINDOWS_AGENT",
                    pollMinutes,
                    iteration=runs,
                    lastStartedAt=started,
                    lastCompletedAt=DateTimeOffset.UtcNow,
                    result,
                    ready=result is "NO_PENDING_COMMAND" or
                        "POLICY_MIRROR_AND_CLOUD_ACK_OK" or
                        "LOCAL_RECEIPT_ACK_REPLAYED",
                    liveFirebirdWritesEnabled=false,
                    annualTnfWritesEnabled=false,
                    terminalRawWritesEnabled=false,
                };
                var path=Path.Combine(dir,"unified-agent-health.json");
                var temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
                try
                {
                    await File.WriteAllTextAsync(temp,
                        JsonSerializer.Serialize(status,new JsonSerializerOptions{WriteIndented=true}),
                        new UTF8Encoding(false),cancellationToken);
                    File.Move(temp,path,true);
                }
                finally {if(File.Exists(temp))File.Delete(temp);}

                if(result is "AGENT_CONFIG_REQUIRED" or "AGENT_COMPANY_ROOT_REQUIRED")
                    return result;
                if(cancellationToken.IsCancellationRequested)break;
                var wait=TimeSpan.FromMinutes(
                    result.StartsWith("AGENT_ERROR:",StringComparison.Ordinal) ||
                    result.StartsWith("CLOUD_ERROR:",StringComparison.Ordinal)
                        ? Math.Max(10,pollMinutes)
                        : pollMinutes);
                try{await Task.Delay(wait,cancellationToken);}
                catch(OperationCanceledException){break;}
            }
            return "AGENT_STOPPED";
        }
    }
}
