# KY ERP — Tüm Firmalar İçin File Hub Klasör ve Masaüstü Sözleşmesi
Tarih: 21.11.2026 · Kanonik kaynak: `DOCS/KY_ERP_TUM_FIRMALAR_FILE_HUB_KLASOR_HARITASI_20261121.csv` (44 kayıt; Excel açabilir) · **PLAN / TEST**, production aktif değildir.

## Temel karar
Bu standardın sahibi tek bir örnek firma değildir. KYERP.NET'te kayıtlı **her ana firmanın** kendi File Hub bağlantısı (Google Drive / OneDrive / SharePoint / onaylı yerel klasör) ve birden çok mantıksal dosya yuvası vardır. Bir firmanın fiziksel klasör yolu, diğer firma için koda sabitlenmez. `slotCode` sabit ve geliştirilebilir kimliktir; klasör adı kullanıcı tarafından değişebilir, bağlantı provider folder ID/relative path ile korunur. CSV'deki `physicalFolder=YONETIM_SECER` sütunu zorunlu fiziksel düzen değil, yönetici seçimidir.

## Model merkezli tek dosya
- `DESEN/MODEL_IMAGE`: `MODEL_ADI.jpeg`/jpg/png/webp girince sadece o ana firmanın canonical **Model Kartı** oluşur; ikinci taramada mükerrer kart açılmaz. Müşteri kimliği adından tahmin edilmez.
- Model Kartının bölümler arası ortak, düşük maliyetli üç görsel bileşeni: **Model Görseli**, **Yerleşim PDF**, **PSD önizlemesi**. PSD dosyasının orijinali yalnız yetkili Desen kaynak arşivinde kalır; önizleme ayrı fiziksel kopya finansal belge gibi yüklenmez. DTF/RIP teknik kaynakları ayrı erişim sınıfındadır.
- Desen, İmalat, Numune, Boyahane ve gerektiğinde Muhasebe bu üç görünümü kendi rol yetkileri çerçevesinde *aynı file_asset/modelId* üzerinden görür. Her modüle orijinal PSD veya tüm faturalar açılmaz.
- Muhasebenin gelen/giden fatura/irsaliye XML+PDF, çek/banka/KDV dosyaları ayrı ve muhasebe izinli. Yalnız **modelle birebir ilişkilendirilmiş müşteri irsaliyesi**, İmalat'a kısıtlı olarak gösterilebilir; cari/çek/faturalar açılmaz.
- Dosya adı standardı: belge numarası + **bir boşluk** + *gerçekten biliniyorsa* model adı + uzantı (örn. `HKN2026000000995 MAMBI.pdf`). Orijinal XML/ETTN esas belge kimliğidir. İsim bilinmiyorsa tahmin edilmez. Mevcut orijinallerin isimleri izinsiz değiştirilmez.

## Yönetim (KYERP.NET → Bağlantılar ve Depolama → Klasör Haritası)
Her firma sahibi:
1. Bulut sağlayıcısını kendi hesabıyla OAuth üzerinden yetkilendirir veya yerel bilgisayarda açıkça onayladığı klasör kökünü tanımlar.
2. `Görseller buraya / PSD buraya / Yerleşimler buraya / DTF RIP buraya / Gelen Fatura buraya / Giden İrsaliye buraya / Çek Görselleri buraya` gibi CSV'deki *slotCode* kaydını gerçek provider klasörüne bağlar. Aynı fiziksel kaynakta birden fazla görünüm **kopyalamadan** kullanılabilir.
3. `Ekle / Var olanı bağla / Atamayı değiştir / Etiketi değiştir / İzinleri belirle / Tara / Senkronize et / Bağlantıyı kapat / Klasörü göster` eylemlerini bulur. Kaldırılan **bağlantıdır**, dosya silinmez. Fiziksel taşıma/yeniden adlandırma ayrı onay ve çakışma önizlemesi ister.
4. Değişiklikler firma + kullanıcı + zaman + önce/sonra kapsamıyla denetlenebilir günlükte tutulur. Personel özlük, sağlık, bordro, kasa, çek için ayrı ACL zorunludur; sadece klasörün bulunması erişim hakkı vermez.

## Kod farkı — bu CSV henüz çalışma zamanı konfigürasyonu değildir
- Mevcut D1 `file_hub_bindings` tablosunda `UNIQUE(main_company_slug,module_code,purpose_code)` vardır; aynı amaç için çoklu klasör ve yön bazlı dört e-Belge yuvası **henüz desteklenmez**.
- Uygulama için `file_hub_folder_slots` / `file_hub_folder_routes` gibi firma bazlı yeni veri sözleşmesi, mevcut binding'lerden kayıpsız geçiş, sağlayıcı ID'leri, ACL ve durum kayıtları, API `list/add/update/disable/test`, arayüz ve sözleşme testleri gereklidir. Bunun canlıda hazır olduğu iddia edilmez.
- Son e-Belge ve JPEG model otomasyon düzeltmesi GitHub **taslak PR #631**'dedir. Merge/Worker+Pages yayın SHA ve gerçek D1 kabulü yoktur. 31 gün İşNet'in **tek sorgu penceresi**, saklama süresi değil; 200 kayıt tavanında dönem parçalama 8791 yerel uygulaması için henüz otomatikleştirilmedi.
- Drive bulut okuma `CLOUD_API` ise bilgisayarın açık olmasına ihtiyaç duymaz. Yerel Agent sadece izinli klasör ve yerel Photoshop/RIP/İşNet gibi işlemler için ek çalışma katmanıdır; D1 iş otoritesi değişmez.

## X üzerinde 21.11.2026'da gerçek Windows ve Drive kontrolü
- X Remote Online, KY Hub 8840 RUNNING ve Google DriveFS açık. Canonical GitHub kaynak SHA `32d6be738a908d61d20dfdfdb1d8378a2d1bdf77`, bağımsız `D:\KYERP-TEST-20261121\repo` altında.
- X'te KY ERP Masaüstü `1.5.1+32d6be7` taşınabilir Release EXE: `D:\KYERP-TEST-20261121\portable\KY ERP Masaüstü.exe`; SHA-256 `E27CBA23CCD468836D20AFA280ACA5AE3EF46A938AF3D759D7772818CBD38BB6`. Aynı SHA'lı ayrı test dosyası `portable-verified` altında; canlı PDKS hizmetine kurulum yapılmadı. .NET test çıkışı 0; tam kullanıcı arayüzü ve hesap giriş kabulü ayrı.
- Entegrasyon paketi `Integrations` altındaki 10 dosya için iki test kopyası SHA256 bakımından eşleşiyor; Node 22 ve JS sözdizimi PASS. Yerel 8788 İşNet adaptörü loopback health=true, portal connected=false (normal: kullanıcı oturumu henüz yok). Ayrı 8791 Drive arşiv uygulaması da çalışıyor. Bu iki adaptör tek uygulama sayılmaz; kullanıcı girişinde hangi resmi kaynak kullanılacağı kesinleştirilmeden paralel toplu indirme yapılmaz.
- X yerel sayım: `görsel/2026` **433**, `yerleşim dosyaları` **745**, `modeller` **3.660 klasör**, `giden desenler` **4.876**, `HKN E-FATURA` **2.115**, `DDM E-İRSALİYE` **1.785** dosya. Bunlar tüm Drive'ın veya D1'in tam sayımı **değildir**.
- X'te `KY-ISNET-BELGELER/_DURUM/KY_X_FILEHUB_SYNC_CHECK_20261121.txt` oluşturuldu; Google Drive bulutunda aynı isim ve klasör kimliği doğrulandı (**yerel→bulut bir dosya testi PASS**).
- Önemli fark: `KY-ISNET-BELGELER/_UYGULAMA` X'te üç dosya (`KULLANIM.md`, `ISNET-BASLAT.cmd`, `isnet-drive-yerel.mjs`); Drive API arşivinde yalnız `KULLANIM.md` görünüyor. **Çalıştırıcı/kodun buluta tam eşitlendiği iddia edilmez.** Kurulum dağıtımı için Drive'a güvenilmemeli; imzalı, hash doğrulamalı yetkili Yönetim dağıtımı tasarlanmalıdır.
- X'te henüz `LOCALAPPDATA\KY ERP\Desktop\folder-grants.json` ve `KYERP_AGENT_KEY` mevcut değil. Yerel File Hub Agent canlı indeksleme **hazır değil**; kullanıcı klasör seçimi ve mevcut yetkili kurumsal bağlantı gereklidir.

## Kabul aşamaları — her birine gerçek kanıt
1. WPF masaüstünde yerel dosya/entegrasyon merkezinin görünümü ve PDKS'ye müdahale etmeden UI kabulü.
2. KYERP.NET firma yöneticisi OAuth Drive/OneDrive ve fiziksel klasör atamalarını doğrular; keyfi ikinci hesap/kurulum gerekmez.
3. 1 JPEG, model adıyla tek canonical Model Kartı → D1 ve iki cihazda aynı id; tekrar tarama mükerrer yok. PDF yerleşim ve PSD önizlemesi genel görünüme bağlanır; PSD orijinali yetkisiz erişilemez.
4. İşNet oturumunda (şifre ve çerez paylaşmadan) tek gerçek XML+PDF → doğru Drive firma/yıl/ay → `E_DOCUMENT` → D1 Belge Havuzu taslağı; modelle ilgili müşteri irsaliyesi yalnız izinli İmalat ekranına görünür.
5. Dört belge yönü, 31 günlük dilimler ve 200 kayıt kontrolü, çoklu cihaz/yenileme idempotence testleri.
6. İmza/versiyon/hash, ayrı PDKS bakım kabulü ve Cloudflare kurulum dağıtımı için rol tabanlı **Yönetim → Masaüstü Kurulum** ekranı; dosya R2/korumalı sürüm deposundan sunulur. **Henüz yayınlanmadı**.

## İşlem güvenliği
Bu kayıt yalnız sürüm ve veri modeli sözleşmesidir; hiçbir mevcut dosya taşınmadı veya silinmedi, D1 business kayıtları ve personel hizmeti değiştirilmedi, GitHub Actions kullanılmadı. `CSV=KODDA KAYITLI TASLAK` ile `CANLI YÖNETİMDE ÇALIŞIYOR` aynı şey değildir.
