namespace HKN.PDKS.QuickEditor;

public sealed class TnfStore
{
    public string FilePath { get; set; } = @"C:\Hedef500\Temp\TR2026.Tnf";

    public sealed record TnfRow(string Raw, string Card, TimeOnly Time, DateOnly Date)
    {
        public bool IsEntry => Time.Hour < 12;
    }

    public IReadOnlyList<TnfRow> ReadAll()
    {
        if (!File.Exists(FilePath)) return [];
        var list = new List<TnfRow>();
        foreach (var raw in File.ReadLines(FilePath))
        {
            var p = raw.Split(',');
            if (p.Length < 3) continue;
            if (!TimeOnly.TryParseExact(p[1], "HH:mm", out var time)) continue;
            if (!DateOnly.TryParseExact(p[2], "ddMMyy", out var date)) continue;
            list.Add(new TnfRow(raw, p[0].Trim(), time, date));
        }
        return list;
    }

    public IReadOnlyList<TnfRow> FindSide(string card, DateTime day, bool entry)
    {
        var d = DateOnly.FromDateTime(day);
        return ReadAll().Where(x => x.Card == card && x.Date == d && x.IsEntry == entry).ToList();
    }

    public string PrepareBackup()
    {
        var backupDir = Path.Combine(Path.GetDirectoryName(FilePath)!, "HKN_BACKUP");
        Directory.CreateDirectory(backupDir);
        var backup = Path.Combine(backupDir, $"{Path.GetFileNameWithoutExtension(FilePath)}_{DateTime.Now:yyyyMMdd_HHmmss}.Tnf");
        File.Copy(FilePath, backup, false);
        return backup;
    }

    public string RewriteWithoutSingleSide(string card, DateTime day, bool entry)
    {
        var matches = FindSide(card, day, entry);
        if (matches.Count == 0) return "TNF tarafında karşılık yok.";
        if (matches.Count > 1) throw new InvalidOperationException($"Aynı taraf için {matches.Count} ham kayıt var; otomatik işlem durduruldu.");
        var backup = PrepareBackup();
        var target = matches[0].Raw;
        var kept = File.ReadAllLines(FilePath).Where(x => x != target).ToArray();
        File.WriteAllLines(FilePath, kept);
        return $"Ham karşılık kaldırıldı: {target} | Yedek: {backup}";
    }
}

public sealed record TnfOverride(string Card, string Date, string Side, string Raw, string Reason, DateTime CreatedAt);
