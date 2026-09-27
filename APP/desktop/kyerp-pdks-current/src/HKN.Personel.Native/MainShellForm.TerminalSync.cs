using System.Globalization;

namespace HKN.Personel.Native;

public sealed partial class MainShellForm
{
    readonly System.Windows.Forms.Timer terminalAutoTimer = new(){Interval=30000};
    bool terminalAutoBusy;
    void InitializeTerminalAutoSync()
    {
        terminalAutoTimer.Tick+=async(_,_)=>await CheckTerminalAutoSyncAsync();
        terminalAutoTimer.Start();
        FormClosed+=(_,_)=>terminalAutoTimer.Stop();
        _=CheckTerminalAutoSyncAsync();
    }
    async Task CheckTerminalAutoSyncAsync()
    {
        if(terminalAutoBusy||IsDisposed)return;var settings=TerminalSyncService.LoadSettings();if(!settings.Enabled)return;
        var now=DateTime.Now;var hm=now.ToString("HH:mm",CultureInfo.InvariantCulture);if(!settings.Times.Contains(hm,StringComparer.Ordinal))return;
        var key=$"{now:yyyyMMdd}|{hm}";var state=TerminalSyncService.ReadState();if(string.Equals(state?.ScheduleKey,key,StringComparison.Ordinal))return;
        terminalAutoBusy=true;
        try
        {
            var result=await TerminalSyncService.SyncAsync("Otomatik",key);
            if(!IsDisposed){leadStatus.Text=result.ReadCount>0?$"Eşitleme {result.LastAt:HH:mm} • {result.ReadCount} kayıt":"Eşitleme "+result.LastAt?.ToString("HH:mm");}
        }
        finally{terminalAutoBusy=false;}
    }
}
