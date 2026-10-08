# KY PDKS Unified — Kurumsal Ürün Standardı v1 (08.10.2026)

**KY PDKS** asıl üründür. Piyasadaki diğer zaman/İK/PDKS yazılımları rakiptir.
Bu kod, mevcut üretim PDKS'yi körlemesine değiştirmez; yeni **tek ürün**
mimarisini izole geliştirme dalında kurar. Birbiri üstüne yama menüler yoktur.

## 1. Tek ürün, dört istemci

| Katman | Kesin hedef | Bu daldaki gerçek durum |
|---|---|---|
| Web / KY ERP | `https://app.kyerp.net/pdks/workspace` | React menü AppV3 oturumlu PDKS modülüne bağlandı; deploy edilmedi |
| Kurumsal tanıtım | `https://kyerp.net` | Mevcut alan adı korunur; yeni PDKS için canlı site değişikliği yok |
| API | `https://api.kyerp.net` | Mevcut PDKS read API tüketimi; yeni olay protokolü kodlu, backend ACK servisi henüz bağlanmadı |
| Windows | .NET 8 WebView2, aynı React arayüzü | Host derlendi; DESEN yerel tasarım önizlemesinde açıldı |
| Android / iOS | Capacitor 8 ve aynı React bileşenleri | Paketleme tanımı oluşturuldu; APK/IPA imzası, Play Store/App Store ve gerçek cihaz testi açık |
| Yerel veri hizmeti | Windows Agent, Firebird/FDB, yıllık TNF | Eski canlı hizmetin görevleri korunacak; yeni köprünün uçtan uca kabulü açık |

**Ekran bir, hesap ve kurallar bir.** Görünüm React'te; doğrulanan iş
kararları sunucu/Windows Agent sözleşmesindedir. React kendi kendine
ücret, izin, giriş/çıkış kanıtı ya da tarih icat etmez.

## 2. Tek menü / bütün ürün kapsamı

Kaynak: `APP/app/ky-erp-frontend/src/pages/pdksUnified/productModel.js`.

9 ana bölüm, **49** alt sekme ve **9** Personel 360° detay sekmesi.
1) Genel Bakış: Bugün, Uyarılar, Onaylar.
2) Devam Kontrol: Canlı, Kart, İstisna, Geçmiş, Aktarımlar.
3) Personel: Liste, Kart, Özlük, Organizasyon, Evrak.
4) Vardiya & İzin: Plan, Takvim, İzin, Mesai, Tatil, Servis.
5) Puantaj: Günlük, Aylık, Düzeltme, Dönem Kontrol, Ay Kapatma.
6) Bordro & Ödeme: Hakediş, Maaş, Avans, Kesinti, Banka/Elden, Fiş.
7) Rapor & Denetim: Devam, İhlal, İmza, Puantaj, Bordro, İşlem Geçmişi.
8) Cihaz & Senkron: Terminal, Aktarım, TNF, Cloud, Mutabakat, Hata.
9) Yönetim: Firma, Kullanıcı, Yetki, Kural, Yedek, Entegrasyon, Günlük.

Sekme kimlikleri merkezi modelden okunur. Eski menü girişleri kullanıcıya
tekrar gösterilmez. Historik ERP URL'leri tek `workspace` rotasına
yönlenir; uygulama içinde yeniden ayrı menü kurmaz.

## 3. Kaynak önceliği ve kanıt

- Fiziksel cihazdan alınan RAW ayrı, değişmez kanıttır.
- Normal onaylı kart ve personel devam kaydı Firebird/FDB + **yıllık**
  `TR2026.Tnf` / `TR2027.Tnf` ile mutabakatlıdır.
- `KartNo,HH:mm,GGAAYY,1,001` import biçimi korunur.
- E giriş/çıkış ayrı kaynak statüsüdür; normal yıllık TNF'ye
  otomatik fiziksel kayıt gibi eklenmez.
- Aynı gün iki vardiya ve gece değişimi tarih-saat kanıtıyla değerlendirilir.
- Yalnız web/D1'in yazması, Firebird/TNF'nin işlendiği anlamına gelmez.
- Normalizasyon yaparak yapay saat üretmek yasaktır.

**Tek işlem hattı:** kanıt al → doğrula → rol/tenant/ay kilidini denetle →
değişikliği ve gerekçeyi göster → onay → Firebird transaction →
TNF hizala → audit/backup → Cloud ACK → mutabakat. Çökme/kopma
sonrası ayrı kurtarma kuyruğu ve idempotency uygulanır.

Saf olay sözleşmesi `sync/eventProtocol.mjs` ve testlerindedir;
bu sözleşme gerçek backend'e henüz geçirilmediğinden Cloud senkronu
“tam bağlandı” diye raporlanmaz.

## 4. Çok markalı kart okuyucu mimarisi

Fiziksel cihazlar **tarayıcı veya mobil uygulamaya doğrudan
bağlanmaz**. Windows Agent ve yetkili bağlantı profili üzerinden geçer.

- Var olan KY PDKS cihazı: mevcut SDK ile gerçek regresyon şartı.
- ZKTeco: model/firmware için Standalone SDK veya izinli API.
- Suprema: BioStar 2 API / Device SDK / G-SDK, ilgili sürüm/lisansla.
- Anviz: CrossChex uyumlu model ve varsa API/SDK; her model Cloud desteklemez.
- Hikvision: ilgili cihazın desteklediği ISAPI/SDK.
- Diğerleri: onaylı TCP/IP, HTTPS API, yetkili dışa aktarım dosyası,
  seri port veya üretici SDK'sıyla **yeni sürüm adaptörü**.

Mevcut sürücülerin telifli SDK/DLL dosyaları GitHub'a gelişi güzel
kopyalanmaz. Adaptör onay manifesti, sürüm, model/firmware testi,
zaman dilimi, kart eşlemesi, imzalı olay kaynağı, tekrar ve kesinti
testinden geçmeden `certified` kabul edilmez.

`device-gateway/device-contract.mjs` bugün ham olay
normalizasyonu, onaylı sağlayıcı listesi, çakışma reddi ve silme
yasağını test eder; bu **bütün cihaz sürücülerinin yazıldığı** anlamına
gelmez.

Üretici kaynakları:
- ZKTeco SDK: https://github.com/ZKTeco/Standalone-SDK
- Suprema BioStar API: https://support.supremainc.com/en/support/solutions/articles/24000047041-
- Anviz model şartı: https://help.anviz.com/hc/en-us/articles/25316275777561-Connect-Device

## 5. Cloudflare altyapısı

- kyerp.net: dış kurumsal giriş / ürün ve destek.
- app.kyerp.net: oturumlu uygulama / mobil Web Native tasarım.
- api.kyerp.net: Workers üzerinde rol ve tenant korumalı servisler.
- D1: oturum/rapor/okuma görünümü ve olay sunum metadata'sı.
- Queues/Workflows (gerektiğinde): bağlantı koptuğunda yeniden deneme
  ve idempotent olay hattı; tekrar deneme başarılı uygulama sayılmaz.
- Durable Objects (gerektiğinde): tenant/dönem bazlı seri mutabakat
  ve çakışmayı kilitleme; maliyet ve kota kabulü öncesi canlıya alınmaz.
- R2: KVKK saklama politikasıyla izinli denetim/arşiv kanıtı
  (ücretli hizmet açmak için ayrıca karar gerekir).

**Cloudflare ücretsiz kullanım sınırları ve güncel kota kontrolü
olmadan** yeni binding, ücretli Queue/DO/R2, production deploy veya
schema migration yapma.

## 6. Kurumsal güvenlik, KVKK ve yetki

- Kuruluş, firma, departman, personel ve hassas bordro işlem yetkileri
  ayrıdır; personel kart numarası SGK statüsüyle aynı kavram değildir.
- Rol/ekran gizleme bir UI kolaylığıdır; her endpoint işlem yetkisini
  sunucuda ayrıca doğrular.
- TLS, imzalı cihaz ajanı, token süreleri, CSRF/CORS, hız limiti,
  servis hesabı anahtarı döndürme, RBAC ve denetim gerekli.
- Fiziksel ham kart kanıtı dışında biyometrik parmak izi/şablon,
  yüz/görüntü ve GPS alanlarını açık hukuki değerlendirme,
  veri minimizasyonu ve yetki olmadan toplama.
- Şirketin onayı olmadan kişisel veriler mobil cihazda uzun süreli
  cache'e alınmaz. Offline düzeltmeler “onay bekliyor” durumundadır.
- Bordro/elden/banka yalnız yetkili personelde görünür.
- Tüm değişiklikler yapan kullanıcı, önceki/sonraki değer, kaynak,
  gerekçe, zaman ve onay ile loglanır; silme audit'i korunur.

## 7. Sürümlenebilir ve özelleştirilebilir ürün

- Ürün semver sürümü, API v1 sözleşmesi, adaptör manifest sürümü,
  veritabanı migrasyon versiyonu ayrı yönetilir.
- Firma bazlı tema, modül açma, iş kuralı, dil, vardiya, departman,
  rol ve saklama süresi konfigürasyondan gelir. Yeni müşteri için
  kaynak kodu çatallamak veya menüyü kopyalamak yoktur.
- Modüller yeni kaynağa geçerken eski veri okunur, doğrulanır, sonra
  kontrollü taşıma yapılır. Birden fazla aktif yazma motoru bırakılmaz.
- Sağlıklı güncelleme: staging→test→şema yedeği→onay→yayın→izleme→rollback.

## 8. Test ve üretim kabul durumu

**Bu daldaki doğrulananlar:** 49 sekme model testi; Chrome gerçek
49 sekme tıklaması; responsive tasarım; WebView2 Windows derlemesi
ve yerel pencere açılışı; cihaz adaptörü sözleşme testleri; frontend
lint ve üretim derlemesi.

**Henüz eksik:** üretici model bazlı SDK bağlantıları, canlı
Firebird/TNF/D1 event consumer + Cloud ACK, gerçek bordro ve puantaj
ortak motoru, sahada en az iki terminalle hata enjeksiyon testi,
yayın imzası, Android APK, iOS IPA, platform mağaza onayı,
yetki/kapsam penetrasyon testi ve canlı üretim geçişi.

Bu açık maddeler tamamlanmadan ürün “tam kurumsal canlı sürüm” diye
etiketlenmez.

## 9. Yerel gerçek önizleme

DESEN çalışma alanı izole: `D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web`.
Vite `127.0.0.1:5186/pdks-studio` **yalnız DEV modunda,
yalnız 127.0.0.1/localhost'ta**, canlı API çağrısı yapmadan çalışır.

Windows inceleme exe:
`D:\KYERP\_TEMP\KY-PDKS-UNIFIED-WEBVIEW2\KY.PDKS.Unified.exe --dev-preview`

Canlı backend veya production çalışma alanları bu test için
değiştirilmemiştir.

## 10. DESEN yerel çalışma ve final gate (08.10.2026)

Son izole kaynak: `feature/ky-pdks-unified-product-shell-20261008`.
Bu dal staging/proje kaynak dalıdır; `main`, production Pages/Workers,
canlı PDKS EXE, personel FDB/TNF ve terminal RAW değiştirilmemiştir.

**Son test kanıtı (DESEN):**
- `node --test src/pages/pdksUnified/productModel.test.js`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Chrome gerçek navigasyon: **9/9 ana bölüm, 49/49 alt sekme**, koyu tema,
  readonly moda bağlı kalma ve yatay taşma: PASS.
- `APP/pdks-unified/device-gateway` ve `sync` toplam **10 sözleşme testi**: PASS.
- Windows `dotnet build -warnaserror` ve `dotnet publish`: PASS.
- DESEN Windows WebView2 son pencere: çalışıyor, yanıt veriyor.
- Yerel script engeli kalıcı Windows ayarı değiştirilmeden kısayol
  üzerinden giderildi; **tek tıklama testi**: `WINDOWS_APP_RUNNING=1`,
  `LOCAL_STUDIO_HTTP=200`.

**Masaüstü kısayolu:** `KY PDKS UNIFIED - KURUMSAL ONIZLEME`.
Bu kısayol `Start-KyPdks-Unified-Preview.ps1` ile yalnız
`127.0.0.1:5186` tasarım servisinin ayakta olup olmadığını kontrol eder,
sonra WebView2 penceresini açar. PowerShell ilkesini sistem çapında
kapatmaz/değiştirmez.

**İşlev durumu:** Tek kurumsal görünüm ve test edilen ekran yönlendirmeleri
çalışır. Yetkili personel API'si yalnız okuma yolunda entegredir.
Terminal sürücülerinin tümü, canlı senkron consumer/ACK, bordro işlemleri,
Android/iOS native build, production deploy ve gerçek uçtan uca kabul hâlâ AÇIK.
Bu maddeler geçmeden uygulama bitmiş veya her markaya uyumlu ilan edilmeyecektir.


## 11. Tek veri katmanı / 49 ekran bağımsız kaynak denetimi

Kullanıcının **"yama değil tek düzen"** talebi nedeniyle yeni KY PDKS Unified
ekranlarına eski WinForms form yığını veya `PdksPageV2` bileşeni konulmadı.
Arayüzün tek kaynağı `PdksUnifiedApp.jsx`, menünün tek kaynağı
`productModel.js`, ekran/veri eşlemesinin tek kaynağı
`tabBindings.js`, ağ okuma oturumunun tek kaynağı
`useUnifiedPdksData.js` ve API köprüsü `readService.js`'dir.

**Gerçek API cevapları denetlendi:**

- `/pdks-people`: kart/SGK kapsamındaki personel; tarihsel ay için işe giriş
  ve işten ayrılış dönemi ayrı değerlendirilir. Kaynaksız ad/kart oluşturulmaz.
- `/people/:id/attendance-v2`: seçili kişinin gerçek D1 aylık günleri ve
  sunucunun çalışma özeti. Bu API şirket genelinde anlık terminal okuması
  **değildir**; yanlışlıkla terminal canlı görüntüsü olarak sunulmaz.
- `/pdks-masters`: `groups`, `services`, `personnelGroups` ve ilişkiler;
  vardiya planının tek tek personel/gün atamasıyla aynı şey değildir.
- `/operations/leaves`: `plans` ve `dayCount` alanları, yıllık izin kuralları.
- `/operations/holidays`: resmî tatil dizisi.
- `/operations/month`: yalnız **`adjustments` ve `close`**! Bunu aylık
  puantaj diye yanlış göstermiyoruz.
- `/operations/payroll`: **`lines`** (salary, overtimeAmount,
  advanceAmount, deductionAmount, bankAmount, cashAmount, totalAmount);
  **brüt ve yemek**, API'de açıkça gelmiyorsa asla uydurulmaz.
- `/operations/audit-logs`: eylem, kullanıcı, ekran ve zaman.
- `/people/:id/corrections`: seçili personele ait düzeltme geçmişi.

**Aylık puantajın tek işlevsel okumayolu:** `readCompleteMonth` her personeli
belirli eşzamanlılık sınırıyla `attendance-v2` üzerinden sorgular ve
yalnız gerçek `summary` sonucunu kullanır. Kullanıcı açıkça "Aylık
puantajı hazırla" dediğinde sorgu başlar; bütün personel cevapları
alınmadan rapor tamamlandı denilmez. Eksik cevapta sıfır yazılmaz,
kısmi ay raporu sunulmaz. Cloud kotasını korur.

**Uygulanan menü davranışı:** arama, dönem, seçim, yenileme, gerçek
kaynağa bağlı tablo, güvenli CSV, Personel 360°, dönem/geçmiş durumu,
yetki daraltma, yükleniyor/hata/kaynak-biçimi ayırımı.
Tek bir kaynak değişimi eski firma veya ay verisini yeni ekrana
karıştıramaz. Denetim hesabı `requireFull` isteyen Cloud endpointlerine
doğrudan istemci isteği göndermez; sunucuda ayrıca yetki denetimi şarttır.

**Önemli tamamlanma sınırı:** 49 alt ekranın tamamı navigasyon olarak
mevcuttur; gerçek okuma kaynağı bulunan ekranlar doğrulanan uçlara
bağlanır. Yetkili Windows Agent veya API'si olmayan ekranlar
"Entegrasyon bekliyor" durumundadır. Bu bir düzeltme değil,
yanlış veriyle çalışma riskine karşı işlevin bilinçli olarak
**kapalı** tutulmasıdır. Henüz **49/49 aktif işlev** denemez.
Veri yazma ancak gerçek tek işlem motoru, ay kilidi, kayıt onayı,
idempotency, FDB/TNF mutabakatı ve rollback testleri ardından açılır.


## 12. Personel 360° ve kurumsal bütünleşik test kabulü

**Ana menü ve gerçek çalışma alanı tek kod:** `PdksUnifiedApp.jsx`.
Eski `PdksPageV2` yeniden açılmaz. `PersonDetails` verileri
`useUnifiedPdksData` içinden, yalnız ilgili kişi/sekme açıkken gelir.

- Özlük/kart: gerçek kayıt, dönem bazlı işe giriş/çıkış.
- Devam: seçili kişinin `attendance-v2` günleri.
- Vardiya: `pdks-masters.groups/groupAssignments` içindeki gerçek atama.
- İzin: `operations/leaves.plans` listesinden aynı personel ID'si.
- Puantaj: seçili kişinin sunucunun `summary` alanı.
- Bordro: yalnız FULL yetkili, `operations/payroll.lines` ve aynı personel ID'si.
- İşlem geçmişi: `people/:id/corrections` (yalnız gerçek alanlar).
- Evrak: ayrı yetkili belge bağlantısı henüz yok; veri açılmaz.

**Güvenli backend ilkesi:** `GET /pdks-masters` artık asla
`CREATE TABLE` / `INSERT DEFAULT` çalıştırmaz. Gerekli tabloların
varlığını kontrol edip hazırlık eksikse 503 + `PDKS_SCHEMA_NOT_READY` verir;
tablolar yalnız açık yönetim/migrasyon aşamasında hazırlanabilir.

**Mobil CORS:** Cloudflare API kaynak dalında tam köken izinleri:
`https://app.kyerp.net`, `capacitor://localhost`, `https://localhost`.
Wildcard yok; yetki/oturum denetimi aynen sunucuda kalır.

**Son DESEN test kapısı** (`KY-PDKS-PERSONEL360-CANONICAL-GATE.txt`):
`FETCH=0`, `CHECKOUT=0`, `PDKS_UNIT=0`,
`PDKS_LINT=0`, `PDKS_BUILD=0`, `PDKS_BROWSER_49=0`,
`CLOUD_TEST=0`, `CLOUD_TYPECHECK=0`,
`DEVICE_SYNC=0`, `WINDOWS=0`.
Sıfır çıkış kodu ilgili kontrolün geçtiğini gösterir. Test için
üretim veritabanına, terminale ve Canlı Cloudflare'ye yazılmadı.

**Açık işlemler:** fiziksel cihaz markalarının model bazlı sürücüleri,
Windows Agent ile canlı güvenilir olay alışverişi, FDB + normal yıllık TNF
gerçek mutabakatı ve onaylı yazma, ücret/izin işlemlerinin güvenli apply
sözleşmesi, Cloud olay ACK/recovery, Android APK/iOS IPA,
production dağıtımı ve gerçek personel kaynağı kabulü.
Bu adımlar tamamlanmadan tam canlı ürün kabulü yapılmaz.


## 13. Yönetim işlemlerinin tek merkezi (Cloud yönetim alanı)

Yeni kodun **tek işlem kataloğu**:
`APP/app/ky-erp-frontend/src/pages/pdksUnified/operationCatalog.js`.
Tüm modüllerde **aynı** `UnifiedOperationPanel.jsx` arayüzü ve
`operationTransport.js` taşıması kullanılır; dağınık ayrı kaydet
butonları ve görünmeyen otomatik kayıtlar bulunmaz.

Desteklenen 11 Cloud D1 işlemi:
1. Çalışma vardiyası tanımlama.
2. Personel grubu tanımlama ve kart zorunluluğu kuralı.
3. Personele çalışma vardiyası atama.
4. Personele çalışma grubu atama.
5. Servis hattı tanımlama.
6. Personele servis hattı atama.
7. Resmî tatil tanımı ve yarım gün çalışma kararı.
8. İzin onayı/kaydı.
9. Avans kaydı.
10. Mesai kaydı: hafta içi/hafta sonu/tatil, %50/%100 açık oran,
    onaylı saat ve tutar; oran mevcut şemada notta korunur.
11. Kesinti kaydı.

Her işlemde: firma, ilgili personel ve varsa aktif grup/servis
bağlantısı doğrulanır; gerekçe, tarih ve tutar/saat koşulları
zorunludur; dondurulmuş JSON önizlemesi verilir, kullanıcı
`ONAYLIYORUM` yazar, **tek** POST yapılır ve önbelleksiz GET ile
işlem sonucunun **aynı kayıt ID'sine** sahip olduğu doğrulanır.
Mükerrer çalışma vardiyası/grup/servis kodu eski tanımı sessizce
güncelleyemez. Bağlantı koptuğunda otomatik tekrar yoktur.
Tarayıcı içinde aynı isteği yeniden gönderme engellenir.

**D1 dışında asla otomatik mutabakat iddiası yok:**
FDB, resmî yıllık TNF, fiziksel terminal RAW yalnız mevcut ayrı
Windows hizmeti/yetkili denetim tarafından yönetilir. Uzak API'nin
sunucu seviyesinde kalıcı idempotency, atomik denetim günlüğü,
Firebird/TNF outbox/ACK ve geri alma motoru **henüz bağlı değildir**.
Bu sebeple yüksek riskli işlemlerde kaydetme sonucu kesin değilse
yeniden deneme yerine manuel kanıt kontrolü gerekir.

**Test modunda** (`/pdks-studio`) bütün 11 işlem formunun
alan/yerleşim testleri yapılır; hiçbir POST butonu etkinleşmez,
sahte personel veya gerçek kart saati üretilmez. Bunun gerçek
Cloud üzerinde yetkili kullanıcıyla yazma/readback kabul testi
olmadığı açıkça gösterilir.

**Canlıya geçiş:** Backend idempotency, API işlem yetkisi, audit,
lokal kayıt mutabakatı ve sahada onay testleri geçmeden
bu branch production'a dağıtılmaz.
