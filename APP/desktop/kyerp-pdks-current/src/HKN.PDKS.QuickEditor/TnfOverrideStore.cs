using System.Text.Json;

namespace HKN.PDKS.QuickEditor;

public sealed class TnfOverrideStore
{
    readonly TnfStore tnf;
    public TnfOverrideStore(TnfStore tnf) => this.tnf = tnf;

    string OverridePath => tnf.FilePath + ".hkn-overrides.json";

    public IReadOnlyList<TnfOverride> Load()
    {
        if (!File.Exists(OverridePath)) return [];
        return JsonSerializer.Deserialize<List<TnfOverride>>(File.ReadAllText(OverridePath)) ?? [];
    }

    public string SupersedeSingle(string card, DateTime day, bool entry, string reason)
    {
        var matches = tnf.FindSide(card, day, entry);
        if (matches.Count == 0) return "Ham TNF karşılığı yok.";
        if (matches.Count > 1) throw new InvalidOperationException($"Aynı taraf için {matches.Count} ham kayıt var; önce tekil kayıt seçilmeli.");
        var list = Load().ToList();
        var m = matches[0];
        if (!list.Any(x => x.Raw == m.Raw)) list.Add(new TnfOverride(card, day.ToString("yyyy-MM-dd"), entry ? "G" : "C", m.Raw, reason, DateTime.Now));
        File.WriteAllText(OverridePath, JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true }));
        return $"TNF kayıt izi korundu, aktif karşılaştırmadan çıkarıldı: {m.Raw}";
    }
}
