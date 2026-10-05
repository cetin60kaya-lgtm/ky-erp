namespace HKN.Personel.Native;

public enum PdksCommandId
{
    Home,
    Operations,
    LiveAttendance,
    MonthlyAttendanceAdmin,
    AttendanceExceptions,
    AttendanceHistory,
    DepartmentAttendanceAnalytics,
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
    PeriodControlCenter,
    PayrollPayslip,
    PayrollOvertime,
    Reports,
    Groups,
    ServiceRoutes,
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
        new(PdksCommandId.Operations,"Kart Kayıtları","Ham giriş/çıkış kayıtlarını ADMIN olarak görüntüle ve düzelt",PdksModule.GirisCikis,PdksToolbarIcon.EntryExit,"GÜNLÜK DEVAM",20,PdksCommandPlacement.Hidden,AdminOnly:true),
        new(PdksCommandId.Personnel,"Personel","Personel kartı, özlük ve çalışma bilgileri",PdksModule.Personel,PdksToolbarIcon.Personnel,"ANA",30,PdksCommandPlacement.Primary,Keys.F3),
        new(PdksCommandId.TimesheetMonthly,"Puantaj","Günlük ve aylık çalışma hesapları",PdksModule.Puantaj,PdksToolbarIcon.Timesheet,"ANA",40,PdksCommandPlacement.Primary,Keys.F5),
        new(PdksCommandId.PayrollGeneral,"Bordro","Hakediş, resmî bordro ve ödeme",PdksModule.Bordro,PdksToolbarIcon.Payroll,"ANA",50,PdksCommandPlacement.Primary,Keys.F6),
        new(PdksCommandId.Reports,"Raporlar","Operasyon, puantaj ve bordro raporları",PdksModule.Raporlar,PdksToolbarIcon.Results,"ANA",60,PdksCommandPlacement.Primary,Keys.F7),

        new(PdksCommandId.LiveAttendance,"Canlı Denetim","Anlık kart hareketleri, eksikler ve içeride olanları salt okunur izle",PdksModule.GunlukOperasyon,PdksToolbarIcon.Live,"OPERASYON",90,PdksCommandPlacement.Management,Keys.F2),
        new(PdksCommandId.MonthlyAttendanceAdmin,"Aylık Kart Düzeltme","ADMIN: ayı tek ekranda düzelt, E seç, DATA↔TNF eşitle ve imza PDF'i üret",PdksModule.GirisCikis,PdksToolbarIcon.EntryExit,"OPERASYON",92,PdksCommandPlacement.Management,AdminOnly:true),
        new(PdksCommandId.AttendanceExceptions,"İstisna Merkezi","Eksik çıkış, geç, erken, devamsızlık, mesai ve izin uyuşmazlıkları",PdksModule.GunlukOperasyon,PdksToolbarIcon.Results,"OPERASYON",95,PdksCommandPlacement.Management),
        new(PdksCommandId.AttendanceHistory,"Devam Geçmişi","Kart basılan/basılmayan günler, eksik giriş-çıkış ve aylık devam özeti",PdksModule.GunlukOperasyon,PdksToolbarIcon.Results,"OPERASYON",97,PdksCommandPlacement.Management),
        new(PdksCommandId.DepartmentAttendanceAnalytics,"Bölüm Devam Analizi","Bölüm bazında gelen personel, geç/erken, devamsızlık ve mesai analizi",PdksModule.GunlukOperasyon,PdksToolbarIcon.Results,"OPERASYON",98,PdksCommandPlacement.Management),
        new(PdksCommandId.EntryExit,"Giriş / Çıkış","Kart hareketleri, eksikler ve günlük devam; düzeltmeler ADMIN merkezindedir",PdksModule.GirisCikis,PdksToolbarIcon.EntryExit,"ANA",20,PdksCommandPlacement.Primary,Keys.F4),
        new(PdksCommandId.Leave,"İzin İşlemleri","Personel kartı içindeki izin kayıtları",PdksModule.Izinler,PdksToolbarIcon.Periods,"PERSONEL",110,PdksCommandPlacement.Hidden),
        new(PdksCommandId.EarningsDeductions,"Kazanç / Kesinti / Avans","Personel kartı içindeki ek kazanç, kesinti ve avans kayıtları",PdksModule.EkKazancKesinti,PdksToolbarIcon.Advances,"PERSONEL",120,PdksCommandPlacement.Hidden),
        new(PdksCommandId.QuickOperations,"Hızlı İşlemler","Personel, kart, izin, puantaj, bordro, ödeme ve rapor kısayolları",PdksModule.Personel,PdksToolbarIcon.Results,"PERSONEL",130,PdksCommandPlacement.Hidden,ResponsibleOnly:true),

        new(PdksCommandId.TimesheetDaily,"Günlük Puantaj","Puantaj ekranındaki günlük görünüm",PdksModule.Puantaj,PdksToolbarIcon.Timesheet,"PUANTAJ",210,PdksCommandPlacement.Hidden),
        new(PdksCommandId.TimesheetResults,"Puantaj Sonuçları","Puantaj ekranındaki hesap sonuçları",PdksModule.Puantaj,PdksToolbarIcon.Results,"PUANTAJ",220,PdksCommandPlacement.Hidden),

        new(PdksCommandId.PayrollPayments,"Personel Ödemeleri","Personel ve bordro ekranlarındaki ödeme geçmişi",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",310,PdksCommandPlacement.Hidden),
        new(PdksCommandId.PeriodControlCenter,"Dönem Kontrol Merkezi","Eksik kart, puantaj, bordro ve ödeme durumunu dönem kapanmadan kontrol et",PdksModule.Bordro,PdksToolbarIcon.Results,"BORDRO",315,PdksCommandPlacement.Management),
        new(PdksCommandId.PayrollAdjustment,"Aylık Düzeltme / Hızlı Ödeme","Yetkili aylık bordro düzeltmeleri",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",320,PdksCommandPlacement.Management,ResponsibleOnly:true),
        new(PdksCommandId.PayrollPayslip,"Maaş Pusulası","Bordro ekranındaki kişi bazlı pusula görünümü",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",330,PdksCommandPlacement.Hidden),
        new(PdksCommandId.PayrollOvertime,"Mesai Bordrosu","Bordro ekranındaki mesai görünümü",PdksModule.Bordro,PdksToolbarIcon.Payroll,"BORDRO",340,PdksCommandPlacement.Hidden),

        new(PdksCommandId.Definitions,"Tanımlar Merkezi","Organizasyon, bordro ve çalışma tanımlarına tek noktadan eriş",PdksModule.Tanimlar,PdksToolbarIcon.Departments,"TANIMLAR",400,PdksCommandPlacement.Management),
        new(PdksCommandId.Groups,"Vardiya / Çalışma Grupları","Grup saatleri, vardiya ve kart takibi zorunluluğu",PdksModule.Tanimlar,PdksToolbarIcon.Groups,"ÇALIŞMA DÜZENİ",410,PdksCommandPlacement.Management),
        new(PdksCommandId.ServiceRoutes,"Servis Hatları","Personel ulaşım hattı, araç/şoför, saat ve güzergâh yönetimi",PdksModule.Tanimlar,PdksToolbarIcon.Departments,"ORGANİZASYON",415,PdksCommandPlacement.Management),
        new(PdksCommandId.Periods,"Aylık Dönemler","Ay/yıl bazında MESAİLİ ve İDARİ teknik dönem kayıtlarını kontrol et",PdksModule.Donemler,PdksToolbarIcon.Periods,"ÇALIŞMA DÜZENİ",420,PdksCommandPlacement.Management),
        new(PdksCommandId.WorkingDate,"Çalışma Tarihi","Eski uyumluluk için aktif çalışma tarihi",PdksModule.Donemler,PdksToolbarIcon.WorkDate,"ÇALIŞMA DÜZENİ",430,PdksCommandPlacement.Hidden),
        new(PdksCommandId.Holidays,"Genel Tatiller","Resmî ve özel tatil günleri",PdksModule.Tanimlar,PdksToolbarIcon.Periods,"ÇALIŞMA DÜZENİ",440,PdksCommandPlacement.Management),
        new(PdksCommandId.DailyWorkHours,"Günlük Çalışma Saatleri","Günlük süre ve çalışma alanı tanımları",PdksModule.Tanimlar,PdksToolbarIcon.Timesheet,"ÇALIŞMA DÜZENİ",450,PdksCommandPlacement.Management),
        new(PdksCommandId.AnnualWorkPlan,"Yıllık Çalışma Takvimi","Tarih, grup ve günlük plan eşleşmesini okunur takvimde yönet",PdksModule.Tanimlar,PdksToolbarIcon.Periods,"ÇALIŞMA DÜZENİ",460,PdksCommandPlacement.Management),
        new(PdksCommandId.PayrollFields,"Bordro Alanları","Bordro alan ve katsayı tanımları",PdksModule.Tanimlar,PdksToolbarIcon.Payroll,"BORDRO AYARLARI",470,PdksCommandPlacement.Management),
        new(PdksCommandId.EarningsTypes,"Kazanç / Kesinti Türleri","Avans, kazanç ve kesinti türleri",PdksModule.Tanimlar,PdksToolbarIcon.Advances,"BORDRO AYARLARI",480,PdksCommandPlacement.Management),

        new(PdksCommandId.TerminalCenter,"Terminal Merkezi","Kart cihazı, aktarım ve bağlantı merkezi",PdksModule.Terminal,PdksToolbarIcon.Transfer,"CİHAZLAR",500,PdksCommandPlacement.Management,Keys.Control|Keys.T),
        new(PdksCommandId.TerminalSettings,"Terminal Ayarları","Terminal Merkezi içindeki gelişmiş cihaz bağlantı ayarları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"CİHAZLAR",510,PdksCommandPlacement.Hidden),
        new(PdksCommandId.TerminalProfiles,"Gelişmiş Terminal Profilleri","Teknik terminal profili ve aktarım eşleme ayarları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"CİHAZLAR",515,PdksCommandPlacement.Hidden),
        new(PdksCommandId.DataSources,"FDB / TNF Veri Kaynakları","Teknik veri kaynağı ve aktarım yolları",PdksModule.Terminal,PdksToolbarIcon.Transfer,"CİHAZLAR",520,PdksCommandPlacement.Hidden),
        new(PdksCommandId.BackupRestore,"Yedekleme / Geri Yükleme","Veritabanı yedekleme ve geri yükleme",PdksModule.Tanimlar,PdksToolbarIcon.Results,"SİSTEM",530,PdksCommandPlacement.Management),
        new(PdksCommandId.Integrations,"Entegrasyonlar","Harici sistem ve veri bağlantıları",PdksModule.Tanimlar,PdksToolbarIcon.Transfer,"SİSTEM",540,PdksCommandPlacement.Management),
        new(PdksCommandId.AuditHistory,"İşlem Geçmişi","Değişiklik ve kullanıcı işlem kayıtları",PdksModule.Raporlar,PdksToolbarIcon.Results,"SİSTEM",550,PdksCommandPlacement.Management),
        new(PdksCommandId.UserManagement,"Kullanıcı / Yetki","Kullanıcı ve modül erişim yetkileri",PdksModule.KullaniciYonetimi,PdksToolbarIcon.Personnel,"SİSTEM",560,PdksCommandPlacement.Management,AdminOnly:true),
        new(PdksCommandId.License,"Lisans","Firma lisansı ve aktivasyon",PdksModule.Tanimlar,PdksToolbarIcon.Results,"SİSTEM",570,PdksCommandPlacement.Management,SuperAdminOnly:true),

        new(PdksCommandId.Theme,"Tema ve Görünüm","Uygulama teması, sol menü ve vurgu rengini ayrı yönet",PdksModule.Home,PdksToolbarIcon.Home,"GÖRÜNÜM",610,PdksCommandPlacement.Management),
        new(PdksCommandId.QuickGuide,"Hızlı Kullanım Rehberi","Temel işlem akışları ve kısa yollar",PdksModule.Home,PdksToolbarIcon.Results,"YARDIM",710,PdksCommandPlacement.Management),
        new(PdksCommandId.About,"Hakkında","KY PDKS sürüm ve ürün bilgileri",PdksModule.Home,PdksToolbarIcon.Results,"YARDIM",720,PdksCommandPlacement.Management)
    ];

    public static IReadOnlyList<PdksCommandDescriptor> All => Items;
    public static IEnumerable<PdksCommandDescriptor> Primary => Items.Where(x=>x.Placement==PdksCommandPlacement.Primary).OrderBy(x=>x.Order);
    public static IEnumerable<PdksCommandDescriptor> Management => Items.Where(x=>x.Placement==PdksCommandPlacement.Management).OrderBy(x=>x.Order);
    public static PdksCommandDescriptor Get(PdksCommandId id) => Items.First(x=>x.Id==id);
    public static PdksCommandDescriptor? ForShortcut(Keys shortcut) => Items.FirstOrDefault(x=>x.Shortcut==shortcut);
}
