# İşNet NetteFatura — İzole Portal XML Testi

**Amaç:** Eski NestJS portal girişini bağımsız olarak doğrulamak. **KY ERP canlı uygulaması, D1, R2, firma kartları veya e-Belge entegrasyonu üzerinde işlem yapmaz.** Resmî API gerektirmez; portal web uç noktalarıyla çalışmayı dener.

## Başlatma

DESEN veya başka yetkili Windows bilgisayarda, zaten var olan canonical KY ERP çalışma kopyasında:

```powershell
cd "D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp\TOOLS\isnet-portal-probe"
node .\server.mjs
```

Ardından **aynı bilgisayardaki** tarayıcıdan `http://127.0.0.1:8787` açılır. Node.js 22+; npm install, npm ci, ZIP, yeni token, ayrı servis veya GitHub Actions gerekli değil. Çalışma kopyasında bu dalın dosyası yoksa mevcut tek canonical repo çalışma düzeniyle ilgili daldan alınır; ikinci clone/merkez açılmaz.

1. İşNet kullanıcı adı ve şifresini **yalnızca yerel formdan** gir.
2. Portaldan gelen yetkili firma listesinden ilgili firmayı seç.
3. Maksimum 31 günlük aralıkta **gelen e-Fatura** listesini getir (ilk 200 kayıt).
4. Bir faturada **XML indir** tuşuna bas. Fatura dosyası indirilenler klasörüne tarayıcı aracılığıyla alınır; uygulama diske kendiliğinden yazmaz.
5. Test sonunda **Oturumu temizle** tuşuna bas, sonra Node sürecini kapat.

## Güvenlik sınırları

- Sunucu yalnız `127.0.0.1:8787` üzerinde dinler, ağdan erişime açılmaz.
- Kimlik bilgileri ve oturum cookie'leri **yalnızca çalışan Node sürecinin belleğindedir**; dosyaya, log'a, GitHub'a veya D1'e yazılmaz. Bellekten temizlemek için formdaki Oturumu temizle düğmesini kullan veya süreci kapat.
- Bu basit prototip **aynı Windows kullanıcısına ait tek tarayıcı/tek test oturumu** içindir; başka bir yerel kullanıcının erişebildiği paylaşımlı sunucuda kullanılmaz.
- XML yalnızca İşNet portalından ve kullanıcı tarafından seçilmiş, önceden listelenmiş belge için indirilir. İndirilen XML gerçek ticari belge olduğu için GitHub'a, Chat Bridge issue yorumlarına veya sohbet eklerine aktarılmaz.
- Portal login ekranı değişir, MFA/CAPTCHA ister veya oturumu engellerse hata gösterilir. Bu kontrolleri aşma girişimi yoktur.
- Otomatik sürekli dinleme, işaretleme, resmî fatura gönderimi, irsaliye yanıtı, muhasebe kesinleştirme ve ERP'ye import **yoktur**.
- Portal uç noktaları eski KY ERP kodundan alınmıştır; İşNet'in bugün değiştirip değiştirmediği **canlı test yapılana kadar bilinmez**.

## Test kabul ölçütleri

1. Giriş sonrası firma listesi gerçekten geliyor.
2. Firma seçimi sonrası gelen faturalar gerçek portal listesiyle tutarlı.
3. XML indirilen belge numarası ve ETTN ile eşleşiyor; orijinal UBL-TR XML, HTML giriş sayfası değil.
4. Portal oturumu kapanınca indirme başarısız oluyor; yeni girişle düzeliyor.
5. ERP D1/R2 kayıtları değişmiyor.
6. Başarılı olursa aynı mantık mevcut KY ERP `İşNet entegrasyonu → Belge Havuzu` zincirine güvenli ve sürekli çalışan **resmî/uyumlu adaptör** olarak alınabilir. Prototip kendisi üretim servisi değildir.

## Hata kodları

- `PORTAL_LOGIN_FORM_DEGISMIS`: anti-CSRF giriş alanı yok.
- `GIRIS_VEYA_FIRMA_YETKISI_DOGRULANAMADI`: kullanıcı/şifre, yetki veya portal davranışı.
- `FIRMA_OTURUMU_ACILAMADI`: firma seçimi oturum geçişi başarısız.
- `FATURA_LISTESI_ALINAMADI`: portal liste endpoint'i değişti veya yetki yok.
- `XML_INDIRME_YETKISI_VEYA_OTURUM_HATASI`: dosya yetki/oturum yanıtı başarısız.
- `XML_YERINE_PORTAL_YANITI`: indirilen dosya XML değil; portal login/HTML dönmüş olabilir.
- `PORTAL_BAGLANTISI_HATASI`: network, timeout ya da beklenmeyen hata; ham sunucu yanıtı/log veya şifre gösterilmez.

**Durum:** İlk kod prototipi; gerçek NetteFatura hesabı ve Windows üzerinde henüz kabul edilmedi. Güvenlik ve canlı kullanım için ek geliştirme gerektirir.

## Android telefonla deneme (PC gerekmez)

Bu araç bir APK değildir. Android'de **Termux** içinde Node.js çalıştırılır, test sayfası telefonun **kendi Chrome tarayıcısında** açılır. Ağdaki başka bilgisayara ya da internette barındırılan bir şifre formuna ihtiyaç yoktur.

1. Termux'u yalnız güvenilir resmî kaynağından yükle: https://f-droid.org/packages/com.termux/ . APK indirme sitelerini kullanma.
2. Termux'u aç. Aşağıdaki komutları **bir defa** çalıştır:

```sh
pkg update
pkg install nodejs curl
mkdir -p "$HOME/kyerp-isnet-test"
cd "$HOME/kyerp-isnet-test"
curl --fail --location --silent --show-error \
  "https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/test/isnet-portal-xml-lokal-20261120/TOOLS/isnet-portal-probe/server.mjs" \
  --output server.mjs
node --check server.mjs
node server.mjs
```

3. Termux açıkken aynı telefonun **Chrome** tarayıcısında http://127.0.0.1:8787 adresini aç. İşNet kullanıcı adı ve şifresini **yalnızca o yerel sayfada** gir; firma seç, gelen faturaları listele, XML indir.
4. Çıkarken **Oturumu temizle** seç. Termux'ta Ctrl+C ile işlemi durdur. Sonraki gün test için `cd "$HOME/kyerp-isnet-test" && node server.mjs` yeterlidir.

**Android notları:** Chrome indirme izni verebilir; dosya indirilenlere kaydolur. Termux ve Chrome aynı telefonda olmalıdır; `127.0.0.1` her cihazın kendisini gösterir. Telefon Android'in pil tasarrufu sebebiyle Termux'u durdurursa test kesilir. Bu araç yalnız **yerel HTTP/loopback** üzerinde çalışır; şifre internetteki KY ERP sunucusuna veya GitHub'a gönderilmez, ama kullanıcı tarafından NetteFatura portalına HTTPS üzerinden iletilir.

**Önemli:** İlk test kodunun Node söz dizimi kontrolü yapıldı, ancak Android/Termux ve gerçek İşNet hesabıyla uçtan uca test **henüz yapılmadı**. Portal oturumunun MFA veya CAPTCHA istemesi durumunda bunu aşmaya çalışmayın. Gerçek fatura XML'sini GitHub'a veya sohbet yorumlarına paylaşmayın; test ekranındaki güvenli hata kodu yeterlidir.
