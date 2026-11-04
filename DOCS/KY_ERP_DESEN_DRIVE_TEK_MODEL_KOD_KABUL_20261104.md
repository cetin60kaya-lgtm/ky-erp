# KY ERP — DESEN Drive tek model ve dosya erişimi
**Tarih:** 04.11.2026 · **Dal:** `feature/desen-filehub-one-model-20261104`

## Hedef
Google Drive **Hakan Emp** içindeki `görsel/2026`, `modeller`, `yerleşim dosyaları`, `giden desenler` ve `modeller/MODEL ADI DTF` arşivleri fiziksel olarak yerinde kalır. Canonical ERP model UUID tek otoritedir; PSD/PDF/DTF dosyaları aynı modele File Hub aracılığıyla bağlanır. Kaynak dosyalar silinmez, taşınmaz, otomatik yeniden adlandırılmaz.

## Bu dalda kodlanan işler
- `file-hub-cloud-model-binding.ts`: gerçek kaynak klasörüne göre DTF PDF ve gelen model kaynaklarının ayrımı; var olan model adları içinde token sınırı ve en uzun eşleşme; birden çok model içeren üretim PSD'sine aday çıkarma.
- `file-hub-cloud-oauth.ts`: mevcut `model_records` model adları için istek-bazlı önbellek; kaynak türüne göre mevcut modele File Hub ilişkisi; idempotent ilişki kontrolü; önceden indekslenmiş dosyaları küçük partilerle yeniden değerlendirme. Yeni PSD/DTF/PDF dosyaları tek başına model oluşturmaz. Belirsiz model/firma eşleşmelerinde otomatik bağlama yapılmaz.
- `file-hub-design-sync.ts`: aynı request içinde model JSON'larını tekrar tekrar yüklememe; birden fazla firmada aynı ada ait belirsiz eşleşmeyi kapama; DTF kaynak ve RIP PDF rollerini ayırma; kaynak dosya için güvenli preview URL ve saklama.
- `file-hub-preview.ts` ve bulut thumbnail motoru: Google sağlayıcısı küçük önizleme sağlarsa JPG yanında PSD/PSB/AI/PDF/TIF için yetkili R2 cache üretmeyi deneme. **Bu tam Photoshop render motoru değildir.** Sağlayıcı thumbnail desteklemezse PREVIEW_NOT_READY kalır; orijinal kaynağa dokunulmaz.
- `DesenWorkflowShared.jsx`, `desenWorkflow.css`: tek model kartı içinde RGB görsel, gelen/kaynak, yerleşim, giden PSD ve DTF dosyaları; yetkili PDF görüntüleme/orijinal indirme; dokunmatik ekran düzeni.
- `file-hub-cloud-model-binding.contract.test.ts`: ASPEL, OSKERO, EBONUR DTF ve çoklu model PSD karşılıkları için regresyon testi.

## Korumalar ve operasyon sınırı
- **Bu commit/PR bir veri göçü değildir.** D1 production verilerine, Google Drive dosyalarına, OAuth hesaplarına, canlı kullanıcıların model kartlarına ve Cloudflare secret'larına doğrudan yazma yoktur.
- Yeni Google Drive klasörü açılmaz; eski klasörler bölünmez, kopyalanmaz.
- Önceden yanlış veya belirsiz ilişkilendirilmiş bir belge kendiliğinden silinmez. Denetim/inceleme gerektirir.
- `MODEL_IMAGE` için önceden uygulanan gerçek JPEG'den yeni model açma akışı korunur; PSD/DTF veya yerleşim PDF bunu yapamaz.
- Gerçek PSD flatten 508 dpi, katman/spot koruyan Photoshop önizleme otomasyonu ayrı Windows/UXP bileşenidir ve bu değişiklikte **tam kabul değildir**.
- Bulut dosyası indirme rotasındaki firma sahibi erişim sınırı korunur; diğer kullanıcılar için 403 normaldir.
- Tamlık için yetkili ERP oturumunda 723 model ve 1.551 imalat ilişkisinin sayımı; Drive taramasının `COMPLETED`, `pendingFolders=0`, doğru dosya eşleşmeleri ve telefon önizlemesi ayrıca ölçülmelidir.

## Test ve yayın kapısı
- Frontend lint/test/build ve Worker typecheck/test/build; yeni sözlük testlerinin geçmesi.
- Production branch'e PR merge ve Cloudflare Pages+Worker aynı SHA yayın sonucu; erişim/sağlık kontrolleri.
- Yetkili canlı kullanıcı oturumu dosya açma/indir ve Google Drive asıl eşleştirme için saha kabulü gereklidir; CI tek başına bu kontrolleri kanıtlamaz.
