using System.Data;
using System.Text.Json;
using KYERP.PDKS.Core;

namespace HKN.Personel.Native;

internal sealed record AttendanceGroupPolicy(
    int GroupCode,
    string GroupName,
    bool RequireCardTracking,
    string Mode);

internal static class AttendanceGroupPolicyStore
{
    static readonly object Gate = new();
    static readonly JsonSerializerOptions Json = new() { WriteIndented = true };
    static string PathName => Path.Combine(CompanyDataPaths.Config, "attendance-group-policies.json");

    public static IReadOnlyDictionary<int, AttendanceGroupPolicy> Load(FirebirdDatabase db)
    {
        lock (Gate)
        {
            CompanyDataPaths.Ensure();
            var saved = ReadFile().ToDictionary(x => x.GroupCode);
            var groups = db.Query("select KOD,AD from GRUP order by KOD");
            var changed = false;

            foreach (System.Data.DataRow row in groups.Rows)
            {
                var code = Convert.ToInt32(row["KOD"]);
                var name = Convert.ToString(row["AD"])?.Trim() ?? "";
                if (saved.TryGetValue(code, out var existing))
                {
                    if (!string.Equals(existing.GroupName, name, StringComparison.Ordinal))
                    {
                        saved[code] = existing with { GroupName = name };
                        changed = true;
                    }
                    continue;
                }

                var require = !IsAdministrative(name);
                saved[code] = new AttendanceGroupPolicy(
                    code,
                    name,
                    require,
                    require ? "Kart Takipli" : "Kart Takipsiz");
                changed = true;
            }

            var validCodes = groups.AsEnumerable().Select(r => Convert.ToInt32(r["KOD"])).ToHashSet();
            foreach (var code in saved.Keys.Where(x => !validCodes.Contains(x)).ToArray())
            {
                saved.Remove(code);
                changed = true;
            }

            if (changed) WriteFile(saved.Values);
            return saved;
        }
    }

    public static bool RequiresCardTracking(
        IReadOnlyDictionary<int, AttendanceGroupPolicy> policies,
        int groupCode,
        string groupName)
    {
        if (policies.TryGetValue(groupCode, out var policy)) return policy.RequireCardTracking;
        return !IsAdministrative(groupName);
    }

    public static void Save(FirebirdDatabase db, int groupCode, string groupName, bool requireCardTracking)
    {
        lock (Gate)
        {
            var items = Load(db).ToDictionary(x => x.Key, x => x.Value);
            items[groupCode] = new AttendanceGroupPolicy(
                groupCode,
                groupName.Trim(),
                requireCardTracking,
                requireCardTracking ? "Kart Takipli" : "Kart Takipsiz");
            WriteFile(items.Values);
        }
    }

    static List<AttendanceGroupPolicy> ReadFile()
    {
        try
        {
            if (!File.Exists(PathName)) return [];
            return JsonSerializer.Deserialize<List<AttendanceGroupPolicy>>(File.ReadAllText(PathName), Json) ?? [];
        }
        catch { return []; }
    }

    static void WriteFile(IEnumerable<AttendanceGroupPolicy> items)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(PathName)!);
        var temp = PathName + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(items.OrderBy(x => x.GroupCode).ToArray(), Json));
        File.Move(temp, PathName, true);
    }

    static bool IsAdministrative(string? name)
    {
        var n = (name ?? "").Trim().ToUpperInvariant()
            .Replace('İ','I').Replace('Ş','S').Replace('Ğ','G').Replace('Ü','U').Replace('Ö','O').Replace('Ç','C');
        return n.StartsWith("IDARI", StringComparison.Ordinal);
    }
}
