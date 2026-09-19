# PDKS kalan teknik borç

- Fiziksel terminal üretici protokolü kesin kaynak sağlandığında `ITerminalDeviceAdapter` implementasyonu eklenecek. File/TNF adapterı hazırdır.
- Feature branch’te canonical Cloudflare session doğrulayıcısı bulunmadığı için `registerPdksSyncRoutes` güvenli authorizer bağlanana kadar `main.ts` içinde aktive edilmedi.
- `0003_pdks_sync.sql` additive migrationı yalnız hazırlandı; remote D1’e uygulanmadı.
- Puantaj yeniden hesaplama/dönem kapatma, vardiya masterı ve organizasyon tanımı CRUD’u için kesin mevcut Firebird iş kuralları doğrulanmalıdır.
- Canlı Firebird rollback smoke testi bu ortamda `KY_PDKS_DB_PASSWORD` bulunmadığından çalıştırılmadı.
