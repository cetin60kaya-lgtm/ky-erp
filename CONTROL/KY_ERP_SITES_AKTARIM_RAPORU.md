# KY ERP Sites Aktarım Kontrol Raporu

> İnceleme tarihi: 11 Temmuz 2026  
> Kapsam: `APP/app/ky-erp-frontend` ve `APP/app/ky-erp-backend`; özellikle aktif `/muhasebe` rotaları.  
> Yöntem: Kaynak kod, rota tanımları, aktif import zinciri, API controller/service kodu ve Prisma şeması statik olarak incelendi. Uygulama/veritabanı çalıştırılmadı; hiçbir uygulama dosyası değiştirilmedi. `_deadCode`, `dist`, `build`, `node_modules`, yedekler ve veri dosyaları aktif davranış kanıtı sayılmadı.

## 1. Mimari ve rota özeti

- Masaüstü uygulaması React/Vite tabanlıdır. Gerçek bir router yerine `App.jsx` URL yolunu okuyup `activeModule/activeTab` durumuna çevirir; sekme değişiminde `history.pushState` kullanır.
- Muhasebe kabuğu `src/pages/modules/MuhasebePage.jsx` içindeki `MuhasebePage` bileşenidir. Menü yetkisi `MUHASEBE` modül iznine bağlıdır.
- Ana firma kapsamı her isteğe `mainCompanySlug` ve mümkünse `mainCompanyId` olarak eklenir. Sites aktarımında bu tenant ayrımı zorunludur.
- Aktif muhasebe menüsü 15 sayfadır. Bilinmeyen muhasebe sekmesi `yonetim-ozeti` ekranına düşer.

### Aktif muhasebe sayfaları, URL ve frontend karşılığı

| # | Menü / URL | Ana frontend dosyası ve aktif bileşenler |
|---|---|---|
| 1 | Muhasebe Yönetim Özeti — `/muhasebe/yonetim-ozeti` | `src/pages/modules/MuhasebePage.jsx`: `MuhasebePage`, `ManagementSummary`, `CariSummaryMetric`, `Card`, `DataTable`, `SideLine` |
| 2 | Firma Kartları — `/muhasebe/firma-kartlari` | aynı dosya: `CompanyCards`, `FirmListButton`, `SearchableFirmField`, `Impact`, `Badge` |
| 3 | Firma Yetkilileri — `/muhasebe/firma-yetkilileri` | aynı dosya: `FirmContacts`, `FirmListButton`, `DataTable` |
| 4 | Gider Kategorileri — `/muhasebe/gider-kategorileri` | aynı dosya: `ExpenseCategories`, `Card`, `DataTable` |
| 5 | Tedarikçi Faturaları — `/muhasebe/tedarikci-faturalar` | `src/pages/muhasebe/BelgeIslemMerkezi.jsx`, `BelgeIslemMerkezi.css`; servis `muhasebeDocumentService.js` |
| 6 | Kesilen Faturalar — `/muhasebe/kesilen-faturalar` | `src/pages/modules/muhasebe/KesilenFaturalarTab.jsx`, `KesilenFaturalarTab.css`; ortak `_docHelpers.jsx`, `_muhasebeShared.jsx` |
| 7 | Gelir / Gider — `/muhasebe/kar-zarar` | `MuhasebePage.jsx`: `ProfitLossCenter`, kategori/manüel kalem formları, özet kartları |
| 8 | Model Takip — `/muhasebe/model-takip` | `BelgeIslemMerkezi.jsx`: dışa verilen `ModelMerkezliMusteriTakip` |
| 9 | Cari Hareketler — `/muhasebe/cari-hareketler` | `MuhasebePage.jsx`: `CariMovements`, `CariSummaryMetric`, belge/PDF/XML önizlemeleri |
| 10 | Ürünler — `/muhasebe/envanter-urunleri` | `MuhasebePage.jsx`: `ProductMatchingQueue`, `ProductQueuePanel`, `ProductMatchTable`, `ProductAliasManager`, `ProductUsageReport`, `InventoryProducts` |
| 11 | KDV Kontrol — `/muhasebe/kdv-kontrol` | `MuhasebePage.jsx`: `KdvControl` |
| 12 | Çek / Ödeme — `/muhasebe/cek-odeme` | `src/pages/muhasebe/CekOdemeMerkeziPage.jsx`; servis `src/services/cekOdemeApi.js` |
| 13 | Mail / Ekstre Takip — `/muhasebe/mail-ekstre` | `MuhasebePage.jsx`: `MailExtract` (aktif ekranda `/api/mail-tracking` kullanılır) |
| 14 | Mail Şablonları — `/muhasebe/mail-sablonlari` | `src/pages/muhasebe/MailSablonlariPage.jsx` |
| 15 | Muhasebe Raporları — `/muhasebe/muhasebe-raporlari` | `MuhasebePage.jsx`: `Reports`, `SupplierInvoiceArchiveReport` |

### Eski/takma URL davranışı

- `genel-bakis` → `yonetim-ozeti`.
- `belge-kontrol`, `belge-is-akisi`, `belge-yukle`, `belge-merkezi`, `model-muhasebe*`, `tedarikci-fatura` → `tedarikci-faturalar`.
- `musteri-belgeleri` → `kesilen-faturalar`.
- `kar`, `zarar`, `gelir-gider`, `is-hacmi` → `kar-zarar`.
- `envanter`, `urunler`, `urun-kartlari`, `urun-eslestirme`, `urun-eslesmeleri`, `alias(es)` → `envanter-urunleri`.
- `cari` → `cari-hareketler`; `firmalar` → `firma-kartlari`; `kdv` → `kdv-kontrol`.
- `cek-kart`, `odeme-nakit-akisi`, `odemeler`, `odeme-tahsilat` → `cek-odeme`.
- `eposta-ekstre` → `mail-ekstre`; `raporlar` → `muhasebe-raporlari`.
- Tedarikçi arşiv URL'leri `/muhasebe/muhasebe-raporlari?tip=tedarikci-fatura-kontrol-arsiv` adresine yönlenir.
- Hata: `isveren-ozeti` yönlendirmesi kaynakta `/muhasebe/muhasebe-raporlaritip=yonetici-ozet` biçiminde, `?` eksik üretilmiştir.

## 2. Ekran envanteri: butonlar, tablolar, filtreler, modallar

### Yönetim Özeti

- Üst kartlar: Onay Bekleyen Belge, Mail Bekleyen Fatura, Departman Yetkilisi Eksik, Ekstreye Girmeyen, Net KDV.
- Günlük iş tablosu: Öncelik, İş, Firma, Model, Belge, Tutar, Durum, İşlem; `Aç` butonu hedef muhasebe sekmesine götürür.
- Yaklaşan çek kartları: Açık Çek, Toplam Tutar, Yaklaşan, Vadesi Geçmiş.
- Aylık çek tablosu: Ay, Çek Sayısı, Toplam Tutar.
- Yaklaşan ödeme tablosu: Vade, Firma, Belge, Ödeme Tipi, Tutar, Çek Görsel, Durum.
- Sağ özet: Bu ay satış, Bu ay alış/gider, Gelen/Giden/Devreden KDV, Tahsilat bekleyen, Ödeme bekleyen.
- Butonlar: Haftalık Özet Yazdır, Aylık Rapor Aç, Mail Bekleyenleri Aç, Ekstre Farklarını Aç.

### Firma Kartları

- Sol liste filtreleri: metin arama, müşteri/satıcı/ikisi, resmî/gayri/ikisi, aktiflik, bakiye tipi; bakiye artan/azalan sıralama.
- Kart formunda görünür temel alanlar: Firma Adı, Firma Tipi, Resmî/Gayri çalışma profili, Rapor Kategorisi, Vergi No, Varsayılan KDV, Mevcut Bakiye, Devreden KDV. Kaydet/Yeni/Temizle, bakiye düzelt, benzer firmayı birleştir veya alias olarak bağla, pasife al işlemleri vardır.
- Resmî/Gayri seçenekleri basit bayrak değil iş profili seçer: Resmî-cari takip; Resmî-peşin alış/KDV; Resmî-sadece KDV/gider dışı; Gayri resmî gider.
- Firma özetinde bakiye, borç, alacak, son işlem, cari takip ve profil etkileri gösterilir.
- Birleştirme/alias ve bakiye düzeltme kullanıcı onayı alan modallar/uyarı akışlarıdır.

### Firma Yetkilileri

- Firma arama/listesi ve seçili firma kişileri tablosu bulunur.
- Kişi alanları: ad-soyad, e-posta, telefon, departman, unvan, aktiflik; fatura, irsaliye, ekstre, ödeme hatırlatma, genel muhasebe CC, model sorumlusu/model atama/fiyat görme yetkileri.
- Yeni kişi, düzenle, kaydet, sil/pasife al; eksik departman/yetki durumunu rapora götürme işlemleri vardır.

### Gider Kategorileri

- Kategori formu: ad, kod, kategori tipi, ana kategori, sıra, renk, açıklama, aktiflik.
- Tablo kategori ağacını/listesini gösterir; yeni, düzenle, kaydet ve sil butonları vardır. Sistem kategorileri ile kullanıcı kategorileri ayrılır.

### Tedarikçi Faturaları / Belge İşlem Merkezi

- Belge yükleme: PDF/XML/ZIP ve çoklu dosya; otomatik işlem veya kontrollü yükleme.
- Havuz filtreleri: durum, belge türü, firma, tarih/arama ve aktif merkez; kontrol bekleyen, eksik bilgi/karantina, hazır, işlenen, reddedilen/arşiv grupları.
- Liste ve detay: belge no/fatura no, firma, tarih, ara toplam, KDV, genel toplam, eşleşme, güven skoru, eksik alanlar, satırlar, dosya önizleme.
- Satır tablosu: açıklama/ham ad, miktar, birim, kg/paket, birim fiyat, iskonto, matrah, KDV oran/tutar, toplam, lot, ürün/model eşleşmesi.
- İşlemler: onayla, toplu onayla, reddet, tekrar dene/tasnif et/işle, düzelt, firma oluştur, ürün oluştur, ürüne bağla, arşivle, reddedileni temizle, `Bu belgeyi Peşin Gidere Çevir`.
- Kritik kurallar: mükerrer belge ve kritik eksik alan engeller; düşük parser güveni gibi uyarılar manuel onayla aşılabilir. İşlenmiş durum ailesi `APPROVED/PROCESSED/AUTO_PROCESSED/POSTED/ISLENEN` birlikte ele alınmalıdır.

### Kesilen Faturalar

- Filtre/liste: fatura no, müşteri, tarih/durum; satış faturası ayrıntısı ve geçmiş.
- Yükleme modalı/dosya seçimi; PDF/XML fatura yükleme.
- Bilgi alanları: fatura no/tarih, müşteri, vergi no, irsaliye/sipariş, para birimi, ara toplam, KDV, genel toplam, cari ve model durumu.
- Kalemler ve model bağlantıları; model seçici, miktar ve baskı bölgesi; modele bağla, model dışı işaretle, bağlantıyı kaldır.
- Cari işle butonu satış faturasını cari hesaba yansıtır. Fatura görüntüleme/yazdırma modalı ve geçmiş paneli vardır.

### Gelir / Gider

- Tarih aralığı, kategori, firma ve kart boyutu/rapor görünümü filtreleri bulunur.
- Özet metrikleri satış, gider, kâr/zarar, KDV ve kategori kırılımlarından oluşur.
- Sistem kategorileri, alt kategoriler ve manuel rapor kalemleri eklenebilir/düzenlenebilir/silinebilir.
- Manuel kalem formu: ad, kart tipi, kategori, firma, tarih veya başlangıç/bitiş, tutar, KDV, açıklama, aktiflik.

### Model Takip

- Müşteri/model merkezli belge takibi yapar; firma, model, belge ve eşleşme durumlarına göre liste/filtre kullanır.
- İrsaliye/fatura bağlantısı, model sorumlusu ve eksik belge durumları görülür; ilgili belge iş akışına geçiş yapılır.

### Cari Hareketler

- Firma listesi: arama, tip/resmîlik/aktiflik ve bakiye sıralama; seçili firma özet kartları (güncel bakiye, toplam borç, toplam alacak, vadesi geçen).
- Hareket filtreleri: başlangıç/bitiş tarihi, hareket türü, resmî/gayri, arama/durum.
- Hareket tablosu: tarih, tür, açıklama/belge, vade, borç, alacak, bakiye, resmîlik ve işlem.
- Yeni/düzenle formu; işlem türüne göre ödeme, tahsilat, satış, alış/gider, açılış/düzeltme; tarih, vade, tutar, açıklama, belge no, resmî/gayri.
- Özel akışlar: çek oluşturma; kredi kartı firma ödemesi; çek ön/arka ve kart hareketi görseli yükleme; hareketi pasife alma.
- Belge detay modalı PDF/XML önizlemesi, kalemler ve bağlantılı muhasebe izlerini gösterir.

### Ürünler

- Alt paneller: ürün eşleştirme kuyruğu, ürün/alias yönetimi, kullanım raporu, envanter ürün kartı.
- Kuyruk filtreleri belge/satır/firma/eşleşme durumudur; satırı ürüne bağla, yeni ürün oluştur ve bağla, toplu işle.
- Ürün kartı alanları ürün adı/kod/tip/kategori, birim, KDV, lot takibi, fiyat, tedarikçi, stok/aktiflik ve aliaslardır.
- Kullanım tablosu belge, firma, tarih, miktar, tutar ve lot bazında iz sağlar.

### KDV Kontrol

- Dönem ve firma filtreleri; hesaplanan/giden, indirilecek/gelen, devreden, düzeltme, net/ödenecek/devredecek KDV kartları.
- Firma tablosu ve firma detayında belge/kayıt kırılımı: tarih, belge, matrah, oran, KDV, toplam, yön/resmîlik.
- KDV düzeltme modalı tutar, yön, dönem ve açıklama alır. Net formül: `hesaplanan - indirilecek - devreden + düzeltme`; pozitif sonuç ödenecek, negatif mutlak değer devredecek KDV'dir.

### Çek / Ödeme

- Üç kolonlu merkez: firma listesi; işlem alanı ve hareket sekmeleri; seçili firma özeti/açık kalemler.
- Firma filtreleri arama, tip ve bakiye; metrikler güncel bakiye, açık borç/alacak, yaklaşan/vadesi geçen çeklerdir.
- İşlem yönü ödeme/tahsilat; yöntemler nakit, havale/EFT, çek, kredi kartı, mahsup/kısmi ödeme.
- Çek formu: çek no, banka, vade, tutar, resmîlik, durum, ön/arka görsel. Kart formu: kart/banka, limit, hesap kesim ve son ödeme günleri; firma veya ekstre ödemesi ve dekont görseli.
- Sekmeler hareketler, çekler, kartlar, nakit/havale ve açık kalemlerdir; yeni/düzenle, kaydet, ödenmiş işaretle, pasife al/sil ve görsel aç işlemleri vardır.

### Mail / Ekstre ve Mail Şablonları

- Mail/Ekstre: firma/model/fatura/irsaliye, alıcı-CC, tutar, mail durumu ve ekstre durumu listelenir; bekleyen/durum filtreleri, kayıt seçimi ve `Taslak Oluştur` işlemi vardır.
- Mail Şablonları: şablon listeleme/düzenleme, konu/gövde/değişken alanları ve kaydet/önizle akışı. Bu ekranın veri kaynağı ayrıca aktarılmalıdır; sadece UI kopyası yeterli değildir.

### Muhasebe Raporları

- Rapor seçici: Yönetici Kâr/Zarar, Satış/Müşteri, Tedarikçi/Satın Alma, Peşin ve Takip Dışı Gider, Personel Giderleri, KDV Özeti/Raporu, Nakit/Çek Özeti, haftalık/aylık yönetim özeti, Cari Ekstre, Çek Listesi/Vade, tedarikçi kontrol arşivi, mail/departman yetki, ekstreye girmeyen faturalar, mail takip.
- Filtreler rapora göre tarih, firma, durum/kategori ve `tip` query değeridir.
- Tedarikçi arşivi durum filtreleri: işlenen, karantina, KDV inceleme, fiyat eksik, mükerrer; firma/fatura/tarih filtreleri ve detay açma.
- Excel paketi indirme `GET /muhasebe/rapor-excel`; tarayıcı yazdırma/PDF akışları haftalık-aylık raporlarda kullanılır.

## 3. Firma kartındaki bütün alanlar

Aktif UI, normalizasyon, gönderilen payload ve veri modelinde görülen birleşik alan seti:

- Kimlik/kapsam: `id`, `mainCompanyId`, `mainCompanySlug`, `legacyId`.
- Tanım: `firmaAdi/name`, `kisaAd/shortName`, `normalizedName`, `firmaTipi/firmType/type` (MUSTERI, SATICI, BOTH), `firmaTuru/companyKind`.
- Resmîlik/profil: `resmiGayri/defaultRecordType/workType/officialType`; `companyTransactionProfile/calismaProfili`; `expenseCalculationMode/giderHesaplamaTipi`; `vatOnlyExpense/sadeceKdvKullan`; `trackReceivablePayable/cariTakipEdilsin`; `cariTakipDisi`; `cariBakiyesiBilgiAmacli`; `defaultCashSettlement/varsayilanPesinKapama`.
- Vergi/iletişim: `vergiNo/taxNo`, `vergiDairesi/taxOffice`, `telefon/phone`, `email/eposta`, `adres/address`.
- Muhasebe varsayılanları: `varsayilanKdv/defaultVatRate`, `defaultVatType/varsayilanKdvTipi`, `defaultSupplierPostingType/varsayilanTedarikciIslemTipi` (`OPEN_PAYABLE` veya `PAID_EXPENSE`), `defaultPaymentStatus/varsayilanOdemeDurumu`, `varsayilanRaporKategoriId/raporKategoriId`.
- Açılış ve güncel bakiye: `acilisBakiyesi/openingBalance`, `acilisBakiyeTarihi/openingBalanceDate`, `borcAlacakYonu/openingBalanceDirection`, `mevcutBakiye/currentBalance`, `toplamBorc`, `toplamAlacak`, `bakiyeYonu`, `sonIslemTarihi`.
- KDV açılışı: `devredenKdv/openingVatAmount`, `devredenKdvAyi/openingVatPeriod`.
- Risk/vade: `vadeGunu/dueDay`, `riskLimiti/riskLimit`.
- Durum/açıklama: `not/cariNotu/note`, `aktif/isActive`, `status`, `isFavorite`, `source`, silme/pasif alanları.
- İlişkiler: aliaslar, hareketler, belgeler, KDV kayıtları, kişiler/yetkiler. Bazı yeni profil alanları Prisma `Company.raw` JSON içinde tutulur; Sites veri modelinde kaybolmamalıdır.

## 4. Cari hareket türleri ve bakiye mantığı

- Prisma enumu temel türleri `DEBIT` ve `CREDIT` olarak tutar; UI/servis katmanı satış, alış/gider, ödeme, tahsilat, çek, kart, açılış ve düzeltme gibi iş türlerini `movementType/sourceType/raw` alanlarıyla zenginleştirir.
- Kanonik formül: `güncel bakiye = açılış bakiyesi + toplam borç - toplam alacak`.
- Her harekette `effect = debit - credit`; `balanceAfter = önceki Company.currentBalance + effect`. Pozitif bakiye/etki borç, negatif bakiye/etki alacak yönüdür.
- Satış yönü pozitif (firma borçlanır), alış/tedarikçi faturası negatif (işletmenin borcu/alacak etkisi); tahsilat alacağı azaltır, ödeme borcu kapatır. Ödeme/çek yönü backend `paymentEffect/checkEffect` ile belirlenir.
- Hareket güncellemede eski ve yeni etki farkı (`delta`) güncel bakiyeye uygulanır; pasife alma/silmede eski etki geri alınır. Bu ters kayıt davranışı korunmalıdır.
- Açık tahsilat yönetim özetinde pozitif bakiyelerin toplamı; açık ödeme negatif bakiyelerin mutlak toplamıdır.
- Peşin gider/kredi kartı/nakit/banka ile ödenmiş giderlerde açık cari borç üretilmemeli; gider, KDV ve ödeme izi korunmalıdır. `convert-to-paid-expense` mevcut yanlış cari etkisini silmeden nötrler.

## 5. Resmî / gayriresmî ayrımı

- Firma kartının varsayılanı belge/hareket oluştururken taşınır; kayıt seviyesinde ayrıca değiştirilebilir.
- `RESMI`: fatura/KDV/cari ve resmî rapor zincirine girer. `GAYRI`: gayriresmî gider/izleme grubuna gider; KDV ve resmî rapor etkisi iş kuralına göre dışlanır. `BOTH` firma iki tür kayıt kabul eder.
- İş profilleri ayrımı yalnızca etiket değildir: resmî cari, resmî peşin KDV, sadece KDV/gider dışı ve gayri gider farklı cari/KDV/rapor etkileri üretir.
- Rapor ve cari filtrelerinde ayrım korunmalı; resmî ve gayri tutarlar tek toplamda kontrolsüz birleştirilmemelidir.

## 6. Yönetim özeti hesaplamaları

- Onay bekleyen: durumu `islendi/processed` olmayan belge sayısı (burada yeni durum ailesiyle tam uyum kontrol edilmelidir).
- Mail bekleyen: mail/ekstre servisinin `gonderilecek`; yetkili eksik: `aliciEksik`.
- Ekstreye girmeyen: ekstre karşılaştırma metninde `yok` veya `girmeyen` geçen kayıt sayısı.
- Bu ay satış: ay içindeki `SATIS` belgelerinin tutar toplamı; bu ay alış/gider: ay içindeki satış dışı belgelerin toplamı.
- KDV: gelen, giden ve devreden KDV servisinden; net KDV ilgili servis formülünden gelir.
- Tahsilat bekleyen: pozitif cari bakiyeler; ödeme bekleyen: negatif bakiyelerin mutlak toplamı.
- Çek kartları açık çek sayısı/tutarı ile yaklaşan, vadesi geçmiş ve aylık dağılımı `buildCheckDashboard` sonucundan alır.

## 7. Aktif frontendin kullandığı başlıca API adresleri

Tüm yollar ana firma scope parametreleri ve JWT ile çağrılır. Backend çoğu muhasebe yolunu hem `/muhasebe/...` hem `/api/muhasebe/...` aliasıyla sunar.

- Özet/rapor: `GET /muhasebe/yonetim-ozeti`, `GET /muhasebe/rapor-ozet`, `GET/POST /muhasebe/rapor-ayarlari`, CRUD `/muhasebe/rapor-kategorileri`, CRUD `/muhasebe/rapor-manuel-kalemler`, `GET /muhasebe/rapor-excel`.
- Firma/cari: CRUD `/muhasebe/firmalar`; `GET /firmalar/:id/cari-ozet`; merge/alias/pasif; `GET/POST/PATCH /muhasebe/cari-hareketler`, detay ve `belge-detay`, `pasife-al`; `/muhasebe/firma-kartlari` ve kişi CRUD uçları; `adjust-balance`.
- Belge: `/muhasebe/document-upload`, history/summary; `/muhasebe/belge-havuzu`; `/muhasebe/document-intake`; `/muhasebe/belge-import`; upload/auto-process, approve/retry/reject, bulk approve, archive/purge, fix, create-firm/product, read templates ve `/:id/convert-to-paid-expense`.
- Kesilen fatura: `GET /muhasebe/kesilen-faturalar`, `GET /:id`, `POST /yukle`, `POST /:id/cari-isle`, kalem `model-bagla`, `model-disi`, model bağlantısı silme; model listesi için `/desen/modeller`.
- Ürün: `/muhasebe/envanter-urunleri`, `/urun-eslestirme-kuyrugu`, `/urun-eslesmeleri`, `/urun-kullanimlari`, belge kalemi bağlama/ürün oluşturma ve toplu işlem.
- KDV: `GET /api/vat/summary`, `GET /api/vat/firms/:firmId/detail`, `POST /api/vat/firms/:firmId/adjustment`.
- Çek/kart: `/muhasebe/cekler`, `/muhasebe/cheques/:id/front-image|back-image`, `/muhasebe/kredi-kartlari`, `/muhasebe/kredi-kart-hareketleri`, firma/ekstre ödemesi ve görsel.
- Yeni ödeme merkezi: `GET /api/muhasebe/odeme/firmalar`, firma `ozet/cekler/kartlar/nakit-havale/hareketler/acik-kalemler`; `POST /api/muhasebe/odeme/firma|cek|kart|islem`.
- Mail: `GET /api/mail-tracking`, `POST /api/mail-tracking/create-draft`; firma kişi ve mail şablonu uçları ilgili sayfalardadır.
- Mail şablonları (aktif servis): `GET/POST /muhasebe/mail/templates`, `PATCH/DELETE /muhasebe/mail/templates/:id`, `POST /muhasebe/mail/templates/seed`, `POST /muhasebe/mail/templates/render`, `GET /muhasebe/mail/templates/drafts/list`, `POST /muhasebe/mail/templates/drafts`, `POST /muhasebe/mail/templates/drafts/:id/mark-sent`.
- Servis katmanındaki yardımcı/uyumluluk uçları: `/muhasebe/dashboard`, `/preview`, `/reports/management-summary`, `/raporlar/:tip`, `/raporlar/:tip/yazdir`, `/fatura-kesim/pdf-oku|havuz|:id|:id/link-model|:id/fatura-kaydi|:id/isnet-dosyalari`, `/mail-ekstre`, `/eposta-kisileri`, `/documents/queue`, `/documents/:id/detect|confirm`, `/workflow/queue`, `/workflow/:id/action`, `/payments/queue|reminders`, `/payments/:id/action|reminder`, `/model-muhasebe/packages|read-package|save-package|package/:id|models/search|model/:id/summary|model-order/:id/compare`. Bunların tamamı mevcut aktif ekran tarafından aynı anda çağrılmasa da gönderilecek servis dosyasında tanımlı uyumluluk sözleşmesidir.

## 8. İlgili veritabanı tabloları ve temel alanlar

| Tablo | Kritik alanlar / amaç |
|---|---|
| `main_companies` | `id, slug, name, is_active`; tenant kökü |
| `companies` | firma kimliği, tip/vergi/iletişim, resmîlik, KDV, açılış/güncel bakiye, kategori, `raw`, aktif/silme |
| `company_aliases` | firma ad/vergi eşleştirme aliasları |
| `current_account_movements` | firma, tarih, tür/kaynak, belge, debit, credit, amount, effect, balance_after, raw |
| `documents`, `document_files` | belge başlığı/tutar/KDV/durum/rota, kategori, raw/metadata ve fiziksel dosya izi |
| `document_intakes`, `document_intake_lines`, `document_intake_matches` | yüklenen belge, parse/eşleşme/eksik alan/durum ve satır ayrıntıları |
| `document_read_templates` | firmaya özgü okuma şablonları |
| `sales_invoice_states`, `invoice_items`, `sales_invoice_line_model_links`, `sales_invoice_history` | kesilen fatura cari/model durumu, kalem/model bağlantıları ve audit geçmişi |
| `vat_records`, `kdv_records`, `vat_carryovers` | dönem/yön/matrah/oran/tutar, devreden ve düzeltme KDV |
| `payments`, `checks`, `credit_cards`, `credit_card_movements` | ödeme, çek, kart ve kart hareketi; vade/durum/görsel |
| `payment_records`, `cheque_payments` | yeni ödeme merkezi ve uyumluluk modelleri |
| `products`, `product_aliases`, `stock_movements` | ürün, alias, stok/lot ve belge kullanımı |
| `company_departments`, `company_contacts`, `company_contact_authorities` | firma kişi/departman ve ayrıntılı alıcı yetkileri |
| `firm_contacts`, `model_mail_assignments`, `mail_tasks`, `mail_tracking`, `mail_send_logs` | eski/yeni mail kişi, model atama, taslak/gönderim takibi |
| `muhasebe_rapor_kategorileri`, `muhasebe_rapor_manuel_kalemler` | gelir/gider sınıfları ve manuel rapor kartları |
| `auth_users`, `auth_user_module_permissions` | rol, aktiflik ve modül bazlı CRUD/onay yetkisi |
| `activity_logs`, `muhasebe_logs` | işlem/audit izi |

Not: Şemada aynı alanı temsil eden eski/yeni paralel modeller (`Company`/`Firm`, `CurrentAccountMovement`/`CariMovement`, `VatRecord`/`KdvRecord`, `Check`/`ChequePayment`) vardır. Sites aktarımında tek modele körlemesine indirgemek veri ve iş kuralı kaybı oluşturur; önce hangi endpointin hangi tabloyu kullandığı korunmalı, sonra kontrollü konsolidasyon yapılmalıdır.

## 9. Kullanıcı rolleri ve yetkiler

- Roller: `ADMIN`, `MUHASEBE`, `DESEN`, `IMALAT`, `BOYAHANE`, `IK`, `VIEWER`.
- Modül anahtarları: `DASHBOARD`, `MUHASEBE`, `FIRMA_CARI`, `BELGE_ISLEM`, `KDV`, `CEK_ODEME`, `DESEN`, `IMALAT`, `BOYAHANE`, `IK`, `ADMIN`, `RAPORLAR`.
- Her kullanıcı-modül satırı `canView`, `canCreate`, `canUpdate`, `canDelete`, `canApprove` taşır. `ADMIN` tüm kontrolü bypass eder.
- Frontend muhasebe menüsünü yalnız `MUHASEBE.canView` ile gösterir. Backend guard URL'nin ilk parçasından modülü çıkarır; GET=view, POST=create, PATCH/PUT=update, DELETE=delete; URL'de `onay/approve` varsa approve ister.
- Risk: `/api/vat/...` ve `/api/mail-tracking...` yollarının ilk parçası guard haritasında muhasebe/KDV olarak açıkça eşleşmeyebilir; Sites'te endpoint bazlı açık yetki tanımı yapılmalıdır. Ayrıca frontend ekran içinde butonları `canCreate/canUpdate/...` ile ayrıntılı gizlemiyor; güvenlik backendde kalmalıdır.

## 10. Excel/PDF içe-dışa aktarma

- İçe aktarma: tedarikçi ve kesilen faturalarda PDF/XML/ZIP; belge merkezinde OCR/parser, dosya hash ile mükerrer kontrol, parse/eşleştirme ve arşiv izi.
- Çek/kart/cari: görüntü veya PDF dekont, çek ön/arka görsel yüklenir.
- Firma kartları backendinde Excel import, import preview, açılış ve toplam düzeltme uçları vardır; aktif `CompanyCards` görünümünde bu import kontrolleri görünür şekilde bağlı değildir.
- Dışa aktarma: rapor Excel paketi `/muhasebe/rapor-excel`; rapor ve fatura yazdırma görünümü tarayıcı print CSS ile PDF'e dönüştürülebilir. Belge/fatura PDF ve XML dosyaları API URL'leri üzerinden görüntülenir/indirilir.
- Sites için dosyaları base64 veya yerel mutlak yol olarak DB'ye gömmek yerine kalıcı obje depolama + metadata/checksum + yetkili indirme URL'si gereklidir.

## 11. Mobil ve responsive yapı

- Masaüstü kabuğunda 1500/1360 px kırılımları; Belge İşlem Merkezi 1450/980 px; Kesilen Faturalar 1450/900 px; genel uygulamada 1180, 980, 900, 820, 760, 560 gibi kırılımlar vardır. Geniş tablolar yatay kaydırılır.
- Çek/Ödeme merkezi çok kolonlu ve tabloları `min-width` kullanan yoğun bir masaüstü tasarımdır; dar ekranda ayrı mobil akış daha güvenlidir.
- `/mobile` için ayrı lazy bundle ve Capacitor algısı vardır. Muhasebe mobil rotaları: `/mobile/muhasebe`, `/cari`, `/odeme`, `/cek`, `/kdv`, `/fatura-irsaliye`, `/urunler`; ayrıca `/mobile/yonetim`.
- Mobil ekranlar masaüstü 15 ekranın birebir karşılığı değildir; mail, raporlar, firma yetkilileri, gider kategorileri ve ayrıntılı belge kontrolü mobilde eksiktir. Sites aktarımında responsive masaüstü ile ayrı mobil özellik setinin hangisinin hedef olduğu açık seçilmelidir.

## 12. Eksik, çalışmayan, sahte/demo veya riskli bölümler

- Statik inceleme gerçek veriyle çalışma garantisi vermez; bu rapor hiçbir mock/demo çıktısını başarı kanıtı saymaz.
- `isveren-ozeti` URL'sinde `?` eksikliği kesin bir rota hatasıdır.
- `muhasebeApi.js` içindeki model arama yolu ``/muhasebe/model-muhasebe/models/searchq=...`` biçiminde ve `?q=` ayıracı eksiktir.
- Yönetim özetindeki onay bekleyen filtresi yalnız `islendi/processed` metinlerini dışlıyor; diğer işlenmiş statüler (`APPROVED`, `AUTO_PROCESSED`, `POSTED`, `ISLENEN`) yanlışlıkla bekleyen sayılabilir.
- Kaynakta eski alternatif muhasebe sayfaları ve `_deadCode` vardır; aktif import zincirinde olmayan dosyalar Sites'e ekran diye taşınmamalıdır.
- `utils/storage.js` eski/localStorage muhasebe seed anahtarları taşır ancak aktif zincirin localStorage seed'e dayanmadığı açıkça yazılıdır; bunlar gerçek backend yerine kullanılmamalıdır.
- Firma Excel import backend uçları mevcut fakat aktif kart ekranında görünür bağlantısı doğrulanmadı.
- Rol guard'ın `/api/vat` ve `/api/mail-tracking` modül çıkarımı açık değildir; yetkisiz serbest geçiş riski kod seviyesinde incelenmelidir.
- Şemada çift/legacy tablolar ve çok sayıda alias endpoint vardır. Sites'e sadece UI kopyalamak, hangi servis/tablonun otorite olduğunu kaybettirir.
- Mail Şablonları ve bazı mail/ekstre işlevlerinin gönderim sağlayıcısı/kalıcı şablon depolaması ayrıca doğrulanmadan “çalışıyor” kabul edilmemelidir.
- PDF/OCR/ZIP, yerel storage ve klasör izleyici Sites/Cloudflare çalışma ortamına doğrudan taşınamaz; asenkron iş/queue ve obje depolama uyarlaması gerekir.

## 13. Sites'e aktarılırken korunması gereken iş kuralları

1. Her kayıt ve sorgu aktif `mainCompanySlug/mainCompanyId` ile izole edilmelidir; firma değiştirme tenant sızıntısı yaratmamalıdır.
2. JWT/oturum ve backend `canView/create/update/delete/approve` kontrolleri UI görünürlüğünden bağımsız uygulanmalıdır.
3. Firma profilindeki resmî/gayri, cari takip, peşin kapama, yalnız KDV, varsayılan KDV/rapor kategorisi ve tedarikçi posting tercihleri aynen taşınmalıdır.
4. Cari formülü ve ters kayıt: `açılış + borç - alacak`; güncellemede delta, pasife almada eski etkiyi geri alma; geçmiş kayıt silinmeden audit izi.
5. Açık borç üreten `OPEN_PAYABLE` ile `PAID_EXPENSE/CREDIT_CARD_EXPENSE/CASH_EXPENSE/BANK_PAID_EXPENSE` ayrılmalı; peşin gider açık cari borç bırakmamalı ama gider/KDV/ödeme izi bırakmalıdır.
6. Yanlış işlenmiş belge delete/recreate edilmemeli; `convert-to-paid-expense` gibi geri döndürülebilir düzeltme kullanılmalıdır.
7. İşlenmiş belge durumları tek aile olarak ele alınmalı: `APPROVED`, `PROCESSED`, `AUTO_PROCESSED`, `POSTED`, `ISLENEN`.
8. Uyarı seviyesindeki parse eksikleri manuel onaya izin verebilir; mükerrer/kritik finansal eksikler bloklanmalıdır.
9. Belge dosya hash'i, orijinal dosya, parse ham verisi, eksik alanlar, eşleşme skoru, onaylayan ve işlem geçmişi saklanmalıdır.
10. Satış faturası cari işlemi idempotent olmalı; aynı fatura ikinci kez cari hareket üretmemelidir. Model bağlantıları kalem ve miktar/baskı bölgesi bazında korunmalıdır.
11. KDV yönü, dönem, matrah, oran, düzeltme ve devreden tutar birbirinden ayrılmalı; net formül aynı kalmalıdır.
12. Çek/kart/ödeme vadesi, yönü, durumu, görselleri ve açık kalem mahsup/kısmi ödeme bağlantısı korunmalıdır.
13. Firma kişi/departman yetkileri mail alıcı/CC üretiminin kaynağıdır; eksik yetkili uyarıları kaybolmamalıdır.
14. Rapor kategorisi ve manuel kalemlerin sistem/kullanıcı ayrımı ile resmî/gayri ve tarih/ana firma filtreleri korunmalıdır.
15. Dosyalar kalıcı depoda tutulmalı; DB yalnız güvenli anahtar, metadata, checksum ve ilişkiyi taşımalıdır. Yerel Windows yoluna bağımlılık kaldırılırken arşiv erişimi kaybedilmemelidir.
16. İçe aktarma ve uzun OCR/parse işlemleri kullanıcı isteğini bloklamayan kuyruk/job durumuyla yürütülmeli; tekrar deneme idempotent olmalıdır.

## 14. Sites aktarım sırası önerisi

1. Kimlik, ana firma scope ve izin modeli.
2. Firma kartı + kişi/yetki + kategori temel verisi.
3. Cari hareket/bakiye motoru ve audit.
4. Dosya depolama, belge intake/parser ve tedarikçi faturası.
5. Kesilen fatura, cari/model bağlantısı.
6. KDV motoru.
7. Çek/kart/ödeme ve açık kalem kapama.
8. Mail/ekstre ve şablonlar.
9. Yönetim özeti ve raporlar; en son Excel/PDF ve mobil eşdeğerlik.
