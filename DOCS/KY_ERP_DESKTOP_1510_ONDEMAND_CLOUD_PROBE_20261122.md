# KY ERP Masaüstü 1.5.10 — Google Drive klasör erişimi tek yerel on-demand işlem

Tarih: 22.11.2026. PR #640. Bu kayıt yalnız kanıtlanan düzeltmeleri içerir, yayına alınmış sayılmaz.

## Kök neden
- X bilgisayarındaki WPF/WebView2 ana süreçte Windows RedirectionGuard etkin. Mevcut Google Drive junction yolu, bu ana süreç ve onun doğrudan oluşturduğu Node çocuk işlemi tarafından okunamıyor.
- RedirectionGuard etkin süreç ve korumayı devralan Node ile aynı salt-okunur kontrol FAIL; aynı Windows kullanıcısında normal işlem ile PASS.
- Önceki 1.5.6–1.5.9 sürümlerindeki klasör seçici, Unicode, doğrudan Node ve keşif güncellemeleri bu çekirdek sorunu çözmedi.

## 1.5.10
- Windows kullanıcı profili altında *yalnız isteğe bağlı* çalışan, görev zamanlayıcısıyla başlayan, sınırlı/etkileşimli kullanıcı yetkili (LUA) yerel doğrulama işlemi. Yönetici yetkisi, sürekli servis, açılış tetikleyicisi veya tekrarlayan görev yok.
- Program Files içindeki kurulu node.exe ve yalnız `discover/inspect` kabul eden `archive-root-task.mjs` / `archive-root-probe.mjs` kullanılır. Uygulama ile görev arasında yalnız kullanıcının LocalAppData klasöründe tek kullanımlık kimlik doğrulamalı UTF-8 JSON istek/yanıt dosyası bulunur. İstek tamamlanınca silinir.
- Bir kullanıcı isteğine başka isteğin yanıtı uygulanamaz. İşlemler seri, süre sınırı var, geniş disk taraması/yazma/yeniden adlandırma yok. WPF RedirectionGuard politikası korunur.
- Firma adayları yalnız gerçek mevcut bulut arşivinden seçilir; firma + gerçek yol + 0 yeni klasör kullanıcıya açık onayla gösterilmeden `FILE_HUB READ_ONLY` izni kaydedilmez.
- İşNet 8791, PDKS servisi, D1, Cloudflare ve mevcut arşivler değişmez.

## Test kanıtı
- X Windows, RedirectionGuard açık PowerShell üzerinden Task Scheduler COM görev kayıt ve çağırma QA: PASS. Her QA görevi kaldırıldı.
- X Windows, görev zamanlayıcıdaki özel Node broker ile UTF-8 gerçek mevcut firma arşivi: PASS, 6 işaret; yeni dosya/klasör 0, yanıt kimliği aynı; test görev/istek dosyaları temizlendi.
- X mevcut dalda .NET xUnit **33/33 PASS**, WPF Desktop build **0 hata/uyarı** (son küçük keşif turu iyileştirmesinden önce). Son QA build ve Windows GUI kabul ayrıca yapılacak.

## Son gerçek kabul kapıları
- [ ] 1.5.10 QA WPF GUI: otomatik arşiv → gerçek kullanıcı önizleme, yeni klasör 0.
- [ ] Final Setup, gerçek SHA256, X ProductVersion 1.5.10 kurulum.
- [ ] Kullanıcının açık onayından sonra tek `FILE_HUB/READ_ONLY` grant, duplicate koruması.
- [ ] İşNet 8791, PDKS ve muhasebe/XML-PDF, ortak D1 indeks/delta canlı kabul.

**Tekrarlanan sürüm kurulumlarını durdurma kuralı:** QA GUI gerçek önizleme kanıtı olmadan 1.5.10 kurulumunu kullanıcıya uygulama.

## 22.11.2026 — Gerçek X kullanıcı izni ve son QA ekran kabulü

- X kullanıcı gerçek onayı ile tam bir `FILE_HUB / READ_ONLY` grant oluşturuldu: firma `mecit-hakan`, mevcut Hakan Emp arşivi; yerel Windows kayıt sayısı **1**, yol hâlâ mevcut, mükerrer yok. Bu grant *gerçek kullanıcı izni*dir; OAuth/D1 eşleşmesi değildir.
- İlk QA 1.5.10 kullanıcı arayüzü, geçmiş timeout satırını gösterebildi. Düzeltme: onaylı grant açılışta görünür, aynı kök için tekrar onay istenmez, arşiv işlemleri seri çalışır. **X GUI yeniden kabul:** `Onaylı firma arşivi kayıtlı`; `1 açık klasör izni`; kayıtlı tam yol alanı dolu; otomatik bulmaya tekrar basıldığında ikinci onay yok. QA commit `36ec05a86e854e8d846f3194b21d3d7d3aa4fc7a`.
- Final kaynak üzerinde **33/33 .NET PASS**, WPF test derlemesi PASS, QA GUI gerçek ekran PASS. Paket: `KY-ERP-Masaustu-Setup-1.5.10.exe`, **93.283.114 byte**, SHA256 `DF2AD0353B31D0295C1E686A94059A45994C5614F0419E03A787F138601AD97B`. Önceki 1.5.9 kurulum dosyası yedeklendi.
- **Kurulum açık:** X'te 1.5.10 Setup başlatıldı, Windows UAC onayı bekliyor; son kontrolde Program Files kurulu EXE sürümü 1.5.9. Kullanıcı izin onayı ve kurulum tamamlanmadan 1.5.10 kuruldu denmez.
- **Sonraki kabul:** Setup bittiğinde kurulu EXE 1.5.10, gerçek ekran salt-okunur kayıt sürüyor, tekil grant; ardından İşNet 8791 portal oturumu, D1 ortak indeks/delta ve XML+PDF Belge Havuzu ayrı uçtan uca test. Bunları bu kayıt PASS saymaz.
