using System.Text.Json;

namespace HKN.Personel.Native;

internal sealed record ServiceRouteProfile(
    int ServiceCode,
    string RouteName,
    bool Active,
    string MorningDeparture,
    string EveningReturn,
    string VehiclePlate,
    string DriverName,
    string DriverPhone,
    string Stops,
    string Notes);

internal static class ServiceRouteStore
{
    static readonly object Gate=new();
    static readonly JsonSerializerOptions Json=new(){WriteIndented=true};
    static string FileName=>Path.Combine(CompanyDataPaths.Config,"service-routes.json");

    public static IReadOnlyDictionary<int,ServiceRouteProfile> Load()
    {
        lock(Gate)
        {
            try
            {
                CompanyDataPaths.Ensure();
                if(!File.Exists(FileName))return new Dictionary<int,ServiceRouteProfile>();
                var items=JsonSerializer.Deserialize<List<ServiceRouteProfile>>(File.ReadAllText(FileName),Json)??[];
                return items.ToDictionary(x=>x.ServiceCode);
            }
            catch{return new Dictionary<int,ServiceRouteProfile>();}
        }
    }

    public static void Save(ServiceRouteProfile profile)
    {
        lock(Gate)
        {
            var items=Load().ToDictionary(x=>x.Key,x=>x.Value);
            items[profile.ServiceCode]=profile;
            Directory.CreateDirectory(Path.GetDirectoryName(FileName)!);
            var temp=FileName+".tmp";
            File.WriteAllText(temp,JsonSerializer.Serialize(items.Values.OrderBy(x=>x.ServiceCode).ToArray(),Json));
            File.Move(temp,FileName,true);
        }
    }

    public static void Remove(int code)
    {
        lock(Gate)
        {
            var items=Load().ToDictionary(x=>x.Key,x=>x.Value);
            if(!items.Remove(code))return;
            var temp=FileName+".tmp";
            File.WriteAllText(temp,JsonSerializer.Serialize(items.Values.OrderBy(x=>x.ServiceCode).ToArray(),Json));
            File.Move(temp,FileName,true);
        }
    }
}
