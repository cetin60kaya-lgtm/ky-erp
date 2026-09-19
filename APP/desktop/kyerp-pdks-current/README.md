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
