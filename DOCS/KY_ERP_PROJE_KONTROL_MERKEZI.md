# KY ERP — PROJE KONTROL MERKEZİ

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
