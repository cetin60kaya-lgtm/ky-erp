# KYERP PDKS

DESEN bilgisayarinda halen kullanilan mevcut PDKS calismasinin bizim kaynak kodu bu klasorde toplanir.

## Kaynak yapisi

- `src/HKN.Personel.Native`: Personel modulu, Firebird veri islemleri ve klasik PDKS arayuzu.
- `src/HKN.Personel.Bridge`: mevcut Hedef ana penceresi ile KYERP PDKS Personel modulunun entegrasyon ve ana acilis katmani.
- `tools/SmokeTest`: transaction/rollback ile veri yazma-dogrulama araci.
- `tools/SchemaDump`: Firebird tablo/sema kontrol araci.
- `docs`: canli durum ve kaynak secim notlari.

## Calisma modeli

Ana masaustu kisayolu `HKN.Personel.Bridge.exe` uzerinden acilir.

- Makinede mevcut Hedef PDKS bulunursa Bridge Hedef'i acar ve Personel modulunu mevcut ana pencereye entegre eder.
- Personel dugmesi ayri bir yama/overlay menusu olarak cizilmez. Mevcut `TToolBar` icindeki pasif Personel dugmesinin kendi state/text bilgisi aktif hale getirilir; ikon, renk, olcu ve diger dugmeler Hedef'in kendi gorunumunu kullanir.
- Personel dugmesine basildiginda eski `TPersonelF` yerine `HKN.Personel.Native` ana Hedef penceresinin calisma alanina gomulur.
- Hedef bulunmayan firmalarda ayni Bridge, `HKN.Personel.Native` uygulamasini standalone modda acar. Boylece KYERP almadan yalniz masaustu PDKS kullanan firma da desteklenir.
- `KY_PDKS_HEDEF_EXE` ile farkli bir legacy Hedef.exe yolu acikca verilebilir.

## Canli yollar

- Ana legacy uygulama: `D:\Hedef500\Hedef500\Hedef.exe`
- Personel: `D:\Hedef500\Hedef500\HKN.Personel.Native.exe`
- Bridge: `D:\Hedef500\Hedef500\HKN.Personel.Bridge.exe`
- Veritabani: `D:\Hedef500\Hedef500\Data\DATABASE.GDB`

## Guvenlik

Canli veritabani, yedek, personel verisi, lisans ve parola GitHub'a alinmaz.
Kaynakta DB parolasi hard-code edilmez. Gelistirme/test ortaminda `KY_PDKS_DB_PASSWORD` ortam degiskeni kullanilir.

Masaustu urunu iki hesap modelini destekleyecek sekilde tutulur:

- Firma isterse mevcut masaustu Kullanici Yonetimi ile yerel hesap/yetki kullanir.
- KYERP kullanan firma icin KYERP oturum/yetki entegrasyonu ayrica baglanabilir; masaustu urun KYERP'ye mecbur degildir.

## Yapilandirma

`ENVIRONMENT.example.ps1` ornek degiskenleri icerir. Parola veya canli secret dosyaya yazilmaz. Temel degiskenler:

- `KY_PDKS_DB_PATH`, `KY_PDKS_DB_HOST`, `KY_PDKS_DB_PORT`, `KY_PDKS_DB_USER`, `KY_PDKS_DB_PASSWORD`
- `KY_PDKS_RUNTIME_ROOT`, `KY_PDKS_REPORT_ROOT`, `KY_PDKS_PERSONEL_EXE`, `KY_PDKS_HEDEF_EXE`
- `KY_PDKS_API_BASE_URL`, `KY_PDKS_TENANT_ID`, `KY_PDKS_COMPANY_ID`, `KY_PDKS_WORKPLACE_ID`
- `KY_PDKS_API_TOKEN`: Desktop sync icin aktif KYERP session; dosyaya veya Git'e yazilmaz.

Runtime yolu verilmezse executable klasoru temel alinir. Bridge ayrica kendi klasorunu, bir ust klasoru ve standart `D:\Hedef500\Hedef500` / `C:\Hedef500\Hedef500` yollarini kontrol eder.

## Terminal ve TNF

`Islemler > Terminal Aktarim Profilleri` ekrani FixedWidth, Delimited ve strict `KYERP TNF v1` profillerini yonetir. Canonical TNF preset korumalidir; ozellestirmek icin kopyalanir. Dosyadan aktarim kullanici onayiyla transaction tabanli `GIRCIK` servisini kullanir ve duplicate kayitlari atlar.

Canonical TNF satiri: `KartNo,HH:mm,ddMMyy,1,001`.

## Rapor ciktilari

Raporlar menusunden aktif tablo PDF veya gercek XLSX olarak disa aktarilabilir.

## Derleme ve secretsiz test

Windows + .NET 8 SDK:

```powershell
cd APP\desktop\kyerp-pdks-current
.\BUILD.ps1
```

Komut `KYERP.PDKS.sln` icindeki aktif projeleri Release modunda derler, secretsiz kontrat testlerini calistirir ve Native/Bridge ciktilarini `artifacts\` altina publish eder. Ciktilar Git'e alinmaz.

Kurulum paketi:

```powershell
.\BUILD_SETUP.ps1
```

Setup'in ana kisayolu artik Bridge'i acar. Native Personel icin ayrica standalone kisayol istenirse kurulum gorevlerinden secilebilir.

Canli veritabani smoke testi yalniz acikca hazirlanmis baglanti degiskenleriyle calistirilir ve butun yazmalari transaction icinde rollback eder:

```powershell
dotnet run --project .\tools\SmokeTest\SmokeTest.csproj -c Release
```

## Kaynak snapshot

17.09.2026 tarihinde Google Drive'a tasinan `HKN_NATIVE_PERSONEL` klasorunden asil kaynak dosyalari ayiklanarak GitHub'a aktarildi. `bin`, `obj`, `PUBLISH_*`, yedekler ve gecici patch/deneme ciktilari kaynak kabul edilmedi.

## Tek komutla gelistirme makinesini guncelle

DESEN gibi Windows gelistirme makinesinde temiz branch'i guncellemek, Drive'daki legacy referans runtime'ini hazirlamak, PDKS'yi derlemek ve yeni artifact'leri Google Drive runtime alanina almak icin:

```powershell
cd APP\desktop\kyerp-pdks-current
.\DEV_SYNC.ps1 -OpenVsCode
```

Script calisma alani kirliyse durur; mevcut degisiklikleri silmez. Secret, lisans ve canli veritabanini Git'e kopyalamaz. Uretilen Native/Bridge ciktilari `D:\GoogleDrive\KYERP-MERKEZ\01_RUNTIME\KYERP-PDKS\current` altinda tutulur ve `BUILD-INFO.txt` ile branch/commit bilgisi kaydedilir.
