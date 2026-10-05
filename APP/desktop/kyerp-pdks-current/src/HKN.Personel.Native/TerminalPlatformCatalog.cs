namespace HKN.Personel.Native;

[Flags]
internal enum TerminalCapability
{
    None = 0,
    Health = 1 << 0,
    ReadLogs = 1 << 1,
    ClearLogs = 1 << 2,
    ReadUsers = 1 << 3,
    WriteUsers = 1 << 4,
    DeleteUsers = 1 << 5,
    TimeSync = 1 << 6,
    Card = 1 << 7,
    Pin = 1 << 8,
    Qr = 1 << 9,
    Mobile = 1 << 10,
    Fingerprint = 1 << 11,
    Face = 1 << 12,
    Palm = 1 << 13,
    Iris = 1 << 14,
    DoorControl = 1 << 15,
    PushEvents = 1 << 16,
    Cloud = 1 << 17,
    Photo = 1 << 18,
    Osdp = 1 << 19,
    Wiegand = 1 << 20
}

internal sealed record TerminalPlatformDescriptor(
    string Id,
    string Brand,
    string Family,
    string Integration,
    string Transport,
    string Availability,
    TerminalCapability Capabilities,
    string Notes)
{
    public string CredentialSummary
    {
        get
        {
            var labels = new List<string>();
            Add(TerminalCapability.Card, "RFID/NFC Kart");
            Add(TerminalCapability.Pin, "PIN");
            Add(TerminalCapability.Qr, "QR");
            Add(TerminalCapability.Mobile, "Mobil");
            Add(TerminalCapability.Fingerprint, "Parmak İzi");
            Add(TerminalCapability.Face, "Yüz");
            Add(TerminalCapability.Palm, "El/Avuç");
            Add(TerminalCapability.Iris, "İris");
            return labels.Count == 0 ? "—" : string.Join(" • ", labels);

            void Add(TerminalCapability flag, string label)
            {
                if ((Capabilities & flag) != 0) labels.Add(label);
            }
        }
    }

    public string OperationSummary
    {
        get
        {
            var labels = new List<string>();
            Add(TerminalCapability.Health, "Sağlık");
            Add(TerminalCapability.ReadLogs, "Log Oku");
            Add(TerminalCapability.ClearLogs, "Log Temizle");
            Add(TerminalCapability.ReadUsers, "Kullanıcı Oku");
            Add(TerminalCapability.WriteUsers, "Kullanıcı Yaz");
            Add(TerminalCapability.DeleteUsers, "Kullanıcı Sil");
            Add(TerminalCapability.TimeSync, "Saat");
            Add(TerminalCapability.DoorControl, "Kapı");
            Add(TerminalCapability.PushEvents, "Canlı Olay");
            return labels.Count == 0 ? "—" : string.Join(" • ", labels);

            void Add(TerminalCapability flag, string label)
            {
                if ((Capabilities & flag) != 0) labels.Add(label);
            }
        }
    }
}

internal static class TerminalPlatformCatalog
{
    public const string CurrentProviderId = "hedef-fpclock";

    public static IReadOnlyList<TerminalPlatformDescriptor> All { get; } =
    [
        new(
            CurrentProviderId,
            "Hedef / FP_CLOCK",
            "Mevcut U/H serisi terminal",
            "FP_CLOCK ActiveX + x86 Bridge",
            "Ethernet / Seri",
            "AKTİF",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ClearLogs |
            TerminalCapability.ReadUsers | TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers |
            TerminalCapability.TimeSync | TerminalCapability.Card | TerminalCapability.Pin |
            TerminalCapability.Fingerprint | TerminalCapability.Face,
            "Kurulu cihazın gerçek adaptörü. Kart, kullanıcı, kayıt, saat ve temizlik işlemleri doğrudan cihazla çalışır."),

        new(
            "zkteco",
            "ZKTeco",
            "ZKBio / standalone / TA-AC",
            "ZK SDK / Push / REST adaptörü",
            "TCP/IP • Wi-Fi • 4G • USB",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers | TerminalCapability.TimeSync |
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.Qr |
            TerminalCapability.Fingerprint | TerminalCapability.Face | TerminalCapability.Palm |
            TerminalCapability.PushEvents | TerminalCapability.Cloud | TerminalCapability.DoorControl,
            "Yeni cihaz eklendiğinde modeline göre ZK Push/SDK/REST sürücüsü takılır; ana arayüz değişmez."),

        new(
            "suprema",
            "Suprema",
            "BioStar 2 / BioStar X",
            "BioStar API / Device SDK",
            "TCP/IP • OSDP • Mobil",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers | TerminalCapability.TimeSync |
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.Qr | TerminalCapability.Mobile |
            TerminalCapability.Fingerprint | TerminalCapability.Face | TerminalCapability.PushEvents |
            TerminalCapability.Cloud | TerminalCapability.DoorControl | TerminalCapability.Osdp,
            "RF kart, mobil kart, QR, parmak izi ve yüz kimliklerini aynı personel kaydına bağlayabilecek profil."),

        new(
            "hikvision",
            "Hikvision",
            "MinMoe / HikCentral / Hik-Connect",
            "ISAPI / Push SDK / OpenAPI",
            "TCP/IP • PoE • Cloud",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers | TerminalCapability.TimeSync |
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.Qr |
            TerminalCapability.Fingerprint | TerminalCapability.Face | TerminalCapability.PushEvents |
            TerminalCapability.Cloud | TerminalCapability.DoorControl | TerminalCapability.Photo,
            "ISAPI, Push SDK veya HikCentral OpenAPI üzerinden attendance/access olayları için uygun."),

        new(
            "anviz",
            "Anviz",
            "CrossChex / FaceDeep / W-CX",
            "CrossChex API / cihaz protokolü",
            "TCP/IP • Wi-Fi • Cloud",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers | TerminalCapability.TimeSync |
            TerminalCapability.Card | TerminalCapability.Qr | TerminalCapability.Fingerprint |
            TerminalCapability.Face | TerminalCapability.Cloud | TerminalCapability.DoorControl,
            "CrossChex cihaz/personel senkronu ve yüz-parmak izi-RFID-QR terminalleri için profil."),

        new(
            "dahua",
            "Dahua",
            "ASI / ASA Access & Attendance",
            "Dahua SDK / HTTP API",
            "TCP/IP • Wiegand • Cloud",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.DeleteUsers | TerminalCapability.TimeSync |
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.Qr |
            TerminalCapability.Fingerprint | TerminalCapability.Face | TerminalCapability.DoorControl |
            TerminalCapability.Wiegand | TerminalCapability.Photo,
            "Access-control ve attendance terminallerinde kart, PIN, yüz, parmak izi ve üçüncü taraf okuyucu senaryoları."),

        new(
            "generic-rest",
            "Genel REST / Webhook",
            "Markadan bağımsız API cihazı",
            "REST JSON / Webhook / Push",
            "HTTPS / LAN / Cloud",
            "GENEL ADAPTÖR",
            TerminalCapability.Health | TerminalCapability.ReadLogs | TerminalCapability.ReadUsers |
            TerminalCapability.WriteUsers | TerminalCapability.TimeSync | TerminalCapability.Card |
            TerminalCapability.Pin | TerminalCapability.Qr | TerminalCapability.Mobile |
            TerminalCapability.PushEvents | TerminalCapability.Cloud,
            "Üretici HTTP/REST/OpenAPI veriyorsa yeni bir cihaz markası eklemeden profil üzerinden bağlanabilir."),

        new(
            "osdp-controller",
            "OSDP",
            "Standart erişim kontrol okuyucusu",
            "SIA OSDP Secure Channel",
            "RS-485 / kontrolör",
            "GENEL ADAPTÖR",
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.Mobile |
            TerminalCapability.DoorControl | TerminalCapability.Osdp,
            "OSDP okuyucu doğrudan PDKS değil; kontrolör/gateway üzerinden güvenli çift yönlü erişim entegrasyonu için."),

        new(
            "wiegand-controller",
            "Wiegand",
            "Legacy erişim okuyucusu",
            "Kontrolör / gateway",
            "Wiegand",
            "LEGACY",
            TerminalCapability.Card | TerminalCapability.Pin | TerminalCapability.DoorControl |
            TerminalCapability.Wiegand,
            "Eski okuyucular için uyumluluk katmanı. Yeni kurulumlarda güvenli OSDP tercih edilir."),

        new(
            "hid-mobile",
            "HID",
            "Signo / Mobile Access",
            "Kontrolör / Mobile Access",
            "OSDP • NFC • Bluetooth",
            "ADAPTÖR HAZIRLIĞI",
            TerminalCapability.Card | TerminalCapability.Mobile | TerminalCapability.DoorControl |
            TerminalCapability.Osdp,
            "NFC/Bluetooth mobil kimlik ve modern kart okuyucuları için erişim kontrolü entegrasyonu.")
    ];

    public static TerminalPlatformDescriptor Current => All.First(x => x.Id == CurrentProviderId);
}
