# KY ERP — DESEN tek merkez menü, dosya ve teknik işleyiş revizyonu
**Tarih:** 04.11.2026 · **Kaynak:** `codex/model-uretim-kontrol-merkezi-final` tabanlı `refactor/desen-tek-merkez-20261104`

## 1. Doğrulanmış mevcut veri / korunacak kayıtlar
- 03.11.2026 tarihli 2026 aktarım kabulüne göre canlı D1: 723 model ve 723 workflow ana kayıt. 346 önceki model, 377 görseli eksik yeni model.
- 1.551 adet 2026 imalat kaydı ve model bağlantıları önceki aktarımda doğrulanmıştı. Bu revizyon D1 canlı iş kaydı, production_records, SQL şeması, Google Drive asıl klasörleri veya fiziksel PSD/AI dosyalarını değiştirmez.
- Gelen R2 kuyruğunun 0 olması Google Drive'da 0 dosya bulunduğu anlamına gelmez. `desen-workflow.ts::scanInbox` yalnız `desen/inbox/<slug>/` R2 prefix'ini tarar.
- Model ana otoritesi canonical model UUID; baskı bölgeleri, kanallar, yerleşim ve renk ilişkileri onun alt operasyonlarıdır. Boyahane/İmalat farklı model kimliği türetmez.

## 2. Tek görünür Desen menüsü
1. **Gelen Desenler:** R2 gelen dosyası yükleme, manuel gelen taraması, hazır/eksik/mükerrer durum ve File Hub bağlantı ayrıntısı. Yönetim rolündeki kullanıcı için mevcut Bağlantılar/Senkronizasyon ekranına kısayol.
2. **Desen Havuzu:** Model kartı ve listesi; arama sürekli açık, ayrıntılı filtre isteğe bağlı. Model bilgisi, baskı bölgesi, kanal/renk, dosyalar ve son kontrol mevcut tek düzenleme modalında. Mevcut tekil modelin eksik görseli doğrudan o modele R2 **önizleme** olarak yüklenebilir; ana PSD/AI arşivi providerda kalır.
3. **Yerleşim / Kalıp:** Baskı bölgesi bazında teknik kuyruk. Kalıp tipi ve boyutlar olmadan, yerleşim görseli/PDF ilişkilendirilmeden `READY` kaydedilmez; dosya yüklendi diye otomatik `READY` atanmaz. Yüklenen dosya ID'si ilgili operasyonun `placementFileId` alanına taşınır. Üretime hazır işte kanal listesi kontrol edilir.
4. **Kontrol & Rapor:** Mevcut kanal, kalıp, renk ve teknik hazır olma raporu, CSV çıktı. PDF veya XLSX olarak etiketlenmez.

Bu 4 ana ekran dışında, işlevi onaylanmamış yeni "Giden Desenler", "DTF", "Kanal" veya "Bulut Yönetimi" boş sekmesi oluşturulmaz. Bu işlevler doğru veri kontratıyla hazır olduğunda mevcut model bağlamına entegre edilir.

## 3. Kaynak ve güvenlik sözleşmesi
- File Hub `MODEL_IMAGE`, `MODEL_SOURCE`, `PLACEMENT`, `OUTGOING_DESIGN` purpose bağlarını korur; Google Drive `Hakan Emp/görsel/2026`, `Hakan Emp/modeller` önceki bağlarını bozmadan kullanır.
- R2 gelen kuyruğunda tarama browser 30 saniyelik gizli periyodik POST yerine kullanıcı başlatmasıdır. File Hub Google Drive indeks/senkronu bu ayrı kuyruğun yerine geçmez.
- Özel görsel `/api/.../preview` URL'si düz `<img>` ile auth header kaybına uğramasın diye tek `DesenImage` bileşeni `apiFetch` + Blob object URL kullanır. Bearer token URL'ye veya DOM'a eklenmez; object URL temizlenir. Görsel yok, yükleniyor ve hatalı durumları ayırt edilir.
- Asıl PSD/AI/PDF dosyalarını veya diğer firmalara ait kayıtları taşıma, silme, kamusallaştırma, kopyalama yok. Model kapatılması/aktarım, onay ve mevcut erişim kontrolleri korunur.

## 4. Tam kabul için bekleyen gerçek kontroller
- Cloudflare Pages frontend için lint/test/build, Worker typecheck/test/dry-run, ilgili Desen kontrat testleri: **bu revizyon dalında henüz çalıştırılmış/test sonucu alınmış değildir**.
- Görsel için gerçek yetkili kullanıcı oturumunda `MODEL_IMAGE` (JPEG), File Hub kaynaklı önizleme, boş 377 model, PDF/PSD için önizleme yok/error ve 403/404 durumları.
- Google Drive 2026 model görsellerinin File Hub indeks eşleştirmesi; 723 model sayısı ve sıfır mükerrer, `placementFileId` kalıcı geri okuma, Boyahane/İmalat hedefi.
- Masaüstü 1600x900 / 1366x768, tablet ve Android dokunmatik dört ekran; teknik modal kapanmadan kaydetme/geri açma.
- Production branch'e merge, Cloudflare yayın SHA, canlı gerçek tarayıcı smoke: **ayrı sonuç kanıtı gelene kadar canlı/tamam kabul edilmez.**

## 5. Kapsam dışı açık işler
- Orijinal Drive 2026 görsellerini canlı toplu eşleştirme ve PSD/AI/PDF preview dönüşümü (daha önce açık kaldığı 03.11.2026 kabulünde kayıtlı).
- R2 gelen kuyruğuyla File Hub indeksinin ortak tek işlem akışı halinde backendde bütünleştirilmesi; mevcut iki source path bu revizyonda silinmez.
- `listWorkflowModels` içindeki tarihi kayıt uyumlandırma yazımının read GET yolundan ayrıştırılması daha ileri API tasarımı/test gerektirir; bu sürümde değişmedi.
- "Giden Desenler / otomatik gönderim" henüz canlı kabul edilmediyse menüye sahte bir ekran olarak eklenmez.
