using FirebirdSql.Data.FirebirdClient;

namespace KYERP.PDKS.Core.Definitions;

public enum OrganizationDefinitionKind { Group, Department, Status, Service, Duty, Company }

public sealed record DefinitionUsage(string Field, int Count);

public static class DefinitionUsageGuard
{
    static readonly IReadOnlyDictionary<OrganizationDefinitionKind, (string Table, string Column, string Label)[]> References =
        new Dictionary<OrganizationDefinitionKind, (string, string, string)[]>
        {
            [OrganizationDefinitionKind.Group] = [("KIMLIK","GRUP","KIMLIK.GRUP"),("DONEM","GRUP","DONEM.GRUP")],
            [OrganizationDefinitionKind.Department] = [("KIMLIK","BOLUM","KIMLIK.BOLUM")],
            [OrganizationDefinitionKind.Status] = [("KIMLIK","DURUM","KIMLIK.DURUM")],
            [OrganizationDefinitionKind.Service] = [("KIMLIK","SERVIS","KIMLIK.SERVIS")],
            [OrganizationDefinitionKind.Duty] = [("KIMLIK","GOREV","KIMLIK.GOREV")],
            [OrganizationDefinitionKind.Company] = [("KIMLIK","SIRKET","KIMLIK.SIRKET")]
        };

    public static IReadOnlyList<string> ReferenceFields(OrganizationDefinitionKind kind) =>
        References[kind].Select(reference=>reference.Label).ToArray();

    public static IReadOnlyList<DefinitionUsage> FindUsage(FirebirdDatabase database, OrganizationDefinitionKind kind, object code)
    {
        var result=new List<DefinitionUsage>();
        foreach(var reference in References[kind])
        {
            var count=Convert.ToInt32(database.Scalar($"select count(*) from {reference.Table} where {reference.Column}=@K",new FbParameter("@K",code)));
            if(count>0)result.Add(new DefinitionUsage(reference.Label,count));
        }
        return result;
    }

    public static string BlockMessage(IReadOnlyList<DefinitionUsage> usage) =>
        "Tanım kullanıldığı için silinemez:\n"+string.Join("\n",usage.Select(item=>$"- {item.Field}: {item.Count} kayıt"));
}

public static class PeriodDefinitionGuard
{
    public static bool IsExactDuplicate(int existingGroup, DateTime existingStart, DateTime existingEnd, int group, DateTime start, DateTime end) =>
        existingGroup==group && existingStart.Date==start.Date && existingEnd.Date==end.Date;

    public static void Validate(DateTime start, DateTime end, int group)
    {
        if(end.Date<start.Date)throw new ArgumentException("Dönem bitişi başlangıçtan önce olamaz.");
        if(group<=0)throw new ArgumentException("Dönem için grup seçin.");
    }

    public static bool IsDuplicate(FirebirdDatabase database, int group, DateTime start, DateTime end, int? excludedCode=null)
    {
        var sql="select count(*) from DONEM where GRUP=@G and BASTAR=@A and BITTAR=@B"+(excludedCode.HasValue?" and KOD<>@K":"");
        var parameters=new List<FbParameter>{new("@G",group),new("@A",start.Date),new("@B",end.Date)};
        if(excludedCode.HasValue)parameters.Add(new FbParameter("@K",excludedCode.Value));
        return Convert.ToInt32(database.Scalar(sql,parameters.ToArray()))>0;
    }
}
