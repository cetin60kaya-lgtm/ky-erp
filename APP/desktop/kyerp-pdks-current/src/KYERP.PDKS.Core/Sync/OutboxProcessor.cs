namespace KYERP.PDKS.Core.Sync;

public sealed record OutboxProcessResult(int Sent,int Failed);

public sealed class OutboxProcessor(FileOutbox outbox,PdksSyncClient client)
{
    public async Task<OutboxProcessResult> ProcessAsync(int limit=50,CancellationToken cancellationToken=default)
    {
        var sent=0;var failed=0;
        foreach(var item in outbox.ReadPending(limit))
        {
            try{var response=await client.PushAsync(item,cancellationToken);if(!response.Accepted)throw new InvalidOperationException("API olayı kabul etmedi.");outbox.MarkCompleted(item.Id);sent++;}
            catch(OperationCanceledException){throw;}
            catch(Exception exception){outbox.MarkFailed(item.Id,exception.Message);failed++;}
        }
        return new OutboxProcessResult(sent,failed);
    }
}
