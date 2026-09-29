# KY ERP Muhasebe Canlı Final — 2026-09-11

Kapsam yalnız Muhasebe + e-Belge + İşNet belge akışıdır. Güvenlik modülünde değişiklik yapılmadı.

## Tamamlanan düzen
- Muhasebe tedarikçi ekranına canonical XML / PDF / JPG / PNG / WEBP / BMP / TIF / TIFF yükleme eklendi.
- PDF belgeler tarayıcıda ilk iki sayfadan OCR önizlemesine çevrilir; orijinal PDF belge kaynağı olarak korunur.
- Azure Document Intelligence tanımlıysa mevcut Azure akışı kullanılır; tanımlı değilse Cloudflare Workers AI Moondream 3.1 vision fallback devreye girer.
- OCR sonucu canonical fatura/irsaliye yapısına çevrilir ve belirsiz alanlar manuel kontrol akışında tutulur.
- Firma, ürün, gider/stok/Boyahane yönlendirmesi, ürün bazlı LOT zorunluluğu ve fatura–irsaliye uzlaştırması canonical akışta korunur.
- İşNet sağlayıcılardan yalnız biridir; İşNet ve manuel yüklemeler aynı canonical e-Belge havuzuna düşer.

## Son doğrulama
- Muhasebe/e-Belge/İşNet hedef backend testleri: 60/60 geçti.
- Backend TypeScript kontrolü: geçti.
- Worker Cloudflare dry-run build: geçti; DB, R2 ve AI binding görüldü.
- Muhasebe frontend contract testleri: geçti.
- Frontend production build: geçti; PDF.js worker bundle üretildi.
- `git diff --check`: temiz.

## Canlıya alma
Bu kayıtla birlikte değişiklikler `codex/muhasebe-final-live-20260911` dalından production dalı `codex/model-uretim-kontrol-merkezi-final` için PR/merge ve Cloudflare Git Integration yayınına alınacaktır.
