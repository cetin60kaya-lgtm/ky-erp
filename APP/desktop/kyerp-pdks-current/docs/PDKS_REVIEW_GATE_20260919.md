# KYERP PDKS — Review Gate 2026-09-19

Bu not ChatGPT kod denetimi sonrası kalan işleri netleştirir. Ürün referansı KYERP'dir; Hedef yalnız işlev/veri davranışı referansıdır.

## Doğrulanan paketler

- `bb0731fd`: strict KYERP TNF v1, terminal transfer profilleri, file/TNF adapter, transaction tabanlı GIRCIK import.
- `4a15db1e`: puantaj/bordro hesap çekirdeği, günlük operasyon, PDF/XLSX çıktı.
- `62539f29`: tenant/company/workplace scoped sync contract, desktop push/pull, outbox retry/backoff, additive `0003_pdks_sync.sql`.
- `fdcc8872`: atomik maaş/mesai ödeme kaydı, runtime yapılandırma ve kalan teknik borç dokümantasyonu.

## Zorunlu sonraki işler

1. **Terminal profil UI düzeltmesi**
   - Mevcut raw JSON editörü son kullanıcı için ana düzenleme arayüzü olarak bırakılmayacak.
   - KYERP tasarımında alan bazlı form kullanılacak: format tipi, separator, encoding, başlangıç/uzunluk kolonları, tarih/saat formatı, giriş/çıkış kod eşlemeleri, program yolu, aktarım dosyası yolu, tenant/company/workplace/device.
   - JSON import/export gelişmiş seçenek olarak kalabilir.
   - Örnek satır parse önizleme korunacak.
   - Canonical `KYERP TNF v1` preset korunmalı ve doğrudan değiştirilememeli.

2. **Firebird iş kuralı doğrulama**
   - Organizasyon tanımları CRUD, dönem oluşturma/kapatma ve vardiya masterı için mevcut tablo/kolonları SchemaDump ve mevcut KYERP kaynaklarından doğrula.
   - Hedef.exe reverse engineering yapma.
   - Kesin veri davranışı bulunamazsa destructive tahmin yapma; yalnız doğrulanabilen güvenli işlemleri kodla ve kalan belirsizliği açık bırak.

3. **Worker session authorizer bağlantısı**
   - `pdks-sync.ts` route'larını mevcut canlı KYERP auth/session modeline bağlamadan aktif etme.
   - Önce aktif frontend/backend/worker auth akışını kaynak koddan belirle.
   - Yeni bağımsız auth sistemi icat etme.
   - Tenant/company/workplace scope ve `PDKS_SYNC` yetki kontrolünü mevcut kullanıcı/session bağlamından üret.
   - Typecheck/test/dry-run olmadan route register etme.

4. **Migration/deploy güvenliği**
   - `0003_pdks_sync.sql` additive kalmalı.
   - Remote D1 migration ve canlı deploy bu branch kod incelemesi bitmeden çalıştırılmayacak.
   - Main'e merge yapılmayacak.

5. **Canlı Firebird smoke**
   - Secret Git'e yazılmayacak.
   - DB bağlantısı sağlandığında yazma testleri transaction + rollback ile yapılacak.
   - Personel, giriş/çıkış, izin, ödeme, terminal import için kalıcı test verisi bırakılmayacak.

## Kabul kapısı

Sonraki push'ta en az şunlar beklenir:
- Terminal profil düzenleyicisinin alan bazlı KYERP UI olması.
- Organizasyon/dönem/vardiya tarafında doğrulanabilen eksiklerin kapanması veya neden kapanamadığının somut şema kanıtıyla belgelenmesi.
- Canonical auth entegrasyonu güvenle çözülebiliyorsa sync route'larının bağlanması; çözülemiyorsa bağımsız auth uydurulmaması.
- Desktop build 0 hata/uyarı, contract testler başarılı, Worker typecheck/test/dry-run başarılı.
