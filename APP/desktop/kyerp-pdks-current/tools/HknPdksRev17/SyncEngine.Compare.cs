using System.Data;
using System.Globalization;

namespace QuickDataTool;

internal static partial class SyncEngine
{
    internal static DataTable EmptyTable()
    {
        var table = new DataTable();
        foreach (var column in new[] { "Kart No", "Ad Soyad", "Tarih", "Taraf", "DB Saat", "Tür", "TNF Saat", "TNF Karşılığı", "Durum", "İşlem" })
            table.Columns.Add(column);
        table.Columns.Add("DbId", typeof(int));
        table.Columns.Add("TnfIndex", typeof(int));
        table.Columns.Add("CertainInvalid", typeof(bool));
        table.Columns.Add("Açıklama");
        table.Columns.Add("Seç", typeof(bool)).DefaultValue = false;
        return table;
    }

    internal static DataTable ListTerminal(IEnumerable<TnfMovement> terminal, Dictionary<string, EmploymentRule> people, CancellationToken cancellation)
    {
        var table = EmptyTable();
        table.BeginLoadData();
        foreach (var movement in terminal)
        {
            cancellation.ThrowIfCancellationRequested();
            table.Rows.Add(movement.Card, people.GetValueOrDefault(movement.Card)?.Name ?? "", movement.Date.ToString("dd.MM.yyyy"),
                "Belirsiz", "", "TNF", movement.Time, movement.Raw, "TNF LİSTE", "YOK", -1, movement.Index, false,
                "TNF formatında taraf alanı yok.", false);
        }
        table.EndLoadData();
        return table;
    }

    public static DataTable Compare(List<DbMovement> database, List<TnfMovement> terminal,
        Dictionary<string, EmploymentRule> people, TnfFormat format, CancellationToken cancellation)
    {
        var table = EmptyTable();
        var dbGroups = database.ToLookup(movement => (movement.Card, movement.Date));
        var tnfGroups = terminal.ToLookup(movement => (movement.Card, movement.Date));
        table.BeginLoadData();
        foreach (var key in dbGroups.Select(group => group.Key).Union(tnfGroups.Select(group => group.Key)).OrderBy(key => key.Card).ThenBy(key => key.Date))
        {
            cancellation.ThrowIfCancellationRequested();
            var movements = dbGroups[key].OrderBy(movement => movement.Side == "Giriş" ? 0 : 1).ThenBy(movement => movement.Time).ThenBy(movement => movement.Id).ToArray();
            var lines = tnfGroups[key].OrderBy(line => line.Time).ThenBy(line => line.Index).ToArray();
            var rule = people.GetValueOrDefault(key.Card);
            var evaluation = rule?.Evaluate(key.Date) ?? (movements.Length > 0 ? ("KIMLIK KAYDI YOK", false) : ((string?)null, false));
            var assigned = new Dictionary<string, List<TnfMovement>> { ["Giriş"] = [], ["Çıkış"] = [], ["Belirsiz"] = [] };
            var dbByTime = movements.GroupBy(movement => movement.Time).ToDictionary(group => group.Key, group => group.Select(movement => movement.Side).Distinct().ToArray());
            var remaining = new List<TnfMovement>();
            foreach (var line in lines)
            {
                var sides = dbByTime.GetValueOrDefault(line.Time) ?? [];
                if (sides.Length == 1) assigned[sides[0]].Add(line);
                else if (sides.Length > 1) assigned["Belirsiz"].Add(line);
                else remaining.Add(line);
            }
            var unfilled = movements.Select(movement => movement.Side).Distinct().Where(side => assigned[side].Count == 0).ToArray();
            var bandSides = movements.GroupBy(movement => ClockSide(movement.Time))
                .ToDictionary(group => group.Key, group => group.Select(movement => movement.Side).Distinct().ToArray());
            foreach (var line in remaining)
            {
                var band = ClockSide(line.Time);
                var candidates = bandSides.GetValueOrDefault(band) ?? [];
                var side = movements.Length == 1 ? movements[0].Side : candidates.Length == 1 ? candidates[0] : movements.Length == 0 || unfilled.Length == 0 ? band : "Belirsiz";
                if (candidates.Length > 1) side = "Belirsiz";
                assigned[side].Add(line);
            }
            var duplicateTimes = lines.GroupBy(line => line.Time).Where(group => group.Count() > 1).Select(group => group.Key).ToHashSet();
            var uncertainDate = assigned["Belirsiz"].Count > 0;
            foreach (var side in new[] { "Giriş", "Çıkış", "Belirsiz" })
            {
                var dbLines = movements.Where(movement => movement.Side == side).ToArray();
                var tnfLines = assigned[side];
                var anchoredSurplus = dbLines.Length == 1 && tnfLines.Count > 1 && !uncertainDate &&
                    tnfLines.Count(line => line.Time == dbLines[0].Time) == 1 && !tnfLines.Any(line => duplicateTimes.Contains(line.Time));
                if (anchoredSurplus) tnfLines = tnfLines.OrderBy(line => line.Time == dbLines[0].Time ? 0 : 1).ThenBy(line => line.Time).ThenBy(line => line.Index).ToList();
                var eOnly = dbLines.Length > 0 && dbLines.All(movement => movement.Tur.Equals("E", StringComparison.OrdinalIgnoreCase));
                var eClockConflict = dbLines.Any(movement => !movement.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) && movements.Any(other => other.Time == movement.Time && other.Tur.Equals("E", StringComparison.OrdinalIgnoreCase)));
                var multiple = eClockConflict || !eOnly && movements.Length > 0 && (dbLines.Length > 1 || tnfLines.Count > 1 && !anchoredSurplus || tnfLines.Any(line => duplicateTimes.Contains(line.Time)));
                for (var index = 0; index < Math.Max(dbLines.Length, tnfLines.Count); index++)
                {
                    var db = index < dbLines.Length ? dbLines[index] : null;
                    var tnf = index < tnfLines.Count ? tnfLines[index] : null;
                    var status = "✓ UYUMLU";
                    var operation = "YOK";
                    var detail = "TNF tarafı tekil DB saat eşleşmesiyle hizalandı.";
                    var certain = false;
                    if (multiple || uncertainDate && (side == "Belirsiz" || unfilled.Contains(side)))
                    {
                        status = tnf is not null && duplicateTimes.Contains(tnf.Time) ? "MÜKERRER / İNCELE" : "İNCELE";
                        operation = "İNCELE";
                        detail = multiple ? "Aynı kart+tarih+taraf için çoklu kayıt; otomatik karar verilmez." : "TNF tarafı tekil olarak belirlenemedi; otomatik karar verilmez.";
                    }
                    else if (eOnly)
                    {
                        status = "E KAYDI";
                        operation = tnf is null ? "YOK" : "TNF SİL E";
                        detail = tnf is null ? "E kaydı TNF'de yok; doğru." : "DB tarafı yalnız E içeriyor; TNF karşılıkları çıktıda kaldırılır.";
                    }
                    else if (db is not null && !CanBuild(db, format) || tnf is { Standard: false })
                    {
                        status = "İNCELE";
                        operation = "İNCELE";
                        detail = "Saat / TNF türü / kodu / formatı geçersiz.";
                    }
                    else if (db is null)
                    {
                        status = "FAZLA TNF";
                        operation = "TNF SİL FAZLA";
                        detail = "DB karşılığı yok. TNF'de taraf alanı bulunmadığı için saat <12:00 Giriş, diğer saatler Çıkış etiketiyle gösterilir.";
                    }
                    else if (tnf is null)
                    {
                        status = "TNF EKSİK";
                        operation = "TNF EKLE";
                        detail = "DB normal hareketi TNF'de yok.";
                    }
                    else if (db.Time != tnf.Time)
                    {
                        status = "SAAT FARKI";
                        operation = "TNF DÜZELT";
                        detail = "TNF tekil olarak DB tarafına hizalandı. DB kart/tarih/saat bire bir korunur.";
                    }
                    if (evaluation.Item1 is not null) detail += " Personel tarih notu (DB hareketi değiştirilmez): " + evaluation.Item1;
                    table.Rows.Add(key.Card, rule?.Name ?? "KIMLIK YOK", key.Date.ToString("dd.MM.yyyy"), side, db?.Time ?? "",
                        db?.Tur.Equals("E", StringComparison.OrdinalIgnoreCase) == true ? "E" : db is null ? "TNF" : "Normal",
                        tnf?.Time ?? "", tnf?.Raw ?? "", status, operation, db?.Id ?? -1, tnf?.Index ?? -1, certain, detail, false);
                }
            }
        }
        table.EndLoadData();
        return table;
    }

    static string ClockSide(string time) => TimeSpan.TryParseExact(time, @"hh\:mm", CultureInfo.InvariantCulture, out var clock) && clock < TimeSpan.FromHours(12) ? "Giriş" : "Çıkış";

    static bool CanBuild(DbMovement movement, TnfFormat format)
    {
        if (movement.Card.Length != 5 || !movement.Card.All(char.IsAsciiDigit) || !TimeSpan.TryParseExact(movement.Time, @"hh\:mm", CultureInfo.InvariantCulture, out var clock) || clock.TotalHours >= 24) return false;
        try
        {
            return format.TryParse(format.Build(movement.Card, movement.Date, movement.Time), -1, out var generated) &&
                generated.Card == movement.Card && generated.Date == movement.Date && generated.Time == movement.Time;
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException) { return false; }
    }
}
