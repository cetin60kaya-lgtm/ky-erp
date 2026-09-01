# KY ERP — ORTAK FILE HUB / DOSYA MERKEZİ MİMARİSİ

Tarih: 2026-09-01
Durum: Uygulama öncesi kilitli mimari sözleşmesi
Hedef dal: `codex/file-hub-multistorage-v1`

## 1. Ana karar

KY ERP hiçbir bulut sağlayıcısına sabit bağlı değildir.

- Dosyanın gerçek evi firma tarafından seçilen depolama sağlayıcısıdır.
- Google Drive olabilir.
- OneDrive olabilir.
- Aynı firmada ikisi birden kullanılabilir.
- İleride SharePoint, NAS veya yerel klasör eklenebilir.
- ERP modülleri doğrudan Google Drive / OneDrive kodu çağırmaz.
- Tüm modüller ortak `File Hub` servisini kullanır.

Bu servis Desen, İmalat, Boyahane, Muhasebe, İşNet/Paraşüt/manuel muhasebe, İK, Stok, DTF, Kalıp, Numune ve ileride eklenecek modüllerin ortak dosya altyapısıdır.

## 2. Çoklu firma kuralı

Bütün File Hub kayıtları ana firma/tenant bağlamında tutulur.

Zorunlu tenant alanı:

- `main_company_slug` (mevcut KY ERP tenant sözleşmesiyle uyumlu)

Hiçbir firma başka firmanın:

- depolama bağlantısını,
- klasör eşlemesini,
- dosya indeksini,
- dosya ilişkisini,
- senkronizasyon geçmişini,
- AI dosya arama sonucunu

göremez.

## 3. Depolama sağlayıcıları

Provider tipi sabit kod değildir; adapter tabanlıdır.

İlk desteklenecek tipler:

- `GOOGLE_DRIVE`
- `ONEDRIVE`
- `LOCAL_FOLDER`
- `NAS`
- `SHAREPOINT`
- `R2_CACHE`

Her firma sıfır, bir veya birden fazla bağlantı tanımlayabilir.

Örnek Hakan Emprime:

- Google Drive / Desinatör — Desen, DTF, model, yerleşim
- OneDrive / KY-ERP-MERKEZ — Muhasebe, İşNet, İK, işletme belgeleri

Başka firma yalnız OneDrive kullanabilir. Başka firma yalnız NAS kullanabilir.

## 4. Storage Connection

Her fiziksel kaynak ayrı bir bağlantıdır.

Alanlar:

- `id`
- `main_company_slug`
- `provider_type`
- `name`
- `is_active`
- `is_primary`
- `local_root_path`
- `remote_root_id`
- `remote_root_name`
- `sync_mode`
- `connection_status`
- `last_sync_at`
- `last_error`
- `created_at`
- `updated_at`

`local_root_path` yalnız Windows Agent kullanan bağlantılarda zorunludur.

## 5. Modül / amaç yönlendirmesi

Modüller fiziksel provider bilmez. Şu soruyu sorar:

> Aktif firmanın bu modül ve dosya amacı için hangi storage hedefi var?

Tablo: `file_hub_bindings`

Alanlar:

- `main_company_slug`
- `module_code`
- `purpose_code`
- `storage_connection_id`
- `root_path`
- `read_enabled`
- `write_enabled`
- `sync_enabled`
- `is_default`

Örnek:

| Modül | Amaç | Provider | Kök |
|---|---|---|---|
| DESEN | MODEL_IMAGE | Google Drive | `/Desinatör/görsel` |
| DESEN | MODEL_SOURCE | Google Drive | `/Desinatör/modeller` |
| DESEN | PLACEMENT | Google Drive | `/Desinatör/yerleşim dosyaları` |
| DESEN | OUTGOING_DESIGN | Google Drive | `/Desinatör/giden desenler` |
| DTF | RIP_PDF | Google Drive | `/Desinatör/DTF` |
| MUHASEBE | INVOICE | OneDrive | `/Muhasebe` |
| ISNET | E_DOCUMENT | OneDrive | `/Muhasebe/IsNet` |
| IK | PERSONNEL_DOCUMENT | OneDrive | `/IK` |
| BOYAHANE | RECIPE | Seçilebilir | Firma ayarı |

Yönlendirme sırası:

1. Modül + purpose binding
2. Modül default binding
3. Firma default storage
4. Hiçbiri yoksa yazma engellenir; rastgele hedef kullanılmaz.

## 6. File Asset — tek mantıksal dosya kaydı

Bir fiziksel dosya ERP içinde bir `FileAsset` kimliği alır.

Temel alanlar:

- `id`
- `main_company_slug`
- `logical_name`
- `file_name`
- `extension`
- `mime_type`
- `file_kind`
- `size_bytes`
- `sha256`
- `status`
- `created_at`
- `updated_at`
- `last_seen_at`

Durumlar:

- `AVAILABLE`
- `MISSING`
- `PENDING`
- `ERROR`
- `ARCHIVED`

Dosya Drive'dan kaybolursa ERP kaydı silinmez; `MISSING` olur.

## 7. File Location — aynı mantıksal dosyanın konumları

`FileAsset` ile fiziksel konum ayrıdır.

Tablo: `file_hub_locations`

Alanlar:

- `file_asset_id`
- `storage_connection_id`
- `provider_file_id`
- `relative_path`
- `location_role`
- `is_available`
- `size_bytes`
- `sha256`
- `modified_at`
- `last_seen_at`

Roller:

- `PRIMARY`
- `MIRROR`
- `ARCHIVE`
- `CACHE`
- `PREVIEW`

Google Drive ve OneDrive otomatik birbirine kopyalanmaz. Mirror yalnız açık bir firma politikası varsa yapılır.

## 8. File Relation — dosyayı ERP iş kayıtlarına bağlama

Bir dosya birçok kayıt tarafından kullanılabilir. Kopya üretmek yerine ilişki kurulur.

Tablo: `file_hub_relations`

Alanlar:

- `file_asset_id`
- `entity_type`
- `entity_id`
- `relation_type`
- `is_primary`
- `confidence`
- `source`
- `created_by`
- `created_at`

Entity tipleri örneği:

- `MODEL`
- `PRODUCTION_ORDER`
- `DYE_RECIPE`
- `DYE_JOB`
- `STOCK_ITEM`
- `LOT`
- `INVOICE`
- `DELIVERY_NOTE`
- `CUSTOMER`
- `SUPPLIER`
- `EMPLOYEE`
- `DTF_JOB`
- `SAMPLE`
- `OUTGOING_PACKAGE`

Kaynak:

- `AUTO`
- `AI_SUGGESTED`
- `MANUAL`
- `IMPORT`

## 9. Ortak dosya türleri

İlk sözlük:

- `MODEL_IMAGE`
- `SOURCE_PSD`
- `SOURCE_AI`
- `PLACEMENT_PDF`
- `RIP_PDF`
- `OUTGOING_DESIGN`
- `INVOICE_PDF`
- `INVOICE_XML`
- `DELIVERY_NOTE_PDF`
- `DELIVERY_NOTE_XML`
- `RECIPE`
- `TECHNICAL_SHEET`
- `QUALITY_DOCUMENT`
- `PRODUCTION_PHOTO`
- `QUALITY_PHOTO`
- `CUSTOMER_REFERENCE`
- `PERSONNEL_DOCUMENT`
- `CONTRACT`
- `PAYMENT_DOCUMENT`
- `GENERIC_ATTACHMENT`

## 10. Revizyon geçmişi

Dosya adı aynı kalıp içerik hash'i değişirse geçmiş kaybolmaz.

Tablo: `file_hub_revisions`

Alanlar:

- `file_asset_id`
- `revision_no`
- `sha256`
- `size_bytes`
- `provider_version_id`
- `modified_at`
- `discovered_at`

Böylece PSD / AI / PDF için eski-yeni sürüm ayrımı yapılabilir.

## 11. Senkronizasyon olayı ve audit

Tablo: `file_hub_events`

Olaylar:

- `DISCOVERED`
- `INDEXED`
- `MATCHED`
- `LINKED`
- `MOVED`
- `RENAMED`
- `UPDATED`
- `MISSING`
- `RESTORED`
- `UNLINKED`
- `DELETED`
- `PREVIEW_CREATED`
- `SYNC_ERROR`

Her olayda firma, storage, dosya, cihaz/agent, kullanıcı ve zaman tutulur.

## 12. Windows KY File Agent

Google Drive Desktop veya OneDrive Client ile yerel diskte görünen kökleri ortak Agent izler.

Agent tek firmaya sabit değildir. Config içinde çoklu bağlantı vardır.

Akış:

1. Dosya olayı yakalanır.
2. Dosya boyutunun stabil olması beklenir.
3. Dosyanın yazma kilidi kalkmış mı kontrol edilir.
4. Hash hesaplanır.
5. Provider / firma / relative path / metadata File Hub API'ye gönderilir.
6. API FileAsset ve Location upsert yapar.
7. Eşleştirme motoru çalışır.
8. Gerekirse preview üretimi kuyruğa alınır.

Yarım senkronize PSD/PDF indekslenmez.

## 13. Agent kimlik doğrulama

Normal kullanıcı oturumundan bağımsız uzun ömürlü cihaz anahtarı kullanılmalıdır.

- Anahtar firma + cihaz/agent bağlantısına bağlı olur.
- Düz metin secret DB'de tutulmaz; yalnız hash tutulur.
- Anahtar iptal edilebilir.
- Son kullanım zamanı kaydedilir.
- Agent endpointleri yalnız geçerli cihaz anahtarına izin verir.

## 14. Google Drive API / OneDrive API aşaması

V1:

- Google Drive Desktop + Windows Agent
- OneDrive Client + Windows Agent

V2 opsiyonel:

- Google Drive API
- Microsoft Graph / OneDrive API
- webhook / delta sync

V1'in veri modeli V2'ye geçerken değişmemelidir. Provider adapter sözleşmesi bunu garanti eder.

## 15. R2 görevi

Cloudflare R2 ana arşiv değildir.

R2 yalnız:

- thumbnail,
- WebP/JPEG preview,
- webde hızlı gösterilecek PDF cache,
- geçici türetilmiş dosya

için kullanılır.

800 MB PSD Drive'da kalabilir; ERP kartında küçük preview R2'den açılır.

## 16. Desen entegrasyonu

Desen için mevcut `desen-bridge` ve desen storage mantığı çöpe atılmaz. File Hub'a uyarlanır.

Örnek model `A-1254`:

- JPEG → `MODEL_IMAGE`
- PSD → `SOURCE_PSD`; webde açılmak zorunda değil, `VAR / MISSING` durumu gösterilir.
- Yerleşim PDF → `PLACEMENT_PDF`; uygulama içinden preview/açma.
- Giden desen → `OUTGOING_DESIGN`

Model kartı:

- Ana görsel
- PSD var/yok
- Yerleşim var/yok
- son revizyon
- giden paketler
- beraber gönderilen modeller
- üretim / boyahane ilişkileri

## 17. Giden desen / takım ilişkisi

Klasör bilgisi yalnız kaynak sinyalidir; kalıcı iş ilişkisi D1'de tutulur.

`OUTGOING_PACKAGE` entity'si:

- paket id
- firma/müşteri
- tarih
- kaynak klasör
- bağlı modeller
- bağlı dosyalar

A modeli aynı pakette B ve C ile gönderildiyse Asistan bunu D1 ilişkisinden cevaplar; her sorguda Drive taraması yapmaz.

## 18. İmalat entegrasyonu

İmalat kendi dosya deposunu kurmaz.

Üretim emri File Hub üzerinden:

- model görseli,
- PSD varlığı,
- yerleşim,
- teknik PDF,
- numune,
- üretim fotoğrafı,
- müşteri referansı

ile ilişki kurar.

Aynı model dosyası Desen + İmalat + Boyahane için tek FileAsset olabilir.

## 19. Boyahane entegrasyonu

Boyahane File Hub üzerinden:

- reçete,
- teknik föy,
- kalite fotoğrafı,
- numune fotoğrafı,
- model görseli,
- imalat yerleşimi

görebilir.

İlişki zinciri model → imalat → boyahane işi → reçete → lot/ürün olarak sorgulanabilir.

## 20. Muhasebe / İşNet / Paraşüt / Manuel entegrasyonu

Muhasebe sağlayıcısı ile dosya sağlayıcısı birbirinden bağımsızdır.

Örnek:

- Hakan Emprime muhasebe sağlayıcısı = İşNet
- Dosya sağlayıcısı = OneDrive

Başka firma:

- Muhasebe sağlayıcısı = Paraşüt
- Dosya sağlayıcısı = Google Drive

Başka firma:

- Muhasebe sağlayıcısı = Manuel/Excel
- Dosya sağlayıcısı = OneDrive

Fatura PDF/XML tek File Hub üzerinden tutulur. İşNet modülü kendi özel dosya altyapısını oluşturmaz.

## 21. İK entegrasyonu

İK belgeleri ortak File Hub'dadır ancak yetki izolasyonu daha sıkıdır.

Örnek dosyalar:

- sözleşme
- izin belgesi
- SGK belgesi
- eğitim belgesi
- personel evrakı

Ortak File Hub kullanılması bu belgeleri Desen veya Boyahane kullanıcısına görünür yapmaz.

## 22. Yetki modeli

Dosya erişimi şu üç kontrolün birlikte sonucudur:

1. Ana firma / tenant erişimi
2. Modül yetkisi
3. Entity / relation yetkisi

Yönetimsel File Hub ekranı yalnız owner/admin erişimlidir.

Modül içindeki ortak `EntityFilesPanel` normal kullanıcının yalnız erişebildiği entity dosyalarını gösterir.

## 23. Fiziksel silme güvenliği

İki işlem ayrıdır:

- ERP ilişkisinden kaldır
- fiziksel dosyayı sil

Varsayılan işlem fiziksel dosyayı silmez.

Fiziksel silme:

- ayrı yetki,
- açık kullanıcı onayı,
- audit kaydı

ister.

## 24. Eşleşmeyen dosyalar

Dosya kesin eşleşmiyorsa AI sessizce yanlış modele bağlamaz.

Durumlar:

- `AUTO_MATCHED`
- `SUGGESTED`
- `MANUAL`
- `UNMATCHED`
- `CONFLICT`

Örnek `son_final_yeni2.jpg`:

> Muhtemel model A-1254 — %93

Öneri kullanıcı onayına düşebilir.

## 25. Duplicate / rename / move mantığı

Öncelik:

1. Provider file ID
2. SHA-256
3. Path + size + mtime
4. Dosya adı / model kodu yalnız eşleştirme sinyali

Aynı hash başka path'e taşındıysa yeni iş dosyası üretmek yerine move/rename olarak değerlendirilebilir.

## 26. AI / KY ERP Asistan entegrasyonu

Asistan File Hub indeksini ve ilişkilerini sorgular. Her soruda fiziksel Drive taraması yapmaz.

Desteklenecek doğal dil örnekleri:

- `A-1254 modeli var mı?`
- `PSD'si var mı?`
- `Yerleşimini aç.`
- `A-1254 hangi modellerle takım olmuş?`
- `Bu firmaya geçen ay hangi desenleri gönderdik?`
- `PDF'si olup XML'i olmayan faturaları bul.`
- `Drive'da olup ERP'ye bağlanmamış dosyaları bul.`
- `PSD'si kayıp modelleri göster.`
- `Boyahanede reçetesi olup teknik dosyası olmayan kayıtları göster.`

AI cevabında kaynak provider, dosya durumu ve son görülme bilgisi verilebilir.

## 27. Uygulama arayüzü

Ana uygulama rail'inde owner/admin için ayrı bölüm:

`Dosya Merkezi`

Sekmeler:

1. Genel Bakış
2. Kaynaklar
3. Modül Bağlantıları
4. Dosyalar
5. Eşleşmeyenler
6. Eksik Dosyalar
7. Senkronizasyon
8. Dosya Geçmişi
9. AI Arama
10. Ayarlar

Aktif firma seçimi mevcut KY ERP üst bar şirket seçiminden alınır.

## 28. Her modülde ortak dosya paneli

Tek reusable frontend component:

`EntityFilesPanel`

Kullanım:

- Desen model detayı
- İmalat emri
- Boyahane işi / reçete / lot
- Muhasebe fatura / cari
- İşNet belge
- İK personel
- Stok ürün / lot

Panel:

- dosya listesi
- tür filtresi
- preview
- dosya var/yok
- kaynak provider
- son revizyon
- ilişki ekle/kaldır (yetkiye göre)

## 29. Ortak API sözleşmesi

Önerilen endpoint ailesi:

- `GET /api/file-hub/dashboard`
- `GET /api/file-hub/storage-connections`
- `POST /api/file-hub/storage-connections`
- `PATCH /api/file-hub/storage-connections/:id`
- `DELETE /api/file-hub/storage-connections/:id`
- `GET /api/file-hub/bindings`
- `PUT /api/file-hub/bindings`
- `GET /api/file-hub/files`
- `GET /api/file-hub/files/:id`
- `GET /api/file-hub/entity-files`
- `POST /api/file-hub/relations`
- `DELETE /api/file-hub/relations/:id`
- `GET /api/file-hub/unmatched`
- `GET /api/file-hub/missing`
- `GET /api/file-hub/events`
- `POST /api/file-hub/agent/heartbeat`
- `POST /api/file-hub/agent/ingest`
- `POST /api/file-hub/agent/missing`
- `POST /api/file-hub/agent-keys`
- `DELETE /api/file-hub/agent-keys/:id`

## 30. Sağlayıcı adapter sözleşmesi

Her provider aynı interface'i uygulamalıdır:

- `list`
- `stat`
- `readMetadata`
- `open`
- `write`
- `move`
- `delete`
- `getVersion`
- `health`

Modül kodunda Google/OneDrive özel branch yazılmamalıdır.

## 31. Sağlık ve senkron durumları

Storage bağlantı durumu:

- `ONLINE`
- `OFFLINE`
- `DEGRADED`
- `AUTH_REQUIRED`
- `PAUSED`
- `ERROR`

Dashboard sayıları firma bazlı gösterilir:

- toplam dosya
- bağlı dosya
- eşleşmeyen
- kayıp
- bugün yeni
- bugün değişen
- son senkron
- agent durumu

## 32. Mevcut sistemle geçiş

Mevcut çalışan modüller tek seferde kırılmayacaktır.

Geçiş sırası:

### Faz 1 — ortak çekirdek
- D1 File Hub tabloları
- ortak API
- storage connection + bindings
- agent auth
- dashboard

### Faz 2 — Desen adaptasyonu
- mevcut `desen-bridge` File Hub ingest kullanacak
- eski desen preview davranışı korunacak
- model ilişkileri FileRelation'a taşınacak

### Faz 3 — Muhasebe / İşNet
- PDF/XML dosyaları ortak File Hub kimliğine bağlanacak
- mevcut belge tabloları geriye dönük uyumlu kalacak

### Faz 4 — İmalat / Boyahane
- model/üretim/boyahane dosya ilişkileri ortak panelden açılacak

### Faz 5 — İK / Stok / diğer
- entity dosya paneli uygulanacak

Eski çalışan endpointler bir anda silinmez; compatibility adapter ile File Hub'a yönlendirilir.

## 33. Canlıya çıkış güvenliği

Bu çalışma doğrudan production'a yazılmaz.

- Feature branch: `codex/file-hub-multistorage-v1`
- Migration kontrolü
- Worker typecheck/build
- Frontend build
- API smoke test
- Tenant izolasyon testi
- Google Drive Agent test
- OneDrive Agent test
- Desen regressions
- İşNet regressions
- Boyahane regressions
- İmalat regressions
- İK regressions
- Draft PR / review
- Son onaydan sonra yayın

## 34. Kabul kriterleri

File Hub tamamlanmış sayılabilmesi için aşağıdakilerin tamamı çalışmalıdır:

1. Firma bazlı Google Drive seçilebilmeli.
2. Firma bazlı OneDrive seçilebilmeli.
3. Aynı firma ikisini birlikte kullanabilmeli.
4. Başka firma farklı provider düzenine sahip olabilmeli.
5. Modül + dosya amacı bazlı storage binding yapılabilmeli.
6. Dosya tek FileAsset olarak indekslenmeli.
7. Aynı dosya birden fazla ERP entity'sine bağlanabilmeli.
8. Dosya silinince ERP geçmişi kaybolmamalı.
9. Rename/move/version mümkün olduğunca korunmalı.
10. PSD var/yok görülebilmeli.
11. JPEG/WebP görsel preview açılabilmeli.
12. PDF uygulama içinden açılabilmeli.
13. Giden desen paketleri ve birlikte gönderilen modeller sorgulanabilmeli.
14. Muhasebe PDF/XML dosyaları aynı altyapıyı kullanmalı.
15. İşNet provider ile File Hub birbirine sabit bağımlı olmamalı.
16. Boyahane/İmalat/İK aynı File Hub API'sini kullanmalı.
17. AI File Hub indeksini sorgulayabilmeli.
18. Tenant izolasyonu geçmeli.
19. Yetkisiz modül dosyasına erişim engellenmeli.
20. Production değişmeden feature branch üzerinde tamamlanmalı.

## 35. Değişmez mimari kurallar

1. Dosyanın gerçek evi seçilen storage provider'dır.
2. KY ERP hiçbir sağlayıcıya sabit bağlı değildir.
3. Storage seçimi firma bazlıdır.
4. Bir firmada birden fazla provider kullanılabilir.
5. Modüller provider API'si değil File Hub API'si kullanır.
6. Bir fiziksel iş dosyası gereksiz modül kopyalarına bölünmez.
7. D1 metadata, ilişki, audit ve indeks tutar.
8. R2 ana arşiv değildir; preview/cache katmanıdır.
9. AI fiziksel diski kör taramaz; File Hub indeksini kullanır.
10. Dosya kaybolması iş kaydını silmez.
11. Fiziksel silme ile ERP ilişkisinden kaldırma ayrı işlemlerdir.
12. Bütün erişim tenant + modül + entity yetkisine tabidir.
13. Mevcut çalışan Desen/İşNet/Boyahane/İmalat düzenleri compatibility ile taşınır; toplu kırıcı yeniden yazım yapılmaz.

---

Bu belge File Hub geliştirmesinin mimari sözleşmesidir. Kod uygulaması bu kuralların dışına çıkmamalıdır.