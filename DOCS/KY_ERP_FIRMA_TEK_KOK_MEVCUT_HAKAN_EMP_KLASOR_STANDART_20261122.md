# KY ERP — Mevcut Hakan Emp klasöründen türetilmiş tek firma arşivi sözleşmesi

**22.11.2026 GÜNCELLEME — BU V1 İPTAL EDİLMİŞTİR.** Kullanıcı kökte 12 dağınık klasörü koruma kararını değiştirdi. Güncel yürürlükteki klasör sözleşmesi: `DOCS/KY_ERP_FIRMA_ARSIV_MODUL_SADE_V2_20261122.md`. Aşağıdaki tablo yalnız tarihî analizdir; fiziksel klasörleri V1'e göre yeniden oluşturmayın veya eski düzene taşımayın.

**22.11.2026 | İş türü: korumalı tasarım + Windows geliştirme dalı | Production değildir.**

## Kullanıcı kararı
Yeni 00..99 numaralı klasörlere geçiş yapılmayacak. Her firmanın **tek kökü** olacak. O firma için cihazda sadece Google Drive / OneDrive ile eşitlenen yerel **firma ana klasörü** seçilecek. Windows yolunu GitHub/uygulama koduna, başka firmaya veya başka cihazın ayarına sabit yazma.

**Doğrulanan mevcut Hakan Emp bulut kaynağı**: Drive'daki `Hakan Emp` ana klasöründe 12 dizin ve `İMALAT BASKI MUHASEBE .xlsm` bulunuyor. Bu dosya ve dizinler korunur; hiçbir yeniden adlandırma, taşıma, içerik birleştirme veya silme yapılmaz.

## 1. Gerçek ana klasör isimleri (aynen korunur)

```text
FIRMA ANA KLASÖRÜ [kullanıcı bir kez seçer]
├── FIRMA YEDEKLERI/
├── KY-ISNET-BELGELER/
│   ├── _DURUM/                 [sistem durumu, belge kaynağı değil]
│   ├── _UYGULAMA/              [eski teknik dosyalar korunur, yeni kurulum buradan çalıştırılmaz]
│   ├── GELEN-FATURA/
│   ├── GIDEN-FATURA/
│   ├── GELEN-IRSALIYE/
│   └── GIDEN-IRSALIYE/
├── HKN E-FATURA/               [tarihî giden fatura PDF'leri]
├── DDM E-İRSALİYE/             [tarihî giden irsaliye PDF'leri]
├── DTF/
├── OTOMASYON/
│   ├── KY-CONTROL/             [yalnız eski firmanın mevcutsa korunur; yeni firmalarda zorunlu değil]
│   ├── DTF_IZLEME/
│   └── PSD_ONIZLEME/
├── gelen dosyalar/
├── modeller/                   [model adına göre klasörler]
├── yerleşim dosyaları/         [PDF yerleşimler]
├── görsel/                     [yıllara göre: 2017...2026 vb.]
├── giden desenler/             [PSD]
├── KESİMDEN GELEN İRSALİYE/
└── İMALAT BASKI MUHASEBE .xlsm [mevcut firmaya özel dosya; başka firmaya kopyalanmaz]
```

İşNet yön klasörlerinin altında güncel portalın doğruladığı yetkili **İşNet firma kimliği / belge** hiyerarşisi devam eder. Tek yön/tek dosya yaklaşımı yerine XML asıl ve PDF aynı belgenin bir kez kaydedilen ekidir. `_INCELEME` ve sistem dosyaları Muhasebe Havuzu'na belge olarak alınmaz.

## 2. Mevcut yapıyı bozmadan eksik modüllerin eklenmesi

D1 ve KY ERP'de zaten bulunan ama Hakan Emp kökünde henüz ayrı dizini olmayan iş alanları için **yalnız eksikse** şu ek dizinler oluşturulabilir:
`MUHASEBE/`, `İMALAT/`, `BOYAHANE/`, `İK/`, `PDKS/`, `RAPORLAR/`.

Bu ilave dizinlere HKN/DDM/İşNet PDF'leri tekrar kopyalanmayacak. Eski `FIRMA YEDEKLERI/ISNET E-BELGE` arşiv kaynağı değil, tarihî klasördür. İK/PDKS gibi hassas klasörler için File Hub erişimi ve bulut paylaşım izinleri **ayrıca** sınırlandırılacak; klasörün varlığı yetki doğurmaz.

`modeller/` model adları, `görsel/` yıl klasörleri, İşNet firma kimliği ve dosya türü alt seviyeleri **olay anında** oluşturulur. Tarihî yılların boş dizinlerini ve tüm firmaların model adlarını baştan kopyalamak yasaktır.

## 3. Çok firma / çok PC

- **D1:** iş kayıtlarının tek yetkili kaynağı, firma slug + yetkilendirme ile izole.
- **Drive/OneDrive/SharePoint:** her KY ERP firması için tek provider hesabı/bağlantı/kök klasör ID'si; cihazın yerel Windows yolu **bu ID değildir**.
- **PC-1, PC-2:** aynı bulut klasörünü yerel sync istemcisiyle görür; her PC aynı firmaya ait kendi yerel mutlak yolunu bir defa onaylar. Tek dosya için ikinci yükleme veya ayrı arşiv hedefi tasarlanmaz.
- **Çoklu yazıcı sınırı:** Yalnız aynı Drive klasörünü seçmek, iki bilgisayarda eşzamanlı XML/PDF indirme ve üzerine yazmanın güvenli olduğunu **garanti etmez**. Bir firma için aynı anda yalnız tek aktif İşNet arşiv yazıcısı kullanılmalı; birden çok PC'den yazma açılmadan önce sunucu doğrulamalı firma bazlı lease/çakışma ve idempotency testleri tamamlanmalıdır.
- **İndeks:** File Hub, sağlayıcı dosya ID / connection ID / tenant / göreli yol / hash üzerinden idempotent olur. Yerel Drive eşitlemesi = File Hub/D1 indeksi tamamlandı demek değildir.
- **İşNet:** 8791 yalnız aktif yetkili oturumla; farklı bilgisayarda bağımsız kimlikle sessiz yeniden giriş veya otomatik portal oturum çakışması yapılmaz. Portal oturumu kopmuşsa güvenli yeniden bağlanma kullanıcının işini kesmeyecek şekilde yönetilir.
- **Outlook:** File Hub'da doğrulanmış HKN + ilgili DDM PDF'ler tek taslakta, firma/alıcı onayıyla gider; posta gönderimi ve muhasebe kesin kaydı klasör kurulumunun yan etkisi değildir.
- **Offline:** her kullanıcının/firmanın önbelleği ayrılır; offline veri D1 otoritesinin yerini almaz.

## 4. Masaüstü arşiv kurulumunun kabul şartı

1. Yetkili KY ERP kullanıcısı **seçili firmayı** doğrular.
2. Windows klasör seçiciden mevcut firma kökünü seçer; diskin tümüne izin verilmez.
3. Önizleme eksik dizin sayısını gösterir; kullanıcı onayladıktan sonra sadece eksik dizinler oluşur.
4. Mevcut dosya, klasör ve Excel içerikleri aynen kalır; çakışan dosya/junction görülürse güvenli hata.
5. Aynı kök farklı firmanın yerel izniyle önceden bağlıysa durdurulur.
6. Yerel File Hub **READ_ONLY** izni kaydedilir. Arşive yazma, firma OAuth'u, D1 ve hassas modül yetkisi ayrıca doğrulanır.
7. Tekrar kuruluma basıldığında yeni klasör açılmaz; ikinci PC aynı bulut kökünü seçtiğinde yeni arşiv oluşmaz.

## 5. Açık canlı kabul

Bu klasör sözleşmesi ve UI geliştirme dalındadır. Çalışan 1.5.2 EXE'ye dağıtım yapılmadı. Windows xUnit testi, ilk gerçek kullanıcı kök seçimi, provider OAuth/firma-kök ID eşleşmesi, çok PC aynı dosyaya erişim, 101 İşNet belgelerinin D1 tek kayıt indekslenmesi, Outlook gerçek taslak ve Cloudflare Worker/Pages release kanıtı **ayrı** sağlanmalıdır.

**Yasaklar:** kaynak arşiv taşıma/silme, örnek firmaya sabit yol, dosya/dizinleri sırf isim benziyor diye aynı belge sayma, GitHub'a şifre/token koyma, root seçimini OAuth yetkisi sayma, canlı test olmadan PASS.
