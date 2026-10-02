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
        new(20,PdksCommandId.EntryExit,"Giriş / çıkış eksiklerini düzelt","Eksik, hatalı ve manuel düzeltilmesi gereken kart hareketlerini tamamla."),
        new(30,PdksCommandId.Personnel,"Personel, izin ve ek ödemeleri kontrol et","İzin, avans, kazanç/kesinti ve personel durumlarını doğrula."),
        new(40,PdksCommandId.TimesheetMonthly,"Puantajı hesapla ve sonucu kontrol et","Kaynak kayıtları onaylandıktan sonra günlük/aylık puantajı hesapla."),
        new(50,PdksCommandId.PayrollGeneral,"Hakediş ve resmî bordroyu hazırla","Net hakediş ile resmî PEK/bordro hesaplarını kendi kurallarıyla oluştur."),
        new(60,PdksCommandId.Reports,"Raporla, çıktı al ve dönemi kapat","Kontrol raporlarını, bordro çıktılarını ve dönem sonu sonuçlarını tamamla.")
    ];

    public static IReadOnlyList<PdksWorkflowStep> All => Steps;
}
