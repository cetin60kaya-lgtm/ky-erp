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
        new(20,PdksCommandId.LiveAttendance,"Canlı denetimde istisnaları gör","Kart basmayan, geç gelen, içeride kalan ve çıkışı eksik personeli önce görün."),
        new(30,PdksCommandId.EntryExit,"Giriş / çıkış eksiklerini düzelt","Yalnız doğrulanmış eksik veya hatalı kart hareketlerini düzelt."),
        new(40,PdksCommandId.Personnel,"Personel, izin ve ek kayıtları kontrol et","İzin, çalışma bilgisi ve personel bazlı ek hareketleri doğrula."),
        new(50,PdksCommandId.TimesheetMonthly,"Puantajı hesapla ve sonucu kontrol et","Temizlenmiş kart ve izin verisinden günlük/aylık puantajı hesapla."),
        new(60,PdksCommandId.PayrollGeneral,"Hakediş ve resmî bordroyu hazırla","Net hakediş ile resmî PEK/bordro hesaplarını ayrı kurallarla oluştur."),
        new(70,PdksCommandId.Reports,"Raporla, çıktı al ve dönemi kapat","Kontrol raporlarını, bordro çıktılarını ve dönem sonu sonuçlarını tamamla.")
    ];

    public static IReadOnlyList<PdksWorkflowStep> All => Steps;
}
