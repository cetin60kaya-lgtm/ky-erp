namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly System.Windows.Forms.Timer cloudSyncTimer=new(){Interval=15000};
    bool cloudSyncBusy;

    void InitializeCloudSync()
    {
        cloudSyncTimer.Tick+=async(_,_)=>await CheckCloudSyncAsync();
        cloudSyncTimer.Start();
        FormClosed+=(_,_)=>cloudSyncTimer.Stop();
        _=CheckCloudSyncAsync();
    }

    async Task CheckCloudSyncAsync()
    {
        if(cloudSyncBusy||IsDisposed)return;
        cloudSyncBusy=true;
        try
        {
            var result=await PdksCloudAgent.RunOnceAsync();
            if(!IsDisposed&&!terminalAutoBusy)leadStatus.Text=result;
        }
        finally{cloudSyncBusy=false;}
    }
}
