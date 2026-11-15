# KY ERP — Aylık yükümlülükler, gayriresmî cari, kimyasal LOT ve ürün evrakları
Tarih: 15.11.2026. Durum: **uygulama sözleşmesi / henüz canlı işlev değil**.

## Doğrulanan mevcut kod
- `MuhasebePage.jsx`: yönetim özeti, firmalar/cari, alış/satış, finans, mutabakat ve mali kontrol.
- `ProfitLossWorkspace.jsx`: `/muhasebe/accounting/reports/records`, `/muhasebe/accounting/fixed-expenses`; mevcut sabit gider yalnız **şablon** üretir, aylık fiş üretmez.
- `VatComparisonWorkspace.jsx`: `/vat/summary`; indirilecek/hesaplanan/önceki devir/ödenecek/sonraki devir görünümü.
- `CompaniesCurrentWorkspace.jsx`: firma türü, peşin-vadeli, kayıt türü, gider kategorisi ve cari kontrolleri var. Açılış hareketlerinin nihai UI/API kabulü açık.
- `CanonicalSupplierInventoryWorkspace.jsx`: belge satırı, ürün, LOT, irsaliye/fatura mutabakatı var.
- `boyahane/workflow/InventoryModals.jsx`: ürün belgesi `name/status/fileName/documentDate/validUntil` metaverisi, `lotPolicy`, başlangıçta `REVIEW_REQUIRED`.
- `boyahane/OnayliEnvanterPage.jsx` ve `EvrakDenetimPage.jsx`: örnek `boyahaneData` dizilerini kullanır; burada görülen satırlar gerçek Drive dosyası kanıtı değildir.

## A. Aylık yükümlülük tek modeli
`recurring_obligation`: id, tenant, mainCompany, optional counterparty firmId, type/category, title, amountMinor, currency, recordType(RESMI/GAYRI_RESMI), vatTreatment, startMonth(YYYY-MM), endMonth(YYYY-MM, inclusive), state(ACTIVE/PAUSED/CLOSED), revision, createdBy, audit. Ay bazında; gün aralığı alanı YOK. Kira / İSG / muhasebeci / internet / servis / lisans / sabit aidat gibi kalemler bu modelden gelir. Değişken elektrik/su/doğalgaz faturaları önceden tutarsız tahakkuk üretmez: dönemlik fatura gerçekleşene kadar planlı/tahmini, fatura onayında belge tutarı esas.
- `obligation_period`: unique(tenant,obligationId,YYYY-MM), expectedAmountMinor, postingRef, dueDate(optional), paidAmountMinor, status(PLANNED/DUE/PARTIAL/PAID/OVERDUE/CANCELLED); dönemlik istisna ve audit.
- Aylık görünüm otomatik projeksiyonla oluşturulur; idempotent kesinleştirme yapılana kadar gider/cari fişi değildir. Dönem satırı oluşturma tekrarlanırsa ikinci borç oluşmaz. 2026-11..2027-10 arasında 74.000 TL kira 12 ayrı ay yükümlülüğü gösterir; 888.000 TL yıllık toplam, 74.000 TL **aylık** gider, 12'si birden bu ayın gideri değildir. Ödeme ayrıca bağlı hareket olur; tahakkuk giderini ikinci kez yaratmaz.
- Sabit gider gerçek onaylı belgeyle eşleşirse aynı ayda iki gider oluşturulmaz; vade-tahakkuk-ödeme ve tedarikçi cari ayrı. İleri dönem toplu ödenen kira için tahakkuk/dönemsellik muhasebe politikası ayrıca uygulanır.
- Sınıflandırma: kira, İSG, elektrik, su, doğalgaz, internet, muhasebeci, personel/SGK, vergi/KDV, servis, bakım, temizlik, yemek, aidat, banka, sigorta, lisans, çeşitli/ek giderler. Vergi/KDV borcu gider kalemiyle özdeş değildir; net kâr-zarar içinde KDV ödemesini tekrar gider sayma. SGK işveren maliyeti bordro giderinden; kuruma yapılan ödeme SGK borcunu azaltır. SGK çalışan payını ikinci gider sayma.
- Ana özet: bu ay tahakkuk, ödenen, kalan, vadesi geçen, yaklaşan; detayda sourceDocumentId, paymentId ve firmId. Peşin gider cari borç oluşturmaz; ödenmiş statü kanıtlı hareket ile gösterilir.
- Gelir-gider raporunda `RESMI` ve `GAYRI_RESMI` ayrı kapsam/filtre ve birlikte yönetim görünümü; resmî vergi defteri/istisnalar karıştırılmaz.

## B. Hızlı gayriresmî cari / hatırlatma
- Hızlı Yeni Firma → başlangıç yönü (biz borçlu / bize borçlu), tutar, açılış ayı/tarihi, kayıt türü, açıklama; tek idempotent açılış hareketi. Açılış asla bu ay gelir/gider/KDV olarak raporlanmaz.
- Hızlı işlem → gayriresmî borç/alacak/ödeme; her işlem tenant + firm + actor ve audit ile. Çift gönderim `requestId` ile engellenir. Resmî e-belge veya KDV tahakkuku otomatik üretilmez.
- Ödeme hatırlatmaları `payment_reminder_rule`: target firm/obligation, timezone Europe/Istanbul, weekly weekday (örn. FRIDAY), advanceDays (örn. 2 -> WEDNESDAY), active, channel IN_APP. İlk sürüm yalnız uygulama içi görev ve bildirim; mail/WhatsApp harici gönderim **ayrı açık yetki/onay** ile. İş günü/tatil ayarı ayrı politikalı. Ödenmiş/tamamlanmış borç hatırlatma kuyruğunda aktif kalmaz.
- Ayrı `Ödemelerim & Hatırlatmalar` görünümü; bugün, 7 gün, geciken, ödenen, gayriresmî ve resmî filtreleri; firma kartı içinde aynı kaydın filtrelenmiş görünümü. Tek kayıt kaynağı.

## C. Kimyasal ürün, LOT, evrak ve Drive
- Tedarikçi kartının `Kimyasal` etiketi tek başına bütün satırları stok/LOT yapmaz. `CHEMICAL` olarak onaylı *ürün kartı* için lotPolicy **REQUIRED**; aynı tedarikçinin servis/taşıma/diğer gider kalemi için değil. Eksik LOT → `LOT_BEKLEYEN`, stok ve reçete kullanılabilirliği kilitli.
- Doğrulanmış ürün kimliği: `tenant + supplierFirmId + productId`; örn. Uras Selvi Kimya / SON Clear. Alias yalnız onaylı ürün eşleştirmesi sonrasında; ürün adı benzerliği otomatik ilişkiyi kesinleştirmez.
- MSDS/SDS, TDS ve ZDHC MRSL uygunluk **Level 3** (isteniyorsa doğrulanmış belge seviyesi) ayrı belge sınıflarıdır. Tek metin `fileName` "var" kanıtı değildir. File Hub `FileAsset/FileLocation/FileRelation` gerçek provider dosya id + hash + PDF MIME, revision, uploadDate, validUntil (belgede varsa), approval actor/date, scope ve durum ile ilişkilendirilir.
- Kimyasalın kullanılabilirlik sonucu: `DOCUMENTS_MISSING`, `REVIEW_REQUIRED`, `APPROVED`, `EXPIRED`, `REJECTED`. Evrak mevcut = uygunluk onayı değil. ZDHC Level 3 yalnız belge/sertifika ile doğrulanınca gösterilir; belgesi yoksa "belge yok / doğrulanmadı". MSDS/TDS güncellik ve uygunluk elle yetkili kabul.
- File Hub mevcut firma atamasını kullanır; Google Drive mutlak yolunu kodda sabitleme. Önerilen mantıksal arşiv: `BOYAHANE/URUNLER/<tedarikci-kimligi>/<urun-kodu>-<urun-adi>/MSDS/<revizyon>.pdf`, `TDS/<revizyon>.pdf`, `ZDHC/<revizyon>.pdf`, `LOT/<lot-no>/GIRIS/`. Her ürün 1 kimlik, her belge türü 1+ versiyon; her LOT kendine ayrı kayıt. Aynı dosya yeniden yüklenirse hash ile kopya yerine ilişki. Klasör fiziksel oluşturma File Hub'ın izinli provider API/agent işlemiyle, onaylı yeni ürün/dosya varsa idempotent gerçekleşir; hayalî boş klasör veya başka tenant klasörü oluşturulmaz.
- Akış: gelen XML `accounting_document_lines` → doğrulanmış productId → tedarikçi ilişki → gerekirse irsaliye ile tek fiziksel stok kabulü → ürüne özgü zorunlu LOT → Boyahane stok/lot/reçete → ürün evrak durumu; onaylı fatura maliyet/KDV/cari için bir kez.
- Bir LOT birden fazla giriş / tüketime bağlanabilir; ürün ve tedarikçi kimliği çapraz doğrulanır; reçete sarfı ayrı hareket ve kalan miktar negatifleşemez.

## D. Kabul/test kapıları
1. 74.000 TL, 12 ay kira: 12 dönem, tekli gider, 888.000 TL toplam; kapanan ayı yeniden hesaplama duplike etmez.
2. Kira ödeme kısmi/tam ve vade: gider ile ödeme farklı hareket; firma bakiyesi doğru.
3. Elektrik değişken tutar, fatura gelince plan–gerçek eşleşmesi; tekrarlı XML aynı gideri ikinci kez yaratmaz.
4. SGK bordro tahakkuku + bankadan ödeme, KDV alış/satış/devir + ödeme birbirine veya diğer giderlere iki kez yazılmaz.
5. Çarşamba 2 gün önceden cuma hatırlatması, ödenince kapanma; farklı timezone/ay sonu çalışır.
6. Gayriresmî firma açılışı 25.000 TL, gelir/gider/KDV etkisi sıfır; cari yönü doğru.
7. Uras Selvi SON Clear için ayrı MSDS/TDS/ZDHC PDF File Hub ilişkileri, sürüm/hashing, izin ve PDF açma; bulunmayan dosya APPROVED olamaz.
8. Kimyasal üründe LOT yoksa fiziksel giriş bloke/kuyruk; servis kaleminde LOT gerekmiyor. İrsaliye+fatura iki stok girişine yol açmaz.
9. Firma/tenant çapraz erişim RED, kullanıcı rol/audit; dosya silme veya taşınma yok.
10. En az bir gerçek yetkili tarayıcı + gerçek File Hub provider + D1 schema/backup/read-only denetimi olmadan CANLI/PASS ilan edilmez.

## Devam sırası
1. Güncel Worker `index.ts` ve mevcut fixed-expense/finance/stock route sözleşmesini incelikli kontrol et; yeni migration gerekiyorsa production D1 yedeği/onayı.
2. Aylık dönem motoru + idempotent ledger/test; sonra firma kartı ve hızlı menü.
3. Gider/KDV/SGK raporu doğru kaynak ayrımı + hatırlatma görünümü.
4. Boyahane ürün evrak File Hub ilişkileri, ürün başına klasör ve gerçek PDF açma, LOT ve onay yetkisi.
5. Yetkili test/CI, PR, güvenli migration ve canlı kabul.

**Bu dosya tasarım/kabul kaydıdır; yeni API, migration, Drive klasörü, otomatik gider veya canlı özellik uygulandı anlamına gelmez.**
