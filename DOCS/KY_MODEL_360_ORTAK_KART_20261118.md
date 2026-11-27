# KY ERP — Model 360 Ortak Kart ve Departman İşlemleri

## 27.11.2026 — Kullanıcı kararı: e-Belge model/ürün seçimi canonical Model 360 ve önceki üretim/işlem kayıtlarıyla bağlı olacak; repetlerde tarih ve geçmiş birim fiyat görülecek, yeni fiyat farkı karşılaştırılacak. Mevcut gerçek D1 salt-okunur sütun kabulü: model 8/8, belge 13/13, kalem 11/11, model-kalem bağ 4/4; 724 aktif model, 29 pozitif fiyatlı doğrulanmış XML giden fatura kalemi (model bağı ayrı). Yeni ortak katalog kimlikleri isimle birleştirmez; seçili cari, tenant, belge tarihi ve XML doğrulamasıyla fiyat geçmişi; tek model-kalem bağ/explicit raw model ID; ürün yalnız MANUAL eşleşme, geçmiş kalem exact ID. Aynı cari ve model kodu repet adayı, ayrı kimlik, kullanıcı seçimi; otomatik fiyat değişikliği yok. Model 360 mevcut üretim/işlem geçmişi açılır. Gerçek repet/mesai alanı ayrıca doğrulanmalı; yeni endpoint canlı kullanıcı kabulü bekliyor. Resmî gönderim kapalı.
**Karar tarihi:** 18.11.2026 · **Modüller:** DESEN / İmalat / Boyahane / Muhasebe / e-Belge / Fatura Mail

## Kesinleşen çalışma mantığı
1. Tek canonical model kimliği (model_records) bütün bölümlerin çalışma kartıdır. Bölümler aynı kayda kendi yetkili verisini girer; yeni paralel model kartı açılmaz.
2. Tek ortak Model 360 penceresi gerçek model görseli, baskı bölgeleri, dosyalar, üretim, belgeler, boyahane, mail ve işlem geçmişini gösterir. Görsel eksikse uydurma görsel kullanılmaz; eksik işaretlenir ve yetkili DESEN kullanıcısı File Hub üzerinden tamamlar.
3. Bir HKN faturasında birçok model, bir DDM irsaliyesinde birçok model, bir modelde çok sayıda belge olabilir. Eşleştirme belge kalemi + canonical model ID + firma + adet üzerinden doğrulanır. Tekrarlı belgeler çoğaltılmaz; isim benzerliği kesin bağlantı değildir.
4. Gelen müşteri irsaliyesi, brüt üretim, hata/test, net sağlam, giden irsaliye, faturalanan miktar ayrı kaynak ve ayrı ölçüdür. Çoklu baskı bölgeleri fiziksel üretim adedi gibi tekrar toplanmaz.
5. Fatura Mail ayrı muhasebe alanıdır: Toplu seçimde her HKN için ayrı e-posta, alıcı listesi, PDF çifti, onay ve gönderim sonucu. Microsoft sağlayıcı kabulü teslim/okundu anlamına gelmez.
6. Haftalık müşteri Excel'inde listede bulunmak ödeme listesine alındı demektir; bankada tahsil edildi demek değildir.
7. Her departman yalnız kendi mevcut yetkisi ve sunucu denetimiyle kayıt yapar; yetkiler ortak modal gerekçesiyle genişletilmez.

## 18.11.2026 Model 360 — P1 kod kapsamı
- Paylaşılan tek model ID açma köprüsü ve global ortak modal host.
- DESEN, İmalat, Boyahane, Muhasebe, Fatura Mail'e ortak model düğmesi.
- Görselli özet, brüt/net üretim, hata/test, gerçek DESEN dosyaları, model-belge merkezi, ilgili HKN mail hazırlığı ve gönderim geçmişi.
- İmalat yetkisiyle modal içinde fiş girme; mevcut Production Center endpoint'i kullanılır, yeni bağımsız veri kaydı yok.
- Boyahane verisi yalnız kesin model ID ile gösterilir; isim benzerliğine dayanarak bağlanmaz.
- Çoklu DDM adayı varsa otomatik birini seçmez. Outlook gerçek gönderim yalnız kullanıcının açık onayıyla yapılır.

## Açık P2 kabul ve entegrasyon işleri
- Birden çok model içeren XML'in kalem–model–imalat miktar tahsisini bütün ilgili API'lerde doğrulama.
- Boyahane reçete ve gramaj iş formunu, DESEN kanal/renk ayrıntılı yazımını ve diğer üretim editörlerini ortak modal içine güvenle taşıma.
- Outlook'tan manuel gönderilmiş eski HKN/DDM maillerini gerçek belgeye kanıtlı bağlama.
- Rol, tenant, model görseli, çoklu irsaliye, farklı üretim bölgeleri ve gerçek işlemlerle uçtan uca kullanıcı kabulü.

P1 commit/test/PR/merge/deploy durumları ayrı izlenir. Kod kaydı gerçek kullanıcı kabulü anlamına gelmez.


## 18.11.2026 — P2 canonical HKN/DDM model-kalem denetimi (PR / test aşaması)
- Model 360, `GET /api/model-360/:modelId/document-lines` üzerinden canonical `accounting_documents + accounting_document_lines + accounting_document_model_links` kayıtlarını salt okunur inceler. Mevcut tenant/rol yetkisi ve modelin müşteri ID sınırı korunur.
- Sadece tek canonical modele **açıkça bağlanmış** ve firma ID'si doğrulanan ADET satırları hesaplanır. Satırın birden fazla modele bağlanması, sadece belge başlığı bağlanması, bilinmeyen birim/firma ya da eksik satır inceleme durumudur. 1.500 satır sınırına erişilirse eksik toplam kesin diye gösterilmez.
- Gelen müşteri irsaliyesi / giden DDM / giden HKN ayrı sayaçtır; model modalında önceki İmalat merkezinin legacy belge toplamıyla yan yana, **iki farklı kaynak** olarak görünür ve uyuşmazlık uyarısı verir. Bu kontrol hesaplaması kesin cari, KDV, stok, ücret veya mail hareketi yazmaz.
- `accounting_document_model_links` tablosu yoksa **XML satırının `raw_metadata.modelId/model_id/modelRecordId` alanında kayıtlı tam canonical ID** güvenli alternatif kaynak olarak değerlendirilir. Hiçbir kesin model-satır eşleşmesi yoksa `SOURCE_UNAVAILABLE` ve eksik veri gösterilir; model adı, belge başlığı veya tutardan adet tahmini yapılmaz.
- **Henüz otomatik ilişki kurmayan kısım:** XML satırındaki model kodlarının `accounting_document_model_links` tablosuna doğrulanmış ve kullanıcı onaylı yazılması ile HKN/DDM eşleştirici ve Üretim merkezi kaynaklarının ortaklaşması. Gerçek müşteri XML'i ve fiziki kullanıcı kabulü gerekir.
