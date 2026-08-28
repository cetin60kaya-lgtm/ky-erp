# KY ERP — Desen / Google Drive / Gmail / İşNet Dosya Merkezi

Tarih: 2026-08-28
Durum: Onaylı proje mimari kararı

## 1. Ana ilke

KY ERP uygulaması ve veritabanı Cloudflare altyapısında çalışmaya devam eder. Google Drive uygulamanın çalışma motoru veya veritabanı değildir.

Google Drive; büyük, kalıcı ve kullanıcı tarafından erişilmesi gereken dosyaların ana depolama alanıdır.

- Desen dosyaları: Google Drive / Desinatör
- İşNet PDF/XML ve belge arşivi: Google Drive / KY-ERP / STORAGE / ISNET
- KY ERP: indeks, ilişki, durum, eşleştirme, işlem geçmişi ve kullanıcı arayüzü
- Gmail: desen gönderimlerinin gerçek gönderim kanıtı

Dosyalar gereksiz yere R2/D1 içine ikinci kez tam boy kopyalanmaz. Gereken yerde yalnız küçük önizleme/cache tutulabilir.

---

## 2. Desen — sabit Google Drive klasörleri

Ana kök: `Desinatör`

Sabit klasör görevleri:

- `görsel` — model kartının ana JPEG/JPG kaynağıdır.
- `modeller` — PSD, PSB, TIFF, PDF, AI vb. teknik/desen çalışma dosyalarıdır. Tek başına yeni model oluşturmaz.
- `yerleşim dosyaları` — yerleşim, baskı kalıbı ve ilgili teknik PDF/dosyalardır.
- `gelen dosyalar` — henüz tasnif edilmemiş geçici giriş dosyalarıdır.
- `giden desenler` — hazırlanmış/gönderime hazır desen çıktılarıdır. Burada dosya bulunması tek başına "Gmail ile gönderildi" anlamına gelmez.
- `DTF` — DTF üretim dosyalarıdır. Ayrı DTF model arşivi oluşturulmaz; model kimliği mevcut ana model düzeniyle ilişkilendirilir.
- `index` — sistem indeks yardımcı alanıdır.
- `sistem` — sistem yardımcı dosyaları/metadata alanıdır.

### 2.1 Model oluşturma kuralı

Yalnız `Desinatör/görsel` içindeki JPG/JPEG dosyaları model kartını oluşturur veya mevcut modeli günceller.

Örnek:

`MELONCE.jpg` → `MELONCE` model kartı.

Diğer PSD/PDF/TIFF/AI dosyaları model oluşturmaz; mevcut modele ilişkilendirilir.

### 2.2 Drive kimliği

İlişkiler yalnız dosya adına bağlanmaz. Temel kalıcı kimlik Google Drive `fileId` değeridir.

Dosya adı veya klasör değişse dahi mümkün olduğunda ilişki Drive fileId üzerinden korunur.

### 2.3 Eşleştirme

Eşleştirme sırası:

1. Drive fileId ile daha önce kayıtlı ilişki
2. Kesin model klasörü
3. Kesin model adı
4. Kayıtlı alias/eş ad
5. Dosya adı çözümleme
6. Benzerlik/öneri

A/B, ön/arka, üst/alt, DTF ve benzeri anlamlı varyantlar kör şekilde silinmez.

Emin olunmayan dosya otomatik yanlış modele bağlanmaz; `Eşleşme Bekleyenler` alanına düşer.

Kullanıcının verdiği manuel eşleştirme kararı kalıcı eşleştirme kuralı olarak saklanır.

---

## 3. Desen modülü — hedef ekran düzeni

Ana temiz sekmeler:

1. Desen Havuzu
2. Drive Dosya Merkezi
3. Gönderim Merkezi
4. Yerleşim / Kalıp
5. Rapor & Geçmiş

### 3.1 Desen Havuzu

Model kartında kısa durum özeti gösterilir:

`Görsel ✓ · Desen 3 · Yerleşim 1 · Giden 2 · Gmail ✓`

Detay ekranında:

- Genel
- Dosyalar
- Yerleşim
- Gönderimler
- Geçmiş

### 3.2 Drive Dosya Merkezi

Tam ekran çalışır.

Bölümler:

- Genel Durum
- Drive Klasörleri
- Model Dosyaları
- Eşleşme Bekleyenler
- Senkron Logu

Uygulama Drive klasör ağacını ve dosya metadata bilgisini doğrudan gösterebilir.

PSD/TIFF/AI gibi tarayıcıda doğrudan önizlenemeyen dosyaların açılması şart değildir. Şu bilgiler yeterlidir:

- dosya mevcut
- dosya adı
- tür
- boyut
- değişiklik tarihi
- Drive'da Aç

İlk aşamada salt-okunur bağlantı tercih edilir. Dosya taşıma/yeniden adlandırma daha sonra açık kullanıcı işlemi ve log ile eklenebilir. Otomatik silme yapılmaz.

---

## 4. Gmail — desen gönderim teyidi

Amaç yalnız mail atmak değil, gerçek gönderimin kanıtını modele bağlamaktır.

`giden desenler` klasöründe dosya bulunması = `Gönderime hazır`.

Gerçek `Gönderildi` durumu Gmail tarafındaki mesaj kaydıyla teyit edilir.

Saklanacak temel Gmail alanları:

- Gmail messageId
- threadId (varsa)
- gönderim tarih-saat
- alıcı/alıcılar
- konu
- ek dosya adları
- ilişkili model/model listesi
- gönderen kullanıcı
- gönderim tipi: ilk / revize / yeniden gönderim

Teyit durumları:

- `GMAIL_CONFIRMED` — gerçek Gmail mesajı bulundu ve ilişki teyitli.
- `POSSIBLE_MATCH` — konu/model benzer fakat kesinlik düşük; kullanıcı teyidi gerekir.
- `NOT_SENT` — Drive'da giden dosya var ancak Gmail gönderimi bulunamadı.

Bir Gmail mesajı birden fazla modele bağlanabilir.

Örnek kullanıcı sorguları:

- `MELONCE desenini ne zaman gönderdik?`
- `Dün hangi desenleri gönderdik?`
- `NATEL en son ne zaman gitti?`
- `MINECRAFT 15 ile beraber hangi desenler gönderildi?`
- `Revizesi hazır olup gönderilmeyen desenleri göster.`

KY ERP Asistan cevabında mümkünse model JPEG küçük görselini, tarih-saat, alıcı, konu, ekler ve aynı maildeki diğer modelleri birlikte göstermelidir.

### 4.1 Revize kontrolü

Drive'da modelin son dosya değişiklik zamanı son Gmail gönderiminden daha yeniyse sistem:

`Yeni/revize dosya mevcut — son gönderimden daha yeni`

uyarısı üretmelidir.

---

## 5. İşNet — Google Drive ana dosya arşivi

İşNet'in PDF/XML dosyaları Google Drive'da kalıcı tutulur. Uygulama yalnız indeks, iş akışı ve durum bilgisini saklar.

Ana Drive yolu:

`KY-ERP / STORAGE / ISNET`

Sabit alt klasörler:

- `GELEN BELGELER`
- `KESILEN BELGELER`
- `TEDARIKCI BELGELERI`
- `GONDERIM ARSIVI`
- `HATA VE BEKLEYEN`

Uygulama gerektiğinde yıl/ay alt klasörlerini otomatik oluşturabilir.

Önerilen otomatik düzen:

`<ANA KLASOR>/<YYYY>/<MM>/<BELGE veya MODEL/FIRMA>/...`

PDF ve XML aynı belge kaydı altında ilişkilendirilir. Kullanıcı arayüzü için temel alanlar:

- belge türü
- belge no
- tarih
- firma/model
- PDF Drive fileId
- XML Drive fileId
- Drive webViewLink
- indirme/senkron zamanı
- kaynak İşNet kaydı
- durum
- hata/eksik bilgisi

### 5.1 İşNet dosya kuralları

- İşNet'ten indirilen PDF/XML doğrudan Drive'a yazılabilir.
- Aynı belge tekrar indirilirse belge no + tür + kaynak kimliği ile mükerrer dosya oluşturulmamalı; mevcut kayıt güncellenmeli veya sürüm bilgisi tutulmalıdır.
- Drive'a başarılı kayıt olmadan belge `ARŞİVLENDİ` sayılmamalıdır.
- Drive dosyası silinirse ERP kaydı sessizce silinmez; `DRIVE_MISSING` olarak işaretlenir.
- Yazdırma ve mail gönderimi Drive'daki belge kaydı üzerinden yapılabilir.
- Büyük dosyalar D1/R2 içine gereksiz yere kopyalanmaz.

---

## 6. Senkronizasyon

İlk bağlantıda tam indeks yapılır.

Sonrasında tüm Drive'ı tekrar tekrar taramak yerine yalnız yeni/değişen dosyalar alınır.

Önerilen çalışma:

- periyodik Worker scheduled sync
- kullanıcı ekranında `Şimdi Senkronize Et`
- sayfa açılışında yalnız hafif durum kontrolü

Bilgisayarın açık olması, Google Drive Desktop veya yerel BAT/PowerShell watcher zorunlu değildir.

---

## 7. Güvenlik

Google kimlik bilgileri frontend'e verilmez.

ERP Worker tarafında sunucu kimliği/OAuth kullanır.

Yetki minimum olmalıdır:

- Desen için yalnız `Desinatör` alanı
- İşNet için yalnız ilgili `KY-ERP/STORAGE/ISNET` alanı
- Gmail için yalnız gerekli okuma/gönderme kapsamı

Dosya silme otomasyonu varsayılan olarak kapalıdır.

Dosya taşıma, yeniden adlandırma ve eşleştirme değişiklikleri kullanıcı ve zaman bilgisiyle loglanır.

---

## 8. Veri ve depolama prensibi

Google Drive = gerçek dosyanın ana kaynağı.

KY ERP D1 = ilişki, metadata, durum, log ve eşleştirme.

R2 = yalnız gerekli küçük önizleme/cache veya Drive dışında tutulması açıkça kararlaştırılmış dosyalar.

Aynı büyük dosyanın Drive + R2 + D1 biçiminde gereksiz çoğaltılması yapılmaz.

---

## 9. Nihai hedef

Desen modülü yalnız resim galerisi değil; modelin tüm yaşam döngüsünün kontrol merkezi olacaktır:

`MODEL → Görsel → Desen Dosyaları → Yerleşim/Kalıp → Giden Desen → Gmail Gönderimi → Revize → İmalat/Boyahane → Tam Geçmiş`

İşNet tarafında da:

`İŞNET BELGESİ → PDF/XML İNDİR → GOOGLE DRIVE ARŞİVLE → ERP İNDEKSLE → YAZDIR/MAIL/İŞ AKIŞI → LOG`

Ana kullanıcı ilkesi:

**Arkada detaylı ve izlenebilir yapı, önde sade ve hızlı ekran.**
