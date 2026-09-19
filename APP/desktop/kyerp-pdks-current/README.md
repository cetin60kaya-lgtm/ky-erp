# KYERP PDKS

DESEN bilgisayarinda halen kullanilan mevcut PDKS calismasinin bizim kaynak kodu bu klasorde toplanir.

## Kaynak yapisi

- `src/HKN.Personel.Native`: Personel modulu, Firebird veri islemleri ve klasik PDKS arayuzu.
- `src/HKN.Personel.Bridge`: mevcut Hedef ana penceresi ile KYERP PDKS Personel modulunun entegrasyon katmani.
- `tools/SmokeTest`: transaction/rollback ile veri yazma-dogrulama araci.
- `tools/SchemaDump`: Firebird tablo/sema kontrol araci.
- `docs`: canli durum ve kaynak secim notlari.

## Canli yollar

- Ana uygulama: `D:\Hedef500\Hedef500\Hedef.exe`
- Personel: `D:\Hedef500\Hedef500\HKN.Personel.Native.exe`
- Bridge: `D:\Hedef500\Hedef500\HKN.Personel.Bridge.exe`
- Veritabani: `D:\Hedef500\Hedef500\Data\DATABASE.GDB`

## Guvenlik

Canli veritabani, yedek, personel verisi, lisans ve parola GitHub'a alinmaz.
Kaynakta DB parolasi hard-code edilmez. Gelistirme/test ortaminda `KY_PDKS_DB_PASSWORD` ortam degiskeni kullanilir.

## Yapılandırma

`ENVIRONMENT.example.ps1` örnek değişkenleri içerir. Parola veya canlı secret dosyaya yazılmaz. Temel değişkenler:

- `KY_PDKS_DB_PATH`, `KY_PDKS_DB_HOST`, `KY_PDKS_DB_PORT`, `KY_PDKS_DB_USER`, `KY_PDKS_DB_PASSWORD`
- `KY_PDKS_RUNTIME_ROOT`, `KY_PDKS_REPORT_ROOT`, `KY_PDKS_PERSONEL_EXE`
- `KY_PDKS_API_BASE_URL`, `KY_PDKS_TENANT_ID`, `KY_PDKS_COMPANY_ID`, `KY_PDKS_WORKPLACE_ID`
- `KY_PDKS_API_TOKEN`: Desktop sync için aktif KYERP session; dosyaya veya Git'e yazılmaz.

Runtime yolu verilmezse executable klasörü temel alınır; aktif kaynakta sabit sürücü yolu kullanılmaz.

## Terminal ve TNF

`İşlemler > Terminal Aktarım Profilleri` ekranı FixedWidth, Delimited ve strict `KYERP TNF v1` profillerini yönetir. Canonical TNF preset korumalıdır; özelleştirmek için kopyalanır. Dosyadan aktarım kullanıcı onayıyla transaction tabanlı `GIRCIK` servisini kullanır ve duplicate kayıtları atlar.

Canonical TNF satırı: `KartNo,HH:mm,ddMMyy,1,001`.

## Rapor çıktıları

Raporlar menüsünden aktif tablo PDF veya gerçek XLSX olarak dışa aktarılabilir.

## Derleme ve secretsiz test

Windows + .NET 8 SDK:

```powershell
cd APP\desktop\kyerp-pdks-current
.\BUILD.ps1
```

Komut `KYERP.PDKS.sln` içindeki aktif projeleri Release modunda derler, secretsiz kontrat testlerini çalıştırır ve Native/Bridge çıktılarını `artifacts\` altına publish eder. Çıktılar Git'e alınmaz.

Canlı veritabanı smoke testi yalnız açıkça hazırlanmış bağlantı değişkenleriyle çalıştırılır ve bütün yazmaları transaction içinde rollback eder:

```powershell
dotnet run --project .\tools\SmokeTest\SmokeTest.csproj -c Release
```

## Kaynak snapshot

17.09.2026 tarihinde Google Drive'a tasinan `HKN_NATIVE_PERSONEL` klasorunden asil kaynak dosyalari ayiklanarak GitHub'a aktarildi. `bin`, `obj`, `PUBLISH_*`, yedekler ve gecici patch/deneme ciktilari kaynak kabul edilmedi.

## Tek komutla geliştirme makinesini güncelle

DESEN gibi Windows geliştirme makinesinde temiz branch'i güncellemek, Drive'daki legacy referans runtime'ını hazırlamak, PDKS'yi derlemek ve yeni artifact'leri Google Drive runtime alanına almak için:

```powershell
cd APP\desktop\kyerp-pdks-current
.\DEV_SYNC.ps1 -OpenVsCode
```

Script çalışma alanı kirliyse durur; mevcut değişiklikleri silmez. Secret, lisans ve canlı veritabanını Git'e kopyalamaz. Üretilen Native/Bridge çıktıları `D:\GoogleDrive\KYERP-MERKEZ\01_RUNTIME\KYERP-PDKS\current` altında tutulur ve `BUILD-INFO.txt` ile branch/commit bilgisi kaydedilir.
