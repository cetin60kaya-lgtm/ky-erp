# İşNet resmî fatura kapanış migration planı

Migration öncesi tutarlı SQLite online yedeği:

`BACKUPS/pre-migration/KYERP-online-before-official-invoice-closure-20260721-140026.db`

SHA-256: `B13AC71EE7C5EA26430D345E2F7770EB4814582D2446D24EE415EFF454534FE6`

Doğrulama: `PRAGMA integrity_check` sonucu `ok`.

Geri dönüş gerektiğinde uygulama ve backend durdurulur; mevcut `DATA/KYERP.db` ayrıca korunur ve yukarıdaki online yedek aynı konuma kopyalanır. Migration yalnız yeni nullable sütunlar, indeksler ve `isnet_invoice_line_allocations` tablosu eklediği için eski uygulama verilerini silmez.
