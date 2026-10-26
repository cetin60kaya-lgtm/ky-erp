# KY ERP — 19 sekme güncel kaynak, otomatik test ve saha kabul matrisi

## 26.10.2026 — CANLI D1 0062 UYGULANDI, TEK-SEFERLIK IZIN KAPATILDI (EN GUNCEL)

- **PR #474**: Yalniz 0062 icin yedekli ve ayri onayli GitHub Worker migration kapisi merged `c9a226b779c5b9992840cc316bc784fa4c23a70e`; [CI #40279521273](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279521273) Worker+Frontend SUCCESS.
- **Canli migration [#40279707049](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279707049)** SUCCESS, SHA `180c1f993e2ebd17e5ad93854b643e7776222582`. `ky-erp-db` D1 tam export backup ve 20.8 MB GitHub artifact saklandi; **yalniz** `0062_accounting_physical_receipt_journal.sql` uygulama/dogrulama adimi SUCCESS. 2 tablo, 4 index, 1 trigger, 7 zorunlu alan, ilk anda 0 yeni journal/reconciliation satiri dogrulandi. Worker deploy ve API health PASS.
- **Tek-seferlik yetki kapandi**: release commit `3fd2873ec4428f0b58ec6592be54acf1666881a6`; `applyMigrations=false`, `applyPhysical0062=false`, `migrationApprovedByUser=false`. [Izin kapali tekrar Worker yayini #40279954615](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40279954615) SUCCESS, 0062 ve diger migration adimlari SKIPPED, Worker deploy/API health PASS.
- **GUNCEL DUZELTME:** Asagidaki "#472 migration onayi bekliyor" kaydi TARiHSELDIR, artik gecerli DEGIL. 0062 schema canlida mevcuttur. Ancak canli/gercek LOT–irsaliye–Boyahane/fatura yetkili E2E, gercek ISNET/banka ve 19 sekmenin saha kabul testleri HALA YAPILMADI; 19/19 PASS ilan edilmez.
- Canli D1'de test amacli cari, banka, fatura veya stok hareketi uretilmedi. Bu islem yalniz onayli additive 0062 schema degisikligi ve Worker deployudur.



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


## 26.10.2026 — Son kesin kayıt / İşNet sertleştirme PR #468 (Worker canlı)
- [PR #468](https://github.com/cetin60kaya-lgtm/ky-erp/pull/468) merged `fc1a5fbb5bc05d64ff8b51baa6f89d436d498285`. [CI #40243561868](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243561868): Frontend ve Worker SUCCESS.
- Kesin kayıt sırasında `FINALIZING/APPROVED/FINALIZE_RETRY` belgeye dış PATCH, tekil/toplu eşleştirme kilidi eklendi; PATCH transaction sonrası etkilenen satır denetimli. Finalizasyon içi yetkili eşleştirme korunur. İşNet HTTP 200 ancak boş veya doğrulama yapısı olmayan cevap artık BAĞLI değil `UNVERIFIED`.
- [Son Worker production #40243691172](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243691172) SUCCESS SHA `1eb82c38f259a48f666edc6c74715c3b951cb2f7`: tam D1 yedeği, artifact, migrations SKIPPED, salt-okunur schema, Worker deploy ve canlı API health PASS. PR #468 merge SHA atası: `behind=0`.
- Son frontend runtime değişikliği önceki [Pages #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537) SUCCESS SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`; PR #468 yalnız Worker + test değiştirdiğinden yeniden Pages dağıtımı gerekmedi.
- Kalan P0 engel: fiziksel STOCK/BOYAHANE/LOT kesin kaydında dayanıklı atomik outbox/recovery hâlâ eksik; fail-closed koruması devam ediyor. Rol/tenant oturumlu E2E, gerçek İşNet/banka/makine testleri yapılmadı; production migration izni verilmedi. **19/19 tam saha kabul PASS değil.**


## 26.10.2026 — GÜNCEL KARAR: P0 19 SEKME KOD, OTOMATİK TEST VE CANLI KANITI

Bu bölüm günceldir; aşağıdaki 25.10.2026 kayıtları önceki sürümün tarihsel kanıtıdır. **19/19 işletme E2E PASS DEĞİL.** Stok/LOT kesin kayıt zinciri tek atomik/outbox işlem haline gelene kadar bu belgelerde muhasebeleştirme bilinçli biçimde fail-closed kalır; günlük fiziksel stok akışı tamamen onaylanmış sayılmaz. Onaylı HTML, Shell, güvenlik, İK ve Günlük Operasyon ortak koduna dokunulmadı.

**Son P0 PR / CI:**
- [#463 Ödeme planı](https://github.com/cetin60kaya-lgtm/ky-erp/pull/463) merged `45bfc33866810f672988f8bd94d87787fe590b13`, [CI #40225228760](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225228760) SUCCESS. İzole SQLite 20/100 eşzamanlı plan, kuruş, geri yazma, batch rollback.
- [#464 İmalat fişi](https://github.com/cetin60kaya-lgtm/ky-erp/pull/464) merged `65e410abe1452f066fd6220591f64274237f3b73`, [CI #40225824087](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225824087) SUCCESS. İzole SQLite 20/100 tek kayıt/link, payload çakışması ve link hata rollback.
- [#465 e-Belge CAS ve İşNet](https://github.com/cetin60kaya-lgtm/ky-erp/pull/465) merged `0140c5f6ae204ebe23616dd1fd5057807c438098`, [CI #40226730180](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40226730180) SUCCESS. CAS 20/100, user.id/onay/sürüm, sağlayıcı salt-okunur sağlık 401/403/timeout.
- [#467 Finansal kesin kayıt](https://github.com/cetin60kaya-lgtm/ky-erp/pull/467) merged `0b265476d905ef2f8b86c2d9bd551512393a7f32`, [CI #40242596733](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242596733) SUCCESS. Cari+bakiye+defter+KDV+POSTED tek D1 batch, 20/100 paralel gerçek SQLite ve hata enjeksiyonu; **yalnız fiziksel stok etkisiz belge**.
- **[Worker üretim #40242759411](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242759411)** SUCCESS SHA `39b4558b48e22dc49a3dd8e556e0f975acf2a27b`: tam D1 backup artifact, schema salt okunur, canlı API health; **tüm migration adımları SKIPPED**.
- **[Pages üretim #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537)** SUCCESS SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`: gerçek deploy ve public bundle/Günlük Operasyon chunk smoke.
- PR #463/#464/#465/#467 merge SHA'larının Worker ve Pages sürümleriyle karşılaştırmasında **behind=0** (tümü canlı yayımlanan kaynakların atası). Eşzamanlı kayıt sonuçları **Node node:sqlite yerel D1-benzeri fixture**, üretim D1 üzerinde gerçek para/stok mutasyonu değildir.

| No | Sekme | KOD | TEST | PAGES | WORKER | CANLI_OTURUMLU_E2E | AÇIK ENGEL |
|---|---|---|---|---|---|---|---|
| 01 | Yönetim Özeti | Dönem/KDV/kaynak korundu | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek KPI ve firma yetkisi |
| 02 | Firmalar & Cari | VKN/alias/DELETE korundu | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek cari/rol/kapanış |
| 03 | Alış & Tedarikçi | Finans atomik; fiziki LOT bekliyor | Hizmet 20/100 SQLite; XML kaynak | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Fiziki stok/LOT güvenli outbox ve gerçek irsaliye |
| 04 | Satış & Müşteri | Satış sayfalama; finans atomik | Hizmet 20/100 SQLite; kaynak | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Çoklu irsaliye, kısmi fatura, gerçek rol |
| 05 | Finans İşlemleri | Koşullu D1 defter-plan | 20/100 SQLite ve rollback PASS | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek ödeme/banka/çek-kasa ve aktör rolü |
| 06 | Ekstre & Mail | Fark/mutabakat önceki kod | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Cari karşı bakiye, mail izinli saha |
| 07 | Mali Kontrol | Defter-KDV hizmet atomik, raporlar | Hata enjeksiyonu + kaynak | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek KDV/defter ve XLSX/PDF mutabakatı |
| 08 | e-Belge Genel Bakış | Yerel gün + İşNet gerçek health | Health mock 401/403/timeout + kaynak | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Canlı sağlayıcı oturum sonucu ve dashboard |
| 09 | Gelen Belgeler | Tenant, yön, 101+ sayfa | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek XML/PDF/UUID/mime |
| 10 | Giden Belgeler | POSTED koruması, izinler | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Resmî İşNet gönderimi kullanıcı onayıyla |
| 11 | Belge Havuzu | Tenant, upload ve 101+ | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Bozuk/mükerrer XML, arşiv R2 ve firma sınırı |
| 12 | Eşleştirmeler | Açık onay, POSTED kilidi | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | LOT/irsaliye/kısmi eşleştirme |
| 13 | Onay & Sorunlar | CAS+oturum+sürüm; fiziksel bloke | CAS 20/100; finans 20/100 | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Fiziksel kesin kayıt atomik outbox ve hata sonrası recovery |
| 14 | İş Akışları | Fiziksel muhasebe fail-closed | Kaynak ve fiziksel koruma | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Stok/Boyahane/LOT/defter dağıtık outbox |
| 15 | Arşiv & Çıktı | Orijinal dosya bağı korunuyor | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | R2/File Hub hata+restart ve Windows çıktı |
| 16 | Entegrasyonlar | İşNet read-only health, token gizli | 401/403/timeout fixture PASS | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek İşNet salt okunur oturum sağlığı |
| 17 | Üretim Merkezi | Kalıcı requestId, fiş-link atomik | 20/100 SQLite + link rollback | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek makine/irsaliye ve mevcut legacy fiş kontrolü |
| 18 | Üretim Raporları | TSV/filtre kodu korunuyor | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Canlı üretim sayısı + Windows Excel |
| 19 | Makine & Vardiya | Kısmi kaydetme, tenant koruma | Kaynak + CI | ✅ #40242893537 | ✅ #40242759411 | **BEKLİYOR** | Gerçek gece/gündüz/operatör/rol |

**Son açık ayrım:** Ödeme ve İmalat D1 transaction/idempotency kod/testi tamam; İşNet'in gerçek salt-okunur sağlık çağrısı mevcut fakat sağlayıcı oturum kanıtı yok. Stok-LOT-Boyahane finans kesin kayıt outbox/recovery ve olası schema migration (production izni ayrı), firma/rol gerçek kullanıcı E2E, fiziksel makine/PDKS ve resmî belge gönderimi **tamamlanmadı**. Stok/LOT onayında yanlış POSTED iddiası yerine açık bloke vardır. İzole CI ve release başarıları 19/19 işlemsel kabul değildir.


**25.10.2026 — canonical kaynak** `codex/model-uretim-kontrol-merkezi-final`. **Ortak onaylı HTML değişmedi**; canlı görsel 1366×768, 1920×1080 ve mobil yetkili browser kabulü halen bekliyor. Bu belgeye göre **19/19 gerçek kullanıcı E2E PASS değildir**. Kaynak bağlantısı testi, fiili finans/cihaz/İşNet işlemi anlamına gelmez.

## Güncel tek release zinciri

- **İlk paketler (#443–#451):** İmalat 100+ pagination, ödeme planı açık onay, ortak HTML shell, alış/satış ve e-Belge havuz sayfalama, migration ayrı izin kapısı, e-Belge finalize onayı, mutabakat/gider/rapor/makine düzeltmeleri, toplu eşleştirme açık onayı; tamamlanan kodlar korunmuştur.
- **[PR #453](https://github.com/cetin60kaya-lgtm/ky-erp/pull/453)** merged `f3e0d9ea32ef91982a5b98ab61fca22c285d7962`, [CI #40220091676](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40220091676) SUCCESS: Muhasebe dönem/tenant/KDV; firma VKN/alias/silme; ödenmiş tutarı geriye düşürme 409.
- **[PR #455](https://github.com/cetin60kaya-lgtm/ky-erp/pull/455)** merged `43d0c0822a6961474c2436c55bcaa2544ef8f35f`, [CI #40220688716](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40220688716) SUCCESS: e-Belge gerçek provider durumu; 0/1/50/100/101+; tarih/tenant/POSTED koruması.
- **[PR #456](https://github.com/cetin60kaya-lgtm/ky-erp/pull/456)** merged `8d7c355a93483d27536676d235e18a1e30a1513e`, [CI #40221156414](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221156414) SUCCESS: İmalat tenant fail-closed, aynı bulk içi mükerrer fiş, istemci stabil requestId, stale model GET, 101+.
- **[PR #457](https://github.com/cetin60kaya-lgtm/ky-erp/pull/457)** merged `705307a000f689b911e7ec1c9273007ac73dfc4f`, [CI #40221600062](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221600062) SUCCESS: 19 ayrı rota/JSX/API kaynak kontrat testi; **statik ve izole testler, gerçek E2E değildir**.
- **[Worker production #40221347939](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221347939)** SUCCESS, yayın `cc06539f270db75a6baef39aaa950d759aaa6e8d`: tam D1 export+artifact, salt-okunur schema, API health PASS; tüm migration adımları SKIPPED.
- **[Pages production #40221736227](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221736227)** SUCCESS, yayın `fccc143b66477da6ffdea1c57c6ece7d013fc9f6`: Cloudflare deploy + public bundle/Günlük Operasyon chunk smoke PASS.
- Karşılaştırma ile #453, #455, #456 birleşim SHA'larının hem Worker hem Pages atası olduğu doğrulandı (**behind=0**). #457 yalnız test ekledi, Pages atası (**behind=0**); ek Worker kodu gerektirmiyor.

## 19 sekme güncel kabul tablosu

**Durum anahtarı:** HTML = mevcut onaylı tasarım korunmuş (**viewport kabulü yok**); Kod/API = mevcut gerçek kod ve son hedefli onarım, ayrıca tamamlanmamış gerçek iş senaryosu olabilir; Otomatik test = gerçek CI başarıyla çalıştı fakat kapsamı belirtilen kaynak/saf fonksiyon/regresyonlarıdır; Pages ve Worker = başarıyla yayımlanan kaynak kodu, işlem E2E kanıtı değil. **Hepsi son sütundaki E2E saha kanıtı olmadan KISMİ.**

| Sekme | HTML uyumu | Kod / API | Otomatik test | Production Pages | Worker | Gerçek kullanıcı E2E | Kalan somut engel |
|---|---|---|---|---|---|---|---|
| 01 Muhasebe / Yönetim Özeti | Korundu; viewport bekliyor | #453: dönem/KDV, tenant ve stale GET | Dönem, kaynak ve sıra kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | 12–13 gerçek carinin KPI/KDV mutabakatı, yetkili oturum |
| 02 Muhasebe / Firmalar & Cari | Korundu; viewport bekliyor | #453: VKN, alias çatışması, kalıcı DELETE engeli; pasife alma mevcut | Tekil firma/alias ve tenant kaynak testi PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek firma kartları, VKN, bakiyeler ve yetki rolleri |
| 03 Muhasebe / Alış & Tedarikçi | Korundu; viewport bekliyor | #446: 50/100+ liste; #455: POSTED koruma | Liste/sayfa ve belge kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek XML/PDF/kimyasal/LOT/kısmi kabul mutabakatı |
| 04 Muhasebe / Satış & Müşteri | Korundu; viewport bekliyor | #446: satış sayfalama; belge/cari çalışma alanı mevcut | Liste ve API kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Çoklu irsaliye–model–kısmi fatura iş fixture + saha testi |
| 05 Muhasebe / Finans İşlemleri | Korundu; viewport bekliyor | #444: ödeme onayı; #453: kümülatif tutar geri yazma engeli | İdempotency/kuruş ve kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Banka/kasa/çek gerçek işlem ve rol onayı; para çıkışı testi yok |
| 06 Muhasebe / Ekstre & Mail | Korundu; viewport bekliyor | #450: mutabakat farkı (client+Worker), onay/kilit; mail paneli mevcut | Fark ve dönem kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek cari karşı bakiye ve kullanıcı tetiklemeli mail testi |
| 07 Muhasebe / Mali Kontrol | Korundu; viewport bekliyor | #450: gider onayı; KDV/kâr-zarar/rapor modülleri mevcut | Gider validasyonu, rapor kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Dönem KDV/defter doğrulaması ve Excel/PDF gerçek çıktı testi |
| 08 e-Belge / Genel Bakış | Korundu; viewport bekliyor | #455: İstanbul günü, kaynaklı provider durumu | Gün/ay ve provider kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek firma, İşNet bağlantısı ve dashboard toplamı |
| 09 e-Belge / Gelen Belgeler | Korundu; viewport bekliyor | #447: server yön/sayfa; #455: tarih ve tenant koruması | 0/1/50/100/101+ sayfa kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek giriş XML/PDF, rol/tenant ve boş/hata ekranı |
| 10 e-Belge / Giden Belgeler | Korundu; viewport bekliyor | #447: server yön/sayfa; #455: POSTED kilidi | Yön/filtre ve kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | İşNet gönderimi/onayı ve sağlayıcı durumları (izin gerekli) |
| 11 e-Belge / Belge Havuzu | Korundu; viewport bekliyor | #447: sunucu sayfa; #455: tarih/POSTED guard; XML asıl kaynak | Sayfa ve archive/upload kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | UUID mükerrerlik, MIME/bozuk ek ve farklı şirket fixture testi |
| 12 e-Belge / Eşleştirmeler | Korundu; viewport bekliyor | #451: toplu açık onay; #455: POSTED tekrar eşleme yasağı | Eşleştirme/onay ve idempotency kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | İrsaliye, LOT, miktar, kısmi tutar gerçek eşleştirme kabulü |
| 13 e-Belge / Onay & Sorunlar | Korundu; viewport bekliyor | #449: kesin kayıt özet+checkbox; #455: sonrası kilit | Final onay ve issues kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek belge sorun geçişleri, iptal/role göre yetkili kabul |
| 14 e-Belge / İş Akışları | Korundu; viewport bekliyor | Mevcut InvoiceDispatchControlWorkspace; koruma zinciri #449/#455 | Ekran/servis bağlantı kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | İşNet→havuz→stok/boyahane hata/yeniden deneme uçtan uca |
| 15 e-Belge / Arşiv & Çıktı | Korundu; viewport bekliyor | Mevcut File Hub önizleme/arşiv bağlantısı, #447 havuz | Arşiv ve önizleme kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Eksik/bozuk dosya, yetki ve tarayıcı popup gerçek testi |
| 16 e-Belge / Entegrasyonlar | Korundu; viewport bekliyor | #455: bağlantısız İşNet/diğer adaptör bağlı görünmez | Provider durumları kaynak/fixture PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek İşNet yetki, token/sağlık ve dış gönderim izinli saha |
| 17 İmalat / Model ve Üretim | Korundu; viewport bekliyor | #443: 100+; #456: tenant, stabil requestId, mükerrer fiş | Kaynak, 101+ model ve çift fiş kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek model–irsaliye–vardiya–makinacı–fiş yetkili kabulü |
| 18 İmalat / Üretim Raporları | Korundu; viewport bekliyor | #450: uygulanmış filtre, güvenli UTF-8 TSV | Filtre/Excel TSV/formül kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek üretim fiş sayıları ve Windows Excel açılışı |
| 19 İmalat / Makine ve Vardiya | Korundu; viewport bekliyor | #450: kısmi toplu kaydetme/geri al; #456: tenant kapısı | Makine/işlem/tenant kaynak kontratı PASS | Canlı #40221736227 | Canlı #40221347939 | **BEKLİYOR** | Gerçek makine ekle-pasife al, operatör/usta yetkisi |

## Ayrık kabul kapıları ve bilinen sınırlar

1. **Güvenli otomatik testler tamamlandı:** 19 rota–JSX–API kaynak testi ve yeni hedefli helper/API regresyonları canonical CI'da çalıştı. Bunlar bütün bağımlılıkların üretim D1 üzerinde test edildiğini kanıtlamaz; bazı çoklu irsaliye–LOT, eşzamanlı mali idempotency, arşiv mime, banka CSV ve rol varyantları için gerçekçi birleşik fixture/entegrasyon kapsamı hâlâ genişletilebilir.
2. **Canlı kod yayımlandı:** Worker ve Pages deployment/health/bundle başarılı, PR merge ancestry gerçektir. D1 migrations **uygulanmadı**. Test amacıyla cari/ödeme, e-Belge finalize/İşNet resmî gönderim, İmalat/PDKS gerçek fişi veya dosya yüklemesi yapılmadı.
3. **Yetkili saha kabulü açık:** SUPER_ADMIN/firma sahibi/yetkili/yetkisiz oturumları, 12–13 gerçek cari, birden çok irsaliye/LOT/kimyasal, finans kuruş/idempotency ve gerçek İşNet provider durumları; 1366×768, 1920×1080, mobil Chromium, Windows Excel TSV açılışı ve gerçek makine/serim akışı ayrı kontrollü gerçek kabul ister. MFA veya izin atlama yoktur.
4. **Tasarım sınırı:** `approved-html-shell.css` ve ortak 104 sekme tasarımına dokunulmadı. Günlük Operasyon/İK Aylık ve DESEN Windows fiziksel işletme kayıtları değiştirilmedi. Tüm eski PR #443–#451 kodları korunmuştur.

**Sonuç:** Kod/CI/release kanıtı var. 19 sekmenin tamamı, gerçekten saha iş akışları kanıtlanmadan **KISMİ** olarak kalmalıdır; otomatik kaynak testi tek başına “19/19 işlev PASS” değildir.
