# KY ERP DESINATOR / Desen Köprüsü

Bu yardımcı yalnız Windows/Drive tarafındaki gerçek desen dosyaları ile KY ERP'nin canlı Desen modülü arasında köprüdür. Canlı veritabanının yerine geçmez. Orijinal dosya DESINATOR altında korunur; R2'ye yalnız web için küçültülmüş WebP önizleme ve thumbnail gönderilir.

## Sabit klasör düzeni

Kök, `.env` içindeki `KYERP_DESEN_ROOT` değeridir.

- `DESINATOR\Gelen Desenler` — izlenen giriş.
- `DESINATOR\Modeller\<Model>\Kaynak\YYYY\AA` — başarıyla işlenen orijinal kaynak arşivi.
- `DESINATOR\Hata\YYYY-AA-GG` — geçersiz/görüntüye dönüştürülemeyen dosyalar ve hata sidecar'ı.
- `DESINATOR\İşlenemeyen\YYYY-AA-GG` — desteklenmeyen dosya tipleri.
- `DESINATOR\.kyerp` — yerel hash/state ve köprü durum dosyaları.

DTF için ayrı ana model arşivi oluşturulmaz. Model adı/folder adı `... DTF` ise aynı `Modeller` kökü içinde normal model olarak korunur.

## İş akışı

1. PNG/JPG/JPEG/WEBP dosyasının kopyalanmasının bitmesi beklenir.
2. SHA-256 hesaplanır. Aynı kaynak yeniden gelirse R2'de ikinci canlı görsel oluşturulmaz.
3. Dosya adından/alt klasörden model adı ve baskı bölgesi çıkarılır.
4. 1600 px WebP önizleme ve 420 px WebP thumbnail üretilir.
5. `/api/desen/bridge/ingest` çağrısına kaynak hash/tarih/yol bilgileriyle yüklenir.
6. API başarı verdikten sonra orijinal dosya `Modeller` arşivine taşınır. API/network hatasında kaynak `Gelen Desenler` içinde kalır; veri kaybı olmaz.
7. Kalıcı dosya hataları `Hata`, desteklenmeyen tipler `İşlenemeyen` alanına alınır.
8. Köprü yaklaşık dakikada bir heartbeat gönderir; ERP'de çevrimiçi/çevrimdışı durum görülebilir.

## Kurulum

Node.js 22+ gerekir.

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `KYERP_DESEN_ROOT` gerçek DESINATOR yolunu yazın.
3. DESEN oluşturma/güncelleme yetkili geçerli KY ERP tokenını `KYERP_API_TOKEN` alanına koyun. Token yalnız yerel `.env` içinde kalır ve GitHub'a eklenmez.
4. `KYERP_DESEN_KOPRUSU_BASLAT.cmd` çalıştırın. İlk açılışta yalnız bu klasörün `sharp` bağımlılığı kurulur.

## Güvenlik ve hata davranışı

- Token query string'e yazılmaz; `Authorization: Bearer` ile gönderilir.
- `401/403`, network ve 5xx hatalarında orijinal dosya taşınmaz; tekrar denemek için bekler.
- POST işlemi hızlı/otomatik çift retry yapmaz.
- Başarılı API cevabı alınmadan kaynak dosya `Gelen Desenler`den çıkarılmaz.
- `.env`, gerçek desenler ve `.kyerp` state dosyaları repo içeriği değildir.

> Not: Mevcut backend köprüsü kullanıcı oturumuyla doğrulanır. Kesintisiz 7/24 servis hesabı gerekiyorsa ayrıca uzun ömürlü makine kimliği tanımlanmalıdır; normal kullanıcı MFA/session politikasını gevşetmek doğru çözüm değildir.
