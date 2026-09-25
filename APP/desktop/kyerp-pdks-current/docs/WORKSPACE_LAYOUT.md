# KYERP workspace düzeni

## Canonical yerel çalışma alanı

Yerel ana klasör: `D:\KYERP-MERKEZ`

Önerilen yapı:

- `01_GITHUB\ky-erp` — GitHub kaynak kodunun temiz çalışma kopyası. Kaynak kodun tek doğruluk kaynağı GitHub'dır.
- `02_DRIVE` — Google Drive `KYERP-MERKEZ` klasörüne yerel junction/kısayol. Kaynak repo burada tutulmaz.
- `03_LOCAL_RUNTIME` — canlı/yerel runtime, test buildleri, geçici çalışma verisi. Git'e ve Drive'a doğrudan senkronlanmaz.
- `04_EXPORTS` — paylaşılacak kurulum, rapor ve dışa aktarım çıktıları.
- `99_TEMP` — geçici dosyalar; kaynak değildir.

## Google Drive düzeni

Drive kökünde `KYERP-MERKEZ` klasörü bulunur:

- `01_RUNTIME`
- `02_BACKUP`
- `03_REFERANS`
- `04_AKTARIM`
- `99_ARSIV`

Drive; runtime snapshot, yedek, referans ve aktarım dosyaları içindir. `.git` çalışma dizini Drive içine konulmaz.

## Kural

1. Kaynak kod: GitHub.
2. Yerel geliştirme: `D:\KYERP-MERKEZ\01_GITHUB\ky-erp`.
3. Runtime ve canlı veriler: yerel `03_LOCAL_RUNTIME`; gerekiyorsa güvenli snapshot/backup Drive'a yazılır.
4. Büyük/üçüncü taraf binary ve canlı DB GitHub'a eklenmez.
5. Eski dağınık KYERP klasörleri silinmeden önce karantinaya taşınır; doğrulamadan sonra temizlenir.
