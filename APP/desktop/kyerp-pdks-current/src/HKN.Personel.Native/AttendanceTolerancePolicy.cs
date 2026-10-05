namespace HKN.Personel.Native;

/// <summary>
/// KY PDKS genel kart kabul penceresi.
/// Normal vardiya kartları bu pencerenin dışında "Tamamlandı" sayılmaz.
/// E kayıtları bu kurala göre otomatik üretilmez; yalnız ADMIN açıkça E seçebilir.
/// </summary>
internal static class AttendanceTolerancePolicy
{
    public static readonly TimeSpan EntryEarliest = new(8, 20, 0);
    public static readonly TimeSpan EntryLatest   = new(8, 35, 0);
    public static readonly TimeSpan ExitEarliest  = new(18, 50, 0);
    public static readonly TimeSpan ExitLatest    = new(19, 5, 0);

    public static int EntryEarliestMinute => (int)EntryEarliest.TotalMinutes;
    public static int EntryLatestMinute   => (int)EntryLatest.TotalMinutes;
    public static int ExitEarliestMinute  => (int)ExitEarliest.TotalMinutes;
    public static int ExitLatestMinute    => (int)ExitLatest.TotalMinutes;

    public static bool IsAcceptedEntry(DateTime value) =>
        value.TimeOfDay >= EntryEarliest && value.TimeOfDay <= EntryLatest;

    public static bool IsAcceptedExit(DateTime value) =>
        value.TimeOfDay >= ExitEarliest && value.TimeOfDay <= ExitLatest;

    public static string EntryException(DateTime value)
    {
        if (value.TimeOfDay < EntryEarliest) return "Erken Giriş";
        if (value.TimeOfDay > EntryLatest) return "Geç Giriş";
        return string.Empty;
    }

    public static string ExitException(DateTime value)
    {
        if (value.TimeOfDay < ExitEarliest) return "Erken Çıkış";
        if (value.TimeOfDay > ExitLatest) return "Geç Çıkış";
        return string.Empty;
    }

    public static string EntryWindowText => $"{EntryEarliest.ToString(@"hh\\:mm")}-{EntryLatest.ToString(@"hh\\:mm")}";
    public static string ExitWindowText => $"{ExitEarliest.ToString(@"hh\\:mm")}-{ExitLatest.ToString(@"hh\\:mm")}";
}
