# KYERP — Boyahane sıfırdan renk formülasyonu V0.4
28.11.2026 · deneysel geliştirme, production kabulü değil.

- Kayıtlı Renkler'de ayrı **Sıfırdan Renk Oluştur** alanı; mevcut renk hafızası korunur.
- Girilen HEX hedefi ve iki kullanıcı bütçesi (baz içindeki S20/S10 dengesi, toplam gerçek pigment yüzdesi) altında negatif olmayan pigment dağılımı optimize edilir. Arşiv reçetesi kopyalanmaz.
- Beyaz-pigment bağlantısı isteğe bağlıdır: kullanıcı beyaz oranını değiştirirse pigment/beyaz oranı korunur, pigmentler birbirine göre ölçeklenir. Sıfır beyaz bağlantısı tanımsızdır.
- Açılım ürünleri ayrı stok kimlikleriyle eşlenir; taşıyıcı S10 bütçesini aşarsa taslak aktarılmaz.
- 12 klasik pigment için deneysel başlangıç parametreleri; 5 operatör referansı, 7 arşiv tahmini. Diğer onaylı ürünler elle kalibre edilebilir. Floresan/silikon/fosfor/efektler otomatik modelde kapalı.
- Pantone için kesin kod eşleşmesi, yetkili JSON katalog aktarımı veya elle HEX; kayıtlı reçete olması gerekli değildir. Katalog ve kalibrasyon bu sürümde açık kullanıcı işlemiyle firma kimliğine bağlı tarayıcı ayarı olarak saklanır; ortak sunucu kalibrasyonu henüz yok. Ham üretim reçeteleri ve renk kataloğu GitHub'a eklenmedi.
- Kayıtlı renk kartı, yeni referans kimliği, mevcut A arşiv versiyonu ve model numunesiyle bağlantı korunur. Açık yeni kart teyidi gerekir. Taslak otomatik üretim onayı/sarf değildir. Numune ekranındaki taslak çekme yalnız işin doğrudan bağlı renk kimliği ve boya türü eşleştiğinde, onaylı stok ürünleri ile açılır. Mevcut fiziksel numune ve lot onayı yeni reçete versiyonunu oluşturur.
- Açık formülasyon kimliği oluşturulurken başka işin bağlamından HEX/referans alınmaz.

## Kanıt ve açık kabul
- Kaynak Excel'den 653 benzersiz uygun klasik reçete; 519 öğrenme / 134 farklı Pantone koduyla test. Yeni RGB-KM yaklaşımında dijital arşiv medyan ΔE76 5.17. Bu fiziksel renk ölçüm başarısı değildir. S10 optik nötr varsayılmıştır, gerçek kumaş/örtücülük/fikse ve özel pigment ölçümleri açık.
- Bağımsız motorun 6 sentetik regresyonu JS ortamında PASS: bütçeler, oran bağlantısı, arşivsiz hedef, açılım, geçersiz giriş, beyaz açma. Repo Node test dosyası eklendi. Tam frontend lint/test/build, Worker test/build, gerçek yetkili tarayıcı ve Cloudflare deploy henüz doğrulanmadı.
- Model/referans numunesinin gerçek uygulama kabulü, yeni kart API yanıtı, mevcut arşiv versiyon geçmişi ve tenant ayrımı test edilmelidir. D1 şema değişimi, canlı veri yazımı, canlı stok sarfı, merge ve yayın yapılmadı.
