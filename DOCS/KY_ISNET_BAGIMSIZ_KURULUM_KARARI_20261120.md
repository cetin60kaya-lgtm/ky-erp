# İşNet entegrasyon mimari kararı — 20.11.2026

## Kullanıcı hedefi
KY ERP'ye her PC/tablet/telefondan erişirken **hiçbir ofis bilgisayarının açık kalmasının zorunlu olmaması**. Mevcut gelen/giden e-Fatura ve e-İrsaliye ile **orijinal XML + orijinal PDF** tek canonical e-Belge Havuzu, idempotent ETTN, fatura–irsaliye eşleştirmesi. Fatura oluşturma/gönderme yok.

## Öncelik 1: İşNet'in resmî web servis entegrasyonu (bilgisayardan bağımsız)
- Resmî NetteFatura SSS: dış ERP web servis hizmeti başvurusunda bulunabilir; gizlilik sözleşmesiyle web servis kullanımının ücretsiz sunulduğu yazıyor. **Güncel sözleşme koşulları İşNet'ten teyit edilir.**
- Resmî ürün sayfası API entegrasyonu, portal, mobil ve e-İrsaliye kullanımını anıyor.
- **İşNet'ten doğrulanacak sözleşme:** Yetkili şirket/VKN, test+canlı ortam endpointleri, salt-okunur dört belge yönü liste/filtre/durum, orijinal UBL XML ve PDF'nin servisle indirilmesi, sayfalama, e-İrsaliye referansları, hız limitleri, IP allowlist ve güvenli kimlik doğrulama.
- Sağlayıcı statik çıkış IP'si isterse Cloudflare Worker'ın dinamik çıkışını yeterli sayma: **mümkünse mevcut yetkili sabit IP çıkışı**, yoksa maliyet/onaydan sonra küçük **7/24 bulut çıkış geçidi**; yeni PC gerektirmez. Kaynak sözleşme doğrulanmadan gateway satın alma/kurma yok.
- Secret yalnız yetkili secret vault/Cloudflare kasasında; GitHub, tarayıcı veya sohbet içine gönderilmez. Provider veri çağrılarını her tenant ve yetki için izole et.

## Öncelik 2: Resmî web servis erişimi sağlanamıyorsa
- Mevcut Windows'ta gerçek belge listeleme/indirmenin başarılı olduğu portal yönteminden **tek makinede kurulum yapılabilen** adapter. Diğer bilgisayarlar/telefonlar yine yalnız KY ERP web uygulamasını kullanır.
- Kurulum tek paket: hizmet kurulumu, otomatik başlatma, güncelleme, sağlık ölçümü, işletim sistemi şifre kasası, durdur/yeniden başlat/kaldır, güvenlik duvarını keyfî açmama, yalnız outbound güvenli köprü, firma yetkisi ve audit.
- **Maliyet/sınırlama:** Kurulu makine kapanırsa **yeni belge çekilemez**; D1/File Hub'daki mevcut belgeler başka cihazlardan görülebilir. Gizli çerez/şifre GitHub issue/sunucu loguna konmaz.
- Mevcut `TOOLS/isnet-portal-adapter/server.mjs` ve `isnet-local-portal-routes.ts` **deneysel refactor dalındadır, kullanıcıya kurulum/paket ve canlı kabul değildir.** Test, tehdit modeli, Windows doğrulaması ve canonical File Hub arşiv kabulü geçmeden merge/deploy yapılmaz.

## Ortak veri ve kullanıcı sözleşmesi
1. **İşNet bağlantısı**: Bir kez tanımlanır, portal ve resmî servis yöntemlerini aynı anda karıştırma.
2. **Belgeleri al**: Gelen/giden e-Fatura/e-İrsaliye, XML + varsa gerçek orijinal PDF; yalnız salt-okunur.
3. **Tek Havuz**: Firma + ETTN/kaynak kimliği ile tekrar indirme mükerrer işlem oluşturmaz; eksik PDF açıkça gösterilir; sayfa yenileyince belge silinmez.
4. **Muhasebe kontrolü**: Cari, kalem/KDV, tedarikçi gider türü, model ve fatura–irsaliye eşleştirmeleri mevcut canonical motorlarda; kesin kayıt kullanıcı onayıyla.
5. **Dosyalar**: File Hub `E_DOCUMENT` canonical saklama hedefidir. R2 cache/staging olabilir, zorunlu tek fiziksel arşiv olarak kullanılmaz.
6. **Sıfır sahte PASS**: Sunucu erişim testi İşNet oturum PASS değildir; sağlayıcı test+gerçek R2/File Hub belge kabulü gerekir.

## İşNet'ten talep edilecekler
- Resmî salt-okunur web servis hesabının aktif edilmesi ve entegrasyon gizlilik sözleşmesi
- Test ve canlı servis/kimlik/IP sözleşmesi ve dokümanları
- Gelen/giden e-Fatura/e-İrsaliye XML, orijinal PDF indirme çağrıları, kimlik/ETTN, tarih/sayfalama/durum
- Firma yetki ve IP sabitleme gereksinimi; hizmetin güncel ücret/limit koşulları

## Son durum
- Önceki localhost portal kullanımı kullanıcı tarafından dört belge yönü ve XML/PDF için doğrulandı.
- Cloudflare portal formuna erişim geçmişte doğrulansa da **kimlik/firma listesi oturumu başarısız**; şifre yanlış olduğuna dair kanıt yok.
- İşNet web servis başvurusu / yetki / servis sözleşmesi **bu oturumda alınmadı**.
- Resmî web servisi canlıya alınmış değil; mevcut yerel refactor dalı kullanıcıya kurulacak paket değil.
- Hiçbir canlı fatura oluşturma/gönderme, D1 migration, şifre aktarma veya bilgisayar kurulumu yapılmadı.

Kaynaklar:
- https://nettefatura.isnet.net.tr/EFaturaSSS.html
- https://www.isnet.net.tr/edonusum/e-fatura
- https://www.isnet.net.tr/edonusum/e-irsaliye
