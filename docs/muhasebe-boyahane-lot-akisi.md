# Muhasebe → Boyahane Lot ve Ürün Akışı

## Kapsam

Bu akış yalnız **boya ve kimyasal tedarikçileri** için çalışır. Diğer tedarikçi faturaları normal muhasebe akışında kalır ve boyahane lot/stok sürecine aktarılmaz.

## Temel alanlar

Boya/kimyasal tedarikçisi faturalarında ve ürün eşleştirmesinde aşağıdaki bilgiler korunur:

- Firma adı
- Tedarikçi rolü: `BOYA_KIMYASAL`
- Faturadaki ham ürün adı
- Sistem ürün adı
- Ürün aliası
- Tedarikçi ürün kodu
- Lot numarası
- Üretim tarihi
- Son kullanma tarihi
- Miktar
- Birim
- Birim fiyat
- KDV
- Toplam
- Depo / stok yeri
- Belge numarası
- Fatura tarihi
- Kaynak: İşNet / XML / PDF / manuel

## Alias kuralı

Alias eşleşmesi firma bazlıdır.

Aynı ham ürün adı farklı tedarikçilerde farklı sistem ürününe bağlanabilir. Bu nedenle alias anahtarı en az şu alanlardan oluşur:

- Firma kimliği
- Tedarikçi ürün adı veya kodu
- Sistem ürün kimliği

Örnek:

- Firma: URAS KİMYA
- Fatura adı: `MAVI PIGMENT 15 KG`
- Alias: `Mavi Pigment`
- Sistem ürünü: `Pigment Mavi`
- Lot: `L240801-17`

## Muhasebe işleyişi

Boya/kimyasal tedarikçi faturası işlendiğinde tek işlemle:

1. Firma eşleşir.
2. Ürün satırları firma bazlı alias ile eşleşir.
3. Lot numarası zorunlu kontrol edilir.
4. Eksik lot veya ürün eşleşmesi varsa belge doğrudan işlenmez; `Boyahane Bilgisi Bekliyor` durumuna alınır.
5. Cari hareket oluşur.
6. Gelen KDV kaydı oluşur.
7. Mal alımı / gider kaydı oluşur.
8. Lotlu stok girişi oluşur.
9. Boyahane ürün-lot listesine aktarılır.
10. Belge `İşlendi` durumuna geçer.

Aynı fatura veya aynı fatura satırı ikinci kez stok oluşturamaz.

## Boyahaneye aktarılacak bilgiler

Boyahane tarafına aşağıdaki veri gönderilir:

- Sistem ürün kimliği ve adı
- Firma kimliği ve firma adı
- Alias / faturadaki ürün adı
- Lot numarası
- Giriş miktarı
- Kullanılabilir miktar
- Birim
- Giriş tarihi
- Üretim tarihi
- Son kullanma tarihi
- Birim maliyet
- Toplam maliyet
- Fatura kimliği ve fatura numarası
- Depo
- Durum: kullanılabilir / karantina / bitti / iptal

## Stok kuralı

Stok lot bazında izlenir.

- Girişler lot bazında ayrı tutulur.
- Boyahane sarfı lot seçilerek yapılır.
- Kalan miktar lot bazında hesaplanır.
- Eksi stok yasaktır.
- Son kullanma tarihi yaklaşan lotlar uyarı verir.
- FIFO önerisi gösterilebilir; kullanıcı gerektiğinde başka lot seçebilir.
- İade veya iptal aynı belge ve lot bağlantısı üzerinden ters hareket oluşturur.

## Arayüz düzeni

### Gelen tedarikçi faturası listesi

Yalnız boya/kimyasal tedarikçilerinde ek sütunlar:

- Ürün eşleşmesi
- Lot durumu
- Boyahane aktarımı

### Fatura detay açılır ekranı

Her satırda:

- Ham ürün adı
- Sistem ürünü
- Firma bazlı alias
- Lot numarası
- Miktar ve birim
- Depo
- Son kullanma tarihi
- Eşleşme durumu

İşlemler:

- Alias oluştur / değiştir
- Lot ekle / düzelt
- Ürün eşleştir
- Boyahaneye aktar
- Karantinaya al

### Boyahane lot listesi

Liste sütunları:

- Ürün
- Firma
- Alias
- Lot
- Giriş
- Kullanılan
- Kalan
- Birim
- Son kullanma
- Depo
- Durum

Detay sağdan açılır panelde gösterilir; ana liste ve filtreler korunur.

## Güvenlik ve veri bütünlüğü

- Yalnız `BOYA_KIMYASAL` rolündeki tedarikçiler bu akışa girer.
- Firma rolü manuel veya kontrollü otomatik sınıflandırma ile belirlenir.
- Lot zorunlu ürünlerde lot olmadan stok girişi oluşmaz.
- Alias firma dışına taşmaz.
- Fatura satırı, stok hareketi ve boyahane lot kaydı birbirine kimliklerle bağlıdır.
- Silme yerine iptal / ters hareket uygulanır.
- DATA, STORAGE, D1/R2 dosyaları ve gerçek kullanıcı belgeleri migration dışında toplu değiştirilmez.
