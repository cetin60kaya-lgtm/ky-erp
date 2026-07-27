# Yedek ve geri dönüş planı

Bu migration production veritabanına otomatik uygulanmaz. Uygulamadan önce backend durdurulmalı ve `DATABASE_URL` ile gösterilen SQLite dosyasının tarih-saat ekli fiziksel kopyası alınmalıdır.

Kontrol sırası:

1. Backend ve belge senkronizasyon işlemlerini durdurun.
2. SQLite dosyasını aynı diskteki yedek klasörüne kopyalayın; kopyanın boyutunu ve SHA-256 özetini doğrulayın.
3. `npx prisma migrate deploy` çalıştırın.
4. `PRAGMA table_info('document_intake_lines');` sonucunda `model_id` alanını, `PRAGMA index_list('document_intake_lines');` sonucunda `document_intake_lines_model_id_idx` indeksini doğrulayın.
5. Backend build ve İşNet kabul testlerini çalıştırmadan servisi kullanıcıya açmayın.

Geri dönüş gerektiğinde backend kapalıyken migration öncesi alınan SQLite dosyasını geri yükleyin ve SHA-256 özetini yeniden doğrulayın. Bu migration mevcut satırları silmez; yalnız nullable `model_id` alanı ve indeks ekler.
