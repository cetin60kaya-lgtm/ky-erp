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
