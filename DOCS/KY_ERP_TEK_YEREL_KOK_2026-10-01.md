# KY ERP — Tek Yerel Kök

Tarih: 01.10.2026

## Tek aktif düzen

- Yerel kök: `D:\Googledrive\KYERP`
- Git working copy: `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp`
- GitHub: `https://github.com/cetin60kaya-lgtm/ky-erp.git`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Canlı veri: Cloudflare D1 `ky-erp-db`

## Klasör sözleşmesi

- `00_CANONICAL/GITHUB/ky-erp`: tek aktif repo clone'u.
- `00_CANONICAL/CONTROL`: yerel canonical manifest ve sabit kurallar.
- `01_DATA_BACKUP/D1`: tam D1 SQL exportları + SHA256.
- `01_DATA_BACKUP/FIREBIRD_PDKS`: Firebird/PDKS veri yedekleri.
- `01_DATA_BACKUP/CONFIG_EXPORTS`: secrets içermeyen Cloudflare/D1/R2 servis envanteri.
- `02_RUNTIME`: yerel ajan/servis runtime dosyaları.
- `03_INSTALL`: kurulum paketleri.
- `04_REFERENCE`: salt okunur referans.
- `05_IMPORT`: eski kaynaklardan kontrollü geçici aktarım.
- `99_ARCHIVE`: eski kökler, eski clone'lar ve tarihsel paketler.

## Yasak eski çalışma kökleri

Aşağıdakiler yeni geliştirme veya deploy kaynağı değildir:

- `D:\Googledrive\KYERP-MERKEZ`
- `D:\Googledrive\KYERP-GELISTIRME-MERKEZI`
- `D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ`
- bağımsız `D:\Googledrive\KYERP-PDKS-*` clone'ları

Eski içerik silinmez; arşiv/referans olarak tutulabilir. Yeni sohbet veya ajan bu yolları ancak eski veri kurtarma/karşılaştırma işi açıkça gerekiyorsa okur.

## Veri kuralı

D1 SQL export dosyası canlı veritabanı değildir. Canlı muhasebe, kullanıcı, stok, lot, üretim ve diğer ERP verileri her zaman Cloudflare D1/API üzerinden doğrulanır. Drive yedekleri geri dönüş, denetim ve migration güvenliği içindir.
