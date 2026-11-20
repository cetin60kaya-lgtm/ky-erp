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
