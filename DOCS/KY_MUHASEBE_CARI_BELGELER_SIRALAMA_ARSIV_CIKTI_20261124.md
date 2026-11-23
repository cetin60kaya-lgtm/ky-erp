# KY ERP Muhasebe — Cari firma belgeleri, sıralama ve Arşiv & Çıktı (24.11.2026)

## Kullanıcı kabulü / önceki durum
- 23.11.2026 canlı ekranında TAHA mükerrer kaynak birleştirildi; 14 kart → 13 kart. Bu işlem kullanıcı tarafından başarılı bildirildi; bu geliştirme yeni birleştirme/silme tetiklemez.
- 13 firma, cari alacak ₺50.000, gelen fatura ₺846.119,98, giden fatura ₺1.535.170,20, muhasebeleşmemiş 49 fatura, eşleşmeyen 1 fatura; bunlar kullanıcı ekranındaki tarihli anlık değerlerdir, bugünkü canlı tutar varsayılmaz.
- Canonical e-Belge havuzunda 107 belge, 24 gelen fatura, 26 giden fatura, 57 gelen/giden irsaliye ve 0 POSTED vardı. Eski Arşiv & Çıktı `HISTORY` filtresi sadece POSTED gösterdiği için boştu.
- Firmalar & Cari altında cari hareketi 0 görünen firmalarda da fatura/irsaliye vardır; belgenin yüklenmesi finansal borç/alacak yazıldığı anlamına gelmez.

## Tek değişiklik kümesi
1. `accounting-company-documents.ts` ve tek yetkili/tenant-scoped `GET /api/muhasebe/firmalar/:id/belgeler`: firma ID eşleşen, ayrıca yalnız doğrulanmış **tekil** VKN/TCKN ile eşleşen fakat firma ID'si boş canonical belge ve irsaliyeleri salt-okunur sayfalı listeler. Başka firmaya açıkça bağlı belgeyi vergi numarasıyla çekmez. Silinmiş kayıtlar ve tenant dışı belgeler çıkmaz.
2. Firma ekranında genişletilen sol liste, A–Z/Z–A, cari bakiye artan/azalan, son cari işlem **veya** fatura tarihine göre artan/azalan. Sağ firma bölümünde gerçek cari hareketlerin yanında ikinci **Faturalar & İrsaliyeler** tablosu; her belge e-Belge Merkezi'nde ID ile açılır. Onaysız faturadan hareket oluşturulmaz.
3. Muhasebe Alış İrsaliyeleri, Alış Faturaları, Satış Faturaları ortak `DocumentSortHeader` ile tarih, belge no, firma, tutar ve durum alanlarında ascending/descending sıralar. Kullanılan API mevcut SQL kolon beyaz listesinden server-side sayfalamalı sıralama yapar.
4. e-Belge Arşiv & Çıktı artık `POSTED` sınırlı `HISTORY` değil: `ALL` veya gelen/giden fatura/irsaliye filtrelerini gösterir. Tarih/durum aralıkları ve mevcut sıralama kalır. Bu sayfadaki belgeleri seçip orijinal PDF'leri **sırayla ve KY ERP içindeki görüntüleyicide** açma/yazdırma akışı sağlanır. PDF olmayan belgede orijinal bulunamıyorsa kullanıcıyı uyarır; onaysız hayalî PDF yapılmaz.
5. Gelen faturalar için mevcut muhasebe çıktı işareti salt-okunur listede gösterilir, `Çıktı Alındı` yalnız kullanıcının ayrı onayıyla yazılır. Yazıcıdan gerçekten kağıt çıkmadan otomatik başarılı sayılmaz. **Tek birleşik PDF veya otomatik yazıcı spool işlemi** bu kapsamda yoktur; belgelerin orijinalleri korunur.

## Güvenlik ve kabul
- Production D1 update/delete, firma birleştirme, muhasebe `POSTED`, cari ödeme/tahsilat, KDV/LOT ve İşNet resmî gönderim yapılmadı. Migration gerekmiyor.
- Testler: firma kimlik/tenant/çakışan vergi eşleşmesi, tarih & tutar sıralama, mevcut API örnekleri. QA/merge/Worker/Pages canlı yayın kanıtları PR kaydında ve ortak kontrol kaynaklarında ayrıca tutulmalı.
- Yetkili canlı Chrome kabulü: Firmalar & Cari'de Can Yemek örneğiyle faturalar/irsaliyeler kart altında; cari 0 korunur; supplier/sales tablo sortları; Arşiv 0-posted durumda dahi 107 örnek havuzunda listeler, seçip orijinal PDF sıra/print, oturum korunur.
