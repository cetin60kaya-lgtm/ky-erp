# KY PDKS — Windows Masaüstü

KY ERP ile bağlı çalışan, ancak kart toplama ve yerel kayıt için internete bağımlı olmayan Windows PDKS uygulamasıdır.

## Ürün yapısı

- `KY PDKS.exe`: Kullanıcının açtığı normal Windows masaüstü uygulaması.
- `KYERP.PDKS.Agent`: Windows hizmeti. Kullanıcı programı açmasa da kart kayıtlarını yerelde toplar.
- Yerel DB: `C:\ProgramData\KY ERP\PDKS\Data\pdks.db`
- Kart giriş klasörü: `C:\ProgramData\KY ERP\PDKS\Import`
- İşlenen dosya arşivi: `C:\ProgramData\KY ERP\PDKS\Archive`
- ERP API: `https://api.kyerp.net`

## Temel çalışma

1. Setup programı masaüstü uygulamayı ve kart Agent servisini kurar.
2. Agent Windows ile sessiz başlar; masaüstü uygulama otomatik açılmaz.
3. Kart kaydı önce yerel SQLite veritabanına yazılır. İnternet veya ERP cevabı beklenmez.
4. Masaüstü uygulamada KY ERP kullanıcı hesabıyla giriş yapılır. MFA gerekiyorsa aynı KY ERP doğrulama akışı kullanılır.
5. Bekleyen kart kayıtları mevcut KY ERP PDKS API'sine gönderilir.
6. ERP kapalı veya internet yokken ham kart kayıtları yerelde birikmeye devam eder.

## İlk kart adaptörü

İlk sürüm gerçek çalışma sağlayacak şekilde dosya tabanlı kart kaynağını destekler. Agent `Import` klasörüne gelen `.txt`, `.csv` ve `.dat` dosyalarını okur.

Desteklenen satırlar:

```text
00004,08:28,300826,1,001
00004,30.08.2026,08:28
```

Donanım marka/modeli kesinleştirildiğinde aynı `ICardReaderAdapter` sözleşmesine cihazın TCP/SDK adaptörü eklenir. Ham kayıt tablosu ve ERP senkronu değişmez.

## Veri güvenliği

- Ham kart kaydı silinmez; her kayıt benzersiz fingerprint ile tutulur.
- Aynı ham kayıt ikinci kez içeri alınmaz.
- ERP senkronu ham kaydı değiştirmez, yalnız `sync_state` bilgisini günceller.
- Üretim D1 verisi test amacıyla değiştirilmez.
- Denetim hesabı KY ERP tarafındaki salt-okunur güvenlik politikasını aynen kullanır.

## Setup üretimi

Repo kökünden veya bu klasörden:

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILD_SETUP.ps1
```

Script Desktop ve Agent'ı self-contained `win-x64` publish eder. Inno Setup 6 kuruluysa `KY-PDKS-Setup.exe` üretir.
