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
