# KY PDKS — Terminal Hub uyumluluk ve kurulum kanıtı
Tarih: 09.10.2026 — İzole test kullanılabilir; tüm marka/model canlıda sertifikalı değildir.

## Bağlantı profilleri

| Kod | Hedef | Durum |
|---|---|---|
| KY_QR_LOCAL | Yerel QR / USB HID | Çalışan, test edilmiş yazılım referansı; FDB/TNF senkronu henüz yok |
| ZK_PULL | ZKTeco Standalone SDK | SDK + firmware + model testi gerekli |
| ZK_PUSH | ZKTeco ADMS/Push | Gerçek model protokol sürümü gerekli |
| BIOSTAR_2 | Suprema BioStar 2 HTTPS API | Lisans, oturum API ve olay kodu testi gerekli |
| BIOSTAR_X | Suprema BioStar X API | Sunucu, API lisansı ve model testi gerekli |
| HIKVISION_ISAPI | Hikvision ISAPI | Modeline göre ACS/API olay testi gerekli |
| ANVIZ_CROSSCHEX | Anviz CrossChex | Uyumlu modeller ve API hesabı gerekli |
| DAHUA_SDK | Dahua Access SDK | SDK ve firmware sertifikasyonu gerekli |
| OSDP_CONTROLLER | OSDP Secure Channel | RS-485 okuyucu + sertifikalı kontrol paneli gerekli |
| WIEGAND_CONTROLLER | Legacy Wiegand | Fiziksel kontrol paneli gerekli; doğrudan TCP/IP terminal değildir |
| GENERIC_HTTPS_WEBHOOK | Genel HTTPS JSON API | İmzalı olay sözleşmesi ve üretici eşlemesi gerekli |
| CSV_TNF_FILE | TNF dosyası | Referans okuma var; ham terminal delili olarak kullanılamaz |

Resmî teknik kaynaklar:
- ZKTeco SDK indirmeleri: https://zkteco.com/en/SDK
- Suprema BioStar 2 API olay sorgusu: https://support.supremainc.com/en/support/solutions/articles/24000072557-biostar-2-new-local-api-quick-start-guide-5-retrieve-log-data
- Anviz CrossChex uyumlu model listesi: https://support.anviz.com/hc/en-us/articles/41623611551897-Which-Models-Support-CrossChex-Cloud-System
- SIA OSDP teknik standart: https://www.securityindustry.org/industry-standards/open-supervised-device-protocol/

## Okutma seçenekleri

RFID 125 kHz, RFID 13.56 MHz, güvenli NFC, imzalı QR, üretici QR,
USB HID barkod/kart, parmak izi, yüz tanıma, PIN, mobil NFC.

Bunlar 10 adet kurulum özelliğidir; bütün fiziksel okuyucu sürücüleri
sertifikalı değildir. Parmak izi/yüz şablonları yazılıma kopyalanmaz.

KY QR: KYQR1 / HMAC-SHA256, gerçek firma/kart/personel kaynak kanıtı,
nonce, kısıtlı geçerlilik, imza kontrolü ve çakışmayan kaynak SHA.
Tek kullanımlık dinamik QR tercih edilir; sabit QR'nin uzun süre tekrar
kullanılması güvenli kabul edilmez. Firebird/TNF mutabakatı yapılana
kadar bütün kayıtlar beklemektedir.

USB HID: Okuyucunun gönderdiği beş haneli kart numarası yalnız
PENDING_IDENTITY_AND_RECONCILIATION olarak saklanır;
kimlik/cihaz doğrulanmış fiziksel giriş kaydı gibi gösterilmez.

## Windows kurulumu: yalnız KY QR / USB referans

Dosyalar:
- APP/pdks-unified/windows/tools/Install-KyPdks-LocalTerminal.ps1
- APP/pdks-unified/device-gateway/terminal-cli.mjs
- APP/pdks-unified/device-gateway/terminal-kiosk.mjs
- APP/pdks-unified/device-gateway/terminal-kiosk.html

Gerçek firma kimliği ve terminal numarası belirlendiğinde yetkili
Windows kullanıcısı aşağıdaki şablonu kullanır:

~~~powershell
cd "D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web\APP\pdks-unified\windows\tools"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Install-KyPdks-LocalTerminal.ps1" -Action Install -TerminalId "GERCEK-TERMINAL-ID" -CompanyId "GERCEK-FIRMA-ID"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Install-KyPdks-LocalTerminal.ps1" -Action ShowOperatorKey -TerminalId "GERCEK-TERMINAL-ID"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Install-KyPdks-LocalTerminal.ps1" -Action Start -TerminalId "GERCEK-TERMINAL-ID"
~~~

- İmza ve operator secret şifrelenmiş DPAPI dosyasında saklanır.
- Operatör anahtarı yalnız kullanıcı yerel ekranında onaylayarak görüntülenir.
- Yerel sunucu yalnız 127.0.0.1:5197–5205 dinler, internete açık değildir.
- Status/Stop yalnız tanımlanmış terminalin kayıtlı PID'sini denetler.
- Ham USB, QR ve bekleyen kayıtlar silinmez; atomik dosya ve fsync kullanılır.
- Son yerel kanıtlar yetkili operatörle görüntülenebilir ve JSON olarak
  dışarı alınabilir. FDB, TNF, Cloud üretim verisi otomatik yazılmaz.
- QR imzalı kart basımı/oluşturma gerçek kart-personel eşleşme onayı
  gerektirir; cihaz bağlantı profili tek başına kimlik onayı değildir.

## 09.10.2026 son test

GitHub kod HEAD: 94ecbdedd686b5a3686d26fc6b1a8316823ce6cd
- Cloud sözleşme ve güvenlik: 45/45
- Windows Agent + localhost Cloud + kopya Firebird E2E: 1/1
- Ham cihaz/TNF/protokol + QR/USB: 33/33
- PDKS UI: 36/36
- Toplam 115/115 otomatik test başarılı.
- Ek 5 Windows güvenlik öz testi, 3 adet kopya Firebird ledger rollback.
- Windows Release, Cloud TypeScript, PDKS ESLint ve frontend build PASS.
- Windows DPAPI geçici kullanıcı kurulumu -> localhost Start ->
  Health -> Status -> Stop başarıyla doğrulandı.
- Chrome 9 bölüm ve 49 sekme, 12 connector ve 10 okutma türü PASS.
- Son kabul: RESULT=PASS_PDKS_TERMINAL_HUB_FULL_GATE
- Kanıt logu:
  D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\PDKS_TERMINAL_ENDTOEND_FINAL_20261009.log

## Üretim aşamasından önce gerekenler

Gerçek marka/model ve cihaz seri numarası; resmî SDK ve yetkili
olay okuma lisansı; cihaz saati/clock drift; kart-personel yetki
eşlemesi; fiziksel RAW + Firebird + yıllık TNF + D1 mutabakatı;
ayrı Cloudflare staging D1; üretim servis kurulumu ve operatör
yetkileri; model bazında saha kabul testleri.

PR #404 DRAFT/UNMERGED. Canlı FDB, TNF, terminal RAW ve Cloudflare D1
değiştirilmedi. Evrensel cihaz uyumluluğu bu belgeyle iddia edilmez.
