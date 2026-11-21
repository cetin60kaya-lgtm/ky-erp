# İşNet → Drive → KY ERP / JPEG Model Kartı — 21.11.2026

## Amaç ve kaynak

- Uygulama çoklu ana firma için çalışır; firma sahibi File Hub üzerinde kendi bulut/yerel depolama bağlantısını ve kök alt klasörlerini tanımlar.
- İşNet 8791 son yerel uygulaması 31 günlük **tek aralık sorgu** ve 200 kayıtlık **bir belge türü liste sınırı** bildirir. Bu, saklama süresi değildir. Tarih aralıklarını bölerek daha eski belgeler sorgulanabilir. İstendiği gibi otomatik tarih aralığı bölme 8791'in gerçek yerel kaynak dosyası olmadan kodlandı sayılmaz.
- İşNet 8791 kaynakları GitHub'daki `TOOLS/isnet-portal-adapter/server.mjs` (8788) ile **aynı uygulama değildir**. İkinci paralel resmi portal otomasyonu açılmayacak. 1.5.1 masaüstü kurulumu PDKS servisini değiştirebilir; ayrıca Windows kabulü olmadan çalıştırılmayacak.

## Düzeltme dalındaki kod kapsamı

1. Dosya amaçları için canonical `E_BELGE/E_DOCUMENT`; daha önce `EBELGE/E_DOCUMENT` kaydedilmiş atamalar okunmaya devam eder. Firma/tenant ve okuma+senkronizasyon izinleri zorunludur.
2. File Hub Drive/CLOUD_API indeksindeki XML dosyaları PDF'lerden önce belge taslağına alınır. Aynı tenant, aynı depolama bağlantısı, aynı dizin ve aynı isim gövdesinde **tek XML ile eşleşen PDF**, OCR veya yeni muhasebe belgesi oluşturmadan mevcut kayda bağlanır. Çakışma varsa otomatik birleştirme yapılmaz.
3. Sadece firma tarafından atanmış `DESEN/MODEL_IMAGE` klasöründeki JPEG/JPG/PNG/WEBP'ler Model Kartı oluşturabilir. Model adı dosya adının uzantısız hâlidir; müşteri firma adı veya ID'si tahmin edilmez. İşlem `ensureCanonicalModel` ve File Hub MODEL ilişkisi üzerinden idempotent yürür.
4. Google Drive görsel taraması alt klasörleri/yılları da kapsar. Bir sayfalık küçük partiler, D1 `modelImageFastProgress.queue` imleci, bağlantı kilidi, hata sonrası aynı sayfadan tekrar ve başarının gerçek sayacı kullanılır. Kullanıcının her bilgisayarda ayrı tarama yapması gerekmez; D1 ortak sonuçtur. Dosyalar taşınmaz/silinmez.
5. Orijinal PSD, DTF/RIP ve model yerleşimleri yalnız ilgili File Hub amaçlarıyla bağlanır; PSD orijinali genel kullanıcılara gösterilmez. Muhasebe dosyalarına tüm modüllere genel erişim açılmaz.

## Güvenli kabul sırası (PASS = gerçek kanıt)

1. GitHub PR/ilgili sözleşme testleri, Worker TypeScript kontrolü, frontend lint/build; başarısız iş gizlenmez.
2. Cloudflare Pages+Worker **yayınlanan** commit SHA doğrulanır; merge tek başına canlı demek değildir.
3. İlgili firmada `GOOGLE_DRIVE / CLOUD_API`, `DESEN/MODEL_IMAGE` ve `E_BELGE/E_DOCUMENT` atamaları **salt okunur** teyit edilir. Üretim DB migration veya beklenmeyen dosya taşıma yok.
4. İlk tek JPEG: sadece atanan klasörden bir tane yeni Model Kartı; tekrar tarama ve iki cihaz yenilemesi sonrasında **tek** `model_records.id`, tek file asset / MODEL relation. Aynı adlı farklı firma müşteri kartı otomatik seçilmez.
5. İşNet 8791 gerçek Windows durum, firma seçimi ve **tek** son 31 günlük gerçek gelen e-Fatura XML/PDF; şifre, cookie, TCKN/VKN içerikleri GitHub'a/sohbete taşınmaz. İndirmeye izinli oturum gerekli; 8791'i yeni 8788 ile değiştirme.
6. Drive tarafında aynı dosya çifti, dosya sayısı/SHA-256 eşleştirme; File Hub'da E_DOCUMENT, D1 Belge Havuzu ve tek XML+PDF ilişki kaydı doğrulanır. PDF önce indekslenirse XML geldiğinde aynı belgeye bağlanır.
7. Belge Havuzu yenileme/tekrar login/ikinci yetkili cihaz ve XML kalemleri–cari–KDV–model eşleşmesi **taslak** olarak kontrol edilir. Kesin mali kayıt, resmî gönderim, stok/LOT, cari fiş için ayrıca açık kullanıcı onayı gerekir.
8. Dört yön tek tek kabul edilir; çoklu geçmiş taraması yalnız sayfa ve kayıt sayımı eksiksizse yapılır. 200 kayıt ve tarih kesit sınırı bir hatayı başarı gibi saklamamalı.

## Mevcut doğrulama sınırı

- Bu dalın varlığı = kod revizyonu. Canlıda eşitleme, Windows 8791 belge indirme, D1 gerçek belge ve model kartı oluşumu henüz ayrı doğrulanmalıdır.
- DESEN ve X Remote Commander son cihaz sorgusunda **Offline**. Yeni ZIP/token/kurulum istenmemiştir.
- Google Drive `KY-ISNET-BELGELER` arşivinde ilk gerçek XML/PDF kullanıcı kabulü henüz yoktur. 8791'in çalıştırılabilir kaynak dosyası bu GitHub deposunda bulunmamaktadır.
