# KY ERP — Firma Bazlı Tek File Hub İndeksi ve Windows Drive Seçim Standardı

**Tarih:** 22.11.2026. **Kapsam:** Tüm firmalar, Google Drive, OneDrive, SharePoint, çok bilgisayarlı KY ERP. Kaynak: PR #638 (merge `3851f3801588fe41dd98298e6e3436f8f96e176f`).

## Tek yetkili kaynak

- Her ana şirketin (`main_company_slug`) kendi onaylı bulut OAuth hesabı ve tek seçilmiş sağlayıcı ana klasörü vardır. Her bilgisayar yalnız oturumdaki firmanın File Hub **D1 indeksini** okur. Kullanıcının Windows yerel yolu diğer PC'lerle paylaşılmaz; bulutta esas kimlik sağlayıcı klasör/dosya ID'sidir.
- Aynı aktif firma + OAuth hesabı + sağlayıcı + uzak kök yeniden seçilirse var olan bağlantı ID'si ve D1 indeksi kullanılır; ikinci indeks kuyruğu oluşmaz.
- İlk tam indeks yalnız bulut Worker üzerinden çalışır; 5 dakikalık cron parça parça ilerler. Her sayfa firma bağlantısında D1 checkpoint/kuyruk/lease ile saklanır; oturum kapansa veya PC değişse bile kalan noktadan devam eder.
- Google klasör listesi **30 metadata kaydı/sayfa** döndürür. Yalnız isim, göreli yol, sağlayıcı ID, MIME, boyut, değiştirilme tarihi ve varsa checksum indekslenir; orijinal PSD/XML/PDF otomatik tarama sırasında indirilmez/kopyalanmaz.
- Firmanın açık `E_BELGE/E_DOCUMENT` klasör ataması önce indekslenir. Büyük geçmiş desen/model dizinleri muhasebe işlemlerinin önüne geçmez. Desen-model eşleştirmesi yalnız ilgili dosya tipi ve klasör atamaları için; esas File Hub indeksinden bağımsız iş mantığıdır.
- Tam ağaç ilk kez tamamlanınca **Google Drive Changes** veya **Microsoft Graph Delta** imleciyle yeni/değişen içerik merkezi taranır; diğer cihazlar aynı indeks ve ilerleme verisini kullanır. Geçersiz imleç (410), klasör taşıma/silme veya ağacın güvenilir biçimde çözülememesi hâlinde kontrollü uzlaştırma yapılabilir. Provider gerçekten yanıt vermiyorsa başarı ilan edilmez.
- Büyük tam taramanın manuel tekrarını açık kullanıcı onayı olmadan başlatma. Mevcut D1 dosya indeksini veya 22 bin civarı ilişki bekleyen kayıtları silerek hızlandırma yapılmaz.

## Windows genel klasör hatası

- Google Drive/OneDrive yerel klasörünün üstünde junction/reparse point olabilir. Windows `OpenFolderDialog` seçicisi `güvenilmeyen bir bağlama noktası` deyip klasöre giremeyebilir; bu Drive verisi kayboldu anlamına gelmez.
- **KY ERP Masaüstü 1.5.5**: seçicinin yanında, mevcut tam Windows firma ana klasörü yolunu yazıp `Yolu Doğrula ve Önizle` ile onaylama seçeneği. Bu yol kullanıcı/tenant bazlıdır; uygulama sabit X/DESEN yolu taşımaz.
- Klasör seçici ve metin kutusu **aynı** `LocalFolderService.ValidateRoot`, izin verilen mutlak yol, seçilen kökün kendisinin junction olmaması, firma izolasyonu, tek kök, onay önizlemesi ve izin kaydı kontrolünden geçer. Güvenlik baypası yoktur. Seçilen kökün üstündeki onaylı Drive bağlama noktası ile seçilen dizinin kendisi ayrıdır.
- Windows yerel grant, bulut File Hub OAuth ve muhasebe D1'de fatura kabulü **ayrı** yetki/işlemlerdir. Yerel bağlantı DESEN büyük PSD kaynakları ve İşNet muhasebecisi için isteğe bağlıdır. Sıradan web kullanıcısının yerel uygulama veya aynı dosyaların yeniden taranması gerekmez.
- Aktif İşNet 8791 oturumu ve PDKS servisi sürüm güncellemelerinde durdurulmaz. 1.5.5 kurulumunda UAC onayı kullanıcıya aittir; PDKS cihaz servisinin isteğe bağlı kutusu varsayılan kapalıdır.

## Test / canlı kabul ve sınırlar

- X izole WPF 1.5.5 derlemesi: **0 hata**, testteki eski nullability uyarısı ayrı. File Hub yeni kontrat testleri **15/15 PASS**, PR #638 tam Worker/Frontend CI PASS.
- Bulut Worker production: GitHub Actions `44978436011`, typecheck/test/build, D1 Time Travel ve read-only schema, deploy ve gerçek API health **SUCCESS**. Migration veya D1 export yok.
- Frontend production: GitHub Actions `44978538790`, lint/test/build, Pages deploy ve canlı asset kontrolü **SUCCESS**.
- **Açık gerçek kabul:** Windows 1.5.5 Setup paketinin SHA/kurulum teyidi; gerçek Windows kullanıcı onaylı Hakan Emp yerel kök grant; sağlayıcı delta ilk canlı çevrimi; bir gerçek İşNet XML/PDF çiftinin File Hub indeks ve Muhasebe Belge Havuzunda tek D1 iş belgesiyle bağlanması; ilgili model ve OneDrive/SharePoint hesaplarında genişletilmiş gerçek test. Kodun geçmesi bunları PASS yapmaz.
