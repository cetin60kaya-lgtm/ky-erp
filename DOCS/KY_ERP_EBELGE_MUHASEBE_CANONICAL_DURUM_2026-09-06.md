# KY ERP — e-Belge / Muhasebe Canonical Durum Kaydı

Tarih: 06.09.2026
Branch: `codex/e-belge-isnet-canonical-final-20260906`
PR: #77 — `e-Belge / Muhasebe canonical finalizasyonu`

## Tamamlanan ana yapı

- İşNet provider verisi canonical `accounting_documents` havuzuna alınır.
- Manuel XML/PDF/JPG/JPEG/PNG/WEBP/BMP/TIF/TIFF belgeleri aynı canonical havuza alınır.
- UBL-TR parser, Azure Document Intelligence OCR, AUTO fatura/irsaliye sınıflandırması ve düşük güvenli ikinci-model karşılaştırması vardır.
- Firma/VKN/alias ve firma-sınırlı ürün alias sistemi vardır.
- Kalem routing: `EXPENSE`, `STOCK`, `BOYAHANE`.
- Kimya/Boyahane ürünlerinde ürün ve LOT kuralları uygulanır.
- Stok/LOT ve muhasebe postları aynı belge için idempotenttir.
- Cari, KDV ve ledger canonical belge üzerinden post edilir.
- Canonical Muhasebe rapor read-modeli vardır; legacy belge ile dedupe/fallback desteklenir.
- Gider kategori hafızası firma/ürün/açıklama kurallarıyla desteklenir.
- File Hub arşiv kuyruğu Yerel/NAS Agent ve Google Drive/OneDrive/SharePoint `CLOUD_API` hedeflerini destekler.
- Google/Microsoft OAuth tokenları şifreli tutulur; klasör oluşturma ve gerçek dosya upload akışı vardır.
- Tedarikçi fatura ekranının upload, kalem/LOT güncelleme ve finalize yazma akışı `/e-belge` canonical endpointlerine taşınmıştır.
- Tedarikçi gelen irsaliye görünümü artık İşNet'e özel değildir; `INCOMING_DISPATCH` canonical e-Belge havuzunu okur.

## D1 migration

Bu paket `0046_accounting_canonical_report_controls.sql` migrationını içerir:

- `accounting_report_categories`
- `accounting_report_overrides`
- `accounting_expense_rules`

Migration additive-only tasarlanmıştır. Production'a uygulanması Git merge işleminin parçası değildir.

`.github/workflows/d1-schema-readiness.yml` içine 0046 için:

- dosya ve tablo sözleşmesi kontrolü,
- yıkıcı SQL engeli,
- izole local D1 uygulama kontrolü

eklenmiştir.

Production öncesi tam D1 export yedeği ve hedefli migration readiness zorunludur.

## Bilinçli olarak korunan legacy uyumluluk

Eski `documents` / `invoice_items` yolları henüz tamamen silinmemiştir. Amaç eski tarihsel kayıtları kaybetmemek ve geçiş süresinde read fallback sağlamaktır.

Canonical-first read katmanı:

- canonical kayıtları önce okur,
- legacy kayıtları yalnız eksik tarihsel kayıtlar için ekler,
- aynı belgeyi dedupe eder.

`/muhasebe/belge-havuzu` edit sözleşmesi şimdilik uyumluluk katmanı olarak korunur; üst bilgi, kalem ve onay ekranları yeni `/e-belge` sözleşmesinde tam karşılık bulmadan kaldırılmayacaktır.

Eski `/muhasebe/belge-import/*` write endpointleri backend compatibility için durabilir; güncel tedarikçi operasyon ekranı bunları ana yazma yolu olarak kullanmamalıdır.

## Kalan gerçek işler

1. Legacy read/write kullanım envanteri çıkarılıp yalnız tarihsel uyumluluk gerektiren endpointler bırakılacak.
2. `buildDispatchControl` gibi yalnız legacy `documents` okuyan kalan rapor/kontrol noktaları canonical-first read modeline taşınacak.
3. `/muhasebe/belge-havuzu` geniş edit fonksiyonları `/e-belge` canonical API sözleşmesine eksiksiz taşındıktan sonra eski sözleşme kapatılacak.
4. Production branch ile feature branch son kez senkron/çakışma kontrolünden geçirilecek.
5. `0046` production D1 migrationı ancak tam backup + readiness + kullanıcı açık production onayı ile uygulanacak.
6. Production deploy sonrası e-Belge, Muhasebe raporları, gider kuralları, Boyahane LOT/stok ve File Hub arşiv live smoke yapılacak.

## GitHub Actions durumu

06.09.2026 tarihinde bazı son PR workflow jobları `runner_id=0`, `steps=[]` durumuyla birkaç saniyede `failure` olmuştur. Aynı job rerun edildiğinde de runner başlamadan aynı şekilde düşmüştür. Bu nedenle bu olay normal test assertion/build failure olarak sınıflandırılmamalıdır; GitHub Actions çalıştırma/billing/runner altyapısı ayrıca kontrol edilmelidir.

Önceki çalışan koşularda Worker unit test, typecheck, dry-run build, izole D1, Muhasebe/LOT/stok smoke, frontend lint ve production build başarıyla çalışmıştır.

## Yayın sınırı

Bu kayıt production deploy değildir.

Kullanıcı açıkça `canlıya al` demeden:

- production branch merge edilmez,
- D1 migration uygulanmaz,
- Cloudflare production deployment başlatılmaz,
- resmî e-Fatura/e-İrsaliye gönderimi yapılmaz.
