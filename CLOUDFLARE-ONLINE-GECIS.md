# KY ERP Cloudflare Tam Online Geçişi

## Hedef mimari

- Frontend: Cloudflare Pages / `app.kyerp.net`
- API: Cloudflare Worker / `api.kyerp.net`
- Veritabanı: Cloudflare D1 / `ky-erp-db`
- Dosyalar: Cloudflare R2 / `ky-erp-files`
- Erişim: Cloudflare Access + uygulama kullanıcı yetkileri
- Kod ve otomatik dağıtım: GitHub -> Cloudflare preview -> production

## Mevcut durum

- Worker projesi, `api.kyerp.net` özel alan adı, D1 ve R2 bindingleri hazırdır.
- Frontend production API adresi `https://api.kyerp.net` olarak tanımlıdır.
- Mevcut Worker ağırlıklı olarak okuma endpointleri içerir ve CORS yalnız GET/HEAD/OPTIONS yöntemlerine izin verir.
- Yerel NestJS backend içindeki yazma, belge, Muhasebe, İşNet, İK, Desen, Boyahane ve Üretim servisleri henüz tam olarak Worker/D1/R2 katmanına taşınmamıştır.

## Geçiş kuralı

- Yerel SQLite ve OneDrive, geçiş tamamlanana kadar silinmez veya ana kaynaktan çıkarılmaz.
- D1 ile yerel SQLite körlemesine üzerine yazılmaz. Önce tablo, kayıt sayısı, güncellik ve anahtar karşılaştırması yapılır.
- Canlı geçişte kısa süreli yazma dondurma, son fark aktarımı, doğrulama ve geri dönüş noktası uygulanır.
- Gerçek İşNet resmi gönderimi canlı portal doğrulaması ve kullanıcı onayı olmadan açılmaz.

## Uygulama sırası

1. Cloudflare altyapı denetimi
   - D1 tablo ve kayıt sayıları
   - R2 bucket ve dosya anahtarları
   - Worker custom domain ve CORS
   - Pages/Workers GitHub bağlantısı

2. Kimlik ve güvenlik
   - Cloudflare Access
   - Uygulama kullanıcı/rol kontrolü
   - Worker secrets
   - Audit log ve istek kimliği

3. Ortak yazma çekirdeği
   - Firma/cari
   - Model merkezi
   - Ayarlar ve alias
   - İdempotent create/update endpointleri
   - D1 transaction ve hata geri dönüşü

4. Finans
   - Tedarikçi faturaları
   - Cari hareketler
   - KDV
   - Çek/kart/ödeme
   - Dosya ekleri R2

5. Üretim zinciri
   - Desen
   - Boyahane
   - Üretim/İmalat
   - İşNet irsaliye-model bağlantısı
   - Muhasebe sonucu

6. Dosya sistemi
   - PDF/XML/JPG/WEBP ve çek/desen görselleri R2
   - Tarayıcıdan doğrudan güvenli yükleme
   - OneDrive yalnız dışa aktarma ve çevrimdışı yedek

7. İşNet otomasyonu
   - Resmi API öncelikli
   - Cloudflare Browser Run/Puppeteer portal geri dönüşü
   - Taslak/önizleme ve açık kullanıcı onayı

8. Canlı geçiş
   - Yerel DB salt-okunur
   - Son delta aktarımı
   - D1/R2 doğrulama raporu
   - `app.kyerp.net` canlı kullanım
   - Yerel sistem yalnız acil geri dönüş yedeği

## Güncelleme akışı

- Özellik dalı -> Pull Request
- Cloudflare preview URL
- Otomatik build/test
- Onaylı merge -> production deploy
- Hatalı sürümde önceki Cloudflare deploymenta geri dönüş

## Tamamlanma ölçütü

- Hiçbir kullanıcı PowerShell ile uygulama başlatmaz.
- Bilgisayar bağımsız olarak `https://app.kyerp.net` üzerinden çalışır.
- Bütün yazma işlemleri D1'e gider.
- Bütün kullanıcı dosyaları R2'de tutulur.
- GitHub'a push/merge sonrası otomatik preview ve production deploy oluşur.
- İşNet, Muhasebe, Desen, Boyahane, Üretim ve İK aynı tek canlı veri kaynağını kullanır.
