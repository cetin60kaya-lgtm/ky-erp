# KY ERP — İşNet Dört Yönlü Tek Ekran Otomasyonu / Kabul
**Tarih:** 21.11.2026 · **Durum:** kodlanmış test dalı, production KABUL BEKLİYOR
**Kaynak:** `TOOLS/isnet-drive-archive/isnet-drive-yerel.mjs`, `TOOLS/isnet-drive-archive/sync-core.mjs`, `APP/cloud/ky-erp-api/src/e-belge-center-cloud.ts`, `APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeIsnetPortalSync.jsx`.

## Bir tek işlem
Kullanıcı **KY ERP Masaüstü 1.5.2 → İşNet / e-Belge** menüsünden açılan WPF içi 8791 panelinde, kurumsal hesabıyla giriş yapar, yetkili portal firmasını seçer ve **Dört Yönü Otomatik Senkronize Et** düğmesini bir kez kullanır. Ayrı Chrome indirme pencereleri günlük arşivleme adımı değildir. Yerel 8791 işlemi pencereyi kapatınca da Node sunucusu açıkken sürer. Aktif portal oturumu varken seçilebilir 15 dakikalık kontrol tekrarı vardır; şifre, cookie ve token dosyada tutulmaz.

## Dört yön / tek canonical belge
- Gelen e-Fatura / Giden e-Fatura / Gelen e-İrsaliye / Giden e-İrsaliye, orijinal XML + orijinal PDF birlikte.
- 31 gün bir sorgu dönemi sınırıdır, saklama süresi değildir. Büyük dönemler 31 günlük parçalara, portalda 200 kayıt sınırına dayanan kesitler daha küçük tarih pencerelerine bölünür. **Tek günde 200 sınırına erişilirse eksiksiz denmez; incelemeye ayrılır.**
- Belgelerin gerçek kimliği portal kaynak ID + yön/tür + XML ETTN/UUID + sağlayıcı referansıdır. Dosya adı otomatik ikinci belgenin tek kimliği değildir. Mevcut ve aynı SHA-256 orijinaller yalnız yeniden kullanılır; yalnız eksik olan tekrar istenir. İçerik farklıysa orijinalin üzerine yazılmaz, `NEEDS_REVIEW` olur.
- Aynı belgenin `orijinal.xml` / `orijinal.pdf` veya `BELGENO.xml` / `BELGENO.pdf` kayıtları tek D1 canonical belgeye bağlanır; PDF'yi ikinci resmî belge sanan OCR veya mükerrer cari/KDV hareketi yok.
- Senkron durumu `_DURUM/ISNET_OTOMATIK_SENKRON_DURUM.json` dosyasına sadece işlem sayıları, aralıklar ve güvenli hata kodlarıyla yazılır; dosya/kişisel kimlik/portal bilgisi içermez.

## Fatura ↔ İrsaliye otomatik ilişki
- Faturada `DespatchDocumentReference/ID` bulunuyorsa ilk ve güçlü kaynak odur. UBL XML'deki irsaliye referansı, karşı taraf VKN veya kesin eşlenmiş cari kimliği, belge yönü, ürün kodu/alias, birim ve miktar doğrulanır.
- Aynı firma ve yön içinde önce gelen fatura oluşturulduğunda irsaliye henüz yoksa taslak, `DISPATCH_REFERENCE_MISSING` / `DISPATCH_UNMATCHED` bekler. İrsaliye daha sonra geldiğinde `autoReconcileInvoicesAfterDispatch` **yalnız aynı tenant, yön, karşı taraf ve 90 günlük taslak fatura penceresinde** otomatik eşleştirmeyi yeniden yürütür.
- `MATCHED` ilişki yalnız mevcut motorun tam referans, firma ve miktar testi sonucudur. `PARTIAL`, `SUGGESTED`, `MISMATCH`, `NEEDS_REVIEW` belgeleri resmî mali/stok işlemini otomatik kesinleştirmez. Çoklu irsaliye, eksik LOT, kg/adet ambalaj farkı, yanlış VKN incelemeye ayrılır.
- İmalat yalnız kendisiyle model ilişkili irsaliyeyi rol yetkisiyle görür; tüm muhasebe faturaları diğer modüllere açılmaz.

## Gerçek teknik kabul zinciri
1. **X yerel test:** X'te Node `--check`, **7/7 `sync-core` + 1/1 gerçek render edilen giriş HTML güvenlik testi** ve `KY_ISNET_SELFTEST=1` güvenli QA arşiv testi geçti. `8792` QA sunucusu HTTP 200, güvenilir KY ERP frame origin CSP, CSRF ve kimlik olmadan `/sync-start` reddi doğrulandı. X'teki gerçek `8791`, kullanıcı izniyle 1.5.2 düzeltilmiş Node sürümüne geçirildi (PID 40808, HTTP 200). Giriş formu yanlışlıkla kullanıcı adı/şifreyi GET query'sine yollasa dahi fail-closed POST+inline `return false` ve 303 URL temizliği doğrulandı. Şifreler disk/GitHub'a alınmadı. Gerçek portal yeniden giriş ve 4 yön canlı tarama hâlâ kullanıcı kabulü bekliyor.
2. **Muhasebe eşleştirme:** Node TypeScript testinde gelen/giden eşleştirme, VKN/yön/ürün/birim/miktar çakışması ve geç gelen irsaliye kuralları 5/5 geçti. `npm run typecheck` ve frontend `npm run build` X'te çıkış 0. Kapsamlı test raporu ayrıca belirtilir.
3. **Google Drive gerçek durumu (düzeltildi):** İlk test faturası X yerelde ve Google Drive'ın gerçek provider `list_folder` yanıtında XML **154.415 bayt** + PDF **100.734 bayt** birlikte mevcut; ayrıca `belge-kayit.json` bulutta var. İlk `search` aracının XML MIME sonuçlarını göstermemesi yanlışlıkla eşitleme hatası sanılmıştı. Ayrı `_DURUM` QA XML ve TXT'nin her ikisi de provider klasöründe görüldü. **Dosya mevcudiyeti/boyutu PASS**, içerik SHA256 ve D1 içeri alma (`erpImported`) henüz kontrol edilmedi. Orijinal silme/yeniden adlandırma yasak.
4. **KY ERP File Hub/D1:** Seçilen ana firmada `GOOGLE_DRIVE/CLOUD_API` bağlantısı ve `E_BELGE/E_DOCUMENT` kayıpsız klasör ataması, gerçek File Hub indekslemesi, XML+PDF'nin tek D1 belge id'sine bağlanması, belge kalemleri, KDV, tedarikçi cari ve irsaliye ilişki kaydının iki cihazda görülmesi gerçek kayıtlar üzerinden **henüz doğrulanmadı**. D1/cari/stok finalizasyonu otomatik başlatılmayacak.
5. **Yayın:** PR derleme/test geçse bile Cloudflare Worker ve Pages sürüm SHA doğrulanmadan canlı değildir. Yeni 8791 onaylı kaynakla test edilirken kullanıcı açık portal oturumu/PDKS hizmeti düşürülmez. KY ERP Yönetim → indir/kurul kalıcı kurulum dağıtımı ayrı yetki, hash ve yayın kabulü gerektirir.

## Çoklu firma / erişim
Dört belge türünün klasörleri tek belirlenmiş fiziksel arşivde tür + firma + yıl/ay + kaynak belge ID altında tutulabilir. **Kök yolu her KY ERP firması için kullanıcı/yönetici bağlar; hiçbir Hakan Emp veya DESEN yolu ürün koduna sabitlenmez.** Masaüstü entegrasyon başlatıcısı 8791'i ancak mutlak ve mevcut `KY_ISNET_ARCHIVE_ROOT` yolu kullanıcı/sistem tarafından önceden onaylanmışsa açar; ikinci çalışan 8791 oluşturmaz. Bu sürümde firma başına çoklu File Hub fiziksel route yönetimi ayrı PR #632 kapsamındadır ve canlı tamamlandı sayılmaz.

## X Masaüstü 1.5.2 hotfix / 21.11.2026
- Gerçek kullanıcı WPF ekranında `İşNet / e-Belge` butonu UIAutomation ile tıklandı. Yerel otomasyon paneli **aynı KY ERP penceresinin ikinci WebView2 alanında** görünür; yeni Chrome penceresi açılmıyor. `KY ERP e-Belge / Entegrasyonlar` aynı WPF penceresinde geri geçiş sağlar.
- Windows portable EXE `D:\KYERP-TEST-20261121\isnet-1.5.2-secure-smoke\portable\KY ERP Masaüstü.exe`, sürüm `1.5.2`, SHA256 `5D2DB434829F099338F312A61CEFE85709669D70A3461D833B4C70E4C0050109`; dotnet test ve publish exit 0. X WPF PID 11716. 8791 Node PID 40808.
- Gerçek render HTML'nin JavaScript sözdizimi Node VM kontrolünden geçti; formun varsayılan GET ile URL'ye şifre koyması önlendi, `Referrer-Policy` ve 303 redirect doğrulandı. Kullanıcının **önceki Chrome geçmişindeki şifreli URL'leri** kod düzeltmesi otomatik silmez; ilgili URL geçmişini kullanıcı ayrıca temizlemeli ve gerçek parola ifşa olduysa değiştirmelidir.
- **Henüz canlıda yapılmadı:** İşNet portal hesabıyla yeni sürümde giriş, dört yön toplu gerçek dosya alma, Google Drive→File Hub/D1 tek canonical fatura/irsaliye iş kaydı ve model/cari bağlantısı, Cloudflare Pages/Worker deploy, imzalı/sahip onaylı Yönetim kurulum paketi. PDKS hizmeti ve mevcut belge orijinalleri değişmedi.


## 21.11.2026 — PDF uyuşmazlığında kalıcı sürüm koruması (X 8791 yerel kabulü)

**Gerçek neden:** Arşivde hem orijinal XML hem orijinal PDF SHA-256 ile doğrulansa bile `belge-kayit.json.errors` geçmişte `PDF:ARŞİVDE_FARKLI_ORİJİNAL_VAR_INCELEYIN` içeriyorsa `alreadyArchived` eskiden tam arşivi reddediyordu. Her yeniden taramada İşNet PDF tekrar indiriliyor, farklı üretilmiş PDF aynı belgeye ait olsa bile yeniden çatışma yaratıyordu; PDF fiziksel olarak mevcutken `pdfSaved=false` gösterilebiliyordu.

**Yeni kural:**
1. Mevcut XML ve PDF diskten okunur; manifest SHA-256 ile her ikisi de aynıysa **dosya çiftinin mevcut olduğu kabul edilir**, otomatik yeni indirme yapılmaz. Eski sürüm uyuşmazlığı ayrı `NEEDS_REVIEW` kalır; belgeye sahte `COMPLETE` verilmez.
2. Kullanıcı **PDF sürüm uyuşmazlıkları** ekranındaki `Portaldaki PDF'yi bir kez yeniden kontrol et` düğmesini kullanabilir. Resmî portal PDF'si mevcut orijinalle byte-byte aynıysa hata kararı otomatik kapanır; değilse farklı PDF `_INCELEME/PDF-ALTERNATIF-<sha16>.pdf` adıyla ayrı saklanır, orijinal değişmez.
3. Aynı alternatif hash yeniden gelirse ikinci kopya oluşmaz. Bir belgenin en fazla sekiz alternatif sürümü korunur; üst sınır kontrol uyarısıdır. Geçmiş sürüm farkında alternatif byte'lar önceki testte saklanmadıysa varmış gibi davranılmaz.
4. Kullanıcı gerekirse aynı sayfada orijinal ve alternatif PDF'yi salt okunur önizler; yalnız **Mevcut orijinali koru · İncelemeyi kapat** onaylı eylemi inceleme kararını manifestte `RESOLVED_KEEP_ORIGINAL` olarak kalıcılaştırır. Otomatik mali/stok kesin kaydı veya fiziksel XML/PDF silme yok.
5. File Hub `_INCELEME`, `_DURUM`, `_UYGULAMA` yol parçalarını resmî belge olarak içe almaktan ve otomatik DOCUMENT ilişkisi kurmaktan kaçınır. Test XML/TXT de mali belgeye dönüşmez.

**X Windows gerçek QA / yerel uygulama geçişi:**
- İzole Node QA `sync-core`, güvenli gerçek render HTML ve PDF uyuşmazlık/test kararı **9/9 PASS**. Yeni File Hub iç klasör filtresi sözleşme testi **1/1 PASS**. Canlı XML/PDF dosyası testte değiştirilmedi.
- X'teki eski `8791` işlemi yalnız durdurulmuş senkron halinde, PID **40808**, kapatıldı. Yeni korumalı Node kaynak SHA256 `FFC7047B2CA8DC5B07B0AC94EB1100267787DA4ED5BF5CB1D29FD936ABE9258A` ile PID **4024** olarak açıldı; HTTP 200, otomatik senkron `running=false`, yeni PDF inceleme paneli mevcut. Eski kod ayrı rollback klasöründe, masaüstü portable `Integrations/isnet-archive` kodu aynı sürüme eşitlendi.
- WPF 1.5.2 önceki PID **11716** normal kapatıldı, yeni PID **28588** açıldı. Windows UIAutomation ile `İşNet / e-Belge` tıklanıp aynı WPF penceresinde `PDF sürüm uyuşmazlıkları` ve `İnceleme kayıtlarını göster` alanları görüldü.
- **Hâlâ bekleyen gerçek kullanıcı kabulü:** Önceki portal giriş oturumu Node restart ile sıfırlandı. Firma yetkisiyle bir kez giriş sonrası 1 tarihli PDF kontrolü yapılacak; PDF aynıysa otomatik çözülecek, farklıysa kullanıcı iki PDF'yi karşılaştırıp açık karar verecek. Bu tarihî uyarı kullanıcı incelemesi olmadan resmen çözülmüş sayılmaz.
- Bu değişiklik **X'te çalışan yerel 8791 ve WPF test paketi** için doğrulandı. Cloudflare Worker/Pages, D1 Belge Havuzu gerçek bağlama ve resmî yönetim kurulum yayını için ayrı üretim kabulü gerekir. GitHub Actions tetiklenmedi, canlı PDKS/finans verisi değiştirilmedi.
