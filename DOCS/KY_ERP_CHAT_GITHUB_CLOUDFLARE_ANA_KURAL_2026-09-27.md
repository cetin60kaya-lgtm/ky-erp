# KY ERP — Chat → GitHub → Cloudflare Ana Çalışma ve Canlı Yayın Kuralı

Tarih: 2026-09-27
Durum: CANONICAL
Kapsam: KY ERP monorepo içindeki tüm web, frontend, Worker/API, güvenlik PWA ve repo tabanlı alt projeler.

## 1. Ana amaç

KY ERP kod işleri için varsayılan çalışma yolu Remote Desktop değildir. Normal yol:

`ChatGPT / AI ajanı → GitHub canonical kaynak → test/PR kapısı → Cloudflare Git Integration → canlı smoke`

Remote Desktop yalnız yerel makineye özgü işler için kullanılır: Windows ayarı, Photoshop/Illustrator, masaüstü PDKS uygulaması, yerel cihaz/klasör/donanım, GitHub'da olmayan binary dosya veya zorunlu yerel test.

## 2. Kullanıcı niyeti nasıl yorumlanır

Aşağıdaki kural KY ERP için sürekli ön yetki kabul edilir:

- Kullanıcı `yap`, `düzelt`, `bitir`, `uygula`, `hallet`, `toparla` gibi uygulama isteyen bir komut verdiyse ve ayrıca durdurucu bir ifade kullanmadıysa ajan işi uçtan uca tamamlar: inceleme → değişiklik → test → GitHub commit/PR → gerekiyorsa merge → Cloudflare yayın → canlı doğrulama.
- Normal repo/kod işinde tekrar `canlıya alayım mı?`, `commit edeyim mi?`, `PR açayım mı?`, `merge edeyim mi?` diye sorma.
- Kullanıcı `önce yorumla`, `önce bak`, `görsel önizleme ver`, `onay vereyim`, `canlıya alma`, `sadece analiz et` derse o aşamada write/deploy yapılmaz.
- Kullanıcı açıkça belirli bir kapsam verdiyse yalnız o kapsam uygulanır; ek özellik uydurulmaz.

## 3. Risk sınıfına göre GitHub yolu

### A — Düşük risk / hızlı yol

İzole ve geri alınabilir UI/CSS/metin, test, dokümantasyon veya küçük frontend düzeltmesi:

1. Güncel production HEAD ve ilgili kaynak doğrulanır.
2. Değişiklik GitHub üzerinden yapılır.
3. Gerekli test/build kontrolleri sağlanır.
4. Uygunsa canonical production branch'e fast-forward/commit uygulanabilir.
5. Cloudflare Git Integration tek production deploy'u yapar.
6. Read-only canlı smoke sonucu görülmeden iş tamam denmez.

### B — Orta/yüksek kod riski / güvenli yol

Auth, güvenlik, ortak component, API contract, Worker, büyük refactor veya çok dosyalı değişiklik:

1. Güncel production HEAD'den geçici branch açılır.
2. ChatGPT/GitHub bağlantısı değişiklikleri branch'e yazar.
3. Testler ve statik kontroller yapılır.
4. PR otomatik açılır.
5. Diff/CI temizse ajan kullanıcıdan tekrar onay istemeden PR'ı merge eder.
6. Cloudflare Git Integration production deploy'u yapar.
7. Canlı smoke doğrulanır.

Bu yol da Remote Desktop gerektirmez.

## 4. Mutlaka ayrı güvenlik kapısı isteyen işlemler

Aşağıdaki işlemler normal kod deploy ön yetkisinin dışında kalır:

- production D1/SQLite üzerinde silme/reset veya geri dönüşü zor veri mutasyonu,
- production schema migration uygulanması,
- DNS/domain silme veya domain sahipliği değişikliği,
- secret/API token/MFA anahtarı rotasyonu,
- billing/abonelik/ücret doğuran servis değişikliği,
- gerçek resmî belge/e-posta/harici işlem gönderimi,
- kullanıcı hesabı veya güvenlik politikasını geri dönüşü zor biçimde toplu değiştirme.

Bu işlemlerde mevcut AGENTS veri/güvenlik kuralları geçerlidir; backup/readiness ve gerektiğinde açık kullanıcı onayı zorunludur.

## 5. Canonical canlı yayın mimarisi

- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Kullanıcıya görünen tek ERP adresi: `https://kyerp.net/`
- API: `https://api.kyerp.net`
- KY Güvenlik PWA hostu: `https://security.kyerp.net`
- Frontend project: `ky-erp-frontend`
- Frontend automatic production deployment: **yalnız Cloudflare Git Integration**.
- Cloudflare Pages build gate: `npm run test && npm run build`.
- GitHub hotfix/release deploy workflow'ları normal otomatik yayın yolu değildir; emergency/manual fallback olarak tutulur.
- Aynı commit için ikinci/üçüncü otomatik Pages deploy hattı eklenmez.
- `production-live-smoke.yml` deploy yapmaz; yalnız canlı durumu okur.

## 6. Worker/API yayın kuralı

- Worker kaynağı: `APP/cloud/ky-erp-api`.
- Normal Worker yayını Cloudflare'ın canonical Git/Build hattından yürütülür; manuel deploy normal akış değildir.
- Worker değişikliğinde typecheck + unit test + build/dry-run sözleşmesi korunur.
- Frontend success + Worker fail, başarılı release değildir.

## 7. Remote olmadan yedek plan

Birinci yol: ChatGPT'nin GitHub bağlantısıyla doğrudan dosya/branch/commit/PR/merge işlemleri.

İkinci yol: aynı GitHub bağlantısıyla güvenli feature branch + PR kullanmak; production branch'e yalnız merge ile ulaşmak. Bu, yerel bilgisayar veya VS Code gerektirmez.

Cloudflare otomatik Git build/deploy arızalanırsa:

1. Önce Cloudflare/GitHub build sonucu ve kök neden okunur.
2. Kök neden GitHub kaynağında düzeltilir.
3. Normal Git Integration tekrar denenir.
4. Manual-only emergency workflow ancak Git Integration gerçekten çalışmıyorsa fallback olarak kullanılır.
5. Manual deploy başarılı olsa bile canonical otomatik hattın arızası ayrıca düzeltilir; kalıcı olarak iki deploy yolu açık bırakılmaz.

## 8. Tamamlanma kriteri

Bir repo işi ancak aşağıdakiler raporlanınca tamamdır:

- kök neden veya amaç,
- değişen dosyalar,
- test/build sonucu,
- GitHub commit/PR/merge durumu,
- Cloudflare deploy durumu,
- canlı smoke sonucu,
- final commit SHA.

Ajan kullanıcıyı gereksiz ara onaylarla durdurmaz; işi güvenli sınırlar içinde mümkün olan en ileri tamamlanmış duruma getirir.