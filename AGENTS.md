# KY ERP — AI Agent Ana Kuralları

Bu dosya KY ERP için güncel ve üstün çalışma sözleşmesidir. Ayrıntılı eski iş kuralları referans için `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md` dosyasında korunur. Çelişki halinde **bu dosya** geçerlidir; özellikle eski OneDrive/SQLite/path notları canonical değildir.

## Canonical kaynak

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Canlı API: `https://api.kyerp.net`
- Frontend: `APP/app/ky-erp-frontend`
- Cloudflare Worker: `APP/cloud/ky-erp-api`
- Repo için sabit OneDrive/Google Drive yolu **yoktur**.
- Her işlemden önce gerçek repo kökünü `git rev-parse --show-toplevel`, remote'u `git remote get-url origin`, branch'i `git branch --show-current`, durumu `git status -sb` ile doğrula.
- Beklenen remote `https://github.com/cetin60kaya-lgtm/ky-erp.git` olmalıdır.
- Yerel çalışma ağacı kirliyse kullanıcı değişikliklerini silme; `reset --hard`, `clean -fd`, force checkout/pull yapma.

## Canlı sistem gerçeği

- Canlı uygulama Cloudflare Worker/Pages düzenindedir.
- Canlı veri D1 üzerindedir; eski local NestJS + Prisma + SQLite düzeni legacy/reference kabul edilir.
- Gerçek business dosyalarının fiziksel evi firma tarafından seçilen File Hub provider'ıdır.
- R2; preview, cache, staging ve açıkça tanımlı geçici/türetilmiş dosya rolleri içindir. Büyük/orijinal PSD, AI, PDF, XML ve iş dosyalarının zorunlu ana arşivi değildir.

## Depolama / File Hub — canonical kural

KY ERP hiçbir depolama sağlayıcısına sabit bağlı değildir.

Desteklenen V1 provider tipleri:

- `GOOGLE_DRIVE`
- `ONEDRIVE`
- `SHAREPOINT`
- `LOCAL_FOLDER`
- `NAS`

Kurallar:

1. Provider bağlantısı bir kez **Depolama > Bağlantılar** ekranında tanımlanır.
2. Bölüm + dosya amacı hedefi **Depolama > Bölüm / Dosya Atamaları** ekranında seçilir.
3. Modüller doğrudan Google/OneDrive/NAS path kodu çağırmaz; ortak File Hub resolver kullanır.
4. Çözüm sırası: exact `module + purpose` binding -> firma primary storage -> hedef yoksa kontrollü hata.
5. OneDrive desteklenen opsiyonel provider'dır; varsayılan, repo kökü veya runtime zorunluluğu değildir.
6. Google Drive Desktop, OneDrive/SharePoint senkron klasörü, yerel klasör ve NAS V1'de KY File Agent ile izlenir.
7. Gelecekte Google Drive API veya Microsoft Graph adapteri eklenirse aynı `file_hub_connections`, `file_hub_bindings`, `FileAsset` ve relation modeli korunur.
8. Fiziksel dosya silme ile ERP ilişkisinden kaldırma ayrı işlemlerdir. Varsayılan davranış fiziksel dosyayı silmemektir.
9. Dosya kaybolursa ERP kaydı silinmez; `MISSING` olarak işaretlenir.
10. Aynı dosya Desen, İmalat, Boyahane vb. birden fazla entity ile ilişkilendirilebilir; gereksiz kopya üretme.

### Bölüm standardı

- **Desen:** `MODEL_IMAGE`, `MODEL_SOURCE`, `PLACEMENT`, `OUTGOING_DESIGN` File Hub üzerinden çözülür. Ayrı Desen-only Google/OneDrive path sistemi geri getirilmez.
- **DTF:** `RIP_PDF` File Hub üzerinden çözülür.
- **Muhasebe:** `INVOICE`, `DELIVERY_NOTE`, `PAYMENT_DOCUMENT`, genel ekler File Hub üzerinden çözülür.
- **İşNet:** `E_DOCUMENT` ve belge arşivi File Hub üzerinden çözülür.
- **İK:** `PERSONNEL_DOCUMENT`, `CONTRACT` gibi personel evrakı File Hub üzerinden çözülür; erişim yetkisi sıkıdır.
- **Boyahane:** `RECIPE`, `QUALITY`, kalite/numune fotoğrafları File Hub üzerinden çözülür.
- **İmalat:** teknik dosya, model dosyası, üretim fotoğrafı ve müşteri referansı File Hub üzerinden çözülür.
- **Stok:** kalite/teknik/genel ekler File Hub üzerinden çözülür.

## Desen özel kuralı

- Model ana kaydının tek merkezi Desen'dir.
- İşNet, Desen, Boyahane, İmalat ve Muhasebe aynı `canonicalModelId` ilişkisini kullanır.
- File Hub Agent DESEN binding altında bulduğu model görseli/kaynak/yerleşim/giden desen dosyalarını model ilişkisine bağlar.
- R2 canlı yükleme ekranı doğrudan yüklenen dosya için staging/preview akışıdır; Google Drive veya başka provider'ın yerine geçen kalıcı Desen ana arşivi olarak gösterilmez.

## Çoklu firma ve yetki

- KY ERP çoklu ana firma/tenant destekler.
- Storage connection, binding, FileAsset, location, relation, event ve agent status kayıtları tenant bağlamından çıkamaz.
- Yönetimsel Depolama ekranı owner/admin yetkisindedir.
- Normal modül kullanıcısı yalnız yetkili olduğu entity dosyalarını ve kendi modülü için çözümlenen storage hedefini görebilir.

## Veri ve güvenlik

- Birinci öncelik veri kaybını önlemektir.
- Production D1/SQLite verisini test için değiştirme.
- Gerçek personel, muhasebe, fatura, irsaliye, desen, boyahane, stok, lot, reçete, imalat ve kullanıcı kayıtlarını silme/sıfırlama.
- Production migration/write için açık kullanıcı onayı + yedek/readiness gerekir.
- Şifre, MFA secret, API token, `.env`, recovery code ve benzeri sırları repoya veya loga yazma.
- POST/PATCH/PUT/DELETE isteklerini otomatik retry ederek mükerrer kayıt üretme.
- Resmî İşNet belge/fatura gönderimi kullanıcı onayı olmadan yapılmaz.

## Auth standardı

- Auth contract: `canonical-v3`.
- Akış: `POST /api/auth/login` -> gerekirse `POST /api/auth/mfa/verify` -> session -> `GET /api/auth/me`.
- Owner/admin MFA zorunluluğunu kaldırma.
- PASSWORD_ONLY session: 28800 saniye.
- MFA/owner/admin session: 36000 saniye.
- Geçici network/5xx hatası geçerli sessionı silmemelidir.
- Logout, gerçek expiry, revoke, password/MFA reset veya yeni tarayıcı tekrar doğrulama gerektirir.

## Temel modül iş kuralları

- **İK:** günlük giriş/çıkış ve ana listeler yardımcı endpoint hatası yüzünden kaybolmaz; demo fallback kullanma.
- **Boyahane:** ürün, lot, reçete, renk, imalat boyası ve stok geçmişi gerçek veriden gelir; veri uydurma.
- **İmalat:** net sağlam = brüt üretim - baskı sakatı - kumaş sakatı; çok operasyonlu modelde tamamlanan model adedi zorunlu operasyonların minimum ortak adedidir.
- **Muhasebe/İşNet:** İşNet belge operasyon merkezidir; Muhasebe aynı resmî belge operasyonunu ikinci kez yaptırmaz. Firma iletişim bilgisinin tek kaynağı `companies` kaydıdır.

## Kod ve test standardı

- Önce kök nedeni bul, sonra ortak hata sınıfını düzelt.
- Demo veri ile production sorununu gizleme.
- API route/contract değişikliğinde frontend/backend eşleşmesini kontrol et.
- Frontend değişikliğinde lint + test + production build.
- Worker değişikliğinde typecheck + unit test + local integration smoke + dry-run.
- Production D1 write smoke testi yapma.

## Deploy standardı

- Kaynak hazır olmak, canlıya çıkmak değildir.
- Kullanıcı açıkça canlıya al/deploy/release demeden deploy yapma.
- Production D1 reset yasaktır.
- Migration gerekiyorsa önce remote D1 yedeği ve hedefli/idempotent uyumluluk yaklaşımı kullanılır.
- Deploy sonrası API health, auth contract, CORS ve frontend asset doğrulaması yapılmadan başarılı denmez.

## İş bitiş raporu

Her değişiklik sonunda şunları raporla:

- kök neden,
- değişen dosyalar,
- çalıştırılan testler,
- deploy durumu,
- canlı doğrulama durumu,
- son commit SHA.
