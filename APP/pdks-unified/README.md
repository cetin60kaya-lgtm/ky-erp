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


## 14. Attendance-v2 iş kuralı incelemesi — önemli üretim engeli

`APP/cloud/ky-erp-api/src/ik-personnel-control.ts` içindeki mevcut
`attendanceMonth` fonksiyonunun gerçekten çalıştığı görüldü; fakat
bu hesap, her iş gününde `08:30/19:00` sabit referans saatlerini
ve ilk/son kart okutmasını kullanıyor. Sunucunun bu sürümü, iki vardiya,
gece yarısını aşan mesai, yarım gün tatil, E giriş/çıkışın ayrı kaynak
statüsü ve personel çalışma grubu kuralını tam işlemez.
D1 özetini **resmî vardiya/puantaj veya fiziksel kart kanıtı**
olarak kabul etmek yanlıştır.

Unified `readCompleteMonth` bu nedenle bütün personel hesap
cevaplarını tek tek toplasa bile yalnız **D1 ön taslağı** üretir;
`approvedForPayroll=false`, `localReconciled=false` alanlarını
korur. Gerçek ortak hesap motoru ve FDB/TNF karşılaştırma testleri
bitmeden aylık rapora son puantaj statüsü verilmez.

Canlıya kabul için normal/E kaynak ayrımı, gündüz/gece vardiyası,
çift vardiya, saat aşımı, gerçek tatil yarım gün kararı, kişi bazlı
giriş/çıkış tarihleri ve bağımsız kaynak mutabakatı testleri zorunlu.


## 15. Yeni PDKS kanıt/puantaj çekirdeği (canlıdan izole)

`APP/pdks-unified/core/attendanceRules.mjs` tek ve saf
kanıt-evaluasyon çekirdeğidir. Sunucudaki eski
`attendance-v2` sabit ilk/son okuma hesabı üretim
bordrosu için yeterli olmadığından bu çekirdek ayrı yazıldı.

Aşağıdaki iş kurallarını açıkça ele alır:
- Gerçek fiziksel terminal RAW ile idari/onaylı E **ayrı** kaynak.
- Eksik giriş/çıkışta beklenen saati kesinlikle üretme.
- Belirsiz yönlü (iki ham zaman) basımı otomatik onaylama.
- Gerçek vardiya başlangıç/bitişi ile geç/erken toleransları.
- Aynı gün iki vardiya: iki ayrı atama ve olay kaynağı.
- Gece yarısını geçen vardiya: gerçek tam tarih/saatli süre.
- İstihdam başlangıcı/bitişi ve onaylı izin.
- Cumartesi/pazarın varsayılan dinlenme olması.
- Tam gün resmî tatil; açık çalışma onayı olmadan çalışma kaydı üretmeme.
- Yarım gün tatilde işletmenin **çalışma kararı + kapanış saati** zorunluluğu.
- Kart zorunlu olmayan personelin geçişsiz görünümü.
- Tekrarlanan ham kanıt ID'si, iki vardiya çakışması, 24 saati
  aşan vardiya veya belirsiz kaynak için fail-closed davranış.

**Güvenlik sınırı:** `localReconciled=false`,
`approvedForPayroll=false` her zaman korunur. Bu pure
çekirdek, tek başına Firebird/TNF/Cloud bağlantısı
veya resmî puantaj değildir. Her işyeri/saat dilimi politikası
doğrulanmadan sistem otomatik çalışma süresi kredisi üretmez.
İlk kabul politikası `Europe/Istanbul`; farklı ülke/DST için
ayrı test gerekir.

`node --test APP/pdks-unified/core/attendanceRules.test.mjs`
ile 17 gerçek kaynaklı senaryo test edilir. Fiziksel cihaz
bağlantısı, yetkili grup planı, gerçek personel verisi ve
yıllık TNF mutabakatını sağlayan entegrasyon **açık iş**.


## 16. 08.10.2026 — KALICI TEK D1 İŞLEM MOTORU / DEVRİN EN YENİ DURUMU

Bu bölüm önceki 11 ayrı Cloud POST planının yerini almıştır; proje
artık yeni arayüzde **bir** merkezi işlem endpoint'i kullanır.
Eski web modüllerinin legacy POST'ları kodda hâlâ vardır; bütün
sistemde tek yazma motoru olduğu **henüz iddia edilmez**.

**Yeni kaynaklar:**
- `APP/cloud/ky-erp-api/src/ik-pdks-unified-commands.ts`: tenant/rol/ay kilidi,
  kayıt/izin/mesai/avans güvenlik kontrolleri, SHA-256, aynı UUID'ye
  yeniden dönen sunucu fişi, `DB.batch` atomik kayıt, zorunlu audit,
  outbox `PENDING`.
- `APP/cloud/ky-erp-api/src/ik-pdks-unified-contract.mjs`: 11 komut için
  tek saf sunucu normalleştirme ve doğrulama şeması.
- `APP/cloud/ky-erp-api/migrations/0060_pdks_unified_command_ledger.sql`:
  firma+aktör+request ID unique; receipts ve outbox, FK ve indeksler.
- `APP/cloud/ky-erp-api/src/ik-pdks-unified-{contract,storage}.test.mjs`:
  11 işlem validasyonu, gerçek in-memory SQLite transaction/rollback,
  unique tekrar, farklı tenant, foreign-key outbox testleri.
- `APP/app/ky-erp-frontend/src/pages/pdksUnified/operationTransport.js`:
  tek POST `/ik/personnel-control/unified/commands`, UUID ve ardından
  `GET /.../:requestId` fiş sorgusu. Sonuç belirsizse ikinci
  yeni UUID ile otomatik POST yapılmaz.
- `UnifiedOperationPanel.jsx`: D1 kalıcı fişi, görünüm
  doğrulandı/kaynak bekleniyor/sonuç belirsiz hallerini ayrı gösterir.
- `main.ts`: yeni handler tek kez eklenmiştir. Eski PDKS operasyonları
  `ik-pdks-guard.ts` içinde zaten kaydedildiği için `main.ts`
  üzerindeki yanlış duplicate kayıtlar bu turda kaldırılmıştır.

**Yetkili GET/POST komutları:**
`POST /api/ik/personnel-control/unified/commands`:
`{requestId,action,payload}`, action 11 sabit türden biridir.
`GET /api/ik/personnel-control/unified/commands/:requestId`
yalnız o tenant/aktör fişini okur. Her başarılı D1 `batch`:
`ik_pdks_unified_commands` + gerçek D1 iş tablosu +
`ik_audit_logs` + `ik_pdks_unified_outbox` yazar.
Aynı UUID + farklı payload `409 PDKS_IDEMPOTENCY_CONFLICT`.
Her fiş `localFDB=false` ve `annualTNF=false` taşır.

**Son DESEN izole kapı:**
`D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\KY-PDKS-DURABLE-COMMANDS-FINAL-GATE.txt`.
Çıktı `FETCH=0 CHECKOUT=0 SQLITE_CONTRACT=0 CLOUD_ROUTES=0
CLOUD_TYPECHECK=0 UI_UNIT=0 UI_LINT=0 UI_BUILD=0 CHROME_49_11=0
DEVICE_CORE_SYNC=0 WINDOWS_BUILD=0 COMPLETE`. Tamamı yerel test;
**Cloud canlı staging/production yazma kanıtı değil**.

**BÜYÜK KALAN ÜRETİM ENGELLERİ:**
1. Migration `0060` production D1'e **uygulanmadı**. Önce yedekli
   staging migration + authenticated POST/GET fiş + 11 işlemin
   rollback/race/tenant/locked-month testleri yapılmalı.
2. Sunucudaki eski legacy POST endpointleri de yeni engine
   korumasına geçmeden tüm ERP için idempotency tamam sayılamaz.
3. Outbox `PENDING` oluşuyor; Windows Agent tüketicisi,
   FDB/normal TNF/E ayrımı, crash journal ve iki yönlü ACK **yok**.
4. Yeni `attendanceRules.mjs` 17 teste sahip; canlı cihaz/DB olayına
   henüz bağlı değil. Eski Cloud `attendance-v2` sabit
   08:30/19:00 günlük ilk-son iş kuralı resmî çift/gece
   vardiya/yarım gün/E hesaplarında yetersizdir.
5. Gerçek Windows EXE+Firebird+cihaz/terminal stress,
   Android APK, iOS IPA, Cloud prod dağıtım onayı **yok**.
6. `ik-pdks-unified-commands.ts` üzerindeki `// @ts-nocheck`
   kaldırıldı; gerçek sözleşme için `.d.mts` bildirimi eklendi ve Cloud
   `tsc --noEmit` kapısı geçti. Buna rağmen gerçek D1 staging Worker
   entegrasyon/race/rollback kabulü hâlâ tamamlanmalıdır.

**Yeni sohbette:** Tek seferde proje devir MD'si
`KY_PDKS_TEK_KAYNAK_TAM_DEVIR_VE_CALISMA_PLANI_2026-10-08.md`
kullanılarak kaynak+uygulama+test ilerletilir. GitHub PR
<https://github.com/cetin60kaya-lgtm/ky-erp/pull/404>
**DRAFT/UNMERGED** tutulur. GitHub Actions ve Remote Desktop kotasını
koru. **Üretim verisi üzerinde test hareketi, bordro veya yıllık
TNF düzenlemesi YAPMA**. Belge güncelliği için bu §16
en yeni kaynak olarak alınır; eski devir tarihsel.


## 17. 08.10.2026 — WINDOWS AGENT / FIREBIRD / TNF / CLOUD ACK FAZ-1

Bu fazda Cloud outbox artık yalnız `PENDING` kayıt bırakmakla kalmaz; Windows
Agent için **kiralama + imzalı teslim + kanıtlı ACK** protokolüne sahiptir.
Production/local yazma yine kapalıdır.

**Cloud:**
- `ik-pdks-unified-agent.ts`: cihaz anahtarıyla
  `GET /api/auth/pdks-unified/outbox/next` ve
  `POST /api/auth/pdks-unified/outbox/:id/ack`.
- Teslimat `HMAC-SHA256` ile imzalanır; `deliveryHash`, 5 dakikalık lease,
  tekrar deneme sayısı ve teslim sahibi tutulur.
- Outbox durumları `PENDING -> CLAIMED -> ACKED/FAILED`; geçici yerel hata
  `RETRY` ile tekrar `PENDING` olur. Aynı command için ikinci business
  kayıt oluşturulmaz.
- ACK, `journalId`, `appliedAt`, kaynak/FDB doğrulaması ve TNF'ye
  dokunulduysa TNF mutabakatı olmadan kabul edilmez.
- Unified komut outbox'ı normalize `commandData` ve kartlı personelde
  `localCardNo` taşır; receipt GET artık `localSync` durumunu da döndürür.

**Windows:**
- `UnifiedSyncAgent.cs`: imzalı teslimatı doğrular, atomik yerel journal
  yazar ve yalnız doğrulanmış tenant/komut zarfını işler.
- `FirebirdTnfReadOnlyVerifier.cs`: `KIMLIK/GIRCIK` şemasını, kart eşlemesini
  ve tarih varsa yıllık `TRYYYY.Tnf` ile dakika bazlı normal kayıt
  mutabakatını **salt okunur** yapar.
- `GTUR=E` / `CTUR=E` yıllık TNF beklentisine alınmaz.
- `--agent-once` tek tur ajan modu eklendi.
- **Güvenlik kapısı:** `KY_PDKS_UNIFIED_APPLY_ENABLED=1` verilse dahi gerçek
  action handler henüz yoksa ajan `LOCAL_ACTION_HANDLER_NOT_IMPLEMENTED`
  ile RETRY döner. Legacy Firebird anahtar eşlemesi doğrulanmadan SQL tahmin
  edilmez ve canlı FDB/TNF yazılmaz.

**İzole DESEN kapısı (20:54 TRT):**
`PDKS_UNIFIED_SYNC_VERIFY_20261008.log`:
- CLOUD_CONTRACT_STORAGE: 13/13 PASS
- CLOUD_ROUTES: 8/8 PASS
- CLOUD_TYPECHECK: PASS (**unified command engine artık ts-nocheck kullanmıyor**)
- DEVICE_CORE_SYNC: 27/27 PASS
- WINDOWS_BUILD: PASS, 0 warning / 0 error
- STATIC_SAFE_GATE=PASS
- LIVE_DATA_WRITE=NONE

Bu kanıt source/build sözleşmesini doğrular; gerçek D1 staging migration,
yetkili staging komutu, gerçek Windows cihaz credential'ı ve yerel
Firebird **write** kabulü değildir. Bir sonraki faz, legacy Firebird
anahtar/tablo eşlemelerini kopya FDB üzerinde doğrulayıp her action için
frozen local plan + transaction + TNF atomic replace + journal recovery
uygulamaktır.


## 18. 08.10.2026 — WINDOWS AGENT / CLOUD OUTBOX / KOPYA-FDB FAZ-2

**En güncel faz = bu bölüm; §16 ve §17 tarihsel durum kaydıdır.**
Tam kanıt, risk ve sonraki basamak:
[`docs/PHASE2_WINDOWS_AGENT_FIREBIRD_CLOUD_ACCEPTANCE_20261008.md`](docs/PHASE2_WINDOWS_AGENT_FIREBIRD_CLOUD_ACCEPTANCE_20261008.md).

- Cloud cihaz kasası `ik_pdks_devices`, HMAC-SHA256 imzalı teslimat,
  canlı lease/hash bağı ve kanıtlı ACK dahil edildi. Tekrar/yarış/tenant
  davranışları Hono gerçek endpointi + in-memory SQLite üzerinde sınandı.
- Windows Agent: `--agent-once`, `--agent-loop`, 5 dakikalık
  varsayılan polling, tek örnek kilidi, health JSON, SHA256'e bağlı journal,
  crash sonrası aynı uygulama fişini tekrar ACK mekanizması.
- `personnel-group` ve `holiday` için atomik, idempotent yerel **politika
  aynası** eklendi. Varsayılan apply bayrağı kapalı; FDB/TNF/RAW mutasyonu
  YOK. Bu politikalar doğrudan canlı bordroyu değiştirmez.
- 9 diğer idari action için gerçek Firebird yazma/anahtar semantiği ayrıca
  doğrulanmadan hiçbir otomatik apply izni yok.
- `TRYYYY.Tnf` atomik yenileme: önceki dosya SHA256 bekleme, yedek,
  aynı dosyada kilit, tekrar hash kontrolü, çatışma halinde fail-closed.
- 16 Firebird tablo, 8 trigger salt okunur okundu.
  **AVTUR**: 1=AVANS, 2=BANKA, 3=İLAÇ KESİNTİSİ;
  genel kesinti için kod tahmini kesinlikle YOK.
- Firebird `gbak` üzerinden oluşturulan gerçek **ayrı kopya FDB** üzerinde
  GRUP/SERVIS/KIMLIK/OZELIZIN/AVANS rollback smoke **PASS**,
  canlı veritabanı değişmedi.
- **V9 DESEN KY-CONTROL:** 56/56 otomatik test, Cloud TypeScript,
  Windows Release (0 hata/uyarı), 5 yerel selftest,
  kopya Firebird transaction rollback dahil `RESULT=PASS`,
  `LIVE_DATA_WRITE=NONE`.
- PR **DRAFT/UNMERGED**; canlı Cloudflare D1 migration, gerçek staging
  Cloud↔Windows kabulü, Firebird 9 action prod-safe apply,
  fiziksel terminal/SDK, bordro/puantaj, Android/iOS release henüz YOK.

**Kalan sıra:** Gerçek staging D1 → idempotent local SQL ledger/action
handler → FDB/TNF normal/E transaction recovery → cihaz SDK/terminal →
puantaj/bordro → 49 sekme gerçek ekran → Android/iOS signing → final release.


## 19. 08.10.2026 — GERÇEK WINDOWS ↔ LOCAL CLOUD E2E KABULÜ

**En güncel kaynak bu bölümdür.** §18 kaynak/test altyapısının tarihsel kabulüdür.

- Yeni `src/ik-pdks-unified-agent.e2e.test.mjs`: Hono HTTP test Cloud
  sunucusunu `127.0.0.1` üzerinde açar; gerçek Windows
  `KY.PDKS.Unified.dll --agent-once` sürecini başlatır; Firebird
  **gbak ile restore edilmiş izole kopya** üzerinde `KIMLIK/GIRCIK`
  kaynak doğrulaması yapar; tek firma+cihaz HMAC imzalı komutunu okur.
- `personnel-group` ve `holiday` yerel politika mirror örnekleri
  dosyaya yazılır; Cloud outbox ACK `ACKED` ve boş kuyruk sınanır.
- Üçüncü örnek ACK HTTP **503 kesintisi** simüle eder; ajan çıkışı
  başarısız olur ancak local receipt journal'a kalıcı yazılmıştır.
  Cloud lease sonlandırılıp aynı işlem yeniden alındığında **policy
  dosyasının SHA256 ve değişiklik zamanı sabit kalarak**, aynı journal
  fişinden Cloud ACK başarıyla tekrarlanır.
- **V10 DESEN KY-CONTROL raporu:** 
  `D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL\OUTBOX\PDKS_AGENT_E2E_V10.log`.
  `RESULT=PASS`, Windows derleme 0 hata/uyarı, gerçek Windows
  + yerel HTTP Cloud + SQLite D1 taklidi + kopya Firebird E2E testi
  **1/1 PASS**; `LIVE_FDB_WRITE=NONE`, `ANNUAL_TNF_WRITE=NONE`.
- Hızlı yeniden test npm komutları:
  `npm run test:pdks-unified:cloud`;
  `npm run test:pdks-unified:e2e` (yalnız Windows + E2E staging
  `KY_PDKS_UNIFIED_DLL` ve `KY_PDKS_STAGE_FDB_PATH` ile).
- **V10 sonrası güvenlik sıkılaştırması**: `ACKED` artık
  `localReceiptHmac` bağımsız HMAC imzası olmadan reddedilir;
  Agent receipt SHA-256'sı teslimat hash'ine bağlanır. Bu değişiklik
  V11 kabul testinin ardından üretim onayı için ayrıca değerlendirilir.
- **Gerçek Cloudflare staging D1 testi hâlâ yapılmadı**; local Hono
  + SQLite D1 taklidini staging Cloudflare veya üretim D1 olarak
  sunmayın. Agent otomatik başlatma, prod merge/migration/yazma kapalı.

Sonraki üretim engelleri: gerçek Cloudflare D1 staging/tenant oturum
kabulü; 9 Firebird action için provably-idempotent local SQL ledger +
transaction recovery; terminal RAW/E/TNF ve puantaj hesaplama; UI
49 sekme saha kabulü; Android/iOS signing. PR #404 **DRAFT**.


## 20. 08.10.2026 — ACK HMAC UYUMLULUK DÜZELTMESİ VE TOPLU AGENT TESTİ

**§19 üstüne ek güncel izole kabul; üretime dağıtım izni değildir.**

- Windows `--agent-safety-selftest`: plan, kalıcı journal, iki yerel politika
  aynası, yıllık TNF atomik dosya kontratı ve tek örnek Agent loop
  **5/5 PASS**. Tümü geçici dizinlerde çalışır; üretim FDB/TNF/RAW yazmaz.
- Windows Release `KyPdks.UnifiedHost.csproj`: **0 hata / 0 uyarı**.
- Cloud `npm run test:pdks-unified:cloud`: **30/30 PASS** (13 depolama
  ve sözleşme + 17 endpoint/origin/güvenlik testleri).
- Cloud `npm run typecheck`: **PASS**.
- Gerçek `dotnet` Agent + local Hono Cloud + izole Firebird kopyası
  uçtan uca testi, ilk çalışmada
  `PDKS_LOCAL_RECEIPT_HMAC_INVALID` verdi. Nedeni .NET
  `System.Text.Json` varsayılan JSON kaçışının ISO tarihindeki `+`
  karakterini `\\u002B` biçimine çevirmesi ve JS
  `JSON.stringify` ile HMAC baytlarının ayrışmasıydı.
- `UnifiedSyncAgent.cs` imza alanı için `UnsafeRelaxedJsonEscaping`
  kullanıldı; diğer JSON alanları/Cloud protokolü değişmedi.
  Aynı kopya-FDB uçtan uca testi tekrarlandı: **1/1 PASS**.
  Komut teslimatı, yerel aynalama, Cloud ACK, simüle HTTP 503,
  journal'dan yeniden ACK ve ikinci kez yerel yazmama kanıtlandı.
- İlgili commit'ler: `22bf2dbb` (toplu güvenlik testi) ve
  `7fc276ea` (cross-runtime ACK kanıt HMAC uyumu).
- Test ortamı `D:\\KYERP\\_TEMP\\PDKS_SAFE_VERIFY_20261008_02\\web`;
  Firebird yalnız `D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_20261008_213329\\KY_PDKS_STAGE.FDB`.
  **Canlı Firebird/TNF/Cloudflare D1 değişikliği yapılmadı.**

**Kapalı kalan üretim kapıları:** Cloudflare staging D1 gerçek tenant
migration ve yetkili uzak HTTP kabulü; Firebird 9 idari action için
idempotent SQL handler ve rollback; terminal/RAW/E, maaş-puantaj ve
saha ekran kabulü. Bunlar tamamlanmadan PR #404 DRAFT kalır;
otomatik canlı Agent apply veya üretim migration açılmaz.


## 21. 09.10.2026 — PERSONEL GRUBU ATAMASI VE TAM İZOLE KABUL

**En güncel yerel kabul bu bölümdür; eski faz kayıtları tarihsel kanıttır.**

- Üçüncü yerel politika kanıtı: assign-personnel-group. Beş basamaklı
  gerçek kart numarası kopya Firebird KIMLIK kaynağında salt okunur
  doğrulanır; personelGroupId daha önce imzalı personnel-group kaydıyla
  aynalanmış gerçek Cloud commandId olmalıdır. Eksik kart veya yerel grup
  kanıtı reddedilir. Atamalar komut bazında değiştirilemez ek kayıt olarak
  saklanır. Legacy GRUP/GIRCIK, TNF, bordro veya puantaj değişmez.
- Cloud ACK replay artık ilk ACK veren cihazın ID'si, ACKED durumu ve
  orijinal teslimat hash'i eşleşmeden başarı dönmez; farklı cihaz, durum
  ya da teslim hash'i için 409 döner.
- Windows Agent ↔ local Hono Cloud ↔ SQLite D1 taklidi ↔ gerçek
  gbak-kopya Firebird uçtan uca testi 4 komut ve 4 kalıcı fiş içerir:
  personel grubu, kartlı grup ataması, tatil, simüle ACK kesintisi ve
  ikinci kez dosyaya yazmadan jurnal fişinden ACK kurtarma.
- Tek komut kontrol betiği:
  APP/pdks-unified/windows/tools/Test-UnifiedCopyAcceptance.ps1
  Parametreler: -StageDbPath yalnız
  D:\KYERP\_TEMP\PDKS_COPY_STAGE_*\KY_PDKS_STAGE.FDB
  ve -StageCardNo kopyada bulunan beş haneli kart. PowerShell ExecutionPolicy
  sistem genelinde değiştirilmeden, yalnız komut bazında çalıştırılabilir.
- Son kabul HEAD 98ecb2e982f8dadf02c9c12195e61c15f3a78ba3:
  Cloud 30/30 + cihaz/çalışma/protokol 27/27 + Agent E2E 1/1 =
  **58/58 otomatik test**. Ek 5 Windows selftest, Firebird
  GRUP/SERVIS/KIMLIK/OZELIZIN/AVANS rollback, Windows Release
  0 hata/uyarı ve Cloud TypeScript PASS.
  RESULT=PASS_WINDOWS_CLOUD_COPY_FDB_E2E_NO_LIVE_WRITES.
- Canlı Firebird/TNF/terminal RAW veya Cloudflare üretim D1 yazması
  YAPILMADI. PR #404 DRAFT/UNMERGED, gerçek Cloudflare staging yapılmadı.

**Kalan üretim engelleri:** Sekiz Firebird işlemi için gerçek idempotent SQL
ledger/commit/recovery; gerçek Cloudflare staging D1 migration ve tenant
kabulü; terminal SDK/RAW/E, puantaj ve bordro, 49 sekme saha kontrolü,
Windows dağıtımı ve Android/iOS imzalı paketler.


## 22. 09.10.2026 — FIREBIRD KOPYA SQL GÜNLÜĞÜ VE CLOUD ACK KANIT SIKIŞTIRMASI

**Bu bölüm son kodlamanın durumunu belirler; her test sürümü ayrıca doğrulanmalıdır.**

- Firebird'de üretim yazma yolu açılmadan, yalnız `--isolated-ledger-smoke`
  ile ve `KY_PDKS_ISOLATED_COPY=1` + katı
  `D:\KYERP\_TEMP\PDKS_COPY_STAGE_*\KY_PDKS_STAGE.FDB` eşlemesi üzerinden
  çalışabilen **deneysel, kopya veritabanına özgü** SQL-ledger oluşturuldu.
  `KY_PDKS_AGENT_LEDGER` ve `KY_PDKS_AGENT_MAP` tabloları **sadece**
  gbak ile oluşturulmuş ayrı test kopyasına yazılır. Agent `--agent-once`
  bu sınıfa hiçbir şekilde yönlenmez; üretim Firebird yazmaları hâlâ kilitli.
- Test edilen işlem sınıfları: `service` (SERVIS tanımı), `assign-service`
  (KIMLIK.SERVIS) ve `advance` (AVTUR kodu 1 doğrulanmış avans).
  Her biri gerçek Firebird transaction + `company/commandId` ledger +
  payload hash çakışma reddi + tekrarda tek yazma mantığını kullanır.
  Test sonunda sentetik servis/avans/journal satırları silinir ve kopya
  personelin önceki servis değeri geri yüklenir. **Gerçek avans ödemesi
  veya personel verisi değişikliği yapılmadı.**
- İlk avans testinde Firebird'de aynı parametre adlarının tekrar kullanımı
  nedeniyle tutar doğrulama hatası oluştu; ayrı parametre isimleriyle tekil
  test geçti. Ancak sonraki tekrar testinde `AVANS.KOD` üzerinden aranan
  kayıt bazı denemelerde bulunamadı (`ROW_NOT_FOUND`). Bu yüzden
  aşama **henüz production-safe kabul edilmedi**.
- Yeni düzeltme: INSERT transaction'ı içinde gerçek kaydı benzersiz test
  açıklamasına göre geri oku; tekil satır, gerçek KOD, 250,00 tutar ve
  AVTUR/TURKOD=1 bilgisi doğrulanmadan ledger commit etme.
  Cleanup da tahmini KOD yerine eşsiz açıklamayla yapılır; üç defa
  arka arkaya test koşulu `Test-UnifiedCopyAcceptance.ps1` içine eklendi.
- Cloud ACK artık `tnfTouched=false` yerel işlemlerde
  `policySha256`, `fdbEvidenceSha256` ve
  `evidenceSha256=SHA256(policySha256 + "|" + fdbEvidenceSha256)`
  tutarlılığını da bağımsız doğrular. İmzalı olsa bile çelişkili fiş
  reddedilir. Negatif test eklendi.
- Cloudflare için yalnız okuma: Wrangler oturumu mevcut, görünen
  **1 D1 veritabanı** ve ayrı `stage/test/dev/local` adlı D1 yok.
  Tek veritabanını staging gibi kullanmak, migration veya üretim
  Cloudflare yazması yapmak **yasaktır**.

**Kabul sınırı:** HEAD `a75dda76` üzerindeki servis + atama kopya-ledger
ve önceki HEAD'lerdeki **58/58 otomatik test** başarılıdır. Avansın ilk
tekil testinde başarılı çıktı alınmasına rağmen tekrarlarda hata görüldü.
Yeni `AVANS.KOD` kaynak okuma, üçlü tekrar testi, ve yeni Cloud ACK hash
doğrulama commit'lerinden sonra **tam 59-test + üçlü Firebird kabulü henüz
yeniden çalıştırılmadı**. Bu nedenle bunları PASS olarak raporlamak yasaktır.
Remote Desktop kotası %96 olduğu için kalan kota korunuyor.

**Kalan engeller:** Gerçek Cloudflare staging tenant+D1, üretim için
kanıtlı Firebird SQL ledger/transaction/crash recovery (8 eylem),
cihaz SDK/RAW/E, puantaj/bordro, 49 ekran saha testi ve mobil signing.
PR #404 **DRAFT / unmerged** tutuluyor.


## 23. 09.10.2026 — TEST EDİLEBİLİR PDKS STUDIO / TEKRARLANABİLİR KABUL

**Bu bölüm geliştirme dalının güncel kullanıcı test kapısıdır.** Önizleme
operasyonel PDKS dağıtımı veya üretim FDB/Cloudflare migration değildir.

- Tek tıklama: `APP/pdks-unified/windows/tools/PDKS-STUDIO-TEST-AC.cmd`.
  CMD aynı klasördeki `Open-UnifiedStudioPreview.ps1` dosyasını çağırır,
  izole Git çalışma ağacı içindeki Vite'ı yalnız localhost'ta başlatır,
  `5186–5196` aralığında boş port seçer ve
  `http://127.0.0.1:<port>/pdks-studio` adresini tarayıcıda açar.
  Halihazırda kullanılan 5186 sunucusu durdurulmaz.
  İlgili `node_modules` kurulu değilse açıkça hata verir.
  **Önizlemede gerçek personel kartı, giriş/çıkış, maaş veya onaylı
  tatil kaydı üretilmez; üretim POST işlemleri açılamaz.**
- Arayüz kabulü: `Test-UnifiedUiAcceptance.ps1` PDKS'ye ait dört birim
  test dosyasında **34/34 PASS**, PDKS ESLint PASS, tüm frontend Vite
  derlemesi PASS ve gerçek headless Chrome üzerinde **9 bölüm / 49 sekme
  / işlem panelleri / koyu tema / yalnız inceleme modu PASS**.
  DESEN testi aynı zamanda 5186 doluyken boş 5187 portunda başarılıdır:
  `RESULT=PASS_49_TAB_STUDIO_PREVIEW_NO_LIVE_WRITE`.
- Backend+Cloud+Firebird kopya kabulü:
  `Test-UnifiedCopyAcceptance.ps1`, Windows Release, 5 Agent güvenlik
  öz testi, gerçek `gbak` kopya FDB rollback, üç ardışık servis/atama/
  avans idempotent transaction denemesi, Cloud sözleşme/ACK ve Cloud
  ↔ Windows localhost E2E ile cihaz/puantaj salt kural testlerini
  fail-closed çalıştırır.
- Hepsini tek seferde başlatmak için
  `Test-UnifiedProductAcceptance.ps1 -StageDbPath <izinli-kopya-FDB>
  -StageCardNo <kopyada-doğrulanmış-5-haneli-kart>`.
  Betik, `D:\KYERP\_TEMP\PDKS_COPY_STAGE_*` haricindeki FDB'yi kabul
  etmez; üretim Cloudflare, cihaz, gerçek TNF değişikliği yapmaz.
- Tam frontend `npm test` komutu yalnız PDKS'ye ait olmayan
  `security-root-host.contract.test.js` dosyasında `fresh-v3`
  beklentisine karşı `fresh-v4` kaynak başlığı nedeniyle başarısız
  görüldü. **Bu farklı modül sorunu düzeltilmiş gibi gösterilmez.**
  PDKS'nin kendi kabul komutu bağımsızdır ve bu testi örtbas etmez.
- Yeni Cloud ACK birleşik kanıt hash'i ve legacy AVANS gerçek-kod
  okuma düzeltmesi, güvenli izole acceptance kapısı ile kontrol edilir.
  Canlıya geçme/üretim D1 migration/gerçek bordro mutasyonu hâlâ kapalı.

**Kalan üretim işi:** Ayrı Cloudflare staging D1, üretim-safe Firebird
8 idari işlem ve recovery, terminal cihaz SDK'sı, ham RAW/E/TNF
mutabakatı, SGK/puantaj/bordro kabulü, gerçek saha ekran yetkileri ve
mobil imzalı dağıtım. Kullanıcı onayından önce PR #404 DRAFT kalır.


## 24. 09.10.2026 — TAM BİRLEŞİK TEST KAPISI KESİN KABUL

Bu test, üretim dağıtımı değil **izole test edilebilir sürüm** kabulüdür.

**Doğrulanmış HEAD:**
`14785925d11f2259c5589d7ac92d1945697d04d7`

**Tam test komutu:**
`APP/pdks-unified/windows/tools/Test-UnifiedProductAcceptance.ps1`.
İzole `-StageDbPath` ve kopyada bulunan beş haneli `-StageCardNo`
zorunludur. Windows Release, 5 Agent öz testi, kopya FDB rollback ve
3 ardışık servis/atama/avans ledger denemesi, Cloud sözleşme+TypeScript,
gerçek Windows↔yerel Hono/SQLite kopya-FDB E2E, cihaz/TNF salt kaynak
kuralları, PDKS unit/lint/frontend build ve headless Chrome 49 sekme
tek komutla yürütüldü.

**Sonuç (DESEN izole checkout):**
- Cloud 13 sözleşme/depolama + 18 endpoint/güvenlik = **31/31 PASS**.
- Cihaz, attendance/TNF ve protokol = **27/27 PASS**.
- Windows Agent ↔ local HTTP Cloud ↔ kopya Firebird E2E = **1/1 PASS**.
- PDKS UI = **34/34 PASS** (4 PDKS test dosyası).
- Toplam **93/93 otomatik test PASS**; PDKS lint, Cloud typecheck,
  Windows Release (0 hata/uyarı), frontend build **PASS**.
- Kopya Firebird ledger **3/3 PASS**: service, assign-service,
  advance (AVTUR=1); SQL commit/replay/idempotency ve sentetik
  kayıt temizliği; kayıt sonrası gerçek AVANS.KOD geri okuma kullanıldı.
- Chrome **9 bölüm / 49 sekme PASS**; işlem paneli, koyu tema ve salt
  okunur mod. Port 5186 doluyken test 5188 üzerinden çalıştı.
- Nihai log:
  `D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\PDKS_FULL_ACCEPTANCE_FINAL_20261009.log`
- Nihai marker:
  `RESULT=PASS_COMPLETE_ISOLATED_PDKS_PREVIEW_AND_SYNC_ACCEPTANCE`.
- Önizleme kullanıcı incelemesi için DESEN bilgisayarında
  `http://127.0.0.1:5187/pdks-studio` adresinde açıldı.
  Önizlemeyi daha sonra tekrar başlatmak için
  `APP/pdks-unified/windows/tools/PDKS-STUDIO-TEST-AC.cmd`
  çift tıklanabilir; boş yerel 5186–5196 portunu seçer.

**Kanıtın sınırı:** Yalnız PDKS testleri başarılı sayıldı.
Tüm frontend'in bağımsız Güvenlik PWA testindeki
`fresh-v3`/`fresh-v4` uyuşmazlığı çözülmüş değildir;
bütün ERP testlerinin geçtiği söylenemez.
Bu test, gerçek Cloudflare staging D1 veya production yazma kanıtı
değildir. Fiziksel cihaz/terminal SDK, canlı Firebird 8 işlem,
yıllık TNF normal/E entegrasyonu, tam bordro ve Android/iOS paketleri
hâlâ eksik olduğundan PR #404 **DRAFT/UNMERGED** tutulur.
Canlı FDB/TNF/terminal RAW/Cloudflare D1 **değiştirilmedi**.
