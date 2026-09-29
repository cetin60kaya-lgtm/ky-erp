using System.Globalization;
using System.Text.Json;
using FirebirdSql.Data.FirebirdClient;
using KYERP.PDKS.Core;
using KYERP.PDKS.Core.Leave;

namespace HKN.Personel.Native;

internal sealed record PdksCloudChange(string Id,string EntityType,string EntityId,string Operation,string Source,string PayloadJson,string ReceivedAt);

internal static class PdksCloudInbox
{
    static string CursorFile=>Path.Combine(CompanyDataPaths.Config,"cloud-inbox-cursor.txt");
    static string AppliedFile=>Path.Combine(CompanyDataPaths.Config,"cloud-inbox-applied.log");
    static string Cursor{get{try{return File.Exists(CursorFile)?File.ReadAllText(CursorFile).Trim():"";}catch{return "";}}}

    public static async Task<int> PullAndApplyAsync(PdksCloudCredential credential,CancellationToken ct=default)
    {
        var root=await PdksCloudAgent.GetAsync(credential,"/api/auth/pdks-device/sync-events/pull?limit=100"+(string.IsNullOrWhiteSpace(Cursor)?"":"&cursor="+Uri.EscapeDataString(Cursor)),ct);
        if(!root.TryGetProperty("data",out var data)||data.ValueKind!=JsonValueKind.Object)return 0;
        var applied=0;
        if(data.TryGetProperty("changes",out var changes)&&changes.ValueKind==JsonValueKind.Array)
        {
            foreach(var node in changes.EnumerateArray())
            {
                var change=new PdksCloudChange(
                    Text(node,"id"),Text(node,"entityType"),Text(node,"entityId"),Text(node,"operation"),Text(node,"source"),Text(node,"payloadJson"),Text(node,"receivedAt"));
                if(AlreadyApplied(change.Id))continue;
                Apply(change);
                AppendApplied(change.Id);
                applied++;
            }
        }
        var cursor=data.TryGetProperty("cursor",out var c)?c.GetString()??"":"";
        if(!string.IsNullOrWhiteSpace(cursor)){Directory.CreateDirectory(CompanyDataPaths.Config);File.WriteAllText(CursorFile,cursor);}
        return applied;
    }

    static void Apply(PdksCloudChange change)
    {
        if(!string.Equals(change.Source,"WEB",StringComparison.OrdinalIgnoreCase)&&!string.Equals(change.Source,"TABLET",StringComparison.OrdinalIgnoreCase))return;
        using var payload=JsonDocument.Parse(string.IsNullOrWhiteSpace(change.PayloadJson)?"{}":change.PayloadJson);
        var root=payload.RootElement;
        var code=Text(root,"personnelCode");
        if(string.IsNullOrWhiteSpace(code))return;
        if(string.Equals(change.EntityType,"PERSONNEL",StringComparison.OrdinalIgnoreCase))ApplyPersonnel(code,root);
        else if(string.Equals(change.EntityType,"LEAVE",StringComparison.OrdinalIgnoreCase))ApplyLeave(code,root);
    }

    static void ApplyPersonnel(string code,JsonElement payload)
    {
        if(!payload.TryGetProperty("body",out var body)||!body.TryGetProperty("changes",out var changes)||changes.ValueKind!=JsonValueKind.Object)return;
        var database=new FirebirdDatabase(PdksOptions.FromEnvironment());
        database.InTransaction((connection,tx)=>{
            var sets=new List<string>();var pars=new List<FbParameter>();
            if(changes.TryGetProperty("fullName",out var full)){var parts=(full.GetString()??"").Trim().Split(' ',StringSplitOptions.RemoveEmptyEntries);if(parts.Length>0){sets.Add("AD=@AD");pars.Add(new("@AD",parts[0].ToUpper(new CultureInfo("tr-TR"))));sets.Add("SOYAD=@SOYAD");pars.Add(new("@SOYAD",string.Join(" ",parts.Skip(1)).ToUpper(new CultureInfo("tr-TR"))));}}
            if(changes.TryGetProperty("salary",out var salary)&&salary.TryGetDecimal(out var amount)){sets.Add("MAAS=@MAAS");pars.Add(new("@MAAS",amount));}
            if(changes.TryGetProperty("startDate",out var start)&&DateTime.TryParse(start.GetString(),out var startDate)){sets.Add("IGTARIH=@IGTARIH");pars.Add(new("@IGTARIH",startDate.Date));}
            if(changes.TryGetProperty("exitDate",out var exit)&&DateTime.TryParse(exit.GetString(),out var exitDate)){sets.Add("ICTARIH=@ICTARIH");pars.Add(new("@ICTARIH",exitDate.Date));}
            if(!sets.Any())return 0;
            pars.Add(new("@PK",code));
            using var command=FirebirdDatabase.CreateCommand(connection,tx,"update KIMLIK set "+string.Join(',',sets)+" where PKNO=@PK",pars.ToArray());
            return command.ExecuteNonQuery();
        });
    }

    static void ApplyLeave(string code,JsonElement payload)
    {
        if(!payload.TryGetProperty("responseData",out var response)||response.ValueKind!=JsonValueKind.Object)return;
        if(!response.TryGetProperty("days",out var days)||days.ValueKind!=JsonValueKind.Array)return;
        string reason=Text(response,"leaveType");
        if(response.TryGetProperty("leaveType",out var leaveType)&&leaveType.ValueKind==JsonValueKind.Object)reason=Text(leaveType,"name");
        if(string.IsNullOrWhiteSpace(reason))reason="WEB İZİN";
        var records=new List<LeaveRecord>();
        foreach(var row in days.EnumerateArray())
        {
            if(!DateTime.TryParse(Text(row,"date"),out var date))continue;
            var fraction=Number(row,"leaveFraction",1m); if(fraction<=0)continue;
            var minutes=Math.Max(1,(int)Math.Round(LeaveEntryValidator.FullDayMinutes*fraction));
            var dayPart=Text(row,"dayPart").ToUpperInvariant();
            var start=dayPart.Contains("AFTER")||dayPart.Contains("PM")?"14:00":"08:30";
            var end=minutes>=LeaveEntryValidator.FullDayMinutes?"18:30":DateTime.ParseExact(start,"HH:mm",CultureInfo.InvariantCulture).AddMinutes(minutes).ToString("HH:mm");
            var paid=reason.Contains("YILLIK",StringComparison.OrdinalIgnoreCase)||reason.Contains("ÜCRETLİ",StringComparison.OrdinalIgnoreCase);
            records.Add(new(code,date.Date,start,end,minutes,paid?"ÜCRETLİ":"ÜCRETSİZ",reason,paid?LeavePayrollArea.Paid:LeavePayrollArea.Unpaid));
        }
        if(records.Count>0)new LeaveRepository(new FirebirdDatabase(PdksOptions.FromEnvironment())).AddMany(records);
    }

    static bool AlreadyApplied(string id){try{return File.Exists(AppliedFile)&&File.ReadLines(AppliedFile).Any(x=>string.Equals(x,id,StringComparison.Ordinal));}catch{return false;}}
    static void AppendApplied(string id){Directory.CreateDirectory(CompanyDataPaths.Config);File.AppendAllLines(AppliedFile,[id]);}
    static string Text(JsonElement node,string name)=>node.ValueKind==JsonValueKind.Object&&node.TryGetProperty(name,out var value)?value.ValueKind==JsonValueKind.String?value.GetString()??"":value.ToString():"";
    static decimal Number(JsonElement node,string name,decimal fallback)=>node.ValueKind==JsonValueKind.Object&&node.TryGetProperty(name,out var value)&&value.TryGetDecimal(out var n)?n:fallback;
}
