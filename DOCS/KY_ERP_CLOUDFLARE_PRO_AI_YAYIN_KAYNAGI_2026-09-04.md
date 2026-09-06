# KY ERP — Cloudflare Pro + AI + Actions'sız Canlı Yayın Ana Kaynağı

**Tarih:** 04.09.2026  
**Durum:** Cloudflare Pro aktif. Cloudflare Git Integration production yayın yolu olarak doğrulandı.  
**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Production branch:** `codex/model-uretim-kontrol-merkezi-final`

Bu dosya KY ERP'nin Cloudflare Pro ve AI/otomasyon mimarisi için canonical devam kaydıdır. **Production canlıya alma prosedürünün tek üstün kaynağı `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md` dosyasıdır.** Deploy konusunda çelişki olursa 06.09 canonical deploy sözleşmesi geçerlidir. Secret/token değerleri bu dosyaya yazılmaz.

---

## 1. Kesin mimari

- GitHub = kaynak kodu ve geçmiş.
- Cloudflare = production runtime, güvenlik, deploy ve AI/otomasyon merkezi.
- GitHub Actions = production deploy yolu DEĞİL. Normal release/hotfix için kullanılmaz; yalnız kullanıcı açıkça isterse manual tanılama/test çalıştırılabilir.
- Frontend = Cloudflare Pages.
- API = Cloudflare Worker `ky-erp-api`.
- Database = Cloudflare D1 `ky-erp-db`.
- File preview/cache/staging = R2 `ky-erp-files`.
- Gerçek iş dosyalarının canonical evi = seçilen File Hub provider (Google Drive / OneDrive / SharePoint / Yerel / NAS).
- Workers AI binding = `AI`.
- Resmî e-Fatura/e-İrsaliye gönderimi kullanıcı onayı olmadan otomatik yapılmaz.

---

## 2. Cloudflare Pro

04.09.2026 tarihinde `kyerp.net` için Cloudflare Pro aylık plan etkinleştirildi.

Pro tarafında KY ERP için kullanılacak başlıklar:

1. Cloudflare Managed WAF.
2. OWASP managed rules.
3. Custom WAF rules.
4. Rate limiting.
5. Bot/Super Bot Fight Mode — API/mobile/PDKS/File Agent trafiği bozulmayacak şekilde kontrollü.
6. Cache/performance rules.
7. Analytics ve güvenlik görünürlüğü.
8. Turnstile login/recovery için planlı.
9. AI crawler/bot kontrolü.

### Pro güvenlik ilkesi

- `/api/*` cache edilmez.
- Auth cevapları cache edilmez.
- Frontend hashed assetleri uzun cache kullanabilir.
- `/api/auth/login`, MFA ve recovery endpointleri rate limit ile korunur.
- `/api/admin/*`, `/api/ik/*`, `/api/e-belge/*`, `/api/isnet/*` backend auth/tenant guard'ını korur.
- WAF için endpointleri public yaparak test geçirme yok.
- PDKS/Agent/API istemcilerine tarayıcı challenge körlemesine uygulanmaz.

---

## 3. Actions'sız otomatik yayın — doğrulanmış

> Güncel operasyon kuralı: normal canlıya almada kullanıcıdan PowerShell/token istenmez; production merge sonrası Cloudflare Git Integration otomatik çalışır. Worker build/test fail olursa manuel deploy ile bypass edilmez. Ayrıntı: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.

### Frontend / Pages

Cloudflare Pages projesi: `ky-erp-frontend`

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/app/ky-erp-frontend`
- Build: `npm run build`
- Output: `dist`
- Production env: `VITE_API_URL=https://api.kyerp.net`
- Build watch include: `APP/app/ky-erp-frontend/*`
- Preview/non-production branch automatic deployment: KAPALI.
- Production automatic deployment: AÇIK.

Doğrulama probe commit: `a7d4d8351a29e34b67775909e5964d41e662138a`

Cloudflare Pages GitHub App bu commit için production build/deploy başlattı ve **Deploy successful** verdi.

### Worker / API

Cloudflare Worker: `ky-erp-api`

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production branch: `codex/model-uretim-kontrol-merkezi-final`
- Root: `APP/cloud/ky-erp-api`
- Build: `npm run typecheck && npm test && npm run build`
- Deploy: `npm run deploy`
- Production dışı branch buildleri: kapalı tutulmalı.

Doğrulama probe commit: `cef6d109981da59f1596907276e04717f91a0b73`

Cloudflare Workers Builds sonucu: **success**  
Worker Version ID: `0ad918de-e704-4236-90f9-7f2c1b8921e2`

---

## 4. GitHub Actions durumu

Aşağıdaki workflow'lar otomatik push/PR yolu olmaktan çıkarıldı; manual fallback olarak tutulur:

- `.github/workflows/responsive-pages-release.yml`
- `.github/workflows/frontend-runtime-smoke.yml`
- `.github/workflows/auth-policy-ci.yml`
- `.github/workflows/d1-schema-readiness.yml`
- `.github/workflows/production-release.yml`
- `.github/workflows/api-contract-audit.yml`
- `.github/workflows/isnet-cloud-local-smoke.yml`
- `.github/workflows/filehub-oauth-secret-unblock.yml`

Yeni normal yayın akışı:

`production branch push -> Cloudflare Git build -> test/build -> Worker veya Pages deploy`

GitHub Actions normal production deploy için hiç kullanılmaz; production sonucu Cloudflare Git Integration üzerinden doğrulanır.

---

## 5. D1 migration güvenlik kuralı

Cloudflare Git auto-deploy, normal kod yayını için kullanılabilir; fakat **D1 schema write ayrı güvenlik kapısıdır**.

Migration içeren release:

1. production D1 full backup,
2. migration readiness,
3. yalnız hedefli/additive migration,
4. schema doğrulaması,
5. Worker deploy,
6. frontend deploy,
7. canlı health/auth kontrolü.

D1 reset/drop yasaktır.

File Hub cloud OAuth migration numarası, mevcut 0041-0043 İK/PDKS migrationları nedeniyle `0044_file_hub_cloud_oauth.sql` olarak korunur.

---

## 6. Cloudflare yönetim otomasyonu için minimum yetkili token

Token adı önerisi:

`KY ERP Cloudflare Management`

Token bir secret'tır. Repo, chat, log veya MD dosyasına token değeri yazılmaz.

### Account izinleri

- Workers Builds Configuration — Edit
- Workers Scripts — Edit
- Cloudflare Pages — Edit
- D1 — Read only
- Workers R2 Storage — Edit
- Workers AI — Edit
- AI Gateway — Read + Edit + Run
- Vectorize — Edit
- Queues — Edit
- Turnstile — Edit
- Account Analytics — Read

İleride gerektiğinde ayrıca:
- Email Routing Addresses — Edit
- Containers — Edit
- Zero Trust — Edit

### Zone izinleri — yalnız `kyerp.net`

- Zone — Read
- Zone Settings — Edit
- Zone WAF — Edit
- Bot Management — Edit
- Cache Rules / Cache Settings — Edit
- Cache Purge
- Firewall Services — Edit
- Analytics — Read
- Email Routing Rules — Edit

### Verilmeyecek gereksiz izinler

- Billing Edit
- API Tokens Edit
- Account Members Edit
- DNS Edit (DNS değişikliği gereken ayrı iş dışında)
- Zero Trust PII Read
- Global API Key

Resource scope:
- Account: yalnız KY ERP'nin mevcut Cloudflare hesabı.
- Zone: yalnız `kyerp.net`.

---

## 7. Cloudflare AI hedef mimarisi

`KY ERP -> Worker API -> tenant/permission guard -> AI Gateway -> Workers AI / gerekirse harici provider -> audit/metering`

### Production'da aktif / hazır

- Workers AI binding `AI` — aktif.
- AI Gateway — `default` gateway üzerinden Workers AI çağrılarına bağlandı.
- AI Gateway cache — tenant/ERP cevaplarında yanlış çapraz-cache riskini önlemek için request bazında bypass.
- AI Gateway persistent request/response logu — hassas ERP promptlarının saklanmaması için varsayılan kapalı.
- AI kullanım/maliyet takibi — KY ERP kendi tenant bazlı billing ledger'ı üzerinden devam eder.

### İhtiyaç oluşunca aktive edilecek altyapı

- Queues — gerçek asenkron iş kuyruğu gerektiren modül için.
- Workflows — uzun süreli/idempotent çok adımlı iş akışı için.
- Vectorize — semantik benzerlik araması için gerçek embedding indeks ihtiyacı doğduğunda.
- AI Search — File Hub/kurumsal belge semantik araması pilotu için.

Bu dört servis **çekirdek production blocker değildir**. Kullanılmayan Cloudflare kaynağı sırf açık görünsün diye production'a eklenmez; somut iş akışı + tenant/permission contract hazır olduğunda ayrı kontrollü paket olarak etkinleştirilir.

### Pilot / değerlendirme

- Secrets Store (beta)
- Browser Run / portal otomasyonu
- Email Sending (beta)

### Yalnız dev/staging

- Sandbox SDK preview
- Dynamic Workers beta
- Code Mode experimental
- Agent Skills experimental

Beta/preview özelliğe production D1 write veya sınırsız muhasebe/personel yetkisi verilmez.

---

## 8. KY ERP Asistan yetki modeli

Asistan hiçbir zaman serbest SQL kullanıcısı değildir.

Akış:

`kullanıcı mesajı -> auth -> tenant -> modül permission -> typed action -> onay -> business API/write -> audit`

### Okuma

Kullanıcının modül görüntüleme yetkisi kadar veri okunur.

Örnek:
- “Zeynep'in bu ay avansı var mı?”
- “Son üç ay fazla mesai toplamı?”
- “A firmasının açık borcu?”
- “Bu faturanın irsaliyesi hangisi?”
- “Bu LOT'tan ne kaldı?”
- “Bu desene benzeyen eski model?”

### Yazma — allowlist

İlk production allowlist:

- İK: Avans kaydı hazırla.
- İK: Mesai kaydı hazırla.
- İK işlemi yalnız kullanıcının IK create/update yetkisi varsa.
- Action yalnız aynı tenant içinde.
- Action yalnız hazırlayan kullanıcı tarafından onaylanır.
- Onay tokenı kısa ömürlü.
- Execution idempotent.
- Audit log zorunlu.

Sonraki allowlist:
- izin kaydı,
- personel notu,
- kontrollü cari ödeme kaydı,
- FİBE ödeme kaydı.

### Her zaman manuel/onaylı kalacak

- resmî e-Fatura/e-İrsaliye gönderimi,
- personel/kullanıcı silme,
- D1 migration/reset,
- fiziksel File Hub dosya silme,
- MFA/password/security değişiklikleri,
- toplu muhasebe finalizasyonu.

---

## 9. Modül bazlı AI/Cloudflare kullanımı

### Desen
- AI Search/Vectorize: benzer model/desen bulma.
- File Hub: model kaynak/placement/görsel ilişkisi.
- Workers AI: sınıflandırma/özet.
- Baskı spot/AKS kararları Photoshop/UXP'de kalır.

### Boyahane
- reçete/LOT/stok arama,
- benzer reçete,
- anomali açıklama,
- Queue/Workflow ile iş akışı.
- Gramaj/stok matematiği deterministic backend.

### İmalat
- event kuyruğu,
- makine/operatör/hata analizi,
- üretim fotoğrafı ve dosya ilişkilendirme,
- Analytics Engine ileride kullanım metriği için.

### İK
- personel, maaş dönemi, avans, mesai, izin okuma.
- allowlist onaylı write.
- hassas kişisel veri AI loglarında gereksiz tutulmaz.

### PDKS
- deterministic kart kuralları canonical.
- AI yalnız anomali/açıklama/raporlama.
- AI tahminle kart saati değiştirmez.

### Muhasebe
- cari/ödeme/FİBE/KDV sorgulama.
- ödeme write daha sonra ayrı typed action.
- AI finansal rakam uydurmaz.

### e-Belge
- belge sınıflandırma,
- firma/ürün önerisi,
- fatura-irsaliye eşleşmesini açıklama.
- resmî gönderim manuel onaylı.

### Depolama/File Hub
- Google Drive / OneDrive / SharePoint / Yerel / NAS ortak model.
- AI Search/Vectorize dosya bulma ve benzerlik katmanı.
- Cloudflare R2 canonical ana arşiv değildir.

---

## 10. Cloudflare Pro rollout sırası — 06.09.2026 final durum

1. Git auto-deploy — **TAMAM**.
2. GitHub Actions production auto-trigger kapatma — **TAMAM**.
3. Cloudflare Pro — **TAMAM**.
4. Least-privilege management token — **TAMAM**; D1 yalnız Read, secret değeri kaynakta yok.
5. Cloudflare Managed WAF — **TAMAM / Observe-Log**. Enforce bilerek açılmadı; event verisi görülmeden kör block yapılmaz.
6. Login rate limit — **TAMAM**: `/api/auth/login` 10 istek / 60 sn / IP, 60 sn block. İkinci Pro slotu bilerek boş.
7. API cache bypass — **TAMAM**: `api.kyerp.net/api` ve `/api/*` cache dışı.
8. Bot policy audit — **TAMAM**: Verified Bots allow; geniş SBFM block/challenge açılmadı. API/mobile/PDKS/File Agent korunur.
9. Turnstile — **TAMAM**: web login server-side verify + fail-closed.
10. Owner session security — **TAMAM**: kalıcı browser restore ve rolling refresh kapalı; normal kullanıcı davranışı korunur.
11. AI Gateway — **TAMAM / source-ready**: Workers AI çağrıları `default` gateway üzerinden, cache bypass, persistent prompt logu varsayılan kapalı.
12. Workers AI — **TAMAM**: `AI` binding ve tenant/billing guard aktif.
13. Queues / Workflows — **BLOCKER DEĞİL / ihtiyaç bazlı**.
14. Vectorize / AI Search — **BLOCKER DEĞİL / semantik arama paketi olarak ihtiyaç bazlı**.

**Çekirdek Cloudflare production katmanı tamam kabul edilir.** Kalan servisler yeni ürün özelliği paketidir; mevcut ERP'nin güvenli yayınını tamamlamak için zorunlu değildir.

---

## 11. Production güvenlik özeti

- Secret değerleri repoya yazılmaz.
- Tenant scope fail-closed.
- Owner/admin MFA korunur.
- Audit/DENETIM read-only korunur.
- İşNet/e-Belge auth public yapılmaz.
- D1 write migration backup'sız uygulanmaz.
- Cloudflare Pro bot/WAF ayarı API/mobile trafiğini bozacak şekilde kör açılmaz.
- AI yalnız typed/allowlisted action kullanır.

---

## 12. Devam komutu

Yeni sohbette:

> **“Cloudflare Pro + AI ana kaynağını oku. Actions'sız Git deploy düzenini koru. WAF/rate-limit/AI Gateway/Queues/Workflows/Vectorize rollout'una kaldığı yerden devam et; secret değerlerini asla repo veya sohbete yazma.”**


---

## 13. 04.09 tarihli kurulum notunun durumu

04.09 tarihli "token henüz oluşturulmadı / WAF-Turnstile kurulacak" devam notu artık **tarihsel ve geçersizdir**. 06.09 final durumu bu dosyanın 10. bölümünde tutulur.

Kalıcı kurallar:
- Token adı `KY ERP Pro Otomasyon`.
- Resource scope yalnız KY ERP Cloudflare hesabı + `kyerp.net`.
- D1 yalnız Read; D1 Edit verilmez.
- Billing/API Tokens/Account Members/DNS Edit verilmez.
- Token değeri chat/repo/log içine yazılmaz.
- Production deploy yolu GitHub Actions değil, Cloudflare Git Integration'dır.


---

## 14. 06.09.2026 final güncellemesi

- Production deploy için GitHub Actions kullanılmaması kesinleştirildi.
- Normal canlıya almada PowerShell/token/manual deploy yok; canonical kaynak: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.
- Sağ üst Bildirim Merkezi gerçek notification API'ye bağlandı.
- Turnstile + MFA + owner session güvenliği final.
- AI Gateway + Workers AI production source contractı tamamlandı.
- Queues/Workflows/Vectorize/AI Search çekirdek blocker olmaktan çıkarıldı; yalnız somut ürün iş akışı gerektirirse ayrı feature paketi olarak açılacak.
- Bu bölüm eski "yarın devam" notlarının üstündedir.
