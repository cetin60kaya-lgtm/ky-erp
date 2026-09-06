# KY ERP — e-Belge / Muhasebe Canonical Durum
## 06.09.2026 canlı yayın paketi

**Branch:** `codex/e-belge-isnet-canonical-final-20260906`  
**PR:** #77  
**Production branch:** `codex/model-uretim-kontrol-merkezi-final`

## Canlı kapsam

- İşNet gelen/giden fatura ve irsaliye canonical e-Belge havuzuna yazılır.
- Manuel XML, PDF ve desteklenen görsel formatları aynı havuzdan işlenir.
- OCR/UBL kalemleri ürün, miktar, birim, fiyat, KDV ve mümkünse LOT seviyesinde ayrıştırılır.
- Firma aliasları tenant kapsamlıdır; ürün aliasları tedarikçi kapsamını aşmaz.
- Kalem yönlendirmesi EXPENSE / STOCK / BOYAHANE şeklindedir.
- Normal gider kaleminde ürün/LOT zorunlu değildir.
- Boyahane/kimya kaleminde ürün ve gerekli LOT kontrolü finalden önce yapılır.
- Stok/LOT ve canonical muhasebe posting retry/idempotency korumalıdır.
- Muhasebe rapor read-modeli canonical accounting kaynaklarını kullanır.
- File Hub arşiv kuyruğu Agent ve cloud hedeflerini destekler.
- Resmî e-Fatura/e-İrsaliye gönderimi kullanıcı onayı olmadan yapılmaz.

## D1 kararı

`0046_accounting_canonical_report_controls.sql` bu canlı yayında production D1'e uygulanmaz ve production merge ağacına dahil edilmez.

Sebep: bu oturumda remote production D1 full backup + kontrollü migration uygulayacak Cloudflare yönetim bağlantısı yoktur. Backup olmadan production schema write yapılmaz.

Kod bu üç tablo yokken tenant-scoped `json_store` fallback'ini kullanır:

- accounting_report_categories
- accounting_report_overrides
- accounting_expense_rules

0046 ayrı bakım penceresinde yalnız şu sıra ile ele alınır:

1. remote D1 full export backup,
2. readiness / partial-schema kontrolü,
3. additive 0046 migration,
4. schema doğrulaması,
5. canonical rapor + gider hafızası smoke.

## Yayın yolu

Normal production yayın GitHub Actions ile yapılmaz. Kullanıcı onayı sonrası production branch merge edilir; Cloudflare Git Integration Pages + Workers Builds'i otomatik yürütür. Pages + Worker + canlı smoke tamamlanmadan yayın tamam sayılmaz.
