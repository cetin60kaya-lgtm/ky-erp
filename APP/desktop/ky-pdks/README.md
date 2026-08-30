# KY PDKS — Windows Masaüstü

KY ERP ile bağlı çalışan, kart toplama ve yerel kayıt için internete bağımlı olmayan gerçek Windows PDKS ürünüdür.

## Kurulan ürün

- `KY PDKS.exe`: kullanıcının açtığı WPF masaüstü uygulaması.
- `KYERP.PDKS.Agent`: Windows hizmeti; masaüstü uygulama kapalı olsa bile kart kaydını yerelde toplamaya devam eder.
- Setup: `KY-PDKS-Setup-1.0.0.exe`.
- Yerel DB: `C:\ProgramData\KY ERP\PDKS\Data\pdks.db`.
- Import: `C:\ProgramData\KY ERP\PDKS\Import`.
- Arşiv: `C:\ProgramData\KY ERP\PDKS\Archive`.
- Hatalı satırlar: `C:\ProgramData\KY ERP\PDKS\Reject`.
- Yerel yedekler: `C:\ProgramData\KY ERP\PDKS\Backup`.
- Agent logları: `C:\ProgramData\KY ERP\PDKS\Logs`.
- ERP API: `https://api.kyerp.net`.

## Çalışma ilkesi

1. Setup masaüstü programı ve `KY ERP PDKS Agent` hizmetini kurar.
2. Agent Windows ile sessiz başlar. **KY PDKS penceresi Windows açılışında kendiliğinden açılmaz.**
3. Kart hareketi önce yerel SQLite/WAL veritabanına yazılır. İnternet ve ERP cevabı kart basımını bekletmez.
4. Masaüstü uygulamada mevcut KY ERP kullanıcı hesabıyla giriş yapılır. Mevcut MFA ve giriş onayı sözleşmesi kullanılır.
5. ERP oturum tokenı Windows kullanıcısına özel DPAPI ile şifrelenir; parola hiçbir zaman diske yazılmaz ve Agent'a verilmez.
6. Uygulama açık ve ERP oturumu geçerliyken bekleyen kartlar otomatik veya elle ERP'ye gönderilir.
7. Uygulama kapalı/internet kesik olduğunda Agent yalnız yerel kart toplamaya devam eder. Sonraki girişte senkron kaldığı yerden devam eder.
8. ERP'ye gönderimden önce personel kaynağı yenilenir; yalnız `SGK=VAR` ve kart numarası bulunan personel eşleşmeleri senkrona girer.
9. İşe giriş/işten çıkış tarihinin dışındaki hareketler otomatik gönderilmez, kontrol durumunda yerelde tutulur.

## Kart kaynakları

Agent aynı veri çekirdeğinde dört kaynak modunu destekler:

- `FILE`: kart cihazının/ara yazılımın oluşturduğu `.txt`, `.csv`, `.dat`, `.log` dosyaları.
- `TCP_SERVER`: cihaz KY PDKS bilgisayarına TCP bağlantısı açar ve satır gönderir.
- `TCP_CLIENT`: KY PDKS Agent cihazın IP/port adresine bağlanıp satır okur.
- `SERIAL`: COM/RS232/USB-Serial üzerinden satır okur.

Dosya Import özelliği doğrudan terminal modu TCP/Serial olsa bile açık tutulabilir. Kaynak ayarları masaüstündeki **Terminal ve Ayarlar** sayfasından yapılır.

Tanımlı satır örnekleri:

```text
00004,08:28,300826,1,001
00004,30.08.2026,08:28
00004;2026-08-30;08:28:14
00004 2026-08-30 08:28:14
```

Kart numarası 5 haneden kısaysa başına sıfır eklenir. Aynı kart + aynı saniye farklı kanaldan tekrar gelse bile fingerprint ile tek ham kayıt tutulur.

## Masaüstü ekranları

- **Genel Bakış:** bugün kart, bekleyen, senkronlanan, kontrol gereken, ERP giriş/aktivasyon ve son hareketler.
- **Canlı Kart:** son 500 ham kart hareketi, personel eşleşmesi, kaynak ve ERP durumu.
- **Personel:** KY ERP'den önbelleğe alınan SGK'lı + kartlı personel.
- **Terminal ve Ayarlar:** FILE/TCP/COM yapılandırması, otomatik senkron, Agent yeniden başlatma, klasörler ve manuel yedek.

## Veri güvenliği

- Ham kart hareketi sonradan değiştirilmez; ERP senkronu yalnız `sync_state`, hata ve `synced_at` alanlarını günceller.
- Aynı ham kayıt ikinci kez alınmaz.
- SQLite `WAL`, foreign key ve `busy_timeout` ile çok süreçli Desktop + Agent kullanımı için açılır.
- Agent 12 saatte bir yerel DB yedeği alır; kullanıcı ayrıca elle yedek alabilir.
- Uninstall yerel PDKS DB ve yedeklerini **silmez**.
- Canlı ERP/D1 test verisi bu Windows build sürecinde değiştirilmez.
- `DENETIM` hesabı masaüstünde yerel veriyi görüntüleyebilir fakat ERP kart write işlemi yapamaz; server tarafındaki salt-okunur politika korunur.

## Cihaz protokolü sınırı

KY PDKS'nin veri alma/saklama/senkron/Setup çekirdeği cihaz markasından bağımsızdır. Bir terminal yalnızca üreticiye özel binary SDK/protokol kullanıyorsa o marka/model için küçük bir adapter gerekir. Marka/model bilinmeden üretici komutu uydurulmaz. Dosya/TCP satır/seri satır veren cihazlarda ek adapter gerekmez.

## Setup üretimi

Windows 10/11 x64 + .NET 8 SDK + Inno Setup 6 olan makinede:

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILD_SETUP.ps1
```

Build sırası: Shared + Agent + Desktop restore/build → testler → self-contained `win-x64` publish → Inno Setup → SHA256 ve `build-info.json`.

CI dosyası: `.github/workflows/ky-pdks-windows-build.yml`.

Başarılı build çıktısı:

```text
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Setup-1.0.0.exe
APP\desktop\ky-pdks\dist\setup\KY-PDKS-Setup-1.0.0.exe.sha256.txt
APP\desktop\ky-pdks\dist\setup\build-info.json
```
