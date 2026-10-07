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
        return table;
    }

    internal static DataTable ListTerminal(IEnumerable<TnfMovement> terminal,
        Dictionary<string, EmploymentRule> people, CancellationToken cancellation)
    {
        var table = EmptyTable();
        table.BeginLoadData();
        foreach (var movement in terminal)
        {
            cancellation.ThrowIfCancellationRequested();
            table.Rows.Add(
                movement.Card,
                people.GetValueOrDefault(movement.Card)?.Name ?? "",
                movement.Date.ToString("dd.MM.yyyy"),
                "Belirsiz", "", "TNF", movement.Time, movement.Raw,
                "TNF LİSTE", "YOK", -1, movement.Index, false,
                "TNF formatında taraf alanı yok.");
        }
        table.EndLoadData();
        return table;
    }

    static string ClockSide(string time) =>
        TimeSpan.TryParseExact(time, @"hh\:mm", CultureInfo.InvariantCulture, out var clock) &&
        clock < TimeSpan.FromHours(12) ? "Giriş" : "Çıkış";

    static bool CanBuild(DbMovement movement, TnfFormat format)
    {
        if (movement.Card.Length != 5 || !movement.Card.All(char.IsAsciiDigit) ||
            !TimeSpan.TryParseExact(movement.Time, @"hh\:mm", CultureInfo.InvariantCulture, out var clock) ||
            clock.TotalHours >= 24)
            return false;
        try
        {
            return format.TryParse(format.Build(movement.Card, movement.Date, movement.Time), -1, out var generated) &&
                generated.Card == movement.Card && generated.Date == movement.Date && generated.Time == movement.Time;
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or IndexOutOfRangeException)
        {
            return false;
        }
    }
}
