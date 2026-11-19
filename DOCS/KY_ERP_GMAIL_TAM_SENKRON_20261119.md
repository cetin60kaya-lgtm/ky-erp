# KY ERP — Gmail 15 klasör tam senkron düzeltmesi — 19.11.2026

## Kullanıcı canlı ekranı
- Kullanıcının `kyerp.net` arayüzü: **E-Posta Yönetim Merkezi**, firma **Hakan Emprime**, Gmail DESEN hesabı 1/1, OAuth bağlı, firma onayı var, sağlayıcı hazır, **tam senkron 0/15**, tam hazır 0.
- **Aşama 1 gerçek tarayıcı ekran kabulü:** menü, tasarım, firma ve 4 sekme göründü (PASS).
- **Aşama 2 canlı Gmail kabulü:** eski kod yalnız Gelen/Sent ilk 100 mesajını okuyordu. 15/15 tam senkron kanıtı yok; ne 0/15 ne de OAuth bağlı olmak geçmişin tam indirildiği anlamına gelir.

## Güncel kod mantığı
- Mevcut Mail Core ve Gmail OAuth korunur. Yeni Gmail hesabı, token, parola, ayrı depo veya D1 migration yok.
- `/api/mail/accounts/:id/sync/google` Gmail'den görünür etiketleri/klasörleri keşfeder; yalnız `sync_enabled=1` ve provider'da hâlen var olan etiketleri tarar.
- Her kullanıcı başlatmasında **en fazla 3 klasör x 40 mesaj** işlenir. `GMAIL_PAGE` cursor ile `PAGE:<nextPageToken>` korunur; son sayfanın bütün mesajları başarıyla işlendiğinde `DONE` olur. Hata varsa aynı sayfa tekrar denenebilir; provider historyId sayfa tokenı olarak kullanılmaz.
- Gmail etiketleri örtüşür: kanonik klasör kimliği mesajın gerçek etiketleriyle seçilir, aynı mesaj farklı etiketten tarandığında otomatik başka klasöre savrulmaz.
- Tekrarlanan mesajda mail ekleri topluca silinmez. Aynı provider attachment ID / dosya adı / MIME / boyut eşleşiyorsa önceki File Hub kanıt bağlantısı korunur, değiştiyse eski link doğrulanmış diye kullanılmaz.
- Mail Core sağlık durumu yalnız kendi provider türünün gerçek tamamlanmış cursorlarını sayar. Eski `GMAIL_HISTORY` girişleri ya da Microsoft `MICROSOFT_DELTA` Gmail'i yanlışlıkla sağlıklı göstermez.
- `partial` ve tamamlanan/toplam klasör sayısı gösterilir. Kullanıcı gerektiğinde aynı **Senkronize Et** ile ilerleyebilir. Yeni cron, otomatik müşteri maili, D1 üretim kayıt düzeltmesi veya finans kaydı yapılmaz.

## Sınırlamalar ve canlı kabul
- 15 klasörün tamamlanması **birden çok kullanıcı başlatması** gerektirebilir; çok büyük arşivler kısa süreli istek sınırı nedeniyle tek tıkla bitmez.
- Bu aşama **ilk arşiv taraması** içindir. Tamamen bitmiş arşivden sonraki güncel değişikliklerin otomatik Gmail history/delta takibi ayrıca canlı kabul gerektirir. Desteklenmeyen 'her gün kendiliğinden tam senkron' sözü verilmez.
- Tamamlandı denmesi için eşleşen gerçek Gmail OAuth, 15/15 cursor başarı, gelen-giden mail örnekleri, ek PDF kanıtı ve gerçek kullanıcının ekranı kontrol edilmeli. Test/Cloudflare başarıları bu gerçek Gmail kabulünün yerine geçmez.

## 19.11.2026 — Gerçek kullanıcı 500 hatası ve kotaya uygun düzeltme
- Canlı KY ERP ekranında DESEN Gmail senkronu "Hata: Internal Server Error", 0/15. Gerçek sunucu hata logu görülmedi; kök neden kesin değildir.
- Önceki işlem 3 klasör x 40 mesaj ve gereksiz klasör sorguları içeriyordu. Cloudflare Free planında 50 dış istek, 50 D1 query/Worker isteği kotası bulunduğundan sınır aşımı ciddi olasılıktır.
- Yeni güvenli adım: 1 klasör x en fazla 3 mesaj; Gmail nextPageToken kaldığı yerden. Klasörler tek sorguda okunur, yalnız yenileri/ değişenleri toplu yazılır. To/CC/BCC ve ek kaydı D1.batch kullanır.
- GMAIL_TOKEN, GMAIL_LABELS, FOLDER_DISCOVERY, GMAIL_PAGES, CURSOR_CHECKPOINT, SYNC_SUMMARY aşamaları hata kodu ile ayrılır. Token ve mail içeriği loglanmaz. Gerçek Gmail kullanıcı testi ayrıca gereklidir.

## 19.11.2026 — Gerçek Gmail refresh token hatası ve aynı hesabı yeniden yetkilendirme
- Kullanıcı ekranı: `Gmail oturum anahtarı yenilenemedi; bağlantı kontrolü gerekli`, 0/15. Bu sonuç, gönderim veya tam arşiv testi değil; OAuth yenileme aşaması FAIL.
- Google OAuth token yenileme hatasında yalnız `invalid_grant` / kayıtlı refresh token eksikliği kesin yeniden onay gerektirir. `invalid_client` veya geçici Google hatası otomatik olarak kullanıcı yetkisi iptali sayılmaz.
- Kesin yenileme problemi varsa `mail_accounts.status=REAUTH_REQUIRED`, `provider_connected=0` güncellenir; aynı hesap, onay, şifreli credential satırı, mail arşivi ve File Hub ilişkileri silinmez.
- UI bağlı Gmail hesabında **Google Yetkisini Yenile**, sorun doğrulanmışsa **Yeniden Bağla** düğmesini sunar; yalnız aynı hesap ID'siyle OAuth başlatılır.
- Google `access_type=offline` + `prompt=consent` zaten mevcut. Callback `refresh_token` gelmeden eski şifreli kimlik bilgisini üzerine yazmaz, yanıltıcı başarı kaydı üretmez.
- Hangi Gmail/Google OAuth token sorunu yaşandığı canlı provider log ve kullanıcı yönlendirme sonrası kesinleşir; yetkilendirme kullanıcı ekranından yapılır, token/şifre GitHub'a veya sohbete girilmez. Gmail 15/15 kabulü hâlâ açık.

## 19.11.2026 — Google onay ekranı geçildi, KY ERP callback başarısız
- Gerçek kullanıcı ekranı: `hkndesen@gmail.com` Google hesap seçimi + izin ekranı açıldı; devam sonrası KY ERP Mail Merkezi `Hata: Mail hesabı bağlanamadı` ve `0 hesap / 0 kayıt`. Admin hesap kaydının silindiği kanıtlanmadı; mevcut `REAUTH_REQUIRED` durumu listelemeyi etkileyebilir.
- Kodda callback `APP_RETURN=.../iletisim/mail-gelen` kullanırken Mail Merkezi `mailError` gerçek kodunu okuyup genel mesajla gizliyor. Artık canonical sonuç adresi `/depolama/depolama-mail`; firma bazlı E-Posta Hesapları paneli yalnız beyaz listedeki güvenli kodu gösterir.
- Callback CODE_EXCHANGE / GOOGLE_IDENTITY / GMAIL_PROFILE / CREDENTIAL_SAVE / ACCOUNT_UPDATE aşamalarını ayırır; Google API `SERVICE_DISABLED` için açık kod, Google refresh izni yoksa ayrı kod. URL, log ve UI'da token/kişisel Google açıklaması yoktur.
- Gerçek kök neden yeni callback kodu ve kullanıcı sonucu gelmeden **kesin PASS değildir**. Ekrandaki 0 kayıt yeni e-posta gönderildiğini veya arşivin silindiğini göstermez. OAuth sonrası otomatik mail gönderimi yok.

## 19.11.2026 — Google OAuth Gmail/Drive proje sınırı ve 0 hesap salt okunur denetimi

- Kullanıcının ekranlarında Firebase/Drive ve Mail, Google Cloud üzerinde iki ayrı proje. Gmail posta kutusu hesabı, Cloud proje yönetici hesabından bağımsızdır. Bir projede Gmail API'nin etkinliği diğer projenin OAuth istemcisini doğrulamaz.
- Mevcut Gmail adapterı `GOOGLE_MAIL_CLIENT_ID || GOOGLE_DRIVE_CLIENT_ID` biçiminde Drive'a sessiz geri düşüyordu. Bu kaldırıldı: `GOOGLE_MAIL_CLIENT_ID` ve `GOOGLE_MAIL_CLIENT_SECRET` ayrı Web OAuth istemcisiyle tanımlanmalı; Drive Client ID ile eşitse bağlantı hazır sayılmaz.
- Değerler yalnız Cloudflare Worker'ın güvenli Variables and Secrets alanına kaydedilir. GitHub/Chat'e Client Secret, token, parola, mail veya müşteri bilgisi aktarılmaz. Worker'da eksikse Gmail katalogu “hazır” göstermez; mevcut Drive OAuth, Gmail hesap/credential kayıtları, posta geçmişi ve File Hub bağlantıları değiştirilmez.
- Sabit Gmail dönüş URI: `https://api.kyerp.net/api/auth/mail/oauth/google/callback`. Mail projesi OAuth Web uygulamasının Authorized redirect URIs alanında bulunmalı. Google Cloud proje kimliği seçimi ve Worker istemcisinin eşleşmesi kullanıcı Cloudflare arayüzünde doğrulanacak.
- “0 posta kutusu” sonucu, sunucunun `REAUTH_REQUIRED` durumundaki hesapları filtrelemesinden kaynaklanmıyor; veritabanı kaydının varlığını tek başına dışlamıyor. Uygulama sahibi için `GET /api/mail/accounts/diagnostics` salt okunur; aktif tenant + her Gmail tenant kapsamı için yalnız toplamları verir. Mail adresi/mesaj/secret döndürmez; başka firma hesabını otomatik taşımaz.
- Canlı kabul: Google Mail secrets ayrı yapılandırılmadan OAuth ve 15/15 senkron **PASS değildir**. Gerçek D1 kayıt teşhisi ve posta kutusu örnekleri ayrıca doğrulanacak.

## 19.11.2026 — Gmail 0/15 sayaç ilk sayfalarda sabit: kontrollü tek tık tarama
- Gerçek DESEN Gmail OAuth onaylı; ilk iki "Senkronize Et" adımında aynı `0/15 klasör, 3 mesaj işlendi` sonucu göründü. Bu tek başına senkronun takıldığı kanıtı değil: kod `GMAIL_PAGE_SIZE=3` ve `GMAIL_FOLDERS_PER_PASS=1`, bitmemiş etiketler `DONE` sayılmaz, yenilerine öncelik verir.
- Tek buton artık **en fazla 8 ardışık, ayrı, küçük Worker isteği** çalıştırır; adım, işlenen mesaj **işlem sayısı** (yeni/eşsiz mail sayısı değil), son etiket ve tamamlanan klasör sayısını gösterir. Her adım backend'in gerçek cursor'ına dayanır. Klasör hata, sıfır ilerleme, kullanıcı durdurması ve ekran terk etmede yeni istek durur.
- Worker maliyetini büyüten sayfa büyüklüğü veya yeni bir D1 şeması eklenmedi. Mail gönderme, silme, Google OAuth, Drive/Firebase veya mevcut hesap verileri değiştirilmedi. Sınırlı her turun sonunda gerekirse kullanıcı yeniden tıklar; sonsuz döngü yok.
- Kod/test/yayın sonucu ayrıca kontrol edilir; Google 15/15 canlı kabulü **bu kod değişikliğiyle kendiliğinden PASS sayılmaz**.

## 19.11.2026 — Gmail tam otomatik tarama + artımlı değişiklik takibi
- Kullanıcı canlı ekranda 2/15'in 2–3 saat boyunca değişmediğini gösterdi: gerçek sorun 5 dakika cron'unun yalnız Microsoft Graph/Drive/diğer görevleri çalıştırması, Gmail sayfalama fonksiyonuna **hiç otomatik bağlanmaması**ydı.
- Var olan `main-entry-security.scheduled` içindeki `*/5` cron'a `runGmailMailScheduledSync(env)` eklendi. İlişkili mail hesabı **APPROVED+ACTIVE+provider_connected** zorunlu; maksimum 1 hesap ve 1 × 3 mesaj sayfası/cron; D1 Workers Free 50 sorgu/sunucu çağrısı sınırını korur. OAuth secrets yenilenmesi güvenli kasada, tenant izolasyonu mevcut. Üretimde hesap/mektup silme, mail gönderme, yeni servis/ücretli cron/migration yok.
- Manuel `Senkronize Et` ve otomatik cron aynı **tek Gmail sayfa motorunu** kullanır; `GMAIL_PAGE` imleci ve önceden tamamlanan klasörler korunur. Hata olduğunda 15 dakikalık hesap bazlı bekleme; diğer firmalar bloke edilmez.
- Backfill başlamadan `/profile historyId` şeffaf D1 imleci olarak alınır; tüm Gmail klasörleri tamamlandığında `/history` (added/label changes) değişiklikleri ayrı kuyruktan işler. Sayfa tokenı, bekleyen Gmail mesaj kimlikleri bitmeden ileri alınmaz. Gmail eski history id için 404 döndürürse mesajları silmeden güvenli tam sayfa taramasını yeniden açar.
- Firma bazlı e-posta arayüzü 60 saniyede bir **salt okunur** şekilde otomatik ilerleme durumunu yeniler (yalnız ekrandayken ve tarama eksikken); en son 5dk cron zamanı, taranan etiket ve kaç mesaj işleme kaydı olduğunu gösterir. Tek tuş artık isteğe bağlı manuel hızlandırma olarak kalır.
- **Canlı kabul:** Son GitHub Actions/PR/Cloudflare Worker+Pages yayın SHA kanıtı ve gerçek HKN Gmail D1 cursor ilerlemesi görülmeden 15/15 ya da yeni gelen e-posta kanıtı PASS denmez. İşNet/e-Belge/muhasebe gerçek fatura kesimi, cari fiş, müşteri maili bu değişiklikte yok.
- Resmî referans: Google Gmail API `users.history.list` en son `historyId` ile çalışır; eski imleç 404 ise yeniden tam tarama gerekir. Cloudflare Free D1 Worker başına 50 sorgu sınırı uygulanır.

## 19.11.2026 — Gmail 2/15 görünürlük ve gerçek hata ayrımı
- Kullanıcı Gmail `hkndesen@gmail.com` yetkili hesabında birkaç saat boyunca `2/15` kaldığını, otomatik turda `0 mesaj işlendi` yazdığını canlı gösterdi. **Bu durum tam senkron PASS değildir.**
- Kanonik Gmail Worker kod incelemesi: `runGmailMailScheduledSync` 5 dakika cron'a bağlı; her turda 1 klasör/3 mesaj sınırı var. Otomatik başarısız tur, arayüzde `gmailAutoStatus` saklanmasına rağmen gösterilmiyordu. Bir sayfa hata verdiğinde `result.folders[].ok=false` olsa bile `fatal=false` olan yollarda cron `OK` olarak kayıt açabiliyordu. Ayrıca `SYNC_PENDING_PAGINATION` normal bekleme iken `sync_error_count` hatası sayılıyordu.
- Tek düzeltme: Gmail otomatik cron, sayfa/provider/kimlik doğrulama hatasını **güvenli ve sabit hata koduyla** (`GMAIL_*`) saklar; hata varsa başarılı tarama gibi göstermez. Gerçek `GMAIL_PAGE` hata kaydı ve aşaması yetkili firma mail hesabı kartında görünür. OAuth token, mail adresi, Gmail mesaj içeriği ve provider error metni dönmez. Başarı/yanlış hata ayrımı: geçerli sayfalama artık `last_error=''`; tarihî `SYNC_PENDING_PAGINATION` hata sayılmaz.
- **Gerçek Gmail veri erişimi / Cloudflare D1 canlı hata kaydı bu kod çalışma oturumunda okunmadıkça 2/15'in tek kesin nedeni belirlenmiş sayılmaz.** Mevcut şifre/Google Client/Firebase/Drive değiştirilmez; eski mail, File Hub ve D1 kayıtları korunur. Yeni masraflı cron yok, kullanıcıyı 15 kere tıklamaya yönlendirme yok.
- E-Belge, tedarikçi giderleri, cari, KDV muhasebe iş akışı ayrı; Gmail tamamlanmadı diye XML testinin başlaması engellenmez.
