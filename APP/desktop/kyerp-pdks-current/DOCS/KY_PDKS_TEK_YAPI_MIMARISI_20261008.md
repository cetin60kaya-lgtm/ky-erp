# KY PDKS — Tek Mimari / Tek Menü / Tek Ekran Yöneticisi
Tarih: 08.10.2026 — **CANLI ÜRETİM DEĞİL, İZOLE GELİŞTİRME KANITI**

## Neden yeniden yapılandırıldı?
R5 görsel incelemede canlı UI menü geçişleri 8 saniyeye kadar ulaştı; hızlı testler bunu yakalayamadı. Önizleme her menü tıklamasında ayrı `PdksVisualPreviewWorkspace` Form oluşturup host'a ekliyor ve öncekini söküyordu. Ekran oluşturma, WinForms handle/re-layout ve host ömür döngüsü sık sık tekrarlanıyordu. Pencere bir süre sonra kapanmış olsa da Windows Application günlüğünde R6 için crash yok; R6 kapanış izi `window-closed`/`session-end`. Bu iki sorun birbirine karıştırılmamalı.

## Tekillik ilkeleri

1. **Tek menü kataloğu:** `PdksCommandCatalog` modül/izin/başlık yetkili kaynaktır. `PdksNavigationDesign` mevcut komutları çalışma iş akışına göre gruplar. Placeholder yetkisiz yeni ürün özelliği sunulmaz.
2. **Tek navigasyon giriş noktası:** `MainShellForm.NavigateToCommand(id)` → `NavigateWithTransition(id)` → `ExecuteCommand(id)`. Ana sol menü, hızlı kısayollar, klavye, üst arama, yönetim kartları ve geri navigasyonu aynı kapıdan geçer. İç dispatch bu sınırın altında kalır.
3. **Tek pencere ve çalışma alanı:** `MainShellForm` tek ana pencere, `WorkspaceDockHost` tek host. Görsel inceleme için tek uzun ömürlü `PdksVisualPreviewWorkspace`; eski her tıklamada yeni Form oluşturma kaldırıldı.
4. **Sınırlı ekran önbelleği:** Görsel çalışma alanında aktif menüye göre toplam en fazla **5** iç görünüm; LRU ile eskisi dispose edilir. Personel/Ekran bileşenleri yalnız gerektiğinde oluşturulur. Ana ekran→diğer ekran geçişi aynı nesneyi korur.
5. **Tek hata/performans kanıtı:** `PdksPreviewDiagnostics` menu-start/menu-ok süreleri, `workspace-draw`, process handle/memory kayıtları. `PdksUiResponsivenessMonitor` gerçek Windows mesaj döngüsünde 3 saniye duraklamayı `ui-stall` olarak yazar; yalnız `--visual-preview`.
6. **Veri güvenliği ve iş kuralları:** Görsel testte gerçek Firebird/FDB, normal yıllık TNF, fiziksel terminal RAW, bordro veya Cloud kullanılmaz. Gerçek kart saati icat edilmez. Admin yazması önizleme→sabit plan→idempotent uygula→FDB/TNF mutabakat→audit→geri alma denetimi dışında olmayacak.
7. **Ürün mimarisi sınırı:** Canlı veri erişimi, işlem düzeyi izin, FDB ve TNF ile D1 ACK sözleşmeleri ayrıca servis katmanına taşınmalı. **Bugün canlı modüller halen mevcut WinForms implementasyonlarını kullanır; yeni tek görsel şablon henüz canlı veriye bağlanmış bir üretim uygulaması değildir.** Tekillik bu revizyonda sunum/navigasyon katmanında sağlandı; tüm veri iş akışlarının tekilleştirilmesi sonraki zorunlu mühendislik kapısıdır.

## Doğrulama — DESEN izole test alanı

Dal: `refactor/pdks-unified-workspace-20261008`.

Dosya yolları:
- `D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02` — derleme, test ve tanılama kanıtları.
- `D:\KYERP\_TEMP\KY-PDKS-TEK-YAPI-R7\KYERP.PDKS.exe` — izole EXE; parametre `--visual-preview`.
- `%TEMP%\KYERP-PDKS-VISUAL-PREVIEW\logs\navigation.log` — gerçek menü ve canlı yanıt kanıtı.

R7 kabul kanıtları:
- `dotnet build KYERP.PDKS.sln -c Release -warnaserror`: **0**
- `tools/ContractTests`: **0**
- `tools/ShellSmokeTest`: **0**
- `tools/PreviewNavigationStress --visual-preview`: **0**; 228 geçiş, 15.786 saniye, en yüksek menü süresi 188 ms, handle artışı 27, bellek 83 MB.
- Test, tek Form nesnesinin Home→Personel'den sonra aynı kaldığını ve cache'in 5'i geçmediğini doğrular.
- Windows penceresi R7 yayımlandıktan 16 saniye sonra çalışır durumdaydı.
- OS fare ile 7 manuel koordinat tıklamasında işlem Windows'a yanıt verdi, hafıza yaklaşık 85–88 MB; navigasyon günlüğünde 14–151ms görülüyor. **Kaydırmalı sol menü nedeniyle koordinat tıklamalarının bazıları hedeflediği öğe yerine başka öğelere gitti. Bu testi semantik tüm-menü uçtan uca kabul olarak sayma.**
- Bu testler uygulamanın tüm gerçek terminal, Firebird, TNF, web senkronu veya bordro özelliklerini kanıtlamaz.

## Eksik bitiş kapıları — kapalı sayılmamalı

- İstenen yeni Personel/Devam/Puantaj/Bordro düzenlerini canlı Firebird verilere **salt okunur adaptör** ile bağlayıp kullanıcı teyidi al.
- Ayrı kopya DB üzerinde admin düzeltme, önizleme, kayıt, rollback ve duplicate-hata enjeksiyonunu gerçek transaction ile test et.
- Terminal↔FDB↔TNF↔D1 taşıma kuyruğunu tam kapsamlı cursor/idempotency/ACK ile uzlaştır; başarısız kayıt asla 'tamam' görünmesin.
- Bordro/izin/vardiya/dönem/rol/kilitli dönem/KVKK ve PDF imza çıktısı kabulü.
- Native GUI klavye/fare/işletim sistemi ekran DPI, 1366×768 / 1920×1080, 15–30 dakika oturum, donma ve memory snapshot regresyonu.
- Web/Android/iOS real API entegrasyonu, offline yazma güvenliği ve canlı kaynaklar ayrıca doğrulanmalı.
- Mevcut kuruluma/deploy'a geçilmeden önce yedek, rollback, dosya SHA ve açık yayın onayı.

**Not:** Bu çalışma R5 üstüne yamalı menü değil: R5 ekran başına Form yaklaşımı kaldırıldı ve tüm UI giriş noktaları tek route'a getirildi. Üretim veri ve gerçek işlem katmanının tamamen yeniden yazıldığı iddia edilmez.
