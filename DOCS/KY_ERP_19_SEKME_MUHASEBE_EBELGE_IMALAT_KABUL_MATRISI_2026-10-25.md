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
| 09 | Gelen Belgeler — `e-belge/gelen-belgeler` | `EBelgeCenterPage.jsx`, `/e-belge/pool` | KISMİ | İlk 100'e sabit çağrı + istemci yön filtresi; sunucu yön filtresi ve paging gerekli |
| 10 | Giden Belgeler — `e-belge/giden-belgeler` | `EBelgeCenterPage.jsx`, `/e-belge/pool` | KISMİ | İlk 100'e sabit çağrı + yön filtresi, taslak/nihai gönderim kontrolü |
| 11 | Belge Havuzu — `e-belge/belge-havuzu` | `EBelgeCenterPage.jsx` XML/PDF yükleme + Worker/D1 | KISMİ | 100 sonrası sayfalama, duplicate XML/PDF, yetkili arşiv ve yükleme ret testi |
| 12 | Eşleştirmeler — `e-belge/eslestirmeler` | `EBelgeCenterPage.jsx`, `EBelgeLineReview.jsx` | KISMİ | Cari/ürün/LOT önerisi açık onay, kısmi irsaliye ve eşleştirme kuyruğu |
| 13 | Onay & Sorunlar — `e-belge/onay-sorunlar` | `EBelgeCenterPage.jsx`, final/reconcile API | KISMİ | Hata kontrol geçmişi, yetkili son onay, tekrar POST/idempotency |
| 14 | İş Akışları — `e-belge/is-akislari` | `EBelgeCenterPage.jsx` dispatch kontrol bileşeni | KISMİ | Tetikleyici/rol/akış tanımı HTML sözleşmesine göre doğrulanmalı |
| 15 | Arşiv & Çıktı — `e-belge/arsiv-cikti` | `EBelgeCenterPage.jsx`, File Hub preview | KISMİ | XML tek asıl, PDF ekleri, yetki, çıktı/tarayıcı popup |
| 16 | Entegrasyonlar — `e-belge/entegrasyonlar` | `EBelgeIntegrationsWorkspace.jsx`, İşNet adapter | KISMİ | Gerçek İşNet provider status ve güvenli test; sahte bağlı/aktif iddiası yok |
| 17 | Model ve Üretim Kontrol — `uretim/uretim-merkezi` | `ProductionControlCenterPageV2.jsx` | KISMİ | İlk 100 kayıt sorunu PR #443 açık; üretim fişi/gerçek model/rol/firma saha kabulü |
| 18 | Üretim Raporları — `uretim/uretim-raporlari` | `ImalatKontrolRapor.jsx` | KISMİ | Dönem/vardiya/makine filtre, toplamların fişlerle eşleşmesi, export |
| 19 | Makine ve Vardiya Ayarları — `uretim/uretim-ayarlari` | `ProductionSettingsPage.jsx` | KISMİ | Gündüz/gece makinacı seçimi, makine geçişi, gerçek yetkili kaydet/iptal |

## Kodlanan ve izlenebilir işler

- **PR #444 (merged):** Finans İşlemleri > Ödeme Planı; gecikenler/tüm planlar ve yazma öncesi onay. Gerçek kullanıcı ödemesi yapılmadı.
- **PR #445 (merged):** 104 sekmeli onaylı HTML'den ortak shell ilk paket. 104 ekranın tüm kabulü değildir.
- **PR #446 (merged):** Muhasebe gelen irsaliye ve satış faturası için 50 kayıt/sayfa, e-Belge Worker'daki `total/page/pageSize` sözleşmesinden toplam/adım, filtre değişiminde ilk sayfa, eski async yanıt koruması ve mobil 44 px düğme. CI `40205322671` Frontend lint/test/build + Worker typecheck/test/build SUCCESS. **Pages yayın kanıtı ayrı tutulmalı.**
- **PR #443 (açık):** İmalat ana liste 100+ pagination. Mevcut PR korunacak, paralel aynı yama üretilmeyecek.

## Sıradaki uygulama adımları

1. PR #446 Pages release marker, canonical release Actions, SHA ancestry, public bundle ve oturumlu Muhasebe liste smoke (son ikisi ayrı kanıt).
2. e-Belge `EBelgeCenterPage.jsx` sabit `page:1` akışını gerçek toplamlı pagination ile düzelt; gelen/giden için DB tarafında tenant korumalı yön filtresi tasarla ve test et. Mümkünse `/e-belge/pool` mevcut GET dışındaki mutation'lara dokunma.
3. Muhasebe özet/cari/tedarikçi/satış/finans/ekstre/rapor sekmelerini onaylı HTML'nin iş akışına göre gerçek source, filtre, detay, hata, onay testleriyle tamamla.
4. İmalat #443'ü CI/diff inceleyerek koru; sonra kontrol/rapor/ayarlar 3 sekmeyi sonlandır.
5. Her bölümde PR+CI+merge+Pages/Worker gerekiyorsa release+gerçek smoke sonucunu buraya ve proje kontrol merkezine yaz. **Gerçek oturum/browser/İşNet/D1 kanıtı olmadan PASS yazma.**

**Sınırlar:** İK Aylık/Günlük Operasyon, ortak shell, güvenlik, KY Hub Bridge, D1 production kayıtları ve dış gönderimler bu işin kapsamı dışında; onaysız değiştirilmez.
