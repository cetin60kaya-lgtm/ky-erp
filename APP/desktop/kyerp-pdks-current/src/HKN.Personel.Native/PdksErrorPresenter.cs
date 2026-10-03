namespace HKN.Personel.Native;

public static class PdksErrorPresenter
{
    public static string Friendly(Exception ex)
    {
        var baseEx=ex.GetBaseException();
        var message=(baseEx.Message??string.Empty).Replace("\r"," ").Replace("\n"," ").Trim();

        if(message.Contains("SQL error code = -104",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("Token unknown",StringComparison.OrdinalIgnoreCase))
            return "Rapor veya sorgu, mevcut Firebird sürümüyle uyumlu değil. Teknik ayrıntı kayda alındı.";

        if(message.Contains("SQL error code = -206",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("Column unknown",StringComparison.OrdinalIgnoreCase))
            return "Beklenen veritabanı alanı bulunamadı. Şema uyumluluğu kontrol edilmelidir.";

        if(message.Contains("SQL error code = -204",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("Table unknown",StringComparison.OrdinalIgnoreCase))
            return "Beklenen veritabanı tablosu bulunamadı. Veri kaynağı sürümü kontrol edilmelidir.";

        if(message.Contains("violation of PRIMARY or UNIQUE KEY",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("SQL error code = -803",StringComparison.OrdinalIgnoreCase))
            return "Aynı kayıt zaten mevcut. Mükerrer kayıt oluşturulmadı.";

        if(message.Contains("deadlock",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("lock conflict",StringComparison.OrdinalIgnoreCase))
            return "Kayıt şu anda başka bir işlem tarafından kullanılıyor. Kısa süre sonra yeniden deneyin.";

        if(message.Contains("conversion error",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("arithmetic exception",StringComparison.OrdinalIgnoreCase))
            return "Veri biçimi beklenen yapıyla uyuşmuyor. İlgili alanları kontrol edin.";

        if(message.Contains("database",StringComparison.OrdinalIgnoreCase) &&
           (message.Contains("unavailable",StringComparison.OrdinalIgnoreCase) ||
            message.Contains("not found",StringComparison.OrdinalIgnoreCase)))
            return "Veritabanına ulaşılamıyor. Veri kaynağı ve bağlantı ayarlarını kontrol edin.";

        if(message.Contains("network",StringComparison.OrdinalIgnoreCase) ||
           message.Contains("connection",StringComparison.OrdinalIgnoreCase))
            return "Bağlantı kurulamadı. Ağ veya cihaz bağlantısını kontrol edin.";

        if(message.Length==0)return "İşlem tamamlanamadı.";
        return message.Length<=180?message:message[..177]+"...";
    }

    public static void Log(Exception ex,string context)
    {
        try
        {
            CompanyDataPaths.Ensure();
            var path=Path.Combine(CompanyDataPaths.Logs,"errors.log");
            File.AppendAllText(path,
                $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {context}{Environment.NewLine}{ex}{Environment.NewLine}{new string('-',80)}{Environment.NewLine}");
        }
        catch { }
    }

    public static void Show(IWin32Window? owner,Exception ex,string title="KY PDKS",MessageBoxIcon icon=MessageBoxIcon.Warning,string context="UI")
    {
        Log(ex,context);
        if (string.Equals(Environment.GetEnvironmentVariable("KY_PDKS_UI_AUDIT"), "1", StringComparison.Ordinal))
            return;
        MessageBox.Show(owner,Friendly(ex),title,MessageBoxButtons.OK,icon);
    }

    public static string Report(Exception ex,string context)
    {
        Log(ex,context);
        return Friendly(ex);
    }
}
