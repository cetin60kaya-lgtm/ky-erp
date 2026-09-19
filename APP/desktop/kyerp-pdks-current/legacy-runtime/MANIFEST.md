# Legacy runtime manifest

Bu klasör üçüncü taraf/eski Hedef runtime dosyalarını Git içine kopyalamaz; çalışan ortamın nasıl yeniden kurulacağını tarif eder.

## Yerel kaynak

Google Drive senkron klasörü: `D:\GoogleDrive\Hedef500`

Beklenen runtime öğeleri:

- `Hedef.exe`
- `Hedef.Lic`
- `HKN.Personel.Native.exe`
- `HKN.Personel.Bridge.exe`
- `Library\`
- `Report\`
- `Terminal Bilgi Aktar\`
- `donemolustur.exe`
- gerektiğinde Firebird kurulum paketi

## Git'e alınmayan özel/veri dosyaları

- `Data\DATABASE.GDB`
- `*.gbk`, `*.bak`
- lisans/anahtar dosyaları
- kullanıcı/personel verisi içeren exportlar
- eski setup/backup klasörleri

## Neden binary'ler Git'te değil?

`ky-erp` deposu public durumdadır. Ayrıca bazı runtime dosyaları GitHub'ın normal Git dosya sınırını aşmaktadır (ör. Personel self-contained EXE >100 MB). Bu nedenle çalışan legacy runtime Drive'da tutulur; kaynak kod GitHub'da tutulur.

Tam binary arşivi ileride GitHub'a taşınacaksa iki şart vardır: repo private olmalı ve büyük dosyalar Git LFS veya GitHub Release asset olarak yönetilmelidir.
