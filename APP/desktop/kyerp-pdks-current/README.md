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

## Derleme

Windows + .NET 8 SDK:

```powershell
cd APP\desktop\kyerp-pdks-current
.\BUILD.ps1
```

Ciktilar `artifacts\` altinda olusur ve Git'e alinmaz.

## Kaynak snapshot

17.09.2026 tarihinde Google Drive'a tasinan `HKN_NATIVE_PERSONEL` klasorunden asil kaynak dosyalari ayiklanarak GitHub'a aktarildi. `bin`, `obj`, `PUBLISH_*`, yedekler ve gecici patch/deneme ciktilari kaynak kabul edilmedi.
