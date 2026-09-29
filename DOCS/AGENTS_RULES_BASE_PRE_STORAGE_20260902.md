# KY ERP — AI Agent Ana Kuralları

Bu dosya GitHub Copilot, Copilot CLI, VS Code agent mode ve diğer AI geliştirme araçları için ortak ana çalışma sözleşmesidir.

## Canonical kaynak

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Makine-okunur sabitler:
  - `KYERP_PUBLIC_SITE=https://kyerp.net/`
  - `KYERP_PUBLIC_APP=https://app.kyerp.net/`
  - `KYERP_API_ORIGIN=https://api.kyerp.net`
- **Kurumsal tanıtım sitesi:** `https://kyerp.net/`
- **ERP uygulaması ve login:** `https://app.kyerp.net/`
- **Canlı API servis origin'i:** `https://api.kyerp.net`
- Cloudflare Worker: `ky-erp-api`
- Canonical Pages hedef projesi: `ky-erp-frontend`. Mevcut domain başka bir Pages projesine bağlıysa körlemesine taşınmaz; önce gerçek sahiplik çözülür.
- Windows canonical repo kökü: `D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ`
- Her işlemden önce gerçek repo kökünü `git rev-parse --show-toplevel` ile doğrula; destructive işlemde yalnız path varsayımına güvenme.
- `main` production kaynağı değildir. Kullanıcı açıkça değiştirmedikçe production çalışmaları yalnız yukarıdaki production branch üzerinde yapılır.

## Site + ERP domain ayrımı — kritik

Bu bölüm eski tek-domain notlarının önündedir:

1. `https://kyerp.net/` yalnız kurumsal tanıtım/public site olarak çalışır.
2. `https://app.kyerp.net/` ERP uygulaması ve kullanıcı login adresidir.
3. `https://api.kyerp.net` yalnız backend/API servisidir; kullanıcı arayüzü değildir.
4. Public site üzerindeki `Uygulamaya Giriş`, `/giris`, `/login` ve `/app` akışları `https://app.kyerp.net/` adresine yönlenir.
5. Yeni deploy/script/CI/test yazarken başarı şartı hem `kyerp.net` hem `app.kyerp.net` frontend asset doğrulaması ve `api.kyerp.net` backend sağlığıdır.
6. Eski V5/tek-domain belgeleri canonical değildir. Yeni production orkestrasyonu V6 site + app mimarisidir.
7. Cloudflare Pages projesi/domain sahipliği çakışıyorsa otomatik overwrite yapma; güvenli biçimde tespit et ve yalnız doğrulanmış proje üzerinde ilerle.

## Çoklu ana firma mimarisi

- KY ERP tek firmalık değildir; birden fazla ana işletme/şirket destekler.
- Muhasebe çekirdeği sağlayıcıdan bağımsızdır.
- Hakan Emprime İşNet kullanabilir; başka ana firmalar Paraşüt, başka sağlayıcı veya Excel/manuel akış kullanabilir.
- İşNet, Paraşüt ve benzeri sağlayıcılar çekirdeğin kendisi değil, ana firmaya atanabilen entegrasyon modülleridir.
- Firma/model/belge ilişkilerinde tenant izolasyonu korunur; farklı ana firmaların verileri karıştırılmaz.

## Çalışmaya başlamadan önce

Her agent önce şunları kontrol eder:

1. `git rev-parse --show-toplevel`
2. `git remote get-url origin`
3. `git branch --show-current`
4. `git status -sb`
5. Gerekirse `git fetch origin`

Beklenen remote `https://github.com/cetin60kaya-lgtm/ky-erp.git` olmalıdır. Çalışma ağacı temiz değilse kullanıcının yerel değişikliklerini silme, `reset --hard`, `clean -fd`, zorla checkout veya zorla pull yapma.

## En önemli güvenlik kuralları

- Birinci öncelik veri kaybını önlemektir.
- Production D1/SQLite verisini test için değiştirme.
- Gerçek personel, muhasebe, fatura, irsaliye, desen, boyahane, stok, lot, reçete, imalat ve kullanıcı kayıtlarını silme veya sıfırlama.
- Migration gerekiyorsa önce mevcut migration zincirini ve canlı şemayı salt-okunur denetle; production migration/write için açık kullanıcı onayı gerekir.
- Şifre, MFA secret, API token, `.env`, recovery code ve benzeri sırları repoya, loga veya kullanıcıya açık çıktıya yazma.
- POST/PATCH/PUT/DELETE isteklerini otomatik retry ederek mükerrer kayıt üretme.
- Resmî İşNet belge/fatura gönderimi ve kritik production write kullanıcı onayı olmadan yapılmaz.
- GitHub Actions çalışmıyorsa/kota engeli varsa deploy için onu zorlamaya çalışma. Yetkili Windows makinede canonical direct Wrangler deploy kullanılır.

## Canlı auth standardı

Auth sözleşme sürümü: `canonical-v3`.

Read-only handshake:

`GET /api/auth/status`

Canonical giriş akışı:

`POST /api/auth/login` → gerekiyorsa `POST /api/auth/mfa/verify` → session → `GET /api/auth/me`

- Eski `/api/auth/v2/*` fallback kalıcı olarak kaldırılmıştır; yeniden ekleme.
- Admin/super admin için MFA zorunluluğunu kaldırma.
- `PASSWORD_ONLY` session tam 8 saat (`28800` saniye).
- Google, Microsoft, `ANY_MFA`, `BOTH_MFA` ve owner/admin MFA session tam 10 saat (`36000` saniye).
- Geçerli JWT tarayıcı kapanıp açıldığında gerçek `exp` süresine kadar korunur.
- Tarayıcı kapat/aç işlemi geçerli session varken yeniden MFA istemez.
- Logout, gerçek expiry, session revoke, password reset, MFA reset/re-enroll veya yeni tarayıcı yeniden authentication gerektirir.
- Geçici network/5xx hatası geçerli sessionı temizlememeli.
- Gerçek 401/403 geçersiz sessionı temizleyebilir.
- Runtime request yolunda DDL/schema oluşturma geri getirilmez.
- Login/MFA POST otomatik retry edilmez.
- Frontend password değerini trim/normalize etmez; identity normalize edilebilir.
- Browser login/MFA/kurtarma transportu gereksiz özel header/preflight bağımlılığı üretmemelidir.
- Recovery flow kullanıcıyı doğrulama atlayarak doğrudan uygulamaya sokmaz; güvenlik faktörünü yeniden kurar.

## Sistem e-posta standardı

- KY ERP otomatik sistem göndericisi: `KY ERP <admin@kyerp.net>`.
- Resend yalnız sistem/uygulama mail gönderim sağlayıcısıdır; gerçek kullanıcı mailbox hizmetinin alternatifi değildir.
- Resend domain doğrulaması, Worker `RESEND_API_KEY` secret ve gerçek owner test maili kanıtlanmadan mail kanalı hazır sayılmaz.
- Secret değeri repoya veya loga yazılmaz.
- Cloudflare versioned Worker yapısında secret gerekiyorsa `wrangler versions secret put` kullanılır; deploy sırasında secret korunmalıdır.
- Firma kartındaki `companies.email` alanı ekstre/mail iş akışlarının varsayılan alıcısıdır. Aynı firma için ikinci bağımsız mail rehberi oluşturma.

## API ve tenant standardı

- Production API origin: `https://api.kyerp.net`.
- Frontend normal veri trafiği API custom domainine gider.
- Canonical ana firma: slug `mecit-hakan`, id `main-mecit-hakan`.
- Eski aliaslar read-compatibility ile normalize edilebilir; canlı veriyi topluca UPDATE ederek alias problemi çözme.
- Bir yardımcı GET endpointinin hatası bütün modülün ana verisini boşaltmamalı. Kritik ana liste, yardımcı veri ve özet/sayaç verilerini bağımsız yükle.
- 401/403 yetki hatasını cache veya fallback ile gizleme.
- Başarılı son GET verisi geçici 5xx/network durumunda kısa süreli korunabilir; gerçek boş liste ile hata birbirinden ayrılmalıdır.
- Mutation çağrılarını otomatik retry etme.

## Modül ana kuralları

### İK

- Günlük Giriş tam `IkPage` çalışma alanını korur; sade geçici ekranla değiştirme.
- Personel Havuzu tüm aktif günlük personeli gösterebilir.
- Çalışma listesi yalnız kayıtlı roster + tarih aralığında gerçekten çalışmış kişileri içerir.
- Boş roster tüm aktif personel demek değildir.
- Hızlı Giriş, Yeni Personel, Günlük Kaydet, Haftalık Liste, Excel, gündüz/gece, ücret, not ve toplamlar korunur.
- Bir izin/evrak/özet endpointi hata verince `daily-employees` havuzu kaybolmamalıdır.

### Boyahane

- Ürün, lot, reçete, kayıtlı renk, imalat boyası ve stok geçmişi gerçek veriden gelir; production’da demo fallback gösterme.
- Lot takibi ürün bazlıdır. Lot numarası olmayan gerçek girişler `Lot Bekleyenler` olarak izlenir; veri uydurma.
- Kayıtlı renk/ürün/lot listelerinde tenant alias yüzünden veri kaybolmamalıdır.

### Desen

- Model ana kaydının tek merkezi Desen modülüdür.
- İşNet, Desen, Boyahane, İmalat ve Muhasebe aynı `canonicalModelId` ilişkisini kullanmalıdır.
- Model adı kalıcı kimlik değildir; arama/gösterim içindir.
- PSD/görsel/dosya arşivi gerçek STORAGE/Drive yapısında tutulur, GitHub'a gerçek kullanıcı dosyası eklenmez.

### İmalat

- Üretim, model, makine, vardiya, gündüz/gece, hızlı fiş, irsaliye ve sakat adet ilişkilerini bozma.
- Net sağlam = brüt üretim - baskı sakatı - kumaş sakatı.
- Çok operasyonlu modelde tamamlanan model adedi zorunlu operasyonların minimum ortak adedidir.

### Muhasebe ve İşNet

- İşNet belge operasyon merkezidir; Muhasebe aynı resmî belge operasyonunu ikinci kez yaptırmaz.
- Muhasebe finansal sonucu, cari/KDV/ödeme/çek durumunu gösterir.
- Firma/model/belge ilişkilerinde duplicate kart üretme.
- Gerçek belge gönderimi kullanıcı onayı ister.
- Firma kartındaki telefon/e-posta/adres/not iletişim bilgisinin tek kaynağı `companies` kaydıdır.

## Kod ve test standardı

- Önce kök nedeni bul, sonra ortak hata sınıfını düzelt; aynı arızayı modül modül kopyalama.
- Demo veri ile production sorununu gizleme.
- Yeni bağımlılık eklemeden önce gerçekten gerekli olduğunu doğrula.
- Frontend değişikliğinde: lint + test + production build.
- Worker değişikliğinde: typecheck + unit test + local auth integration smoke + build/dry-run.
- Auth integration smoke yalnız local D1 (`wrangler.production-local.jsonc`) üzerinde çalışır; production D1 test write yasaktır.
- API sözleşmesi veya route değişikliğinde frontend/backend eşleşmesini kontrol et.
- Domain contract testi V6 site + app + api mimarisini doğrulamalıdır; eski V5 tek-domain testleri geri eklenmez.
- Değişiklik sonunda: kök neden, değişen dosyalar, testler, deploy durumu ve son commit SHA raporlanır.

## Production deploy standardı

Canonical tek tık launcher repo kökündedir:

`KY ERP CANLIYA YUKLE.bat`

Asıl script:

`DEPLOY/KYERP_DIRECT_PRODUCTION.ps1`

Canonical production orkestrasyonu:

`DEPLOY/KYERP_DIRECT_PRODUCTION_V6.ps1`

Deploy sırası:

1. Doğru repo/remote/branch/SHA ve temiz tracked çalışma ağacı.
2. Cloudflare OAuth (`wrangler whoami`).
3. Worker typecheck + unit + local auth integration + dry-run.
4. Frontend lint + test + production build.
5. Gerekliyse hedefli/idempotent D1 uyumluluğu; önce tam remote D1 yedeği. D1 reset ve genel migration zinciri yoktur.
6. Worker direct deploy.
7. `api.kyerp.net` health + `auth/status` + canonical login smoke + CORS. Browser origin `https://app.kyerp.net` olmalıdır.
8. Frontend build aynı canonical Pages projesine yayınlanır; `kyerp.net` ve `app.kyerp.net` custom domainleri ACTIVE olmalıdır.
9. **Hem `https://kyerp.net/` hem `https://app.kyerp.net/` aynı yeni frontend build asset hashini göstermeden deploy başarılı sayılmaz.**
10. Public hostname ayrımı runtime’da doğrulanır: `kyerp.net` public landing, `app.kyerp.net` ERP/login.

- "Kaynak hazır" ile "canlıya çıktı" aynı şey değildir.
- Production D1 reset yasaktır.
- Genel production migration zinciri yasaktır; yalnız açıkça hedeflenmiş additive/idempotent uyumluluk kullanılabilir.
- Production D1 write smoke testi yasaktır.
- `https://api.kyerp.net/api/health` 200, auth contract doğru, `kyerp.net` ve `app.kyerp.net` yeni asset hash kullanmadan işi bitmiş sayma.
