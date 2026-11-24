# KY ERP — NetteFatura resmî web servis A–Z entegrasyon kabulü

24.11.2026 · **Hazırlık dalı; üretim yayını yok.** Tek hedef: mevcut KY ERP e-Belge/İşNet merkezi. Yeni portal, ikinci belge tablosu, VPS, tarayıcı eklentisi veya yerel EXE zorunluluğu yok. Eski çalışan erişimler kaldırılmadı. İşNet test daveti, güncel servis sözleşmesi ve yetkili test firma bilgisi bekleniyor.

## 1. Doğrulanmış kaynaklar ve sınır

- İşNet ürün kapsamı: https://www.isnet.net.tr/edonusum/edonusum — e-Fatura, e-Arşiv, e-İrsaliye, e-SMM, e-MM, e-Dekont.
- ERP/web servis: https://www.isnet.net.tr/edonusum/e-fatura ; https://www.isnet.net.tr/edonusum/e-irsaliye ; https://nettefatura.isnet.net.tr/EFaturaSSS.html .
- https://github.com/EfeSorogluu/NetteFatura-API — üçüncü taraf MIT SDK ve doküman arşivi, **resmî güncel sözleşme veya bizim firma yetkimiz değildir**. Kaynakta InvoiceService, AddressBookService; getCompany, getCompanyBalance, getTaxPayer, getDespatchTaxPayer, searchInvoice, searchArchiveInvoice, searchDespatchAdvice, getInvoiceXml, getInvoicePdf, sendInvoiceXml, sendDespatchAdviceXml, sendInvoiceReply, sendReceiptAdvice, cancelArchiveInvoice, contestArchiveInvoice, sendESMM/searchESMM/cancelESMM gibi referans metotlar bulundu. Kesin SOAPAction, namespace, request/response, sayfalama, yetki ve sonuç kodları sağlayıcıdan alınan güncel sözleşmeden eşleştirilecek. Bu isimler tahmini çağrıya dönüşmeyecek.
- Eski public SOAP WSDL (nfhostservis): 200, yalnız sendDocument/getApplicationResponse; arşiv erişimi kanıtı yok. Normal PROD portal/modern servis Cloudflare 522; Browser Run nötr kontrol 200, portal 422. Yeni ücretli servis veya ağ engeli dolanma yok.
- Sağlayıcının kendi giriş ekranındaki test verisi uyarısına uygun olarak yalnız sentetik/verilen test firma verileri kullanılacak. Üretim belgeleri/şifresi test ortamına taşınmaz.

## 2. Tek merkez kapsamı ve mevcut kod bağları

| Menü / işlem | Hedef | Mevcut kaynak / yapılacak bağlantı |
|---|---|---|
| Ana sayfa | Belge sayıları, durumlar, kontör, hata ve son başarılı senkron | e-Belge/İşNet dashboard + gerçek sağlayıcı sayımları; toplamın tarih/yön kapsamı gösterilecek |
| Firma bilgileri | Yetkili firma, VKN, şube, seri, adres, banka, posta kutuları | Mevcut ISNET_SETTINGS + firma kartı; seçilen tenant kesin eşleşecek |
| e-Belge oluştur | e-Fatura, e-Arşiv, e-İrsaliye taslakları; yetki varsa e-SMM/e-MM/e-Dekont | Mevcut taslak, model, cari ve iş akışı; belge türüne özgü doğrulama |
| e-Fatura işlemleri | Gelen/giden tam liste, XML/PDF, durum, ticari cevap/itiraz, taslak, gönderim | accounting_documents + mevcut e-Belge havuzu; resmi endpoint eşlemesi bekliyor |
| e-İrsaliye işlemleri | Gelen/giden, sevk/teslim, kabul/kısmi kabul, irsaliyeden fatura | Mevcut isnet-runtime-v2 + canonicalModelId ve kaynak irsaliye ilişkisi |
| e-Arşiv | Oluşturma, listeleme, orijinal dosyalar, rapor durumu, iptal/itiraz | Fatura türü olarak ayrım; e-Fatura ile karıştırma |
| e-SMM/e-MM/e-Dekont | Yetkili hizmetlerde sorgu ve uygun yaşam döngüsü | Ayrı belge türü sözleşmesi ve resmi şema; mevcut Invoice/Despatch parser ile yanlış içeri alma yok |
| Raporlar | Tarih, tür, yön, durum, cari, KDV ve mutabakat | ERP raporlama; sağlayıcı raporu ve ERP muhasebe sonucu ayrı |
| Kullanıcı/rol | Yetkili kullanıcı/roller, firma kapsamı | KY ERP yetkileri korunur; sağlayıcı API sunuyorsa yönetim, aksi halde resmî portal linki |
| Parametreler/ayarlar | Seri, şablon, gönderim tercihleri, firma ayarları | Mevcut entegrasyon profili; sağlayıcıdan gerçekten desteklenenler |
| Fatura tahsilat | Yetki varsa link oluşturma, durum okuma, ödeme mutabakatı | Cari/kasa ile bağlantı; ödeme oluşturma/açık onay, ödeme kanıtı gelmeden kapatma yok |
| Araçlar | GİB mükellef/etiket, adres defteri, ürün/hizmet, vergi dairesi | Mevcut firma/ürün kartları; yalnız farkları doğrulayarak eşleştir |
| Yükleme araçları | ERP taslağından resmi UBL ve toplu taslak hazırlama | Mevcut belge yükleme; kullanıcı onayı olmadan toplu resmî gönderim yok |
| Dosya kutusu | XML, PDF, zarf/yanıt varsa ilişki, güvenli orijinal arşiv | Tek File Hub ve mevcut KY-ISNET-BELGELER; yeni paralel kök yok |
| Kontör | Kalan kontör ve işlem maliyeti | Sağlayıcıdan bakiye okuma; satın alma yalnız ayrı kullanıcı onayıyla |
| Eğitim/yardım/geri bildirim | Resmî kaynak bağlantıları ve KY ERP hata kodu yardımı | API olmayan portal işlemleri için açıkça bağlantı; sahte servis yok |

Tüm portal fonksiyonlarının web serviste yayınlandığı iddia edilmez. Yetkisiz/desteklenmeyen fonksiyon ayrı gösterilir; otomatik aktive edilmez. Belgelerin gelen/giden uygulanabilirliği de hizmet sözleşmesine göre belirlenir.

## 3. Uçtan uca iş kuralları

1. Entegrasyon tek seçili ana firmaya bağlı; TEST ve PROD kesin ayrı. Sağlayıcının güncel resmi servis adresleri incelenerek kesin allowlist. Firma yetkisi/vergi kimliği doğrulanmadan listeleme veya yazma yok. Şifre/token yalnız mevcut sunucu tarafı AES-GCM/secret kasası; kaynakta yalnız secret referansı. İstemci, profil kabul kanıtı veya providerVerified üretemez.
2. İlk eşitleme geçmişi sayfalayarak tüm yetkili türleri alır. Sonraki eşitleme provider cursor veya güvenli örtüşen tarih penceresiyle. Sayfa/toplam tutarlılığı ve her kaydın ETTN kimliği. Başarılı sayfa/iş kalıcı checkpoint; kesinti veya kısmi başarısızlık tam başarı değildir. ETTN tenant+ortam kapsamlı tek belge; XML asıl, PDF aynı belgenin eki. Orijinal PDF'nin kimliği ve bütünlüğü kontrol edilmeli; üretilen önizleme orijinal değildir.
3. Kalıcı arşiv mevcut File Hub E_DOCUMENT binding + mevcut firma KY-ISNET-BELGELER klasörü; R2 yalnız staging/preview. XML/PDF hash, provider location ve erişim doğrulanmadan arşiv tamamlandı denmez. Geçici içerik yalnız kalıcı kayıt doğrulandıktan sonra temizlenir. Muhasebeleştirme, eşleştirme, KDV, lot, model, cari ve stok mevcut canonical akışı kullanır; test kayıtları canlı mali deftere girmez.
4. Yeni belge: cari/ürün ve ilgili irsaliye → taslak → resmi UBL/XSD/Schematron/sağlayıcı doğrulaması → önizleme → kullanıcıya bağlanmış içerik hash+versiyon+ETTN onayı → atomik D1 gönderim kilidi → tek resmi çağrı → sağlayıcı alındısı → durum sorgusu → XML/PDF arşivi. Belge değişirse önceki onay geçersiz. Kur/iskonto/yuvarlama/çoklu KDV/iade/istisna/tevkifat ve kısmi sevk doğrulaması ayrı fixture.
5. HTTP 200 tek başına kabul değil. Sağlayıcı alındısı, belge numarası, ETTN ve durum eşleştirilir. Timeout/bağlantı kopması = UNKNOWN_REVIEW_REQUIRED, otomatik tekrar yok; önce aynı ETTN/harici referans ile sorgu. Sağlayıcı reddi ve GİB nihai durum birbirinden ayrı.
6. İptal/itiraz/uygulama yanıtı/teslim yanıtı, firma/rol/ayar değişikliği, kontör satın alma, ödeme linki ve resmi gönderim ayrı açık onay ve işleme özgü doğrulama gerektirir. Otomatik cron yalnız okuma/senkron/arşiv/mutabakat için.

## 4. P0 güvenlik/işlev açıkları (mevcut prod kaynak incelemesi)

- isnet-invoice-runtime.ts: 152–193 taslak oluştururken dış SaveInvoice öncesi atomik idempotency kaydı yok; dönen numaradan hemen VERIFIED/verified:true üretiliyor. 201–207 verify rotası gerçek satır/tutar karşılaştırmadan boş differences kaydediyor. 208–217 onay taslak doğrulama durumunu zorunlu kılmıyor ve expectedVersion opsiyonel. 218–241 gönderimde gerçek sağlayıcı ETTN/alındı ayrıştırması ve kalıcı atomik kilit yok; hata sonrası APPROVED durumuna dönebiliyor. Resmî yeni sürüme bu haliyle geçirilmez.
- isnet-cloud.ts 1367–1472: legacy yerel taslak onayı/submitEndpoint akışı ile invoice-runtime aynı resmi yetenek için iki yol oluşturabiliyor. Resmî driver tek gönderim motoruna konsolide edilecek; route sözleşmeleri geri uyumlu yönlendirilecek.
- isnet-runtime-v2.ts 740–855: testSettings token ve firma bilgisini mevcut json_store ayarına yazıyor. Yeni official driver üretim/test secret ayrımını ve encrypted vault kullanımını zorunlu tutacak; mevcut değerleri chat/repo/loga taşıma. Mevcut tokenların gerçek saklama güvenliği ayrıca denetlenmeli.
- EBelgeIntegrationTestCenter: yalnız dört yön + ilk sayfa read-only test, giden staging kapsamı; bu tam arşiv veya resmi gönderim testi değildir.
- e-belge-ubl.ts ve isnet-file-validation.ts mevcut fatura/irsaliye importer kapsamıyla sınırlı; e-SMM/e-MM/e-Dekont doğrulaması ve veri modeli belge bazında ek kabul gerektirir.
- Yeni helper bu açıklar için güvenlik sözleşmesi oluşturur; mevcut canlı rotalara bağlanmadı. Atomik D1 kilidi, resmi transport ve şema/mapping uygulaması **henüz yapılmadı**. No CI, no merge, no deploy.

## 5. Hazır test kodu / kanıt

- APP/cloud/ky-erp-api/src/isnet-official-acceptance.ts: 6 belge ailesi, 31 işlem kimliği; kapalı varsayılan yetki, firma/ortam/sözleşme, açık onayla hash/versiyon bağı, belirsiz gönderim durumunda yeniden gönderim engeli, ETTN ve arşiv çift doğrulama.
- APP/cloud/ky-erp-api/src/isnet-official-acceptance.test.ts: 10 sentetik birim testi.
- Kaynak commit 61f830cfe9818e76f7b50ba5970b66f613ac0a96, blob SHA sırasıyla 010b4177b6876ad8a0651138dc6efbd36da80de2 ve 5c6a10cce263097cd5e4bacca626f4b614b0a291. İzole Linux Node v22.16.0 test kopyalarında git hash-object eşleşti; node --experimental-strip-types --test **10/10 PASS**; yardımcı dosya tsc --noEmit --strict --target es2022 --module esnext **PASS**. Bunlar gerçek İşNet hesabı, gerçek D1/File Hub entegrasyonu, bütün Worker typecheck veya CI kabulü değildir.
- Helper server-owned profile/evidence bekler. Endpoint review ve gerçek provider adapter, DB atomik durum geçişi ve IAM çağıran katmanın sorumluluğundadır. Sentetik fixture gerçek yetki üretmez.

## 6. Sağlayıcı test maili geldiğinde sırayla gerçek kabul

| No | Test | Geçme şartı |
|---|---|---|
| 01 | Test daveti ve doküman | Sağlayıcı TEST adresi, güvenli protokol, kimlik doğrulama yöntemi, sentetik test firma ve alıcı, resmi şema |
| 02 | Buluttan erişim | Cloudflare TEST gerçek servis health/WSDL ve auth; varsa IP/VKN yetkilendirmesi resmi şekilde |
| 03 | Firma ve mükellef | Test firma/etiket doğru; başka tenant ve prod reddi |
| 04 | Örnek e-Fatura taslak | Test alıcı/seri/senaryo, kalem/KDV/ödenecek tutar, ETTN doğrulandı |
| 05 | Sağlayıcı istediği örnek gönderim | Kullanıcı onaylı yalnız TEST gönderim, gerçek alındı/numara/ETTN; istenen örnek XML güvenli şekilde kullanıcıya teslim |
| 06 | Durum / orijinal dosya | Aynı ETTN test durum sorgusu ve XML/PDF eşleşmesi |
| 07 | Gelen/giden e-Fatura | Tam sayfalama, XML/PDF, ticari uygulama cevabı; fixture yoksa kabul bekler |
| 08 | Gelen/giden e-İrsaliye | Sevk bilgileri, teslim/kısmi kabul, kaynak bağlantılı fatura |
| 09 | e-Arşiv | Test oluşturma, arşiv sorgu, durum, iptal/itiraz varsa sentetik işlem |
| 10 | e-SMM/e-MM/e-Dekont | Her biri yetkiliyse uygun resmi şema/işlemler; değilse desteklenmeyen |
| 11 | Firma/ürün/adres/seri/şablon | Okuma ve izinli test yazmaları, doğru firma, mükerrer yok |
| 12 | Rapor, kontör, yetkiler, tahsilat | Gerçek servis kapsamı ve read-only doğrulama; parasal işlem ayrı |
| 13 | Tek havuz + File Hub | İzole testte ETTN dedup, iki orijinal dosya, gerçek arşiv location/hash, kesinti kurtarma |
| 14 | Belirsiz yanıt | Çift gönderim yok; concurrent claim, timeout, status recovery, değişen taslağın onayı reddedilir |
| 15 | Canlıya hazırlık | İşNet kabulü, üretim yetkisi, gerekiyorsa egress şartı, full typecheck/test/build/PR; gerçek smoke ve ilk canlı gönderim ayrı kullanıcı onayı |

Sağlayıcı cevabı gelmeden örnek belgeyi gerçek servise göndermiyoruz. İlk TEST e-Fatura başarıyla tamamlandıktan sonra tüm yetkili metotlar aynı resmi sürücü altında birleştirilir. Kullanıcıdan yeni EXE/eklenti/VPS veya yeni token oluşturması istenmez; İşNet'in resmi güvenlik/egress şartı sağlanamıyorsa somut blocker olarak gösterilir.

## 24.11.2026 — KYERP İşNet işlem merkezi / arayüz önceliği

- Mevcut resmî entegrasyon hazırlık dalında dört belge görünümüne, belge havuzuna, arşive ve mevcut bağlantı/dosya kontrolüne tek merkezden erişim eklendi. Belge detayında doğrudan orijinal PDF/XML indirme; doğrulanmamış arşiv durumunda sahte PDF mevcut etiketi kaldırıldı.
- Resmî taslak, gönderim, yanıt, ek belge aileleri, sağlayıcı yönetim ve finans işlemleri servis sözleşmesi ve güvenli sunucu uygulaması beklediğinden kapalı. Muhasebe onayı resmî gönderim değildir. Mevcut sync korunur. CI, canlı kullanıcı kabulü ve sağlayıcı testi henüz yok; merge/deploy yok.
- Ürün adı KYERP; teknik kimlikler korunur.
