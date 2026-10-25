# KY ERP — Tek Kaynak / Modül Kabul Kontrolü

**25.10.2026** · Kapsam: GitHub kaynak düzeni ve muhasebe öncelikli kod incelemesi. Bu belge **canlı kabul raporu değildir**; son yayınlanan commit, gerçek D1 ve yetkili kullanıcı işlemleri ayrıca doğrulanır.

## 1. Tek kaynak kuralı

| Alan | Canonical kaynak | Kural |
|---|---|---|
| GitHub | `cetin60kaya-lgtm/ky-erp` | Repo yeniden oluşturulmaz |
| Üretim kaynak dalı | `codex/model-uretim-kontrol-merkezi-final` | `main` eski referanstır, deploy hedefi değildir |
| Frontend giriş | `APP/app/ky-erp-frontend/src/main.jsx → AppV3.jsx → layouts/AppShellV3.jsx` | Tek navigasyon: `src/app/moduleRegistry.js` |
| Muhasebe | `src/pages/modules/MuhasebePage.jsx` ve `src/pages/modules/muhasebe/` | Muhasebe iş kartı/alt sekmeleri tek yerden yönlendirilir |
| e-Belge | `src/pages/modules/muhasebe/EBelgeCenterPage.jsx` | İşNet yalnız adapter; XML/manual fallback korunur |
| Worker API | `APP/cloud/ky-erp-api/src` | Nest/Prisma klasörü canlı Worker yerine geçmez |
| Canlı veri | Cloudflare D1 `ky-erp-db` | DB dump, migration, token veya kişisel veri GitHub'a taşınmaz |
| Dosya depolama | File Hub / R2 preview | Google Drive/OneDrive/yerel kaynaklar ayrı merkezi kayıt oluşturmaz |
| Günlük Operasyon | `src/pages/modules/ik/DailyHrWorkspace.jsx` | İK Aylık ile kayıt mantığı karıştırılmaz |
| İK Aylık | `src/pages/modules/ik/monthly/IkFinancePage.jsx` | SGK/bordro/izin muhasebeleştirme ayrıca doğrulanır |
| GitHub→Canlı kanıt | `DOCS/KY_ERP_GUNCELLEME_YAYIN_KAYIT_SOZLESMESI_2026-10-09.md` | Dal/PR/merge, CI ve Pages/Worker canlı ayrı aşamadır |
| DESEN uzaktan köprü | Özel `cetin60kaya-lgtm/kyerp` içindeki `CONTROL/KY_CHAT_BRIDGE_AGENT_RULES.md` | Eski özel repo, bridge issue #2 çalışırken temizlenmez |

**Öncelikli kurallar:** `AGENTS.md` → `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` → `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md` → ilgili modülün kaynak kodu, testi ve gerçek yayın kanıtı.

## 2. Gerçek navigasyon haritası (kaynak: moduleRegistry.js / AppV3.jsx)

- **Muhasebe / 7 ana sekme:** Yönetim Özeti; Firmalar & Cari; Tedarikçi / Alış Belgeleri; Müşteri / Satış Belgeleri; Finans İşlemleri; Ekstre & Mutabakat; Mali Kontrol & Raporlar.
- **e-Belge / 9 sekme:** Genel Bakış; Gelen Belgeler; Giden Belgeler; Belge Havuzu; Eşleştirmeler; Onay & Sorunlar; İş Akışları; Arşiv & Çıktı; Entegrasyonlar.
- **Günlük Operasyon / 5 sekme:** Yönetim Özeti; Günlük Personel Girişi; Personel & Ücret Kartları; Dönem Kontrolü; Hakediş & Ödeme.
- Diğer kayıtlı modüller: İK, PDKS, Desen, Boyahane, İmalat, Mail & Dosyalar, Denetim, Bağlantılar/Depolama, Sistem Merkezi, Platform Yönetimi, Asistan.

**Önemli:** Sekmenin kayıtlı olması gerçek veriyle kullanıcı kabulünün tamamlandığı anlamına gelmez.

## 3. Muhasebe — koddan doğrulanmış durum ve açık işler

| Çalışma alanı | Kodla doğrulanan kaynak / uç | Eksik kabul |
|---|---|---|
| Yönetim Özeti | `ManagementOverviewWorkspace.jsx` → `GET /muhasebe/yonetim-ozeti` | Gerçek D1 özet rakamlarını cari/kasa/belgeyle mutabık kılma |
| Firmalar & Cari | `CompaniesCurrentWorkspace.jsx` → `firmalar`, `firma-profilleri`, `cari-hareketler` | Güncel firma kartları, rol, VKN/alias, hareket ve bakiye kontrolü |
| Tedarikçi / Alış | `SupplierDocumentsWorkspace.jsx` + e-Belge havuzu | XML/PDF, kısmi irsaliye-fatura, LOT/stok eşleşmesi canlı senaryo |
| Müşteri / Satış | `CustomerDocumentsWorkspace.jsx`, `InvoiceDispatchControlWorkspace.jsx` | Gerçek model/irsaliye/kesilen fatura adet mutabakatı |
| Finans İşlemleri | `FinanceOperationsWorkspace.jsx`: günlük ödeme, plan, banka/kasa/defter | Teyitli ödeme, çift kayıt, plan/gecikme, bakiye kontrolü |
| Ekstre & Mutabakat | `MailAccountingWorkspace.jsx`, `ReconciliationPanel.jsx` | Gerçek cari ekstre, mutabakat sonucu, mail sağlayıcı teslim durumu |
| Mali Kontrol | `FinancialControlWorkspace.jsx`: kâr-zarar, KDV, raporlar | Filtreli resmî/iç kayıt; detay→rapor toplamları gerçek mutabakat |
| e-Belge | `EBelgeCenterPage.jsx`, Worker `e-belge-center-cloud.ts` | İşNet/manual aynı havuz, mükerrerlik, son onay, belge görseli ve vergi |
 
**25.10.2026 ilk izole düzeltme:** `PaymentPlannerPanel.jsx` üzerinden `Gecikenler` ve `Tüm Planlar` mevcut `GET /muhasebe/odeme-plani` uç noktasından yüklenir. `Ödendi` işlemi doğrudan POST etmek yerine açık onay kartı gerektirir; eşzamanlı butonlar işlem sırasında kilitlenir. Vade önceliği `due_date → planned_date`; kapanmış planlara yeni ödeme düğmesi sunulmaz. Test: `paymentPlanView.test.js`. Bu değişiklik **feature branch üzerinde**; CI, merge, gerçek browser ve canlı yayın ayrı sonuçlanacak.

**Riskli mevcut alanlar:** `accounting-operations.ts` ve `accounting-finance-core.ts` içinde finansal hareket yazan uç noktalar bulunuyor; gerçek fiş, banka/kasa ve cari muhasebeleştirme aynı transaction ve idempotency senaryolarıyla ayrıca sınanmalı. UI üzerinde buton açılması tek başına gerçek finansal kabul sayılmaz.

## 4. Diğer modüllerin öncelik ve kabul kapıları

| Modül | Teknik iz / açık kapı |
|---|---|
| Günlük Operasyon | 18.10.2026 PR #442 ve kaynakta raporlanmış CI + Pages/Worker başarı kanıtı var; gerçek iki PC, kart ücreti ve fiziksel fiş kontrolü ayrıca bekliyor. Mevcut fonksiyon korunur |
| İK Aylık | `ik/monthly` ekranları ve `ik-relational-cloud.ts` mevcut; gerçek bordro+izin+ödeme mutabakatı yapılmalı |
| İmalat | 25.10.2026 itibarıyla 100 kayıt sınırı ve sayfalama için **açık PR #443** var; kapatılmadan tamam sayılmaz |
| Boyahane | `boyahane-inventory.ts`, `boyahane-workflow.ts`, `accounting-lot-reconciliation-core.ts`; fatura→LOT→stok ve reçete sarfı gerçek senaryo bekliyor |
| PDKS | Web modülü ve API mevcut; terminal/kart/Windows servisi fiziksel kabulü ayrı |
| Desen | Model, preview ve bridge mevcut; gerçek DESEN PC işlemleri kanıtlı ayrı kabul |
| Mail / File Hub | Kod mevcut; sağlayıcı bağlantıları, tenant erişimi ve gönderim/indeks doğrulaması gerekir |
| Denetim / Sistem | Modüller mevcut; bildirim, belge tarihi, izin ve operatör saha kabulü ayrıca yapılır |

## 5. Dağınık görünen kaynaklar: SİLME YOK, bağımlılık incelemesi var

- Repo kökünde hem **`DOCS/` hem `docs/`** bulunuyor. Yeni kanonik işletme belgeleri yalnız `DOCS/` altında tutulur. `docs/` içindeki referanslı tarihsel belgeler olduğu gibi kalır; referans taraması olmadan taşınmaz.
- **`TOOLS/` ve `tools/`** işlevleri aynı değildir: `TOOLS/DESEN_BRIDGE` canlı referanslı; `tools/` içinde File Hub, Build ve Sentinel ajanları var. İsim benzerliğine bakıp birleştirme/silme yapılmaz.
- **`DEPLOY/`** içinde sürümlü, manuel ve tarihsel scriptler vardır. Yürütme referansı ve rollback bağımlılığı denetlenmeden silinmez; gelişi güzel ikinci yayın yolu açılmaz.
- **`.github/workflows/`** altında birden fazla görev vardır. Canonical otomatik test kapısı `ui-canonical-acceptance.yml`; diğer akışların otomatik tetik ve referansları ayrı envanterle incelenir. `muhasebe-finans-regresyon.yml` Windows/Nest legacy testidir; **canlı Worker muhasebe kabul kanıtı olarak kullanılamaz**.
- **D1 migration** dosyalarının adındaki `reset` veya tekrar numaralandırma risklidir. Migration dosyalarını numaraya göre kör topluca çalıştırma, rename veya silme yok. Canlı D1 için tam yedek, tek migration seçimi, schema proof ve açık yetki gerekir.
- `kyerp` özel bridge deposu, `Pc-Pdks` özel ürün deposu ve `ky-erp-arsiv` farklı amaç taşır; `ky-erp` içindeki çalışan frontend/Worker kopyalanarak ikinci aktif ERP kurulmaz.
- Repo kökünde eski `.bat/.cmd` başlangıç ve dağıtım dosyaları var. Çağıran servis, kullanıcı kısayolu, CI ve rollback kontrol edilmeden fiziksel temizlik yapılmaz.

**Karar:** İlk faz **SAFE CLEANUP envanter ve işlevsel düzeltme**. İkinci fazda dependency graph + gerçek test + tek deployment kanıtıyla yalnız referanssız dosyalar manifestli karantinaya alınabilir. Yeni paralel klasör, yeni ana kaynak dokümanları kümesi veya D1 sıfırlama yok.

## 6. Canlıya hazır kabul ölçütü

1. Üretim kaynak HEAD ve feature dal diff/PR kontrol edilir.
2. Frontend: `npm ci`, lint, test, build. Worker değiştiyse typecheck + test + build.
3. Yetki/tenant, boş-veri/hata durumu, gerçek buton/forma bağlı API uçları, tarih/filtre, kayıt, çift işlem ve finansal hesap test edilir.
4. PR merge SHA ayrı raporlanır. Production Pages / Worker başarılı deploy ve o SHA'nın ancestry doğrulaması ayrı raporlanır.
5. Yetkili canlı browser oturumunda gerçek muhasebe belgesi ve ödeme **kullanıcının açık eylemiyle** sınanır; sahte firma/fatura/ödeme yazılmaz.
6. Kullanım sonrasında ekranda/hata logunda açık risk kalmadıkça modül **gerçek operasyon kabulü** alır.

## 7. Kapsam sınırı ve takip

Bu rapor repo içindeki yol, bileşen ve sözleşme koduna dayanır. Hiçbir gerçek D1 kaydı, banka, fatura, personel veya mail verisi alınmadı/değiştirilmedi. Henüz çalıştırılmayan canlı senaryolar `PASS` gösterilemez. İmalat PR #443 başka işe aittir ve bu müdahalede değiştirilmeyecektir.
