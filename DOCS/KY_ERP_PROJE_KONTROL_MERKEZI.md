# KY ERP — PROJE KONTROL MERKEZİ

## 29.10.2026 — Yönetim ve Sistem işlemleri / açılır paneller (#483)

- Kullanıcı talebi: işlem kaldırmadan, anlaşılır ana menü ve açılır detaylar. `Platform Yönetimi` için Yönetim/Güvenlik/Sistem kartları ve açıklamalı alt işlem menüleri; firma kartı 6, paket 4 açılır panel. Kullanıcı listesi, rol matrisi, MFA/oturum, yedek, PDKS ve paket işlevleri korunur.
- Firma Denetim & Evrak Takibi, Yönetim ve Sistem'den Firma İşlemleri grubuna taşındı; COMPLIANCE yetkisi ve eski rotalar korunur. `DENETIM` PDKS okuma rolü firma evrak yetkisiyle karıştırılmaz.
- Firma Sahibi rolünde Süper Yönetici ekranları menüde gösterilmez. Firma sahibi ataması yalnız aynı firmadan yapılır ve onay gerekir. Güvenlikte başarısız kaynak boş liste gibi sunulmaz, kullanıcı sayacı normal kullanıcıları açıkça belirtir.
- Yönetim API: `/api/system/status` sayısal D1 verileri artık giriş gerektirir (anonim `/api/health` kalır). Paket profil+hareket güncellemeleri D1 batch üzerinden atomik. Firma açıklaması var olan `json_store` üzerinde atomik kaydedilir; migration yoktur.
- Build Merkezi eski PDKS 1.9.0/20260907 otomatik kaynağından çıkarıldı; ürün, sürüm ve kaynak dalı açık seçilir, sunucu da otomatik eski varsayım yapmaz. Windows Agent ve build script eşleşmesi gerçek EXE kabulünde ayrıca kontrol edilir.
- **Kabul sınırı:** PR testleri, canlı Pages ve Worker yayın SHA'sı ayrıca doğrulanır. D1 migration, gerçek kullanıcı/şifre/cihaz değişikliği, işlem yedeği geri yükleme ve EXE üretimi bu düzenlemede yapılmaz. Oturumlu rol/işlem E2E hâlâ ayrıca gereklidir.


## 29.10.2026 — Canlı saha ekranı gece vardiyası + rapor kabulü (#482)

- Kullanıcı canlı ekranları (Muhasebe Firma & Cari, Tedarikçi/Alış, Müşteri/Satış, Model ve Üretim Merkezi, Üretim Raporları, Makine/Vardiya) görüntüledi. Firma kartlarında 2 firma ve toplam 50.000 TL alacak; kanonik İmalat merkezinde 112 model; 6 makine; kayıtlı üretim/irsaliye yok. Bu sayıların birebir mali doğruluğu yetkili muhasebe kabulü olmadan teyit edilmedi.
- **Kural:** Gündüz ve gece makinacısı bağımsız. Gece makinacısı yalnız elle yazılan ayrı kayıttır. Gece adı boşsa gündüz makinacısı otomatik atanmaz; üretim fişinde elle yazılabilir. Mevcut kayıtlı gece adlarını sistem değiştirmez; kullanıcının güncellemesi gerekir.
- **Düzeltme:** Makine vardiya formu, normal üretim fişi, akıllı seri giriş, parser ve Worker'da gündüz→gece fallback kaldırıldı. 112 hedefi/üretimi olmayan model artık otomatik 112 eksik operasyon/açık parti sayılmaz.
- **PR #482 MERGED** SHA `31c0639dc24dcc71a9b32413ae52077bc58b8603`; [CI #40918033763](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40918033763) frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**.
- **Worker/API** [#40918328487](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40918328487) **SUCCESS**, D1 tam yedek + artifact, migration kapısı SKIPPED, schema kontrol, deploy ve `api.kyerp.net` health SUCCESS. Kaynak SHA `da555bc07f154cb1e32a676f5d07890a452ed0f9`; önceki #481 tenant/rol güvenliği de artık canlı kaynakta.
- **Pages/UI** [#40918384940](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40918384940) **SUCCESS**, canlı bundle smoke. Kaynak SHA `cc6fc0e11acbe2d1a34d3f99cbf247bb5622c4ff`. İki yayın commit soyunda #482 merge SHA için `behind_by=0`.
- **Saha kabul sınırı:** Bu otomatik test ve yayın, gerçek gece makinacısı isimlerinin doğru girildiğini, üretim fişi kaydını, alış/satış faturasını veya gerçek finans/LOT/İşNet işlemlerini kanıtlamaz. Var olan altı makinenin gece adları kullanıcının manuel düzenlemesine bırakıldı. D1 migration ve eski Excel veri importu yapılmadı.


## 29.10.2026 — İmalat rol/firma koruması #481, Worker yayın ENGELLENDİ

- **PR #481** (merge `20bada4b25870b5ab3656e8d4696df363edbd9a9`) `production-tenant-guard.ts` ve `main.ts` üzerinden `/api/production-center`, `/api/model-flow/*`, `/api/production/*`, `/api/imalat/kayitlar`, `/api/uretim/seri/*` yollarını oturum + `IMALAT` görüntüleme/ekleme/düzenleme/silme yetkisi + tek firma sınırıyla korur. Çapraz/eksik tenant ve izinsiz işlem reddedilir. Bu düzeltme önceki 24 görünüm auditinde fark edilmeyen kritik eksiktir. Gerçek istismar gözlenmedi.
- [PR CI #40896867570](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40896867570) **SUCCESS**: frontend ve Worker test/build. Gerçek rol oturumuyla E2E henüz yapılmadı.
- **Worker canlı yayını [#40897128218](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40897128218) BAŞARISIZ**, 1. deneme ve güvenli tek tekrar: `wrangler d1 export ky-erp-db --remote` aşamasında Cloudflare `internal error`. İlk D1 export ref `s6jco36imhdsjd6gibommcag`; tekrar ref `l11qk5ad8vs1a6ihu1t9vv0l`. Yedek zorunlu olduğundan **Worker deploy yapılmadı**, migration da yapılmadı. D1/veri bütünlüğü bozulduğuna ilişkin kanıt yok. Cloudflare D1 servisinde 29.10 günü yaşanan genel hatalar olası bağlantı ama kesin kök neden değildir.
- **Hâlen canlıdaki son başarılı Worker:** [#40892183913](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892183913) (PR #480). **Canlı Pages:** [#40892328950](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892328950) (PR #480). #481 güvenlik kodu **merge+CI PASS**, **henüz canlı Worker değil**.
- Öncelikli sonraki kapı: Cloudflare D1 tam export tekrar çalışır hale gelene kadar **yedeği atlama, Worker deploy yapma**. Yeni migration yok; eski Excel/2022 aktarımı yok. 24 görünüm gerçek yetkili saha kabulü hâlâ açık.


## 29.10.2026 — #480 canlı yayın doğrulaması

- PR #480 merge `da208e3619331a3a3d5e85d25b5a4f9f6dfce97e`. Canonical [CI #40891809902](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40891809902) Frontend + Worker SUCCESS.
- **Worker/API** [#40892183913](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892183913) SUCCESS; deploy source `1470cf7afa14b5e4bc57353712733b9ffc19d34b`; D1 tam backup artifact, yeni migration SKIPPED, schema read-only, Worker deploy ve `api.kyerp.net` health PASS.
- **Pages/UI** [#40892328950](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892328950) SUCCESS; deploy source `b067a516537d984765ed30ddb8c29a147c6f7a99`; Pages production, gerçek bundle/Günlük Operasyon chunk smoke PASS.
- **Ancestry:** PR merge SHA → Worker ve Pages compare ikisinde de `behind_by=0`. #480 kodu iki canlı kaynakta da mevcut.
- **Açık:** 24 bölüm görünümünün yetkili gerçek kullanıcı ve finans/LOT/İşNet/makine/yerleşim uçtan uca saha kabulü *BEKLİYOR*. CI/PAGES/WORKER success bu kabulün yerine geçmez. 2022/Excel aktarımı ve test için veri oluşturma YAPILMADI.


## 29.10.2026 — DÖRT MODÜL 24 GÖRÜNÜM SON RÖTUŞ (#480)

- Kullanıcı kararı: tüm bölümleri ve sekmeleri ayrı ayrı kontrol et, tasarım/işlem/ortak ilişkiler kullanımda bitir; 2022 ve eski Excel aktarımına odaklanma.
- **PR #480 MERGED** squash SHA `da208e3619331a3a3d5e85d25b5a4f9f6dfce97e`; [CI #40891809902](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40891809902) Frontend lint/test/build ve Worker typecheck/test/build SUCCESS. [24 ekran saha kaynak/kabul matrisi](KY_ERP_24_EKRAN_DORT_MODUL_SAHA_KABUL_2026-10-29.md).
- **İmalat:** pasif makineler ayarlarda görünür/yeniden aktif olabilir, yeni fiş sözlüğünde pasifler yok; eski `/imalat/rapor` ve `/imalat/denetim` yerine kanonik model-flow + makine verisinden rapor ve filtre; modelin tüm baskı bölgeleri bitmeden tamamlanmış saymama; fişe zemin ekleme ve düzenleme, makine/vardiya/makinacı raporu; geçmiş CSV günlük ana menüde ikincil.
- **Muhasebe/e-Belge:** Müşteri irsaliyesi/fatura kontrol çekmecesinden irsaliye/fatura kanonik belge ID'sine doğrudan geçiş, boş ana firma etiketinde varsayılan sahte şirket adı yok.
- **Güvenlik/veri:** 0062 D1 migration 26.10.2026 uygulanmıştı. Bu PR herhangi D1 migration, gerçek fatura/ödeme/LOT/İşNet kaydı veya tarihsel üretim aktarmadı; yalnız kod ve test.
- **Açık gerçek saha kabulü:** 7 Muhasebe+9 e-Belge+3 İmalat+5 Desen kullanıcı oturumu/rol, finans, İşNet, LOT, cihaz ve görsel E2E **BEKLİYOR**. CI ve Pages/Worker sağlık kanıtı bu işletme işlemlerini kanıtlamaz. Yayın durumu yalnız gerçek Actions sonucuyla kaydedilir.


## 29.10.2026 — PR #479 DÖRT MODÜL CANLI YAYIN KANITI

- **PR #479** birleştirildi; squash SHA `1c40638517a07de9aa053206fd1f64bb889832be`. [Canonical CI #40888419009](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888419009) SUCCESS (Frontend lint/test/build, Worker typecheck/test/build).
- **Worker production** [#40888953951](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888953951) SUCCESS; deploy kaynak SHA `079c3fb1e2835757306aad4ea7e26b9a260a8c39`; canlı D1 tam backup/artifact, migration adımları SKIPPED, read-only schema, api.kyerp.net health PASS.
- **Pages production** [#40889288736](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40889288736) SUCCESS; deploy kaynak SHA `631eafa5fd0e67c0741d27107e8096ca86094c50`; canlı Pages deploy, public uygulama bundle ve Günlük Operasyon chunk smoke PASS.
- **Ancestry teyidi:** birleşim SHA'nın hem Worker hem Pages deploy SHA'sına karşı compare sonucu `behind_by=0`. Modül değişiklikleri canlı yayınlanan kaynaklarda mevcuttur.
- **İş kapsamı:** Muhasebe satış/alış belge listelerinden e-Belge detayına geçiş; e-Belge değişikliklerinden sonra Muhasebe/İmalat yenileme; Desen modelini kanonik kimlikle İmalat'a açma; İmalat fişi düzenleme/arşiv, üretim planı, kanonik makine/vardiya API ve pasifleştirme; yanlış model/firma eşleşmesini engelleme.
- **Kullanıcı kararı:** 2022 ve eski Excel veri aktarımı öncelik dışı; hiç gerçek tarihsel kayıt import edilmedi. **Ek D1 migration yok, gerçek fatura/İşNet gönderimi yok.** 26.10.2026 0062 migration zaten uygulanmıştı. Gerçek yetkili firma kullanıcı oturumu, bankacılık/LOT/İşNet fiziksel saha E2E ve 19 sekmenin nihai iş kabulü bu otomatik yayın/CI kanıtıyla **PASS sayılamaz**.


## 29.10.2026 — Muhasebe / e-Belge / İmalat / Desen günlük işlem bağlantıları (#479)

- **Kullanıcı kararı:** 2022 ve eski Excel kayıtlarının toplu aktarımına odaklanma; dört bölümün günlük işlemleri ve ortak Desen→Model→İmalat→İrsaliye/Fatura→Muhasebe tutarlılığı öncelikli. Eski satırlar canlı D1'e aktarılmadı.
- **PR #479 MERGED** (squash SHA `1c40638517a07de9aa053206fd1f64bb889832be`); [CI #40888419009](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888419009) Frontend lint/test/build + Worker typecheck/test/build SUCCESS.
- **İmalat:** fiş düzenleme/arşiv geçmişi ve CAS; model planında hedef adet/sipariş/zemin güncellemesi; makine/vardiya ekranı Worker kanonik API'sine geçirildi, makine durumu D1 raw'da korunur, pasifler yeni fişte seçilmez; yıl filtresi.
- **Desen:** Model Havuzu'ndaki kayıtlar kanonik designModelId ile tek tık İmalat'a aktarılır. Farklı kimlikli modeller aynı ad nedeniyle karıştırılmaz. Belirsiz firma otomatik başka cariye atanmaz.
- **Muhasebe/e-Belge:** tedarikçi irsaliyesi/satış faturası satırından belge detayına doğrudan açılış; belge, satır, eşleşme ve yükleme değişikliklerinden sonra ilgili muhasebe/imalat ekranlarının yenilenmesi; model–belge eşleşmesinde farklı firma/sipariş karışmasını önleyen fail-closed kontrol.
- **D1 fiziksel 0062** önceki 26.10.2026 tarihinde canlıya uygulandı (kanıt: #40279707049); ek D1 migration izni açılmadı. İşNet resmî gönderimi veya test için canlı finans/üretim mutasyonu yapılmadı.
- **Yayın ve sınır:** Kaynak merge CI PASS'tir; Pages/Worker gerçek production release ve oturumlu saha E2E ayrıca kayıtla doğrulanmadan "tam canlı"/"19/19 kabul" denemez.


## 26.10.2026 — UI tek kanonik düzen canlı yayın (#475)

- **Kaynak:** [PR #475](https://github.com/cetin60kaya-lgtm/ky-erp/pull/475) MERGED, SHA `56743bd5bc2cfc88f5cb1c88bbe462e353a774fa`. [CI #40290927030](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40290927030) **SUCCESS** (Frontend lint/test/build + Worker typecheck/test/build).
- **Pages production:** [#40291172237](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40291172237) **SUCCESS**, deploy SHA `ec13ee38d70fed3fbf59f4651f7e6d4189639bed`. Build, Cloudflare Pages production deploy, live entry JS ve Gunluk Operasyon chunk SHA smoke PASS. PR merge SHA, deployed Pages commitinin atasi (`behind=0`).
- **Tek kanonik menu:** Gunluk Isler → Personel Yonetimi; IK Aylik, Gunluk Operasyon, PDKS; ayni tasarim renk/aktif menu/ikon. Ortak shell'de altı gorunen sekme, aktif sekme ve Diger Sekmeler listesinden kapatmadan geri ulasim.
- **Ekranlar:** IK Aylik tekrar basligi azaltildi ve finans islemleri katlanir; Gunluk Personel Girisi tarih/personel/Excel gruplandi ve bos secim yonlendirildi; e-Belge firma etiketi ve kontrol/eslesme KPI gecisleri duzeltildi. Yeni hotfix CSS katmani olusturulmadi, mevcut kaynaklar duzenlendi.
- **Sinir:** Bu sadece Frontend UI yayini; Worker/D1, stok, finansal/PDKS/IK bordro hesaplari degistirilmedi. Kimlik dogrulanmis masaustu 1366×768/1920×1080 ve mobil gercek kullanici görsel kabul testi henuz yapilmadi.



## 26.10.2026 — CANLI D1 0062 MIGRATION TAMAMLANDI (GUNCEL KARAR)

- **Schema canli:** Yalniz `0062_accounting_physical_receipt_journal.sql` production `ky-erp-db` D1'e kontrollu uygulandi. [Worker migration/yayin #40279707049](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279707049) SUCCESS; oncesinde tam D1 yedegi (20.8 MB Actions artifact), salt-okunur on kosul ve sonrasinda **2 tablo + 4 index + 1 trigger + 7 alan** PASS, baslangic journal kaydi sifir. Worker deploy/API health PASS.
- **Onay tuketildi:** [PR #474](https://github.com/cetin60kaya-lgtm/ky-erp/pull/474) migration gate merged, [CI #40279521273](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279521273) SUCCESS. Ardindan `applyMigrations=false`, `applyPhysical0062=false`, `migrationApprovedByUser=false` sabitlendi; [Worker izni kapali tekrar yayin #40279954615](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279954615) SUCCESS ve butun migration adimlari SKIPPED.
- **KAPSAM:** Basarili olan is D1 0062 schema ve production Worker/API yayinidir. Gercek banka, cari, e-Belge kesin kayit, fiziki LOT, Boyahane, ISNET resmi gonderim ve 19 sekmenin oturumlu saha E2E yapilmadi; yeni real data deneme kaydi olusturulmadi. Bu nedenle 19/19 saha kabul PASS degildir.
- Asagidaki eski 0062 "onay bekliyor" satirlari tarihsel release durumlarini gosterir; en guncel karar bu bolumdur.



## 26.10.2026 — PR #472 yayın kanıtı (production 0062 migration SKIPPED)

- **Worker [#40277506081](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40277506081)** SUCCESS, deploy SHA `1ef3348135db1395bad86c51735fa1b191c84f0e`, canlı D1 tam export+artifact, read-only schema, Worker deploy ve API health başarılı; migration adımları **SKIPPED**.
- **Pages [#40277548177](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40277548177)** SUCCESS, SHA `bd1343cf7b5e1bfe460b2d50a1fe708f83df7001`, production Pages ve public bundle/Günlük Operasyon chunk smoke başarılı.
- PR #472 merge `3faa926730c6525c913603ca2f5a409d45fb6c90` her iki deploy SHA'nın atasıdır: karşılaştırmada `behind=0`.
- **Zorunlu gerçek saha kapısı**: kullanıcı ayrı açık izin verip migration `0062_accounting_physical_receipt_journal.sql` kontrollü production D1'e uygulanana kadar physical receipt/journal canlı finalize *hazır değildir*, `PHYSICAL_SCHEMA_APPROVAL_REQUIRED`. Gerçek İşNet, ödeme, stok ve makine üretim yazıları test edilmedi; 19 sekmenin yetkili kullanıcı oturumu E2E PASS değildir.


## 26.10.2026 — Fiziksel e-Belge/LOT/Boyahane journal kod kabulü #472 (migration ayrı onay)

- [PR #472](https://github.com/cetin60kaya-lgtm/ky-erp/pull/472) canonical source merge `3faa926730c6525c913603ca2f5a409d45fb6c90`, CI [#40251063644](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40251063644) SUCCESS (Worker+Frontend).
- `migrations/0062_accounting_physical_receipt_journal.sql`: **yalnız ilaveli D1 journal/lease/unique/check**, prodda APPLY ETME — kullanıcı ayrı migration izni yok. R2 0036 arşiv kuyruğu ayrıdır.
- `src/accounting-physical-journal.ts`: stok `stock_movements` ve Boyahane `json_store` canonical nesnelerine yazma, kalıcı tenant+fiziksel-satır+ürün+tedarikçi+normalize LOT kimliği, payload hash ve lease, `db.batch()` ile atomik stok hareketi/LOT/journal, bozuk/eski kayıt inceleme, kalıcı retry/restart işleyici. Stok ikinci kez artmıyor.
- Fiziksel irsaliye→fatura maliyet bağlama ikinci stok hareketini yaratmıyor; çoklu LOT ve provisional uzlaşma yalnız desteklenen/doğrulanan kanıtta, belirsiz eski geçmişte inceleme kapısı korunuyor. Mevcut e-Belge Onay/Sorunlar üzerinde kuyruk ve hata/deneme durumları; onaylı ortak HTML değiştirilmedi.
- `accounting-physical-journal.test.ts` + `accounting-physical-final-integration.test.ts`: gerçek `node:sqlite` 0062 migration iki kez, 20/100 paralel istek, LOT, stok/fatura/KDV, DB hata rollback, retry, tenant ve legacy kontrolleri. Otomatik CI geçişi **canlı D1 gerçek işletme yazma testi değildir**.
- **Açık blokaj:** production D1 üzerinde 0062 ayrı açık izinle uygulanmadıkça `PHYSICAL_SCHEMA_APPROVAL_REQUIRED`, fiziksel kesin kayıt fail-closed. Yetkili gerçek İşNet/irsaliye/Boyahane, iki PC, 19 sekme oturum/rol/banka/cihaz E2E henüz yapılmadı. Bunlara PASS yazılmaz. Onaylı eski #443–#468 kodu korundu.


## 26.10.2026 — KY ERP PRO v4.2.1 tek ekran / kesintisiz telefon onayı
- Kullanıcı hata bildirimi: onay sonrası ERP tekrar giriş istiyordu; ayrı Güvenlik sayfası React giriş akışını sonlandırıyordu.
- Çözüm PR #473, merge de0988a3a09a6f87bd5b74e2dbd57083cfea7847: aynı mobil React ekranında SELF_LOGIN challenge, 2 haneli eşleştirme, WebAuthn PIN/biyometri, sunucu doğrulamalı ECDSA V2 kararı; AuthContext yeni ERP oturumunu aynı ağaçta açar.
- Kurulu tek PWA ID/scope /guvenlik/ ve cihaz DB kyerp-security-fresh-v3 korunur; bağlı telefon /guvenlik/pro/ tek uygulama merkezine yönlendirilir. Bildirime dokununca çalışan ERP ekranı yeniden yüklenmez; ERP auth süresi dolsa bile cihaz imzalı güvenlik onayı yapılır. Açık ERP formu güvenlik bölümüne geçerken unmount edilmez.
- Güvenlikte onay, kod, oturum, cihaz, log, not ve mesajlar tek React çalışma alanında. Pages ve API iş mantığı ile aynı canonical kaynak.
- CI SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40252895682; Security Worker canlı SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40253054313; Pages canlı SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40253081393.
- Fiziksel Android kendi giriş + PIN + gerçek push + açık ERP işlem geri dönüşü kullanıcı cihazında henüz doğrulanmadı. Uygulama silinmeyecek; canlı veritabanı migration yok.


## 26.10.2026 — KY ERP PRO v4.2.0 TEK ANDROID PWA / CANLI WEB KABUL
- **Kullanıcının nihai kararı:** Kendi telefonunda **tek KY ERP PRO**. Canonical install ID/start_url/scope `/guvenlik/` ve güvenilir cihaz IndexedDB `kyerp-security-fresh-v3` ile mevcut P-256 imza anahtarı ve push SW korunur. Ayrı ikinci ERP veya güvenlik ikonu oluşturulmaz. Firma müşterilerinin KY Firma v4.1.0 uygulaması ayrı ürün olarak korunur.
- [PR #471](https://github.com/cetin60kaya-lgtm/ky-erp/pull/471) birleştirildi; merge `11e98747a5aa5cff9ae6d6e9ed2efb5db78d064d`. Yeni ERP çalışma alanı **`https://security.kyerp.net/guvenlik/pro/`**; aynı origin ve tek PWA kapsamı. Tam mevcut `AppV3`, `MODULES/getModuleTabs`, mevcut AuthProvider MFA/telefon onayı ve gerçek modül kodu Security Worker statik varlıklarına **ayrı Vite entry build** ile derlenir. Android alt çubuk, hızlı güvenlik erişimi, gerçek modül kartları, arama ve tüm sekmelerin açılır listesi var. Eksik modüle göstermelik ekran oluşturulmaz; yetkiler backend ve mevcut UI RBAC kapsamındadır.
- **CI sonucu:** [UI acceptance #40249665385](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40249665385) SUCCESS: frontend lint/test, normal Pages build, tam PRO build ve Cloudflare Worker dry-run. [Pages #40249886468](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40249886468) SUCCESS. [Security Worker #40250147392](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40250147392) SUCCESS: hem API/sürüm/doğrulama hem `/guvenlik/` 200 / `<title>KY ERP PRO v4.2.0</title>`, manifest 200, SW 200, `/guvenlik/pro/` 200, `/guvenlik/pro/ik/personel-kartlari` 200; `/ky-firma/` 200, eski `/ky-sistem/` 308 ve `/security/` 410.
- **Sınır**: Gerçek Android cihaz üstünde biyometri, canlı push, gerçek oturum, tüm modüllerin her CRUD aksiyonu ve ekran görüntüsü/scroll testi henüz ayrı ayrı gerçekleştirilmedi; kod/HTTP/CI başarıları bu E2E kabulünün yerine geçmez. Kullanıcı eski uygulamayı **silmeyecek**; mevcut PWA aynı kimlikle güncellenecek. Canlı D1 veri migrasyonu/iş verisi değiştirilmedi.
- Eski [PR #470](https://github.com/cetin60kaya-lgtm/ky-erp/pull/470) birleşik ürün kararı nedeniyle **kapalı**, prod'a merge edilmedi.


## 26.10.2026 — KY Güvenlik v4.1.0 tek PWA TAM CANLI WEB KANITI
- [PR #466](https://github.com/cetin60kaya-lgtm/ky-erp/pull/466) merged `8abdb7d99078e37aa0b810c538a2621de4fcfcf2`; [CI #40243582440](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243582440) SUCCESS. [Cloudflare Pages #40243835815](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243835815) SUCCESS, SHA `920c138a8fad043c3c651aeff4c61c2556fe03e0`, PR #466 atası (compare behind=0).
- [PR #469](https://github.com/cetin60kaya-lgtm/ky-erp/pull/469) merged `569198eb926a19fdba4987c9ad8ddb5d1fa409f7`; [CI #40244411439](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40244411439) SUCCESS. Cloudflare Worker static assets `html_handling: none` 307 self-redirect loop kök çözümü. [Security Worker #40244530715](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40244530715) SUCCESS SHA `882b809339b34130a13ed00bbd42e5f32603da8f`, PR #469 atası (behind=0).
- **Gerçek canlı HTTP**: `/guvenlik/` 200 ve `<title>KY ERP Güvenlik v4.1.0</title>`; `/guvenlik/manifest.webmanifest` 200; `/guvenlik/sw.js` 200; `/guvenlik/app.js` 200; `/ky-firma/` 200; `/ky-firma/manifest.webmanifest` 200; eski `/ky-sistem/` 308 -> `/guvenlik/`, eski `/security/` 410. API kodsuz enrollment ve relink koruması doğru `SECURITY_ENROLLMENT_CODE_REQUIRED`.
- **Kalıcı tek uygulama kuralı**: telefondaki mevcut `/guvenlik/` PWA aynı manifest id ve cihaz DB ile güncellenir; ikinci owner PWA kurulumu veya telefonu hemen silme yoktur. Firma sahibi ayrı `/ky-firma/` PWA. Canlı D1 iş verisine dokunulmadı.
- **Henüz kabul edilmeyenler**: kullanıcının fizikî Android telefonunda kurulu ikon açma, biyometri, push-onay, arka plan bildirimi ve gerçek oturum E2E testi. Finans/İK/İmalat ayrıntılı mobil owner iş analizi tamamlanmış değildir. Bu başlıklarda **tam telefon kabulü YOK**, web deploy SUCCESS.


## 26.10.2026 — Son kesin kayıt / İşNet sertleştirme PR #468 (Worker canlı)
- [PR #468](https://github.com/cetin60kaya-lgtm/ky-erp/pull/468) merged `fc1a5fbb5bc05d64ff8b51baa6f89d436d498285`. [CI #40243561868](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243561868): Frontend ve Worker SUCCESS.
- Kesin kayıt sırasında `FINALIZING/APPROVED/FINALIZE_RETRY` belgeye dış PATCH, tekil/toplu eşleştirme kilidi eklendi; PATCH transaction sonrası etkilenen satır denetimli. Finalizasyon içi yetkili eşleştirme korunur. İşNet HTTP 200 ancak boş veya doğrulama yapısı olmayan cevap artık BAĞLI değil `UNVERIFIED`.
- [Son Worker production #40243691172](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243691172) SUCCESS SHA `1eb82c38f259a48f666edc6c74715c3b951cb2f7`: tam D1 yedeği, artifact, migrations SKIPPED, salt-okunur schema, Worker deploy ve canlı API health PASS. PR #468 merge SHA atası: `behind=0`.
- Son frontend runtime değişikliği önceki [Pages #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537) SUCCESS SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`; PR #468 yalnız Worker + test değiştirdiğinden yeniden Pages dağıtımı gerekmedi.
- Kalan P0 engel: fiziksel STOCK/BOYAHANE/LOT kesin kaydında dayanıklı atomik outbox/recovery hâlâ eksik; fail-closed koruması devam ediyor. Rol/tenant oturumlu E2E, gerçek İşNet/banka/makine testleri yapılmadı; production migration izni verilmedi. **19/19 tam saha kabul PASS değil.**


## 26.10.2026 — KY Güvenlik v4.1.0 tek kalıcı telefon uygulaması
- **Yeni kullanıcı kararı:** Birden fazla sistem sahibi uygulaması yok. Tek canonical ve aynı PWA kimliği **`/guvenlik/`** (`security.kyerp.net`). Ayrı `/ky-sistem/` ve `/owner-security/` sistem sahibi paketleri kaldırıldı; eski `/ky-sistem/` navigasyonu mevcut güvenlik uygulamasına taşınır, eski service worker emekli edilir. **Firma sahipleri** için ayrı `/ky-firma/` korunur. Çalışanlar mevcut yetkili KY ERP'yi kullanır.
- Tek güvenlik uygulamasında **v4.1.0** arayüz etiketi, mevcut Süper Yönetici kontrol ekranında özet sayaçlar, ayrı kurulum çağrısının kaldırılması; güvenli cihaz veritabanı `kyerp-security-fresh-v3`, manifest id `/guvenlik/` ve API güvenlik protokolü `security-v4.0` korunur. İki bağımsız sahip PWA paketinden 12 dosya silindi. Muhasebe/İK/İmalat ayrıntılı iş analizi ayrı geliştirme maddesi olarak açıktır.
- Kod ve yayın kabul değişiklikleri: [PR #466](https://github.com/cetin60kaya-lgtm/ky-erp/pull/466), `fix/security-dual-app-release-verification-20261026` dalında; CI/merge/Cloudflare Worker-Pages yayın SHA'sı ve gerçek Android telefon kabulü doğrulanmadan **canlı/tamamlandı denmez**. Cihaz bağlantıları doğrulanmadan mevcut telefon uygulaması silinmez. Bu çalışma canlı D1 verisine dokunmaz.



## 26.10.2026 — Muhasebe + e-Belge/İşNet + İmalat P0 final risk release kanıtı
- [#463](https://github.com/cetin60kaya-lgtm/ky-erp/pull/463) ödeme defteri conditional D1.batch (20/100 SQLite, rollback) CI [#40225228760](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225228760) PASS; [#464](https://github.com/cetin60kaya-lgtm/ky-erp/pull/464) üretim requestId DB-PK + fiş/link tek transaction (20/100 SQLite, link rollback) CI [#40225824087](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225824087) PASS.
- [#465](https://github.com/cetin60kaya-lgtm/ky-erp/pull/465) kesin kayıt CAS + gerçek user.id/sürüm/checkbox ve İşNet salt-okunur provider sağlık kontrolü, CI [#40226730180](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40226730180) PASS; [#467](https://github.com/cetin60kaya-lgtm/ky-erp/pull/467) fiziksel stok etkisi olmayan faturanın cari+bakiye+defter+KDV+POSTED kaydı tek D1 batch (20/100 SQLite, hata enjeksiyonu), CI [#40242596733](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242596733) PASS.
- [Worker production #40242759411](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242759411) SHA `39b4558b48e22dc49a3dd8e556e0f975acf2a27b`: SUCCESS, tam D1 yedek artifact, read-only schema ve API health, migration SKIPPED. [Pages production #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537) SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`: SUCCESS, gerçek Pages deploy ve public JS bundle smoke. PR birleşimleri her ikisinde atadır (behind=0).
- **Kritik açık:** fiziksel stok/LOT/Boyahane + muhasebe kesin kayıt tek transaction/outbox ve recovery henüz yok. Şu anda bu belgeler için `PHYSICAL_RECEIPT_ATOMICITY_REQUIRED` açık güvenli bloke (POSTED olmaz). Üretim D1 migration onayı yok; gerçek İşNet bağlantı oturumu, resmî gönderim, banka/ödeme, yetkili kullanıcı/browser ve gerçek üretim/Windows testleri yapılmadı. 19/19 saha E2E hâlâ BEKLİYOR; [tek 19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Onaylı HTML, KY Güvenlik, İK ve Günlük Operasyon değiştirilmedi.


## 25.10.2026 — KY Güvenlik / KY Firma ayrı mobil uygulama production release talebi
- Kullanıcının onayladığı mimari: **Sistem Sahibi** ayrı `/ky-sistem/` PWA (SYSTEM + ownerControlAuthorized), **Firma Sahibi** ayrı `/ky-firma/` PWA (COMPANY + companyApprover), çalışanlar mevcut `kyerp.net` yetkili ERP.
- [PR #458](https://github.com/cetin60kaya-lgtm/ky-erp/pull/458) merged `302cad6cf7c3fce19d0fdf489d451445ff003451` (CI #40223334141 SUCCESS). [PR #460](https://github.com/cetin60kaya-lgtm/ky-erp/pull/460) merged `a326e84f2ec0b6aa4b725ef183738e80ef0aa6d5` (CI #40223947320 SUCCESS). Ayrı manifest, PNG ikon, SW/push scope, telefonla onay, imzalı oturum kapatma, tek kullanımlık kod; kritik işlemlerde PIN yoksa fail-closed.
- Security host /guvenlik eski cihazları korur; yeni allowlist /ky-sistem, /ky-firma ve /ky-app-shell, legacy 410 kuralı bozulmaz. D1 migration yok, kişisel veri/şifre yazılmadı.
- **Release bildirimi**: mevcut tek frontend release kayıt dosyası ve security-trigger üzerinden açıldı. Cloudflare Pages / Security Worker canlı kanıtları ve Android Chrome telefon kabulü ayrı doğrulanacak. Canlı E2E hazır ilan edilmez. Finans/İK/İmalat detay analizi için ayrı yetkili ERP oturumu gerekir; yeni mobil panelin doğrudan iş veri analizi sonraki iştir.


## 25.10.2026 — 19 sekme kod/CI/production yayın kanıtı (en güncel)
- **Muhasebe [#453](https://github.com/cetin60kaya-lgtm/ky-erp/pull/453)** merged `f3e0d9ea32ef91982a5b98ab61fca22c285d7962`, CI #40220091676 SUCCESS: yönetim seçili dönem/KDV; cari VKN-duplicate/alias; DELETE fail-closed; kümülatif ödeme geriye kayıt 409.
- **e-Belge [#455](https://github.com/cetin60kaya-lgtm/ky-erp/pull/455)** merged `43d0c0822a6961474c2436c55bcaa2544ef8f35f`, CI #40220688716 SUCCESS: kaynaklı İşNet ve adaptör durumu, 0/1/50/100/101+ sayfalama, tenant geçişi, hatalı tarih ve POSTED yeniden düzenleme koruması.
- **İmalat [#456](https://github.com/cetin60kaya-lgtm/ky-erp/pull/456)** merged `8d7c355a93483d27536676d235e18a1e30a1513e`, CI #40221156414 SUCCESS: varsayılan firma yok, çift fiş aynı bulk engeli, stabil requestId, stale GET ve 101+.
- **19 ekran kaynak kontratı [#457](https://github.com/cetin60kaya-lgtm/ky-erp/pull/457)** merged `705307a000f689b911e7ec1c9273007ac73dfc4f`, CI #40221600062 SUCCESS: mevcut onaylı 7+9+3 rota/JSX/servis bağlantıları 19 ayrı otomatik test. **Gerçek kullanıcı E2E değildir**.
- **[Worker canlı #40221347939](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221347939)** SUCCESS SHA `cc06539f270db75a6baef39aaa950d759aaa6e8d`: tam D1 backup+artifact, schema, canlı API sağlık PASSED; migration **SKIPPED**.
- **[Pages canlı #40221736227](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221736227)** SUCCESS SHA `fccc143b66477da6ffdea1c57c6ece7d013fc9f6`: Pages dağıtımı, public bundle ve Günlük Operasyon chunk smoke PASSED. #453/#455/#456 her iki release atası, #457 Pages atası (compare behind=0).
- 19 sekme HTML düzeni değişmedi. **İş/rol/İşNet/fiilî ödeme/gerçek üretim fişi, 1366×768/1920×1080/mobil browser ve Windows Excel TSV E2E onayı yok**; üretim D1'de test mutasyonu yapılmadı. Bu nedenle **19/19 tam kullanım kabulü KISMİ**. Güncel tek karar ve 8 sütunlu [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Alt kısımlardaki eski PR bekliyor ifadeleri tarihsel olup bu kayıt üstündür.


## 25.10.2026 — Uygulama üst şerit profil/sekme çakışması düzeltmesi
- Kullanıcının canlı 1649×929 ekran görüntülerinde SY / Sistem Yöneticisi profil alanı açık sekmelerin üzerine taşıyordu. Kök neden `responsive-core.css` içindeki PC profil düğmesine verilen genel `display:block !important` kuralı ve PC grid satırı 58px / onaylı üst şerit 64px uyuşmazlığı.
- PC profil düğmesi flex olarak sabitlendi; üst çubuk, sekmeler ve breadcrumb grid satırları eşitlendi. Uzun sekmeler yatay kayar ve kontrollü ellipsis kullanır; 3 kaynak regresyon testi eklendi. Veri, giriş güvenliği, MFA, İK veya PDKS iş kuralları değiştirilmedi.
- Kaynak PR/CI/Cloudflare Pages sonucu ayrı kanıt olarak doğrulanacaktır; kodun birleştirilmesi tek başına canlı kabulü değildir.

## 25.10.2026 — e-Belge toplu eşleştirme açık onay PR #451 CANLI
- [PR #451](https://github.com/cetin60kaya-lgtm/ky-erp/pull/451) merged `e2b7654daa207f209f08e713e7861ee0532898ba`, canonical CI [#40215686365](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215686365) frontend+Worker **SUCCESS**.
- e-Belge Havuz/Eşleşmeler toplu kontrolü öncesinde etkisinin mevcut filtreli sayfa değil seçili ana firmadaki uygun açık faturalar (bir seferde max 500) olduğu açıklanır; checkbox + ayrı onaydan önce `reconcile-all` POST gönderilmez. Ref tabanlı çift istek kilidi ve kısmi hata sayısı görünür. e-Belge bugün tarihi tarayıcının yerel takviminden alınır (UTC kayması düzeltilir). Bu PR Worker/D1 migration/resmî İşNet gönderimi yapmadı.
- [Cloudflare Pages production #40215803908](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215803908) **SUCCESS** SHA `0d421463de6def6d02f90a0516a21d547db39db0`; PR merge yayın SHA atası (behind=0); gerçek Pages deploy ve public bundle/Günlük Operasyon chunk smoke PASS.
- **Gerçek veri ile toplu eşleştirme / İşNet gönderim / mobil yetkili browser kullanıcı kabulü ayrı bekliyor.** 19/19 sekme saha E2E PASS iddiası yok. [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md).


## 25.10.2026 — Muhasebe + İmalat aktif kullanım güvenlik/fonksiyon paketi PR #450 CANLI
- **[PR #450](https://github.com/cetin60kaya-lgtm/ky-erp/pull/450)** merged `84e93e53f94550e00a189838b1db4abab3c6c64e`. Canonical UI CI [#40214924202](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40214924202) frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**.
- **Muhasebe/Ekstre:** `ReconciliationPanel` cari dönemi ve iki bakiyeyi açık teyitle kaydeder; farklı bakiyeler `MATCHED` olamaz, eşit bakiyeler `DIFFERENCE` olamaz. `accounting-workspace-core.ts` mevcut tenant güvenliğiyle aynı fark denetimini API düzeyinde 400/409 ile uygular; D1 migration yok, resmî/haricî gönderim yok.
- **Muhasebe/Mali Kontrol:** `ProfitLossWorkspace` manuel gider/sabit şablon ayrımını, tutar-KDV-valid tarih kontrolünü ve gerçek POST öncesi önizleme/teyidi uygular; çift gönderim kilidi var.
- **İmalat/Makine ve Vardiya:** firma yokken kaydetme engeli, kısmi çoklu kayıtta başarılı/kalan sayısı, kaydedilmemiş düzenlemeleri geri alma, eşzamanlı istek kilidi. Gerçek makine/operatör kaydı otomatik oluşturulmadı.
- **İmalat/Raporlar:** sahte `.xls` metin yerine Excel ile açılabilen BOM'lu UTF-8 `.tsv`, hücre formül/satır enjeksiyonu önleme, güncel uygulanmış filtre olmadan dışa aktarımı engelleme.
- **[Worker production #40215087584](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215087584)** SUCCESS, SHA `b4ed1440ef8b86a94cb4d9f1813d86adac2ff360`: tam D1 backup + artifact, salt-okunur schema, API health PASS; 0050/0051/0055, 0060, 0061 migration adımları **SKIPPED**.
- **[Frontend Pages #40215265216](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215265216)** SUCCESS, SHA `deee4744bbbaa90620f645441864927f597ce125`: deploy + public bundle/Günlük Operasyon chunk smoke PASS. PR #450 merged commit'i hem Worker hem Pages release atası (GitHub compare behind=0).
- **Açık gerçek kabul:** 19 ekranın yetkili gerçek kullanıcıyla çok-firma, belge/LOT, banka fişi, İşNet gönderim, XLSX/TSV Excel açılışı ve İmalat gerçek makine/üretim fişi E2E denemeleri yapılmadı. **19 ekran tam saha PASS değildir**. Canlı iş verisine test finans/üretim mutasyonu yapılmadı. Detay: [19 sekme matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md).


## 25.10.2026 — Muhasebe/e-Belge/İmalat son yayın kanıtı
- e-Belge finans son onay [PR #449](https://github.com/cetin60kaya-lgtm/ky-erp/pull/449) merged `719fd60fa97309230944833f95a7398b06630d88`, CI [#40207296821](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40207296821) **SUCCESS**, Pages [#40207488400](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40207488400) **SUCCESS**, yayın SHA `9bf4e6cdff36634b17b439ef59a6323c4ce27f57`. PR merge → release ancestry behind=0. Canlı Cloudflare Pages deploy, public bundle ve Günlük Operasyon chunk smoke başarılı.
- Frontend release SHA aynı zamanda e-Belge sayfalama #447 ve İmalat #443 merged SHA'larını içeriyor (iki compare da behind=0). Worker #40206650866 SUCCESS, migration atlandı.
- **Gerçek kullanıcı kabul sınırı:** bu kanıtlar kod + Pages + API release içindir; canlı yetkili kullanıcıyla 19 ekranın tümünün CRUD/İşNet/ödeme/model yazma testleri yapılmadı, 19 ekran **KISMİ**.


## 25.10.2026 — e-Belge/İmalat Pages yayını ve finans kesin onay koruması
- [Pages #40206928454](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40206928454) **SUCCESS**, SHA `19fe5de0ee8639853006e7c7af157cd084f3f46f`; e-Belge [PR #447](https://github.com/cetin60kaya-lgtm/ky-erp/pull/447) ve İmalat [PR #443](https://github.com/cetin60kaya-lgtm/ky-erp/pull/443) merge ancestry **behind=0**, Pages deploy ve public bundle/Günlük Operasyon chunk smoke başarılı. Oturumlu gerçek e-Belge/model/fiş kabulü yine bekliyor.
- Kritik ön onay kontrolü: [PR #449](https://github.com/cetin60kaya-lgtm/ky-erp/pull/449) merged `719fd60fa97309230944833f95a7398b06630d88`, CI [#40207296821](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40207296821) frontend+Worker **SUCCESS**. e-Belge kesin muhasebe kaydı artık özet ve cari/KDV/kalem/LOT kontrol teyidi olmadan tetiklenmez; çift istek kilidi, belge değişiminde modal yalıtımı. Worker/D1/resmî gönderim değişmedi.
- **Ön onay ekranının Pages yayını ve oturumlu gerçek kullanıcı acceptance'ı ayrı kapıdır.** Güvenlik nedeniyle otomatik gerçek muhasebe kaydı oluşturulmadı.


## 25.10.2026 — 19 sekme uygulama: CI, kaynak birleştirmeleri ve güvenli Worker canlı kanıtı (güncel)
- Muhasebe PR [#446](https://github.com/cetin60kaya-lgtm/ky-erp/pull/446) merged `3db5852b499a02e7b62d81d2fcdc9b5ed8fe3f56`, CI #40205322671 **SUCCESS**; [Pages #40205714344](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40205714344) **SUCCESS** release `ea8f1bf327d38a290cca54c814214da052e80f3d`, ancestry behind=0; public bundle ve Günlük Operasyon chunk canlı smoke başarılı.
- e-Belge [PR #447](https://github.com/cetin60kaya-lgtm/ky-erp/pull/447) merged `e15d1bcc0f1c30149720a72dc26853e0f27761b5`; CI #40206047817 **SUCCESS**: havuz/gelen/giden kontrol listelerinde 100+ server pagination, tenant korumalı direction GET filtresi. 
- İmalat [PR #443](https://github.com/cetin60kaya-lgtm/ky-erp/pull/443) merged `35405ffbbd172f929ad0865d0ef24e6b350e80a4`; CI #40192931624 **SUCCESS**: mevcut üretim merkezi sayfalaması korundu.
- Güvenli Worker yayın [PR #448](https://github.com/cetin60kaya-lgtm/ky-erp/pull/448) merged `9afadbf5d2a0a6ce6d7f0eb6012fcb977205c40a`; CI #40206496193 **SUCCESS**. [Worker production #40206650866](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40206650866) **SUCCESS**, SHA `17245ea35ceed2077f193756176dc510da7a8c1f`, ilgili #447 ve #448 merge ancestry behind=0. Tam canlı D1 export/artifact, salt-okunur schema, deploy ve /api/health adımları PASS; 0050/0051/0055/0060/0061 migration adımları **SKIPPED**. İzin bayrakları açıkça FALSE; production D1 migration veya gerçek finans/belge kaydı yapılmadı.
- **Kalan:** e-Belge ve İmalat frontend PR #447/#443 Pages release + bundle smoke; tüm 19 sekmede gerçek yetkili tarayıcı, firma/rol, ödeme/fiş/muhasebe mutabakat ve İşNet saha testleri. Bu testler olmadan 19 sekme tamamlandı denmez. [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md).



## 25.10.2026 — Muhasebe belge listeleri PR #446 / 19 sekme kabul takibi
- [PR #446](https://github.com/cetin60kaya-lgtm/ky-erp/pull/446) **merged** `3db5852b499a02e7b62d81d2fcdc9b5ed8fe3f56`; CI [#40205322671](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40205322671) **Frontend lint/test/build + Worker typecheck/test/build SUCCESS**.
- Alış irsaliyeleri ve satış faturalarının `/e-belge/pool` gerçek total/page/pageSize üzerinden sayfalama, arama/firma geçişi ve eski async yanıt koruması tamamlandı. Günlük Operasyon, İK Aylık, ortak shell, Worker ve D1 iş kayıtları değiştirilmedi.
- 19 sekmenin satır bazlı kod kaynağı, gerçek kabul durumları ve açık işleri: [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Ekranların tümü **KISMİ**; canlı yetkili browser/finans/İşNet gerçek işlem PASS iddiası yok. e-Belge havuzu 100 kayıt sınırı açık; İmalat #443 ayrı PR ve hâlâ açık.
- **Canlı Pages yayın kanıtı bu kayıt anında bekliyor**; merge ve CI tek başına canlı değil.


## 25.10.2026 — Onaylı 104-sekme HTML tasarım + işlev ilk paketi (canlı)
- **Kullanıcı kararı:** 14 ana bölüm / 104 görünür+bağlamsal sekme için hazırlanan `KY_ERP_104_SEKME_TEK_HTML_TASARIM_ONAY_2026-10-25.html` tasarım yönü onaylandı; tasarım ve gerçek işlemler aynı sözleşme üzerinden ilerler. Görsel sistemin koordinasyonu tek sohbet/ortak kod sahibindedir, modül kodları ayrı sohbetlerde yürür. Tasarım dosyası sohbet eki/prototip; tamamı production'a geçirildi şeklinde raporlanmaz.
- **Ortak/ikincil teknik sözleşme:** [KY_ERP_104_SEKME_ONAYLI_HTML_UYGULAMA_SOZLESMESI_2026-10-25.md](KY_ERP_104_SEKME_ONAYLI_HTML_UYGULAMA_SOZLESMESI_2026-10-25.md). Bu belgenin üzerinde canonical proje kontrol otoritesi yine bu dosyadır.
- [PR #445](https://github.com/cetin60kaya-lgtm/ky-erp/pull/445) **merged** `1589f8488d2adf94600d2d6232b54205e4c9dd33`. [CI #40200690982](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40200690982) Frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**.
- [Pages production #40200843799](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40200843799) **SUCCESS**, release SHA `3d0fe3a2487e1c81da350dc4ddbec84f5c0e0c43`. PR merge → Pages release compare `ahead=1 / behind=0` ve bundle+Günlük Operasyon chunk smoke başarılı. Worker/API değiştirilmedi; Worker yayını gerekli değildi.
- İlk gerçek değişiklikler: `approved-html-shell.css` onaylı HTML menü/başlık/açık sekmeler/alt görünüm ve responsive; PDKS sahte sabit firma hızlı işlem fallback kaldırıldı; İletişim Şablonlar düğmesi `muhasebe/mail-ekstre` gerçek sekme + tek kullanımlık şablon paneli açılışı; KY Güvenlik kurulum URL'si `/ky-guvenlik/`; helper/regression testleri. Günlük Operasyon/İK Aylık canlı işlemleri, Worker ve D1 kayıtları değiştirilmedi.
- **Açık gerçek kabul:** tüm 104 ekranın yetkili oturumda screenshot karşılaştırması ve işlemleri, 1366x768/1920x1080/mobil gerçek tarayıcı denemesi, gerçek PDKS kart/cihaz, Mail ve Muhasebe gönderim/ödeme işlemleri otomatik testle onaylanmadı. Tüm modüller tamamlandı denmez. İmalat [PR #443](https://github.com/cetin60kaya-lgtm/ky-erp/pull/443) ayrı iş olarak korundu.


## 18.10.2026 — Günlük Operasyon kritik beş sekme PR #442 canlı yayın kanıtı
- `fix/gunluk-tam-denetim-kritik-guvenlik-senkron-20261018` branch PR [#442](https://github.com/cetin60kaya-lgtm/ky-erp/pull/442), **merge SHA** `9ff13b114174a7e4f0e25990dd7cb4ae44495e94`.
- [CI #39128442185](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128442185) Frontend **success** (lint/test/build), Worker **success** (typecheck/unit/integration/build). Unit includes XLSX real örnek parse, güvenlik policy, kilit, vardiya kontrol ve iki-PC CAS contract.
- [Worker production #39128578543](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128578543) **SUCCESS**. Release SHA `0f077a689a0eb536d3977a91b150952630720868`. Tam canlı D1 backup + artifact, mevcut migration readiness, Worker deploy, /api/health doğrulaması PASS.
- [Pages production #39128765495](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128765495) **SUCCESS**. Release SHA `7dd1514484a361d4fa00f120f88dd8f0f0ceac38`. Frontend build + Pages production + canlı KY ERP Günlük Operasyon chunk doğrulaması PASS.
- GitHub kaynak ancestry: Worker `9ff13b..0f077a` behind=0 ahead=1; Pages `9ff13b..7dd151` behind=0 ahead=2. **Aynı feature merge source** hem canlı Worker hem Pages sürümlerinde yer alıyor.
- Düzeltilenler: /gunluk-operasyon/* tenant+IK API guard, DENETIM/PERSONNEL yasak, gerçek dönem lock/unlock + gerekçe + fail-closed, locked check/roster/extras, gündüz/gece check matris + bekleyen sayaç, gerçek .xls/.xlsx Excel upload önizlemesi, personel kart create/update/deactivate append-only audit, iki bilgisayar eski note/check sürümü değişmez deterministic audit CAS atomik çakışma koruması, toplu işlem kısmi başarılı/başarısız raporu, fiili ödeme ön onayı, hatalı senkron bildirimi ve kompakt arayüz CSS.
- **Gerçek personel, ücret, ödeme verisine otomatik test/örnek kayıt oluşturulmadı.** Aktif iki gerçek PC oturumuyla eşzamanlı kullanıcı kabulü, kart ücreti concurrency, güvenli ödeme kaydı ve gerçek Chrome/Epson çıktı testleri **ayrıca bekliyor**; yalnız kod/CI/yayın ile bunlar başarılı ilan edilmez.


## 18.10.2026 — Günlük Operasyon 5 sekme kritik denetim düzeltmeleri (test/yayın sürecinde)
- User request: mevcut canonical Günlük Operasyon kodunda 5 sekmenin tüm kritik yetki/işlem/kilit/senkron/hesap/Excel/log eksiklerini düzelt, kompakt tasarımı iyileştir, testsiz canlıya çıkma.
- Başlangıç canonical SHA `15bd6d0c6921c5211623a2fb28e4b694d4ce318f`, feature `fix/gunluk-tam-denetim-kritik-guvenlik-senkron-20261018`.
- Worker `gunluk-operasyon-access.ts`: oturum, IK modül izinleri, tenant header/query/body tutarlılığı ve tenant sahipliği kontrolü. `main.ts` /api/gunluk-operasyon/* koruması. Yetkisiz veya belirsiz firma fail-closed.
- Dönem kilidi: frontend D1 array status + `date`, sunucu `action: LOCK/UNLOCK` ve zorunlu gerekçe; kilit doğrulanamazsa ekran yazma kapalı. Worker'da check-only, roster add/remove ve ek ödeme/kesinti işlemleri için de kilit aralığı kontrolü. Dönem kaydı kullanıcı onayıyla aç/kapat.
- Kontrol özeti: GET attendance gerçek `hr_daily_attendance_check` vardiya onaylarını gün/gece ayrı döndürür, bekleyenler vardiya bazlı; dönemde ✓=onay, •=bekleyen, –=yok.
- Gerçek `/excel-upload` önizleme: XLSX/XLS SheetJS ayrıştırma, tarih/kimlik/firmaya ait personel doğrulama, 3MB/2500 satır, sadece işaretli yeni vardiyaları önizler, eksik/verisi eşleşmeyen personelde hata, BOŞ Excel hücresi mevcut vardiyayı silmez; `/excel-apply` ancak ayrı onayda yazar.
- Personel oluşturma, ücret dışı kart güncellemeleri, pasife alma: audit; mevcut efektif ücret değişimi audit'i korunur. Toplu kart işlemlerinde `Promise.allSettled` ile kısmi başarı tespiti, toplu ödemede kişi bazlı hata raporu ve kullanıcıdan 'fiilen ödendi' onayı.
- İki bilgisayar: D1 1.5sn versiyon polling ve eşzamanlı kayıt korumaları devam eder, senkron hatası artık kullanıcıya görünür. D1 üzerinde otomatik test personeli/ödeme yazılmaz. Race condition gerçek iki-PC testi ayrıca beklenir.
- Tasarım: dönem matrisi onay-bekleyen renk farkı, kompakt/okunur tablo sticky başlıkları, kilit/senkron güvenlik şeridi, hızlı giriş onaylı kartını belirgin yeşil, responsif.
- Kod/test sonuçları PR ve Actions sonrası girilecektir; Merge/Pages/Worker üretim yayını kanıttan önce tamamlandı denemez. Canlı D1 yeni migration yok; varsa yayın workflow full backup gate kullanılacak.


## 18.10.2026 — Günlük Operasyon A4 fiş PR #441 CANLI yayın ve düzen kabul kanıtı
- Kullanıcı gerçek Chrome baskı görüntüsünde A4 10 kişi şablonunda GENEL TOPLAM'ın sayfa taşması / tekrarını bildirdi; istek: `Ücret | Adet | Toplam` yanyana, son sayfanın altında bir genel toplam.
- PR [#441](https://github.com/cetin60kaya-lgtm/ky-erp/pull/441) **merge** SHA `0ba50a90c696bf87bf173c552f730e7725aa78b1`.
- Son commit üzerinde Frontend + Worker [CI #39111619324](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39111619324) **success**. Regression: 1,9,10,11,19,20,26,29,30 personel gerçek print fonksiyonu ile sayfalama ve son sayfa footer, 1350×5=6750 ve tarih bazlı birden çok ücret, boş dönem.
- Cloudflare Pages production [Actions #39111803910](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39111803910) **success**, release SHA `ce01a81bd2d2d95409ed3f6746b50dfaa2f4c13b`; GitHub ancestry `0ba50a90...ce01a81`: ahead=1, behind=0. CI release job canlı `Günlük Operasyon` chunk doğrulaması **PASS**. Worker/D1 değişmedi.
- Layout: A4 portrait, 5mm kenar, 286mm tek sayfa gövdesi, 2 sütun × 5 sabit 45mm fiş; üst not sayfa header'ında. Gündüz/gece satırı 4 hizalı kolon `Vardiya / Ücret / Adet / Toplam`; ek ödeme/kesinti ve net satırı fiş içinde. `GENEL TOPLAM` yalnız son sayfada.
- Bağımsız sentetik 26 kişiyle HTML/CSS → WeasyPrint PDF → pdftotext ve görsel render kontrolünde **3 A4 sayfa, ilk iki sayfada 10'ar, son sayfada 6 kişi ve 1 GENEL TOPLAM**, ekstra sayfa yok. Gerçek Chrome yazdırma önizlemesi ve fiziksel Epson cihaz testi kullanıcı oturumunda ayrıca kontrol edilecek; WeasyPrint Chrome baskı kabulünün yerine geçmez.
- Personel ücretleri, gerçek ek ödeme/ödemeler, Günlük Personel Girişi, Cloudflare D1 ve Worker verisi hiç değiştirilmedi.


## 18.10.2026 — Günlük Operasyon hakediş A4 fişi: tek satırda ücret/adet/toplam, yalnız son sayfa GENEL TOPLAM
- Gerçek 18.10.2026 Chrome yazdırma önizlemesinde 26 personel çıktısı 3 sayfa hedeflenirken GENEL TOPLAM her sayfada ve ilk 10 kişi fişlerinin altından taşarak sayfa başına tek başına atlayabiliyordu. Kullanıcı onayı: gündüz ve gece satırları `Vardiya | Birim Ücret | Adet | Toplam` yan yana ve 10 kişi / A4 (2 sütun × 5 satır).
- Kaynak: `APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx`, `printDailyPaymentSlips`. Önceki `page-grand` bütün sayfalarda oluşturuluyordu, ayrıca ana çıktıda sayfa yüksekliğine dahil edilmeyen ek uyarı paragrafı ve 47mm kartlar bulunuyordu.
- Çözüm feature dalı `fix/gunluk-hakedis-a4-10-fis-sabit-20261018`: gerçek sayfa başına 10 fiş, 45mm sabit kart, her satır `Ücret × Adet = Toplam` eş sıralı grid, varsa +ek ödeme/-kesinti, net hakediş; tüm uyarı sayfa başlığının içinde; 286mm A4 gövde ve 5mm sayfa kenarı; **GENEL TOPLAM sadece son sayfanın sonunda**. Ücret geçmişinde iki farklı tarife varsa ortalama uydurulmaz, aralık ile gerçek tutar birlikte yazılır. Veri, ödeme ve D1 hiç değişmedi.
- `DailyHrA4SlipsPagination.test.js`: 1,9,10,11,19,20,26,29,30 kişi; sayfa sayısı, 10 kişi/sayfa, genel toplam tek/son sayfa, 1350×5=6750, boş çıktı, ücret tarife değişimi ve sabit ölçü kontratı.
- CI/merge/Pages deployment ancestry ve mümkünse gerçek Chromium/PDF görsel kontrolü ayrı kanıtlanacak; oturumlu kullanıcı baskı testi beklenir.


## 17.10.2026 — Günlük Operasyon Ek Ödeme/Kesinti PR #440 canlı yayın kanıtı
- PR #440 merge commit: 91bf79ba2378bc5fd47def8fd6fd2d51d5990c97. Frontend ve Worker CI #39065684356 SUCCESS.
- Worker ve D1 CANLI: Actions #39065800668 SUCCESS, release SHA ceec10a161b613688239e101e1d36b5c6da3f10c. D1 tam yedeği artifact olarak saklandı, 0061_hr_daily_payment_adjustments.sql prerequisite + tablo/trigger canlı proof başarılı. Worker deploy ve api.kyerp.net/api/health başarılı.
- Cloudflare Pages CANLI: Actions #39065964738 SUCCESS, release SHA ae7eddf69a3a8844cf822310f9ca8cffbce83fe7. Production Pages deploy + canlı giriş bundle / Günlük Operasyon chunk SHA256 doğrulaması başarılı.
- Merge commit Worker release'in 1 commit, Pages release'in 2 commit atasıdır (GitHub compare: behind=0).
- Hakediş & Ödeme → Dönem / Çıktı → Ek / Kesinti: açıklama, tarih, tutar, işlemi yapan; gerekçeli iptal, silinmeyen geçmiş, D1 sync-state, tam kuruş net tutar, A4 fişleri ve immutable ödeme geçmiş snapshot.
- Kullanıcının gerçek Chrome oturumunda görsel ve iki ayrı bilgisayar D1 sync kabulü HENÜZ yapılmadı. Gerçek personel için otomatik sahte test ödeme/ek kalem oluşturulmadı.
- Links: https://github.com/cetin60kaya-lgtm/ky-erp/pull/440 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065684356 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065800668 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065964738


## 17.10.2026 — Günlük Operasyon: Ek Ödeme / Kesinti + Kesin Log/Geçmiş
- Kullanıcı isteği: Günlük Personel Girişi ve hızlı kayıt ekranını kesinlikle değiştirmeden **Hakediş & Ödeme → Dönem / Çıktı** personel satırına küçük `Ek / Kesinti` düğmesi; prim, avans, başka ek ödeme/kesintiler; açıklama/tutar/tarih/yapan, gerekçeli iptal ve kalıcı geçmiş.
- Kod dalı `feat/gunluk-hakedis-ek-odeme-kesinti-log-20261017`: dönem-personel bazlı `hr_daily_payment_adjustments` (ACTIVE/VOID, tür ADD/DEDUCT, kuruş, actor, created/voided), değişmez `hr_daily_payment_adjustment_snapshots` ve `hr_daily_operation_audit` aksiyonları `PAYMENT_ADJUSTMENT_ADD/VOID`. Ödeme geçmişinden silme yok; ödenen fiş anlık detayları sonraki iptalden sonra bile korunur.
- Worker API `GET/POST /api/gunluk-operasyon/payments/adjustments`, `POST .../adjustments/:id/void`: tenant, çalışan, dönem, açıklama ve tutar doğrulaması; aktif ödeme varken ekleme/iptal bloke; D1 trigger ile başka bilgisayardan eşzamanlı çakışmada fail; `hr_daily_sync_state` trigger ile bilgisayarlar arası yenileme. Sadece açıklamalı `PAYMENT_CANCEL` sonrası kayıtlar yeniden açık hâle gelir.
- Hakediş ve ödeme havuzu/period-status gerçek net = vardiya + ek ödeme − kesinti. Worker `dailyAdjustmentNetCents` ile kuruş bazlı hesap; net negatifse ödeme durur. Ödeme kaydıyla aynı transaction içinde kalem snapshotları tutulur. A4 hakediş ve ödeme fişleri ile ödeme geçmişi tutarları aynı D1 defterinden gelir. Çıktı almak ödeme oluşturmaz.
- Migration `0061_hr_daily_payment_adjustments.sql`; Worker production release workflow'da **tam D1 yedeği artifact olarak saklandıktan sonra**, 0061 prerequisites ve tablo+trigger proof; DROP/DELETE yok. Frontend sadece Hakediş ekranında değişti. Canlı Pages ve Worker yayın kanıtı ayrı istenmeli.
- Öncelikli canlı kabul senaryosu (gerçek personele para/ücret değiştirmeden yetkili test): +100 TL/−30 TL, net +70 TL; aynı personel iki PC'de görüntü; gerekçeli iptal ve log; ödenmiş dönem kilidi; fiş ve ödeme geçmişi immutable; iptal edilen ödeme snapshotının korunması. **Gerçek iş verisini izinsiz test amacıyla değiştirme.**


## 17.10.2026 — Günlük Operasyon Kompakt V3 canlı yayın kanıtı
- Kullanıcı isteği: Hızlı Personel Girişi kartlarını **enine ve boyuna daraltıp** önceki düzen gibi aynı yatay sırada masaüstünde yaklaşık 5 kart yan yana göstermek, Seç/Kontrolü kart içinde ayrı butonlar halinde tek satıra almak. Kontrol edilmiş tam yeşil kart, turuncu seçim korunur.
- PR [#439](https://github.com/cetin60kaya-lgtm/ky-erp/pull/439) başarılı [CI #39056136105](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39056136105) sonrasında **merge**: `45ff7d5c33e89b4f3488975bc9d096a5565506a3`.
- Cloudflare Pages production [Actions #39056248820](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39056248820) **success** head `cbfc5e8c25dd0fef32080099ec83d2e40fe484ff`. GitHub compare merge→release **ahead=1 / behind=0**. Pages production target `ky-erp-frontend`; canlı entry `/assets/index-Dnbmp8SE.js`, Günlük Operasyon doğrulanan chunk `/assets/AppV3-Bwo1z4e6.js`, **SHA256 `54c8e57cdb74ae29d14ad04653563dd4f57ac0ad108da9dd4196e0666c56b51f`**.
- Öncelikli ekran testi: Günlük Personel Girişi → Hızlı Personel Girişi başlığında **KOMPAKT KONTROL KARTLARI V3** görünmeli; 220px kart, uygun genişlikte 5 yan yana, düğmeler birbirinden ayrı aynı satırda. Ekran daralınca otomatik sütun azalır. Eski açık oturumda kaydedilmemiş işlem varsa yenileme öncesi kaydet.
- **Açık kabul:** gerçek oturumlu kullanıcı PC ekran görüntüsüyle görsel doğrulama; iki bilgisayarlı fiziksel D1 davranış testi ayrıca beklenecek. Bu PR yalnız frontend görünümüdür, Worker/D1/personel/ödeme işlem kodu değişmedi.


## 17.10.2026 — Hızlı Personel Girişi Kompakt V3 (5 yatay kart) kullanıcı kararı
- Kullanıcı bir önceki V2'nin kartlarının **enine ve boyuna küçültülmesini**, eski ilk düzene benzer çok sütunlu tek yatay sırayı ve **Seç/Kontrol** eylemlerinin aynı kartın altında **birbirinden ayrı** yatay butonlar olarak yerleşmesini onayladı. Önceki V2 iki alt satır artık hedef değildir.
- Feature `fix/gunluk-hizli-giris-v3-kompakt-5li-20261017`: V3 görünür başlık; kart eni varsayılan **220px** (`quickCardWidth.v5`, kullanıcı slider 205–320px); masaüstünde yer varsa beş kart yan yana; en küçültülmüş kart yüksekliği yaklaşık 66–74px; tablo enine sığmıyorsa otomatik azalan sütun. Kontrol edildiğinde tam yeşil kart korunur, seçildi ama kontrol edilmediyse turuncu vurgulanır. Seç/Kontrol ayrı işlevler ve ayrı tıklama hedefleri; kısa seçili etiketi.
- `daily-quick-entry-card-v2.css` mevcut benzersiz sınıfları koruyarak V3 kompakt stile güncellendi. Eski final CSS'deki quick-person kuralları V3 kartlarına uygulanmaz. İlgili regresyon testi güncellendi.
- Sadece frontend görünümüne dokunuldu; **D1, personel ve ödeme kayıtları, iki PC eşitleme/sürüm onayı ve Worker API değiştirilmedi.** Gerçek canlı kullanıcı görsel kabulü ancak oturum içi yeni ekranla tamamlanır.


## 17.10.2026 — Hızlı Personel Girişi V2 Pages canlı yayın kanıtı
- Gerçek kullanıcı ekranında eski sıkışık kontrol alanı kaldığı için hızlı giriş kartı eski CSS sınıflarından tamamen ayrıldı.
- PR [#438](https://github.com/cetin60kaya-lgtm/ky-erp/pull/438) merge SHA: `2039e4c2f8b097fbd78ad8c748eff7fee146ee71`.
- Frontend/Worker CI: [Actions #39050680228](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39050680228) **success**.
- Cloudflare Pages production: [Actions #39050827903](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39050827903) commit `448585f9918defdbe3b38a1c92f00dfab775416e` **success**, GitHub compare `2039e4c2...448585f` ahead=1 behind=0. Canlı giriş + Günlük Operasyon chunk SHA256 karşılaştırması başarılı, AppV3 asset `/assets/AppV3-CpYVkLAU.js`, `sha256=f9af96ae6861d59c16fbcebc0685332045d6e25bf5b8d65a785e2afd34b6f16f`.
- Hızlı Giriş modalında **KONTROL KARTLARI V2** işareti; kart içi veri üstte, `VARDİYAYA SEÇ` / `KONTROL ET` alt alta. Kontrol edilen kişinin kartı tamamen yeşil ve kenarı koyu yeşil. CSS `daily-quick-entry-card-v2.css` ayrı.
- Worker/D1 için değişiklik/deploy gerekli değildir: bu PR frontend-only. Kayıt/senkronizasyon işlevine dokunulmadı.
- **Açık:** kullanıcının gerçek Chrome oturumunda V2 modalı açıp görsel ekran kabulü. Bundle SHA kanıtı oturum içi render yerine geçmez; eski açık sekme kaydetmeden yenilenmemelidir.


## 17.10.2026 — Hızlı Personel Girişi V2 / gerçek ekran tasarım düzeltmesi
- Kullanıcı gerçek canlı ekran görüntüsünde #437 sonrasında dahi eski dar/yanyana kontrol butonlarının göründüğünü bildirdi. Önceki canlı UI onayı **görsel kabul anlamına gelmiyor**.
- Kök neden analizi: `daily-hr-workspace-final.css` dosyasında aynı `quick-person` / `quick-main-toggle` / `quick-check-button` sınıflarına yüzlerce satır birikmiş `!important` ve sabit grid yüksekliği kuralı var. Son CSS yaması güvenilir uygulama garantisi vermiyordu; tarayıcı önbelleği bu gözlemi tek başına açıklamaz.
- Çözüm dalı: `fix/gunluk-hizli-giris-kart-v2-gorunum-20261017`. Eski kart sınıflarına bağlı olmayan `kyq2-*` yapısıyla personel bilgi satırı + birbirinden tamamen ayrı iki geniş seçim/kontrol satırı. Kontrol durumunda **bütün kart koyu kenarlı açık yeşil**, kontrol butonu koyu yeşil. `daily-quick-entry-card-v2.css` importu mevcut final CSS'den sonra gelir. Grid auto-rows sabit zorlaması da override edildi.
- Günlük veri kayıtları, D1 senkronizasyon, onay sürümü ve ödeme davranışına dokunulmadı. Görsel regression kontratları yenilendi.
- PR, CI, merge, Pages yayın ve **kullanıcı PC'de oturumlu ekran kabulü** ayrı kanıtlanır; ekran kabulü gelmeden tam görsel başarılı sayılmaz.


## 17.10.2026 — Günlük Operasyon PR #437 canlı yayın kanıtı
- Canonical feature PR #437 **merge edildi**: `bfd9d452c4308f88e212709ecc06907e2a7b145e`. Frontend + Worker CI: [Actions #39048318190](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048318190) **success**.
- **Pages production**: [Actions #39048530235](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048530235) `8b88e66902c14aef8efc44623fc15f697da591b9` **success**, gerçek giriş + Günlük Operasyon bundle karşılaştırması başarılı.
- **Worker production**: [Actions #39048511990](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048511990) `81235934ef8aeae5af71da6929f3c745469d6ff3` **success**; tam D1 yedeği alınıp artifact'a saklandı, mevcut release hattı şema kontrolleri ve canlı API health geçti.
- GitHub compare kanıtı: feature merge `bfd9d452` hem Worker release SHA'sının **1 commit**, hem Pages release SHA'sının **2 commit** atası (`status=ahead, behind_by=0`).
- İş kapsamı: ortak dönem, D1 audit akışı, ayrı seç/kontrol + tam yeşil onay, delta-only kaydetme, check sürüm uyuşmazlığında 409, çoklu-PC roster merge/remove, tekrar eden haftalık çıktı kaldırma.
- **Açık kabul:** iki gerçek Windows/Chrome oturumunda aynı personel/gün için karşılıklı kayıt ve 409 çakışma senaryosu oturumlu uçtan uca fiziksel test olarak henüz yapılmadı. Salt CI ve deploy bunun yerine geçmez. Gerçek personel ödeme kaydı yapılmadı.


## 17.10.2026 — Günlük Operasyon / Ortak tarih, kontrol onayı ve PC eşitleme
- Kullanıcının gerçek ekran görüntülerinden: hızlı girişte personel seçimi ile kontrol onayı çok yakın, kontrol edileni güçlü yeşil göster, günlük girişin altına D1 denetim logu getir, haftalık aynı çıktıyı üreten ikinci butonu kaldır.
- Günlük Personel Girişi / Dönem Kontrolü / Yönetim Özeti / Hakediş aynı `kyerp.dailyOperations.range.v5` seçili aralığını kullanır; sekmeler ve tarayıcı pencereleri BroadcastChannel / storage üzerinden güncellenir. **Diğer PC'nin ekranını zorla aynı tarihe geçirme**; firma bazlı asıl çalışma ve onay kayıtları Cloudflare D1 ve `/sync-state` 1.5 sn kontrolüyle aktarılır.
- Hızlı giriş ilk okunan personel/vardiya ve kontrol sürümlerini tutar, sunucunun 409 `DAILY_RECORD_CHANGED` / `DAILY_CHECK_CHANGED` kontrolleri kaydetmeden önce eşleştirir. Günlük Kaydet sadece farkları yollar. Roster `mode: merge` ve hedefli `mode: remove` ile iki PC arasında diğer kişinin listesini silmez.
- D1 `/audit` son işlemleri günlük girişin altında, tarih, işlem, personel, vardiya, yapan kişiyle görünür; detaylar mevcut Log penceresinde. Kontrol onayı ayrı satır/düğme, tüm kart güçlü yeşil; seçim turuncudur.
- Dal: `fix/gunluk-operasyon-sync-log-kontrol-20261017`. Kod/test/PR/CI/merge/Pages+Worker yayın+canlı E2E için durum ayrı kanıtlanmalıdır. Gerçek personel kartına/ödeme kaydına yazma **yapılmadı**.


## 17.10.2026 — Günlük Operasyon ücret kartı / çıktılar kontrolü
- Kullanıcı kararı: personelin gündüz/gece ücretleri ve geçerlilik tarihi **Personel & Ücret Kartları** üzerinden tek kaynaktan yönetilir. Tarih etkili ücret geçmişi ve ödenmiş vardiya anlık görüntüsü korunur.
- Çalışma dalı: `fix/gunluk-operasyon-ucret-kart-cikti-20261017`; değişiklikler: ücret değişiklik geçmişi görünümü, toplu ücret güncellemede tarih, tarihli ücretlerin haftalık PDF/Excel'e eklenmesi, kullanıcı arayüzünün okunaklı/responsive düzeni.
- Güvenlik düzeltmesi: **hakediş fişi yazdırmak ödeme oluşturmaz**; gerçek ödeme ancak ayrı kullanıcı `Tamamla` eyleminde oluşur. Geçmiş haftada açık borç saklanmaz. Dönem ödeme durumu `/payments/period-status` üzerinden gerçek vardiya/ledger kayıtlarından belirlenir, veri okunamazsa `DOĞRULANAMADI` gösterilir.
- Kod + regresyon testleri feature dalına yazıldı. **CI, PR merge, Worker/Pages yayın ve gerçek D1/oturumlu kabul sonucu ayrı doğrulanmadıkça canlı veya tam test başarılı sayılmaz.** Production D1 migration ve gerçek personel ödeme kaydı yapılmadı.


## 09.10.2026 — Canlı KY ERP 14 modül QA ve nöbet sonucu
- PR #409 gerçek canonical merge `2d0e33a24d4ce319baff4ae6f9cc57b670a6552d`; CI Action #37891886962 SUCCESS.
- Production Pages deploy Action #37892077343 SUCCESS; commit `844a4337523e24d9f5f944cef5b57a5f1506051f`. Gerçek Chrome public route + anonim API auth sınırı ve live bundle kontrolleri başarılı.
- Platform Yönetimi > Sistem > Güncelleme Geçmişi > **Modül Kontrolleri**: 14 ana modül için son PR ve ilgili ekran; yetkili gerçek E2E kanıtı bulunmayan her modül **test bekliyor** gösterilir.
- Canlı geçmiş yanlış sınıflandırma (örneğin "gerçek" -> "çek" -> Muhasebe) düzeltildi; PR başlığıyla modül kategorisi belirlenir.
- Kullanıcının ek onayını gerektirmeden canlı site/API/yayın hatası için ChatGPT **KY ERP Canlı Nöbet** altı saatte bir read-only izleme yapar; hata doğrulanırsa bildirir, normalde sessizdir. Bu otomasyon onaylı test kullanıcısı yerine geçmez.
- Açık blocker: admin onaylı, yalnız KY ERP TEST firması kapsamında, düşük yetkili QA kullanıcısı/cihazı ile 14 modülün gerçek iş akışı, PDKS, yıllık izin, imalat/üretim ve erişim deny testleri uygulanamadı. Tam sistem E2E başarısı **iddia edilmez**; MFA bypass/gerçek canlı ücret işlemine dokunulmaz.


## 09.10.2026 — Zorunlu GitHub güncelleme ve canlı yayın geçmişi
- Kullanıcı kesin kararı: bütün sohbetler/ajanlar somut işlerini GitHub commit/PR ve production yayın kanıtı üzerinden ortak izleyebilmeli; uygulama sahibi Platform Yönetimi > Sistem > Güncelleme Geçmişi bölümünde neyin dalda, testte, birleştirilmiş, arayüzde ve API'de canlı olduğunu görmeli.
- Canonical sözleşme: `DOCS/KY_ERP_GUNCELLEME_YAYIN_KAYIT_SOZLESMESI_2026-10-09.md`. Teknik üst kural `AGENTS.md`.
- GitHub public API salt okunur; ikinci veri kaynağı veya test sunucusu oluşturulmaz. Canlıya alındı demek için başarılı deploy ve release SHA ancestry gerekir.
- 09.10.2026 gerçekleşen personel işleri: PR #405 canonical merge, Worker Action 37885380200 başarılı (D1 0060 + yedek + API), frontend Action 37885546558 başarılı. PR #407 mobil login yönlendirme düzeltmesi merge, frontend Action 37889109158 başarılı. **Gerçek personel/Android/PDKS/üretim uçtan uca kabulü henüz kanıtlanmadı**.
- **SONUÇ:** PR #408 merged (642932f4), frontend production yayın GitHub Actions #37890106512 SUCCESS. Pages bundle doğrulaması + gerçek Chrome 6/6 public/live API smoke PASS. Artifact 11597916502. Uygulamada Platform Yönetimi → Sistem → Güncelleme Geçmişi artık canlı. Yetkili test hesabıyla bütün modüllerin CRUD/cihaz onay testi henüz yapılmadı; gerçek E2E tamamlandı denemez.


## ZORUNLU TEK YEREL KÖK — 01.10.2026

- Tek aktif yerel KY ERP kökü: `D:\Googledrive\KYERP`.
- Tek aktif Git working copy: `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp`.
- Canlı veri otoritesi: Cloudflare D1 `ky-erp-db`; Drive SQL/DB dosyaları yedek/export/referanstır.
- Bağımsız `KYERP-PDKS-*` klasörleri kalabilir; ancak canonical değildir ve yeni sohbet/ajan bunlardan yeni iş başlatmaz.
- Eski `KYERP-MERKEZ`, `KYERP-GELISTIRME-MERKEZI` ve OneDrive `KY-ERP-MERKEZ` yolları yeni geliştirme/deploy kaynağı değildir.
- Yeni paralel KY ERP kökü veya clone oluşturulmaz. Ayrıntı: `DOCS/KY_ERP_TEK_YEREL_KOK_2026-10-01.md`.

## 21.09.2026 — KY ERP Güvenlik Android PWA akışı tek canonical yapıya alındı

- Feature branch: `codex/security-pwa-enrollment-final-20260921`.
- Canonical güvenlik PWA yolu `https://security.kyerp.net/ky-guvenlik/`; `/security/` yalnız eski kurulumları yönlendiren ve eski service worker/cache kayıtlarını emekliye ayıran göç katmanıdır.
- Manifest kimliği uyumluluk için `/ky-guvenlik/app-v28` olarak sabitlendi; `start_url=/ky-guvenlik/`, `scope=/ky-guvenlik/`. Manifest kimliği ve başlangıç URL'si artık release/boot numarasıyla değiştirilmeyecek.
- Android tarayıcı akışı yalnız kurulum ekranıdır. Cihaz bağlama yalnız standalone KY ERP Güvenlik uygulamasının ilk açılışında çalışır; enrollment bilgisi kurulum öncesi yerel bekleme kaydına alınır ve token tarayıcı URL/geçmişinden temizlenir.
- `boot`, `release`, `flow-v`, `shell-v` URL/cache yamaları kaldırıldı. Tek kararlı static cache kullanılır; runtime JS/manifest/navigation network-fresh çalışır, eski sürümlü cache'ler activate/migration sırasında temizlenir.
- Kurulum, API ve service worker beklemeleri zaman aşımıyla sınırlıdır; hata durumunda dokunmayı kilitleyen sonsuz overlay yerine anlaşılır durum ve tekrar deneme yolu gösterilir.
- 8 karakter kod normal akışta görünmez; yalnız açık yedek/kurtarma seçeneğidir. Mevcut password step-up, P-256 cihaz imzası, push subscription, tenant/rol/yetki ve relink güvenliği korunmuştur.
- D1 migration/reset/drop yoktur. Production deploy yapılmadı; kullanıcı onayı sonrası production branch merge ve Cloudflare Git Integration yayını beklenir.

## 06.09.2026 — Mail Merkezi production onarım kaydı

- Kullanıcı yerel production eşitlemesi, yeni feature branch, temiz PR/merge ve Cloudflare Git Integration yayını için açık talimat verdi.
- Başlangıç local=origin SHA: `c2e541a618ef8b01f01a8363b1c3d1cbb28c71bb`; iki `npm ci` başarılı, source temiz. Yerel önceki değişiklikler `backup/local-before-production-sync-20260906-204004` branch'i ve aynı isimli stash ile korundu.
- Feature: `fix/mail-center-production-final-20260906`.
- Kök neden: Pages bu SHA'da başarılıyken canlı Worker v705 (`7485e463-135a-4e3e-b6cf-f9fdb993687e`, 03:13 UTC) paketinde `/api/mail/providers`, hesap, Google OAuth ve sabitleme rotaları bulunmuyor. Worker'ın commit SHA'sı canlı metadata'da yok; eski SHA tahmin edilmedi. Kaynak Worker test kapısında 11 hata tekrar üretildi.
- Eski ekran/entry sözleşmeleri güncellendi; runtime readiness içindeki kullanılmayan DDL kopyaları ve frontend build'e bağlanmış geçici Worker tanılama betiği kaldırıldı. Frontend build tekrar `vite build`.
- Mail girişinde ortak CORS/auth/hata sınırı; firma/hesap kapsamlı gerçek Microsoft/Gmail reply ilişkisi; gönderim sürerken tekrar engeli; sade bağlantı durumları ve ACTIVE hesapta posta kutusunu açma eklendi.
- D1: repo dışında 38.371.801 bayt full SQL backup alındı. SHA256 `5A14E92BE137BCD585DE891970BA8016231795E832EEEF7B7FFF314F35B5A6AD`. Sonra yalnız 0050+0051 uygulandı; 23 tablo ve 18 indeks canlı metadata üzerinden doğrulandı. Genel migration zinciri veya business test write yapılmadı.
- Eksik production bindings: `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`. `FILE_HUB_OAUTH_KEY` mevcut; yeni kasa anahtarı gerekmez. Client bilgileri olmadan OAuth/gönderim başarılı sayılmaz.
- Bu kayıt kaynak onarımını ve D1 durumunu belgeler; Pages+Worker yeni yayın ve kullanıcı OAuth onayı/gerçek hesap smoke sonuçları ayrıca doğrulanmalıdır.

> Bu dosya KY ERP projesinde yeni sohbet, yeni ajan, yeni feature branch veya yeniden başlama durumunda **ilk okunacak güncel durum kaydıdır**. Teknik ve güvenlik kuralları için `AGENTS.md` üstündür; bu dosya ise kullanıcının kararlarını, aktif çalışma yönünü, son önemli gelişmeleri, kontrol bekleyen işleri ve devam noktasını tek yerde toplar.

## 1. Zorunlu başlangıç sırası

Yeni bir çalışma başlarken sırasıyla:

1. `AGENTS.md` dosyasını oku.
2. Bu dosyayı (`DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`) oku.
3. `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` dosyasını oku; son yapılan işler ve varsayılan modül sırası burada tutulur.
4. Çalışılacak modül için ilgili kodu ve varsa özel DOCS kaydını kontrol et.
5. Aktif branch / production branch / PR durumunu GitHub'dan doğrula.
6. Kullanıcı açıkça istemedikçe production deploy veya merge yapma.

Eski sohbet notları veya tarihli kaynak kayıtları bu dosyaya göre tarihsel referanstır. Güncel kod gerçeği ve bu dosyadaki son kararlar önceliklidir.

## 2. Sabit proje kimliği

- Repo: `cetin60kaya-lgtm/ky-erp`
- Production kaynak branch: `codex/model-uretim-kontrol-merkezi-final`
- Public site: `https://kyerp.net`
- ERP uygulaması: `https://app.kyerp.net`
- Canlı API: `https://api.kyerp.net`
- Frontend: `APP/app/ky-erp-frontend`
- Cloudflare API/Worker: `APP/cloud/ky-erp-api`
- Windows Desktop kaynakları: `APP/desktop/ky-pdks`
- File Hub Agent kaynağı: `tools/file-hub-agent`

## 3. 03.09.2026 itibarıyla ana çalışma kararı

Kullanıcının kesin kararı:

**KY ERP Desktop = geliştirme sonrası ilk gerçek kontrol ortamı.**

**GitHub = ana kaynak kodu, geçmiş ve güvenlik/yedek merkezi.**

**kyerp.net = yalnız Desktop üzerinde kontrol edilip kullanıcı tarafından onaylanan değişikliklerin yayınlandığı canlı ortam.**

Yeni akış:

`Kullanıcı isteği -> GitHub feature branch -> otomatik test/build -> KY ERP Desktop güncellemesi -> kullanıcı kontrolü -> düzeltmeler -> kullanıcı onayı -> gerekirse production/web yayını`

Kurallar:

- Canlı `kyerp.net` üzerinde deneme/geliştirme yapılmaz.
- Her küçük değişiklik için kullanıcı VS Code veya GitHub ile uğraştırılmaz.
- VS Code zorunlu çalışma bağı değildir; gerektiğinde yerel teknik müdahale için kullanılabilir.
- Asistanın güvenilir yazma noktası GitHub'dır.
- Desktop için mümkün olan en az kullanıcı müdahalesi hedeflenir.
- İleride Desktop'a `Güncelle ve yeniden başlat` tipi otomatik güncelleme kanalı eklenecek; **03.09.2026 itibarıyla bu özellik henüz tamamlanmış sayılmaz.**
- Production merge/deploy yalnız kullanıcı açıkça onayladıktan sonra yapılır.

## 4. Aktif Desktop çalışması

Aktif feature branch:

`codex/ky-erp-desktop-final-20260903`

Draft PR:

`#56 — KY ERP Desktop 1.7.2 — tam Windows ERP uygulaması`

Durum:

- Desktop normal/tam uygulama olarak ele alınıyor; demo/pilot değildir.
- Güncel React frontend masaüstü paketine gömülür; ayrı ikinci masaüstü tasarımı veya farklı menü oluşturulmaz.
- Paketli arayüz canonical origin ile `https://app.kyerp.net/index.html` kimliğinde çalışır.
- Canlı business API `https://api.kyerp.net` kullanılır.
- Kullanıcı 03.09.2026 tarihinde 1.7.2 sürümünün açıldığını ve gerçek KY ERP oturumuna giriş yapıldığını ekran görüntüsü ile doğruladı.
- PR #56 draft kalacak; kullanıcı modül kontrollerini bitirmeden production'a merge edilmeyecek.

### Desktop 1.7.x önemli düzeltmeler

- `1.7.0`: paket kök sanal-host navigasyonunda `ERR_ACCESS_DENIED` görüldü.
- `1.7.1`: doğrudan `index.html` açılışı çözüldü; ancak `http://localhost` origin sebebiyle canlı giriş API'si CORS/transport hatası verdi.
- `1.7.2`: paketli UI tekrar canonical `https://app.kyerp.net/index.html` origin'ine alındı; hem açılış hem canlı API giriş akışı birlikte çalışır hale geldi.

Bu iki hata tekrar üretilmemeli; Desktop origin kararı değiştirilirken API CORS/auth sözleşmesi birlikte kontrol edilmelidir.

## 5. Desktop kapsamı

Desktop içinde web ile aynı kaynak üzerinden şu ana bölümler bulunur:

- Muhasebe
- e-Belge / İşNet
- Desen
- Boyahane
- İK
- PDKS
- İmalat
- Mail & Dosyalar
- Bağlantılar & Depolama / KY File Hub
- Yönetim
- KY ERP Asistan

### İK özel kullanıcı kararı

Kullanıcı özellikle **İK Günlük Giriş / günlükçü girişi** tarafının webdeki mevcut çalışma ve tasarımla **bire bir aynı** olmasını istiyor. Masaüstü için ayrı ekran, ayrı tasarım veya farklı iş akışı yapılmayacak.

İK Günlük Personel ana ekranları:

- Günlük Giriş
- Günlük Personel Kartları
- Haftalık Özet
- Günlük Ödeme Fişleri

Aylık İK tarafı da aynı canonical frontend kaynağını kullanır.

Kontrol sırasında öncelik: **İK > Günlük Giriş**.

## 6. PDKS / Windows cihaz düzeni

- PDKS, KY ERP Desktop'ın bir modülüdür; Desktop'ın tamamı PDKS uygulaması değildir.
- Mevcut native kart cihazı entegrasyonu `KYERP.PDKS.Agent` Windows servisi üzerinden korunur.
- Native PDKS ekranı aynı ERP oturum/token bağlamını kullanır.
- Denetim/audit kullanıcılarında write yetkisi kapalı tutulur.

## 7. Depolama / KY File Hub ana kararı

Tek File Hub modeli korunacak.

Desteklenen V1 provider tipleri:

- `GOOGLE_DRIVE`
- `ONEDRIVE`
- `SHAREPOINT`
- `LOCAL_FOLDER`
- `NAS`

Desktop paketi mevcut KY File Agent + gömülü Node runtime yaklaşımını içerir. Kullanıcının ayrıca Node kurması hedeflenmez.

Bağlantılar & Depolama yönetim ekranları:

1. Genel Bakış
2. Dosya Servisleri
3. E-posta Hesapları
4. Bölüm / Dosya Atamaları
5. Dosya İndeksi
6. Senkronizasyon & Agent
7. Yedekleme & Loglar

Günlük kullanıcı alanı ayrıca **Mail & Dosyalar** modülüdür. Mail okuma/gönderme ve File Hub dosya kullanımı burada yapılır; provider/OAuth/klasör bağlantı yönetimi günlük ekrana karıştırılmaz.

Provider veya yerel path hiçbir modüle sabit kodlanmamalıdır; `AGENTS.md` File Hub kuralları geçerlidir.

## 8. Kullanıcının çalışma tercihi

- Minimum soru, minimum manuel işlem.
- Tek kurulum / tek güncelleme / mümkün olduğunca tek tık.
- Kurumsal ve temiz ürün; geçici demo isimleri kullanılmaz.
- Uygulama adı `KY ERP` / `KY ERP Desktop` çizgisinde kalır.
- Küçük görsel değişiklikler için yeniden ayrı masaüstü tasarımı yapılmaz; canonical frontend korunur.
- Kullanıcı uygulamayı açıp gerçek kullanım üzerinden ekran görüntüsüyle kontrol etmek istiyor.
- Asistan önemli kararları ve teknik dönüm noktalarını bu dosyaya kaydetmelidir.

## 9. Değişiklik kayıt kuralı

Bu dosya yalnız büyük kararlar ve devam için gerekli bilgilerle güncellenir. Her commit'in ayrıntısını buraya doldurma.

Aşağıdakilerden biri olduğunda güncelle:

- kullanıcı yeni bir kalıcı çalışma kuralı koyduysa,
- branch/PR ana yönü değiştiyse,
- yeni Desktop sürümü kullanıcı tarafından gerçek cihazda doğrulandıysa,
- önemli bir kök neden bulundu ve mimari karar değiştiyse,
- bir modül kullanıcı tarafından tamam/onaylandıysa,
- production'a geçiş kararı verildiyse,
- kritik açık iş veya blocker ortaya çıktıysa,
- eski bir karar geçersiz kılındıysa.

Her güncellemede mümkünse şu dört bilgiyi yaz:

- tarih,
- karar/gelişme,
- ilgili branch/PR/commit,
- sonraki net adım.

Şifre, MFA secret, API key, token veya kişisel gizli bilgiler bu dosyaya yazılmaz.

## 10. Kontrol ve yayın kuralı

Bir modül için doğru sıra:

1. Feature branch üzerinde değişiklik.
2. Test/lint/build.
3. Desktop paketi veya Desktop güncellemesi.
4. Kullanıcı gerçek kullanım kontrolü.
5. Gerekirse revizyon.
6. Kullanıcının açık `tamam / onay / canlıya al` kararı.
7. Production branch merge/deploy.
8. Canlı smoke/health/auth/modül kontrolü.

**Desktop'ta çalıştı = otomatik olarak production'a al demek değildir.**

Production yayınında tek canonical prosedür `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md` dosyasıdır. Normal canlıya almada kullanıcıdan PowerShell/Cloudflare tokenı istenmez; production merge sonrası Cloudflare Git Integration Pages ve Workers Builds'i otomatik yürütür. Worker build/test fail olursa manuel deploy ile bypass edilmez; log okunur, kaynak düzeltilir ve yeni production commitinin otomatik buildi beklenir.

## 11. Yeni sohbet için hazır devam özeti

Yeni sohbet KY ERP işiyle açılırsa şu gerçekler varsayılmalıdır:

- Ana hedef şu anda Desktop-first geliştirme/kontrol düzenidir.
- Aktif Desktop çalışma branch'i `codex/ky-erp-desktop-final-20260903` ve draft PR #56'dır.
- Kullanıcı Desktop 1.7.2'de uygulamanın açıldığını ve oturumun çalıştığını doğrulamıştır.
- İlk ayrıntılı modül kontrolü İK > Günlük Giriş tarafında yapılacaktır.
- GitHub kaynak merkezi olmaya devam eder; kullanıcı GitHub/VS Code işlemleriyle uğraştırılmaz.
- Onaylanmamış Desktop değişiklikleri kyerp.net'e taşınmaz.
- Sonraki ürünleştirme hedeflerinden biri Desktop otomatik güncelleme mekanizmasıdır.

## 12. Tarihsel yardımcı kaynaklar

- `AGENTS.md` — üstün teknik/güvenlik çalışma sözleşmesi.
- `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` — son yapılan işler + yeni sohbetlerin varsayılan çalışma sırası için güncel ana kaynak.
- `DOCS/AGENTS_RULES_BASE_PRE_STORAGE_20260902.md` — eski ayrıntılı kuralların tarihsel tabanı.
- `DOCS/KY_ERP_SOHBET_KAYNAK_KAYDI_2026-09-01.md` — 01.09 İşNet/tenant/deploy kararlarının tarihsel kaydı.
- `CHANGELOG.md` — sürüm/değişiklik geçmişi.

Bu dosya bu kaynakları kaldırmaz; **devam noktası için tek güncel indeks/kontrol merkezi** olarak kullanılır.

---

## 08.09.2026 — Android telefon/tablet tam işlem paritesi kilitlendi

- Kullanıcı kalıcı kuralı: PC tarayıcıda çalışan hiçbir KY ERP butonu veya işlemi Android telefon/tablette kaybolamaz ya da çalışamaz halde bırakılamaz.
- Canonical uygulama AppV3'tür; Android için ayrı business mantığı çoğaltılmaz. Telefon/tablet yalnız responsive görünüm profilidir.
- Production kaynakta PR #253 ile ortak dokunmatik katman tamamlandı; merge commit: `6340558201589009a163ad6a0755cfc400a81021`.
- Ortak katman 44 px dokunma hedefi, yatay tablo kaydırma, Android `visualViewport`/sanal klavye güvenliği ve yüzen Telefon Onayı düğmesi için alt güvenli alan sağlar.
- İşNet async PDF/XML/toplu yazdırma Android popup engeline dayanıklı hale getirildi; Desen ve Muhasebe çift-tıklama kısayollarında dokunmatik tek-dokunma yolu eklendi.
- Responsive profil/güvenlik menüsü, Bildirim Merkezi, Telefon Onayı, Ekran & Görünüm, PWA kurulumu ve Hızlı İşlem telefon/tablette erişilebilir kalır.
- Bu parite bundan sonra release blocker'dır: desktopta çalışan bir business işlem mobilde yoksa özellik tamam sayılmaz.
- Production yayın yolu değişmedi: GitHub Actions yok; production merge sonrası Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke.

## Son güncelleme


## 06.09.2026 — Yeni sohbet devam kaynağı ve iş sırası kilitlendi

- Yeni ana devam özeti oluşturuldu: `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md`.
- Yeni sohbet/ajan artık `AGENTS.md -> Proje Kontrol Merkezi -> Güncel Devam Kaynağı` sırasını kullanır.
- Cloudflare/auth/deploy/AI Gateway son durumu bu kaynakta tek özet halinde tutulur.
- Varsayılan modül sırası: e-Belge/İşNet -> Muhasebe/Cari/FİBE -> PDKS/İK -> File Hub/Mail -> AI/Asistan.
- Production HEAD paralel sohbetlerde değişebileceği için her yeni işlemde güncel HEAD doğrulanır.

## 06.09.2026 — Cloudflare çekirdek rollout tamamlandı

- Cloudflare Pro, Git Integration, Pages/Workers Builds, Turnstile, login rate limit, API cache bypass, bot policy audit ve owner session security çekirdek production katmanı olarak tamam kabul edilir.
- WAF Cloudflare Managed Ruleset **Observe/Log** modunda kalır; yeterli event verisi görülmeden kör enforce yapılmaz.
- OWASP ikinci managed paket ve geniş Bot Fight block/challenge bilerek açılmaz; API/mobile/PDKS/File Agent false-positive riski nedeniyle bunlar "eksik" değil kontrollü deferred karardır.
- Management token least-privilege kuralı: D1 yalnız **Read**; D1 Edit/Billing/API Tokens/Account Members/DNS Edit verilmez.
- Workers AI binding `AI` aktif; AI çağrıları `default` AI Gateway üzerinden, cache bypass ve varsayılan persistent prompt logging kapalı şekilde yürütülür.
- Tenant/permission guard ve KY ERP billing ledger AI çağrısından önce/sonra korunur; serbest SQL/write executor açılmaz.
- Queues/Workflows/Vectorize/AI Search mevcut ERP'nin production blocker'ı değildir. Somut ürün özelliği gerektiğinde ayrı kontrollü feature paketi olarak ele alınır.
- Cloudflare tarafında bundan sonra "çekirdek eksik kurulum" yerine modül/ürün geliştirme sırasına dönülür.

## 06.09.2026 — Canonical Cloudflare canlıya alma prosedürü kilitlendi

- Kullanıcı kararı: normal production release sırasında **PowerShell veya manuel Cloudflare deploy adımı olmayacak**.
- Tek yayın kaynağı: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.
- Normal yol: feature branch -> test/build -> kullanıcı onayı -> production merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke.
- GitHub Actions production deploy yolu değildir.
- Worker build kapısı `npm run typecheck && npm test && npm run build`; fail olursa deploy durur.
- Cloudflare otomatik Worker build failinde doğru davranış: log -> kök neden -> feature branch düzeltme -> regression testi -> production merge -> yeni otomatik build. Manuel deploy ile test kapısı bypass edilmez.
- Pages success + Worker fail = release tamam değildir.
- Paralel sohbetler production HEAD'i ilerletirse eski SHA körlemesine deploy edilmez; en güncel production HEAD doğrulanır.
- D1 migration backup/readiness/hedefli migration ile ayrı güvenlik kapısıdır.
- 06.09.2026 doğrulanmış incident: bildirim Worker testindeki extensionless Node ESM importu `ERR_MODULE_NOT_FOUND` oluşturdu; kaynak düzeltmesi explicit `.ts` import + kontrat testi ile yapıldı. Bu olay otomatik Worker buildin çalıştığını, test kapısının deployu doğru şekilde durdurduğunu doğruladı.

## 06.09.2026 — Canlı yayın ve Bildirim Merkezi final kararı

- Production deploy **GitHub Actions ile yapılmayacak**.
- Canonical yol: `production branch push -> Cloudflare Git Integration -> Cloudflare Pages / Workers Builds`.
- GitHub Actions yalnız açık kullanıcı isteğiyle manual tanılama/test için çalıştırılabilir; production deploy yolu değildir.
- D1 migration ayrı güvenlik kapısıdır: backup -> readiness -> hedefli/additive migration -> schema audit.
- Sağ üst bildirim zilindeki sabit `3` kaldırıldı.
- Bildirim Merkezi gerçek veriye bağlandı: bekleyen giriş onayları, e-Belge açık sorunları, vadesi gelen/geciken ödemeler.
- Rozet gerçek unreadCount gösterir; 0 ise görünmez.
- Bildirimler tenant + kullanıcı modül yetkisine göre filtrelenir.
- Okundu durumu mevcut `json_store` içinde kullanıcı + firma bazında tutulur; yeni migration gerekmez.
- Ana devam kaynağı: `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`.

**04.09.2026 — Cloudflare Pro + Actions'sız production yayın düzeni kesinleştirildi.**

- `kyerp.net` için Cloudflare Pro aktif.
- Frontend `ky-erp-frontend` Cloudflare Pages Git Integration production deploy'u başarıyla doğrulandı.
- Worker `ky-erp-api` Cloudflare Workers Builds production deploy'u başarıyla doğrulandı.
- Production branch her iki Cloudflare projesinde de `codex/model-uretim-kontrol-merkezi-final`.
- Frontend root `APP/app/ky-erp-frontend`; build `npm run build`; output `dist`; `VITE_API_URL=https://api.kyerp.net`.
- Worker root `APP/cloud/ky-erp-api`; build `npm run typecheck && npm test && npm run build`; deploy `npm run deploy`.
- Preview/non-production automatic deployments kapatıldı.
- GitHub Actions production/push otomasyonu manual fallback'e çevrildi; canonical yayın Cloudflare Git Integration.
- D1 migration normal Git auto-deploy'a bırakılmaz; full backup + readiness + hedefli migration ayrı güvenlik kapısıdır.
- Cloudflare Pro / AI / yetki / rollout ana kaynağı:
  `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`.
- 04.09 tarihli "sonraki adım token/WAF" notu tarihsel kalmıştır; güncel final durum yukarıdaki 06.09 Cloudflare çekirdek rollout kaydındadır.

**03.09.2026 — Desktop-first çalışma düzeni kesinleştirildi.**

- Desktop 1.7.2 gerçek Windows cihazda açıldı ve ERP oturumu doğrulandı.
- GitHub ana kaynak olarak kalacak.
- Kullanıcı GitHub/VS Code ile manuel uğraşmayacak.


---

## 06.09.2026 — e-Belge / Muhasebe canonical canlı yayın onayı

- Kullanıcı PR #77 kapsamı için açıkça **canlıya al** onayı verdi.
- Canlı birleşimde güncel production auth, PDKS, Bildirim Merkezi ve Cloudflare-only yayın sözleşmesi korunur.
- İşNet + manuel e-Belge havuzu canonical `accounting_documents` akışına alınır; rapor read-modeli canonical kaynakları kullanır.
- XML/PDF/görsel OCR, firma/ürün alias, EXPENSE/STOCK/BOYAHANE yönlendirme ve LOT kuralları aynı paket içindedir.
- Resmî e-Fatura/e-İrsaliye gönderimi otomatikleştirilmez; kullanıcı onayı zorunluluğu devam eder.
- `0046_accounting_canonical_report_controls.sql` bu canlı yayında production D1'e uygulanmaz. İlgili kod tablo yoksa mevcut `json_store` fallback'ini kullanır; veri kaybı riski alınmaz.
- 0046 ileride ayrı bakım penceresinde remote D1 full backup + readiness + hedefli additive migration ile ele alınacaktır.


## 06.09.2026 — Mail & Dosyalar / Bağlantılar & Depolama mimarisi kilitlendi

- Aktif geliştirme branch'i: `codex/mail-iletisim-merkezi-core-v1b-20260906`.
- PR: **#94 — Mail: İletişim & Dosyalar merkezi + provider-independent Mail Core**.
- Kullanıcı tarafındaki ana modül adı **Mail & Dosyalar** olarak netleştirildi.
- Yönetim tarafındaki ana modül adı **Bağlantılar & Depolama** olarak netleştirildi.
- Bağlantılar & Depolama sekmeleri: Genel Bakış, Dosya Servisleri, E-posta Hesapları, Bölüm / Dosya Atamaları, Dosya İndeksi, Senkronizasyon & Agent, Yedekleme & Loglar.
- Mail & Dosyalar sekmeleri: Gelen Kutusu, Gönderilenler, Taslaklar, Yanıt Bekleyenler, Şablonlar, Dosyalar, Son Kullanılanlar, Firma Dosyaları.
- Microsoft 365/Outlook ilk gerçek mail adapterıdır; mevcut File Hub Microsoft Graph OAuth uygulaması ve şifreli secret katmanı yeniden kullanılır.
- Gmail/JMAP/IMAP-SMTP adapterı hazır olmadan bağlı/kullanılabilir gösterilmez.
- Mail hesap erişimi tenant + kullanıcı posta kutusu üyeliğiyle sınırlandırılır.
- Kritik ortak/bölüm/Muhasebe/e-Belge posta kutularında Firma Sahibi -> Uygulama Sahibi sıralı çift onay uygulanır.
- Gönderim açık kullanıcı işlemi gerektirir; AI otomatik mail göndermez. Belirsiz provider sonucu otomatik retry edilmez.
- Mail Core additive D1 şeması `0050_mail_communication_core.sql` dosyasıdır; production öncesi D1 full backup + readiness + hedefli migration + schema doğrulaması gerekir.
- Bu paket henüz production merge/deploy sayılmaz; kullanıcı açıkça **canlıya al** demeden production branch'e taşınmaz.


## 06.09.2026 — Mail & Dosyalar production merge + P1 hotfix

- PR #94 production branch'e merge edildi.
- Production merge commit: `efc774fc4891d6c4fa72578f4d108b2a21c80f42`.
- Merge sonrası yakalanan P1: normal kullanıcıların günlük Dosyalar sekmesi owner-only File Hub indeks endpointlerini çağırıyordu.
- P1, PR #103 ile düzeltildi; günlük dosya görünümü artık `/api/mail/files` üzerinden tenant + MAIL izni + kullanıcının modül `canView` ilişkilerine göre scope edilir.
- P1 hotfix production commit: `322362bc35a229f100f0ce6f33025b86cb7d1444`.
- `0050_mail_communication_core.sql` bu sohbet oturumunda production D1'e uygulanamadı; Cloudflare D1 write yetkili aracı mevcut değildi.
- Bu nedenle Mail Core fail-soft çalışır: Mail & Dosyalar arayüzü canlıda önizleme/kurulum bekliyor durumunda açılabilir; mail hesap talebi, bağlantı ve gönderim 0050 uygulanana kadar kapalıdır.
- 0050 aktivasyonu için canonical sıra değişmez: remote D1 full backup -> readiness -> hedefli 0050 additive migration -> schema doğrulaması. GitHub Actions production deploy için kullanılmaz.


## 06.09.2026 — İK / PDKS kesin ayrım + yıllık izin bakiye final paketi

- Aktif feature branch: `codex/ik-pdks-yillik-izin-final-20260906`.
- İK görünür menüsü yalnız özlük ve finans yönetimidir: İK Özet, Personel Kartları, Maaş / Yol / Banka / Elden, Mesai / Avans / Kesinti, Bordro & Ödeme, SGK / Evrak / Ay Sonu.
- İK içinde ikinci PDKS/puantaj/giriş-çıkış/günlük personel ekranı açılmaz; eski İK içi PDKS rotaları güvenli biçimde personel/finans ekranlarına yönlenir.
- PDKS; giriş/çıkış, puantaj, vardiya, terminal/senkron ve izin hareketlerinin operasyonel sahibidir.
- İK Personel Kartı yıllık izin özlük özetini tek ekranda gösterir: hakediş, devreden, toplam hak, kullanılan, kalan ve hakediş geçmişi.
- Kullanılan/kalan yıllık izin hesabı modern `ik_leave_plans` ile tarihsel `hr_leave_records_v2` kayıtlarını exact tekrarları çift saymadan birlikte okur.
- Personel izin geçmişi de modern PDKS izin kayıtları + tarihsel kayıtları tek listede gösterir.
- D1 reset/drop veya yeni migration yoktur; mevcut personel/izin/bordro verisi korunur.
- İK ödeme çıktıları da aynı pakette finalleştirildi: A4 yatay ödeme listesinde HKN personel adının altına alınarak sıkışma azaltıldı; EK sütunu ayrı ve pozitif tutar vurgulu; 10'lu A4 toplu fiş kuralı korunur.
- EK ödeme tutarı olan personelde tekli ve 10'lu fişte altta kesilebilir/ayrılabilir `EK ÖDEME` kuponu oluşur; EK=0 ise kupon görünmez.
- Bu kayıt feature branch durumudur; production merge/deploy yapılmamıştır. Önce doğrulama, ardından kullanıcı açık canlı onayı gerekir.


## 06.09.2026 — Kurumsal Yönetim / Süper Yönetici modeli kilitlendi

- Yönetim modülü kurumsal isimlendirmeye geçirildi.
- `Uygulama Sahibi` kullanıcı adı/etiketi yerine **Süper Yönetici** kullanılır.
- Yönetim menüsü: **Yönetim Konsolu**, **Süper Yönetici & Güvenlik**, **Kullanıcı & Yetkiler**, **Firmalar & Organizasyon**, **Firma Paket / Kullanım**.
- Ayrı **Giriş Onayları** sekmesi kaldırıldı; eski URL/alias Yönetim Konsolu'na yönlenir.
- Bekleyen yeni cihaz girişleri Yönetim Konsolu içindeki **Karar Merkezi** kartında gösterilir.
- **Firma Sahibi / İşveren = COMPANY_ADMIN**. Kendi firmasının kullanıcı, Mail ve Drive/File Hub yönetim kararlarını verir.
- Mail hesabı bağlantı onayı tek firma-sahibi adımıdır; eski uygulama-sahibi ikinci onay adımı kaldırılmıştır.
- Firma sahibine düşen Mail ve giriş onayları **Süper Yönetici bildirim merkezine tüm firmalar üzerinden aynalanır**. Süper Yönetici gözetim görünürlüğüne sahiptir; firma sahibinin Mail karar adımını sessizce devralmaz.
- Google Drive / OneDrive / SharePoint / File Hub yazma-yönetim işlemleri ilgili firmanın Firma Sahibi / İşveren rolüne bağlandı.
- Firma kartında o firmaya bağlı **işveren, muhasebe ve diğer bölüm kullanıcıları**, aktif/pasif durumu ve kişi sayıları görünür.
- Kullanıcı & Yetki Merkezi firma filtresi, rol/firma görünürlüğü ve daha geniş kurumsal kart düzeniyle yenilendi.
- Üst sağ kullanıcı profilinde ham `SUPER_ADMIN` yerine **Süper Yönetici**, `COMPANY_ADMIN` yerine **Firma Sahibi / İşveren** gösterilir.
- Regression sözleşmesi: `APP/cloud/ky-erp-api/src/admin-governance-v2-contract.test.ts`.


## 06.09.2026 — Yönetim production sonrası erişim hotfix'i

- PR #120 production'a merge edildi ve kurumsal Süper Yönetici / Firma Sahibi modeli canlı kaynakta yerini aldı.
- Merge sonrası P1 incelemesinde Firma Sahibi / İşveren'in backend'de File Hub yönetim yetkisi olmasına rağmen frontend `STORAGE_ADMIN` modülüne erişemediği doğrulandı.
- Hotfix ile `STORAGE_ADMIN` auth module contract'a eklendi; COMPANY_ADMIN için ADMIN + STORAGE_ADMIN implicit görünür/yazılabilir yetki verildi.
- Login/session permission payload, frontend AuthContext, kullanıcı yetki editörü ve legacy Prisma enum aynı contract'a çekildi.
- Kullanıcı & Yetkiler ekranında gömülü kalan ikinci Giriş Onayları bloğu kaldırıldı. Giriş onayı tek yüzeydir: **Yönetim Konsolu -> Karar Merkezi**.


## 06.09.2026 — Süper Yönetici hesap kurtarma final düzeni

- Süper Yönetici güvenlik ekranındaki genel HTTP 500 recovery hatası için auth recovery şeması runtime-readiness ile korumaya alındı.
- `auth_owner_recovery_questions` ve `auth_owner_recovery_challenges` tabloları ile gerekli 0019/0021 security kolonları idempotent olarak doğrulanır/eksikse hazırlanır.
- Şema hazırlanamazsa global `INTERNAL_ERROR` yerine `OWNER_RECOVERY_SCHEMA_UNAVAILABLE` ile anlaşılır 503 döner.
- Eski tek kullanımlık recovery-code tablosu artık kurtarma akışının zorunlu bağımlılığı değildir; mevcutsa yalnız güvenli şekilde emekliye ayrılır.
- Süper Yönetici ekranındaki bölüm adı **Hesap Kurtarma ve Kimlik Doğrulama** olarak yenilendi.
- Durum kartları: Kurtarma Durumu, Güvenlik Soruları 3/3, E-posta, Kurtarma Kanalı.
- Üç güvenlik sorusu ayrı kartlarda gösterilir. Yeni yazılan cevaplarda **Göster / Gizle** vardır.
- Daha önce kaydedilmiş cevaplar güvenlik gereği düz metin olarak geri getirilemez; salt + PBKDF2 hash saklama kuralı korunur. Kayıtlı cevap değiştirilecekse yeni cevap yazılır.
- Kullanıcı arayüzünde eski tek kullanımlık kurtarma-kodu mantığı kaldırıldı. Canonical kurtarma: parola doğrulaması -> doğrulanmış e-posta/SMS -> rastgele 2 güvenlik sorusu -> Authenticator yeniden kurulumudur.
- Cloudflare Access / Zero Trust, ileride yalnız Süper Yönetici için ek dış güvenlik katmanı olarak değerlendirilebilir; mevcut KY ERP kurtarmasının yerine geçirilmedi ve normal kullanıcı akışına ikinci giriş eklenmedi.
- Regression: `APP/cloud/ky-erp-api/src/super-admin-recovery-final-contract.test.ts`.


## 07.09.2026 — iPhone kesin telefon onayı + firma sahibi/Süper Yönetici akışı

- Kullanıcı KY ERP girişinde 6 haneli Authenticator kodu yerine güvenilir telefona gelen bildirimin birincil ikinci faktör olmasını ve iPhone desteğinin kesinleştirilmesini onayladı.
- Aktif paket: PR #234 / `codex/auth-phone-push-approval-v1-20260907`.
- Güvenilir cihaz ekleme mevcut parola step-up ister; cihaz capability tokenı yalnız ilk kayıt cevabında verilir ve sunucuda hash tutulur.
- iPhone/iPad Web Push için KY ERP Ana Ekrana eklenmiş web app olarak açılır. iOS native bildirim action butonlarını göstermese veya `notificationclick` olayı çalışmasa bile uygulama foreground olduğunda global PhoneApprovalInboxBridge pending isteği okuyup **Onayla / Reddet** ekranını açar.
- Google/Microsoft Authenticator kaldırılmadı; `6 haneli kod ile devam et` fallback'i korunur. `BOTH_MFA` politikası telefon onayıyla gevşetilmez.
- Normal kullanıcıda `approvalRequired` açıksa giriş onayı varsayılan olarak ilgili Firma Sahibi / İşveren (`COMPANY_ADMIN`) telefonuna gider. Süper Yönetici push aynalaması firma bazında Yönetim ekranından açılabilir.
- Telefon push device/challenge/firma bildirim tercihleri yeni D1 migration yerine mevcut tenant-kapsamlı `json_store` üzerinde tutulur; bu paket production D1 schema write gerektirmez.
- Canlı yayın kullanıcı tarafından açıkça onaylandı. Canonical yol değişmez: production merge -> Cloudflare Git Integration Pages + Workers Builds -> canlı health/auth/frontend smoke. GitHub Actions production deploy için kullanılmaz.


## 09.09.2026 — Günlük Operasyon bağımsız modül olarak kilitlendi

- İK içindeki günlük çalışan akışı görünür İK menüsünden ayrıldı.
- Yeni bağımsız modül: **Günlük Operasyon** (`GUNLUK_OPERASYON`).
- Sekmeler: **Ana Ekran**, Günlük Giriş, Personel Kartları, Haftalık Özet, Ödeme Fişleri.
- Ana Ekran operasyon kontrol panelidir: bugün gelen kişi, gündüz/gece adetleri, bu haftanın tahmini ödemesi, gün gün haftalık durum, bugünkü ekip, bu hafta/geçen hafta karşılaştırması ve son dönem günlük hareket özeti.
- Günlük Operasyon alt ekranları mevcut canonical günlük personel / devam API'lerini kullanır; aylık İK personel, izin, mesai, bordro ve evrak kaynaklarını yüklemez.
- İK görünür sekmeleri yalnız aylık/personel-finans akışıdır. Günlük Operasyon ayrı modül/yetki olarak yönetilir.
- **DENETIM** rolünde Günlük Operasyon varsayılan ve canonical olarak kapalıdır; Denetim yalnız mevcut İK denetim kapsamını görür.
- Süper Yönetici yeni `GUNLUK_OPERASYON` yetkisini Kullanıcı & Yetkiler ekranından ayrı yönetebilir.
- Legacy Prisma `ModuleKey` enum ve migration da `GUNLUK_OPERASYON` ile hizalandı.
- Regression: `APP/cloud/ky-erp-api/src/daily-operations-separation-contract.test.ts`.

## 12.09.2026 — KY ERP Sistem Merkezi / Sistem Nöbetçisi

- Yeni bağımsız yönetim alanı: **Sistem Merkezi > Sistem Nöbetçisi**. Amaç cihaz sağlığı, Wake-on-LAN, güvenli uzak erişim ve müdahaleyi tek merkezde toplamaktır.
- Yetki modeli ADMIN modülünden bağımsızdır. Yalnız `SUPER_ADMIN` cihaz/yetki yönetir; diğer kullanıcılar yalnız Süper Yönetici tarafından verilen cihaz + aksiyon kapsamlı `TEMPORARY`, `ONE_TIME` veya `PERMANENT` grant ile erişir.
- V1 veri modeli yeni production D1 migrationı açmaz; mevcut `json_store` üzerinde additive device, grant, command ve event kayıtları kullanır.
- Windows KY Sentinel Agent cihaz başına hash'li token kullanır; token Windows'ta DPAPI LocalMachine ile korunur. Agent SYSTEM Scheduled Task olarak açılışta başlar, serbest shell çalıştırmaz ve yalnız allowlist komutları kabul eder.
- Wake-on-LAN hedef cihaz tarafından değil, aynı site içindeki çevrimiçi `WAKE_BRIDGE` yetenekli agent tarafından gönderilir. Hedef PC'nin MAC adresi kayıtlı olmalıdır.
- Uzak masaüstü ERP'ye sabit bir ürüne bağlanmaz; adapter alanı korunur. İlk tercih RustDesk, AnyDesk acil fallback; launch URL yalnız HTTPS kabul edilir.
- Telefon/tablet/PC aynı responsive Sistem Merkezi ekranını kullanır; mobilde uzak bağlantı popup engeline karşı kullanıcı tıklamasında pencere önceden ayrılır.
- Feature branch: `codex/system-sentinel-remote-access-v1-20260912`.
- Frontend doğrulama: 131/131 test + lint + production build başarılı. Worker doğrulama: typecheck + 405/405 unit test + local auth integration + Wrangler dry-run build başarılı. Agent PowerShell parse kontrolü başarılı.
- Production D1'e yazılmadı ve production deploy yapılmadı. Canlı yayın canonical onay/merge/Cloudflare Git Integration kapısından sonra yapılacaktır.
- Fiziksel WoL kapanma-açılma testi, hedef cihazdan ayrı 7/24 açık LAN Bridge doğrulanmadan yapılmayacaktır.


## GitHub maliyet / Actions tek düzen — 04.10.2026

- GitHub ek kullanım bütçeleri 0 USD ve limitte kullanım durdurma yaklaşımı korunur.
- Copilot Free varsayılandır; ücretli Copilot/ek kredi/ücretli GitHub servisi kullanıcı açıkça istemedikçe açılmaz.
- Otomatik CI için tek canonical kapı: `.github/workflows/ui-canonical-acceptance.yml`; normal geliştirmede yalnız hedef PR değişikliklerinde çalışır ve aynı işin eski koşusunu iptal eder.
- PDKS Windows/native build, PDKS web kontrolü, Muhasebe geniş kabul, production smoke, security deploy ve günlük operasyon deploy akışları varsayılan olarak `workflow_dispatch` ile manuel çalıştırılır.
- Production yayın akışları genel kod push'una bağlanmaz; açık release kaydı veya manuel tetik gerekir.
- Yeni workflow eklemek yerine mevcut canonical akış genişletilir. Yeni otomatik push/schedule ancak kullanıcı açıkça onaylarsa eklenir.
- Artifact retention varsayılan 3 gündür; workflow kendi commit/push işlemiyle sonsuz tetikleme döngüsü oluşturamaz.
- Ayrıntılı ve üstün kural kökteki `AGENTS.md` içindeki **GitHub maliyet ve Actions ana kuralı — 04.10.2026** bölümüdür.


## Remote Desktop / MCP kota koruma — 04.10.2026

- Remote Desktop Commander artık varsayılan araç değildir; yalnız gerçekten yerel PC işi için kullanılır.
- Repo/GitHub, Cloudflare, public web, sohbet dosyaları ve genel analiz işlerinde ilgili connector/Files/container/web tercih edilir; hedef Remote çağrısı 0'dır.
- Basit yerel iş hedefi 1–3, orta iş 5–8 çağrıdır. 10 üzeri tahmin ediliyorsa önce komutlar tek PowerShell/batch scriptine birleştirilir.
- `start_process` + `read_process_output` polling döngüsü, aynı dosyayı tekrar tekrar okuma ve çok sayıda küçük edit çağrısı yasaktır.
- Çoklu dosya/klasör işlemleri tek çağrıda batch edilir; son doğrulama mümkünse tek kontrolle yapılır.
- Ayrıntılı ve üstün kural kökteki `AGENTS.md` içindeki **Remote Desktop Commander kullanım ana kuralı — 04.10.2026** bölümüdür.

## 09.10.2026 — KY ERP TEST giriş güvenliği: kaynak çelişkisinin giderilmesi
- Kaynak nedeni: D1 migration `0029_auth_security_policy_guard.sql` trigger'ı `PASSWORD_ONLY` değerini ve 36000 saniyeden farklı session süresini reddediyor; `/api/auth/status` da `passwordOnlyEnabled:false` bildiriyor. Önceki PR #410/#411 UI bileşenlerinin sunduğu salt parola seçeneği gerçek canlı güvenlik politikası ile uyumsuzdu. Kullanıcıda doğrulanamayan giriş politikası hatasına yol açtı.
- Düzen: `auth-policy-cloud.ts` PATCH isteklerinde yasak politikayı açık `AUTH_MFA_POLICY_REQUIRED` (409) hatasıyla önceden reddeder. Yönetim ekranından sahte 'Sadece parola' seçimi kaldırılır; KY ERP TEST güvenli hazırlama düğmesi sadece Gör yetkilerini bırakır, sunucudan tekrar doğrular ve yalnız test hesabının eski oturumlarını kapatır. KY Güvenlik / Authenticator MFA zorunluluğu korunur.
- Kullanıcı testini bir kez gerçek onaylı oturumla başlatabilir; bütün 14 modülün kimlik doğrulanmış uçtan uca testi henüz tamamlandı sayılmaz. Yeni D1 migration veya ikinci test sistemi oluşturulmaz. Yayın gerçek Actions kanıtına göre ayrıca kaydedilir.

## 25.10.2026 — Tek kaynak kontrolü ve muhasebe ödeme planı ilk düzeltmesi

- **Tek ve üstün proje kontrol belgesi yine bu dosyadır.** Detaylı (ikincil) teknik modül/klasör envanteri: [KY_ERP_TEK_KAYNAK_MODUL_KONTROL_2026-10-25.md](KY_ERP_TEK_KAYNAK_MODUL_KONTROL_2026-10-25.md). Bu belge yeni alternatif canonical kaynak ilan edilmez.
- Kod kaynağı: `codex/model-uretim-kontrol-merkezi-final`; `main` üretim değil. UI: `AppV3`, `moduleRegistry`; Worker: `APP/cloud/ky-erp-api`. Yerel tek kök kuralı ve D1 veri sahipliği değişmedi.
- Muhasebe 7 ana sekme, e-Belge 9, Günlük Operasyon 5 sekme kaynak üzerinden incelendi. Kod/mevcut bileşen **saha kabulü** anlamına gelmez.
- İlk feature: `fix/muhasebe-odeme-plan-tek-kaynak-20261025`. Gecikenler / Tüm Planlar + mevcut ödeme endpointinden okuma, gerçek ödeme defter yazımı için teyit kartı ve yinelenen tıklama kilidi, güncelleme ve vade yardımcı testi. 25.10.2026 **PR #444 merged** SHA `4807b2845d16b848fc9e3abd164443b30badec48`, [CI #40193864397](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40193864397) frontend+Worker SUCCESS. [Pages #40194066735](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40194066735) SUCCESS, release SHA `2f0122716173fc86ca91105a5e60b44c5e6b1e29`, ancestry merge→release behind=0 / ahead=1, live bundle + Günlük Operasyon chunk proof PASS. **Muhasebe yetkili oturumda gerçek ödeme testi ayrıca bekliyor; üretim finans verisi test için değiştirilmedi.**
- Kaynak temizliği için `DOCS/docs`, `TOOLS/tools`, sürümlü `DEPLOY`, legacy Nest ve çoklu workflows **doğrudan silinmeyecek**. Önce import/CI/runtime referans taraması, sonra test ve manifestli karantina. Yeni paralel repo/ana klasör oluşturulmaz.
- İmalat 100 kayıt/sayfalama [PR #443](https://github.com/cetin60kaya-lgtm/ky-erp/pull/443) açık; bu muhasebe dalının kapsamı dışında tutulur.
