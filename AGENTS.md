# KY ERP — AI Agent Ana Kuralları

Bu dosya GitHub Copilot, Copilot CLI, VS Code agent mode ve diğer AI geliştirme araçları için ortak ana çalışma sözleşmesidir.

## Canonical kaynak

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Canlı uygulama: `https://kyerp.net`
- Canlı API: `https://api.kyerp.net`
- Cloudflare Pages projesi: `ky-erp-frontend`
- Windows çalışma kökü bu makinede çoğunlukla `D:\onedrive\KY-ERP-MERKEZ` altında bulunur. Her işlemden önce gerçek repo kökünü `git rev-parse --show-toplevel` ile doğrula; yolu varsayarak destructive işlem yapma.
- `main` production kaynağı değildir. Kullanıcı açıkça değiştirmedikçe production çalışmaları yalnız yukarıdaki production branch üzerinde yapılır.

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
- GitHub Actions kotası doluysa workflow tetikleme veya tekrar çalıştırma. Yetki varsa testlerden sonra doğrudan Wrangler/Cloudflare deploy kullanılabilir; yoksa deploy yapılmış gibi raporlama.

## Canlı auth standardı

Canonical giriş akışı:

`POST /api/auth/login` → gerekiyorsa `POST /api/auth/mfa/verify` → session → `GET /api/auth/me`

- Admin/super admin için MFA zorunluluğunu kaldırma.
- Uygulama sahibi için session en fazla 8 saattir.
- Geçerli JWT tarayıcı kapanıp açıldığında gerçek `exp` süresine kadar korunabilir.
- Geçici network/5xx hatası geçerli sessionı temizlememeli.
- Gerçek 401/403 sessionı temizleyebilir.
- Logout hem sunucu sessionını iptal etmeli hem yerel tokenı temizlemeli.
- Runtime request yolunda DDL/schema oluşturma geri getirilmez.
- Duplicate/compat auth router yalnız gerçekten gerekli ve testli ise kullanılabilir; canonical akış tek olmalıdır.

## API ve tenant standardı

- Production API origin: `https://api.kyerp.net`.
- Frontend normal veri trafiği doğrudan API custom domainine gider.
- Canonical ana firma: slug `mecit-hakan`, id `main-mecit-hakan`.
- Eski aliaslar read-compatibility ile normalize edilebilir; canlı veriyi topluca UPDATE ederek alias problemi çözme.
- Bir yardımcı GET endpointinin hatası bütün modülün ana verisini boşaltmamalı. Kritik ana liste, yardımcı veri ve özet/sayaç verilerini bağımsız yükle.
- 401/403 yetki hatasını cache veya fallback ile gizleme.
- Başarılı son GET verisi geçici 5xx/network durumunda kısa süreli korunabilir; gerçek boş liste ile hata birbirinden ayrılmalıdır.

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

## Kod ve test standardı

- Önce kök nedeni bul, sonra minimum güvenli düzeltmeyi yap.
- Kullanıcı istemedikçe çalışan ekranı baştan tasarlama veya özellik kaldırma.
- Demo veri ile production sorununu gizleme.
- Yeni bağımlılık eklemeden önce gerçekten gerekli olduğunu doğrula.
- Frontend değişikliğinde mümkün olduğunda: lint + test + production build.
- Worker değişikliğinde mümkün olduğunda: typecheck + test + build/dry-run.
- API sözleşmesi veya route değişikliğinde frontend/backend eşleşmesini kontrol et.
- Değişiklik sonunda: kök neden, değişen dosyalar, testler, deploy durumu ve son commit SHA raporlanır.

## Production deploy standardı

- "Kaynak hazır" ile "canlıya çıktı" aynı şey değildir.
- Canlı deploy iddia edilmeden önce Worker/Pages deployment ve `kyerp.net` asset hash doğrulanmalıdır.
- Direct deploy gerekiyorsa önce build/test geçmeli.
- D1 migration bu deploy işinin parçası değilse çalıştırma.
- `https://api.kyerp.net/api/health` 200 ve canlı frontend yeni asset hash kullanmadan işi bitmiş sayma.
