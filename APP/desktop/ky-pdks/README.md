# KY PDKS 1.8.0 — Windows Masaüstü

KY ERP'nin PDKS modülüyle aynı D1 iş verisini kullanan gerçek Windows masaüstü uygulamasıdır. Windows tarafındaki SQLite ikinci personel/izin/avans/bordro veritabanı değildir; yalnız ham kart, offline kuyruk, cache, log ve yedek içindir.

## Kurulan ürün

- `KY PDKS Desktop.exe`: PDKS-only WPF masaüstü uygulaması.
- `KY ERP Desktop.exe`: aynı build zincirinden üretilen tam ERP Windows kabuğu.
- `KYERP.PDKS.Agent`: Windows hizmeti; uygulama kapalı olsa bile kart hareketini yerelde toplamaya devam eder.
- PDKS Setup: `KY-PDKS-Desktop-Setup-1.8.0.exe`.
- Tam ERP Setup: `KY-ERP-Desktop-Setup-1.8.0.exe`.
- Yerel DB: `C:\ProgramData\KY ERP\PDKS\Data\pdks.db`.
- Import/Archive/Reject/Backup/Logs/Reports: `C:\ProgramData\KY ERP\PDKS` altında.
- ERP API: `https://api.kyerp.net`.

## Tek DATA kuralı

İş verisinin ana kaynağı KY ERP D1'dir:

- Personel: İK Personel Kartı; normal PDKS kart importu aktif + kart numarası bulunan personeli SGK durumundan bağımsız kullanır. `DENETIM` görünümü SGK kapsamını ayrı salt-okunur filtreler.
- Kart olayları: `ik_time_clock_events`.
- Puantaj düzeltmeleri: `ik_attendance_day_overrides`.
- Vardiya ve personel vardiyası: PDKS D1 vardiya tabloları.
- Servis ve personel servisi: PDKS D1 servis tabloları.
- İzin: D1 izin planları; Cumartesi izin gününe dahildir, Pazar dahil değildir, resmî tatiller düşülür.
- Avans/bordro: KY ERP İK ile aynı D1 finans/bordro kayıtları.
- Dönem kilidi: `ik_monthly_close`; kilitli aya kart, düzeltme, import, izin, avans ve tatil yazılmaz.
- Geç/erken/fazla süre hesabı server tarafında personelin D1 vardiyasına göre normalize edilir.

`DENETIM` hesabı yalnız SGK=VAR + kartlı personel ile güvenli PDKS görünümünü okuyabilir; personel finansı ve bütün yazma işlemleri kapalıdır.

## Kart kaynağı ve offline çalışma

Agent aynı çekirdekte `HEDEF_TR500`, `FILE`, `TCP_SERVER`, `TCP_CLIENT` ve `SERIAL/COM` kaynaklarını destekler. Hakan Emprime işyeri için doğrulanan Hedef PDKS akışı `C:\Hedef500\Terminal Bilgi Aktar\timerecords.txt` dosyasını salt okunur biçimde takip eder; kaynak dosyayı taşımaz, silmez veya değiştirmez.

Tanımlı satır örnekleri:

```text
00004,08:28,300826,1,001
00004,30.08.2026,08:28
00004;2026-08-30;08:28:14
00004 2026-08-30 08:28:14
```

Kart numarası 5 haneden kısaysa başına sıfır eklenir. Aynı kart + aynı zaman hareketi farklı kanaldan tekrar gelse bile yerel fingerprint ve D1 tekillik kontrolü mükerrer kaydı önler.

İnternet kesildiğinde Agent kartı SQLite/WAL kuyruğuna alır. KY ERP oturumu ve bağlantı geldiğinde kuyruk D1'e gönderilir. Parola diske yazılmaz; kullanıcı tokenı Windows DPAPI CurrentUser ile korunur.

## Masaüstü iş akışı

- Genel Bakış / Canlı Kart: yerel ham kart ve senkron durumu.
- Personel / Puantaj: KY ERP D1 personeli ve aylık D1 sonucu.
- Detay Yönetim: D1 vardiya, servis ve personel atamaları; terminal ayarı yalnız fiziksel Windows cihaz konfigürasyonudur.
- İzin / Avans / Dönem / Bordro: doğrudan `/api/ik/personnel-control/operations/*` canonical D1 endpointlerini kullanır.
- Yıllık TEMP / Denetim: yalnız SGK=VAR + kartlı personelin puantajından üretilir; finans alanı içermez.

## Build ve Setup

Windows 10/11 x64 + .NET 8 SDK + Inno Setup 6:

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILD_SETUP.ps1
```

Build zinciri restore → Shared/Agent/Desktop Release build → xUnit → self-contained win-x64 publish → Inno Setup → SHA256 → `build-info.json` şeklindedir. Her native komutun exit code'u kontrol edilir; herhangi bir build/test/publish hatasında Setup üretimi durur.

Başarılı çıktı:

```text
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Desktop-Setup-1.8.0.exe
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Desktop-Setup-1.8.0.exe.sha256.txt
APP\desktop\ky-pdks\dist\setup\KY-ERP-Desktop-Setup-1.8.0.exe
APP\desktop\ky-pdks\dist\setup\KY-ERP-Desktop-Setup-1.8.0.exe.sha256.txt
APP\desktop\ky-pdks\dist\setup\build-info.json
```

GitHub Actions: `.github/workflows/ky-pdks-windows-build.yml`.

## Kurulum davranışı

Setup yönetici yetkisi ister, uygulamayı `Program Files\KY ERP\KY PDKS` altına kurar, `KYERP.PDKS.Agent` hizmetini Automatic (Delayed Start) olarak oluşturur ve recovery ayarlarını yapar. Uninstall, kart güvenliği için `C:\ProgramData\KY ERP\PDKS` içindeki DB ve yedekleri silmez.

Production D1 migration/deploy işlemleri Windows build sürecinin parçası değildir; önce API/frontend/Windows testleri ve şema readiness doğrulanır.

## Terminal / Cihaz Merkezi — 07.09.2026

PDKS-only masaüstünde üst çubuktaki **Terminal / Cihaz** penceresi:

- Hedef500 hazır profilini uygular,
- cihaz adı/no/makine no/yön/IP/port/baud ayarını saklar,
- `192.168.1.224:5005` için payload göndermeden güvenli TCP erişim testi yapar,
- `timerecords.txt` dosyasını paylaşımlı-okuma ile analiz eder,
- toplam/okunan/tekrar/tanınmayan satır sayılarını gösterir,
- son terminal kart kaydını gösterir,
- PC saatini canlı gösterir.

Üretici binary protokolü veya resmi SDK doğrulanmadan cihaz tarih/saat yazma, kapı testi, yeniden başlatma, yönetici silme ve kayıt silme komutları kilitlidir. Bu kilit çalışan Hedef PDKS bağlantısını koruyan fail-closed donanım güvenliği kuralıdır.

Ana veri yolu:

`Kart cihazı -> Hedef PDKS -> timerecords.txt -> KYERP.PDKS.Agent -> offline SQLite/WAL -> KY ERP D1`

Agent `timerecords.txt` değişmediği sürece dosyayı tekrar tekrar baştan taramaz; dosya değiştiğinde yeniden okur ve fingerprint dedupe uygular.
