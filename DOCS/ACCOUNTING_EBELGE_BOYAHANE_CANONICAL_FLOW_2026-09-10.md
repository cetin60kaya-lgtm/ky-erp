# KY ERP — e-Belge / Muhasebe / Boyahane Canonical Akış

Tarih: 2026-09-10
Durum: Production mimari kararı

## Tek kaynak ilkesi

KY ERP'de tedarikçi irsaliyesi, tedarikçi faturası, Boyahane LOT'u, stok hareketi ve muhasebe kaydı ayrı modüllerde görüntülenebilir; ancak aynı fiziksel veya finansal olayı temsil eden ikinci bir paralel kayıt zinciri oluşturulamaz.

Canonical zincir:

`Belge -> Belge Satırı -> Ürün Kartı -> LOT Politikası -> Fatura/İrsaliye Uzlaştırması -> Fiziksel Mal Kabulü -> LOT -> Stok Hareketi -> Maliyet -> Muhasebe`

## Belge görevleri

- Tedarikçiden gelen **irsaliye**, fiziksel mal hareketinin ana kanıtıdır.
- Tedarikçiden gelen **fatura**, borç/cari, KDV, alış maliyeti ve finansal muhasebe kanıtıdır.
- İşNet, XML/PDF ve tarama yalnız belge kaynağıdır; hepsi aynı canonical e-Belge havuzuna girer.
- Bir fiziksel mal kabulü yalnız bir kez stok miktarı yaratır.
- Fatura, mevcut irsaliye stok kaydına maliyet bağlayabilir; ikinci stok girişi yapamaz.
- Fatura önce geldiyse fiziksel stok oluşturmak varsayılan olarak yasaktır. Yalnız açık `allowInvoicePhysicalReceipt` onayıyla geçici fiziksel kabul açılabilir; gerçek irsaliye daha sonra bu kaydı uzlaştırır, kopyalamaz.

## LOT politikası

LOT zorunluluğu firma bazlı değildir. Ürün kartının `lotPolicy` alanı tek otoritedir:

- `REQUIRED`: fiziksel stok serbest bırakılmadan LOT kanıtı tamamlanmalıdır.
- `OPTIONAL`: LOT varsa izlenir; yokluğu işlemi bloke etmez.
- `NONE`: hizmet, gider ve LOT tutulmayan ürün/satırlarda LOT istenmez.

Kimyasal tedarikçi profili ürün eşleştirme için yardımcı sinyal olabilir; tek başına satırı Boyahane veya LOT zorunlu yapamaz. Aynı faturada Boyahane ürünü, normal stok ve genel gider/hizmet satırı birlikte bulunabilir.

## Fatura / irsaliye LOT uzlaştırması

- Yalnız irsaliye LOT'u varsa: irsaliye LOT'u kullanılır.
- Yalnız fatura LOT'u varsa: fatura LOT'u kullanılır.
- İkisi aynıysa: doğrulanmış LOT.
- İkisi farklıysa: `CONFLICT`; zorunlu LOT ürününde finalizasyon bloke edilir.
- İkisi de yok ve politika `REQUIRED` ise: LOT bekleyen; finalizasyon bloke edilir.
- İkisi de yok ve politika `OPTIONAL/NONE` ise: politika kapsamında devam edilir.

Bir fatura satırı birden fazla fiziksel LOT'a dağıtılabilir. Örnek: 100 KG fatura = 60 KG LOT-A + 40 KG LOT-B. Gerekli LOT kapsaması yalnız LOT numarasının varlığıyla değil, tahsis edilen fiziksel miktarın tamamıyla doğrulanır.

## Stok kimliği ve idempotency

- Fiziksel giriş kimliği gerçek fiziksel belge/satır üzerinden üretilir.
- Aynı fiziksel belge satırı tekrar işlendiğinde miktar ikinci kez artmaz.
- LOT kimliği global `lotNo` değildir. Tenant + ürün + tedarikçi + normalize LOT birlikte değerlendirilir.
- Aynı LOT numarası farklı ürün veya tedarikçide bulunabilir.
- Geçici fatura kabulü gerçek irsaliye geldiğinde aynı fiziksel kayda dönüştürülür.

## Stok hareketleri

Yeni hareketlerin resmi yolu:

`POST /api/boyahane/workflow/lots/:id/movements-v2`

Resmi nedenler üretim, numune, fire, iade, giriş/çıkış, düzeltme giriş/çıkış ve correction giriş/çıkıştır. Negatif stok yasaktır. Düzeltme ve iptal geçmiş kaydı silmez; ters hareket oluşturur.

## Maliyet ve raporlama

- Satın alınan fakat tüketilmeyen malzeme dönem gideri değildir; kapanış stok varlığıdır.
- Üretimde/sarf/fire/numune vb. tüketilen miktar ilgili LOT maliyetiyle gider/maliyet olur.
- Aylık LOT raporu açılış, giriş, üretim sarfı, fire, numune, düzeltme, iade, diğer tüketim ve kapanışı ayrı gösterir.
- `materialExpenseRecognized` tüketilmiş malzeme maliyetidir.
- `inventoryAssetClosing` kalan stok değeridir.
- Genel gider/hizmet satırları LOT'a girmez ve ilgili muhasebe gider kategorisinde kalır.

## Retired yazma yolları

Aşağıdaki eski yazma yolları production gateway'de veri değiştiremez:

- `POST /api/muhasebe/belge-import/:id/approve`
- `POST /api/muhasebe/belge-import/:id/boyahane-transfer`
- `POST /api/muhasebe/belge-import/:id/boyahane-transfer-v2`
- `POST /api/boyahane/lots/:id/consume`
- `POST /api/boyahane/workflow/lots/:id/movements`

Yerine canonical finalizasyon ve V2 stok hareketleri kullanılır. Eski kayıt tabloları yalnız geriye dönük okuma/geçiş amacıyla bulunabilir; yeni fiziksel stok gerçeği üretemez.

## Güvenlik ve tenant

- Her belge/stok işlemi tenant bağlamında çalışır.
- Resmî e-Fatura/e-İrsaliye gönderimi hiçbir canonical stok/muhasebe finalizasyonu tarafından otomatik tetiklenmez; harici gönderim kullanıcı onayı gerektirir.
- Canlı request sırasında şema migrationı yapılmaz.

## Aktif kullanıcı ekranı

Muhasebe > Tedarikçi İrsaliye / Faturaları ekranı canonical belge havuzunu kullanır. LOT kontrolleri kimyasal tedarikçi bayrağından değil seçilen ürün kartından türetilir. İrsaliye LOT kanıtı ve çoklu LOT tahsisi satırda görünür. İrsaliye olmadan fiziksel kabul ancak kullanıcı açıkça işaretlediğinde istenir.
