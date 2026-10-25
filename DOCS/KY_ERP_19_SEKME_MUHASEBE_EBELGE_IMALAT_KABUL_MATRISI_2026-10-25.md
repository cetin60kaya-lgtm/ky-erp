# KY ERP — Muhasebe / e-Belge / İmalat 19 sekme gerçek kabul matrisi

## 25.10.2026 — PR #450 yeni işlev + canlı yayın durumu
- **Kod:** Muhasebe/Mutabakat karşı bakiye–ERP fark doğrulaması (client + Worker API), kesin onay ve çift-POST kilidi; Muhasebe/Gelir-Gider gerçek gider veya yalnız şablon açık önizleme + tutar/KDV kontrolü; İmalat/Makine Vardiya ayarları kısmi başarı, firma seçimi, geri al; İmalat/Rapor Excel uyumlu güvenli UTF-8 TSV ve uygulanmış filtre denetimi.
- **CI:** [#40214924202](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40214924202) frontend+Worker SUCCESS. **Merged:** [PR #450](https://github.com/cetin60kaya-lgtm/ky-erp/pull/450) SHA `84e93e53f94550e00a189838b1db4abab3c6c64e`.
- **Canlı Worker:** [#40215087584](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215087584) SUCCESS SHA `b4ed1440ef8b86a94cb4d9f1813d86adac2ff360` (D1 yedek+artifact, schema, sağlık PASS; migration SKIPPED). **Canlı Pages:** [#40215265216](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215265216) SUCCESS SHA `deee4744bbbaa90620f645441864927f597ce125` (bundle/deploy smoke PASS). Her iki release SHA #450 merge atası, compare behind=0.
- **Yeni kapatılan kaynak kusurları:** yanlış MATCHED onayı ve server API geçişi, onaysız manuel gider POST'u, makine toplu kayıtta kısmi başarının saklanması, sahte XLS uzantısı/formül riski ve güncel olmayan filtreyle rapor indirme.
- **Saha kabulünde açık:** gerçek kullanıcı/rol/multi-tenant, resmî İşNet gönderimi, gerçek banka/gelir gider mutasyonu, kısmi model–irsaliye–fatura–LOT örnekleri, Windows Excel ile TSV açma, makine/üretim gerçek cihaz işlemleri ve 1366x768/mobil browser. Test verisi üretime yazılmadı; 19/19 **KISMİ** durum sürer.


## Final doğrulanmış Pages yayın — 25.10.2026
- [PR #449](https://github.com/cetin60kaya-lgtm/ky-erp/pull/449) son onay özet/checkbox/çift-submit koruması, CI #40207296821 PASS, merged `719fd60fa97309230944833f95a7398b06630d88`.
- [Pages #40207488400](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40207488400) SUCCESS, yayın SHA `9bf4e6cdff36634b17b439ef59a6323c4ce27f57`, #449, #447, #443 merged kaynaklarının hepsi atası (behind=0); canlı bundle+Günlük Operasyon chunk smoke PASS. Worker #40206650866 SUCCESS, migrations SKIPPED.
- Canlı kaynak dağıtıldı ancak 19 sekmenin gerçek yetkili login, finans fiilî kayıt, İşNet ve imalat gerçek fiş işlemleri test edilmedi. **Tam işlev kabulü PASS değil; 19 KISMİ.**


## Son kod ve yayın: 25.10.2026
- e-Belge #447 ve İmalat #443 Pages #40206928454 SUCCESS, kaynak SHA `19fe5de0ee8639853006e7c7af157cd084f3f46f`, iki merge atası behind=0. Worker #40206650866 zaten SUCCESS, migrations SKIPPED.
- e-Belge kesin muhasebe kaydı #449: PR merged `719fd60fa97309230944833f95a7398b06630d88`; CI #40207296821 Frontend+Worker SUCCESS. Kayıttan önce belge/cari/tutar/KDV/kalem/LOT önizleme ve açık checkbox zorunlu, çift istek kilidi; ayrı Pages yayını ve gerçek oturumlu onay kabulü bekliyor.
- 19 sekme hâlâ **KISMİ**; otomatik CI, bundle smoke ve API health kanıtı canlı muhasebe/İşNet/imalat fişi saha kabulü yerine geçmez.


## 25.10.2026 — Güncel kod / CI / release kanıtı
- PR #446 Muhasebe: CI #40205322671 ve frontend Pages #40205714344 SUCCESS, yayın `ea8f1bf327d38a290cca54c814214da052e80f3d`; merge ancestry behind=0.
- PR #447 e-Belge: CI #40206047817 SUCCESS, merge `e15d1bcc0f1c30149720a72dc26853e0f27761b5`; Worker #40206650866 SUCCESS yayın SHA `17245ea35ceed2077f193756176dc510da7a8c1f`; Pages frontend yayını ayrı bekliyor.
- PR #443 İmalat: CI #40192931624 SUCCESS, merge `35405ffbbd172f929ad0865d0ef24e6b350e80a4`; frontend Pages ayrı bekliyor.
- PR #448 Worker güvenli release: CI #40206496193 SUCCESS; Worker #40206650866 D1 backup+read-only schema+API health SUCCESS, migration adımları SKIPPED.
- **Gerçek oturumlu tüm ekran / İşNet / üretim fişi / ödeme / D1 yazma kabulü yok.** Bütün 19 sekme KISMİ.


**Tarih:** 25.10.2026 · **Kaynak:** `codex/model-uretim-kontrol-merkezi-final` · **Referans:** Kullanıcının `KY_ERP_MUHASEBE_EBELGE_IMALAT_19_SEKME_ONAYLI_TASARIM.html` ekindeki 19 sekme ve iş akışı. Bu matris `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md` yerine geçmez.

## Kabul standardı

**PASS** yalnız yetkili gerçek oturum, canlı kaynak/veri, rol/firma doğrulaması, masaüstü+mobil gerçek browser, kayıt/iptal/idempotency/arıza ve canlı yayın SHA ile kanıtlandığında verilir. **KISMİ:** gerçek kod/bağlantı veya testin bir kısmı var, tam kullanıcı kabulü yok. **BLOKE:** gerekli yetki/servis/donanım erişimi veya kanıtı yok. HTML örnek tutarlar/fişler gerçek kayıt değildir. Production D1'de test kaydı yok; resmî belge gönderimi/fiilî ödeme ve gerçek personel/imalat değişimi yalnız ayrıca onayla yapılır.

| # | Sekme / route | Mevcut gerçek kaynak | Durum | Kalan kabul / iş |
|---|---|---|---|---|
| 01 | Muhasebe / Yönetim Özeti — `muhasebe/yonetim-ozeti` | `ManagementOverviewWorkspace.jsx` → `/muhasebe/yonetim-ozeti` | KISMİ | Dönem/firma filtresi, cari-vade KPI kaynak mutabakatı, oturumlu browser |
| 02 | Firmalar & Cari — `muhasebe/firma-kartlari` | `CompaniesCurrentWorkspace.jsx` → cari/firma API | KISMİ | 12–13 cariyle kullanıcı kabulü, duplicate/VKN, bakiye ve rol/firma izolasyonu |
| 03 | Alış & Tedarikçi — `muhasebe/tedarikci-faturalar` | `SupplierDocumentsWorkspace.jsx` + `CanonicalSupplierInventoryWorkspace.jsx` → e-Belge havuzu | KISMİ | PR #446 sayfalama kodu ve CI geçti, gerçek kullanıcı listesi/LOT/irsaliye stok mutabakatı bekliyor |
| 04 | Satış & Müşteri — `muhasebe/musteri-belgeleri` | `CustomerDocumentsWorkspace.jsx` + `InvoiceDispatchControlWorkspace.jsx` | KISMİ | PR #446 sayfalama; çoklu model/irsaliye-kısmi fatura + yetki browser kabulü |
| 05 | Finans İşlemleri — `muhasebe/finans-islemleri` | `FinanceOperationsWorkspace.jsx` + `PaymentPlannerPanel.jsx` + defter/kasa | KISMİ | PR #444 yayına alınmış ilk ödeme planı revizyonu; gerçek ödeme, çift tık/rol ve vade saha kabulü yok |
| 06 | Ekstre & Mail — `muhasebe/mail-ekstre` | `MailAccountingWorkspace.jsx` + `ReconciliationPanel.jsx` | KISMİ | Ekstre ve mutabakat dönem/fark doğruluğu; haricî mail gönderimi ayrı onay |
| 07 | Mali Kontrol & Raporlar — `muhasebe/mali-kontrol` | `FinancialControlWorkspace.jsx` + KDV/kâr-zarar/rapor | KISMİ | Belgelerle kaynak-mutabakat, dönem, dışa aktar ve role göre redaction |
| 08 | e-Belge / Genel Bakış — `e-belge/genel-bakis` | `EBelgeCenterPage.jsx`, `getEBelgeDashboard` | KISMİ | Gerçek gelen/giden/adet/bağlantı ve firma görünürlüğü |
| 09 | Gelen Belgeler — `e-belge/gelen-belgeler` | `EBelgeCenterPage.jsx`, `/e-belge/pool` | KISMİ | PR #447 CI/merge ile 50 kayıt/sayfa ve server yön filtresi kodlandı; Worker/Pages yayını ve gerçek oturum kabulü bekliyor |
| 10 | Giden Belgeler — `e-belge/giden-belgeler` | `EBelgeCenterPage.jsx`, `/e-belge/pool` | KISMİ | PR #447 server yön+sayfalama kodlandı; taslak/nihai gönderim ayrı kabul |
| 11 | Belge Havuzu — `e-belge/belge-havuzu` | `EBelgeCenterPage.jsx` XML/PDF yükleme + Worker/D1 | KISMİ | PR #447 100 sonrası sayfalama kodu; duplicate XML/PDF, yetkili arşiv ve yükleme ret testi |
| 12 | Eşleştirmeler — `e-belge/eslestirmeler` | `EBelgeCenterPage.jsx`, `EBelgeLineReview.jsx` | KISMİ | Cari/ürün/LOT önerisi açık onay, kısmi irsaliye ve eşleştirme kuyruğu |
| 13 | Onay & Sorunlar — `e-belge/onay-sorunlar` | `EBelgeCenterPage.jsx`, final/reconcile API | KISMİ | Hata kontrol geçmişi, yetkili son onay, tekrar POST/idempotency |
| 14 | İş Akışları — `e-belge/is-akislari` | `EBelgeCenterPage.jsx` dispatch kontrol bileşeni | KISMİ | Tetikleyici/rol/akış tanımı HTML sözleşmesine göre doğrulanmalı |
| 15 | Arşiv & Çıktı — `e-belge/arsiv-cikti` | `EBelgeCenterPage.jsx`, File Hub preview | KISMİ | XML tek asıl, PDF ekleri, yetki, çıktı/tarayıcı popup |
| 16 | Entegrasyonlar — `e-belge/entegrasyonlar` | `EBelgeIntegrationsWorkspace.jsx`, İşNet adapter | KISMİ | Gerçek İşNet provider status ve güvenli test; sahte bağlı/aktif iddiası yok |
| 17 | Model ve Üretim Kontrol — `uretim/uretim-merkezi` | `ProductionControlCenterPageV2.jsx` | KISMİ | PR #443 merge ile sayfa geçişi kodu; Pages yayını ve üretim fişi/gerçek model/rol/firma saha kabulü |
| 18 | Üretim Raporları — `uretim/uretim-raporlari` | `ImalatKontrolRapor.jsx` | KISMİ | Dönem/vardiya/makine filtre, toplamların fişlerle eşleşmesi, export |
| 19 | Makine ve Vardiya Ayarları — `uretim/uretim-ayarlari` | `ProductionSettingsPage.jsx` | KISMİ | Gündüz/gece makinacı seçimi, makine geçişi, gerçek yetkili kaydet/iptal |

## Kodlanan ve izlenebilir işler

- **PR #444 (merged):** Finans İşlemleri > Ödeme Planı; gecikenler/tüm planlar ve yazma öncesi onay. Gerçek kullanıcı ödemesi yapılmadı.
- **PR #445 (merged):** 104 sekmeli onaylı HTML'den ortak shell ilk paket. 104 ekranın tüm kabulü değildir.
- **PR #446 (merged):** Muhasebe gelen irsaliye ve satış faturası için 50 kayıt/sayfa, e-Belge Worker'daki `total/page/pageSize` sözleşmesinden toplam/adım, filtre değişiminde ilk sayfa, eski async yanıt koruması ve mobil 44 px düğme. CI `40205322671` Frontend lint/test/build + Worker typecheck/test/build SUCCESS. Pages release #40205714344 SUCCESS, yayın SHA `ea8f1bf327d38a290cca54c814214da052e80f3d`; ancestry behind=0. Gerçek kullanıcı belge sayfalaması kabulü yine bekliyor.
- **PR #443 (merged):** İmalat ana liste pagination; merge SHA `35405ffbbd172f929ad0865d0ef24e6b350e80a4`, CI #40192931624 SUCCESS. Canlı Pages ve yetkili gerçek model kabulü ayrıca gereklidir.

- **PR #447 (merged):** e-Belge havuzu/gelen/giden/matching/issues/archive server sayfalaması, tenant korumalı GET yön filtresi. CI #40206047817 Frontend+Worker SUCCESS; Worker/Pages canlı yayını henüz ayrı.
- **PR #448 (CI kapısında):** eski migrationları istemeden yeniden çalıştıran Worker yayın workflow'una açık izin/migration-free release kapısı; onaysız D1 yazma tetiklenmez.

## Sıradaki uygulama adımları

1. PR #446 Pages release #40205714344 SUCCESS; gerçek yetkili Muhasebe belge listesi 100+ smoke ayrı kabul.
2. e-Belge PR #447 merged; frontend/Worker release SHA ve canlı smoke kanıtla. Worker yayın workflow'unda eski D1 migration adımlarını ayrıca açık izin olmadan ÇALIŞTIRMA; PR #448 güvenli kapıyı bekle.
3. Muhasebe özet/cari/tedarikçi/satış/finans/ekstre/rapor sekmelerini onaylı HTML'nin iş akışına göre gerçek source, filtre, detay, hata, onay testleriyle tamamla.
4. İmalat PR #443 merged; frontend release+model pagination kullanıcı smoke kanıtla, rapor/ayarlar 3 sekmeyi bitir.
5. Her bölümde PR+CI+merge+Pages/Worker gerekiyorsa release+gerçek smoke sonucunu buraya ve proje kontrol merkezine yaz. **Gerçek oturum/browser/İşNet/D1 kanıtı olmadan PASS yazma.**

**Sınırlar:** İK Aylık/Günlük Operasyon, ortak shell, güvenlik, KY Hub Bridge, D1 production kayıtları ve dış gönderimler bu işin kapsamı dışında; onaysız değiştirilmez.
