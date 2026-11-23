# KY ERP Muhasebe — tek kaynak ilişkiler ve belge/cari görünümü (23 Kasım 2026)

## Gözlemlenen sorunlar

- Kısa `TAHA` mükerrer kartının birleştirme/Hard Sil ön kontrolü önce `COMPANY_SCAN_METADATA_FAILED`, sonra `COMPANY_SCAN_SCHEMA_BATCH_FAILED` hatası veriyordu.
- Kodda metadata okuyucu önce korelasyonlu `pragma_table_info(m.name)`, sonra tüm tablolar üzerinde D1 `PRAGMA table_info` batch deniyordu. Canlı Worker bu yöntemleri reddetti; üç ayrı PR yayınından sonra bile gerçek işlem kabul edilmedi.
- Firma kartlarının cari bakiyesi `companies.current_balance` üzerinden okunduğu için henüz muhasebeleştirilmemiş e-Belge faturaları firma listesinde görünmüyordu. Bu, toplam faturaların sıfırlanması değil; iki bağımsız defterin doğru adlandırılmamasıdır.
- Eski ekran: 14 firma, ₺50.000 toplam cari alacak, ₺0 toplam borç; ana TAHA'da ₺50.000 saklanan bakiye, 28.09 tarihli bir işlem satırında −₺50.000 bakiye. Bu farkın gerçek muhasebe kaynağı canlı veriden doğrulanmadı.
- `HKN2026000000994` e-Belge Giden Faturalar ekranında mevcut ve inceleme bekliyor. Faturaya cari hareketi üretmek için otomatik onay/POST yapılmadı.

## Tek kaynak refaktörü

1. `accounting-company-link-scan.ts`: tek, salt-okunur `sqlite_master(name, sql)` kaynağı. Bütün tablo sütunları CREATE TABLE DDL ayrıştırılarak öğrenilir, D1 üzerinde PRAGMA veya metadata batch kullanılmaz. Ardından yalnız şemada firma kimliği bulunan tablolar tenant ve silinme kapsamı korunarak denetlenir. Finansal ve üretim ilişkisi varsa operasyon engellenir. Şema okunamazsa veya ilişki sorgusu hata verirse **fail-closed**; 'bağlantı yok' varsayılmaz.
2. `accounting-company-safe-delete.ts`: yöneticinin mevcut ID/ad/sürüm/onay ve aliased-first transaction korumaları aynen kullanılır. Yeni alternatif hard-delete/merge endpoint oluşturulmaz.
3. `accounting-company-invoice-summary.ts`: gelen/giden `accounting_documents` faturalarını firma ID veya yalnız **tekil tam vergi numarası** ile bağlar, tür irsaliye ise fatura olarak saymaz, boş veya mükerrer VKN'yi hiçbir firmaya tahmin ederek atamaz. TRY brüt toplamları, posted/unposted adetlerini verir. Döviz toplamlarını TRY'ye eklemez. **Salt okunur, cari hareket oluşturmaz.**
4. `GET /api/muhasebe/firmalar` mevcut route'u korunur; her firmanın `invoiceTotals` ve `invoiceSummaryAvailable` bilgisi eklenir. Özet erişilemezse firma ve cari verileri açık kalır, hata görünür; sahte sıfır başarı gösterilmez.
5. `CompaniesCurrentWorkspace.jsx`: gerçek cari toplamı ve belge brüt toplamı ayrı kartlar; firma listesi ve seçili firma detayında ikisi ayrı gösterilir. Bu iki tutarı netleyerek bakiye oluşturmaz.

## Kabul ve veri güvenliği

- Kaynak firma ilişkileri gerçek canlı ön kontrolde eksiksiz doğrulanmadan ne birleştirme ne Hard Sil yapılır.
- Gerçek TAHA kartı / mevcut ₺50.000 alacak, hesap geçmişi, belge ve dosyalar değiştirilmez.
- Giren çıkan fatura toplamı cari borç/alacak değildir. Belge `POSTED` ve ledger ilişkisi kesinleşmeden borç/alacak yazılmaz.
- Ayrı tenant, sahte/mükerrer vergi numarası, döviz, silinmiş ve irsaliye kayıtları testlerle ayrılır.
- Kod/test/merge ve Cloudflare Worker + Pages yayın kanıtları ayrı tutulur. Son kullanıcı ekranında gerçek TAHA ön kontrol ve firma fatura toplamı kabulü ayrıca gerekir.
- Token/şifre, VKN/TCKN, canlı fatura PDF'si veya personel verileri GitHub'a taşınmaz.
