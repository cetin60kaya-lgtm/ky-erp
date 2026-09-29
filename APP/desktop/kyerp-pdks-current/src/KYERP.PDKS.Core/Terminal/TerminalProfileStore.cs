using System.Text.Json;

namespace KYERP.PDKS.Core.Terminal;

public sealed class TerminalProfileStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string filePath;
    private readonly TerminalTransferProfile canonical;

    public TerminalProfileStore(string filePath, PdksOptions options)
    {
        this.filePath = filePath;
        canonical = TerminalTransferProfile.CreateCanonicalTnf(options);
    }

    public IReadOnlyList<TerminalTransferProfile> Load()
    {
        var profiles = File.Exists(filePath)
            ? JsonSerializer.Deserialize<List<TerminalTransferProfile>>(File.ReadAllText(filePath), JsonOptions) ?? []
            : [];
        profiles.RemoveAll(item => item.IsCanonical || item.Id == canonical.Id);
        profiles.Insert(0, canonical with { IsDefault = profiles.All(item => !item.IsDefault) });
        return profiles;
    }

    public void Save(IEnumerable<TerminalTransferProfile> values)
    {
        var profiles = values.ToList();
        if (profiles.Select(item => item.Id).Distinct().Count() != profiles.Count) throw new InvalidOperationException("Profil kimlikleri benzersiz olmalıdır.");
        foreach (var profile in profiles) profile.Validate();
        if (profiles.Count(item => item.IsDefault) > 1) throw new InvalidOperationException("Yalnız bir terminal profili varsayılan olabilir.");
        var custom = profiles.Where(item => !item.IsCanonical && item.Id != canonical.Id).ToList();
        Directory.CreateDirectory(Path.GetDirectoryName(filePath) ?? ".");
        var temporary = filePath + ".tmp-" + Guid.NewGuid().ToString("N");
        File.WriteAllText(temporary, JsonSerializer.Serialize(custom, JsonOptions));
        File.Move(temporary, filePath, true);
    }

    public string Export(TerminalTransferProfile profile) => JsonSerializer.Serialize(profile, JsonOptions);

    public TerminalTransferProfile Import(string json)
    {
        var profile = JsonSerializer.Deserialize<TerminalTransferProfile>(json, JsonOptions) ?? throw new FormatException("Profil JSON okunamadı.");
        if (profile.IsCanonical || profile.Id == canonical.Id) profile = profile.Copy(profile.Name + " Kopya");
        profile.Validate();
        return profile;
    }
}
