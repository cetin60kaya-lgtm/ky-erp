# KY PDKS Pro 1.9.0 — Windows + Web Tek Ürün

KY PDKS Pro, KY ERP'nin PDKS modülünün Windows ürünüdür. Web ve masaüstünde ikinci bir PDKS tasarımı veya ikinci iş veritabanı oluşturmaz: **aynı canonical React arayüzü, aynı D1 iş verisi ve aynı backend kuralları** kullanılır.

Windows'a özel katman yalnız terminal/Agent/offline toplama, yerel log-yedek ve cihaz bağlantı ayarlarıdır.

## Ürün mimarisi

```text
Kart Terminali
   │  işyeri LAN / dosya / COM / TCP
   ▼
KYERP.PDKS.Agent
   │
   ├─ C:\ProgramData\KY ERP\PDKS\Data\pdks.db
   │    yalnız ham kart + offline kuyruk + cache/log durumu
   │
   └─ HTTPS
        ▼
https://api.kyerp.net
        ▼
KY ERP D1
        ▼
Web PDKS = KY PDKS Pro Desktop
```

PDKS Desktop, paketlenmiş KY ERP frontendini WebView2 içinde canonical `https://app.kyerp.net/index.html` origin'iyle çalıştırır. Document-start aşamasında `PDKS` ürün işareti enjekte edilir; React yalnız PDKS modülünü görünür tutar. Böylece webdeki PDKS güncellendiğinde masaüstü için ayrı ekran mantığı korunmak zorunda kalmaz.

## Kurulan bileşenler

- `KY PDKS Pro.exe`: canonical PDKS arayüzünü çalıştıran Windows uygulaması.
- `KYERP.PDKS.Agent`: uygulama kapalı olsa da kart hareketini yerelde toplamaya devam eden Windows hizmeti.
- `web\`: aynı KY ERP frontend build'i; PDKS ürün modu yalnız PDKS modülünü açar.
- Setup: `KY-PDKS-Pro-Setup-1.9.0.exe`.
- Yerel DB: `C:\ProgramData\KY ERP\PDKS\Data\pdks.db`.
- Import/Archive/Reject/Backup/Logs/Reports: `C:\ProgramData\KY ERP\PDKS`.
- Canlı API: `https://api.kyerp.net`.

## Tek veri / sahiplik kuralı

İş verisinin ana kaynağı D1'dir.

- Personel ana kartı: **İK**.
- PDKS personel görünümü: İK kartının operasyon referansı; ikinci personel kartı oluşturmaz.
- Kart olayları: `ik_time_clock_events`.
- Puantaj düzeltmeleri: `ik_attendance_day_overrides`.
- Vardiya/grup ve personel ataması: PDKS D1 master tabloları.
- Servis ve personel servisi: PDKS D1 master tabloları.
- İzin planı/hakediş: D1 izin kayıtları; PDKS puantaja uygular.
- Dönem kilidi: `ik_monthly_close`.
- Maaş, banka/elden, avans, kesinti, icra/haciz ve bordro: **İK**; PDKS ikinci kez yönetmez.

Normal PDKS operasyonunda aktif kartlı personel gerçek kart hareketiyle çalışır. `DENETIM` görünümü güvenli aylık SGK + kart kapsamına daraltılır ve bütün yazma işlemleri kapalıdır.

## Canlı Kontrol Merkezi

Ana ekran vardiya ve gün kuralını dikkate alarak ayrı durum üretir:

- Bugün Gelen
- İçeride
- Çıkan
- Gelmeyen / No-show
- Vardiya Beklenen
- Yıllık İzinde
- Raporlu
- Diğer İzinli
- Geç Gelen
- Eksik Çıkış
- Çalışma dışı / resmî tatil
- Çevrimiçi / çevrimdışı terminal

Kritik fark: vardiya başlangıcı henüz gelmemiş personel **gelmeyen sayılmaz**; tek kart basımı da vardiya bitmeden otomatik olarak **eksik çıkış** sayılmaz.

## AI Kontrol Merkezi

PDKS içinde ayrı **AI & Kontrol** alanı vardır.

Örnekler:

- Bugün kim gelmedi?
- Şu an kim içeride?
- Yıllık izinde veya raporlu kim var?
- Çıkış basmayı unutan var mı?
- Geç gelenleri sırala.
- Hangi terminal çevrimdışı?
- Bugünkü PDKS risklerini önem sırasına koy.

Canlı personel snapshot'ı AI analizinde `ephemeral` modda kullanılır; PDKS canlı snapshot'ı AI sohbet geçmişine yazılmaz. AI Gateway payload logging varsayılanı kapalı kalır.

PDKS veri değiştiren doğal dil işlemleri preview-first çalışır. Örnek:

```text
Ali Akkaya bugün 08:32 geldi
Ali Akkaya bugün gelmedi, yok yaz
Ali Akkaya bugün 18:55 çıkış yaptı
```

Önce önizleme çıkar; kullanıcı **Onayla ve Uygula** demeden D1'e yazılmaz. Finans/bordro komutları PDKS asistanında engellenir.

## Terminal Kurulum Sihirbazı

`Terminal & Sistem` ekranından Windows'ta **Windows Terminal Ayarları / Kurulum Sihirbazı** açılır.

Hazır profiller:

- İşyeri Hedef500
- FILE / TXT-DAT
- TCP Client
- TCP Server
- Serial / COM

Tanımlanabilen alanlar:

- cihaz adı / cihaz no / makine no
- GİRİŞ / ÇIKIŞ / AUTO
- kaynak modu
- IP / port
- veri dosyası
- opsiyonel üretici yazma dosyası
- COM / baud
- tarama ve senkron aralığı
- otomatik D1 senkronu
- import klasörü takibi

İşyeri Hedef500 hızlı profili şu an:

```text
Cihaz1
Cihaz No: 1
Makine No: 1
Yön: GİRİŞ
IP: 192.168.1.224
Port: 5005
COM1 / 38400
C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt
```

Bu değerler sabit mimari değildir; başka bilgisayar/terminalde sihirbazdan değiştirilebilir.

## Güvenli cihaz testi

Sihirbazdaki test:

- Windows PC saatini gösterir,
- TCP host/port erişimini dener,
- Hedef/TXT-DAT dosyasını read-only açar,
- tanınan/tanınmayan satır sayısını verir,
- son kart hareketini gösterir.

**Cihaza binary/yazma komutu göndermez.**

Cihaz saati okuma/yazma, zil tablosu, kapı rölesi, cihaz kodu, yönetici silme veya restart gibi üretici komutları marka-model/protokol doğrulanmadan tahmin edilmez. Bu komutlar için doğrulanmış üretici adapterı gerekir.

Terminal portu internete açılmaz / WAN port-forward yapılmaz. Agent işyeri LAN'ında terminali görür ve KY ERP'ye dışarı doğru HTTPS bağlantısı kurar.

## Kart kaynağı ve offline çalışma

Agent şu kaynak modlarını destekler:

- `HEDEF_TR500`
- `FILE`
- `TCP_SERVER`
- `TCP_CLIENT`
- `SERIAL`

Tanımlı örnek satırlar:

```text
00004,08:28,300826,1,001
00004,30.08.2026,08:28
00004;2026-08-30;08:28:14
00004 2026-08-30 08:28:14
```

Kart numarası 5 haneden kısaysa başına sıfır eklenir. Aynı fiziksel basım fingerprint + D1 tekillik kontrolüyle tekrar yazılmaz.

İnternet kesildiğinde Agent SQLite/WAL kuyruğunda kart toplamayı sürdürür. Bağlantı geri geldiğinde yetkili cihaz kimliğiyle HTTPS üzerinden D1'e gönderir. Kullanıcı parolası diske yazılmaz. Kullanıcı oturumu gerektiği yerlerde Windows DPAPI CurrentUser; cihaz senkron secretı LocalMachine korumasıyla saklanır.

## Windows hizmeti

`KYERP.PDKS.Agent`:

- Automatic (Delayed Start)
- service recovery: tekrar başlatma
- uygulama kapalıyken kart toplamaya devam
- düzenli yerel yedek
- günlük log
- offline queue
- cihaz heartbeat/senkron

## Build ve Setup

Gerekenler:

- Windows 10/11 x64
- .NET 8 SDK
- Node/npm
- Inno Setup 6

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILD_SETUP.ps1
```

Build kapıları:

1. `npm ci`
2. frontend test
3. frontend lint
4. frontend production build
5. .NET restore
6. xUnit
7. ERP Desktop publish
8. KY PDKS Pro publish
9. PDKS Agent publish
10. canonical frontendin iki Windows ürününe paketlenmesi
11. Inno Setup
12. SHA256
13. `build-info.json`

Başarılı PDKS çıktıları:

```text
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Pro-Setup-1.9.0.exe
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Pro-Setup-1.9.0.exe.sha256.txt
APP\desktop\ky-pdks\dist\setup\build-info.json
```

GitHub workflow: `.github/workflows/ky-pdks-windows-build.yml`. Workflow production deploy değildir; yalnız açık talep halinde Windows test/paket artifact üretimi için kullanılır.

## Release kapısı

Kaynak değişikliği tamam = production tamam değildir.

Sıra:

```text
feature branch
→ frontend/API/.NET test + build
→ KY PDKS Pro Setup artifact
→ gerçek Windows kurulumu
→ gerçek terminal / kart / offline / DENETIM kontrolü
→ kullanıcı onayı
→ production merge
→ Cloudflare Git Integration
→ canlı smoke
```

Production D1 migration/deploy Windows build sürecinin parçası değildir.
