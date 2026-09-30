# KY ERP Canlı Senkron Yol Haritası — 2026-09-30

## Tamamlanan ilk aşama: Günlük Operasyon

Günlük Operasyon çoklu tarayıcı / çoklu bilgisayar kullanımında ortak merkezi veriyi otomatik yenileyecek şekilde canlıya alınmıştır.

Kurallar:
- Aynı firma bağlamındaki açık Günlük Operasyon ekranları yaklaşık 1.5 saniyelik düşük maliyetli sürüm kontrolü yapar.
- Bir istemci kayıt yaptığında diğer açık istemciler F5 gerektirmeden ilgili veriyi force-fresh yeniden okur.
- Kullanıcının kaydedilmemiş yerel değişikliği varsa uzaktaki değişiklik ekranın üstüne yazılmaz; yerel kayıt tamamlandıktan sonra senkron devam eder.
- Günlük Operasyon GET verileri genel 60 saniyelik istemci cache'ine bağlı değildir; bu modülde güncel veri okunur.
- Personel + tarih + vardiya bazında `Seçildi` çalışma kaydı merkezi D1 kaydıdır.
- Personel + tarih + vardiya bazında `Kontrol Edildi` durumu `hr_daily_attendance_check` tablosunda merkezi D1 kaydıdır.
- `Seçildi` kaldırılırsa ilgili vardiyanın `Kontrol Edildi` durumu da kaldırılır.
- Mevcut optimistic concurrency / `expectedUpdatedAt` koruması korunur; iki istemcinin aynı eski sürümü sessizce ezmesi engellenir.
- Senkron durum kontrolü tablo taraması yapmaz; firma başına `hr_daily_sync_state` tek satır sürüm kaydı kullanılır. İlgili günlük operasyon yazımları trigger ile bu sürümü değiştirir.

Production kaynak commit'i:
`720f96ad308cc463cefa70ff5e0fc38001ced2af` — `fix(daily): persist review state and sync browsers live`

## Sıradaki rollout

1. **Muhasebe / e-Belge**
   - Aynı tenant/firma için belge, cari, ödeme, durum ve rapor değişikliklerini açık ekranlara otomatik yansıt.
   - Mevcut `enforceAccountingTenant` ve Muhasebe izin modelini koru.
   - Kaydedilmemiş form verisini uzaktan gelen değişiklikle ezme.

2. **PDKS / İK**
   - Kart okuma, giriş-çıkış, günlük/aylık durum ve ilgili personel değişikliklerini otomatik yansıt.
   - PDKS cihaz/masaüstü kayıtları ile web ekranının aynı merkezi kayıt sürümünü izlemesini sağla.
   - Kullanıcı/rol ve firma kapsamı korunacak.

3. **Diğer aktif ERP modülleri**
   - İmalat
   - Boyahane
   - Desen
   - Firma/Cari ve diğer ortak operasyon ekranları
   - İhtiyaç sırasına göre aynı ortak KY Sync sözleşmesine geçirilecek.

## Ortak hedef mimari

Günlük Operasyon ile doğrulanan desen, modül bazlı kopyalanmış bağımsız polling kodları haline getirilmemeli. Sonraki aşamada ortak `KY Sync` istemci sözleşmesi ve modül/tenant bazlı sürüm anahtarı çıkarılacak. Her modül yalnız kendi ilgili sürümünü izleyecek ve yalnız değişiklik olduğunda gerçek veriyi yeniden okuyacak.
