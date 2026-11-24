# KY ERP — İşNet gerçek hesap kabulü DESEN devir notu

Tarih: 2026-11-24 (Türkiye)
Kapsam: yalnız İzole Cloudflare İşNet QA; **KY ERP production'a dokunulmaz**.

## Kullanıcı talimatı
Kullanıcı İşNet gerçek belge testini yaklaşık dört saat sonra **DESEN bilgisayarından** yapacak.
"Ben açınca haber edeceğim" dedi. Haber vermeden önce DESEN'e komut gönderilmeyecek,
Cloudflare secret, izin veya production konfigürasyonu değiştirilmeyecek.

## Kanıtlı mevcut durum
- X bilgisayarından Cloudflare Wrangler OAuth onayı ve whoami çıkış 0 daha önce doğrulandı; **DESEN'in yetkisi olarak sayılamaz**.
- Ayrı QA D1: `kyerp-isnet-qa-20261124`, yalnız QA session/login rate limit tabloları.
- QA Worker: `kyerp-isnet-cloud-qa`. Önceki Wrangler kaydında deploy başarı, URL `https://kyerp-isnet-cloud-qa.cetin60kaya.workers.dev`.
- QA `GET /api/health` yanıtı 200; erişim kontrollü `/` yanıtı 403 idi.
- Son okunabilen QA Worker secret listesinde `QA_SESSION_KEY=False`, `QA_ALLOWED_IP=False`; bu nedenle gerçek kullanıcı testi hazır ilan edilmez.
- Test arayüzü giriş → yetkili firma → gerçek belge listesi → 1-2 belge XML/PDF indirme olarak kodlandı.
- Gerçek İşNet kullanıcı şifresiyle giriş, gerçek dosya indirme **henüz yapılmadı**.
- Eski `deploy-qa.ps1` X dağıtım komutu devre dışı; kullanıcı DESEN'i seçti.

## DESEN için hazırlanan kaynak
`TOOLS/isnet-cloud-qa-live/DESEN-KABUL-HAZIRLIK.ps1`.

- Varsayılan `-Asama Kontrol`: yalnız DESEN bilgisayar adını, mevcut Wrangler'ı,
  Cloudflare yetkisini, QA Worker'ını, QA D1 bağını ve QA health yanıtını kontrol eder;
  Cloudflare kaynaklarını değiştirmez. Geçici yerde yalnız QA config okunabilir.
- `-Asama Aktiflestir`: kullanıcı bu adımı **kendisi başlattıktan sonra** izole QA Worker
  kaynağını doğrular ve yayımlar; AES-GCM oturum anahtarı yoksa DESEN'de rastgele üretir;
  varsa dönüştürmez. DESEN'deki anlık genel IP'yi Cloudflare worker erişim secret'ına ayarlar.
  Hiçbir API tokenı, kullanıcı şifresi veya IP adresi sohbete/GitHub'a gönderilmez.
- Gerçek endpoint `/` ve `/app.js` HTTP 200 doğrulanmadan ekran kullanıma açık denmez.
- Her iki aşamada da production `ky-erp-db`, File Hub, belge muhasebeleştirme,
  fatura gönderme veya Outlook gönderme işlemi **yok**.
- Cloudflare Wrangler DESEN'de yoksa script yeni yazılım kurmaz; durum bildirir.
  DESEN yetkisizse `wrangler login` işlemini kullanıcı kendi tarayıcısında onaylar;
  X'in tokenı DESEN'e taşınmaz.
- DESEN ağının genel IP'si değişirse izin yenilenmelidir. Aynı ağdaki başka cihazlar
  aynı IP'yi paylaşabileceğinden IP filtresi tek başına cihaz kimlik doğrulaması değildir.

## Kullanıcı geldiğinde doğrulama
1. Kullanıcı "DESEN'i açtım" dediğinde **yeni canlı DESEN KY Control Bridge status**
   isteği için eşleşen requestId, device, op, ok kontrolü; izin dışı shell çağrısı yok.
2. Hazırlık kodunu DESEN'de kullanıcı açıkça çalıştırır, `Kontrol` sonucu görülür.
3. Yetkili Wrangler yoksa kullanıcı güvenli Cloudflare tarayıcı onayı yapar.
4. `Aktiflestir` yalnız kullanıcı başlattığında uygulanır; QA status ve HTTPS ekranı
   gerçek DESEN yanıtıyla doğrulanır.
5. Kullanıcı gerçek İşNet hesabıyla giriş, yetkili firma seçimi,
   gelen 1-2 irsaliye listeleme ve aynı belgelerin gerçek XML/PDF indirmesini dener.
   Dosya boyutu, UBL tipi/PDF imzası ayrı ayrı kontrol edilir; başarılı olmadığı yerde
   FULL PASS yazılmaz.
6. Gerçek belge içerikleri, tokenlar, VKN/TCKN veya şifreler issue, sohbet veya GitHub'a
   aktarılmaz. Production geçişi ancak sonraki ayrı kabul adımıdır.

GitHub Actions QA mekanizması **kullanılmayacak**; buradaki commitler yalnız kaynak/kayıt.
