# KY ERP — GÜNCEL DEVAM + YAPILAN İŞLER ANA KAYNAĞI

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


## 09.10.2026 — Modül kabul kontrolü ve son açık kanıt
- PR #409 merge `2d0e33a24d4ce319baff4ae6f9cc57b670a6552d` → frontend publish `844a4337523e24d9f5f944cef5b57a5f1506051f`, Actions #37891886962 (PR CI PASS) + #37892077343 (Pages + real Chrome PASS).
- Yönetim > Sistem > Güncelleme Geçmişi > **Modül Kontrolleri** canlı; 14 ana modül, son PR ve durum görünür. Yanlış "Muhasebe" kategorisi giderildi; gerçek kullanıcı test edilmediyse "bekliyor" gösterilir.
- ChatGPT KY ERP Canlı Nöbet altı saatte bir salt okunur public API/site + GitHub yayın regresyonu izlemesi için etkinleştirildi.
- **Öncelikli eksik:** KY ERP TEST firmasında onaylı, düşük yetkili test hesap/cihazı üzerinden kimlikli işlevsel E2E: hesap+cihaz ayrı onay, PDKS, izin, makinacı üretim idempotency, yetki reddi; diğer 14 modülün yetkili ekran/işlem akışları. Test kanıtı yokken yapılan işler tamam sayılmaz. Hiçbir MFA, Turnstile veya üretim D1 kayıt güvenliği bypass edilmez.


## 09.10.2026 — Ortak güncelleme/yayın geçmişi ve yarım kalan işler
- Tüm KY ERP sohbetlerinin ortak sözleşmesi: `DOCS/KY_ERP_GUNCELLEME_YAYIN_KAYIT_SOZLESMESI_2026-10-09.md`. Değişiklik PR/commit açıklamasında; test/merge/Pages/Worker canlı kanıtları ayrı kaydedilir.
- Yönetim > Sistem > Güncelleme Geçmişi, public GitHub PR/commit/Actions verilerini salt-okunur gösterir. Yayın kanıtı olmayan iş canlı sayılmaz.
- Personel portalı PR #405 Worker + Pages canlı yayını: Action 37885380200 ve 37885546558 SUCCESS, D1 0060 migration ve backup kanıtlı. Mobil rota/hatalı giriş döngüsü PR #407 için frontend Action 37889109158 SUCCESS.
- **YENİ SONUÇ:** PR #408 merged, canlı frontend Action #37890106512 SUCCESS; yeni Güncelleme Geçmişi yönetim ekranı yayında. Önceki yarım kalan gerçek Chrome testini Pages workflow'una bağlama işi tamamlandı: canlı test 6/6 PASS, kanıt artifact 11597916502. Kalan: onaylı ayrı test personeliyle yönetici/cihaz onayı, İK/PDKS, yıllık izin, makinacı üretim ve diğer yetkili modüllerin gerçek CRUD kabulü; henüz bu işlevler E2E başarılı diye işaretlenmez.
- Modüllerde gerçek yeni mutasyon için yedek, tenant izolasyonu, rol yetkisi ve idempotency korunur. İkinci ERP/test sitesi ve MFA bypass yapılmaz.


## ZORUNLU TEK YEREL KÖK — 01.10.2026

- Tek aktif yerel KY ERP kökü: `D:\Googledrive\KYERP`.
- Tek aktif Git working copy: `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp`.
- Canlı veri otoritesi: Cloudflare D1 `ky-erp-db`; Drive SQL/DB dosyaları yedek/export/referanstır.
- Bağımsız `KYERP-PDKS-*` klasörleri kalabilir; ancak canonical değildir ve yeni sohbet/ajan bunlardan yeni iş başlatmaz.
- Eski `KYERP-MERKEZ`, `KYERP-GELISTIRME-MERKEZI` ve OneDrive `KY-ERP-MERKEZ` yolları yeni geliştirme/deploy kaynağı değildir.
- Yeni paralel KY ERP kökü veya clone oluşturulmaz. Ayrıntı: `DOCS/KY_ERP_TEK_YEREL_KOK_2026-10-01.md`.

## 21.09.2026 — Android KY ERP Güvenlik PWA final feature paketi

- Branch: `codex/security-pwa-enrollment-final-20260921`.
- Kurulum ve güvenilir cihaz bağlama ayrıldı: Android browser yalnız gerçek PWA kurulumunu, standalone uygulama yalnız enrollment/relink akışını yürütür.
- Canonical origin/path `security.kyerp.net/ky-guvenlik/`; manifest id sabit, start URL ve scope sürüm parametresizdir.
- Enrollment token kurulum boyunca aynı origin localStorage'da kısa süreli korunur ve URL'den temizlenir; bağlı cihaz IndexedDB kaydı, signing key ve push kimliği migration sırasında silinmez.
- Eski `/security/` worker/cache akışı kontrollü göç ile emekliye ayrılır. Sürümlü boot/flow/shell workaroundları kaldırılmıştır.
- Frontend lint + 173 test + production build; Worker typecheck + 458 unit test + local auth integration + dry-run build başarılıdır.
- D1/production write veya deploy yapılmadı. Sonraki adım: temiz PR incelemesi, kullanıcı onayı, production merge, Git Integration yayını ve gerçek Android cihaz smoke testi.
## 06.09.2026

**Amaç:** Yeni sohbetlerin/ajanların son yapılan işleri tekrar araştırmadan, eski notlara dönmeden ve iş sırasını bozmadan devam etmesi için güncel özet kaynak.

**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Canonical production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Bu kayıt hazırlanırken production HEAD:** `e050e9c42ac32da270c672267dabf9d8413a7ab5`

> Production branch paralel sohbetlerle ilerleyebilir. Yeni sohbet bu SHA'yı körlemesine kullanmaz; her işlem öncesi güncel production HEAD'i GitHub'dan doğrular. Bu dosya yapılan işlerin ve kararların kaydıdır.

---

# 1. YENİ SOHBETİN ZORUNLU OKUMA SIRASI

1. `AGENTS.md`
2. `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`
3. `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md`
4. Canlıya alma işi varsa: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`
5. Cloudflare/AI işi varsa: `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`
6. İlgili modülün özel kaynak/dokümanı

Çelişki sırası:
- teknik/güvenlikte `AGENTS.md`,
- güncel devam/iş sırası ve kullanıcı kararlarında bu dosya + Proje Kontrol Merkezi,
- production deploy yönteminde `KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.

---

# 2. 06.09.2026 İTİBARIYLA TAMAMLANAN CLOUDFLARE ÇEKİRDEĞİ

Aşağıdakiler çekirdek production kurulumu olarak **tamam kabul edilir**:

- Cloudflare Pro aktif.
- Frontend production: Cloudflare Pages `ky-erp-frontend`.
- API production: Cloudflare Worker `ky-erp-api`.
- Canonical deploy: production branch -> Cloudflare Git Integration -> Pages / Workers Builds.
- GitHub Actions production deploy yolu değildir.
- Normal release sırasında kullanıcıdan PowerShell / Cloudflare tokenı / manuel deploy istenmez.
- Worker build kapısı: `npm run typecheck && npm test && npm run build`.
- Worker build fail olursa manuel deploy ile bypass edilmez; log okunur, kaynak düzeltilir, regression testi eklenir ve yeni production commitinin otomatik buildi beklenir.
- D1 migration auto-deploy'dan ayrıdır; backup + readiness + hedefli/additive migration şarttır.
- Cloudflare Managed WAF aktif ve **Observe/Log** modundadır.
- OWASP geniş enforce bilerek deferred; false-positive verisi görülmeden açılmaz.
- Login rate limit aktif: `/api/auth/login` için 10 / 60 sn / IP, 60 sn block.
- İkinci Pro rate-limit slotu bilerek boştur.
- `api.kyerp.net/api` ve `/api/*` cache bypass aktif.
- Bot policy audit tamam; Verified Bots allow ve geniş SBFM block/challenge kapalı/ertelenmiş durumda.
- Turnstile web login entegrasyonu server-side verify + fail-closed tamam.
- Owner/admin MFA zorunluluğu korunur.
- Uygulama sahibi için kalıcı browser restore kapalı.
- Uygulama sahibi rolling/automatic session refresh kapalı.
- Normal kullanıcı session davranışı owner düzeni nedeniyle bozulmaz.
- Uygulama sahibi eski tek kullanımlık recovery code akışı kapatıldı; özel soru-cevap + doğrulanmış iletişim + MFA step-up güvenli recovery modeli kullanılır.
- Workers AI binding `AI` aktif.
- Workers AI çağrıları Cloudflare AI Gateway `default` üzerinden yürütülür.
- AI Gateway request cache bypass edilir.
- Hassas ERP prompt/response persistent gateway logging varsayılan kapalıdır (`AI_GATEWAY_COLLECT_LOGS=false`).
- AI tenant/permission guard ve KY ERP billing ledger korunur.
- Serbest SQL / sınırsız AI write executor açılmamıştır.
- Management token least-privilege: D1 yalnız **Read**; D1 Edit/Billing/API Tokens/Account Members/DNS Edit verilmez.

---

# 3. CANLIYA ALMA DÜZENİ — KALICI KARAR

Normal akış:

`feature branch -> test/build -> kullanıcı onayı -> production merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke`

Kurallar:

- Kullanıcı `canlıya al` dediğinde PowerShell isteme.
- Production HEAD merge öncesi tekrar doğrulanır.
- Paralel sohbet yeni commit eklediyse eski SHA körlemesine deploy edilmez.
- Pages success + Worker fail = release tamam değildir.
- Canlı health/auth/modül smoke olmadan `tamam` denmez.
- GitHub Actions normal production release için çalıştırılmaz.
- Secret/token/recovery cevabı repo, doküman veya loga yazılmaz.

Ana kaynak:
`DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`

---

# 4. SON DÜZELTİLEN ÖNEMLİ INCIDENT

Cloudflare Worker build otomatik tetiklenmiş ancak `notifications-cloud.test.ts` Node ESM çözümlemesinde:

`ERR_MODULE_NOT_FOUND: .../src/auth-cloud`

hatası vermişti.

Kök neden:
- `notifications-cloud.ts` içindeki extensionless TypeScript relative import.

Final çözüm:
- explicit `.ts` import,
- regression/contract testi,
- manuel deploy ile test bypass edilmedi.

Bu incident, Cloudflare Workers Builds otomatik tetik zincirinin çalıştığını ve build kapısının hatalı backend'i production'a göndermediğini doğruladı.

---

# 5. BİLDİRİM MERKEZİ SON DURUMU

- Sağ üst sabit `3` kaldırıldı.
- Rozet gerçek `unreadCount` kullanır.
- Kaynaklar: giriş onayları, e-Belge açık sorunları, ödeme hatırlatmaları.
- Tenant + kullanıcı modül yetkisi uygulanır.
- Okundu bilgisi kullanıcı + firma bazında saklanır.
- Bildirim API canonical endpointleri:
  - `GET /api/notifications`
  - `POST /api/notifications/read`
- Ayrıntılı kaynak:
  `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`

---

# 6. AUTH / GİRİŞ SON DURUMU

07.09.2026 itibarıyla final kullanıcı akışı:

`Turnstile -> kullanıcı adı/şifre -> kayıtlı telefon varsa KY ERP Telefonla Onay -> gerekirse firma sahibi onayı -> session -> ERP`

Telefon kaydı yoksa veya kullanıcı açıkça isterse Google/Microsoft Authenticator 6 haneli kodu fallback olarak devam eder. iPhone/iPad için Web Push yalnız Ana Ekrana eklenmiş KY ERP web app içinde etkinleştirilir; iOS action butonu göstermese bile bildirim uygulamayı açtığında foreground onay ekranı pending isteği cihaz capability anahtarıyla çeker. Telefon push verileri yeni D1 tablosu açmadan mevcut tenant-kapsamlı `json_store` içinde tutulur; bu özellik için production migration gerekmez.

Uygulama sahibi için:

- yeni browser oturumunda tekrar giriş + MFA,
- eski kalıcı owner localStorage restore kullanılmaz,
- active browser session içinde F5/yenileme çalışabilir,
- otomatik owner refresh kapalı,
- tek kullanımlık owner recovery code devre dışı,
- özel 3 soru kaydı; kurtarmada rastgele 2 soru + doğrulanmış iletişim kanalı + MFA kontrollü yeniden kurulum.

Normal kullanıcılar için:
- owner sıkılaştırması yüzünden mevcut normal session/persistence davranışı bozulmaz.

---

# 7. CLOUDFLARE'DA BİLEREK DEFERRED OLANLAR

Aşağıdakiler **eksik çekirdek kurulum değildir**:

- WAF block/enforce: event verisi görülmeden açılmayacak.
- OWASP ikinci geniş managed enforce: false-positive riski nedeniyle deferred.
- İkinci rate-limit slotu: somut endpoint ihtiyacında kullanılacak.
- Geniş Bot Fight/SBFM challenge/block: API/mobile/PDKS/File Agent riski nedeniyle açılmayacak.
- Queues / Workflows: gerçek asenkron/uzun iş ihtiyacında feature paketi.
- Vectorize / AI Search: semantik dosya/desen araması gerektiğinde feature paketi.

Yeni sohbet bunları otomatik olarak `kalan zorunlu Cloudflare işi` diye açmamalıdır.

---

# 8. ŞİMDİKİ İŞ SIRASI — KULLANICI İLE KİLİTLENEN DEVAM

Cloudflare çekirdeği kapatıldıktan sonra modül/ürün sırası:

## 1. e-Belge / İşNet + manuel fatura / irsaliye final kontrolü
Kontrol edilecek:
- İşNet gelen/giden belge akışı,
- manuel PDF/XML/JPEG okuma,
- OCR sadece gerektiğinde,
- fatura/irsaliye eşleşmesi,
- ürün kalemlerinin doğru ayrılması,
- firma/ürün alias,
- EXPENSE / STOCK / BOYAHANE yönlendirme,
- LOT gereken ürünlerde LOT zorunluluğu,
- resmî gönderimde kullanıcı onayı.

Mevcut not:
- `0046_accounting_canonical_report_controls.sql` production D1'e otomatik uygulanmaz.
- İleride ayrı bakım penceresinde backup + readiness + hedefli additive migration.

## 2. Muhasebe / Cari / FİBE final
- hızlı cari giriş/kontrol,
- haftalık gelen/giden/borç görünümü,
- resmi/gayriresmi ve elden ödeme takibi,
- firma kartında isteğe bağlı FİBE takibi,
- normal cari ile FİBE bakiyesi ayrı tutulur.

## 3. PDKS / İK final ekran + operasyon kontrolü
- Desktop/telefon/tablet uyum,
- PDKS operasyon çekirdeği,
- günlük/aylık İK,
- toplu/tekli ödeme fişleri,
- ödeme özet listesi,
- owner/admin güvenlik kuralları bozulmadan kullanıcı deneyimi.

## 4. Depolama / KY File Hub + Mail / İletişim Merkezi
- Google Drive / OneDrive / SharePoint / yerel / NAS tek File Hub,
- Mail/Gmail/Outlook entegrasyonu uygulama içinde ortak iletişim merkezi,
- dosya ve mail ilişkileri modüllerle tek contract üzerinden.

## 5. KY ERP AI / Asistan ürünleştirme
- mevcut Workers AI + AI Gateway temelinin üzerinde,
- typed/allowlisted işlemler,
- tenant/permission guard,
- kullanıcı onayı,
- audit,
- ihtiyaç çıkarsa Queues/Workflows/Vectorize/AI Search.

Bu sıra yeni sohbetlerde varsayılan çalışma sırasıdır. Kullanıcı yeni bir öncelik verirse güncellenir.

---

# 9. YENİ SOHBETE HAZIR DEVAM CÜMLESİ

Yeni KY ERP sohbeti açıldığında şu çerçeve kabul edilir:

> **Cloudflare çekirdeği tamam. Normal deploy production merge sonrası Cloudflare Git Integration ile otomatik; PowerShell yok. Owner auth sıkı, normal kullanıcı davranışı korunuyor. AI Gateway + Workers AI hazır. Şimdi modül sırasıyla e-Belge/İşNet -> Muhasebe/Cari/FİBE -> PDKS/İK -> File Hub/Mail -> AI/Asistan ürünleştirme devam eder.**

---

# 10. KAYIT GÜNCELLEME KURALI

Aşağıdakilerden biri değişirse bu dosya ve `KY_ERP_PROJE_KONTROL_MERKEZI.md` birlikte güncellenir:

- kullanıcı iş sırasını değiştirirse,
- önemli modül final/onayı oluşursa,
- production deploy yöntemi değişirse,
- auth/security kuralı değişirse,
- Cloudflare servislerinden deferred olan biri gerçek production özelliğine dönüşürse,
- kritik incident yeni kalıcı mimari kural doğurursa.

Secret, parola, MFA kodu, recovery cevabı veya API token değeri hiçbir zaman bu kaynağa yazılmaz.


## 06.09.2026 — Mail & Dosyalar production merge + P1 hotfix

- PR #94 production branch'e merge edildi.
- Production merge commit: `efc774fc4891d6c4fa72578f4d108b2a21c80f42`.
- Merge sonrası yakalanan P1: normal kullanıcıların günlük Dosyalar sekmesi owner-only File Hub indeks endpointlerini çağırıyordu.
- P1, PR #103 ile düzeltildi; günlük dosya görünümü artık `/api/mail/files` üzerinden tenant + MAIL izni + kullanıcının modül `canView` ilişkilerine göre scope edilir.
- P1 hotfix production commit: `322362bc35a229f100f0ce6f33025b86cb7d1444`.
- `0050_mail_communication_core.sql` bu sohbet oturumunda production D1'e uygulanamadı; Cloudflare D1 write yetkili aracı mevcut değildi.
- Bu nedenle Mail Core fail-soft çalışır: Mail & Dosyalar arayüzü canlıda önizleme/kurulum bekliyor durumunda açılabilir; mail hesap talebi, bağlantı ve gönderim 0050 uygulanana kadar kapalıdır.
- 0050 aktivasyonu için canonical sıra değişmez: remote D1 full backup -> readiness -> hedefli 0050 additive migration -> schema doğrulaması. GitHub Actions production deploy için kullanılmaz.


## 06.09.2026 — PDKS / İK final ayrım feature paketi hazırlandı

- Branch: `codex/ik-pdks-yillik-izin-final-20260906`.
- İK artık yalnız personel/ücret/finans/bordro/SGK-evrak alanlarını gösterir; puantaj, giriş/çıkış, vardiya, terminal ve izin hareketleri PDKS'nin operasyon alanıdır.
- Personel Kartında yıllık izin özlük özeti tamamlandı: hakediş + devreden = toplam hak; kullanılan; kalan; hizmet yılına göre hakediş geçmişi.
- Yıllık izin kullanılan/kalan hesabı modern PDKS izin planları ile eski izin geçmişini exact duplicate kayıtları çift saymadan birleştirir.
- İK izin geçmişi aynı şekilde modern + tarihsel kayıtları birlikte okur.
- Mevcut production bordro/ödeme fişi ve Mail & Dosyalar kodu korunmuştur; paket güncel production HEAD üzerinden açılmıştır.
- Bordro çıktısı finali aynı branch'te: A4 ödeme listesi okunaklı genişliklere çekildi, HKN adın altına taşındı; EK ayrı sütun olarak kalır. 10'lu A4 fiş korunur ve EK>0 personelde kesilebilir EK ÖDEME kuponu gösterilir.
- Yeni D1 migration yok; production'a henüz merge/deploy edilmedi.
- Sonraki kapı: kontrat/static doğrulama -> kullanıcı gerçek ekran kontrolü -> açık `canlıya al` onayı -> canonical Cloudflare Git Integration yayını.


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


---

## 2026-09-07 — MAIL MERKEZİ / HOTMAIL GEÇİCİ ENTEGRASYON KARARI

Bu karar sonraki mail çalışmalarında kaynak kabul edilecektir.

- Gmail doğrudan Google OAuth + Gmail API ile çalışmaya devam edecek. Mevcut Gmail bağlantısına dokunulmayacak.
- Desen mailbox: `hkndesen@gmail.com`.
- Hotmail/Microsoft kişisel hesap için mevcut doğrudan Microsoft OAuth yolu şimdilik zorlanmayacak.
- Hakan Emprime ana mail: `hkngursu@hotmail.com`.
- Hotmail için tercih edilen ikinci yol yalnız bu hesapta aracı provider kullanmaktır.
- İlk değerlendirilecek aracı: **Nylas**.
- Mimari hedef: `Gmail -> mevcut direkt Google adapter`, `Hotmail -> Nylas Microsoft/Outlook adapter`.
- Nylas katmanı yalnız Hotmail tarafına eklenecek; Gmail kodu, OAuth secretları, senkron mantığı ve çalışan mailbox etkilenmeyecek.
- KY ERP Mail Merkezi tek arayüz olarak kalacak. Kullanıcı iki hesabı aynı posta merkezi içinde görecek.
- Hotmail adapterı şu yetenekleri sağlamadan tamamlandı sayılmayacak: gelen/giden, klasörler, okundu/okunmadı, sil/çöp kutusu, arşiv, taşıma, bayrak/sabitleme eşlemesi, ek indirme/önizleme, gönderim ve güvenli OAuth/token yenileme.
- Provider farkı kullanıcıya mümkün olduğunca gösterilmeyecek; provider-specific hata/log bilgisi yönetim tarafında tutulacak.
- Nylas hesabı açılırken secret/API key değerleri repoya veya sohbete yazılmayacak; Cloudflare secret olarak girilecek.
- Nylas uygun olmazsa ikinci alternatif araştırılacak; Gmail tarafı yine değiştirilmeyecek.
- Bu iş, mevcut Gmail final kontrolleri tamamlandıktan sonra ele alınacak.

### Uygulama sırası

1. Nylas hesabı/projesi oluştur.
2. Hotmail kişisel Microsoft hesabı desteğini ve Hosted OAuth akışını gerçek hesapla doğrula.
3. Gerekli Client ID / API key / callback değerlerini Cloudflare secret olarak tanımla.
4. Worker tarafına provider adapter ekle.
5. Mevcut `mail_accounts`, klasör, mesaj, attachment ve action contractlarını bozmadan Nylas cevabını canonical mail modeline map et.
6. `hkngursu@hotmail.com` hesabını yalnız Nylas üzerinden bağla.
7. Gelen kutusu, gönderilmiş postalar, çöp kutusu, okundu, sil, taşı, ek, gönderim ve token refresh uçtan uca testlerini tamamla.
8. Gmail hesabında regression testi yap; hiçbir davranış değişmediğini doğrula.
9. Sonra production yayını yap ve gerçek Hotmail smoke testi ile kapat.



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

## 09.10.2026 — KY ERP TEST giriş güvenliği: kaynak çelişkisinin giderilmesi
- Kaynak nedeni: D1 migration `0029_auth_security_policy_guard.sql` trigger'ı `PASSWORD_ONLY` değerini ve 36000 saniyeden farklı session süresini reddediyor; `/api/auth/status` da `passwordOnlyEnabled:false` bildiriyor. Önceki PR #410/#411 UI bileşenlerinin sunduğu salt parola seçeneği gerçek canlı güvenlik politikası ile uyumsuzdu. Kullanıcıda doğrulanamayan giriş politikası hatasına yol açtı.
- Düzen: `auth-policy-cloud.ts` PATCH isteklerinde yasak politikayı açık `AUTH_MFA_POLICY_REQUIRED` (409) hatasıyla önceden reddeder. Yönetim ekranından sahte 'Sadece parola' seçimi kaldırılır; KY ERP TEST güvenli hazırlama düğmesi sadece Gör yetkilerini bırakır, sunucudan tekrar doğrular ve yalnız test hesabının eski oturumlarını kapatır. KY Güvenlik / Authenticator MFA zorunluluğu korunur.
- Kullanıcı testini bir kez gerçek onaylı oturumla başlatabilir; bütün 14 modülün kimlik doğrulanmış uçtan uca testi henüz tamamlandı sayılmaz. Yeni D1 migration veya ikinci test sistemi oluşturulmaz. Yayın gerçek Actions kanıtına göre ayrıca kaydedilir.
