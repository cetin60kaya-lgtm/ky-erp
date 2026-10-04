namespace HKN.Personel.Native;

public sealed record PdksWorkflowStep(
    int Order,
    PdksCommandId Command,
    string Title,
    string Detail);

public static class PdksWorkflowCatalog
{
    static readonly PdksWorkflowStep[] Steps =
    [
        new(10,PdksCommandId.TerminalCenter,"Terminal verisini al ve doğrula","Kart hareketlerini cihazdan al; aktarım ve mükerrer kontrolünü tamamla."),
        new(20,PdksCommandId.LiveAttendance,"Canlı denetimde anlık durumu gör","Kart basmayan, içeride kalan ve çıkışı eksik personeli görün."),
        new(30,PdksCommandId.AttendanceExceptions,"İstisnaları tek listede kontrol et","Eksik çıkış, geç, erken, devamsızlık, mesai ve izin uyuşmazlıklarını ayırın."),
        new(40,PdksCommandId.Operations,"Kart kayıtlarını düzelt","Yalnız doğrulanmış eksik veya hatalı giriş/çıkış hareketlerini düzelt."),
        new(50,PdksCommandId.Personnel,"Personel, izin ve ek kayıtları kontrol et","İzin, çalışma bilgisi ve personel bazlı ek hareketleri doğrula."),
        new(60,PdksCommandId.TimesheetMonthly,"Puantajı hesapla ve sonucu kontrol et","Temizlenmiş kart ve izin verisinden günlük/aylık puantajı hesapla."),
        new(70,PdksCommandId.PeriodControlCenter,"Dönem kapanış hazırlığını kontrol et","Eksik kart, puantaj, bordro ve ödeme durumunu kişi bazında tamamla."),
        new(80,PdksCommandId.PayrollGeneral,"Hakediş ve resmî bordroyu hazırla","Net hakediş ile resmî PEK/bordro hesaplarını ayrı kurallarla oluştur."),
        new(90,PdksCommandId.Reports,"Raporla ve dönemi tamamla","Kontrol raporlarını, bordro çıktılarını ve dönem sonu sonuçlarını tamamla.")
    ];

    public static IReadOnlyList<PdksWorkflowStep> All => Steps;
}
