namespace HKN.Personel.Native;

public enum PdksCommandId
{
    Home,
    Operations,
    LiveAttendance,
    EntryExit,
    Personnel,
    Leave,
    EarningsDeductions,
    QuickOperations,
    TimesheetDaily,
    TimesheetMonthly,
    TimesheetResults,
    PayrollGeneral,
    PayrollPayments,
    PayrollAdjustment,
    PayrollPayslip,
    PayrollOvertime,
    Reports,
    Groups,
    Periods,
    WorkingDate,
    Holidays,
    DailyWorkHours,
    AnnualWorkPlan,
    PayrollFields,
    EarningsTypes,
    Definitions,
    TerminalCenter,
    TerminalSettings,
    TerminalProfiles,
    DataSources,
    BackupRestore,
    Integrations,
    AuditHistory,
    UserManagement,
    License,
    Theme,
    QuickGuide,
    About
}

public enum PdksCommandPlacement
{
    Primary,
    Management,
    Hidden
}

public sealed record PdksCommandDescriptor(
    PdksCommandId Id,
    string Title,
    string Hint,
    PdksModule Module,
    PdksToolbarIcon Icon,
    string Group,
    int Order,
    PdksCommandPlacement Placement,
    Keys Shortcut = Keys.None,
    bool AdminOnly = false,
    bool SuperAdminOnly = false,
    bool ResponsibleOnly = false);

public static class PdksCommandCatalog
{
    static readonly PdksCommandDescriptor[] Items =
    [
        new(PdksCommandId.Home,"Genel Bakış","Günün personel hareketleri ve hızlı işlemler",PdksModule.Home,PdksToolbarIcon.Home,"ANA",10,PdksCommandPlacement.Primary,Keys.Control|Keys.H),
        new(PdksCommandId.Operations,"Operasyon","Canlı denetim, kart düzeltme ve günlük istisnalar",PdksModule.GunlukOperasyon,PdksToolbarIcon.Live,"ANA",20,PdksCommandPlacement.Primary),
        new(PdksCommandId.Personnel,"Personel","Personel kartı, özlük ve çalışma bilgileri",PdksModule.Personel,PdksToolbarIcon.Personnel,"ANA",30,PdksCommandPlacement.Primary,Keys.F3),
        new(PdksCommandId.TimesheetMonthly,"Puantaj","Günlük ve aylık çalışma hesapları",PdksModule.Puantaj,PdksToolbarIcon.Timesheet,"ANA",40,PdksCommandPlacement.Primary,Keys.F5),
        new(PdksCommandId.PayrollGeneral,"Bordro","Hakediş, resmî bordro ve ödeme",PdksModule.Bordro,PdksToolbarIcon.Payroll,"ANA",50,PdksCommandPlacement.Primary,Keys.F6),
        new(PdksCommandId.Reports,"Raporlar","Operasyon, puantaj ve bordro raporları",PdksModule.Raporlar,PdksToolbarIcon.Results,"ANA",60,PdksCommandPlacement.Primary,Keys.F7),

        new(PdksCommandId.LiveAttendance,"Canlı Denetim","Anlık kart hareketleri, eksikler ve içeride olanlar",PdksModule.GunlukOperasyon,PdksToolbarIcon.Live,"OPERASYON",90,PdksCommandPlacement.Management,Keys.F2),
        new(PdksCommandId.EntryExit,"Giriş / Çıkış","Kart hareketlerini görüntüle, düzelt ve manuel tamamla",PdksModule.GirisCikis,PdksToolbarIcon.EntryExit,"OPERASYON",100,PdksCommandPlacement.Management,Keys.F4),
        new(PdksCommandId.Leave,"İzin İşlemleri","Personel izin kayıtları ve kişi bazlı izin hareketleri",PdksModule.Izinler,PdksToolbarIcon.Periods,"OPERASYON",110,PdksCommandPlacement.Management),
        new(PdksCommandId.EarningsDeductions,"Kazanç / Kesinti / Avans","Ek kazanç, kesinti ve avans girişleri",PdksModule.EkKazancKesinti,PdksToolbarIcon.Advances,"PERSONEL",120,PdksCommandPlacement.Management),
        new(PdksCommandId.QuickOperations,"Toplu İşlemler","Yetkili hızlı personel ve veri işlemleri",PdksModule.Personel,PdksToolbarIcon.Results,"PERSONEL",130,PdksCommandPlacement.Management,ResponsibleOnly:true),

        new(PdksCommandId.TimesheetDaily,"Günlük Puantaj","Seçilen gün/aralık için puantaj kontrolü",PdksModule.Puantaj,PdksToolbarIcon.Timesheet,"PUANTAJ",210,PdksCommandPlacement.Management),
        new(PdksCommandId.TimesheetResults,"Puantaj Sonuçları","Hesaplanan puantaj kayıtlarını görüntüle",PdksModule.Puantaj,PdksToolbarIcon.Results,"PUANTAJ",220,PdksCommandPlacement.Management),

        new(PdksCommandId.PayrollPayments,"Personel Ödemeleri","Personel bazlı ödeme geçmişi",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",310,PdksCommandPlacement.Management),
        new(PdksCommandId.PayrollAdjustment,"Aylık Düzeltme / Hızlı Ödeme","Yetkili aylık bordro düzeltmeleri",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",320,PdksCommandPlacement.Management,ResponsibleOnly:true),
        new(PdksCommandId.PayrollPayslip,"Maaş Pusulası","Maaş bordrosu / pusula görünümü",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",330,PdksCommandPlacement.Management),
        new(PdksCommandId.PayrollOvertime,"Mesai Bordrosu","Mesai odaklı bordro görünümü",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",340,PdksCommandPlacement.Management),

        new(PdksCommandId.Definitions,"Tanımlar Merkezi","Organizasyon, bordro ve çalışma tanımlarına tek noktadan eriş",PdksModule.Tanimlar,PdksToolbarIcon.Departments,"TANIMLAR",400,PdksCommandPlacement.Management),
        new(PdksCommandId.Groups,"Çalışma Grupları / Vardiyalar","Vardiya ve çalışma grubu tanımları",PdksModule.Tanimlar,PdksToolbarIcon.Groups,"TANIMLAR",410,PdksCommandPlacement.Management),
        new(PdksCommandId.Periods,"Dönemler","Çalışma ve bordro dönemleri",PdksModule.Donemler,PdksToolbarIcon.Periods,"TANIMLAR",420,PdksCommandPlacement.Management),
        new(PdksCommandId.WorkingDate,"Çalışma Tarihi","Aktif çalışma tarihini seç ve yönet",PdksModule.Donemler,PdksToolbarIcon.WorkDate,"TANIMLAR",430,PdksCommandPlacement.Management),
        new(PdksCommandId.Holidays,"Genel Tatiller","Resmî ve özel tatil günleri",PdksModule.Tanimlar,PdksToolbarIcon.Periods,"TANIMLAR",440,PdksCommandPlacement.Management),
        new(PdksCommandId.DailyWorkHours,"Günlük Çalışma Saatleri","Günlük süre ve çalışma alanı tanımları",PdksModule.Tanimlar,PdksToolbarIcon.Timesheet,"TANIMLAR",450,PdksCommandPlacement.Management),
        new(PdksCommandId.AnnualWorkPlan,"Yıllık Çalışma Planı","Yıllık çalışma planı kayıtları",PdksModule.Tanimlar,PdksToolbarIcon.Periods,"TANIMLAR",460,PdksCommandPlacement.Management),
        new(PdksCommandId.PayrollFields,"Bordro Alanları","Bordro alan ve katsayı tanımları",PdksModule.Tanimlar,PdksToolbarIcon.Payroll,"TANIMLAR",470,PdksCommandPlacement.Management),
        new(PdksCommandId.EarningsTypes,"Kazanç / Kesinti Türleri","Avans, kazanç ve kesinti türleri",PdksModule.Tanimlar,PdksToolbarIcon.Advances,"TANIMLAR",480,PdksCommandPlacement.Management),

        new(PdksCommandId.TerminalCenter,"Terminal Merkezi","Kart cihazı, aktarım ve bağlantı merkezi",PdksModule.Terminal,PdksToolbarIcon.Transfer,"SİSTEM",500,PdksCommandPlacement.Management,Keys.Control|Keys.T),
        new(PdksCommandId.TerminalSettings,"Terminal Ayarları","Cihaz bağlantı profili ve sürücü ayarları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"SİSTEM",510,PdksCommandPlacement.Management),
        new(PdksCommandId.TerminalProfiles,"Gelişmiş Terminal Profilleri","Terminal profili ve aktarım eşleme ayarları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"SİSTEM",515,PdksCommandPlacement.Management),
        new(PdksCommandId.DataSources,"FDB / TNF Veri Kaynakları","Veri kaynağı ve aktarım dosyaları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"SİSTEM",520,PdksCommandPlacement.Management),
        new(PdksCommandId.BackupRestore,"Yedekleme / Geri Yükleme","Veritabanı yedekleme ve geri yükleme",PdksModule.Tanimlar,PdksToolbarIcon.Results,"SİSTEM",530,PdksCommandPlacement.Management),
        new(PdksCommandId.Integrations,"Entegrasyonlar","Harici sistem ve veri bağlantıları",PdksModule.Tanimlar,PdksToolbarIcon.Transfer,"SİSTEM",540,PdksCommandPlacement.Management),
        new(PdksCommandId.AuditHistory,"İşlem Geçmişi","Değişiklik ve kullanıcı işlem kayıtları",PdksModule.Raporlar,PdksToolbarIcon.Results,"SİSTEM",550,PdksCommandPlacement.Management),
        new(PdksCommandId.UserManagement,"Kullanıcı / Yetki","Kullanıcı ve modül erişim yetkileri",PdksModule.KullaniciYonetimi,PdksToolbarIcon.Personnel,"SİSTEM",560,PdksCommandPlacement.Management,AdminOnly:true),
        new(PdksCommandId.License,"Lisans","Firma lisansı ve aktivasyon",PdksModule.Tanimlar,PdksToolbarIcon.Results,"SİSTEM",570,PdksCommandPlacement.Management,SuperAdminOnly:true),

        new(PdksCommandId.Theme,"Tema ve Görünüm","Açık/koyu tema ile vurgu rengini ayrı yönet",PdksModule.Home,PdksToolbarIcon.Home,"GÖRÜNÜM",610,PdksCommandPlacement.Management),
        new(PdksCommandId.QuickGuide,"Hızlı Kullanım Rehberi","Temel işlem akışları ve kısa yollar",PdksModule.Home,PdksToolbarIcon.Results,"YARDIM",710,PdksCommandPlacement.Management),
        new(PdksCommandId.About,"Hakkında","KY PDKS sürüm ve ürün bilgileri",PdksModule.Home,PdksToolbarIcon.Results,"YARDIM",720,PdksCommandPlacement.Management)
    ];

    public static IReadOnlyList<PdksCommandDescriptor> All => Items;
    public static IEnumerable<PdksCommandDescriptor> Primary => Items.Where(x=>x.Placement==PdksCommandPlacement.Primary).OrderBy(x=>x.Order);
    public static IEnumerable<PdksCommandDescriptor> Management => Items.Where(x=>x.Placement==PdksCommandPlacement.Management).OrderBy(x=>x.Order);
    public static PdksCommandDescriptor Get(PdksCommandId id) => Items.First(x=>x.Id==id);
    public static PdksCommandDescriptor? ForShortcut(Keys shortcut) => Items.FirstOrDefault(x=>x.Shortcut==shortcut);
}
