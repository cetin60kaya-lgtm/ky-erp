# KY PDKS — Kart Cihazı Entegrasyon Sözleşmesi

## Amaç

Kart terminali markası değişse bile PDKS veritabanı, ERP senkronu ve masaüstü uygulama değişmez. Donanım yalnız Agent'ın ham satır kaynağıdır.

## Desteklenen kaynak modları

### FILE
Cihaz/ara yazılım bir klasöre TXT/CSV/DAT/LOG bırakır. Setup sonrası varsayılan izleme klasörü:

`C:\ProgramData\KY ERP\PDKS\Import`

Dosya tamamen yazılmadan okunmaz. İşlenen dosya `Archive` klasörüne taşınır; çözülemeyen satırlar `Reject` klasörüne kaydedilir.

### TCP_SERVER
Agent belirtilen portta dinler. Terminal KY PDKS bilgisayarının IP'sine bağlanır ve her kart hareketini satır sonuyla gönderir.

### TCP_CLIENT
Agent terminalin IP/port adresine bağlanır. Kopma durumunda kayıt kaybı olmaması terminalin kendi hafıza/tekrar gönderim davranışına bağlıdır; Agent bağlantıyı tekrar kurar.

### SERIAL
USB-Serial/RS232 cihaz `COMx` + baud ile açılır ve satır sonu bazlı kayıt okunur.

## Normalleştirilmiş kayıt

Her başarılı terminal satırı aşağıdaki alanlara dönüşür:

- `card_no`
- `event_at`
- `work_date`
- `event_time`
- `direction` (`AUTO` varsayılan)
- `source`
- `source_ref`
- orijinal `raw_line`
- fingerprint

Fingerprint `kart no + kesin tarih/saat` üzerinden alınır. Aynı fiziksel basım farklı kanal veya dosya ile tekrar gelirse ikinci ham kayıt oluşturulmaz.

## ERP eşleştirmesi

Senkron sırasında masaüstü uygulama KY ERP'den personel listesini yeniler. Yalnız:

- `SGK = VAR`
- kart numarası dolu
- kart tarihi işe giriş/işten çıkış aralığında

olan hareketler `/api/ik/personnel-control/time-events/import` endpointine gönderilir. Eşleşmeyen hareket silinmez; yerelde `ERROR` durumunda kontrol bekler.

## Üreticiye özel binary protokol

Bir cihaz ASCII/CSV satırı vermiyor ve yalnız üreticinin SDK'sı/binary protokolüyle konuşuyorsa yeni adapter bu katmana eklenir. Adapterın tek sorumluluğu üretici paketini `RawPunch` kaydına çevirmektir. Aşağıdaki parçalar değiştirilmez:

- `pdks.db`
- fingerprint/dedup
- personel eşleştirme
- ERP auth/MFA
- ERP sync
- UI
- Setup ve Windows servisi

Üreticiye özel komut/port/protokol, cihaz marka-model dokümanı görülmeden tahmin edilmez.


## 07.09.2026 — Hedef PDKS işyeri profili

Gerçek çalışan terminal/ara yazılım düzeni:

- Hedef PDKS 5.0.29
- Cihaz adı: `Cihaz1`
- Cihaz No: `1`
- Makine No: `1`
- Bağlantı: Ethernet
- IP: `192.168.1.224`
- Port: `5005`
- COM: `COM1` (Ethernet kullanılırken ikincil)
- Baudrate: `38400`
- Yön: `GIRIS`
- Hedef kart kayıt dosyası: `C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt`

Gerçek satır biçimi:

```text
00048,08:29,070926,1,001
```

Bu biçim mevcut `PunchParser` tarafından doğrudan okunur. Agent `HEDEF_TR500` modunda dosyayı `FileShare.ReadWrite | FileShare.Delete` ile salt-okunur açar. Kaynak dosyayı taşımaz, silmez veya değiştirip geri yazmaz. Aynı kart + tarih/saat fingerprint'i D1'e ikinci kez gönderilmez.

### Doğrudan cihaz erişimi

`TerminalDiagnostics.ProbeTcpAsync` yalnız TCP port erişimini doğrular; cihaza komut payload'ı göndermez. Bu test, Windows PDKS bilgisayarından `192.168.1.224:5005` erişiminin olup olmadığını gösterir.

Saat okuma/yazma, kapı testi, yeniden başlatma, yönetici silme ve cihaz kaydı silme komutları **üreticinin gerçek binary protokolü/SDK'sı doğrulanmadan** açılmaz. `TerminalProtocol=HEDEF_UNKNOWN_BINARY` iken `DirectCommandsEnabled=false` zorlanır.

Bu nedenle final güvenli mimari:

```text
Kart cihazı
  -> Hedef PDKS (mevcut çalışan bağlantı)
  -> timerecords.txt
  -> KYERP.PDKS.Agent (salt-okunur + dedupe + offline kuyruk)
  -> KY ERP D1
  -> PDKS puantaj / rapor / İK bağlantısı
```

Aynı anda ikinci bir uygulamanın üretici protokolü bilinmeden 5005 portuna kalıcı oturum açması yapılmaz. Önce salt-okunur dosya köprüsü production-safe ana yol olarak kullanılır.
