# KY ERP — AI Agent Ana Kuralları

Bu dosya KY ERP için güncel ve üstün çalışma sözleşmesidir. Ayrıntılı eski iş kuralları referans için `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md` dosyasında korunur. Çelişki halinde **bu dosya** geçerlidir; özellikle eski OneDrive/SQLite/path notları canonical değildir.

## Zorunlu proje devam kaydı

- Her yeni sohbet, yeni ajan, yeni feature branch veya kaldığı yerden devam eden KY ERP işinde **kod yazmadan önce** `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` okunmalıdır.
- Bu dosya (`AGENTS.md`) teknik/güvenlik kurallarında üstündür; `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` ise kullanıcının güncel kararları, aktif branch/PR, kontrol sonucu, önemli gelişmeler ve sonraki adım için tek devam merkezidir.
- Aktif feature branch üzerinde bu kontrol dosyasının production branch'ten daha yeni sürümü varsa aktif iş için o sürüm kullanılır; kullanıcı onayından sonra ilgili değişiklikler production kaynağına taşınır.
- Kullanıcının kalıcı çalışma kuralı, önemli mimari karar, kullanıcı tarafından doğrulanan Desktop sürümü, modül onayı, blocker veya production'a geçiş kararı oluştuğunda kontrol merkezi güncellenmelidir.
- Şifre, MFA secret, API key, token veya kişisel gizli bilgiler kontrol merkezine yazılmaz.

## Canonical kaynak

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- `KYERP_PUBLIC_SITE=https://kyerp.net/`
- `KYERP_PUBLIC_APP=https://app.kyerp.net/`
- `KYERP_API_ORIGIN=https://api.kyerp.net`
- Kurumsal tanıtım sitesi: `https://kyerp.net/`
- ERP uygulaması ve login: `https://app.kyerp.net/`
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

## Cloudflare AI standardı

- Workers AI binding adı `AI` ve canonical model çağrısı Worker içinden yapılır.
- Workers AI çağrıları AI Gateway üzerinden yürütülür; varsayılan gateway kimliği `default`.
- ERP/tenant cevabı cache edilmez; AI Gateway request bazında `skipCache: true`.
- Hassas ERP prompt/response payload'larının kalıcı AI Gateway loguna düşmesi varsayılan olarak kapalıdır (`AI_GATEWAY_COLLECT_LOGS=false`).
- Tenant/permission guard AI çağrısından önce uygulanır.
- AI kullanım/maliyet kaydı KY ERP'nin tenant bazlı billing ledger'ında tutulur.
- AI write executor serbest SQL değildir; typed/allowlisted ve kullanıcı onaylı iş akışı dışında write yapılmaz.
- Queues/Workflows/Vectorize/AI Search çekirdek production zorunluluğu değildir; somut iş akışı ve tenant/permission contractı olmadan sırf servis açık görünsün diye eklenmez.

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
- Kullanıcı açıkça canlıya al/deploy/release demeden production branch'e taşıma yapma.
- **Tek canonical production yayın sözleşmesi:** `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.
- **Canonical production yayın yolu Cloudflare Git Integration'dır.**
- Normal release akışı: feature branch -> test/build -> kullanıcı onayı -> production branch merge -> Cloudflare Pages + Workers Builds -> canlı smoke.
- Frontend: `codex/model-uretim-kontrol-merkezi-final` -> Cloudflare Pages `ky-erp-frontend`.
- Worker: `codex/model-uretim-kontrol-merkezi-final` -> Cloudflare Workers Builds `ky-erp-api`.
- Worker build kapısı `npm run typecheck && npm test && npm run build`; deploy `npm run deploy`. Build kapısı fail ise Worker deploy edilmez ve release tamam sayılmaz.
- **Normal canlıya almada kullanıcıdan PowerShell, Cloudflare tokenı, manuel Pages deployu veya manuel Worker build/deploy isteme.**
- Manuel PowerShell/Cloudflare API müdahalesi yalnız Git Integration arızası, tetiklenmeme teşhisi veya kontrollü incident/recovery içindir.
- Otomatik Worker build fail olursa manuel deploy ile bypass etme: Cloudflare build logunu oku, kök nedeni feature branch'te düzelt, regression testi ekle/güncelle, production'a normal merge et ve yeni otomatik buildi bekle.
- Pages success + Worker fail = **kısmi/başarısız release**; ikisi ve canlı smoke tamamlanmadan "canlı tamam" denmez.
- Production branch paralel sohbet nedeniyle ilerlerse eski SHA körlemesine deploy edilmez; güncel HEAD doğrulanır ve ilgili değişikliğin yeni HEAD'de bulunduğu teyit edilir.
- **Production deploy için GitHub Actions kullanılmaz.** Workflow'lar varsayılan olarak manual-only (`workflow_dispatch`) tutulur; otomatik push/PR/workflow_run/schedule tetikleri kullanıcı açık kararı olmadan eklenmez.
- Eski Windows BAT/direct deploy scriptleri canonical otomatik yayın yolu değildir; bakım/geri dönüş referansı olarak kalabilir.
- Feature/preview branch otomatik Cloudflare production deploy etmez.
- Production D1 reset yasaktır.
- Migration gerekiyorsa normal Git auto-deploy'dan ayrı güvenlik kapısı uygulanır: remote D1 full backup -> readiness -> hedefli/additive migration -> schema doğrulaması -> deploy.
- Secret/token değeri repoya, loga veya dokümana yazılmaz.
- Deploy sonrası API health, auth contract, CORS ve frontend asset doğrulaması yapılmadan başarılı denmez.
- Ayrıntılı Cloudflare/AI kaynağı: `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`.
- Bildirim Merkezi kaynağı: `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`.

## İş bitiş raporu

Her değişiklik sonunda şunları raporla:

- kök neden,
- değişen dosyalar,
- çalıştırılan testler,
- deploy durumu,
- canlı doğrulama durumu,
- son commit SHA.
