# KY ERP — Muhasebe / e-Belge / İmalat 19 sekme gerçek kabul matrisi

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
