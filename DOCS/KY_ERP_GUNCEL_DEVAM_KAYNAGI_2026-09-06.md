# KY ERP — GÜNCEL DEVAM + YAPILAN İŞLER ANA KAYNAĞI

## 20.11.2026 — İşNet tek yerel Drive arşivinin son kullanıcı yönlendirmesi
- DESEN'de aynı amaç için oluşmuş iki yerel İşNet arşiv klasörü tespit edildi. **Tek kalıcı kaynak:** Google Drive'ın zaten eşitlediği `Hakan Emp/KY-ISNET-BELGELER`. Diğer geçici `Firma Yedekleri/ISNET_EBELGE` klasörü tamamen boş olduğu doğrulanıp kaldırıldı; yalnız bizim 8790 yerel süreç/görev/deneme çalışma kopyası kapatıldı. Mevcut 8791 uygulamasına ve eski dosyalara müdahale edilmedi.
- Gerçek Windows `http://127.0.0.1:8791/` HTTP 200; Drive bağlı hesapta `KY-ISNET-BELGELER` klasörü doğrulandı. Mevcut yerel program dört yönde XML/PDF arşivi ve SHA-256 mükerrer koruması içerir; **gerçek fatura/irsaliye indirme bu sohbetin son kontrolünde henüz yapılmadı**, boş arşive sahte PASS yazılmaz.
- KY ERP e-Belge → Entegrasyonlar → İşNet günlük ana ekranı **yalnız mevcut 8791 yerel Drive arşivine** açılır. Eski bulut üzerinden portal şifresi tekrar deneme + R2'ye fiziksel ikinci orijinal yükleme akışı varsayılan kullanımdan çıkarıldı.
- **File Hub `E_DOCUMENT` bağlantısı ve D1 canonical belge kaydı henüz canlı doğrulanmadı:** Drive'daki dosya fiziksel orijinaldir, D1'deki muhasebe kaydı değildir. Metadata/UUID/hash ile provider referansı kurulduktan sonra belge/kalem/KDV/irsaliye eşleştirme mevcut canonical motorla yapılacaktır. Bu aşamaya kadar ERP havuzuna otomatik aktarıldı denmez; fatura gönderimi veya kesin mali kayıt yok.


## 19.11.2026 — Günlük Operasyon son kabul / kişi ödeme kartı
- Güncel canonical production HEAD üzerinde yalnız Günlük Operasyon kaynakları taşındı; paralel Gmail/mail değişiklikleri korunuyor.
- 14–22 gibi firma-geneli ortak haftayı D1 CAS sürümü korur. “Bu Hafta” kendiliğinden seçilmez; ilk kez `Bu Dönemi Sabitle` ile kullanıcı onayı gerekir.
- Hızlı Giriş Personel Ekle sağ genişletilebilir panel + son 7/14 gündeki havuz dışı sık kullanılanlar. Toplu ekleme sadece havuza kaydeder, çalışma/ödeme değildir.
- Personel kartındaki D1 çalışan/ödeme geçmişine aylık gündüz/gece, net hakediş ve fiilen yapılmış teyitli ödeme sütunları eklendi; ödeme tarihi ve çalışma tarihi karışmaz, iptal/legacy ayrı.
- D1 canlı kayıtları üzerinde yazma/silme yok. Sonraki Supi ismi düzenlemesi ayrı aşama.


## 19.11.2026 — Gmail 2/15 görünürlük ve gerçek hata ayrımı
- Kullanıcı Gmail `hkndesen@gmail.com` yetkili hesabında birkaç saat boyunca `2/15` kaldığını, otomatik turda `0 mesaj işlendi` yazdığını canlı gösterdi. **Bu durum tam senkron PASS değildir.**
- Kanonik Gmail Worker kod incelemesi: `runGmailMailScheduledSync` 5 dakika cron'a bağlı; her turda 1 klasör/3 mesaj sınırı var. Otomatik başarısız tur, arayüzde `gmailAutoStatus` saklanmasına rağmen gösterilmiyordu. Bir sayfa hata verdiğinde `result.folders[].ok=false` olsa bile `fatal=false` olan yollarda cron `OK` olarak kayıt açabiliyordu. Ayrıca `SYNC_PENDING_PAGINATION` normal bekleme iken `sync_error_count` hatası sayılıyordu.
- Tek düzeltme: Gmail otomatik cron, sayfa/provider/kimlik doğrulama hatasını **güvenli ve sabit hata koduyla** (`GMAIL_*`) saklar; hata varsa başarılı tarama gibi göstermez. Gerçek `GMAIL_PAGE` hata kaydı ve aşaması yetkili firma mail hesabı kartında görünür. OAuth token, mail adresi, Gmail mesaj içeriği ve provider error metni dönmez. Başarı/yanlış hata ayrımı: geçerli sayfalama artık `last_error=''`; tarihî `SYNC_PENDING_PAGINATION` hata sayılmaz.
- **Gerçek Gmail veri erişimi / Cloudflare D1 canlı hata kaydı bu kod çalışma oturumunda okunmadıkça 2/15'in tek kesin nedeni belirlenmiş sayılmaz.** Mevcut şifre/Google Client/Firebase/Drive değiştirilmez; eski mail, File Hub ve D1 kayıtları korunur. Yeni masraflı cron yok, kullanıcıyı 15 kere tıklamaya yönlendirme yok.
- E-Belge, tedarikçi giderleri, cari, KDV muhasebe iş akışı ayrı; Gmail tamamlanmadı diye XML testinin başlaması engellenmez.

## 19.11.2026 — Gmail tam otomatik tarama + artımlı değişiklik takibi
- Kullanıcı canlı ekranda 2/15'in 2–3 saat boyunca değişmediğini gösterdi: gerçek sorun 5 dakika cron'unun yalnız Microsoft Graph/Drive/diğer görevleri çalıştırması, Gmail sayfalama fonksiyonuna **hiç otomatik bağlanmaması**ydı.
- Var olan `main-entry-security.scheduled` içindeki `*/5` cron'a `runGmailMailScheduledSync(env)` eklendi. İlişkili mail hesabı **APPROVED+ACTIVE+provider_connected** zorunlu; maksimum 1 hesap ve 1 × 3 mesaj sayfası/cron; D1 Workers Free 50 sorgu/sunucu çağrısı sınırını korur. OAuth secrets yenilenmesi güvenli kasada, tenant izolasyonu mevcut. Üretimde hesap/mektup silme, mail gönderme, yeni servis/ücretli cron/migration yok.
- Manuel `Senkronize Et` ve otomatik cron aynı **tek Gmail sayfa motorunu** kullanır; `GMAIL_PAGE` imleci ve önceden tamamlanan klasörler korunur. Hata olduğunda 15 dakikalık hesap bazlı bekleme; diğer firmalar bloke edilmez.
- Backfill başlamadan `/profile historyId` şeffaf D1 imleci olarak alınır; tüm Gmail klasörleri tamamlandığında `/history` (added/label changes) değişiklikleri ayrı kuyruktan işler. Sayfa tokenı, bekleyen Gmail mesaj kimlikleri bitmeden ileri alınmaz. Gmail eski history id için 404 döndürürse mesajları silmeden güvenli tam sayfa taramasını yeniden açar.
- Firma bazlı e-posta arayüzü 60 saniyede bir **salt okunur** şekilde otomatik ilerleme durumunu yeniler (yalnız ekrandayken ve tarama eksikken); en son 5dk cron zamanı, taranan etiket ve kaç mesaj işleme kaydı olduğunu gösterir. Tek tuş artık isteğe bağlı manuel hızlandırma olarak kalır.
- **Canlı kabul:** Son GitHub Actions/PR/Cloudflare Worker+Pages yayın SHA kanıtı ve gerçek HKN Gmail D1 cursor ilerlemesi görülmeden 15/15 ya da yeni gelen e-posta kanıtı PASS denmez. İşNet/e-Belge/muhasebe gerçek fatura kesimi, cari fiş, müşteri maili bu değişiklikte yok.
- Resmî referans: Google Gmail API `users.history.list` en son `historyId` ile çalışır; eski imleç 404 ise yeniden tam tarama gerekir. Cloudflare Free D1 Worker başına 50 sorgu sınırı uygulanır.


## 19.11.2026 — Günlük Personel Girişi acil tasarım geri alma
- Kullanıcı tek ekran akıllı paneli reddetti. PR #610'un ana ekran değişiklikleri geri alınacak; **önceki ana ekran ve Hızlı Giriş penceresi aynen kalacak**. Yeni seçici yalnız Hızlı Giriş > Personel Ekle alanında yer alacak.
- Çoklu personel işaretle/tek tuşla havuza ekle; tek silmesiz `mode:merge` D1 çağrısı ve eksiksiz kişi doğrulaması. Sık kullanılanlar mevcut gerçek dönem çalışma kayıtlarından; seçim tek başına vardiya/ücret/ödeme değiştirmez.
- Canonical üretim D1'de hiçbir personel/ödeme kaydı değiştirilmez; son PR ve canlı asset kanıtından önce yayın tamamlandı denmez.


## 19.11.2026 — Gmail 0/15 sayaç ilk sayfalarda sabit: kontrollü tek tık tarama
- Gerçek DESEN Gmail OAuth onaylı; ilk iki "Senkronize Et" adımında aynı `0/15 klasör, 3 mesaj işlendi` sonucu göründü. Bu tek başına senkronun takıldığı kanıtı değil: kod `GMAIL_PAGE_SIZE=3` ve `GMAIL_FOLDERS_PER_PASS=1`, bitmemiş etiketler `DONE` sayılmaz, yenilerine öncelik verir.
- Tek buton artık **en fazla 8 ardışık, ayrı, küçük Worker isteği** çalıştırır; adım, işlenen mesaj **işlem sayısı** (yeni/eşsiz mail sayısı değil), son etiket ve tamamlanan klasör sayısını gösterir. Her adım backend'in gerçek cursor'ına dayanır. Klasör hata, sıfır ilerleme, kullanıcı durdurması ve ekran terk etmede yeni istek durur.
- Worker maliyetini büyüten sayfa büyüklüğü veya yeni bir D1 şeması eklenmedi. Mail gönderme, silme, Google OAuth, Drive/Firebase veya mevcut hesap verileri değiştirilmedi. Sınırlı her turun sonunda gerekirse kullanıcı yeniden tıklar; sonsuz döngü yok.
- Kod/test/yayın sonucu ayrıca kontrol edilir; Google 15/15 canlı kabulü **bu kod değişikliğiyle kendiliğinden PASS sayılmaz**.


## 19.11.2026 — Günlük Operasyon havuz/ücret/çıktı tek canonical uygulaması
- Güncel production tabanından açılmış dal: `fix/gunluk-tek-kaynak-canli-kabul-20261119`. Yalnız mevcut günlük operasyon frontend/Worker, tarihli ücret çekirdeği ve sözleşme testleri güncellendi; paralel sekme/havuz/hakediş sistemi eklenmedi.
- Havuza Ekle tek D1 yazma+okuma doğrulaması, Günlük Kaydet gün/vardiya; roster üyeliği ile vardiya ücretli çalışması ayrı. Yalnız hedef kişi çıkarma, başka PC kaydını sessiz silmeme.
- Eski ödenmiş ücret snapshot'ı korunur; açık ve yeni vardiyada geçerlilik tarihli ücret kullanılır. D1 tek para kaynağı; gündüz/gece/baz/ek/kesinti/net mutabakatı olmadan fiş/Excel/haftalık A4 basılmaz.
- Tam gerçek CI, güvenli PR birleşmesi, Cloudflare Pages/Worker production commit kanıtı ve gerçek iki PC yenileme/kayıt kabulü ayrı doğrulanır. Üretim D1 değişmedi.


## 19.11.2026 — Gmail OAuth projesi Drive'dan ayrıldı, 0 hesap teşhisi eklendi
- Gmail ayrı `GOOGLE_MAIL_CLIENT_ID` / `GOOGLE_MAIL_CLIENT_SECRET` olmadan Drive OAuth istemcisine otomatik geri düşmez; mevcut Drive / Firebase kimlik bilgileri korunur. Mail projesine ait ayrı Web OAuth istemcisi Cloudflare'da doğrulanmalıdır.
- “0 posta kutusu” görünmesi hesap silinmesi kanıtı değildir. Yetkili uygulama sahibi için firma kapsamındaki kayıt sayılarını ve diğer Gmail firma kapsamlarını okuyacak salt okunur denetim eklendi; otomatik hesap oluşturma/taşıma/silme yok.
- Belge: [KY_ERP_GMAIL_TAM_SENKRON_20261119.md](KY_ERP_GMAIL_TAM_SENKRON_20261119.md). Test, canonical merge, Cloudflare deploy, secrets eşleşmesi, gerçek OAuth ve 15/15 senkron ayrı kabul edilir.


## 19.11.2026 — Gmail gerçek kullanıcı ekranı: 0/15 klasör; sayfalı ilk arşiv senkron düzeltmesi
- Firma bazlı E-Posta Yönetim Merkezi (PR #599) gerçek tarayıcıda açıldı; 4 sekmeli tasarım ve DESEN Gmail kartı kontrol edildi. Onay/OAuth/provider hazır, fakat **0/15 klasör**, **0 hazır hesap**: Gmail arşivi kabulü henüz PASS değil.
- İlk 100 Gelen/Sent sınırının 15 Gmail etiketini tamamlaması mümkün değildi. Mevcut OAuth ve Mail Core korunarak `GMAIL_PAGE` ile kademeli sayfalama, gerçek klasör tamamlanma sayacı, çok etiketli mesajı bir defa konumlama ve tekrar senkronizasyonda File Hub ek kanıtını koruma üzerinde çalışıldı.
- Kaynak ve canlı sınırlar: [KY_ERP_GMAIL_TAM_SENKRON_20261119.md](KY_ERP_GMAIL_TAM_SENKRON_20261119.md). Kod/CI/yayın kanıtı ile gerçek Gmail 15/15 kullanıcı testi ayrı işaretlenecektir.


## 19.11.2026 — E-Posta Hesapları: bütün firmalara ortak dinamik yönetim ekranı / geliştirme
- Kullanıcının canlı KY ERP ekranındaki Hakan'a özel sabit mail kartları kaldırılarak tek firma bazlı hesap yönetim ekranına geçildi: Posta Kutuları, Hesap Ekle, Onaylar, Sağlayıcı Durumu. Mevcut hesaplar ve posta kayıtları silinmez.
- API'ye tenant bazlı hesap profili ve varsayılan gönder/al endpointleri eklendi; seçili firma slug'ı arayüzden okunur, yetkili sunucu tekrar kontrol eder. Hesap/OAuth/sağlayıcı sağlığı ayrı tutulur.
- Kod ve kabul sözleşmesi: [KY_ERP_MAIL_FIRMA_BAZLI_YONETIM_20261119.md](KY_ERP_MAIL_FIRMA_BAZLI_YONETIM_20261119.md). CI, merge, Cloudflare yayın ve gerçek Hotmail OAuth/Gmail 15 klasör kabulü ayrı doğrulanacaktır.


## 19.11.2026 — Outlook tek canonical revizyon / geliştirme PR (CI ve canlı kabul bekliyor)
- Bir HKN/çoklu DDM → tek posta, geriye dönük eski gönderim kilidi, Model 360 ortak kart, hash doğrulamalı eski Outlook kanıtı, adil Graph cron ve klasör bazlı tam senkron, yarış-korumalı provider taslağı.
- Mevcut mail D1/Graph/File Hub korunur; yeni depo/servis/secret veya gerçek mail/mali kayıt oluşturulmaz.
- İş kanıtı: `DOCS/KY_ERP_OUTLOOK_TEK_CANONICAL_REV_20261119.md`. Test, merge, deploy ve gerçek OAuth kullanıcı kabulü ayrıca doğrulanacaktır.


## 19.11.2026 — Hotmail/Outlook + Model 360 · PR #597 / canlı OAuth kabulü açık
- **Kod:** mevcut Microsoft Graph/mail altyapısında sayfa kaybetmeyen `nextLink` / `deltaLink` cursor, idempotent gerçek Outlook taslağı, sınırlı cron takibi, tek HKN mailinin iki PDF ile doğrulanan çoklu modellere bağlanması, eski Outlook sent HKN/DDM kanıtı ve hesap sağlık göstergeleri.
- **Test:** PR #597 head `9e81639b25e2726c24f3ae85333d03646679488c`; Frontend lint/test/build ve Worker typecheck/test/build PASS (Actions #44469401143). İlk Worker build eksik export nedeniyle FAIL idi, düzeltildi.
- **Canlı kabul:** Hotmail OAuth, gerçek posta kutusu senkronizasyonu, gönderim veya teslim **PASS değildir**. PR/Cloudflare merge+deploy kanıtı ayrıca izlenir. İşNet/Google Drive bağlantılarına ve canlı mali kayıtlara dokunulmadı.
- **Yeni sohbet devir kaynağı:** [KY_ERP_HOTMAIL_OUTLOOK_EBELGE_DEVIR_20261119.md](KY_ERP_HOTMAIL_OUTLOOK_EBELGE_DEVIR_20261119.md). Açık P2: gerçek kullanıcı OAuth, toplu gerçek XML-model satır kabulü, bir HKN/çok DDM, eski manuel Outlook arşivi, fiyat/teklif inceleme.



## 18.11.2026 — Ortak Model 360 kartı · Tüm departmanlar · Adet ve belge kontrolü (açık geliştirme)
- **Kullanıcı kararı:** Tek canonical model kimliği, DESEN / İmalat / Boyahane / Muhasebe / e-Belge / Mail için **tek ortak modal**. Her departman yalnız kendi yetkili verisini görür/girer. Modüller arasında gidip gelmek gerekmez. Model görseli gerçek DESEN/File Hub kaynağıdır; görsel bulunamıyorsa uydurulmaz, açık eksik uyarısı verilir.
- **Belge kardinalitesi:** Bir HKN birden fazla modeli, bir DDM birden fazla modeli, bir model birden fazla HKN/DDM'yi içerebilir. Fiziksel HKN/DDM belge kaydı ve XML/PDF tektir. Modelin miktarı sadece canonical model kimliğine bağlı **belge kalemi** üzerinden sayılır; belge başlık toplamı her modele tekrar dağıtılmaz, model adı benzerliği otomatik kesin eşleşme değildir.
- **Ayrı adet kaynakları:** Müşteriden gelen irsaliye / plan, üretim brüt, baskı-kumaş hatası/test, net sağlam üretim, giden DDM sevk ve HKN fatura kalemleri ayrı kalır. Giden DDM kalem tahsisi kesinleşmediyse hayali sevk adedi yazılmaz. Her HKN için ayrı Outlook mail + ayrı gönderim kaydı kararı korunur.
- **Bu iş dalında kodlanan ilk etap:** Mevcut `Model360Modal` korunarak **Adet & Belge Kontrolü** sekmesi, doğrulanmış kalem/üretim farkı uyarıları, aynı belge satırını iki kez saymama, model görselinin gerçek alternatif önizlemeleri, yetkili Boyahane iş-notu düzenlemesi ve sözleşme testleri eklendi.
- **Kalanlar ve kabul:** Boyahane reçete/lot/gramajın aynı modalda yazımı, çok modelli HKN/DDM satır eşleşmelerinin doğrulanması, tüm modül giriş noktalarının eksiksiz olması, görsel gerçek File Hub kabulü, imalat ve mail gerçek kayıt testleri, güvenli yayın ve gerçek Windows/UI kabulü ayrı aşamalardır. **Dalda kodlanmış olmak canlıda tamamlandı demek değildir.** Gerçek ticari veri, stok ve müşteri mailleri değiştirilmedi.


> **18.11.2026 — Model 360:** [Tüm departmanların tek ortak modeli, çoklu belge/imalat/mail kuralı](KY_MODEL_360_ORTAK_KART_20261118.md). P1 uygulama ve P2 açık işler ayrıdır; canlı kabul sonucu ayrı doğrulanır.

## 17.11.2026 — Muhasebe e-Belge ile bağımsız Fatura Mail & Haftalık HKN Takibi
- Kullanıcı kararı: Satış & Müşteri'deki gömülü PDF mail ekranı çıkarılır; Muhasebe → Belge Akışı → **Fatura Mail & Mutabakat** ayrı bir ana sekmedir. İçinde beş görünüm vardır: **PDF Mail Gönderimi / Haftalık Excel & Kontrol / Ödemeye Alınanlar / Ödemeye Alınmayanlar / Eksik-Fazla & İtiraz**. Giden e-Belge ve satış belgelerinden bu merkez açılır.
- Tek kaynak: HKN giden canonical `accounting_documents` + mevcut File Hub ve Outlook Graph sender. Cari/ödeme/banka/KDV için yeni paralel kesin kayıt açılmaz. İşNet'in resmî gönderiminden bağımsız müşteri PDF mailidir.
- Müşterinin haftalık XLS/XLSX/CSV'si seçilen firma ve kesin HKN numarasıyla karşılaştırılır. Excel'de var = **müşterinin listesine girmiş**; gerçek tahsilat/ödeme kanıtı **değildir**. Excel henüz yoksa `AWAITING_EXCEL`; yanlış/tekrarlı HKN `REVIEW_REQUIRED`. Manuel dahil/hariç/inceleme kararı kullanıcı/tarih geçmişiyle `json_store` içinde tutulur; otomatik kesin mali kayıt olmaz.
- Excel'in orijinal byte'ları bu akışta saklanmaz; dosya adı, tarih, hash ve okunan HKN kimlikleri tutulur. Gelen Excel indirilip kullanıcı tarafından seçilir; Outlook ekinden otomatik aktarım **henüz yok**. Eksik/fazla cevapları önce taslaktır; gerçek gönderim ayrıca yetkili kullanıcı onayı ve sağlayıcı kabulü ister.
- Kod: [PR #589](https://github.com/cetin60kaya-lgtm/ky-erp/pull/589) (bağımsız merkez, filtreler, sunucu kanıtı, müşteri / e-Belge yönlendirmeleri). Kaynak kabulünde frontend ve Worker test/build ayrı; **gerçek müşteri Excel'i, Outlook Graph mail gönderimi, PDF ve banka eşleştirmesi canlı kabul bekler.** Açık PR veya merge, tek başına canlı yayın değildir.


## 16.11.2026 — e-Belge dört kurumsal liste ve gelen fatura muhasebe tek çıktısı

- **İş akışı kararı:** İşNet benzeri ilk seviye dört görünüm: **Gelen Faturalar / Gelen İrsaliyeler / Giden İrsaliyeler / Giden Faturalar**. Tek canonical `accounting_documents` kayıt kaynağı ve mevcut `INCOMING_INVOICE / INCOMING_DISPATCH / OUTGOING_DISPATCH / OUTGOING_INVOICE` sunucu filtreleri kullanılır; ikinci bir fatura/irsaliye tablosu oluşturulmaz. Eski URL/sekme bağları mümkün olduğu kadar korunur; Belge Havuzu, Görsel Şablonlar, Entegrasyonlar, eşleştirmeler ve File Hub ayrı araç alanıdır. Giden belgede Outlook taslakları alanına geçiş sunulur; **taslak açma/gönderme otomatik yapılmaz**.
- **Gelen tedarikçi faturası için tek muhasebe çıktısı:** Muhasebe çıktı durumu `PENDING/PRINTED` ve tarih/kullanıcı/gerekçeli geri alma geçmişi firma + belge ID temelli `json_store(scope=EBELGE_ACCOUNTING_PRINT_V1)` içinde tutulur; çıkışı alınan faturaya eşlik eden irsaliyeye ikinci mecburi muhasebe çıktısı kaydı açılmaz. PDF görüntüleme veya yazdır penceresi **tek başına basıldı onayı vermez**. Muhasebeci gerçek kağıdı aldığında açıkça `Çıktı Alındı` der. Gelen fatura listesinde filtre ve çıktı sütunu vardır; değişiklik ayrı kanonik muhasebe/EDI/sending kaydı oluşturmaz.
- **PDF kaynağı:** Belgeye bağlı orijinal PDF bulunursa açılır. Yoksa orijinal XML doğrulanır, aynı düzenleyenin onaylı `INVOICE` görsel profilinden yeniden PDF üretilir; başka firmanın profili veya örnek fatura verisi kopyalanmaz. PDF birebir XSLT 2.0 garantisi verilmez ve görsel kabul ayrı tutulur.
- **API güvenliği:** Yetkili kullanıcı ve tenant çapraz erişimi engellenir; sadece `INCOMING` fatura ve silinmemiş belge için çıktı kaydı değişir; `RESET_PENDING` gerekçelidir; kayıtların ana mali fiş/KDV/cari/stok/maliyet alanlarına etkisi yoktur. D1 schema migration yapılmaz; mevcut json_store altyapısı kullanılır. Gerçek e-posta/fatura/irsaliye gönderimi ve mevcut kayıtların taşınması/silinmesi yok.
- **GitHub Actions:** Kullanıcı önce limit=0 belirtmiş, 16.11'de tekrar aktif olduğunu ve **gerektiğinde dikkatli kullanmamızı** söylemiştir. Öncelik X Windows üzerinde hedefli QA; bir PR için gereksiz push/workflow tekrarı yapılmaz. Merge SHA ve Cloudflare Pages+Worker prod deploy/ci/live-smoke kanıtları ayrı kaydedilmelidir.

## 15.11.2026 — İK Aylık manuel banka ve tek seferlik maaş kontrolü (PR #585)

- **Kullanıcı kararı:** Muhasebecinin XLS/XLSX/ZIP bordro dosyası maaş hazırlamak için zorunlu değildir. İK Aylık → Bordro & Ödeme → Bu Ayın Maaşlarını Hazırla, seçili KY ERP / Hakan Emprime bordro kapsamındaki personeli sıra ile getirir. Maaş, yol, sabit EK, mesai, avans, kesinti, icra/haciz sistemden gelir; kullanıcının o ay için **elle girdiği banka tutarı** temel alınır, elden kalanı **net − banka** hesaplanır. Banka ve elden tutarı birlikte ayrı ayrı girilmez; girilen banka neti aşıyorsa sessiz kısma yok, hata vardır.
- **SGK:** SGK dışındaki personelde banka sıfır/elden net kurum içi planlama kuralıdır. SGK Excel yüklüyse resmî net yalnız isteğe bağlı kontrol/öneridir; SGK import yok diye maaş hazırlama engellenmez. Bu ödeme planı gerçek banka transferini otomatik yapılmış (PAID) saymaz; nakit dahil tüm ücretler yasal muhasebe ve SGK yükümlülükleriyle mutabık olmalıdır.
- **UI:** Yeni sekme açılmaz. Maaş hazırlama ilk tıklamada dönem hazır değilse canonical sunucudan hazırlar, yüklenen veriden sonra personel kontrolünü açar. Banka ilk giriş alanıdır, elden otomatik/readonly, diğer kalemler açılır ayrıntıda; kaydedilen personel sol listede işaretlenir. Kalıcı personel kartı yalnız ayrı yetkili işlemle değişir.
- **Ay kilidi:** Üretilmiş CALCULATED bordro satırının varlığı tek başına insan kontrolü değildir. Dönem kilidi için kişi bazında FINAL_CONTROL günlüğü (veya tarihsel PAID) ve kaynak değişikliği bulunmaması doğrulanır. Eksikse 409 ile kilit engellenir. Geçmiş PAID ve kilitli aylar otomatik değiştirilmez.
- **Kod/Test:** [PR #585](https://github.com/cetin60kaya-lgtm/ky-erp/pull/585) frontend manuel banka hesaplama + testleri ve Worker ay-kapanış kontrolü. Production D1/şema/migration, gerçek ücret/personel verisi değiştirilmedi. Nihai CI, merge, Cloudflare Pages/Worker ve yetkili gerçek bordro–fiş kabulü **ayrı kanıtlanmalıdır**.


## 15.11.2026 — İşNet/NetteFatura girişini Chrome'a taşıyan kullanıcı tercihi (belge testi, API girişi değil)

- **Kullanıcı doğrulaması:** NetteFatura'ya aynı Windows/Chrome oturumunda firma seçili olarak doğrudan giriş yapılabildi. KY ERP Worker üzerinden portal kontrolü `TIMEOUT`, API giriş çağrısı `401 Unauthorized`; bu sonuçlar aynı hata değildir. Chrome'daki başarılı portal girişi İşNet API yetkisini kanıtlamaz.
- **İstenen yöntem:** e-Belge → Entegrasyonlar → İşNet → Bağlantı ve İş Kuralları seçeneği `Chrome · NetteFatura sitesinde giriş` (yerel tarayıcı tercihi) ve isteğe bağlı ayrı `Resmî İşNet API` olarak ayrıldı. Eskiden tarayıcıda tutulan `portal` tercihi Chrome'a göçer; yeni kullanıcı varsayılanı Chrome'dur. Chrome modunda kullanıcı adı, şifre, API/portal sunucu testi ve firma yeniden kaydı istenmez; `https://nettefatura.isnet.net.tr/` yeni sekmede `noopener,noreferrer` ile açılır. Mevcut D1 firma ve API ayarları değişmez.
- **Belge Test Merkezi:** Chrome modunda İşNet'e Worker üzerinden `Listeyi Test Et` yapılmaz. Kullanıcı portalda kendi oturumuyla XML/PDF indirir ve KY ERP'deki yerel dosya seçiciden belgeyi açar. UBL-TR ayrıştırma, seçilen fatura/irsaliye türünün doğrulanması, kontrol PDF'si ve onaylı düzenleyen-firma şablonu mevcut tarayıcı akışından yürür. Fatura/irsaliye gönderme, D1/mali kayıt, Drive'a otomatik dosya aktarımı yapılmaz.
- **Açık teknik sınır:** `kyerp.net`, `nettefatura.isnet.net.tr` sitesinin Chrome oturum çerezlerine/DOM'una çapraz kaynak güvenliği nedeniyle erişemez. Yeni Chrome sekmesi açmak **otomatik XML/PDF senkronizasyonu değildir**. Sonradan otomatik aktarım istenirse yalnız resmi API veya ayrıca izinli ve kabul edilmiş yerel Chrome eklentisi/ajanı mümkün; bu PR böyle bir eklenti, yeni kurulum, token veya Chrome otomasyon yetkisi üretmez. Güvenlik sınırını dolanma yok.
- **Kabul:** Frontend test/lint/build ve Cloudflare Pages aynı değişiklik commit'inin yayın durumu ayrı kontrol edilir; mevcut API 401 engeli çözülmüş sayılmaz. Gerçek bir müşteri XML/PDF'siyle açma ve şablon karşılaştırma kullanıcı onayıyla test edilmeli. Şifre, cookie veya özel müşteri belgeleri GitHub'a gönderilmez.

## 15.11.2026 — Model Kartı tek dosya merkezi + File Hub arşiv yolu, e-Belge fatura/irsaliye (bu dal)

- **Kullanıcı kararı:** Bir model tıklanınca ilk sekme **Tüm Dosyalar** olur; Desen/PSD/model görseli/yerleşim ve **gelen-giden e-Fatura ile gelen-giden e-İrsaliye** tek panelden açılır. Gelen irsaliyeye bağlı giden irsaliye/fatura veya faturayla ilişkilendirilmiş karşı belgeler de gösterilir; fatura ve irsaliye ayrı resmî belge/ETTN ve ayrı XML+PDF dosyasıdır. Bir belge 2–3 veya 20 modele bağlanabilir, aynı belge/dosya kopyalanmaz.
- **Veri sözleşmesi:** Canonical `accounting_documents` + `accounting_document_relations` + `file_hub_assets/locations/relations` ve mevcut `model_records` kullanılır. Kullanıcının belge numarasıyla eşleştirmesi `json_store(scope=EBELGE_MODEL_DOCUMENT_LINK_V1)` içine tenant + modelId + documentId kapsamıyla tek ilişki olarak yazılır; mevcut mali/posta kayıtları, eski XML/PDF ve resmî durum değiştirilmez. Giden belge satırlarından doğrulanmış `raw_metadata.modelIds` ve doğrudan File Hub MODEL/DOCUMENT ilişkileri de okunur. Belge–model firma çelişkisi reddedilir. Sadece yetkili muhasebe/e-Belge + model kartı kullanıcıları belgeleri okuyup eşleştirebilir. Çift eşleştirme idempotent; model kaynak dosyasıyla e-Belge kopyalanmaz.
- **Yeni arşiv hedefi:** Mevcut **File Hub MUHASEBE / INVOICE veya DELIVERY_NOTE** Drive ataması üstünden yeni arşiv işlemlerinde `<root>/<yıl>/<karşı-firma>/<GELEN|GIDEN>/<FATURA|IRSALIYE>/<belge-no> [model1 - model2 - model3].xml|pdf`. Çok model tam listesi ERP ilişkilerinde; dosya adında ilk 3 + kalan model sayısı. Windows geçersiz karakterler temizlenir. Eşleşmemiş/kararsız model isimleri dosyaya uydurulmaz. Google Drive CLOUD_API arşivde `noOverwrite` korunur; mevcut dosyalar taşınmaz/silinmez/yeniden adlandırılmaz. AGENT mevcut File Hub ajanı dışında yeni Windows izleme sistemi kurulmaz; başka depolama provider'ının mevcut davranışı korunur.
- **UI:** `Desen → Modeller → Model Detay → Tüm Dosyalar` ilk açılan sekme. Üstte dört belge türü tarih/firma/no filtreleri, her dosyada XML/PDF indirme veya arşiv bekliyor uyarısı; altta teknik model dosyaları ve mevcut Drive klasörü aracı. `Belge Ara` ile tek resmî belgeyi aynı anda birden çok doğrulanmış modele bağlama; kötü firma eşleşmesini sunucu reddeder.
- **Kalan gerçek kabul:** PR CI ve Cloudflare Pages+Worker aynı merge SHA yayın kanıtı; canlı yetkili oturumdan gerçek model kartı/belge ilişki ve Google Drive File Hub bağlantı/klasör yazma testleri. Hazırda gerçek belge/model kaydı otomatik kitlesel ilişkilendirilmez; kullanıcı eylemi ve güvenli doğrulama olmadan üretim D1 veya Drive'daki dosyalar değiştirilmez. PDF onaylı firma şablonundan üretildiyse yeni PDF'nin resmî belgeyle birebir görünümü ayrıca gözle karşılaştırılır; eksik PDF varsa açıkça bekliyor.
- **Güvenlik:** Cross-tenant, cross-company, izinsiz GET/POST, silme/taşıma, dosya kopyası veya gönderim yok. Müşteri XML/PDF, anahtar, giriş şifresi repo/sohbete taşınmaz. Mevcut File Hub kaynak ve Google Drive bağları korunur.

## 15.11.2026 — e-Belge Görsel Şablonlar tek merkez, firma XML + PDF örnek eşleştirme (#580 geliştirmesi)

- **Karar:** Görsel şablon asıl yönetim yeri **e-Belge → Görsel Şablonlar**. Belge Havuzu ve Entegrasyonlar → Belge Test Merkezi yalnız bu ortak kayıtla ilgili sayfaya gider; firma kartına ayrı kopya/şablon DB'si oluşturulmaz. Şablon anahtarı seçili tenant + **belgeyi düzenleyen VKN/TCKN + belge türü (INVOICE/DISPATCH)**. Bir firmanın faturasına başka firmanın irsaliye tasarımı uygulanmaz. İlerde aynı düzenleyen için farklı profil senaryoları (e-Arşiv/e-Fatura, alt tür) gerekirse ayrı geçerli anahtarla genişletilir.
- **Kod kaynağı:** Mevcut VisualProfileStudio, e-belge-visual-profile-routes/core, visualUblOutput ve private R2 XML+referans servisi #577 ile zaten mevcut. Revizyonda kayıtlı şablon listesi, saklı **aynı örnek XML'i ve referans PDF'yi yetkiyle yeniden açma**, font/başlık/mesafe/tablo/QR/toplam alan ince ayarları, PDF metin koordinatından **yaklaşık ilk ölçü önerisi**, yan yana görsel önizleme + önceki onayı düşürüp yeniden kabul akışı birleştiriliyor. Sonraki başka XML PDF çıktısı *yalnız aynı tenant + issuer + tür için onaylı profil* kullanır; eski XML numarası/tutarı/QR yeni belgelere kopyalanmaz. Tek PDF'den tam piksel/üretici XSLT sadakati otomatik garanti edilemez.
- **Güvenlik:** XML asıl kaynak. Örnek XML ve PDF private R2; firma kartı veya test merkezinde kopya arşiv yok. Yetkisiz tenant sample download engellenir; Cache-Control private/no-store. Şablon onayı gerçek görsel kabulü gerektirir. Müşteri e-postası, resmî gönderim, muhasebe/KDV, D1 migration ve gizli müşteri dokümanını GitHub'a aktarma yok.
- **X PC:** X online, Windows Git/Node/npm mevcut. `D:\KYERP-GITHUB\KY-ERP-CLEAN` doğru origin ve clean; canonical production branch'i **234 commit geride**. Yerel çalışma ağacına reset/pull/switch yapılmadı; yeni kurulum veya ikinci kalıcı kopya istenmedi. Güvenli test yalnız geçici/izole QA veya mevcut bağımsız test imkânıyla yapılmalı.
- **GitHub:** Mevcut [PR #580](https://github.com/cetin60kaya-lgtm/ky-erp/pull/580) içinden devam; ek PR/çoklu Actions üretme. İlk PR testlerinde 443 URL normalizasyonu CI testi başarısız; bunun düzeltilmiş profil ve şablon işi **tek toplu commit** ile aynı PR'ye eklenir, sonuçlar ayrıca doğrulanır. Canlı Pages/Worker deploy commit ancestry ve gerçek XML+PDF görsel karşılaştırması olmadan PASS denmez.

## 15.11.2026 — e-Belge açılır entegrasyon seçimi, İşNet kayıtlı firma ve XML okuma testi (PR #578)

- **Ekran:** Sol taraftaki uzun adaptör listesi ve sürekli katalog, üstte **Firma Entegrasyonları** seçici + **Entegrasyon Ekle** açılır katalog ile değiştirildi. Ana İşNet ayar alanı tam genişlikte; seçilmemiş sağlayıcılar açık alanda görünmez. Bağlayıcısı olmayan Logo/Mikro/Paraşüt için sahte servis URL/şifre ekranı yok. İşNet API adresi salt bilgi olarak, sağlayıcı doğrulama ayarı İşNet ekranında.
- **Firma ve oturum durumu:** Gerçek kullanıcı Chrome gözleminde portal girişinden sonra firma seçim/kayıt başarı bildirimi ve kayıtlı şirket görüldü; eski anlık `connectionTest` sıfırlanınca yanlış `Doğrulama bekleniyor` metni oluyordu. `GET /api/isnet/settings` `savedAt/companyName/companyId/testedAt` ile yeniden yükleniyor; ön yüzde firma kaydı, son test, portal/API/gerçek belge listesi **farklı doğruluk seviyeleri** olarak gösteriliyor. Token/şifre gösterilmez ve koda aktarılmaz.
- **XML kabul akışı:** Resmî İşNet `GetIncomingEInvoiceList`, `GetIncomingDespatchList`, `GetInvoiceExternalXmlUrl` entegrasyonu, ilk ETTN için en çok 31 gün tarih filtresinde tek gelen fatura/irsaliye XML örneğini salt okunur GET `/api/isnet/api-read-only-xml-sample` ile tarayıcıya indirir. Firma/rol yetkisi, aktif adaptör, kayıtlı ve geçerli **resmî API** tokenı zorunludur; bilinmeyen harici URL, 200 HTML/login, JSON, geçersiz veya yanlış UBL kökü, büyük/boş dosya **reddedilir**. Portal firma kaydı tek başına API oturumu sayılmaz. D1/R2 yazımı, fatura gönderimi, resmî onay, cari/KDV veya otomatik senkronizasyon **yok**. PDF için mevcut Belge Havuzu görsel profilinin gerçek referansla ayrıca insan kabulü gerekir.
- **Kanıt:** [PR #578](https://github.com/cetin60kaya-lgtm/ky-erp/pull/578) squash merge `d9b002a9c5114e7df6b001e741405eae2a011209`. CI `43687642345` **Frontend lint/test/build + Worker typecheck/test/build SUCCESS**. Mock testleri URL allowlist / doğru XML / irsaliye / HTML ret PASS; bunlar resmî İşNet hesabıyla canlı XML indirildiğine delil **değildir**.
- **Kalan gerçek kabul:** Cloudflare Pages ve Worker deploy SHA/ancestry; API modunda kullanıcı yetkili oturumunu doğrulama; resmî İşNet ilk gerçek gelen XML örneği ve PDF karşılaştırması. Kullanıcının mevcut portal firma ayarları değiştirilmedi, üretim D1'e işlem yapılmadı.

## 15.11.2026 — e-Belge İşNet entegrasyon merkezi + firma bazlı çıktı profili (#575, #577)

- **GitHub canonical:** İşNet öncelikli firma adaptör seçimi, etkin/pasif, kaldırma ve salt okunur gelen belge API liste kontrolü [#575](https://github.com/cetin60kaya-lgtm/ky-erp/pull/575) ile squash merge `65ee248d300a9079d462d0bbac8761252e1e6175`. Daha sonra şablon düzenleme, otomatik İşNet panel açma, firma değişiminde şablon state izolasyonu ve PDF/JPEG/PNG görsel profil [#577](https://github.com/cetin60kaya-lgtm/ky-erp/pull/577) ile squash merge `92ebcfe66f62abeec354b5300645ce5721548682`.
- **Test:** #575 CI `43661274938` ve #577 CI `43684964668`, Frontend lint/test/build + Worker typecheck/test/build **SUCCESS**. Eski şablon #572, CI fail ve branch çakışması nedeniyle #577 ile güvenli şekilde superseded edilip **closed/unmerged**.
- **Sistem sınırı:** Adaptör katalogda olmak gerçek bağlanma değildir; firma seçimi / etkinlik / yetkili İşNet oturumu / salt okunur belge listesi ayrı doğrulanır. Logo/Mikro/Paraşüt DRIVER_PENDING. İşNet kapatma geçmiş belgeleri veya kayıtlı şifre/ayarları silmez. Şablon orijinal XML'i değiştirmez, üretici PDF'sine otomatik birebir eşitlik iddia etmez, görsel karşılaştırma ve açık kabul ister.
- **Canlı gözlem:** Public `/api/health` yanıtı `ok=true` ve D1 bildiriyor; Worker `/api/health/isnet-egress` anonim GET'de `einvoiceapi` ve `efatura` READY, `nettefatura` TIMEOUT; credentialTested/sessionVerified false. Yalnız sağlık yanıtı #577 merge SHA'nın Cloudflare Pages ve Worker deploy ancestry'sini **kanıtlamaz**.
- **Kalan kabul:** Cloudflare Pages+Worker gerçek dağıtım SHA; gerçek yetkili İşNet hesabında API login/yetkili firma/gelen fatura ve irsaliye ilk sayfa; tek XML+PDF örnek görsel karşılaştırması; rol/tenant ve mobil/masaüstü gerçek tarayıcı E2E. Bu aşamalar tamamlanmadan **İşNet tam canlı/tam bitti** denmez.
- **Yapılmayan:** Production D1 migration, gerçek fatura/e-irsaliye veya müşteri e-postası gönderimi, kesin cari/KDV/ödeme yazısı, customer XML/PDF toplu aktarımı; GitHub'a credential veya hassas müşteri içeriği yazımı.

## 15.11.2026 — İK SGK Excel: yalnız KY ERP / Hakan Emprime çalışanları (PR #576)

- **Kullanıcı kuralı:** Muhasebecinin Excel'inde işverenin evindeki çalışanlar ve başka işyerlerindeki kişiler bulunabilir. Bunlar otomatik KY ERP/Hakan Emprime çalışanı veya maaş/fiş kaydı değildir. Yalnız canonical KY ERP şirketindeki kayıtlı ve bordro kapsamına alınmış Hakan Emprime personeli işlenir.
- **Kod:** Excel preview kimlik/personel kodu dışındaki yalnız isim benzerliğini otomatik eşleştirme saymaz. SGK önizleme listesinde yalnız `payrollIncluded !== false` personeller manuel seçilebilir; kapsam dışı kişiler “Hakan Emprime dışı / alma” olarak hariç kalır. Worker onayında şirket üyeliği, bordro dahil durumu, TCKN, personel kodu/isim tutarlılığı tekrar kontrol edilir. Eşleşmezse kayıt durur. Aylık ve geçmiş ödenmiş maaş kayıtlarına müdahale edilmez.
- **Kanıt:** [PR #576](https://github.com/cetin60kaya-lgtm/ky-erp/pull/576), squash merge `df30ef710b4056f42bc7307c1e8b2b405020ba2d`; GitHub Actions `43684818753` frontend lint/test/build ve Worker typecheck/test/build (izole D1 dahil) **PASS**. Gerçek SGK dosyalarının çalışan kişi eşleşmeleri yetkili üretim oturumunda hâlâ ayrı kabul gerektirir.
- **Veri sınırı:** Dosyalardaki gerçek çalışan adı, TCKN ve maaşlar GitHub'a/sohbete kopyalanmadı; canlı D1, maaş, banka/elden, personel kartı ve dönem kapanış kayıtlarına yazılmadı. 

## 15.11.2026 — e-Belge sistem adaptörleri / firma seçimi ayrımı, Entegrasyonlar UX yenilemesi (PR #573)

- **Kullanıcı ekranı ve zorunlu tasarım:** e-Belge Entegrasyonlar'da İşNet, Manuel, Logo, Mikro, Paraşüt tüm firmalar için beş boş kart olarak sürekli görünüyordu; seçilmemiş adaptörün firmanın ekranında hiç yer almaması, `Adaptör Ekle` ile ayrı **Sistem Adaptör Kataloğu** açılması, kart seçilince yalnız kendi ayar sayfasına gidilmesi ve güvenli `Kaldır` istendi.
- **Mimari:** Platform kaynağı `APP/cloud/ky-erp-api/src/e-belge-adapter-registry.ts` katalog adaptörlerini ve uygulanmış/uygulanmamış sürücüleri ayırır. Firma kaynağı `json_store` altında `scope=EBELGE_TENANT_ADAPTER_SELECTION_V1`, `main_company_slug + adapterKey` kayıtlarıdır. `GET /api/e-belge/adapters` ve `PUT /api/e-belge/adapters/:adapterKey` yetkili, tenant doğrulamalı seçimi uygular. Eksik ya da çelişen tenant izni REDDEDİLİR. `selected:false` yalnız firmanın görünür listesinden kaldırır: platform motoru, eski XML/PDF, cari/fatura, oturum/ayar kayıtları **silinmez**.
- **Yalnız seçilenler:** `EBelgeAdapterManager.jsx` seçili firmadaki gerçek adaptörleri tek liste olarak gösterir; `Adaptör Ekle` ile sadece kurulmamışları listeler; tıklanan adaptör kendi ayarına gider. İşNet → mevcut `EBelgeIntegrationsWorkspace` (kimlik doğrulama, firma, departman, taşıyıcı, mail); Manuel → `e-Belge Belge Havuzu` XML yükleme. Logo/Mikro/Paraşüt → sürücü bulunmadığı için açıkça `DRIVER_PENDING`, parola istemez, bağlantı PASS göstermiyor. Ekran özel CSS ve mobil dizilim mevcut; eski tekrarlı 5 sağlayıcı kartı kaldırıldı. Gelecekte yeni adaptör platform kataloğuna sürücü sözleşmesiyle eklenir. Firmaların seçimleri birbirinden bağımsızdır.
- **İşNet salt-okunur yeni erişim kanıtı:** 15.11.2026 X Windows NetteFatura giriş formu HTTP 200; production `GET /api/health/isnet-egress` HTTP 200 ve Worker hedefleri `nettefatura`, `efatura`, `einvoiceapi` READY. **Bunun portal girişi/şifre/PDF/XML indirme kabulü olduğu iddia edilmez.** DESEN halen Offline; şifre/OTP/token/müşteri belgesi kullanılmadı.
- **Kod kanıtı:** PR #573, son özellik commit `89b63e8a0dccdde5a6ab28a24977f18a41935178`; ilk CI'de Worker TypeScript Row union tipi düzeltildi, sonraki CI'de eski İşNet frontend kontrat testi yeni provider sayfasına uyumlandı; **son CI `43658298901` frontend lint/test/build ve Worker typecheck/test/build SUCCESS**. Squash merge `31e6d2147cfde12d2fea69027f6b9abd0f72a3d6`.
- **Cloudflare production:** aynı merge SHA için Pages SUCCESS `1d9669b6-29d9-4eac-92e3-644e831e27a5` (15.11.2026 00:30:10 UTC), Worker SUCCESS `714a169c-8db2-4405-be1f-bee5ebfa8e26` (00:30:51 UTC). X üzerinden bağımsız smoke: `https://kyerp.net/e-belge/entegrasyonlar` HTTP 200, `https://api.kyerp.net/api/health` HTTP 200, `GET /api/e-belge/adapters` **oturumsuz HTTP 401**, `GET /api/health/isnet-egress` HTTP 200. Üretim auth'lu firma ekle/kaldır ve gerçek tıkla/ayar aç son kullanıcı kabulü **henüz yapılmadı**; kod/derleme/yayın SUCCESS, etkileşim PASS değil.
- **Paralel açık iş:** XML→PDF/JPEG/PNG firma şablonu PR #572 henüz açık, ilk CI başarısız ve #573'ün `EBelgeCenterPage.jsx` güncellemesiyle merge conflict var. Onarılmadan birleştirilmeyecek; bu PR'da belge şablonu üretim motoru teslimi iddia edilmez.
- **Kota/güvenlik:** Gereksiz manuel GitHub Actions rerun, D1 şema migration, mali veri değişikliği, e-fatura/irsaliye gönderimi veya müşteri verisi GitHub'a aktarımı yok.


## 15.11.2026 — İK Aylık muhasebe XLS/ZIP değişken şablon ve sırayla maaş kontrolü (PR #571)

- **Kullanıcı örneği:** Eylül ve Ekim 2026 muhasebe ZIP paketleri: her birinde iki eski XLS bordrosu ve iki PDF ücret pusulası. 22 kolonlu, bir kişiyi takip eden yardımcı satırlı bordro düzeni gözlemlendi. Örnekler, gerçek personel/TC/maaş değerleri ve dosya içerikleri GitHub'a taşınmadı.
- **Yeni akış:** İK Aylık → SGK / Ay Sonu içinde XLS/XLSX veya ZIP'den yalnız bordrolar açılır; çok sayfalı/satır konumu değişken şablon, esnek başlıklar ve bilinmeyen sütunda kullanıcı eşleştirmesi; onay öncesi personel–net–gün, dönem, kaynak ve mükerrer işyeri kontrolleri. PDF pusulalar parasal hesaba tekrar eklenmez, kaynak ZIP'te kalır. Eşleştirme başlıkları firma/tarayıcı kapsamında saklanır; ücret/kimlik saklanmaz.
- **Maaş hazırlığı:** İK Aylık → Bordro / Ödeme → Bu Ayın Maaşlarını Hazırla, mevcut Son Bordro Kontrolü ekranında kişiden kişiye Kaydet ve Sonraki; kalıcı kart/aylık hesap ayrımı korunur. Resmî onaylı Net İstihkak üzerinden banka/elden önerisi; resmî net eksik veya fazla ise otomatik tutar uydurulmaz; işlem asla kendi başına PAID yapmaz. Personel Kartları sağ panelinde seçili ayın salt okunur toplam/avans/kesinti dökümü, mevcut tekli/10'lu fişle aynı hesap.
- **GitHub kanıtı:** [PR #571](https://github.com/cetin60kaya-lgtm/ky-erp/pull/571), squash merge `66a10e67e673176c74d89e44d923c7386111c736`. Tek son CI `43648136293`: frontend lint/test/build + Worker typecheck/test/build + izole D1 smoke **PASS**.
- **Üretim veri kabul sınırı:** Code deployment, gerçek muhasebe Excel dosyalarının yetkili oturumda D1'e alınıp kişi/fiş bazında kabul edildiği anlamına gelmez. Production D1 kişisel kayıtlarına, eski PAID/LOCKED dönemlere veya DB şemasına bu işte yazılmadı. Yeni muhasebe şablonları yalnız kullanıcı başlık eşleştirmesinden sonra onaylanır.

## 15.11.2026 — İşNet NetteFatura eski yerel indirme kanıtı ve portal otomasyonunu durdurma kararı

- **Kullanıcı beyanı doğrulandı:** 25.07.2026 tarihli kullanıcı Library arşivi `KYERP-ISNET-HAM-VERI-2026-07-25T17-23-43-856Z.json` üzerinde `"completed":true`, `"pdfSaved":true`, `"xmlSaved":true` ifadelerinin her biri 156 kez görülüyor. Bunlar arşivde **başarılı olarak işaretlenen kayıtlar**; mevcut diskte 156 benzersiz dosyanın bugün hâlâ var olduğu iddiası değildir. Örneklerde 20–21.07.2026 `downloadedAt`, gelen irsaliye ve giden fatura, yerel `_ISNET_GECICI/E-FATURA|E-IRSALIYE/PDF|XML` yolları bulunuyor; bazı kayıtlar erişim hatasıyla tamamlanmamış. Özel müşteri bilgileri veya tam dosya yolları GitHub'a kopyalanmadı.
- **Eski kod kanıtı:** `APP/app/ky-erp-backend/src/muhasebe/isnet-operations.service.ts` dosyası (tarihsel commit `cd0a28013e8c75b5ba92300ee45daaa1cd005398`) gerçek `nettefatura.isnet.net.tr` portal login + anti-forgery/cookie → şirket listesi ve firma seçimi → dört belge listesi → `/Invoice|Despatch/Get...Pdf|Xml` GET → dosyayı yerel arşive yazma akışını barındırıyor. Kullanıcının belirttiği geçmiş başarı, sadece resmî İşNet API'den değil portal yolundan da gelmiş.
- **Bugünkü fark:** canlı e-Belge sunucusu Cloudflare Worker; `api.kyerp.net/api/health/isnet-egress` gerçek Worker ölçümünde NetteFatura **TIMEOUT (6500ms)**, eFatura **READY**, API help **READY**. Bağlı X Windows'un şifresiz NetteFatura GET yanıtı HTTP 200 idi. Dolayısıyla eski çalışmış endpoint isimlerini değiştirmek bağlantı erişimi sorununu kendi başına çözmez. Sorunun tam ağ/sağlayıcı tarafı kesin atfedilemez.
- **Ek read-only cihaz denetimi:** 15.11.2026 X bilgisayarı Online ama tarihsel `_ISNET_GECICI` dört XML/PDF klasörü bu makinede yok; eski backend portu 3101 dinlemiyor. DESEN Remote Commander Offline; mevcut DESEN Chat Bridge'in son eşleşen yeni live yanıtı yok. Bu oturumda eski Windows servisinin yerel oturumu veya gerçek dosya indirimi yeniden çalıştırılmış değildir.
- **Karar:** kullanıcının `olursa olsun, olmazsa manuel devam` sınırı nedeniyle **NetteFatura portal otomasyonunda yeni deneme/şifre/test/PR yapılmayacak**. API login de en son gerçek kullanıcıda HTTP 401 idi; İşNet'e destek talebi, API yetkisi veya ayrı IP izni için kullanıcıdan işlem istenmeyecek. Mevcut parola kasası korunur, fakat giriş başarısı sayılmaz.
- **Operasyonel aktif yol:** KY ERP `e-Belge / Faturalar → Belge Havuzu → Belge Yükle` ile UBL-TR XML (asıl belge) alınır. XML'den yön, belge no/UUID, firma VKN/TCKN, satır ve KDV doğrulama sonrası **REVIEW_REQUIRED**; onaylanmadıkça kesin cari/KDV/evrak gönderimi yok. İlgili PDF aynı havuza alınabilir fakat PDF/görsel OCR servisi production'da hazır değilse **`DOCINTEL_NOT_CONFIGURED`** ile açık hata; XML yerine PDF'ye tahmini kayıt yaptırma. Kısmi HTTP 207 yüklemeleri başarılı dosyaların tekrar yüklenmesini istemez. Veri/dosya arşivi önce kaynaktan kontrol edilir; mevcut dosya silinmez/taşınmaz.
- **Gelecek yeniden değerlendirme şartı:** DESEN'deki eski yetkili Windows portal oturumu gerçekten çevrimiçi olduğunda veya sağlayıcı yetkili aynı ağ bağlantısı gerçek PDF/XML ile yalnız okuma PASS verdiğinde kullanıcı açıkça isterse değerlendirilebilir. Eski arşiv kanıtı, bugünkü canlı portal bağlantısı PASS değildir.
- **Kota/veri:** GitHub Actions tetiklenmedi; yeni kod, Worker deploy, D1/R2 mali yazım, müşteri e-postası, kullanıcı şifresi/OTP veya İşNet belge gönderimi yapılmadı. Bu kayıt yalnız bugünkü araştırmanın sonucudur.


## 15.11.2026 — İşNet API seçiliyken eski NetteFatura TIMEOUT gösterimi giderildi (PR #570)

- **Canlı kullanıcı kanıtı:** Bağlantı yönteminde `İşNet API — otomatik senkronizasyon` seçilmişti, fakat ekran hâlâ portalın şifresiz ağ `TIMEOUT` hata bandını ve `Sunucu Erişimini Kontrol Et (Şifresiz)` portal düğmesini gösteriyordu. Bunun API'de kullanıcı oturumu başarısızlığına delil olmadığı açıkça ayrıldı.
- **Çözüm:** İşNet Entegrasyonlar ekranı bağlantı yöntemi için `api`/`portal` görünümlerini ayırır; asenkron portal hata bildirimi `connectionMode` etiketi taşır ve API modunda görünmez. Portal sağlık kontrol düğmesi yalnız portalda görünür; API modunda `GET /api/health/isnet-egress` üzerinden cache'li resmî API sunucusu erişimi otomatik salt-okunur gösterilir. `READY` sadece **ağ erişimi** anlamındadır, API login/şirket/belge senkronizasyonu PASS değildir. Başlık seçili bağlantıya göre değişir.
- **Tercih:** Seçilen mod tarayıcıda tenant ile isim alanına ayrılmış `api|portal` değeri olarak hatırlanır; **TCKN, kullanıcı adı, şifre, token, cookie veya firma verisi bu tercihe yazılmaz**. Yeni bağlantıda güvenli varsayılan API; varsa mevcut doğrulanmış tercihe öncelik. Firma seçimi doğrulanmamış durumda kapalı kalır.
- **Giriş API sözleşmesi:** `https://einvoiceapi.isnet.net.tr/Help/Api/POST-api-Account-Login` resmî dokümanında `IdentificationNumber`, `Password`, cevap `Token`, `CompanyList`, `ExpiresOn` alanları var; mevcut Worker `loginApi` bunlarla uyumludur. API hesabının gerçekten yetkili olduğu henüz test edilmedi ve gerçek şifre/OTP kullanılmadı. Portal TIMEOUT bağımsız sorun olarak kalır, API'yi bloklamaz.
- **Kanıt:** PR #570 feature commit `9b3d0557a745ecc3b90599e4073bfa94928da224` ve CI `43645138850` frontend lint/test/build + Worker typecheck/test/build **SUCCESS**. Squash merge `4c5d55efc44203da91bea6954682064f1b417e1d`. Cloudflare Pages aynı committe **SUCCESS**, deploy `a0274138-4949-423d-b606-a03b2b742f75`. Worker iş kodu bu PR'da değişmedi; yeni Worker deploy bu UX değişikliği için gerekmiyor.
- **Kalan gerçek iş:** Önce kullanıcı tarafından bir kez resmî API bağlantısı yetkili hesapla doğrulanmalı; sonra geri dönen firmalardan yetkili HKN/DDM seçilip kaydedilmeli, API GET/list ve örnek XML/PDF salt-okunur kabulü yapılmalı. Gerçek fatura/irsaliye veya mail gönderimi, kesin cari/KDV kaydı, D1 migration, paylaşılmış parola ve yeni cihaz kurulumları **yapılmadı**.
- **Kota:** Tek PR CI; yeni manuel Actions rerun yok. Dokümantasyon kaydı tek commit.


## 14.11.2026 — İşNet üç sunucu Worker egress doğrudan test kanıtı (PR #568)

- **Kullanıcı isteği:** İşNet bağlantı TIMEOUT'unu kullanıcıyı uygulamada tekrar tekrar düğmeye bastırmadan, ChatGPT'nin doğrudan **production Cloudflare Worker'dan** test etmesi; GitHub Actions kotası ve gizli veriler korunacak.
- **Kod:** PR #568, son test commit `7c7fc7b8f543b8a9b2f148ba2013322a29fc860c`; Github Actions son CI `43637258496` Worker typecheck/test/build ve frontend lint/test/build **SUCCESS**. İlk tip hatası (global `caches.default`) Cloudflare Cache API `caches.open("ky-isnet-egress-health")` ile düzeltildi; başarısız workflow ayrıca tekrar çalıştırılmadı. PR squash merge `2661d787ac884fab75fea9477d30f673b1064643`; eşzamanlı başka sohbetin İK Aylık commit'i `0df1506174...` korunarak merge edildi.
- **Yayın kanıtı:** Cloudflare Workers Builds `b4437518-fe83-4e2b-a991-f48d2eb0505c` **SUCCESS**, 14.11.2026 20:27:18 UTC. `GET https://api.kyerp.net/api/health/isnet-egress` bu Worker'ın kendisinden 3 sabit, herkese açık sağlayıcı sunucusuna şifresiz GET kontrolü yapar; sonuçlar 5 dakika önbellekte tutulur. Kimlik/çerez/Authorization/sağlayıcı tokenı/müşteri bilgisi/HTML içeriği dönmez; hedef URL query ile belirlenemez.
- **Bağımsız X Windows HTTPS testi** (şifre/oturum kullanılmadı): NetteFatura `nettefatura.isnet.net.tr/Account/Login` HTTP 200, DNS/TCP/TLS başarı, toplam **410 ms**, uzak IP `213.143.252.124`; eFatura `efatura.isnet.net.tr/Account/Login` HTTP 200, **126 ms**, IP `213.143.252.103`; resmî API yardım `einvoiceapi.isnet.net.tr/Help` HTTP 200, **143 ms**, IP `213.143.252.136`.
- **ChatGPT'nin X üzerinden canlı production Worker'ı doğrudan çağırdığı sonuç:** `HTTP 200`, `source:cloudflare-worker`, `credentialTested:false`, `sessionVerified:false`, `observedAt:2026-11-14T20:27:59.608Z`. Sağlayıcı sonuçları: **NetteFatura: TIMEOUT 6500 ms, HTTP null**; **eFatura: READY HTTP 200 / 620 ms**; **einvoiceapi Help: READY HTTP 200 / 512 ms**. Aynı `observedAt` sonucu ikinci GET'te döndüğü için cache kabulü de görüldü; geçici Windows test dosyası temizlendi.
- **Kök sorun sınırı:** Windows çıkışı NetteFatura'ya çalışıyor, Cloudflare Worker'ın **NetteFatura hostuna** ulaşması TIMEOUT; aynı Worker diğer iki İşNet hostuna erişebiliyor. Bu, genel internet kesintisi veya yanlış İşNet şifresi kanıtı değildir. WAF/IP/ASN/rota gibi **hangisinin** engel olduğuna dair taraf tayini henüz kesin değil. İzin dışı IP/anti-bot atlatma, sahte oturum, alternatif domaine otomatik kullanıcı şifresi POST'u yok.
- **Önerilen teknik sıradaki adım:** Zaten mevcut ve Worker üzerinden şifresiz erişilebilir `https://einvoiceapi.isnet.net.tr` resmî API entegrasyonunu yetkili hesabın gerçek API oturumunda **salt okunur** kabul et, yön/firma ve tek örnek XML/PDF doğrula. Portal üç nokta menüsü URL'leri gerçek login oturumunda henüz teyitli değildir. API sağlayıcı izni yoksa mevcut yetkili ağdan sınırlı ve güvenli egress çözümü ayrıca tasarlanmalıdır; şifre/çerez yeni hosta izinsiz gönderilmez. Resmî belge/mail gönderimi, D1 migration ve mali kesin kayıt yapılmadı.
- **Durum:** Kod + CI + Worker production + şifresiz Worker egress ölçümü **PASS**; NetteFatura provider portal login ve gerçek PDF/XML indirme **BLOCKED / NOT VERIFIED**. GitHub Actions düşük kota korunacak.


## 14.11.2026 — İşNet şifresiz çift sunucu teşhisi ve kullanıcı onaylı tarayıcı kasası (PR #567)

- **Kullanıcı gözlemi:** e-Belge/Entegrasyonlar gerçek kullanıcı ekranında `İşNet giriş formuna erişim TIMEOUT`. Şifre yanlışlığı veya portal hesabı reddi kanıtı değildir. Bağımsız X Windows GET `nettefatura.isnet.net.tr` HTTP 200, buna karşılık Cloudflare Worker→İşNet giriş formu kontrolü TIMEOUT dönmüştür.
- **İstek:** İşNet kullanıcı adı/şifresini her gün yeniden yazmamak. Güvenli karar: **şifreyi KY ERP D1/API/localStorage/GitHub'a yazma**, `isnet:` önekli ayrı hesapla Chrome/parola yöneticisinde kullanıcı eylemi ve tarayıcı onayıyla sakla; `mediation:required` ile kullanıcı seçince alanları doldur. Tarayıcı desteklemiyorsa yalancı kayıt sonucu verme. Bu tarayıcı kaydı `kyerp.net` origin'inde kalır; paylaşımlı PC'de önerilmez.
- **UI:** `Kullanıcı Adı ve Şifreyi Kaydet`, `Kayıtlı Bilgileri Doldur`, kayıt formunda site/birim ve güvenlik açıklaması. Kayıt veya otomatik doldurma **İşNet bağlantısı PASS anlamına gelmez**. Mevcut firma/yetki durumu doldurmada yeniden doğrulama gerektirir.
- **Ağ:** public `/api/isnet/provider-login-health`, NetteFatura TIMEOUT/HTTP hata halinde ayrıca **şifresiz** `efatura.isnet.net.tr/Account/Login` GET yapar, alternatif sonucu ayırır. Gerçek giriş bilgileri otomatik başka domaine POST edilmez; API/portal yetkilendirme, e-belge ve PDF/XML çekimi hâlâ ayrı kabul gerektirir.
- **GitHub:** PR #567 son `6f137c525b560d9910db672a60c3d9e36e399607`; tek CI `43635823028` frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**; squash merge `1aee8063554c029b2d23b183ff6815a822822872`. `isnetBrowserVault.test.js` sadece sentetik test değerleriyle çalışır.
- **Cloudflare kontrol anı:** Workers Builds: ky-erp-api=success; Cloudflare Pages=success. Kullanıcı gerçek Chrome parola kasası, egress alternatif test ve gerçek İşNet hesap login testleri henüz yapılmadı. Canlı kabul verilmez; başarılı Cloudflare yayını yalnız kod dağıtımıdır. D1 migration, resmî belge, mail, mali yazım veya parola/OTP alımı yok.
- **Kota:** Kullanıcının GitHub Actions limit isteği nedeniyle tek PR CI; manuel rerun yapılmadı.


## 14.11.2026 — İşNet Worker portal giriş sorunu, şifresiz ağ testi (PR #566)

- **Kullanıcı ekranında kanıt:** e-Belge / Entegrasyonlar'da yeni iki aşamalı İşNet ekranı yüklendi; portal test hatası `İşNet portal giriş ekranı açılamadı`. Bu hata yanlış şifre kanıtı **değildir**; V2 sunucu modülü login GET/token aşamasında tüm hata sınıflarını eski kodda gizliyordu.
- **Bağımsız Windows/X salt-okunur kontrolü:** İşNet `https://nettefatura.isnet.net.tr/Account/Login` ve `/account/login/Login` ile `https://efatura.isnet.net.tr/Account/Login`: HTTP **200**, form, `VknTckn`, gizli CSRF alanı mevcut; normal ve KY-ERP kullanıcı ajanıyla 200. Bu erişim **Windows ağından** alındı; Cloudflare Worker çıkışının PASS olması anlamına gelmez. Form tokenının değeri kaydedilmedi; kullanıcı kimliği/şifre/OTP kullanılmadı.
- **Kod:** yeni `isnet-portal-public-health.ts` sabit resmî İşNet public login GET'inden yalnız `READY/HTTP_ERROR/REDIRECT/FORM_MISSING/TIMEOUT/NETWORK_ERROR` ve genel HTTP kodu döndürür; cookie/CSRF HTML/şifre/token/şirket verisi taşımaz. `GET /api/isnet/provider-login-health` existing auth+tenant guard altında. Frontend `Sunucu Erişimini Kontrol Et (Şifresiz)` ve giriş testinden önce Worker→İşNet erişim kontrolü; erişim başarısızsa portal şifreli login girişimi yapılmaz. V2 login GET başarısızlıkları artık `HTTP_403/429/TIMEOUT/NETWORK_ERROR/TOKEN_MISSING` olarak görünür; eski genel hata yerine düzeltilebilir durum sunulur.
- **GitHub:** PR #566 son dal commit `5de4403b22c7563a85c0ee58bb496cacf1dccd2d`, tek CI `43633109272` frontend+Worker SUCCESS; squash merge `ecc0cbb643f2f9fafc6fa490c23e8dd08f4e81da`.
- **Cloudflare:** aynı merge commitinde Pages SUCCESS (14.11.2026 19:39:21 UTC), Worker SUCCESS (19:41:10 UTC). Anonim `api.kyerp.net/api/health` HTTP 200, `/api/isnet/provider-login-health` anonim HTTP 401 (yetkili oturum kapısı). **Gerçek Worker→İşNet provider probe (authenticated) henüz çalıştırılmadı**, portal login/firma seçimi/senkronizasyon PASS değildir.
- **Sıradaki kontrollü kabul:** kullanıcı `kyerp.net/e-belge/entegrasyonlar` Ctrl+F5 → **Sunucu Erişimini Kontrol Et (Şifresiz)** düğmesine basar; yalnız `READY` / HTTP / timeout sonuç kodunu bildirir. READY ise gerçek giriş testine geçilir; BLOCKED ise şifreyi yeniden deneme/portalı bypass yapma yok. Kullanıcı sohbete şifre veya doğrulama kodu taşımaz.
- **Kota/güvenlik:** GitHub Actions için yalnız tek PR CI çalıştı; docs-only kayıt yeni Actions gerektirmez. D1 migration, gerçek e-belge/PDF/XML indirme, müşteriye e-posta, resmî gönderim ve mali yazım yapılmadı.


## 14.11.2026 — Sabit EK maaş ve bordro zinciri / PR #563

- İK Aylık: referanslı kişide referans maaş + personel kartındaki sabit EK, referanssızda ana maaş + sabit EK. Daha önceki referanslı EK=0 fakat gerçek maaş farkı bulunan kayıtlar için geriye dönük okumada fark kurtarılır. Kart düzenlemesinde EK değiştirilebilir; hedef maaş+yol+EK için `EK ile Düzle` eylemi EK'yi hesaplayıp yalnız kullanıcı Kaydet dediğinde kalıcılaştırır.
- Backend yeni açık ayda kaynak kart/referans daha sonra güncellenmişse eski aylık `premium_amount` bu yeni değeri gizleyemez; ödenmiş/kapalı ay immutable. Kart EK/referans geçerlilik tarihli geçmişte ayrı izlenir. Bordro override dahil tek maaş/EK hesabı.
- Çıktı: önceki PR #557 10'lu fiş ve bordro toplamları aynı kaynak projeksiyonunu kullanır; yol normal satır, EK tek kesilebilir kupon, nete tek kez dahil.
- Gerçek Kasım Cuma ve Ali Akkaya tutarları yetkili D1 okuması ile henüz kişi bazında teyit edilmedi; üretim kişisel verilerine migration/backfill veya yazma yapılmadı.


## 14.11.2026 — İşNet çift endpoint çakışması ve PDF/UBL indirme güvenliği (PR #564)

- **Kök neden:** `isnet-live-sync` ile `isnet-runtime-v2` aynı `/api/isnet/settings` ve `/api/isnet/connection` rotalarını kaydediyordu; eski handler önce çalışıp yeni şifresiz firma kaydetme UX'ini bozuyordu. `main.ts` V2 önce çağıracak şekilde düzeltildi; eski cookie/başka firma oturumunun yanlış yeniden kullanımı engellendi.
- **Koruma:** PDF/XML indirme gövdesi artık gerçek PDF başlığı veya UBL-TR Invoice/DespatchAdvice kökü taşımalı; HTTP 200 HTML login/JSON hata/ZIP/boş/aşırı büyük içerik arşive yazılmaz. Doküman: `DOCS/KY_ISNET_BELGE_ERISIM_KANIT_MATRISI_20261114.md`.
- **Kanıt:** PR #564 squash merge `8f77968e08cee681f7d83917ddae51dad7ae5ab5`; tek CI run `43630029134` frontend + Worker SUCCESS; Cloudflare Worker Build `e8cae184-e7a2-4d50-b1fa-8aec59b88f74` SUCCESS. Canlı anonim HTTPS health/UI 200/200; gerçek girişli sağlayıcı senkronizasyonu PASS değildir.
- **Açık:** İşNet portalındaki dört belge kaynağının üç nokta PDF/XML URL'leri henüz canlı oturumda incelenmedi. Kodun URL varsayımları resmî API Help ile karıştırılmayacak. TinyFish güvenli tarayıcı kurulum oturumu açılamadı; şifre, OTP, cookie, müşteri belgesi veya gizli veri alınmadı. Kullanıcı adına fatura, irsaliye, mail, mali son kayıt gönderilmedi.
- **Kota:** yalnız bir hedefli GitHub Actions PR çalışması, yeni manuel rerun veya ek paralel deploy yok.


## 14.11.2026 — Muhasebe/e-Belge entegrasyon ve manuel UBL canlı yayın (PR #562)

- **Amaç:** Tek kullanıcı bağlantı düzeni ve günlük belge güvenliği. İşNet ekranındaki adım bileşeni Microsoft 365/Gmail OAuth ile Google Drive/OneDrive/SharePoint servis ekranına aynı 3-adım görsel düzeniyle bağlandı. Sağlayıcıların gerçek giriş yöntemleri birbirine karıştırılmıyor; OAuth/portal ekranı veya önizleme gerçek veri senkronizasyonu PASS sayılmıyor.
- **Manuel UBL:** UBL-TR kök fatura/irsaliye belge kimliği, zorunlu tarih ve satır, iade faturası türü, tedarikçi/alıcı VKN/TCKN kontrolü, DTD/ENTITY reddi eklendi. Eksik VKN/TCKN otomatik firma açma onayı üretmiyor. Kısmi `HTTP 207` XML/PDF yüklemesi başarıyla kaydedilenleri 'tamamen başarısız' göstermiyor; yalnız reddedilen dosyalar tekrar seçilebilir durumda ve dosya bazında hata görünür.
- **Outlook:** Tek ekranda alıcılar, model, HKN/DDM PDF ekleri, şablon, taslak, önizleme ve gönderim. Gönderebilmek için kullanıcı son onay kutusunu işaretler; gerçek Graph isteğinden hemen önce tenant/model/mail hesabı/PDF/mükerrer gönderim koruması olan `invoice-mail-preflight` tekrar çalışır. `Taslak Kaydet` göndermez; Graph kabulü teslim kanıtı değildir, belirsiz sonuçta otomatik tekrar yapılmaz.
- **Haftalık müşteri Excel:** Önceki/sonraki XLSX/XLS/CSV müşteri ekstrelerinde tutar başlığı bulunamazsa eşit/ödenmiş olarak sessizce yorumlanmaz; `AMOUNT_UNVERIFIED_REVIEW` ile manuel inceleme gerekir. Cari ödeme, KDV, stok, kesin muhasebe kaydı değiştirilmedi.
- **Kod ve test:** PR #562 `0bed02c7168d3626c59fa5dc5e19b5afd0b7b8fb` son test commit'i üzerinden başarıyla squash merge edildi: `86513990fae70390fed98947f89148cd6d714c45`. GitHub Actions CI `43627253024`: **frontend lint/test/build SUCCESS, Worker typecheck/test/build SUCCESS**. Önceki başarısız CI tekrarları için gereksiz rerun yapılmadı.
- **Yayın:** Cloudflare Pages build `491dfa86-6de2-4b77-9e88-868b859fac44` SUCCESS (2026-11-14 18:35:33 UTC); Worker build `8696bf3b-b50a-489b-b03a-386b31d2dfcb` SUCCESS (18:36:30 UTC) **aynı `86513990` commit'inde**. GitHub Pages/Workers checks SUCCESS. Production D1 migration, gerçek müşteri maili/fatura/irsaliye gönderimi veya kesin mali işlem yapılmadı.
- **Canlı kabul sınırı:** Kullanıcı Chrome'undaki e-Belge sekmesi önceki bundle'ı tutuyor (`Bağlantıyı Test Et` eski düğmesi); gerçek yeni ekran için kullanıcı Ctrl+F5, İşNet firma bağlantı denemesi, Outlook Microsoft OAuth ve Drive File Hub binding/senkron indeks kabulü gerekir. DESEN Remote Commander bu oturumdaki kontrol sırasında OFFLINE; yerel Windows ürün/cihaz kabulü yapılmadı. Gerçek İşNet portal hesabı, Outlook gönderimi, müşteri ekstreleri ve fiziksel API smoke **ayrı onay/test bekliyor**. Şifre/OTP/token kaydedilmedi.
- **Kota:** GitHub Actions kotası azaldığı için ara küçük commit/test döngüsü yerine toplu değişiklik + tek final CI kapısı kuralı. Yeni workflow, otomatik tekrar ve paralel deploy hattı eklenmedi.


## 14.11.2026 — İşNet KY ERP içinden tek doğrulama / firma seçimi (PR #561)

- **Kullanıcı kararı:** İşNet kullanıcı adı ve şifre yalnız KY ERP e-Belge → Entegrasyonlar ekranında girilir. Ayrı portala yönlendirme, tarayıcı çerezi/OTP kopyalama ve şifreyi D1'e kaydetme yok. Akış: giriş bilgileri → sağlayıcı bağlantı testi → yetkili firma seçimi → **şifresiz, ikinci login'siz** firma kaydı. Parola göz ikonu ile isteğe bağlı göster/gizle; işlem süresince bekleme ve açık hata.
- **Backend:** `isnet-connection-flow.ts` hesap/mod/10 dk test geçerliliği/yetkili firma doğrulaması. `isnet-runtime-v2.ts` seçilen portal veya API modunu uygular, otomatik ikinci login yapmaz; portal toplam 25 sn süre sınırı, ek OTP/MFA gerekiyorsa başarı sayılmaz. Portal firma doğrulaması API ile otomatik HKN/DDM çekiminin PASS kanıtı değildir.
- **GitHub:** PR #561 squash merge `0fca4e9a70c32313a16c7fc893edc0d98018deaa`; CI `43615641213` Worker typecheck/unit/integration/build ve frontend lint/test/build SUCCESS. Kaynakta 6 dosya değişti (4 iş/test alanı, CSS, JSX), gizli bilgi, müşteri verisi, D1 şema/veri migrasyonu veya resmî gönderim yok.
- **Cloudflare:** aynı committe Pages `624a8096-35a9-4abd-b350-82570aaa6be1` **success**; Worker Builds `b691118a-f140-4ba9-8e39-abfa56ea74d4` **success**, Worker Version ID `0c2ffa9b-b885-4beb-b3a0-0f69dc918fc5`. Bu, yayın kanıtıdır; gerçek İşNet hesabı sağlayıcı bağlantı testinin PASS olması değildir.
- **Gerçek kullanıcı sekmesi:** açık Chrome /e-belge/entegrasyonlar oturumu yeni yayın sonrası henüz sayfa yenilemedi; eski `Bağlantıyı Test Et / Firmayı Seç ve Kaydet` metinleri görülüyor. Ctrl+F5 ile yeni frontend yüklenip kullanıcı şifre/oturumunu **sohbete taşımadan** bağlantıyı test etmeli. İlgili portal/kod/OTP yetkisi sağlayıcı oturumuna bağlı ve burada doğrulanmış değil.
- **Sıradaki sınır:** Yetkili firma seçildikten sonra portal modunda yalnız firma kaydı; gerçek HKN/DDM live sync için API token ile read-only provider probe (GetRecipientList) ve 2 örnek belge karşılaştırması. Outlook OAuth, Drive File Hub binding ve mali son onay ayrı P0.


## 13.11.2026 — Muhasebe haftalık cari tenant koruması / PR #560

- Haftalık müşteri XLSX/CSV `/api/muhasebe/weekly-cari-preview` önizleme rotasındaki `COMPANY_ADMIN` için firma eşleşmesi atlama hatası giderildi. Global `ADMIN/SUPER_ADMIN` dışında istenen tenant, yetkili kullanıcının ana firmasıyla eşleşir; ASCII firma kodu Türkçe I/ı dönüşümünden etkilenmez.
- PR #560 squash merge `4c30a01619bac6a79b1b9bc051f487061a587c8f`; Worker+Frontend CI #43413918757 SUCCESS. 3 yeni negatif/pozitif tenant testi PASS. D1 schema veya canlı finans kaydı, mail, İşNet oturumu, Drive orijinali değişmedi.
- **Yayın/kabul:** PR merge ve CI PASS; bu commit için ayrı Worker production deploy kanıtı henüz yok. DESEN cihazından `kyerp.net` HTTP 200, `api.kyerp.net/api/health` HTTP 200 ve oturumsuz muhasebe mail rotası 401 görüldü; bunlar yeni kodun canlı deploy kanıtı değildir.
- Kalan P0: İşNet yetkili firma/sağlayıcı doğrulaması, Microsoft 365 Outlook OAuth/posta hesabı, Google Drive File Hub CLOUD_API ve binding/senkron indeks; gerçek HKN/DDM/LOT ve müşteri haftalık XLSX örnekleriyle yetkili kullanıcı kabulü. Resmî gönderim veya kesin mali kayıt onaysız yapılmaz.


## 13.11.2026 — Canlı e-Belge, İşNet, Outlook ve File Hub son kabul (P0)

- DESEN Chrome oturumu gerçek UI Automation ile doğrulandı. KY ERP / API HTTP 200, Hub 8840 ve Mesh 8443 Windows TCP erişimi TRUE. GitHub Bridge 13.11 tarihli status yanıtında ok:true ve desktop:true, fakat hub/mesh:false (ayrı telemetri farkı); GoogleDriveFS çalışıyor ve Hakan Emp / KYERP klasörleri mevcut.
- e-Belge → Entegrasyonlar gerçek ekranında İşNet DOĞRULANAMADI, OCR HAZIR. Yetkili firma ve sağlayıcıya doğrulanmış oturum olmadan gerçek HKN/DDM sync PASS değildir. E-posta Hesapları ekranında Henüz mail hesabı yok; Microsoft 365 OAuth ve kullanıcı yetkisi bekleniyor. File Hub/Drive bağlantı ekranı senkronizasyon hatası gösteriyor; kök klasörün varlığı bulut File Hub indeksleme kanıtı değildir.
- PR #558 eski XML/UBL-TR VKN-cari kart kurtarma: merge 438ef477; canlı frontend Actions 43408206041 ve Worker 43408206077 SUCCESS; release f64cfb03. PR #559 eski İşNet tokenını canlı sağlayıcı sorgusu olmadan başarı sayma hatasını giderdi: merge 513145f1; CI 43410199644 SUCCESS; canlı Worker Actions 43410554074 SUCCESS; release bc8287f5. Canlı API health DESEN cihazından HTTP 200.
- Sıradaki açık uygulama işlemleri: ERP içinde İşNet kullanıcısı ve yetkili firma seçimi + sağlayıcı doğrulaması; ERP Mail Hesapları Microsoft 365 OAuth + gönderen hesabı; Google Drive File Hub CLOUD_API bağlantısı ve MODEL_IMAGE/MODEL_SOURCE/PLACEMENT/OUTGOING_DESIGN binding/sync indeks doğrulaması; gerçek HKN/DDM XML/PDF firma-model-birim-LOT-kısmi miktar; Outlook taslak ve mükerrer gönderim kilidi; gerçek XLSX cari, DESEN PSD-BOY, İmalat ve Boyahane kabulü.
- Bu kod/sağlık testinde resmî belge, müşteri maili, kesin cari/KDV/stok/LOT değişikliği, gerçek D1 iş verisi yazımı veya schema migration yapılmadı. Üretim CI ve sağlık PASS, bütün iş sürecinin PASS olması değildir. Gizli token/parola/posta/kimlik GitHub'a veya sohbete taşınmadı.


## 13.11.2026 — Gerçek ekran kabulü ve eski XML firma eşleştirme (PR #558)

- **Kod:** PR #558 merge 438ef47704c84d2369c4770333638caa35302fa3. Yeni e-Belge modalı, yalnız kullanıcı tıklaması ve doğrulanmış UBL-TR XML ile eski pending belgenin kesin VKN, belge no, tarih, tür ve yön kimliği eşleşirse cari kartını bağlayabilir. Posted/Approved bloke. Frontend ve Worker CI başarılı. Gerçek müşteri kartında işlem veya mali son onay yapılmadı.
- **DESEN:** 13.11 özel Chat Bridge requestId DESEN_KYERP_20261113_LIVE_1794563403336 status ok:true fakat hub8840/mesh8443 false; bağımsız Remote Desktop Commander 0.3.1 Windows TCP bağlantısı ikisinde de true. kyerp.net ve api.kyerp.net HTTP 200. Yerel GoogleDrive klasörü mevcut, canonical .git working copy teyit edilmedi. Chrome yetkili oturumu ve e-Belge İşNet bağlantı ekranı gerçek UI testi.
- **İşNet:** Entegrasyonlar üzerinde Bağlantıyı Test Et çalıştırıldı, durum DOĞRULANAMADI. Provider portalından canlı HKN/DDM çekme ve resmî gönderim kabulü yok.
- **Outlook:** E-posta Hesapları ekranında Henüz mail hesabı yok. OAuth/Graph gönderim kabulü yok. ChatGPT Outlook bağlayıcısı ayrı hata verdi.
- **File Hub:** Google Drive Hakan Emp tarama hatası, tarama limiti, 22.541 ilişkisiz dosya, eski File Agent heartbeat ve CLOUD_API yok uyarıları devam ediyor. GoogleDriveFS yerel çalışması ve klasörün varlığı bulut API bağlantısı değildir. Orijinal dosyalar değişmedi.
- **Kaynak önceliği:** Google Drive aramasında HKN E-FATURA ve DDM E-İRSALİYE Hakan Emp altında bulundu; kullanıcının Bilgisayarım/HKN içindeki güncel dosyaları esas alın talebi nedeniyle bu klasörler güncel asıl kaynak kabul edilmedi, bağlama öncesi doğrulanmalı.
- **Açık canlı kabul:** İşNet yetkili şirket/oturum, Outlook OAuth, Google Drive doğrudan Cloud API, File Hub dört binding ve indeks, gerçek HKN/DDM XML/PDF ve kısmi fatura/30-60kg/LOT, haftalık cari XLSX, model PSD BOY, imalat/boyahane rol ve cihaz. Production D1 migration, gerçek belge, mail, cari veya stok mutasyonu yapılmadı.

## 13.11.2026 — Son bordro, 10'lu fiş, EK kuponu ve çalışan net dökümü (PR #557)
- Kasım dönemi çalışanına göstermek için ortak gösterim hesabı eklendi; bordro özetindeki eksik EK toplam kartı tamamlandı, Yol ve EK ayrı; tekli önizleme, tekli fiş ve 10'lu A4 fişte maaş/yol/EK/mesai/avans/kesinti/icra/haciz/net açık biçimde bulunur.
- Kesilebilir kupon yalnız EK içindir, Yol satırda görünür. Ana ödeme EK hariç, genel net EK dahil; kuponu ayırmak banka/elden kaynağını, hesaplanan genel neti veya D1 muhasebe kayıtlarını değiştirmez. Kuruş hassasiyetli kontrol ve uyuşmazlıkta çıktı engeli eklendi.
- Canlı Kasım personel/maaş tutarları yetkili D1 read-only doğrulaması olmadan kesinleştirilmez. Çıktı kanıtı ve gerçek kullanıcı kabulü ayrı.


## 12.11.2026 — Work'süz DESEN Chrome canlı test otomasyonu / gerçek kabul sınırı

- **Kullanıcı kararı:** Work/Codex/ek ZIP/token/kurulum olmadan mevcut KY Control Hub, özel GitHub Chat Bridge ve ihtiyaç oldukça Remote Desktop Commander 0.3.1 kullanılacak. Mevcut günlük kod kontrolü ve DESEN sabah hazırlığına ek, ayrı **KY ERP Canlı Ekran Kabulü** otomasyonu etkin: `Automation_bb4ed255e0888191b5c51f1449ab8367`, Pazartesi–Cuma 09:15 Europe/Istanbul (ilk tarih 13.11.2026), salt-okunur gerçek sağlık/GUI erişim doğrulaması ve mevcut PR/testlerle karşılaştırma; gerçek müşteri işlemi otomatik yapılmaz.
- **DESEN canlı Windows kanıtı (bu sohbet):** Remote Desktop Commander cihaz listesi `Desen Online v0.3.1`. DESEN Windows PowerShell yalnız sağlık kontrolü: `CHROME_COUNT=25`, `https://kyerp.net/ HTTP 200`, `https://api.kyerp.net/api/health HTTP 200`. Oturumsuz GET `/api/e-belge/dashboard`, `/api/muhasebe/invoice-mail-routes`, `/api/muhasebe/weekly-cari-preview` HTTP **401**; bunlar güvenli oturum kontrolü PASS, finansal işlem testi değildir. Hub localhost 8840 health 200, Hub/ChatBridge görevleri Running, watchdog Ready; GoogleDriveFS çalışan işlem sayısı 2.
- **Gerçek Chrome bulgusu:** Doğrudan tarayıcı sekmeleri bağlayıcısı çağrısı bağlantı hatası verdi. DESEN Windows'dan `https://kyerp.net/ana-sayfa/genel-bakis` adresi varsayılan Chrome'da açıldı; Chrome penceresinde KY ERP başlığı doğrulandı ve özel bridge `DESEN_KYERP_HOME_1794474437754` gerçek 840×472 JPEG sonucu **giriş ekranı** gösterdi. UIAutomation aracılığıyla Chrome erişilebilirlik kontrolü yanıt verdi (4 sekme, 61 düğme, 2 giriş alanı), ancak gerçek kullanıcı oturumunda Muhasebe/e-Belge tıklama, belge/Outlook/İmalat uçtan uca çalışma **henüz PASS değil**. Oturum bilgisi/parola istenmedi veya paylaşılmadı. Görüntü public depoya taşınmadı.
- **Yerel canonical kök uyarısı:** `D:\Googledrive` mevcut ve GoogleDriveFS çalışıyor; `D:\Googledrive\KYERP` ile `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp` bu kontrolde **False**. Farklı clone/kök oluşturmadan mevcut eşitlenme/Drive bağlantısı ayrıca teyit edilecek.
- **Kabul sınırı:** Ekran/oturum açılması kullanıcı tarafından yapılmadan kişisel veya mali kayıt okunmaz. Gerçek HKN/DDM faturası/irsaliyesi düzenleme/kesim, Outlook gönderme, cari/bakiye/stok/LOT ve D1 yazımı otomatik yapılmaz. Bir kontrolün Windows sağlığı PASS olması gerçek iş akışı PASS anlamına gelmez.


## 12.11.2026 — İşNet / OCR / Outlook / PSD-BOY / haftalık cari canlı yayın teslimi

- **Canonical birleşimler:** PR #552 İşNet firma/ürün/30–60 kg merge 2dfa877; PR #553 OCR kalite/çift okuyucu merge d00c718; PR #554 Outlook HKN/DDM tek gönderim idempotency merge 4921a550; PR #555 tek ModelFilesPanel ve variants BOY/baskı bölgesi merge a220104e; PR #556 XLSX/CSV cari farkı salt okunur merge 34f32885. Son kod başlarında frontend/Worker CI SUCCESS. Eski çakışan PR #549 ve #550 replacement sonrasında kapatıldı.
- **Üretim yayın kanıtı:** İlk frontend Actions 43162677317 ve Worker 43162677427 SUCCESS (release 400f2f81). İkinci frontend 43164275442 ve Worker 43164275408 SUCCESS (release ade04154). Worker tam D1 backup, test, deploy ve health geçti. applyMigrations=false, applyPhysical0062=false; hiçbir schema migration uygulanmadı. Bu CI/deploy kabulüdür, gerçek muhasebe işlemi değildir.
- **XLSX sınırı:** Haftalık Cari Mutabakat iki dosyanın HKN tam kimliği, grup ve farklarını, seçilen firmanın resmî ERP faturalarıyla yalnız SELECT üzerinden karşılaştırır. Önceki hafta yokken yeni fatura ve ekstreden kayboldu diye ödendi çıkarımı yoktur. Gerçek müşteri XLSX yüklemesi kabul edilmedi; otomatik Outlook original thread reply / 12 aylık kişi grubu çıkarımı eksiktir.
- **DESEN:** Gerçek özel Chat Bridge status DESEN_KYERP_20261112_1794461380291 ok:true, desktop:true ama hub8840:false, mesh8443:false. Desteklenen open_hub DESEN_KYERP_OPEN_20261112_1794462677536 ok:true; hemen ardından status DESEN_KYERP_POSTOPEN_1794462779609 yine iki port false. Remote Desktop Commander offline. Gerçek Windows ekran/oturum testi PASS değildir. Yeni ZIP, token, kurulum istenmedi.
- **Açık kabul:** Gerçek Drive/File Hub dört binding/sync, indeksli model-PSD BOY bağı, gerçek İşNet HKN/DDM XML+PDF ve LOT/fiziksel journal, Outlook OAuth/Sent Items ve açık kullanıcı gönderimi, müşteri haftalık XLSX, role/mobile testleri. Gerçek e-posta, resmî e-belge, finansal son onay veya production D1 veri işlemi yapılmadı.


## 10.11.2026 — TEK UÇTAN UCA KABUL LİSTESİ (geri dönük talep–işlem karşılaştırması)

- Detaylı işler/kanıt/öncelik/test: `DOCS/KY_ERP_UCTAN_UCA_KABUL_MATRISI_20261110.md`. İlgili kanıtlar PR #548 (e-Belge + model dosya paketi), PR #542 (giden PSD Drive onaylı bağlantısı), PR #549 (çakışan ikinci PSD şeması) ve PR #550 (taslak mail rotalama) üzerinden kontrol edildi.
- **İşlem mantığı sabit:** Desenci `MODEL_SOURCE` klasöründeki 1–N teknik/dosya ekini tek model kartına ve tek fiziksel PSD'yi birçok MODEL + BOY + baskı bölgesine bağlar. Muhasebeci orijinal HKN/DDM XML/PDF belgelerini e-Belge'ye alır; cari/KDV/LOT ve irsaliye esaslı kısmi faturalama yalnız doğru eşleşme ve onay ile kesinleşir. İmalat/Boyahane kendi kayıtlarını tutar, model dosyaları salt okunur ortak görünür. Tek canonical model kimliği/tek File Hub.
- **Açık P0:** PR #550 mükerrer dış e-posta için idempotency ve ACCEPTED sonrası link kurtarma; PR #549 `variants`/ `placements` çakışması; yetkili kullanıcının gerçek Drive 4 binding ve indeks/kart bağı kabulü; İşNet ve LOT uçtan uca negatif/pozitif testleri. Haftalık müşteri XLSX mutabakatı ve Outlook kişi/grup çıkarımı plan seviyesindedir.
- **Düzenli takip:** KY ERP Günlük Kabul Kontrolü, yaklaşık 08.00 Europe/Istanbul. Günlük rapor GitHub/CI/release farkını doğrular; işletme dosyalarına ve canlı iş kayıtlarına otomatik yazmaz.


## 10.11.2026 — YAPILACAK: Muhasebe haftalık cari mutabakatı, Outlook fatura takibi ve KY ERP Asistan

- **Durum: PLANLANDI / KULLANICI ONAYLI İŞ LİSTESİ.** Bu kayıt yalnız iş kapsamıdır; uygulandı/test edildi/yayınlandı anlamına gelmez. Kullanıcı sıradaki mantığı anlatmadan geliştirmeye veya canlı operasyona geçilmez.
- **Fatura gönderimi:** İşNet HKN fatura + DDM irsaliyesi, tek canonical model UUID'sine ve File Hub üzerinden Drive'daki orijinal PDF/XML'e bağlanır. Muhasebe/model kartından Outlook yetkili posta kutusu ile doğru alıcı(lar)a konu, ek ve CC korunan gönderim taslağı; yalnız açık kullanıcı onayı ile gönderim. Gönderilen mailin thread/mesaj ID, tarih, alıcı ve dosya bağları saklanır. Bilinmeyen gönderim durumunda kör tekrar yok.
- **Grup ve sorumlu:** Cari XLSX'teki 120/125/130/150/165 vb. grup kodları, irsaliye göndereni, fatura gönderen/alıcıları, e-posta imzası ve model kartı ilişkisiyle kişi/grup tahminleri denetlenir. Birden çok alıcı ve sonradan değişen yetkili desteklenir; çelişkide insan teyidi gerekir. Yanlış kişiye otomatik mesaj yasak.
- **Haftalık müşteri ekstresi:** Outlook'tan gelen XLSX kullanıcı yükleyince veya yetkili posta bağlantısından otomatik alınınca önceki haftalarla fark analizi; aynı dosya/satır bir daha kayıt açmaz. Eski dönemden devreden bakiye, bir yıl eski fatura, geç gelen dekont, ZP toplu ödeme, mahsup, düzeltme, iade ve iptal/revizyon ayrı izlenir. HKN tam numarası + firma + belge kimliği esas alınır; model adı tek başına güvenilir anahtar değildir.
- **Ayrı üç doğruluk alanı:** (1) müşteri carisinde fatura var/yok/teyit, (2) kesin faturaya eşleşmiş ödeme durumunda ödendi/kısmi/açık/teyit, (3) müşteri toplam cari bakiyesi bizim dönemsel bakiye ile uyuşuyor/fark/teyit. Toplu ödeme hangi faturaları kapattığını açıkça söylemiyorsa faturayı kesin ödendi işaretleme. Artı/eksi bakiye değişiminin nedenini kısa hareket açıklamasıyla göster; otomatik defter düzeltmesi yok.
- **Operasyon ekranı:** Muhasebe cari mutabakatında müşteri ve grup bazında '165 grubunda 3, 150 grubunda 2 faturanın cari kaydı eksik' gibi liste; fatura ve sorumlu kişiye açılma; telefonla bilgi için kişi gösterimi; eski hatırlatma, iptal ve revizyonları ayrı durumlarda göster. Tekrarlanan hatırlatmayı önle.
- **Haftalık otomatik kontrol:** Her yeni ekstrede değişen HKN faturalarını ve eskiye dönük hareketleri ayır, fark ve belirsizliği bildirimle sun. Eksik geçerli faturaya orijinal gönderilmiş e-postanın yanıt zincirinde, doğru TO/CC ile HKN numaralı nazik takip taslağı hazırla. Gönderim için yetkili kullanıcının açık onayı şart; AI doğrudan mail göndermez, cari/ödeme verisini değiştirmez.
- **Mevcut altyapı kullanılacak:** Cloudflare Workers AI Llama 3.3 70B ve KY ERP Asistan ekranı, Microsoft Graph mail modülü, File Hub ve canonical model/İşNet/muhasebe kaynakları; ikinci paralel sistem kurulmayacak. Excel parse, sayısal mutabakat ve kesin HKN eşlemesi deterministik; yapay zekâ belirsiz yazışma, kişi/grup ve açıklama/taslak için kullanılır. OpenAI API yalnız ileride ihtiyaç ve maliyet teyidiyle opsiyonel alternatif.
- **Güvenli kabul:** OAuth/mail bağlantısı, yetkili hesap, D1 şema ve canlı sürüm ayrıca doğrulanmalı; iptal edilen/yeniden kesilen fatura, geç gelen eski dönem kaydı, toplu ödeme, çapraz grup ve mükerrer gönderim testleri PASS olmadan 'tamamlandı' denmez. Bu plan kaydı herhangi bir kod, D1, ödeme, Drive veya posta kutusu değişikliği değildir.

## 09.11.2026 — İK Aylık iki hesapta aynı duyarlı bordro penceresi (PR #547 ek kapsam)

- Yönetici ve muhasebe örnek ekranları farklı çözünürlük/Chrome zoom, ayrıca Eylül 2026/Ekim 2026 farklı dönem gösteriyor. Tek React bordro modalında sabit maksimum 1480px genişlik ve 10–11px etiketler kullanılıyordu; ayrı rol arayüzü bulunmadı.
- Yeni ekran düzeni: 96vw × 94dvh bordro modalı, yüzde/esnek personel sütunu, container ölçüsüne göre yan yana/alt alta form ve sonuç, ölçekli başlık/alan/yazı, mobil erişilebilir tek kaydırma düzeni, responsive personel kartı. Yeni ikinci ekran veya CSS override yaması oluşturulmaz; var olan kurallar yerinde güncellenir.
- Alt uyarı artık yalnız seçilen aya ait maaş/yol/EK/banka-elden ile kalıcı personel kartı ayrımını doğru anlatır. Oturum/gerçek D1 verileri değiştirilmedi; CI/merge/yayın/canlı kullanıcı kontrolü ayrı kanıttır.

## 09.11.2026 — İK Aylık tek kalıcı kart, ayrı aylık bordro (PR #547)

- Kullanıcı kararı: Personel Kartı kalıcı çalışanın tek ana kaydı; Son Bordro Kontrolü sadece seçilen ayın ücret/ödeme ve tarihli hareket sonucudur. Bir ekrandaki her kayıt diğer ekranlarda aynı canonical kaynaktan yeniden okunur, fakat aylık bordro düzeltmesi kalıcı ana kartı izinsiz değiştirmez.
- Ay son kontrolüne `Yalnız Bu Ayı Kaydet` ve `Personel Kartını Güncelle` (etkili tarih + kullanıcı onayı) işlemleri ayrıştırıldı. Worker normal aylık kayıtta master employee, person-card-settings, salary-contract ve ücret geçmişini değiştirmez; kalıcı işlemde bu kayıtlar kontrollü güncellenir. Kalıcı banka planı o ayın mesaisi/avansı/kesintisi olmadan hesaplanır.
- Açık dönemde aylık özel maaş ve mevcut hareketlerin birleşiminden canlı sonuç üretilir; eski sonuç güncelmiş gibi gösterilmez. CALCULATED statüsüne geçiş aylık özel planı düşürmez; PAID ve kilitli ay geçmişini korur. Optimistic version kontrolü çakışmada 409 döner.
- İK modalı geniş uyarlanabilir; son personel seçimi, dönem ve kaydırma konumu kalır. PR #547 `feature/ik-aylik-kalici-kart-aylik-bordro-20261109` dalındadır. GitHub frontend/Worker canonical CI PASS; production merge/deploy ve canlı kullanıcı testi ayrı kanıt bekler.

## 09.11.2026 — KY ERP tek kayıt penceresi + canonical model kimliği (PR #546)

- Kullanıcı ekranlarında DESEN model/kanaI penceresi sekmelerde değişken boyutlu, firma listesi boş; İmalat/Boyahane/Muhasebe farklı yeni kayıt formları kullanıyordu. Ortak `KyRecordDialog`: 840×600 başlangıç, sağ-alt sürükleme/klavye, kullanıcı ölçüsü, sabit dış çerçeve, iç scroll, mobil tam ekran. Desen, İmalat, Boyahane ve Muhasebe yeni kart formları aynı bileşeni kullanır.
- Desen/Muhasebe firma listesindeki yalnız müşteri filtrelemesi nedeniyle tedarikçi tanımlı mevcut firma görünmüyordu. Aktif kayıtlı firmalar tür etiketiyle görünür, seçimi kullanıcı yapar. Muhasebe firmasının işlevi değiştirilmez.
- Tek Worker `canonical-model-identity.ts` ile yeni manuel model ve Drive JPEG açılışı canonical D1 `model_records` UUID'sine bağlanır. Mevcut model adı+firma ve UUID kontrol edilir; çakışma otomatik merge edilmez. Boyahane iş UUID'si ayrıca korunarak `modelCardId` taşır. İşNet model listesi canonical kartlardan gelir; uygun müşteri gelen irsaliyesinde açık model adı varsa kart açılabilir; fatura/irsaliye dış gönderimleri otomatik yapılmaz.
- Desen modalına yeni görsel ekleme/değiştirme eklendi: yeni MODEL_IMAGE öncelik alır, önceki versiyon ve Drive orijinali silinmez. R2 yalnız model önizleme rolündedir.
- Aktif yönlendirmede gölgelenen eski Boyahane V1 manuel route ve production-runtime-v2 ikinci model create/update/delete yolları, eski ayrı Desen resize helper'ı kaldırıldı. Eski business verileri, depolama, KDV, cari ve diğer üretim akışlarına toplu mutasyon yok.
- Güncel feature dalı `feature/tek-kayit-penceresi-model-karti-20261109`, PR #546. Canlı kabul için PR son commit frontend lint/test/build + Worker typecheck/unit/integration/build, merge SHA, Pages/Worker deploy ancestry ve canlı smoke kanıtı gerekir. Gerçek D1 verisine toplu düzeltme veya schema migration bu PR'da yoktur.


## 08.11.2026 — DESEN legacy raw görsellerini kaynak senkronunda koruma

- Canlı kullanıcı DESEN Havuzu ekranında **723 toplam / 275 görselsiz**, D1 salt-okunur `model_records.image_url` sorgusunda **723 / 292** görüldü. Aradaki 17 farkın nedeni öncelikle JSON `raw.imageUrl`/`raw.mainImage` fallback olasılığıdır; kesin sayım yeni D1 SELECT adımıyla doğrulanacak, tahmin PASS sayılmaz.
- `desen-workflow.ts` `canonicalRecordView` zaten `row.image_url || raw.imageUrl || raw.thumbnailUrl` ve `raw.mainImage` kullanır. Oysa `file-hub-design-sync.ts` kaynak PDF/AI/PSD bağında `mainImage` yoksa önceki düzeltmenin yalnız `existing.image_url` koruması, raw'daki eski görüntüyü yanlışlıkla boşaltabilirdi.
- Düzeltme: mevcut canonical aynı tenant/UUID `raw` alanı da okunur; öncelik gerçek workflow `MODEL_IMAGE`, sonra `image_url`, sonra mevcut canonical `raw.imageUrl`/`raw.thumbnailUrl`/`raw.mainImage`, en son workflow eski raw önizleme alanları. Hiçbir kaynak yoksa sahte görsel üretilmez.
- `preserveCanonicalImageUrl` testleri eski raw fallback, mainImage, yeni görsel önceliği ve boş durumları içerir. D1 manuel check-only'a aggregate raw fallback sayımı eklenir. Model, dosya, görsel, renk ve D1 verileri doğrudan bu kod değişikliğiyle elle değiştirilmez.
- Bu değişiklik İmalat modülünün koduna, cari/fatura kayıtlarına, dosya adına veya Drive klasörüne dokunmaz.


## 08.11.2026 — DESEN yerleşim PDF özel Drive ataması (yanlış 4/4 düzeltmesi)

- Canlı D1 `D1 Schema Readiness - Check Only` denetimi (run 42491972133) `MODEL_IMAGE` 432 indeksli/431 modele bağlı, `MODEL_SOURCE` 7.147 indeksli/703 dosya bağlı/346 model, `OUTGOING_DESIGN` AGENT UNKNOWN/0 indeksli gösterdi. **`PLACEMENT` etkin özel senkron bağlarında hiç görünmedi**.
- Gerçek kullanıcı ekranındaki `Yerleşim / kalıp` satırı `Firma varsayılanı` idi: `/file-hub/resolve-storage` özel DESEN/PLACEMENT ataması olmayınca ana firma bağlantısına fallback yapar. Önceki arayüz bunu yanlış biçimde “4/4 bağlı” sayıyordu; fakat bu, `sync_enabled=1` özel kök bağı değildir.
- Düzeltme: gerçek/etkin özel atamalar sayılır, fallback ayrı uyarılır. Mevcut `MODEL_SOURCE` `modeller` yolu + aynı `GOOGLE_DRIVE CLOUD_API CONNECTED` hesabı doğrulanırsa, yalnız yetkili kullanıcı **“Yerleşim klasörünü bağla”** düğmesine bilinçli basarak mevcut `yerleşim dosyaları` kökünü `DESEN / PLACEMENT` ataması yapabilir. Tarama izni `readEnabled=true`, `writeEnabled=false`, `syncEnabled=true`. Sonuç mevcut owner-gated `PUT /file-hub/bindings` yolundan kaydedilir. Yeni Drive hesabı/token/yerel root/migration veya dosya taşıma yok; otomatik sessiz D1 mutasyonu yok.
- Google Drive salt-okunur liste: `yerleşim dosyaları` 704 dosya (684 PDF). Atama tamamlandıktan sonra mevcut 5 dk cron taraması/idempotent backfill ile indeks; model adına göre özgün ilişki ayrıca doğrulanır.
- Mevcut D1 manuel check-only'a ayrıca `DESEN_BINDING` gerçek özel kaynak/sync flag ve `DESEN_IMAGE_GAP` workflow görseli olup canonical boş model sayısı eklendi (yalnız SELECT ve aggregate, model adı/ID/tokens/log yok).
- Sahada kullanıcı owner oturumunda butona basıp gerçek `DESEN/PLACEMENT` D1 indeks/bağı görülmeden yerleşim senkronuna PASS denmez. Giden Agent kimliği ayrı doğrulama bekler. D1 iş kayıtları, PDF/PSD/AI ve İmalat değiştirilmez.


## 08.11.2026 — DESEN Drive görsel/kaynak/yerleşim/giden bağları tam denetim

- Kullanıcı İmalat işine geçilmesini durdurdu; yalnız DESEN'e, Drive dosya akışına ve model kartı ilişkilerine odaklanılmasını istedi.
- Google Drive mevcut bağlantısından salt-okunur klasör envanteri: `Hakan Emp/görsel/2026` **433** JPEG; `Hakan Emp/yerleşim dosyaları` **704** dosya (684 PDF); `Hakan Emp/modeller` ilk sayfada **en az 1.000** model klasörü; `Hakan Emp/giden desenler` ilk 1.000 dosyadan 995 PSD. Son iki sayının toplam klasör/dosya sayısı olduğu ileri sürülmez.
- Üretim DESEN Havuzu son canlı kullanıcı ekranında 723 kart ve 275 görselsiz kart. Drive dosyasının bulunması `file_hub_relations`, `model_records.image_url` veya gerçek tam PSD önizlemesinin hazır olduğu anlamına gelmez.
- Kodda risk: `upsertCanonicalModelRecord` kaynağa PSD/PDF/AI bağı eklerken `mainImage` bulunmazsa canonical `image_url` alanını `null` yapabilir. Onarım: aynı tenant/UUID için kayıtlı image_url korunur; yeni gerçek workflow ana görseli varsa kullanılır. Kaynağa, dosyaya veya D1'deki gerçek verilere manuel müdahale yok.
- `MODEL_SOURCE` PSB kaynakları artık PSD gibi `SOURCE_PSD` tanınır.
- Giden Desen / Takım `AGENT / UNKNOWN` olduğunda çalışan `MODEL_IMAGE`, `MODEL_SOURCE`, `PLACEMENT` `CLOUD_API / CONNECTED` kaynaklarının yanlış biçimde 'Bulut ayarı eksik' görünmesi ayrıştırıldı: kaynak bağlantı hatası ve Agent doğrulanmadı uyarıları ayrı.
- Manuel `D1 Schema Readiness - Check Only` işine dört DESEN bağının sayısal görüntülenmesi ve görselsiz model özeti için **salt SELECT** sorguları eklendi; hesap/tenant harici kayıt dökümü, token, dosya ismi, Drive klasörü taşıma veya yeniden tarama yok.
- Kalan kabul: PR CI, Worker/Pages yayın kanıtı, gerçek D1 dört kaynak istatistiği, PSD canlı preview/Agent ve örnek model kartlarının PDF/AI/PSD/yerleşim önizlemesi. İrsaliye/İmalat/Fatura koduna dokunulmaz.


## 08.11.2026 — DESEN model detayında tek sağ-alt tutacak / bütün sekmeler sabit ebat

- Kullanıcı gerçek ekran görüntüsünde önceki #535 sürümünde **iki sol tutacağı** ve sekmelerin içeriğe göre değişen pencere boyunu reddetti; **yalnız sağ-alt köşede tek tutacak, tüm sekmelerde aynı en-boy** istedi.
- Düzeltme: `WideModal` resizable modunda başlangıç **840 × 590 CSS px**, `width/height` doğrudan bileşen inline stillerinde sabit; Genel, Dosyalar, Kanallar, Boyahane, İşlem Logları sekmeleri değişince dış pencere yeniden ölçülmez. İçerik grid gövdesinde scroll olur.
- Sol ve sol-alt tutacaklar kaldırıldı; **yalnız sağ-alt tutacak** fare/pointer ile en-boy ayarlıyor. Sürükleme sırasında sol-üst köşe sabit kalır; viewport dışına taşma önlenir. Klavye yön tuşları ve mobil tam ekran davranışı korunur.
- `desenModalResize.test.js` yeni sağ-alt en-boy, min-max ve CSS/JSX tek tutacak-sabit ölçü regresyonlarını içerir.
- Bu değişiklik sadece modal UI ile ilgilidir; model/imalat, PDF/AI/PSD, File Hub, D1, gerçek santimetre boyutu ve orijinal görsel değiştirilmez.
- **CI, PR merge, Pages deploy ve kullanıcı canlı görsel kabulü birbirinden ayrı.** Canlı fare testine kadar bu son adım açık kalır.


## 08.11.2026 — DESEN model detayı sabit pencere / soldan en-boy ayarı

- Kullanıcı canlı LONE modalında Genel, İşlem Logları, Dosyalar, Boyahane ve Baskı Bölgeleri arasında pencerenin görünür ölçüsünün değişmemesini, ayrıca **sol kenardan en** ve **sol-alt köşeden en-boy** ayarı istedi.
- Yalnız `ModelDetailModal`, ortak `WideModal` bileşenini `size="model-detail" resizable` ile kullanır; diğer dialoglar değiştirilmez.
- Masaüstünde başlangıç 840×590 CSS px (ekran boyuna göre sınırlı); içerik `dsg-modal-body` içinde kaydırılır ve sekme değişiminde başa döner. Sol tutacak sadece genişliği, sol-alt tutacak genişliği ve yüksekliği değiştirir. Sağ kenar sürükleme boyunca sabitlenir; ok tuşlarıyla da tutacak kullanılabilir; viewport min/max sınırları korunur. Mobilde eski tam ekran görünümü korunur, boyutlandırma tutacakları gizlidir.
- `desenModalResize.test.js` genişletme/daraltma, sol-alt en-boy, ekran sınırı ve dar ekran kontrolünü kapsar.
- Bu istek model dosyası, D1/Drive/File Hub ilişkisi, model UUID, gerçek en-boy cm bilgisi veya baskı ölçüsünü değiştirmez. **Frontend CI/merge/Pages yayını ve gerçek canlı masaüstü drag testi ayrı doğrulama gerektirir.**



## 08.11.2026 — DESEN model detayında İşlem Logları ekran çökmesi düzeltmesi

- Gerçek kullanıcı ekranında, görseli eksik bir canonical/XLSM_IMPORT modelin `Dosyalar` sekmesi bağlı PDF dosyalarını gösterirken `İşlem Logları` sekmesine basınca **tüm modül React hata ekranına düşüyordu**.
- Kök neden: `ModelDetailModal` içinde `model.logs.map(...)` çağrılıyor; canonical model API görüntüsü `logs` alanını zorunlu/daima dizi olarak sunmuyor.
- Düzeltme: `safeModelLogRows` yalnız geçerli günlük nesnelerini korur; olmayan/bozuk `logs` boş dizidir. İşlem geçmişi gelmiyorsa açık boş durum gösterilir; mevcut modelin PDF/AI/PSD bağlantıları, UUID, kaynak, kayıtlar değişmez; sahte log üretilmez.
- Regresyon testi: eksik `logs`, `null`, yanlış tip, karışık eleman ve gerçek kayıtların korunması. **CI, PR merge, Pages yayını ve canlı kullanıcı tıklaması ayrı doğrulanmalıdır.** Bu değişiklik DESEN görsellerinin otomatik tamamlandığı anlamına gelmez.


## 08.11.2026 — DESEN File Hub cron iş ayrımı ve son canlı kabul
- Son canlı D1 salt-okunur bulgu: 723 model / 431 model resmi / 431 File Hub model resmi ilişkisi; DESEN/MODEL_IMAGE Google Drive CLOUD_API+OAuth+root bağlantısı mevcut, 20 klasörlük eski kuyruk sürüyor. Yeni `modelImageFastProgress` durumu bulunmuyor (0 taranan), fakat cron 5 dakikalık tetikleme deploy edilmiş. Yalnız kodun varlığına canlı kabul verilmedi.
- Üç `ctx.waitUntil` ile cron görevleri birbirinden ayrılıyor; bir bağımsız görevin hatası File Hub'ın yürütmesini Promise.all kısa devresiyle bitirmesin. Çalışma, mevcut Worker'da, yeni token/cron/depo oluşturulmadan, sabit hata koduyla yürür.
- Yetkili KY ERP ekranında mevcut tarayıcı sürüm hatası için `Güncel Sürümü Yükle` ve ardından `Desen > Gelen Desenler > Dosya Bağlantıları > Drive Görsellerini Eşleştir` canlı kontrolü gerek. D1 tarama sayaçları ve örnek model resimleri okunmadan PASS yazılmaz; 39 belirsiz model kaynak kararına bağlı.


## 08.11.2026 — DESEN RGB görsel taraması tüm Drive sayfaları (yeni PR)

- Önceki #526'nın eksik tarafı `görsel/2026` 433 dosyadan yalnız en yeni 100'ünün öncelikli senkrona girmesi idi. `modelImageFastProgress.nextPageToken` ile devam, kümülatif tarama/bağlama ve açık tamamlanma göstergesi eklendi; `DESEN/MODEL_IMAGE` bağlamı dışında dosyaya dokunulmaz.
- DESEN File Hub satırına sahibi/yöneticisi için `Drive Görsellerini Eşleştir` eylemi, durum/hata ve toplamlar eklendi. Mevcut 5 dk cron ve File Hub OAuth korunur; firma seçimi değişince bağlantı bilgisi tekrar yüklenir.
- Üretim yayımlanmış #526 kaynak sürümü SHA `ca65340b` sonrası `96661464` (Frontend ve Worker GitHub deployment SUCCESS). Bu yeni PR'ın CI/merge/deploy ve gerçek yetkili D1 model-görsel örneği ayrı doğrulanır. DESEN Chat Bridge yanıtı gelmeden Online denmez. 39 kaynak belirsiz model sahte tahminle bağlanmaz.


## 08.11.2026 — DESEN üç aylık eksik görsel onarımı (PR #526)
- X Google Drive `Hakan Emp/görsel/2026`: son üç ay 147 üretim modeli içinden 121 başlangıçta görselsiz; 4 hazır JPEG kopyası ve 82 yeni JPEG (PDF/AI/PSD asıllarından), 82/82 bulut dosyası ad/boyut doğrulaması, klasörde 433 dosya. Orijinal dosyalar korunmuştur.
- PR #526 yeni JPEG'leri öncelikli indeksler; `MODEL_IMAGE` bağından yalnız boş/tekil mevcut canonical UUID'lere ilişki kurar. Eski indeksli ama image_url'si boş kayıtları onarır. Yeni model/sahte görsel oluşturmaz, var olan görseli değiştirmez.
- **Canlı bağlantı kabulü henüz yok:** X Wrangler giriş yetkisi yok; GitHub CI/merge/deploy ve D1 File Hub ilişki sayımı + yetkili model kartı önizlemesi doğrulanmalıdır. 39 kalan model belirsiz/ad uyuşmazlığı ile açık. Çalışma kaydı `DOCS/KY_ERP_DESEN_2026_GORSEL_EKSIK_TAMAMLAMA_20261108.md`.


## 05.11.2026 — Günlük Operasyon LOG tarih sınırı + Haftalık Özet D1 ek/kesinti/net canlı (PR #520)
- Kök neden 1: Günlük LOG, D1 audit/revisions/attendance kaynaklarını birleştirirken `revisions()` sadece `date` kullanıyor, `startDate/endDate` değerlerini yok sayıyordu. UI son filtrede iş tarihini ve istenen aralık kapsamını tekrar doğrulamıyordu. Kanıt kapsamı: seçilen ÇALIŞMA TARİHİ (workDate); işlem yapılış saati (createdAt) yalnız bilgi.
- Kök neden 2: `weeklySummary()` sadece vardiya baz ücretlerini topluyordu; frontend `getDailyWeeklySummary` verisini çekip kullanmadan attendance ile bağımsız toplam yapıyordu. Bu yüzden D1 ACTIVE ek ödeme/kesinti haftalık personel listesi, net KPI, A4 ve Excel'e geçmiyordu.
- Onarım: Worker revisions SQL'inde firma bazlı kapsayıcı `work_date >= startDate AND work_date <= endDate`; UI LOG üç kaynağı aynı aralıkta okur, stale/farklı aralık yanıtını göstermez, API 500 sonuç sınırında uyarır. Worker haftalık rapor seçili `period_start/period_end` ile aynı dönemli ACTIVE ek ödeme/kesinti satırlarını (ödemeye bağlanmış tarihsel ACTIVE dahil) baz tutara ekler/çıkarır. VOID hariç. Yalnız ek işlemli, vardiyasız kişi raporda da görünür.
- Finansal tek otorite: D1 `weeklySummary`; UI vardiya matrisi attendance ile gün/kontrol göstergelerini korur, net tutarı D1 özetinden alır. Personel bazında Çalışma Tutarı, Ek (+), Kesinti (−), Net; A4 PDF/yazdırma ve Excel aynı toplam. Kapsam/hakediş doğrulanmazsa net/çıktı onaylanmaz.
- Değişen dosyalar: `APP/cloud/ky-erp-api/src/gunluk-operasyon-cloud.ts`, `APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx`, `APP/app/ky-erp-frontend/src/services/dailyOpsReportIntegrity.js` ve üç hedefli regresyon testi. D1 migration yok; mevcut personel, vardiya, kart ücreti, ödeme defteri ve geçmiş kayıtlar değiştirilmedi.
- PR https://github.com/cetin60kaya-lgtm/ky-erp/pull/520 birleştirme SHA `16595364aaa518577540152c004174adf6d1fde4`. CI https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41975967565 SUCCESS: frontend lint/test/build + Worker typecheck/test/build.
- Canlı API & Security deploy https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41976186241 SUCCESS; API Worker Version ID `683d116a-71bb-4306-ac1d-66774a4f5874`. Pages https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41976206014 SUCCESS; canlı `/assets/DailyHrWorkspace-D43Pi0vB.js` SHA256 `ec6bf1e52bdc987bf3c1257bb98e6b74d8edaed97fc2742efdb066b7321b6864` build ile eşleşti. Health 200; anonim personel izni 401; üretim Chrome kamuya açık smoke PASS.
- Saha kabulü: Yetkili muhasebeci oturumu ve gerçek D1 haftalık ek ödeme/kesinti örneği salt-okunur eşleştirmeyle henüz doğrulanmadı. CI/Chrome public smoke, muhasebeci oturumunda gerçek tutarın teyidi değildir. Girilmiş veya ödenmiş fişler test için yeniden işlenmedi.


## 04.11.2026 — DESEN Google Drive tek model / DTF / PSD kaynak ilişki revizyonu (PR #517)
- GitHub: [PR #517](https://github.com/cetin60kaya-lgtm/ky-erp/pull/517), dal `feature/desen-filehub-one-model-20261104`. 04.11 ön Drive incelemesinde RGB 2026: 347, yerleşim: 694, modeller/giden PSD: en az ilk 1.000 kayıt doğrulandı; asıl dosya klasörleri değişmedi.
- Kod: MODEL ADI DTF kökünden DTF kaynak/RIP PDF ayırma, model adı+kodu alias doğrulama, çoklu model giden PSD için birden fazla canonical UUID ilişkisi, belirsiz firma/model eşleşmesinde güvenli durma, mevcut indeks için küçük parti yeniden eşleştirme, idempotent File Hub ilişki kontrolü, model kartında RGB/kaynak/yerleşim/giden PSD/DTF dosya grupları; bulut PDF yetkili görüntüleme/indirme ve sağlayıcı destekliyorsa PSD küçük thumbnail.
- **Kabul sınırı:** Tam PSD Photoshop birleşik render / 508 dpi ayrı Windows işi; otomatik tam Drive indeks + 723 model/1.551 imalat güncel canlı saha kabulü henüz yok. Production D1 ve Drive üzerinde manuel yazma/taşıma/silme/OAuth işlemi yapılmadı. Kodun tek kabul kaydı: [DESEN tek model kapsamı](KY_ERP_DESEN_DRIVE_TEK_MODEL_KOD_KABUL_20261104.md).
- Yayın durumu yalnız GitHub PR/CI/Cloudflare kanıtıyla güncellenir; PR birleştirilmeden canlı kabul edilmez.

## 04.11.2026 — Günlük Operasyon yeni personel kayıt zinciri onarıldı, Pages canlı (PR #516)
- Kullanıcı kabul hatası: Günlük Personel Girişi / Hızlı Personel ekranında yeni oluşturulan personel seçili görünüyordu; Kaydet sonrasında vardiya kalıcı değildi, yeniden açma ihtiyacı doğuyordu. PR #514 dönem doğrulama onarımı bu ayrı problemi gidermiyordu.
- Kök neden: Yeni kart sonrası `setRosterIds` yalnız React hafızasını değiştiriyor, `setRosterSaved(false)` bırakıyor, sunucudaki D1 dönem havuzuna yazmıyordu. Canlı senkron/yenileme geçici eklemeyi kaybettirebiliyordu. `saveQuick(true)` sonraki gün modalını açarken ana `selectedDate` eski günde kaldığından kayıt kapsamı uyumsuzluğu oluşuyordu.
- Kalıcı akış: `dailyOpsPersonnelFlow.js` D1 dönem personel havuzunu oku → `mode=merge` ile diğer PC verileri korunarak ekle → tekrar canlı oku → yeni kişi bulunursa başarı. `saveCard` kart oluşturma/roster kaydetmeyi ayırır, kart oluşturulmuşken ikinci defa oluşturmayı önler; kart oluşturma ve havuz kaydı kısmi başarısızlıkları açıkça raporlar. Hızlı Giriş yeni kişiyi yalnız taslak vardiya seçimi olarak gösterir, vardiya için ayrıca Kaydet gerekir. Mevcut kişiyi Listeye Ekle artık sunucuya kaydeder. `Kaydet ve Sonraki Gün` modal + ana gün/vardiya tarihlerini eşitler.
- Değişenler: `APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx`, `src/services/dailyOpsPersonnelFlow.js` ve iki regresyon test dosyası. Worker, D1 şeması, personel ücretleri, ödemeler, geçmiş kayıtlar ve yetki politikaları değiştirilmedi.
- GitHub: https://github.com/cetin60kaya-lgtm/ky-erp/pull/516 merged `c79a0aae496def275419c67940b8aa8d3dcc0928`; CI https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41846017568 SUCCESS (frontend lint/test/build, Worker typecheck/test/build).
- Production Pages: https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41846377735 SUCCESS. `https://kyerp.net/assets/DailyHrWorkspace-CxN-OWLY.js` canlı SHA256 `34eddb2cc71315788fe5f6e9ccd42d753b20b39c858c2a9df3df42965cf695db` üretim build ile eşleşti; /api/health HTTP 200, anonim personel erişimi 401, Chrome kamuya açık oturum ekranı PASS. Yalnız yetkili kullanıcının gerçek yeni personel+vardiya D1 yazma saha kabulü hâlâ ayrı; üretimde test amaçlı personel veya vardiya oluşturulmadı.
- Paralel `PR #515` aynı problemin daha dar alternatif düzeltmesini içerir ve PR #516 ile üst üste düşünülmeden merge edilmemelidir.


## 04.11.2026 — Günlük Operasyon beş sekme sistem onarımı ve canlı yayın kabulü (PR #514)
- Kapsam: Yönetim Özeti, Günlük Personel Girişi, Personel & Ücret Kartları, Dönem Kontrolü, Hakediş & Ödeme. Mevcut sekme/iş akışı korundu; paralel uygulama veya yeni veri modeli açılmadı.
- Kök neden: Günlük ekran dönem kilidi sonucunu çalışma/personel havuzu sorgularıyla aynı Promise.all başarısına bağlıyordu; veri hataları gerçek dönem kilidi gibi görünebiliyor, sık senkron ve eski yanıtlar yanlış güne/vardiyaya güven verebiliyordu.
- Onarım: Bağımsız Promise.allSettled yüklemesi; firma+tarih+aralık+vardiya kapsamlı eski yanıt kontrolü; açık/kapalı/doğrulanamayan dönem ayrımı; yazma öncesi güvenli kapılar; dönem aralığındaki başka kilitli gün yalnız havuz değişimini engeller; Worker lockGet aralık filtresi; senkron 5 s; saf bütünlük sözleşmesi ve regresyon testleri. Güvenlik, D1 vardiya/maaş/ödeme kayıtları, optimistik kontrol ve immutable log korunmuştur.
- GitHub PR: https://github.com/cetin60kaya-lgtm/ky-erp/pull/514 — merged `c204bf41614a67bde0c052021d862caf2fed1ece`. CI https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41811145091 SUCCESS (frontend lint/test/build ve Worker typecheck/test/build).
- Gerçek üretim yayın kanıtı: API+KY Güvenlik https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41811788918 SUCCESS; Pages+canlı Chrome https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41812254700 SUCCESS. Günlük Operasyon bundle `/assets/DailyHrWorkspace-BtK-DWyf.js` canlı SHA256 `92241886036e786b08f573bd2b26114f1fc7f6464ce6caaa2e0c07683d291a73`, üretim build ile eşleşti. API /api/health HTTP 200 ok=true database=d1; anonim erişimde yetki koruması 401; Chrome public mobil oturum ekranları PASS.
- İlk Pages yayınında eski `KY ERP Yönetim Merkezi` marker testi yanlış sebeple FAIL verdi; aynı mevcut frontend workflow Günlük Operasyon gerçek asset/SHA256 kontrolüne düzeltildi ve ikinci yayın SUCCESS oldu. Yeni workflow veya ekstra otomatik Actions hattı eklenmedi.
- Kabul sınırı: Üretim üzerinde muhasebeci/diğer yetkili kullanıcılarla gerçek kayıt ekleme, dönem açma-kapatma, ücret/ödeme işlemi veya D1 veri mutasyonu yapılmadı. Bu kullanıcı oturumu operasyon kabulü ayrıca gerekir; giriş yetkileri ve veri gizliliği korunur. D1 schema migration veya veri taşıma/silme yok.


## 04.11.2026 — DESEN tek menü / dosya / teknik iş akışı revizyon dalı
- Dal: `refactor/desen-tek-merkez-20261104`; production tabanı `695e8b02`. Dört görünür sekme tek “Desen Merkezi” grubunda: Gelen Desenler, Desen Havuzu, Yerleşim/Kalıp, Kontrol & Rapor.
- Gelen R2 kuyruğuyla Google Drive File Hub indeksinin ayrı kaynaklar olduğu kullanıcıya açıkça gösterilir; gizli 30 saniyelik R2 POST tarama kaldırıldı.
- Özel dosya önizlemesi `apiFetch` kimliğiyle Blob üzerinden yapılır, token URL'ye eklenmez. Modelin eksik önizlemesi kendi UUID'sine bağlanır; yerleşimde dosya/kalıp/hazır olma kontrolü sertleştirildi.
- **Durum: PR #513 taslak, kod CI PASS.** [GitHub run #41783410744](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41783410744) frontend lint/test/build ve Worker typecheck/test/build başarılı; Cloudflare merge/yayın, yetkili tarayıcı ve Drive 2026 görsel eşleştirme kabulü henüz yapılmadı. Canlı D1/Drive kaydı değiştirilmedi.
- İşin ayrıntısı ve kalan kabul kapıları: [DESEN tek merkez revizyon kaydı](KY_ERP_DESEN_TEK_MERKEZ_REVIZYON_KABUL_2026-11-04.md).

## 03.11.2026 — 2026 Excel → Desen Havuzu ve İmalat canlı kayıt kabulü
- Canlı Hakan Emp D1: 346 mevcut modele 377 görselsiz model eklendi; **723 model_records + 723 DESEN_WORKFLOW_MODEL** doğrulandı.
- **1.551** adet 2026 imalat kaydı + **1.551** model_production_links; kopuk ilişki **0**, tekrar çalıştırma dry-run'ında yeni iş **0**.
- Excel'deki **10 hatalı miktar** ve **2 birebir mükerrer** imalat satırı aktarılmadı; kaynak Excel/Drive dosyaları/2025 ve öncesi değiştirilmedi.
- D1 export yedeği alındı. Mevcut Google Drive Hakan Emp bağlantısına **DESEN/MODEL_SOURCE → modeller** (salt okunur, senkron açık) klasör ataması eklendi; `görsel/2026` aynen korunur.
- **Açık:** File Hub `modeller` taramasının bitmesi, PSD/AI/PDF gerçek önizlemeleri, mobil saha kabulü. Görsel yokken model/imalat kaydı engellenmez; görseli varmış gibi gösterilmez.
- Kod/kanıt: PR #512; [ayrıntı](KY_ERP_2026_DESEN_IMALAT_AKTARIM_KABUL_2026-11-03.md). PR CI/merge/Cloudflare yayın ayrı kabul gerektirir.



## 01.11.2026 — Firma bazlı Drive/OneDrive ve tarama devam düzeltmesi (PR kontrolü bekliyor)
- Kaynak iş dalı: `fix/filehub-sync-automatic-progress-20261101`. Detay: `DOCS/KY_ERP_FIRMA_BAZLI_DOSYA_MERKEZI_2026-11-01.md`.
- Her ana firma kendi OAuth hesapları, fiziksel klasör kökü, dosya indeksi ve yetkileri ile yönetilir; cari firma ana firma değildir. SUPER_ADMIN seçili ana firma adını/slug'ını görür.
- Google Drive ve OneDrive/SharePoint sayfalı devam imleci, cron sırasında yarım taramaya öncelik, son adım saati ve 15 saniye arayüz durum takibi; hesap kaldırma aktif bağlantıda engellenip mevcut dosya/ilişkiler korunur.
- Drive salt okunur envanter: Hakan Emp 9 üst klasör; `görsel/2026` 347 dosya, `yerleşim dosyaları` 684, `modeller` ve `giden desenler` en az 850 öğe. İkincilerin alt dosyaları ve canlı D1 model eşleşmesi henüz tam kabul edilmedi.
- OneDrive OAuth production yapılandırması mevcut ekrana göre tamamlanmamış, otomatik bağlanmış sayılmaz. Hesap secret'larına dokunulmadı. CI/merge/release gerçeği doğrulanmadan canlı PASS yazılmayacak.

## 01.11.2026 — Google Drive ilk büyük indeks: zaman aşımı ve devam motoru (FEATURE DALINDA)
- Kullanıcı ekranında Google Drive / Hakan Emp bulut bağlantısı bağlı, ancak ilk tam indeks için "Sunucu zamanında yanıt vermedi" hatası ve son tamamlanma kanıtı yok.
- Kök neden kod: ilk manuel/cron senkronu tek HTTP invocation içinde 1.200 öğeye kadar arama; klasörler BFS ile taranırken kaldığı yer D1'e yazılmıyordu. 45 saniyelik frontend timeout, Google API/D1/model ilişkisiyle birleşince büyük kökte sonuç döndüremiyordu.
- Bu feature dalında Google Drive özelinde 15 öğelik API sayfaları, D1 connection metadata üzerinde devam kuyruğu ve sayfa checkpoint'i, derinlik öncelikli klasör sırası, tenant/connection lease, başarılı kısmi adımda kilit bırakma, cron ile aynı devam fonksiyonu, doğru tamamlanma/ilerleme arayüzü eklendi. Yeni D1 şeması, token/secret değişimi, fiziksel Drive dosyası silme/taşıma ve kullanıcı izni genişletme yok.
- **Kabul sınırı:** Bu kayıt yalnız feature dalı kod durumudur. Son GitHub CI/Worker deploy, gerçek Hakan Emp tam taraması, D1 toplam dosya sayısı ve DESEN/MODEL_IMAGE 2026 ilişkisi canlı veriden ayrıca doğrulanmadan tamamlandı/canlı denmez. Google dışındaki OneDrive/Dropbox tam taramaları hâlâ eski yoldadır. Fatura, bordro, çek, çalışan evrakı vb. işlem ekranlarının tek tek File Hub entity ilişkisi/açma/yükleme testleri ayrıca eksiktir.


## 01.11.2026 — KY ERP bütün bölümler / PC-tablet-telefon TEK DOSYA DÜZENİ (GELİŞTİRME)
- Kullanıcı kararı: Hakan Emp Google Drive ana depolama, OneDrive ikinci ana bulut, NAS/yerel ek kaynak, Dropbox yedek alternatif. Tüm modüller, e-fatura/XML, irsaliye, çek/senet, kasa/banka/dekont, cari, personel özlük/kimlik/sağlık, İK aylık, PDKS/bordro, denetim/İSG, desen/DTF/imalat/boyahane/stok/firma belgeleri tek File Hub üzerinden yönetilecek. Masaüstü, tablet, telefon aynı D1 dosya kimliği ve kayıt ilişkisini kullanacak.
- Mevcut File Hub bağlantıları/Drive ana klasörleri, D1 varlık/konum/ilişki tabloları ve kullanıcı yetki zinciri korundu. Yeni paralel depolama veya migration oluşturulmadı. Kullanıcı ekranında 01.11.2026 Google Drive Hakan Emp bağlı, 1 aktif servis; eski hakan drive ajan bağlantısı bekliyor. İlk senkron ve tüm dosya indeks kayıtları henüz kanıtlanmadı.
- Uygulanan kod: 14 bölüm + 48 belge türü için merkezi sınıflandırma, mevcut dosya tiplerinin korunması, ayrı folder binding, gerçek auth ile file index preview/indir (PDF/PNG/JPG/TXT/XML; diğer formatlarda indirme), mobil kartlar ve responsif modal, hassas belge uyarısı. Hassas type için explicit folder binding zorunlu; fallback Google köküne sessiz yazma hedefi verilmez. Ham cloud download şirket sahibi sınırı ve önizleme çoklu ilişki yetkileri sıkılaştırıldı; bilinmeyen entity türü personelde kapalı.
- Sınırlar: Bu geliştirme merkezi File Hub yönetimini işler; bütün 30+ özel işlem ekranındaki (bordro, çek, fatura vs) mevcut yükleme/belge akışlarının her biri tek tek yeni File Hub'a bağlanmış veya gerçek dosya açma-yükleme saha testi PASS olmuş sayılmaz. Her modüle entity-files/resolve-storage ile kademeli entegrasyon ve gerçek HTTPS mobil kabul gerekli. Özellikle özel sağlık/bordro verisi başka modüle açılmaz. Veri taşıma/silme/otomatik klasör oluşturma yok. D1 migration yok.



## 01.11.2026 — Google Drive OAuth TOKEN hata ayrımı
- Cloudflare ky-erp-api Production Deployments ekranında son GOOGLE_DRIVE_CLIENT_ID ve GOOGLE_DRIVE_CLIENT_SECRET güncellemeleri Ready, en son active d47fcc2f Deployed olarak kullanıcının ekranında görüldü. Buna rağmen KY ERP File Hub Google OAuth dönüşünde OAUTH_TOKEN_FAILED görüldü; bağlı hesap 0, OAuth henüz tamamlanmadı.
- Kod bulgusu: tokenPost gerçek sağlayıcı error sınıfını OAUTH_TOKEN_FAILED sabit koduna indiriyordu. Secret/oturum/veri taşımadan izinli hata sınıfları eklendi: OAUTH_TOKEN_INVALID_CLIENT, OAUTH_TOKEN_INVALID_GRANT, OAUTH_TOKEN_REDIRECT_MISMATCH, OAUTH_TOKEN_UNAUTHORIZED_CLIENT, OAUTH_TOKEN_INVALID_REQUEST, OAUTH_TOKEN_NO_ACCESS; bilinmeyen hata eskisi gibi OAUTH_TOKEN_FAILED kalır. Frontend sabit Türkçe açıklama gösterir, Google error_description URL'ye taşınmaz.
- Kod test/CI + merge + Worker/Pages deploy olmadan canlı denmez; gerçek Google hesabıyla yeni authorize denemesi tamamlanmadan bağlantı PASS değildir.
- Yanlış eşleşme varsa Google Cloud KY Firebase ERP içindeki KY ERP - Google Drive istemcisinin ID/Secret çifti kullanıcı tarafından doğrudan Cloudflare'ya aktarılacak. Hiçbir secret GitHub/sohbete yazılmaz. FILE_HUB_OAUTH_KEY korunur, D1 migration yok.



## 01.11.2026 — GOOGLE YALNIZ SUPER_ADMIN YEDEK GÜVENLİK + OAUTH MARKALAMA

**Kullanıcı nihai kararı:** Google harici kimlik doğrulaması, günlük firma/personel girişi değil; yalnız KY ERP sistem `SUPER_ADMIN` için parola + mevcut güvenlik isteği sonrasında kullanılacak **yedek kurtarma** yoludur. Mevcut KY Güvenlik telefon onayı, MFA ve normal kullanıcı giriş politikası korunur. Microsoft'un var olan kurtarma akışı değiştirilmez.

- `auth-external-recovery.ts` Google başlangıç ve callback'te `SUPER_ADMIN` rolü zorunluluğu eklendi; gerçek oturum açma kimlik sağlayıcısına dönüştürülmedi; `GOOGLE_OAUTH_CLIENT_ID` ile `GOOGLE_DRIVE_CLIENT_ID` ayrı kaldı.
- Google OAuth Branding için herkese açık /gizlilik.html, /kullanim-kosullari.html statik sayfaları hazırlandı; kurumsal site footer bağlantıları aktif. Cloudflare Pages statik HTML olduğundan giriş zorunluluğu yoktur. Tek otorite kyerp.net.
- **Hukuki kabul sınırı:** KY ERP platform marka iletişim adresi üzerinden genel gizlilik ve kullanım bilgilendirmesi sağlanır; bu sayfalar çalışan bordro verileri gibi KVKK'ya konu işletme kayıtlarının resmi aydınlatma metni yerine geçmez. Veri sorumlusunun ticari unvanı, rolü, saklama/aktarım envanteri ve işleme şartları işletme tarafından teyit edilmeden KVKK uyumluluğu veya Google hassas/kısıtlı izin onayı tamamlandı sayılmaz.
- Google `https://www.googleapis.com/auth/drive` **restricted** (kısıtlı) iznini kullanıyor. Üretime alındı/Branding kayıtlı diye Google restricted verification veya güvenlik değerlendirmesi otomatik geçilmiş olmaz. `drive.file` seçeneği daha dar kapsamdır; arşivdeki mevcut tüm görsellerin taranma ihtiyacını aynı şekilde karşılayacağı doğrulanmadan scope değiştirilmez.
- Google Cloud KY Firebase ERP'de Google Drive Web client 01.11.2026 günü kullanıcı ekranıyla oluştu, redirect URI `https://api.kyerp.net/api/auth/file-hub/oauth/google/callback`. Ancak production `GOOGLE_DRIVE_CLIENT_ID/SECRET` yeni client ile eşleşmesi ve gerçek OAuth giriş/senkron kabulü henüz kanıtlanmadı. Gizli değerler repo, Drive veya sohbete alınmaz.
- Google güvenlik yedek recovery için ayrıca `GOOGLE_OAUTH_CLIENT_ID/SECRET` ve callback `https://api.kyerp.net/api/auth/external/google/callback` gerekebilir. Drive istemcisi, yalnız Drive callback ile kaydedildiyse kimlik kurtarma için geçerli değildir. Ayrı Web istemci ve MFA + doğrulanmış e-posta koşulları korunur.


## 01.11.2026 — File Hub Google OAuth redirect_uri_mismatch saha engeli ve kontrol kolaylaştırma

- Gerçek kullanıcı ekranında Google oturum açma: `400 redirect_uri_mismatch`; Google'a iletilen URI, ilgili OAuth Web client'ın Google Cloud **Yetkilendirilmiş yönlendirme URI'leri** listesinde yok veya birebir uyuşmuyor. Bu, KY ERP kullanıcısının `SUPER_ADMIN` rol engeli değildir.
- Canonical backend URI: `https://api.kyerp.net/api/auth/file-hub/oauth/google/callback`. Microsoft OneDrive: `https://api.kyerp.net/api/auth/file-hub/oauth/microsoft/callback`. Kod zaten aynı URI'leri authorization ve token exchange için kullanıyor; sırf Google'a uysun diye URI keyfî değiştirilmez.
- Kullanıcı ekranında OneDrive `configured=false`; production Worker tarafında `MICROSOFT_GRAPH_CLIENT_ID` / `MICROSOFT_GRAPH_CLIENT_SECRET` ve ortak `FILE_HUB_OAUTH_KEY` varlığı kontrollü gözden geçirilmelidir. Client ID/Secret değerleri GitHub veya sohbete yazılmaz.
- PR ile provider listeleme yanıtında **yalnız kamuya açık redirect URI** gösterilir; `registrationVerified:false` değerinin anlamı, sunucunun Google/Microsoft kayıtlı URI listesini görememesidir. Ekranda hata çözüm yolu ve tek tık kopyalama görünür. Bu değişiklik **Google Cloud Console/Microsoft Entra app kaydını dışarıdan değiştirmez**; doğru client içinde redirect URI'nin kaydedilmesi ve gerçek OAuth giriş testi tamamlanana kadar Google/OneDrive **BAĞLI DEĞİL**.
- Google konsol menüsü: Google Auth Platform → İstemciler → aynı OAuth web client → Yetkilendirilmiş yönlendirme URI'leri. Microsoft: Entra → App registrations → ilgili uygulama → Authentication → Web redirect URI. Hesap sahibi konsoldan onay verir; token/şifre/MFA açılmaz, rota değişmez.
- Saha kabul: Google OAuth onayı → seçilen kök klasör → DESEN/MODEL_IMAGE bağlama → gerçek D1 model sayısı; Microsoft OAuth → klasör listeleme/dosya örneği. Kod/CI/Pages/Worker başarısı dış provider OAuth girişini PASS saymaz.


## 01.11.2026 — Popüler bulut servis karar matrisi ve akıllı denetim

- Kullanım önceliği: **Google Drive + Microsoft OneDrive aynı anda aktif** (birini varsayılan seçmek diğerini pasifleştirmez). Mevcut SharePoint, NAS ve yerel File Agent servisleri desteklenir. Cloudflare R2 sistem önizleme/cache ve kontrollü arşiv rolünde kalır; kullanıcıya ana dosya evi gibi gösterilmez.
- Alternatifler: Dropbox (ücretsiz başlangıç 2 GB, resmi OAuth API + webhook), Box (ücretsiz 10 GB, 250 MB tek dosya limiti), pCloud (OAuth/HTTP JSON API), S3 uyumlu depolama. **Dropbox API v2 altyapısı** (OAuth authorization/refresh, klasör sayfalama, dosya tarama, indirme, oluşturma/yükleme) PR #499'da eklendi; Dropbox OAuth app ayarları ve gerçek hesap izni verilmeden aktif sayılmaz. Box ve pCloud adapterı yok, bunlar için kullanılır buton gösterilmez.
- Akıllı kontrol: `GET /api/file-hub/diagnostics` (firma bazlı D1 salt okunur) Google/OneDrive eksikliği, 24 saatten eski/yarım senkron, ERROR, DESEN/MODEL_IMAGE ataması eksikliği, MISSING/UNMATCHED dosyalar ve yerel File Agent yanıtının eskimesini izler. Sadece işlemi önerir; dosya silmez, hesap bağlamaz, habersiz sağlayıcı geçişi/klonlama yapmaz.
- Doğrulama ölçütü: Oturum sahibi Google ve Microsoft OAuth hesaplarını ayrı ayrı yetkilendirir; klasör seçimi, dosya yükleme/indirme, D1 indeks, eşleştirme, telefonu/Windows ekranı aynı API, hata/yeniden bağlama ve en az bir gerçek dosya saha testinden sonra ilgili servis **canlı aktif** sayılabilir. Proje CI/publish başarısı tek başına OAuth kullanım onayı değildir.
- Resmi sağlayıcı belgeleri: developers.google.com/workspace/drive/api; learn.microsoft.com/graph/api/driveitem-list-children; docs.dropboxapi.com; developer.box.com; docs.pcloud.com; developers.cloudflare.com/r2.


## 01.11.2026 — Bağlantılar & Depolama altı işlem alanı tam düzeni

- Mevcut alt sayfalar: Genel Bakış, Dosya Servisleri, E-posta Hesapları, Bölüm / Dosya Atamaları, Dosya İndeksi, Senkronizasyon & Agent, Yedekleme & Loglar. Mail sekmesindeki boş ekran, gerçek `AdminMailConnectionsV2` yönetimine bağlandı; hazır OAuth/onay/posta kutusu akışı yeniden kullanılacak, ikinci mail sistemi kurulmayacak.
- Bölüm→dosya türü seçimleri ilgili amaçlarla sınırlandı; mevcut atamalar düğmeyle formda açılıp düzenlenebilir. Kök klasör açık seçilmedikçe atama yanlışlıkla kaydedilmez. Okuma/yazma/senkron bayrakları mevcut File Hub sözleşmesini kullanır.
- Dosya İndeksi salt okunur `LIMIT/OFFSET` ve tenant + arama + durum filtreleriyle gerçek toplam kayıt sayısı, önceki/sonraki sayfa destekler; 300'lük sessiz kesim kalkar. D1 şema değişmez.
- Bulut OAuth servisi / yerel Agent / KY Control Hub ayrımı açık gösterilir; mevcut bağlantı, hata, son senkron, D1 model ilişki sayısı ve agent sağlığı ayrı ve gerçek kaynaklara bağlıdır. Agent anahtarı yenilemesi açık ikinci onay gerektirir.
- Yedekleme ekranı gerçek File Hub olaylarını gösterir; D1 yedek kanıtını Worker production Actions kaynağına yönlendirir. Test edilmemiş yedek varmış gibi gösterilmez. Şifre/secret, OAuth, D1 iş verileri ve mevcut dosyalar aktarılmaz/silinmez.
- Saha kabulü: X bilgisayarında firma sahibi oturumuyla Google hesabı OAuth bağlama, kök/2026 klasör ataması, manuel senkron ve canlı D1 model sayısı doğrulanana kadar toplu model açma tamamlanmış sayılmaz.


## 01.11.2026 — File Hub uygulama sahibi / kendi firma depolama erişimi düzeltmesi

- **Saha:** Hakan Emprime > Bağlantılar > Dosya Servisleri > Google Drive hesabı bağlantısı, oturumda `SUPER_ADMIN` / Uygulama Sahibi / Tüm Sistem görünürken `COMPANY_OWNER_ONLY` (403) reddi verdi. İlgili OAuth `assertCompanyOwner` ve File Hub `requireCompanyOwner` yalnız `COMPANY_ADMIN` kabul ediyordu.
- **Çözüm:** Mevcut imzalı kullanıcı oturumundaki `mainCompanySlug` ile istenen firma slug'ı **eşit olduğunda** `COMPANY_ADMIN`, `SUPER_ADMIN` (legacy `ADMIN`) için File Hub depolama yönetimi ve OAuth başlatma izni. Başka firmaya slug/header değiştirerek yazma izni **yok**; normal kullanıcı, hesap dışı tenant ve eksik firma bağlamı reddedilir. Mail onayları, MFA, OAuth şifreleme ve diğer firmaların verileri değişmez.
- **Sınır:** Kod, sahibin kendi firmasında ekran engelini giderir; Google hesabının OAuth izni yine bizzat kullanıcı tarafından verilir. Önceden eklenen `hakan drive` yerel Agent bağlantısı, Google Drive `CLOUD_API` OAuth bağlantısından ayrı tutulur; otomatik sessiz Google erişimi sunulmaz.


## 01.11.2026 — PR #497 eski sol açılır alt menü düzeni (kullanıcı onaylı)

- **Son menü kararı:** Ana Sayfa, Muhasebe, e-Belge / Faturalar, Günlük Operasyon, İK Aylık, PDKS, Desen, İmalat, Boyahane, Denetim Merkezi, Mail & Dosyalar sırası korunur. Seçili ana modülün **mevcut gerçek işlem sekmeleri sol menü altında açılır/kapanır**, başka modül açılınca önceki kapanır. Kullanıcı ekranıyla teyit edilen **Ayarlar & Sistem**, yönetim yetkisi olanlarda, ayırıcı çizginin altında ayrı açılır bölüm olarak kalır.
- Muhasebe/PDKS/İK/üretim dahil mevcut `moduleRegistry` ve `shellMenuModel` grupları tekrar kullanılır; PDKS'nin 5 grubu/18 sekmesi korunur. Üstteki `BÖLÜM İŞLEMLERİ` yatay şeridi kaldırıldı; üst açık çalışma sekmeleri ve gerçek tüm modül render yolları aynı kaldı. Değişen dosyalar `AppShellV3.jsx`, `ky-pro-shell.css`, ilgili frontend ve PDKS sözleşme testleri. Worker, D1, kimlik yetkileri ve canlı iş verileri **değişmedi**.
- [PR #497](https://github.com/cetin60kaya-lgtm/ky-erp/pull/497) **MERGED** `ffaf9f27b414b073fc2ee241e1d66e886e395d5b`. [CI #41266202229](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41266202229) frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**. [Pages #41266296013](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41266296013) production deploy ve canlı entry/Günlük Operasyon chunk smoke **SUCCESS**; release SHA `f63012c43ae946cc8336994efaeb99d1d5f8ddd4` merge SHA'nın devamıdır (behind_by=0).
- **Saha kabul sınırı:** Gerçek girişli kullanıcı oturumunda bütün alt menüleri tıklama, mobil/tablet düzeni ve tüm işleme/yazma senaryoları ayrıca teyit gerekir; CI/Pages bundle smoke bu sahada tam kabul anlamına gelmez.


## 01.11.2026 — PR #496 mevcut modül ekranlarının boş görünmesi düzeltildi

- Gerçek kullanıcı ekranlarında Muhasebe ve Günlük Operasyon sayfaları boş ve bölüm sekmeleri sayfanın ortasında görünüyordu. Kök neden PR #494'te `AppShellV3.jsx` içine eklenen sekme şeridinin 5 satırlık `shell-v3-main` grid'inde 6. kardeş olarak konumlanmasıydı; mevcut `shell-v3-workspace` yüksekliği sıkışıyordu.
- Yalnız ortak kabuk düzeltildi: Bölüm sekmeleri mevcut `shell-v3-workspace` içine, gerçek `{children}` modül ekranından önce taşındı. Modül sayfaları, alt sekmeler, rota/izin kuralları, Worker, D1 ve işletme verileri **değişmedi**. `shellCssParity.test.js` mevcut ekran/render bağlantılarını ve 5 satır grid sözleşmesini denetler.
- [PR #496](https://github.com/cetin60kaya-lgtm/ky-erp/pull/496) **MERGED** `88f6566ac96fd854ce0a70d374b3647e5dd4ec66`. [CI #41265616018](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41265616018) frontend lint/test/build + Worker typecheck/test/build SUCCESS. [Pages #41265737122](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41265737122) production deploy ve canlı entry / Günlük Operasyon bundle smoke SUCCESS; release SHA `c05c59a9582b17fd2d7675e29c9b8c98da289062` merge SHA atası (`behind_by=0`).
- **Sınır:** Bu düzeltme ortak yerleşimi hedefler. Gerçek yetkili kullanıcı hesabıyla Muhasebe, Günlük, İK, PDKS, Desen, İmalat, Boyahane, e-Belge, Denetim ve Mail bölümlerinde tüm işlem butonları/gerçek veri yazma akışları uçtan uca test edilmedi; otomatik smoke bunun yerine geçmez.


## 01.11.2026 — Desen 2026 Google Drive gerçek D1 model eşleşmesi görünürlüğü

- **Canlı kaynak kontrolü:** Google Drive `görsel/2026` 347 dosya (342 JPG, 4 PNG, 1 TIFF) olarak tekrar sayıldı. Canlı `/api/health` `ok=true, database=d1` verdi. Bu kontrol tek başına 347 model kartının açıldığı kanıtı değildir.
- **Tespit:** Yönetim > Bağlantılar & Depolama'daki elle bulut taraması yalnız dosya/klasör sayıyordu; gerçek D1 model ilişkisi ve `DESEN / MODEL_IMAGE` atamasının varlığı görünmüyordu.
- **Düzeltme:** Mevcut `POST /api/file-hub/cloud/connections/:id/sync` yanıtına bu turdaki başarılı model eşleştirme adedi, `file_hub_relations JOIN model_records` ile doğrulanan toplam görsel/ayrı model sayısı ve geçerli `DESEN / MODEL_IMAGE` bağlama durumu eklenir. Mevcut yönetim ekranı bunları gösterir; atama yoksa taramayı başarılı model kaydı gibi sunmaz. Yeni model üretimi, yetki veya D1 şeması değiştirilmez.
- **Saha kabulü:** Yetkili KY ERP oturumundan mevcut Google Drive bağlantısında senkron sonrası gerçek D1 sayısı ve 2026 klasör kapsamı kontrol edilene kadar toplu model açma **DOĞRULANMADI**. İş kanıtı PR ve yayın sonuçlarıyla ayrıca tutulur.


## 01.11.2026 — Ana menü + günlük işletme özeti revizyonu (#494)

- Kullanıcı kararı: Sol ana menü artık sırasıyla Ana Sayfa → Muhasebe → e-Belge / Faturalar → Günlük Operasyon → İK Aylık → PDKS → Desen → İmalat → Boyahane → Denetim Merkezi → Mail & Dosyalar. Yalnız en altta, yönetim yetkileri varsa Ayarlar & Sistem açılır alanı. Asistan modülü Hızlı İşlem/arama erişimiyle korunur; sırf Asistan izni Ayarlar & Sistem alanını göstermez.
- Teknik kaynak: `navigationGroups.js`, `moduleRegistry.js`, `AppShellV3.jsx`, `HomeDashboard.jsx`, `ky-pro-shell.css`, `ky-pro-home.css` ve ilgili frontend / PDKS sözleşme testleri. Eski altı ana açılır grup kaldırıldı. Mevcut tüm alt işlem tabları yatay bölüm işlem şeridine alındı; modül ID, URL, izin, Worker, D1 ve gerçek işletme verisi değişmedi.
- Ana Sayfa: Tekrarlı bölüm kartları kaldırıldı; hızlı erişim, günlük operasyon/personel/imalat/belge kontrol yönlendirmeleri ve takip listesi eklendi. Canlı metrik uydurulmuyor; tutar/adet için gerçek modüle gidiliyor.
- GitHub **[PR #494](https://github.com/cetin60kaya-lgtm/ky-erp/pull/494)** MERGED SHA `03c68fd2f1007d59b88e105d7a177f8638531680`. **[CI #41263168527](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41263168527)** frontend lint/test/build + Worker typecheck/test/build SUCCESS. **[Pages #41263286343](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41263286343)** SUCCESS: Pages production deploy ve canlı entry + Günlük Operasyon chunk smoke. Release SHA `2e424cd916f9cba16910000e5ace6b81d66ba208` PR merge SHA'sının atası olduğunu doğruladı (behind_by=0).
- **Saha kabul sınırı:** Oturumlu kullanıcıda PC/tablet/telefon gerçek tıklama, rol bazlı navigasyon, alt sekmeler ve yenileme davranışı ayrıca görsel/doğrudan kabul ister. Sadece bundle smoke bu kabul değildir.



## 01.11.2026 — Desen Google Drive JPEG → otomatik Taha model kartı (#493)

- **Kullanıcı kararı:** 2026 Google Drive `görsel` klasöründeki JPEG dosya ismi (yalnız uzantı çıkarılır) Desen model adı olur. Eksik ölçü, firma detayı, renk, Pantone veya üretim bilgisi kayıt açmayı durdurmaz. İlk tercih tam **TAHA GİYİM** firma kartıdır; farklı firma sonradan düzenlenebilir. PSD/fotoğraf paneli kaydetme otomasyonu daha sonra mevcut File Hub'a bağlanacaktır.
- **Kaynak gerçekleri:** Google Drive `görsel/2026` listesinde 347 dosya tespit edildi (2026 Ekim için mevcut JPEG yok); `giden desenler` PSD ve `modeller` müşteri orijinal arşivi korunur. Üretim/imalat geçmişinin kaynağı kullanıcının gerçek Excel dosyasıdır; otomatik üretim fişi veya tahmini imalat adedi yazılmayacak.
- **PR [#493](https://github.com/cetin60kaya-lgtm/ky-erp/pull/493):** Cloud File Hub `MODEL_IMAGE` senkronundaki dosya adı eşleştirmesi, gerçek model UUID ilişkisi, geçmiş `model_records` kartına tek ID ile bağlanma, tekil tam Taha firma ID seçimi ve yetkili kullanıcı için Google thumbnail (2 MB sınırı, R2 cache) düzeltildi. JPEG değiştiğinde cache geçersizleşir. PSD/AI/PDF **tek başına yeni hayalet model açmaz**; var olan modelle ilişkilenebilir. Yeni sözleşme testleri eklendi.
- **Kanıt sınırı:** Bu kayıt sadece GitHub kod işidir. Gerçek D1 üzerinde 2026 toplu model açma, mevcut Google Drive OAuth/bağlantı ve `DESEN + MODEL_IMAGE` klasör ataması, yedek/readiness ve uygulama senkronu doğrulanmadan **tamamlandı denmez**. Kullanıcıya yeni kurulum/token istemeden mevcut bağlantı kontrol edilecek. İlk canlı Desen Hub durum isteğine bu çalışmada eşleşen gerçek Windows yanıtı gelmedi.
- **Sıradaki ayrı iş:** 2026 JPEG dosyalarını mevcut bulut klasör taraması üzerinden idempotent eşitlemek; gerçekleşen D1 kayıt adetlerini doğrulamak; sonra Excel imalat modeli ilişkisi ve Photoshop fotoğraf paneli otomatik JPEG kaydetme akışı.


## 30.10.2026 — İmalat Üretim Girişi gerçek modal, canlı (#488)

- **Saha:** Kullanıcı PR #487'nin akordeonunu istemedi; Yeni Model Aç gibi karartılmış ekran üzerinde **merkez modal** istedi. Sayfa-içi üretim formu artık render edilmez.
- **Kod:** ProductionDirectEntryPanel.jsx createPortal(document.body), role=dialog ve aria-modal; ayrı modalOpen/onClose, klavye Tab/ESC, odak iadesi, scroll kilidi, karartılmış arka plan, X/Kapat ve işlem sürerken kapatma engeli. Model arama, yeni model, seri satırlar, son kayıtlar ve modal footer'da Toplu Kaydet korunur. Kapatınca hazırlanmış satırlar silinmez.
- **Ana ekran:** ProductionControlCenterPageV2.jsx Üretim Girişi, model listesi Üretim Gir, model detayındaki Üretim Gir ve yeni model/Desen sonrası aynı modala yönlenir. Ana ekranda artık form paneli yok; KPI ve model listesi görülür.
- **Stil:** productionDirectEntry.css responsive merkez modal, kaydırma modal içi. Eski accordion testi kaldırıldı, productionDirectEntryModal.test.js eklendi.
- **PR [#488](https://github.com/cetin60kaya-lgtm/ky-erp/pull/488)** MERGED SHA 61496ed85a64f2060307215a17063f23c6e2b5e7. [CI #41009653185](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41009653185) frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**.
- **Pages canlı [#41009803431](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/41009803431)** **SUCCESS**: Cloudflare Pages production dağıtım ve canlı bundle/chunk smoke. Release SHA 110caf4f2b9d6b1671665056424b24d5f92cbcd3; merge ancestry behind_by=0.
- **Veri güvenliği:** Worker / D1 migration / eski Excel import / yeni üretim fişi yazımı **YOK**. Yetkili oturumla modal görüntüsü, seri kayıt ve rapor doğrulaması **saha E2E BEKLİYOR**.


## 29.10.2026 — İmalat seri giriş accordion ilk açılışta KAPALI, canlı #487

- **Gerçek saha görselinde sorun:** PR #485 formunun başlığında "Daralt" görünüyordu, ancak `open=true` olduğundan 10 alanlı form ilk açılışta tüm ekranı kaplıyordu. Üst `Üretim Girişi` düğmesi yalnız scroll yapıyordu.
- **Çözüm:** `ProductionDirectEntryPanel.jsx` accordion varsayılan `false`, üretim başlığının tamamı erişilebilir tıklanabilir buton (`aria-expanded`), kapalı durumda yalnız model/tarih/hazır satır/adet özeti. Form, seri kuyruk, son fişler birlikte açılıp kapanır; taslak satırlar gizlenirken silinmez. Ana sayfa Üretim Girişi ve model Üretim Gir düğmesi `openRequestToken` ile paneli her seferinde açar.
- **PR [#487](https://github.com/cetin60kaya-lgtm/ky-erp/pull/487)** MERGED SHA `af2d799c1ece8c0f964cb64efddd9d6dd9c51883`; [CI #40935425166](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40935425166) frontend lint/test/build ve Worker typecheck/test/build SUCCESS. İlk ara test #40935240967 JSX parantezinden FAILED; düzeltildi; son test yeşil.
- **Frontend production** [Pages #40935651810](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40935651810) SUCCESS; Cloudflare Pages deploy ve canlı bundle smoke başarılı. Release SHA `446d8fbd860bbc7addf5441b331378bdc77571ee`, PR merge karşılaştırmasında `behind_by=0`.
- **Sınır:** Worker/D1 iş kayıtları değişmedi, yeni migration veya üretim satırı eklenmedi. Gerçek tarayıcıda başlığın açılıp kapanması ve taslak satır korunması kullanıcıyla kabul edilmeli. 2022/Excel veri aktarımı YOK.


## 29.10.2026 — PR #486 Tek menü, başlık, sekme ve Ana Sayfa hatası CANLI

- **PR [#486](https://github.com/cetin60kaya-lgtm/ky-erp/pull/486) MERGED:** SHA `3ecf63e34aec02561ab1ac19ede890a23194d884`. Son CI [#40930522828](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40930522828) **SUCCESS**: frontend lint/test/build ve Worker typecheck/test/build.
- **Cloudflare Pages production [#40930814034](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40930814034) SUCCESS:** deploy, canlı bundle ve Günlük Operasyon chunk smoke. Frontend yayın commit `74b1dd1d4d5a6122bf7412595b763d29e81e2849`; merge SHA atası doğrulandı (`behind_by=0`).
- **Etkiler:** `company` eksik ikon ve fallback ile Ana Sayfa crash kökü kapandı. 6 üst grup ve 15 modül tek menü kaynağından; 13 platform yönetim işlemi gerçek URL/üst sekme ile; Firma Sahibi rolleri için ayrı doğru başlık ve menü; sekme/breadcrumb adları eşit. Sol menü 270px ve uzun adlar satır kaydırır; eski izinler, formlar ve işlemler korunur.
- **Yalnız frontend:** Worker API, D1, migration, yedek/geri yükleme, canlı kullanıcı/şifre veya personel/veri kaydı değiştirilmedi.
- **Saha sınırı:** CI + Pages smoke başarılı; gerçek Süper Yönetici/Firma Sahibi oturumu, PC/tablet/telefon görünümü, bütün düğmelere tıklama ve sayfa yenileme testleri bu sohbetten ayrı kanıt gerektirir.


## 29.10.2026 — PR #486 tek menü/başlık düzeni MERGED, Pages yayın bekleniyor

- PR [#486](https://github.com/cetin60kaya-lgtm/ky-erp/pull/486) **MERGED**, SHA `3ecf63e34aec02561ab1ac19ede890a23194d884`. CI [#40930522828](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40930522828) **SUCCESS**: Frontend lint/test/build + Worker typecheck/test/build.
- Ana Sayfa `company` simgesi ve fallback; 6 grup tek `navigationGroups` kaynağı; `AdminNavigation` ile 13 Yönetim işleminde gerçek sekme/URL; Firma Sahibi için doğru başlık/izinli görünüm; çalışma tabları ve breadcrumb eşit; okunabilir menü etiketleri.
- **Yayın yolu:** yalnız `RELEASES/kyerp-frontend-production-release.json` ile mevcut Cloudflare Pages hattı. Worker/D1/migration/veri kayıtları yok. Gerçek kullanıcı rol/etkileşim ve responsive saha testi CI'den farklıdır.
- **Canlı ölçütü:** Pages workflow, bundle smoke ve yayınlanan kaynağın #486 merge SHA atası olma kontrolü. Yayın kanıtı çıkmadan canlı denmez.


## 29.10.2026 — Tek menü, başlık ve çalışma sekmesi düzeni (hazırlık)

- Kullanıcı talebi: Ana Sayfa render hatasını gider; tüm modüllerin ana menüleri, başlıkları, açılır grupları ve üst sekmeleri tek anlaşılır düzene al; mevcut işlemleri ve izinleri koru.
- Kök hata: Denetim/Firma grubu `company` için HomeDashboard ikon eşlemesi yoktu; render sırasında `<Icon/>` tanımsız bileşen çağırıyordu. `company: Building2` ve varsayılan `LayoutDashboard` ile düzeltiliyor.
- `navigationGroups.js` ana gruplar, sıra ve başlıkların tek kaynağıdır: Personel & İK, Üretim (Desen→İmalat→Boyahane), Muhasebe & Finans, Denetim & Uygunluk, İletişim & Dosyalar, Yönetim & Sistem. Modül key/permission/URL korunur.
- `navigationTitles.js` üst açık sekme ve breadcrumb isimlerini tek standarda bağlar; `useWorkspaceTabs.js` her render'da güncel canonical sekme adını kullanır. Menü satırları kırpılmadan sarılır; PC sol menüsü 270px tutarlı genişliktedir.
- `adminNavigation.js` Yönetim, Güvenlik, Sistem için 13 gerçek işlem yolunu hem registry hem yönetim paneline tek kaynaktan sağlar. Tıklama `openModule` ile gerçek adres, üst sekme, geri tuşu ve çalışma alanına yansır; gizli/eski linkler kalır. Firma yetkilileri ayrı route ile açılır; 6 firma/4 paket açılır form, API ve yetki akışına dokunulmaz.
- Bu değişiklik yalnız UI/navigasyon kaynaklarını etkiler; Worker, D1, migration, muhasebe/PDKS veri kayıtları, kullanıcı hesapları ve güvenlik ayarları değişmez.
- Kanıt: kod branch test/PR/Pages dağıtımıyla doğrulanacaktır; gerçek kullanıcı oturumunda PC/tablet/telefon tıklama kabulü ayrıca yapılmalıdır. Canlı kanıt yoksa canlı denmeyecektir.


## 29.10.2026 — İmalat açılır seri kayıt ve model arama, CANLI (#485)

- **Kullanıcı talebi:** 10 alanlı Excel üretim fişi korunarak günlük giriş açılır-kapanır olsun. Model adı yazdıkça kayıtlı model çıksın, kayıtlı yoksa aynı yerde yeni model açılsın; hazır **Ön/Arka/Kol** ve diğer baskı bölgeleri select; **Satır Ekle → Seri Liste → Toplu Kaydet**, satır düzenleme/seçili sil/tümünü temizle.
- **Kod:** `ProductionDirectEntryPanel.jsx` yeniden düzenlendi. Tek autocomplete, firma bağlamına göre kanonik model ID seçimi ve yeni model (firma/baskı bölgesi) oluşturma; makine adı/no ve gündüz-gece bağımsız makinacı; 100 satırlık geçici sıra, net adet, güvenli satır idempotency `requestId`, hata halinde kalan satırları tutma. `productionDirectEntryOptions.js` + test ve `productionDirectEntry.css` yeni responsive tasarım. Eski metin/CSV işlemleri ve model-üretim raporu korunur.
- **PR [#485](https://github.com/cetin60kaya-lgtm/ky-erp/pull/485)** MERGED, SHA `4c738d22ec761c27ab5097a108e0636916048dda`. **CI [#40926471806](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40926471806) SUCCESS:** frontend lint/test/build ve Worker typecheck/test/build.
- **Pages production [#40926683795](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40926683795) SUCCESS**, Cloudflare Pages deploy + canlı bundle / Günlük Operasyon chunk smoke PASS. Yayın commit `d1a72206d6b5edf8ad58af5946899bab5ba8773e`; PR merge karşılaştırmasında `behind_by=0`.
- **Worker değişmedi**: en son başarılı Worker kodu kullanılır. Yeni D1 migration / geçmiş Excel import / otomatik üretim veya muhasebe kaydı yapılmadı. Satır sadece yetkili kullanıcı **Toplu Kaydet** diyince gerçek D1'e yazılır; fiş adedi/rapor/şirket saha E2E henüz kullanıcıyla test edilmedi.


## 29.10.2026 — PR #483 Yönetim ve Sistem iki parça canlı yayın kanıtı

- **PR #483 MERGED:** SHA `1148e8785514fd3705dd243999d31ebcfc8cfe6b`. CI [#40923106664](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40923106664) **SUCCESS**: Frontend lint/test/build ve Worker typecheck/test/build.
- **Frontend/Pages production:** [#40923576411](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40923576411) **SUCCESS**: CI, Pages deploy, canlı bundle ve Günlük Operasyon chunk smoke.
- **Worker/API production:** [#40923576318](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40923576318) **SUCCESS**: Worker typecheck/test/build, canlı D1 tam export + GitHub backup artifact, D1 salt-okunur schema kontrolü, Worker deploy, canlı API health.
- **Kaynak ve kapsam:** Tek kontrollü release kaydı `500da9fb6aae1b8ad8c106ef8879b40154697f8b`, PR #483 kod SHA'sının atasıdır. Firma Denetim ana menü ayrımı; Yönetim/Güvenlik/Sistem açıklamalı ve rol bazlı bölümler; firma ve paket açılır panelleri; yetki/giriş kontrolleri; D1 atomik paket kaydı; açıklama kaydı; eski build kaynak varsayımının kaldırılması canlı yayınlandı.
- **Migration yok:** 0060/0061/0062 uygulama adımları atlandı; canlı kullanıcı, firma, ödeme veya üretim verisine test yazımı yapılmadı. KY Güvenlik telefon onayı ve oturumlu owner/firma saha kabulü ile gerçek backup restore ve EXE testi henüz ayrı kanıt gerektirir.
- **Yayın notu:** GitHub Actions canlı sağlık/bundle sonucunu kanıtlar; ayrı gerçek kullanıcı senaryolarını kanıtlamaz. Bağımsız URL kodu doğrulaması bu sohbette DNS erişim kısıtı nedeniyle yapılamadı.


## 29.10.2026 — Yönetim ve Sistem son düzenleme (#483)
- Menü, üç ana yönetim alanı ve rol bazlı alt işlem kartlarına ayrıldı. Firma kartındaki 6 işlem, paket/fiyat ekranındaki 4 işlem açılır panel olarak düzenlendi; mevcut kayıt ve butonlar korunur.
- Denetim & Evrak Takibi firma işlemlerine taşındı, COMPLIANCE izni ve eski rotalar korundu. DENETIM/PDSK okuma hesabı firma belge denetimiyle karıştırılmadı.
- Firma sahibi platform-sahibi teknik sayfalarını görmez. Yetki ataması yalnız seçili firma içindeki kullanıcıya açıktır; verme/kaldırmada onay gerekir. Kaynak yanıtı başarısızsa sayaç sıfır sayılmaz.
- /api/system/status kimlik doğrulama gerektirir, /api/health kamusal kalır. Paket ve hareket kaydı D1.batch ile atomiktir. Firma açıklaması json_store'da atomik saklanır; migration yoktur.
- Build panelinde eski PDKS 1.9.0/20260907 otomatik dalı kaldırıldı. Ürün, sürüm, dal seçimi gerekir. Gerçek EXE, Build Agent ve SHA256 saha kabulü ayrıca gerekir.
- Canlı kullanıcı, üretim verisi, yetkiler, dosyalar, cihazlar, veritabanı veya EXE üzerinde mutasyon/test yapılmadı. CI sonuçları ve production deploy kanıtı ayrıca doğrulanır.


## 29.10.2026 — İmalat doğrudan üretim girişi, Excel 10 alan (#484)

- **Kaynak**: Kullanıcının `İMALAT BASKI MUHASEBE (1).xlsm` üretim sayfası. Excel başlıkları (asıl A:O): Tarih, Sipariş No, Model Adı, İrsaliye Adedi, **Adet**, Zemin Renk, Baskı Bölgesi, Makina No, Vardiya, Makine Adı, Kumaş Sakatı, Baskı Sakatı, Makine Sorumlu, Makine Yardımcı, Toplam Adet. **Yalnız kullanıcının istediği 10 alan** üretim fişine alındı: Model Adı, Tarih, Adet, Vardiya, Makina No, Zemin, Baskı Bölgesi, Baskı Sakatı, Kumaş Sakatı, Makinacı. Yardımcı/Excel toplamı/sipariş/irsaliye adedi bu günlük formda zorunlu değil.
- **Yeni UX**: `ProductionDirectEntryPanel.jsx` ana İmalat/Model ve Üretim Merkezi ekranında görünür. Model adıyla ara ve ID seçimi, tarih, tam sayı adet, makine ve gündüz/gece vardiya, makinacının manuel düzenlenmesi, zemin/bölge, iki sakat adet; net sağlam adet önizleme. **Üretimi Kaydet** `POST /api/production-center/entries` kanonik mevcut API'ye gönderir. RequestId/idempotency + çift tıklama kilidi, işlem sonrası yalnız adet/sakatları temizleme; son 8 gerçek üretim fişini salt okunur gösterir. Kullanıcıya uydurma üretim sayısı girilmedi.
- **Akış**: Model listesinde **Üretim Gir**, yeni manuel model oluşturma ve Desenlerden Model Al sonrasında ana kayıt alanına gider. Metin tabanlı Akıllı Seri Giriş ve Geçmiş CSV Al, **Diğer işlemler** altına taşındı. Düzenleme/arşiv ve ayrıntılı fiş çekmecesi korunuyor.
- **Kodu**: PR [#484](https://github.com/cetin60kaya-lgtm/ky-erp/pull/484) **MERGED**, SHA `98440423bc7f988ea491a6c221155c3fb787ab07`. CI [#40921768293](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40921768293) Frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**. Form validasyonu testleri `productionDirectEntryValidation.test.js`.
- **Frontend production**: [Pages run #40922008771](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40922008771) **SUCCESS**; frontend bundle smoke PASS; release SHA `49d954c8c6dbb5b5528c66f117385b7ccd7c72ff`, #484 merge ancestry `behind_by=0`.
- **Sınır**: Backend değişmedi; en son başarılı API/Worker #40918328487 kalır. Yeni migration, D1 veri aktarımı, muhasebe/KDV/LOT, İşNet veya otomatik üretim fişi yazımı yok. **Gerçek kullanıcıyla bir üretim fişi kaydı, son fişte görünmesi ve rapor mutabakatı** saha kabulü gerekiyor. Eski 2022/Excel toplu kayıt aktarımı yapılmadı.


## 29.10.2026 — İmalat rol/firma koruması #481, Worker yayın ENGELLENDİ

- **PR #481** (merge `20bada4b25870b5ab3656e8d4696df363edbd9a9`) `production-tenant-guard.ts` ve `main.ts` üzerinden `/api/production-center`, `/api/model-flow/*`, `/api/production/*`, `/api/imalat/kayitlar`, `/api/uretim/seri/*` yollarını oturum + `IMALAT` görüntüleme/ekleme/düzenleme/silme yetkisi + tek firma sınırıyla korur. Çapraz/eksik tenant ve izinsiz işlem reddedilir. Bu düzeltme önceki 24 görünüm auditinde fark edilmeyen kritik eksiktir. Gerçek istismar gözlenmedi.
- [PR CI #40896867570](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40896867570) **SUCCESS**: frontend ve Worker test/build. Gerçek rol oturumuyla E2E henüz yapılmadı.
- **Worker canlı yayını [#40897128218](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40897128218) BAŞARISIZ**, 1. deneme ve güvenli tek tekrar: `wrangler d1 export ky-erp-db --remote` aşamasında Cloudflare `internal error`. İlk D1 export ref `s6jco36imhdsjd6gibommcag`; tekrar ref `l11qk5ad8vs1a6ihu1t9vv0l`. Yedek zorunlu olduğundan **Worker deploy yapılmadı**, migration da yapılmadı. D1/veri bütünlüğü bozulduğuna ilişkin kanıt yok. Cloudflare D1 servisinde 29.10 günü yaşanan genel hatalar olası bağlantı ama kesin kök neden değildir.
- **Hâlen canlıdaki son başarılı Worker:** [#40892183913](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892183913) (PR #480). **Canlı Pages:** [#40892328950](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892328950) (PR #480). #481 güvenlik kodu **merge+CI PASS**, **henüz canlı Worker değil**.
- Öncelikli sonraki kapı: Cloudflare D1 tam export tekrar çalışır hale gelene kadar **yedeği atlama, Worker deploy yapma**. Yeni migration yok; eski Excel/2022 aktarımı yok. 24 görünüm gerçek yetkili saha kabulü hâlâ açık.


## 29.10.2026 — #480 canlı yayın doğrulaması

- PR #480 merge `da208e3619331a3a3d5e85d25b5a4f9f6dfce97e`. Canonical [CI #40891809902](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40891809902) Frontend + Worker SUCCESS.
- **Worker/API** [#40892183913](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892183913) SUCCESS; deploy source `1470cf7afa14b5e4bc57353712733b9ffc19d34b`; D1 tam backup artifact, yeni migration SKIPPED, schema read-only, Worker deploy ve `api.kyerp.net` health PASS.
- **Pages/UI** [#40892328950](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40892328950) SUCCESS; deploy source `b067a516537d984765ed30ddb8c29a147c6f7a99`; Pages production, gerçek bundle/Günlük Operasyon chunk smoke PASS.
- **Ancestry:** PR merge SHA → Worker ve Pages compare ikisinde de `behind_by=0`. #480 kodu iki canlı kaynakta da mevcut.
- **Açık:** 24 bölüm görünümünün yetkili gerçek kullanıcı ve finans/LOT/İşNet/makine/yerleşim uçtan uca saha kabulü *BEKLİYOR*. CI/PAGES/WORKER success bu kabulün yerine geçmez. 2022/Excel aktarımı ve test için veri oluşturma YAPILMADI.


## 29.10.2026 — DÖRT MODÜL 24 GÖRÜNÜM SON RÖTUŞ (#480)

- Kullanıcı kararı: tüm bölümleri ve sekmeleri ayrı ayrı kontrol et, tasarım/işlem/ortak ilişkiler kullanımda bitir; 2022 ve eski Excel aktarımına odaklanma.
- **PR #480 MERGED** squash SHA `da208e3619331a3a3d5e85d25b5a4f9f6dfce97e`; [CI #40891809902](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40891809902) Frontend lint/test/build ve Worker typecheck/test/build SUCCESS. [24 ekran saha kaynak/kabul matrisi](KY_ERP_24_EKRAN_DORT_MODUL_SAHA_KABUL_2026-10-29.md).
- **İmalat:** pasif makineler ayarlarda görünür/yeniden aktif olabilir, yeni fiş sözlüğünde pasifler yok; eski `/imalat/rapor` ve `/imalat/denetim` yerine kanonik model-flow + makine verisinden rapor ve filtre; modelin tüm baskı bölgeleri bitmeden tamamlanmış saymama; fişe zemin ekleme ve düzenleme, makine/vardiya/makinacı raporu; geçmiş CSV günlük ana menüde ikincil.
- **Muhasebe/e-Belge:** Müşteri irsaliyesi/fatura kontrol çekmecesinden irsaliye/fatura kanonik belge ID'sine doğrudan geçiş, boş ana firma etiketinde varsayılan sahte şirket adı yok.
- **Güvenlik/veri:** 0062 D1 migration 26.10.2026 uygulanmıştı. Bu PR herhangi D1 migration, gerçek fatura/ödeme/LOT/İşNet kaydı veya tarihsel üretim aktarmadı; yalnız kod ve test.
- **Açık gerçek saha kabulü:** 7 Muhasebe+9 e-Belge+3 İmalat+5 Desen kullanıcı oturumu/rol, finans, İşNet, LOT, cihaz ve görsel E2E **BEKLİYOR**. CI ve Pages/Worker sağlık kanıtı bu işletme işlemlerini kanıtlamaz. Yayın durumu yalnız gerçek Actions sonucuyla kaydedilir.


## 29.10.2026 — PR #479 DÖRT MODÜL CANLI YAYIN KANITI

- **PR #479** birleştirildi; squash SHA `1c40638517a07de9aa053206fd1f64bb889832be`. [Canonical CI #40888419009](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888419009) SUCCESS (Frontend lint/test/build, Worker typecheck/test/build).
- **Worker production** [#40888953951](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888953951) SUCCESS; deploy kaynak SHA `079c3fb1e2835757306aad4ea7e26b9a260a8c39`; canlı D1 tam backup/artifact, migration adımları SKIPPED, read-only schema, api.kyerp.net health PASS.
- **Pages production** [#40889288736](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40889288736) SUCCESS; deploy kaynak SHA `631eafa5fd0e67c0741d27107e8096ca86094c50`; canlı Pages deploy, public uygulama bundle ve Günlük Operasyon chunk smoke PASS.
- **Ancestry teyidi:** birleşim SHA'nın hem Worker hem Pages deploy SHA'sına karşı compare sonucu `behind_by=0`. Modül değişiklikleri canlı yayınlanan kaynaklarda mevcuttur.
- **İş kapsamı:** Muhasebe satış/alış belge listelerinden e-Belge detayına geçiş; e-Belge değişikliklerinden sonra Muhasebe/İmalat yenileme; Desen modelini kanonik kimlikle İmalat'a açma; İmalat fişi düzenleme/arşiv, üretim planı, kanonik makine/vardiya API ve pasifleştirme; yanlış model/firma eşleşmesini engelleme.
- **Kullanıcı kararı:** 2022 ve eski Excel veri aktarımı öncelik dışı; hiç gerçek tarihsel kayıt import edilmedi. **Ek D1 migration yok, gerçek fatura/İşNet gönderimi yok.** 26.10.2026 0062 migration zaten uygulanmıştı. Gerçek yetkili firma kullanıcı oturumu, bankacılık/LOT/İşNet fiziksel saha E2E ve 19 sekmenin nihai iş kabulü bu otomatik yayın/CI kanıtıyla **PASS sayılamaz**.


## 29.10.2026 — Muhasebe / e-Belge / İmalat / Desen günlük işlem bağlantıları (#479)

- **Kullanıcı kararı:** 2022 ve eski Excel kayıtlarının toplu aktarımına odaklanma; dört bölümün günlük işlemleri ve ortak Desen→Model→İmalat→İrsaliye/Fatura→Muhasebe tutarlılığı öncelikli. Eski satırlar canlı D1'e aktarılmadı.
- **PR #479 MERGED** (squash SHA `1c40638517a07de9aa053206fd1f64bb889832be`); [CI #40888419009](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40888419009) Frontend lint/test/build + Worker typecheck/test/build SUCCESS.
- **İmalat:** fiş düzenleme/arşiv geçmişi ve CAS; model planında hedef adet/sipariş/zemin güncellemesi; makine/vardiya ekranı Worker kanonik API'sine geçirildi, makine durumu D1 raw'da korunur, pasifler yeni fişte seçilmez; yıl filtresi.
- **Desen:** Model Havuzu'ndaki kayıtlar kanonik designModelId ile tek tık İmalat'a aktarılır. Farklı kimlikli modeller aynı ad nedeniyle karıştırılmaz. Belirsiz firma otomatik başka cariye atanmaz.
- **Muhasebe/e-Belge:** tedarikçi irsaliyesi/satış faturası satırından belge detayına doğrudan açılış; belge, satır, eşleşme ve yükleme değişikliklerinden sonra ilgili muhasebe/imalat ekranlarının yenilenmesi; model–belge eşleşmesinde farklı firma/sipariş karışmasını önleyen fail-closed kontrol.
- **D1 fiziksel 0062** önceki 26.10.2026 tarihinde canlıya uygulandı (kanıt: #40279707049); ek D1 migration izni açılmadı. İşNet resmî gönderimi veya test için canlı finans/üretim mutasyonu yapılmadı.
- **Yayın ve sınır:** Kaynak merge CI PASS'tir; Pages/Worker gerçek production release ve oturumlu saha E2E ayrıca kayıtla doğrulanmadan "tam canlı"/"19/19 kabul" denemez.


## 26.10.2026 — PR #472 yayın kanıtı (production 0062 migration SKIPPED)

- **Worker [#40277506081](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40277506081)** SUCCESS, deploy SHA `1ef3348135db1395bad86c51735fa1b191c84f0e`, canlı D1 tam export+artifact, read-only schema, Worker deploy ve API health başarılı; migration adımları **SKIPPED**.
- **Pages [#40277548177](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40277548177)** SUCCESS, SHA `bd1343cf7b5e1bfe460b2d50a1fe708f83df7001`, production Pages ve public bundle/Günlük Operasyon chunk smoke başarılı.
- PR #472 merge `3faa926730c6525c913603ca2f5a409d45fb6c90` her iki deploy SHA'nın atasıdır: karşılaştırmada `behind=0`.
- **Zorunlu gerçek saha kapısı**: kullanıcı ayrı açık izin verip migration `0062_accounting_physical_receipt_journal.sql` kontrollü production D1'e uygulanana kadar physical receipt/journal canlı finalize *hazır değildir*, `PHYSICAL_SCHEMA_APPROVAL_REQUIRED`. Gerçek İşNet, ödeme, stok ve makine üretim yazıları test edilmedi; 19 sekmenin yetkili kullanıcı oturumu E2E PASS değildir.


## 26.10.2026 — Fiziksel e-Belge/LOT/Boyahane journal kod kabulü #472 (migration ayrı onay)

- [PR #472](https://github.com/cetin60kaya-lgtm/ky-erp/pull/472) canonical source merge `3faa926730c6525c913603ca2f5a409d45fb6c90`, CI [#40251063644](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40251063644) SUCCESS (Worker+Frontend).
- `migrations/0062_accounting_physical_receipt_journal.sql`: **yalnız ilaveli D1 journal/lease/unique/check**, prodda APPLY ETME — kullanıcı ayrı migration izni yok. R2 0036 arşiv kuyruğu ayrıdır.
- `src/accounting-physical-journal.ts`: stok `stock_movements` ve Boyahane `json_store` canonical nesnelerine yazma, kalıcı tenant+fiziksel-satır+ürün+tedarikçi+normalize LOT kimliği, payload hash ve lease, `db.batch()` ile atomik stok hareketi/LOT/journal, bozuk/eski kayıt inceleme, kalıcı retry/restart işleyici. Stok ikinci kez artmıyor.
- Fiziksel irsaliye→fatura maliyet bağlama ikinci stok hareketini yaratmıyor; çoklu LOT ve provisional uzlaşma yalnız desteklenen/doğrulanan kanıtta, belirsiz eski geçmişte inceleme kapısı korunuyor. Mevcut e-Belge Onay/Sorunlar üzerinde kuyruk ve hata/deneme durumları; onaylı ortak HTML değiştirilmedi.
- `accounting-physical-journal.test.ts` + `accounting-physical-final-integration.test.ts`: gerçek `node:sqlite` 0062 migration iki kez, 20/100 paralel istek, LOT, stok/fatura/KDV, DB hata rollback, retry, tenant ve legacy kontrolleri. Otomatik CI geçişi **canlı D1 gerçek işletme yazma testi değildir**.
- **Açık blokaj:** production D1 üzerinde 0062 ayrı açık izinle uygulanmadıkça `PHYSICAL_SCHEMA_APPROVAL_REQUIRED`, fiziksel kesin kayıt fail-closed. Yetkili gerçek İşNet/irsaliye/Boyahane, iki PC, 19 sekme oturum/rol/banka/cihaz E2E henüz yapılmadı. Bunlara PASS yazılmaz. Onaylı eski #443–#468 kodu korundu.


## 26.10.2026 — KY ERP PRO v4.2.1 tek ekran / kesintisiz telefon onayı
- Kullanıcı hata bildirimi: onay sonrası ERP tekrar giriş istiyordu; ayrı Güvenlik sayfası React giriş akışını sonlandırıyordu.
- Çözüm PR #473, merge de0988a3a09a6f87bd5b74e2dbd57083cfea7847: aynı mobil React ekranında SELF_LOGIN challenge, 2 haneli eşleştirme, WebAuthn PIN/biyometri, sunucu doğrulamalı ECDSA V2 kararı; AuthContext yeni ERP oturumunu aynı ağaçta açar.
- Kurulu tek PWA ID/scope /guvenlik/ ve cihaz DB kyerp-security-fresh-v3 korunur; bağlı telefon /guvenlik/pro/ tek uygulama merkezine yönlendirilir. Bildirime dokununca çalışan ERP ekranı yeniden yüklenmez; ERP auth süresi dolsa bile cihaz imzalı güvenlik onayı yapılır. Açık ERP formu güvenlik bölümüne geçerken unmount edilmez.
- Güvenlikte onay, kod, oturum, cihaz, log, not ve mesajlar tek React çalışma alanında. Pages ve API iş mantığı ile aynı canonical kaynak.
- CI SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40252895682; Security Worker canlı SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40253054313; Pages canlı SUCCESS https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40253081393.
- Fiziksel Android kendi giriş + PIN + gerçek push + açık ERP işlem geri dönüşü kullanıcı cihazında henüz doğrulanmadı. Uygulama silinmeyecek; canlı veritabanı migration yok.


## 26.10.2026 — KY ERP PRO v4.2.0 TEK ANDROID PWA / CANLI WEB KABUL
- **Kullanıcının nihai kararı:** Kendi telefonunda **tek KY ERP PRO**. Canonical install ID/start_url/scope `/guvenlik/` ve güvenilir cihaz IndexedDB `kyerp-security-fresh-v3` ile mevcut P-256 imza anahtarı ve push SW korunur. Ayrı ikinci ERP veya güvenlik ikonu oluşturulmaz. Firma müşterilerinin KY Firma v4.1.0 uygulaması ayrı ürün olarak korunur.
- [PR #471](https://github.com/cetin60kaya-lgtm/ky-erp/pull/471) birleştirildi; merge `11e98747a5aa5cff9ae6d6e9ed2efb5db78d064d`. Yeni ERP çalışma alanı **`https://security.kyerp.net/guvenlik/pro/`**; aynı origin ve tek PWA kapsamı. Tam mevcut `AppV3`, `MODULES/getModuleTabs`, mevcut AuthProvider MFA/telefon onayı ve gerçek modül kodu Security Worker statik varlıklarına **ayrı Vite entry build** ile derlenir. Android alt çubuk, hızlı güvenlik erişimi, gerçek modül kartları, arama ve tüm sekmelerin açılır listesi var. Eksik modüle göstermelik ekran oluşturulmaz; yetkiler backend ve mevcut UI RBAC kapsamındadır.
- **CI sonucu:** [UI acceptance #40249665385](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40249665385) SUCCESS: frontend lint/test, normal Pages build, tam PRO build ve Cloudflare Worker dry-run. [Pages #40249886468](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40249886468) SUCCESS. [Security Worker #40250147392](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40250147392) SUCCESS: hem API/sürüm/doğrulama hem `/guvenlik/` 200 / `<title>KY ERP PRO v4.2.0</title>`, manifest 200, SW 200, `/guvenlik/pro/` 200, `/guvenlik/pro/ik/personel-kartlari` 200; `/ky-firma/` 200, eski `/ky-sistem/` 308 ve `/security/` 410.
- **Sınır**: Gerçek Android cihaz üstünde biyometri, canlı push, gerçek oturum, tüm modüllerin her CRUD aksiyonu ve ekran görüntüsü/scroll testi henüz ayrı ayrı gerçekleştirilmedi; kod/HTTP/CI başarıları bu E2E kabulünün yerine geçmez. Kullanıcı eski uygulamayı **silmeyecek**; mevcut PWA aynı kimlikle güncellenecek. Canlı D1 veri migrasyonu/iş verisi değiştirilmedi.
- Eski [PR #470](https://github.com/cetin60kaya-lgtm/ky-erp/pull/470) birleşik ürün kararı nedeniyle **kapalı**, prod'a merge edilmedi.


## 26.10.2026 — KY Güvenlik v4.1.0 tek PWA TAM CANLI WEB KANITI
- [PR #466](https://github.com/cetin60kaya-lgtm/ky-erp/pull/466) merged `8abdb7d99078e37aa0b810c538a2621de4fcfcf2`; [CI #40243582440](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243582440) SUCCESS. [Cloudflare Pages #40243835815](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243835815) SUCCESS, SHA `920c138a8fad043c3c651aeff4c61c2556fe03e0`, PR #466 atası (compare behind=0).
- [PR #469](https://github.com/cetin60kaya-lgtm/ky-erp/pull/469) merged `569198eb926a19fdba4987c9ad8ddb5d1fa409f7`; [CI #40244411439](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40244411439) SUCCESS. Cloudflare Worker static assets `html_handling: none` 307 self-redirect loop kök çözümü. [Security Worker #40244530715](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40244530715) SUCCESS SHA `882b809339b34130a13ed00bbd42e5f32603da8f`, PR #469 atası (behind=0).
- **Gerçek canlı HTTP**: `/guvenlik/` 200 ve `<title>KY ERP Güvenlik v4.1.0</title>`; `/guvenlik/manifest.webmanifest` 200; `/guvenlik/sw.js` 200; `/guvenlik/app.js` 200; `/ky-firma/` 200; `/ky-firma/manifest.webmanifest` 200; eski `/ky-sistem/` 308 -> `/guvenlik/`, eski `/security/` 410. API kodsuz enrollment ve relink koruması doğru `SECURITY_ENROLLMENT_CODE_REQUIRED`.
- **Kalıcı tek uygulama kuralı**: telefondaki mevcut `/guvenlik/` PWA aynı manifest id ve cihaz DB ile güncellenir; ikinci owner PWA kurulumu veya telefonu hemen silme yoktur. Firma sahibi ayrı `/ky-firma/` PWA. Canlı D1 iş verisine dokunulmadı.
- **Henüz kabul edilmeyenler**: kullanıcının fizikî Android telefonunda kurulu ikon açma, biyometri, push-onay, arka plan bildirimi ve gerçek oturum E2E testi. Finans/İK/İmalat ayrıntılı mobil owner iş analizi tamamlanmış değildir. Bu başlıklarda **tam telefon kabulü YOK**, web deploy SUCCESS.


## 26.10.2026 — Son kesin kayıt / İşNet sertleştirme PR #468 (Worker canlı)
- [PR #468](https://github.com/cetin60kaya-lgtm/ky-erp/pull/468) merged `fc1a5fbb5bc05d64ff8b51baa6f89d436d498285`. [CI #40243561868](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243561868): Frontend ve Worker SUCCESS.
- Kesin kayıt sırasında `FINALIZING/APPROVED/FINALIZE_RETRY` belgeye dış PATCH, tekil/toplu eşleştirme kilidi eklendi; PATCH transaction sonrası etkilenen satır denetimli. Finalizasyon içi yetkili eşleştirme korunur. İşNet HTTP 200 ancak boş veya doğrulama yapısı olmayan cevap artık BAĞLI değil `UNVERIFIED`.
- [Son Worker production #40243691172](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40243691172) SUCCESS SHA `1eb82c38f259a48f666edc6c74715c3b951cb2f7`: tam D1 yedeği, artifact, migrations SKIPPED, salt-okunur schema, Worker deploy ve canlı API health PASS. PR #468 merge SHA atası: `behind=0`.
- Son frontend runtime değişikliği önceki [Pages #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537) SUCCESS SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`; PR #468 yalnız Worker + test değiştirdiğinden yeniden Pages dağıtımı gerekmedi.
- Kalan P0 engel: fiziksel STOCK/BOYAHANE/LOT kesin kaydında dayanıklı atomik outbox/recovery hâlâ eksik; fail-closed koruması devam ediyor. Rol/tenant oturumlu E2E, gerçek İşNet/banka/makine testleri yapılmadı; production migration izni verilmedi. **19/19 tam saha kabul PASS değil.**


## 26.10.2026 — KY Güvenlik v4.1.0 tek kalıcı telefon uygulaması
- **Yeni kullanıcı kararı:** Birden fazla sistem sahibi uygulaması yok. Tek canonical ve aynı PWA kimliği **`/guvenlik/`** (`security.kyerp.net`). Ayrı `/ky-sistem/` ve `/owner-security/` sistem sahibi paketleri kaldırıldı; eski `/ky-sistem/` navigasyonu mevcut güvenlik uygulamasına taşınır, eski service worker emekli edilir. **Firma sahipleri** için ayrı `/ky-firma/` korunur. Çalışanlar mevcut yetkili KY ERP'yi kullanır.
- Tek güvenlik uygulamasında **v4.1.0** arayüz etiketi, mevcut Süper Yönetici kontrol ekranında özet sayaçlar, ayrı kurulum çağrısının kaldırılması; güvenli cihaz veritabanı `kyerp-security-fresh-v3`, manifest id `/guvenlik/` ve API güvenlik protokolü `security-v4.0` korunur. İki bağımsız sahip PWA paketinden 12 dosya silindi. Muhasebe/İK/İmalat ayrıntılı iş analizi ayrı geliştirme maddesi olarak açıktır.
- Kod ve yayın kabul değişiklikleri: [PR #466](https://github.com/cetin60kaya-lgtm/ky-erp/pull/466), `fix/security-dual-app-release-verification-20261026` dalında; CI/merge/Cloudflare Worker-Pages yayın SHA'sı ve gerçek Android telefon kabulü doğrulanmadan **canlı/tamamlandı denmez**. Cihaz bağlantıları doğrulanmadan mevcut telefon uygulaması silinmez. Bu çalışma canlı D1 verisine dokunmaz.



## 26.10.2026 — Muhasebe + e-Belge/İşNet + İmalat P0 final risk release kanıtı
- [#463](https://github.com/cetin60kaya-lgtm/ky-erp/pull/463) ödeme defteri conditional D1.batch (20/100 SQLite, rollback) CI [#40225228760](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225228760) PASS; [#464](https://github.com/cetin60kaya-lgtm/ky-erp/pull/464) üretim requestId DB-PK + fiş/link tek transaction (20/100 SQLite, link rollback) CI [#40225824087](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40225824087) PASS.
- [#465](https://github.com/cetin60kaya-lgtm/ky-erp/pull/465) kesin kayıt CAS + gerçek user.id/sürüm/checkbox ve İşNet salt-okunur provider sağlık kontrolü, CI [#40226730180](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40226730180) PASS; [#467](https://github.com/cetin60kaya-lgtm/ky-erp/pull/467) fiziksel stok etkisi olmayan faturanın cari+bakiye+defter+KDV+POSTED kaydı tek D1 batch (20/100 SQLite, hata enjeksiyonu), CI [#40242596733](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242596733) PASS.
- [Worker production #40242759411](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242759411) SHA `39b4558b48e22dc49a3dd8e556e0f975acf2a27b`: SUCCESS, tam D1 yedek artifact, read-only schema ve API health, migration SKIPPED. [Pages production #40242893537](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40242893537) SHA `6c0e011e23fa2f4ec6cbadc9db6149696eb21098`: SUCCESS, gerçek Pages deploy ve public JS bundle smoke. PR birleşimleri her ikisinde atadır (behind=0).
- **Kritik açık:** fiziksel stok/LOT/Boyahane + muhasebe kesin kayıt tek transaction/outbox ve recovery henüz yok. Şu anda bu belgeler için `PHYSICAL_RECEIPT_ATOMICITY_REQUIRED` açık güvenli bloke (POSTED olmaz). Üretim D1 migration onayı yok; gerçek İşNet bağlantı oturumu, resmî gönderim, banka/ödeme, yetkili kullanıcı/browser ve gerçek üretim/Windows testleri yapılmadı. 19/19 saha E2E hâlâ BEKLİYOR; [tek 19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Onaylı HTML, KY Güvenlik, İK ve Günlük Operasyon değiştirilmedi.


## 25.10.2026 — KY Güvenlik / KY Firma ayrı mobil uygulama production release talebi
- Kullanıcının onayladığı mimari: **Sistem Sahibi** ayrı `/ky-sistem/` PWA (SYSTEM + ownerControlAuthorized), **Firma Sahibi** ayrı `/ky-firma/` PWA (COMPANY + companyApprover), çalışanlar mevcut `kyerp.net` yetkili ERP.
- [PR #458](https://github.com/cetin60kaya-lgtm/ky-erp/pull/458) merged `302cad6cf7c3fce19d0fdf489d451445ff003451` (CI #40223334141 SUCCESS). [PR #460](https://github.com/cetin60kaya-lgtm/ky-erp/pull/460) merged `a326e84f2ec0b6aa4b725ef183738e80ef0aa6d5` (CI #40223947320 SUCCESS). Ayrı manifest, PNG ikon, SW/push scope, telefonla onay, imzalı oturum kapatma, tek kullanımlık kod; kritik işlemlerde PIN yoksa fail-closed.
- Security host /guvenlik eski cihazları korur; yeni allowlist /ky-sistem, /ky-firma ve /ky-app-shell, legacy 410 kuralı bozulmaz. D1 migration yok, kişisel veri/şifre yazılmadı.
- **Release bildirimi**: mevcut tek frontend release kayıt dosyası ve security-trigger üzerinden açıldı. Cloudflare Pages / Security Worker canlı kanıtları ve Android Chrome telefon kabulü ayrı doğrulanacak. Canlı E2E hazır ilan edilmez. Finans/İK/İmalat detay analizi için ayrı yetkili ERP oturumu gerekir; yeni mobil panelin doğrudan iş veri analizi sonraki iştir.


## 25.10.2026 — 19 sekme kod/CI/production yayın kanıtı (en güncel)
- **Muhasebe [#453](https://github.com/cetin60kaya-lgtm/ky-erp/pull/453)** merged `f3e0d9ea32ef91982a5b98ab61fca22c285d7962`, CI #40220091676 SUCCESS: yönetim seçili dönem/KDV; cari VKN-duplicate/alias; DELETE fail-closed; kümülatif ödeme geriye kayıt 409.
- **e-Belge [#455](https://github.com/cetin60kaya-lgtm/ky-erp/pull/455)** merged `43d0c0822a6961474c2436c55bcaa2544ef8f35f`, CI #40220688716 SUCCESS: kaynaklı İşNet ve adaptör durumu, 0/1/50/100/101+ sayfalama, tenant geçişi, hatalı tarih ve POSTED yeniden düzenleme koruması.
- **İmalat [#456](https://github.com/cetin60kaya-lgtm/ky-erp/pull/456)** merged `8d7c355a93483d27536676d235e18a1e30a1513e`, CI #40221156414 SUCCESS: varsayılan firma yok, çift fiş aynı bulk engeli, stabil requestId, stale GET ve 101+.
- **19 ekran kaynak kontratı [#457](https://github.com/cetin60kaya-lgtm/ky-erp/pull/457)** merged `705307a000f689b911e7ec1c9273007ac73dfc4f`, CI #40221600062 SUCCESS: mevcut onaylı 7+9+3 rota/JSX/servis bağlantıları 19 ayrı otomatik test. **Gerçek kullanıcı E2E değildir**.
- **[Worker canlı #40221347939](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221347939)** SUCCESS SHA `cc06539f270db75a6baef39aaa950d759aaa6e8d`: tam D1 backup+artifact, schema, canlı API sağlık PASSED; migration **SKIPPED**.
- **[Pages canlı #40221736227](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40221736227)** SUCCESS SHA `fccc143b66477da6ffdea1c57c6ece7d013fc9f6`: Pages dağıtımı, public bundle ve Günlük Operasyon chunk smoke PASSED. #453/#455/#456 her iki release atası, #457 Pages atası (compare behind=0).
- 19 sekme HTML düzeni değişmedi. **İş/rol/İşNet/fiilî ödeme/gerçek üretim fişi, 1366×768/1920×1080/mobil browser ve Windows Excel TSV E2E onayı yok**; üretim D1'de test mutasyonu yapılmadı. Bu nedenle **19/19 tam kullanım kabulü KISMİ**. Güncel tek karar ve 8 sütunlu [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Alt kısımlardaki eski PR bekliyor ifadeleri tarihsel olup bu kayıt üstündür.


## 25.10.2026 — Uygulama üst şerit profil/sekme çakışması düzeltmesi
- Kullanıcının canlı 1649×929 ekran görüntülerinde SY / Sistem Yöneticisi profil alanı açık sekmelerin üzerine taşıyordu. Kök neden `responsive-core.css` içindeki PC profil düğmesine verilen genel `display:block !important` kuralı ve PC grid satırı 58px / onaylı üst şerit 64px uyuşmazlığı.
- PC profil düğmesi flex olarak sabitlendi; üst çubuk, sekmeler ve breadcrumb grid satırları eşitlendi. Uzun sekmeler yatay kayar ve kontrollü ellipsis kullanır; 3 kaynak regresyon testi eklendi. Veri, giriş güvenliği, MFA, İK veya PDKS iş kuralları değiştirilmedi.
- Kaynak PR/CI/Cloudflare Pages sonucu ayrı kanıt olarak doğrulanacaktır; kodun birleştirilmesi tek başına canlı kabulü değildir.

## 25.10.2026 — e-Belge toplu eşleştirme kesin onay PR #451 live
- PR [#451](https://github.com/cetin60kaya-lgtm/ky-erp/pull/451) merged `e2b7654daa207f209f08e713e7861ee0532898ba`; CI [#40215686365](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215686365) PASS. Toplu `reconcile-all` POST yalnız etkilediği tüm uygun açık belgeler (max 500) ve kullanıcı checkbox onayından sonra çalışır. Kısmi hata sayısı sunulur, çift tıklama engellenir, e-Belge günü yerel tarihtir.
- Cloudflare Pages [#40215803908](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215803908) **SUCCESS** SHA `0d421463de6def6d02f90a0516a21d547db39db0`, release ancestry behind=0 + canlı public bundle/chunk smoke PASS. Worker/D1/schema değişimi yok.
- Açık test: yetkili canlı oturum, gerçek İşNet XML/PDF/LOT eşleştirme, resmî gönderim, İmalat gerçek fiş/makine ve Muhasebe gerçek ödeme saha kabulü; test için üretim verisi değiştirilmedi.


## 25.10.2026 — PR #450 Muhasebe mutabakat / gider + İmalat ayarlar / rapor canlı
- PR [#450](https://github.com/cetin60kaya-lgtm/ky-erp/pull/450) merged `84e93e53f94550e00a189838b1db4abab3c6c64e`, CI #40214924202 frontend+Worker **SUCCESS**.
- Mutabakat yanlış bakiye ile `MATCHED` olamaz (frontend + Worker API); kayıt öncesi fark/dönem/kart gösterilir. Gider kaydı/şablon ayrı, POST öncesi tutar-KDV-özeti/onay/tek gönderim. Makine ayarları kısmi kaydı açık raporlar ve geri al düğmesi sunar. İmalat filtreli raporu gerçek TSV ve güvenli formül escape ile dışa verir.
- Worker [#40215087584](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215087584) SUCCESS `b4ed1440ef8b86a94cb4d9f1813d86adac2ff360`, tam D1 yedeği+artifact, schema/API health; migrations SKIPPED. Pages [#40215265216](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40215265216) SUCCESS `deee4744bbbaa90620f645441864927f597ce125`, canlı bundle smoke. İkisi de #450 merge atası behind=0.
- Kalan kritik: [19 sekme gerçek kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Yetkili girişle gerçek finans/İşNet, XML-PDF duplicate ve LOT, Excel'de gerçek TSV açılma, üretim fişi, mobil/PC gerçek uçtan uca kontrolü henüz yapılmadı; **tam kullanım kabulü değil**. Canlı D1 test kaydı yapılmadı.


## 25.10.2026 — Son kesin release ve 19 sekme kabul sınırı
- PR #449 muhasebeleştirme öncesi ayrıntılı açık onay kartı; CI #40207296821, Pages yayın #40207488400 **SUCCESS**, SHA `9bf4e6cdff36634b17b439ef59a6323c4ce27f57`; #449/#447/#443 ancestry behind=0. Pages deploy, canlı public bundle / Günlük Operasyon chunk smoke PASS. Worker #40206650866 SUCCESS, D1 migrationlar SKIPPED.
- 19/19 sekmenin gerçek oturumlu CRUD/muhasebe mutabakat/İşNet/gerçek üretim model kabulü yapılmadı; hepsi **KISMİ**. [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). D1 business kayıtlarına test mutasyonu yapılmadı.


## 25.10.2026 — e-Belge/İmalat Pages canlı ve finans açık ön onay PR #449
- Pages release [#40206928454](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40206928454) **SUCCESS**, SHA `19fe5de0ee8639853006e7c7af157cd084f3f46f`; e-Belge #447 ve İmalat #443 bunun atası; frontend deploy/bundle smoke PASS. 100+ belge ve model listesi gerçek kullanıcı E2E henüz PASS değil.
- PR #449 e-Belge belge detayı **Son Onay / Muhasebeleştir** tek tık finans yazım riski kaldırıldı: cari/kalem/LOT/KDV özet modal, açık checkbox teyidi, çift-submit guard. PR merged `719fd60fa97309230944833f95a7398b06630d88`; CI #40207296821 **SUCCESS**. Yeni Pages release + canlı smoke ve 19 sekme oturumlu saha kabulü açık.
- Gerçek D1 kayıtları, İşNet resmî belge ve fiilî ödeme testinde mutasyon uygulanmadı; [kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md).


## 25.10.2026 — En güncel 19 sekme Muhasebe / e-Belge / İmalat devam durumu
- PR #446: Muhasebe alış irsaliye+satış faturası 50'lik sunucu sayfalaması, search ve yarış durumu düzeltildi; CI #40205322671 PASS; Pages release #40205714344 SUCCESS, SHA `ea8f1bf327d38a290cca54c814214da052e80f3d`.
- PR #447: e-Belge havuz 100+ page ve gelen/giden tenant korumalı yön filtresi; merged `e15d1bcc0f1c30149720a72dc26853e0f27761b5`, CI #40206047817 PASS.
- PR #443: İmalat 100+ page ayrı mevcut PR korunarak merged `35405ffbbd172f929ad0865d0ef24e6b350e80a4`, CI #40192931624 PASS.
- PR #448: mevcut Worker production workflow migration'ları ayrıca açık izne bağlandı; merged `9afadbf5d2a0a6ce6d7f0eb6012fcb977205c40a`, CI #40206496193 PASS. Worker release #40206650866 **SUCCESS**, SHA `17245ea35ceed2077f193756176dc510da7a8c1f`; tam D1 yedek+artifact, salt okunur schema ve canlı /api/health PASS; migration adımları **SKIPPED**, D1 mutasyonu yok.
- **Açık kapı:** PR #447 / #443 frontend Pages release, sonra yetkili kullanıcıyla 19/19 belge, firma, API, İşNet, LOT, model ve ödeme onay saha testi; [satır bazlı matris](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md). Gerçek oturumlu smoke olmadan 19 sekmenin tamamı KISMİ.



## 25.10.2026 — Muhasebe 19-sekme faz 1: belge liste sayfalaması
- [PR #446](https://github.com/cetin60kaya-lgtm/ky-erp/pull/446) merged SHA `3db5852b499a02e7b62d81d2fcdc9b5ed8fe3f56`; CI [#40205322671](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40205322671) frontend/Worker **SUCCESS**. Alış irsaliyeleri ve satış faturalarında ilk 100 kayıt sınırı yerine server pagination, arama/yenileme ve stale request koruması eklendi.
- [19 sekme kabul matrisi](KY_ERP_19_SEKME_MUHASEBE_EBELGE_IMALAT_KABUL_MATRISI_2026-10-25.md) kaynak ve eksikleri per-tab kaydeder. Henüz tüm 19 ekran gerçek E2E PASS değil. e-Belge havuzu/gelen/giden `page:1`, İşNet kontrolü, tüm Muhasebe gerçek finans zinciri ve İmalat #443 kalan işlerdir.
- Merge+CI kanıtlı; **Pages release ve gerçek oturumlu browser kabulü ayrıca doğrulanmadan canlı kabul iddiası yok.**


## 25.10.2026 — 104 sekme HTML onayı; tasarım ve işlem ilk canlı paketi
- Prototip referansı: `KY_ERP_104_SEKME_TEK_HTML_TASARIM_ONAY_2026-10-25.html`; 14 ana modül, 88 görünür + 16 bağlamsal sekme. Ayrı modül sohbetlerinde ortak tasarım dosyası çakıştırılmadan işlem kodlanacak. [Tasarım/iş koordinasyon sözleşmesi](KY_ERP_104_SEKME_ONAYLI_HTML_UYGULAMA_SOZLESMESI_2026-10-25.md).
- [PR #445](https://github.com/cetin60kaya-lgtm/ky-erp/pull/445) **MERGED** SHA `1589f8488d2adf94600d2d6232b54205e4c9dd33`; [canonical CI #40200690982](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40200690982) frontend+Worker **SUCCESS**.
- [Pages #40200843799](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40200843799) **SUCCESS**, release `3d0fe3a2487e1c81da350dc4ddbec84f5c0e0c43`, merge→release `ahead=1, behind=0`. Gerçek frontend Pages/bundle/Günlük chunk kontrolü PASS; oturumlu 104 sekme görsel/işlem kabulü ayrıca bekliyor.
- İlk paket ortak Shell HTML görsel katman, PDKS aktif firma olmadan hızlı işlem yasağı, Mail Şablonları gerçek paneline yönlendirme, Güvenlik PWA canonical linki. İK/Günlük işlem kodu, canlı D1 ve Worker değiştirilmedi. Diğer modüllerin sekme bazlı işlev geliştirmesi açık.


## 25.10.2026 — Muhasebe ödeme planı ilk canlı revizyonu + GitHub tek kaynak envanteri
- **Canonical:** `codex/model-uretim-kontrol-merkezi-final`, `AppV3/moduleRegistry` + Worker/D1; detaylı envanter `DOCS/KY_ERP_TEK_KAYNAK_MODUL_KONTROL_2026-10-25.md` (ana proje kontrol belgesinin yerine geçmez).
- [PR #444](https://github.com/cetin60kaya-lgtm/ky-erp/pull/444) **merged** SHA `4807b2845d16b848fc9e3abd164443b30badec48`; [CI #40193864397](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40193864397) frontend lint/test/build ve Worker typecheck/test/build **SUCCESS**.
- [Pages production #40194066735](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/40194066735) **SUCCESS** release SHA `2f0122716173fc86ca91105a5e60b44c5e6b1e29`; merge→release **behind=0 / ahead=1**. Pages deploy + canlı entry/Günlük Operasyon chunk doğrulaması PASS; oturumlu Muhasebe ekran/gerçek ödeme kabulü ayrıca bekliyor.
- Muhasebe → Finans İşlemleri → Ödeme Planı: `Gecikenler`, `Tüm Planlar`, vade öncelikli filtre, gerçek ödeme öncesi teyit, çift tıklama kilidi, otomatik yenileme, sözleşme testi. **Gerçek D1 ödeme/cari/veri değişimi veya migration yapılmadı.**
- GitHub kaynak karışıklığı için `DOCS/docs`, `TOOLS/tools`, `DEPLOY`, migration ve workflow envanteri çıkarıldı. Referans taraması olmadan fiziksel silme/taşıma yok. İmalat PR #443 ayrı ve açık.

## 18.10.2026 — Günlük Operasyon kritik beş sekme PR #442 canlı yayın kanıtı
- `fix/gunluk-tam-denetim-kritik-guvenlik-senkron-20261018` branch PR [#442](https://github.com/cetin60kaya-lgtm/ky-erp/pull/442), **merge SHA** `9ff13b114174a7e4f0e25990dd7cb4ae44495e94`.
- [CI #39128442185](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128442185) Frontend **success** (lint/test/build), Worker **success** (typecheck/unit/integration/build). Unit includes XLSX real örnek parse, güvenlik policy, kilit, vardiya kontrol ve iki-PC CAS contract.
- [Worker production #39128578543](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128578543) **SUCCESS**. Release SHA `0f077a689a0eb536d3977a91b150952630720868`. Tam canlı D1 backup + artifact, mevcut migration readiness, Worker deploy, /api/health doğrulaması PASS.
- [Pages production #39128765495](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39128765495) **SUCCESS**. Release SHA `7dd1514484a361d4fa00f120f88dd8f0f0ceac38`. Frontend build + Pages production + canlı KY ERP Günlük Operasyon chunk doğrulaması PASS.
- GitHub kaynak ancestry: Worker `9ff13b..0f077a` behind=0 ahead=1; Pages `9ff13b..7dd151` behind=0 ahead=2. **Aynı feature merge source** hem canlı Worker hem Pages sürümlerinde yer alıyor.
- Düzeltilenler: /gunluk-operasyon/* tenant+IK API guard, DENETIM/PERSONNEL yasak, gerçek dönem lock/unlock + gerekçe + fail-closed, locked check/roster/extras, gündüz/gece check matris + bekleyen sayaç, gerçek .xls/.xlsx Excel upload önizlemesi, personel kart create/update/deactivate append-only audit, iki bilgisayar eski note/check sürümü değişmez deterministic audit CAS atomik çakışma koruması, toplu işlem kısmi başarılı/başarısız raporu, fiili ödeme ön onayı, hatalı senkron bildirimi ve kompakt arayüz CSS.
- **Gerçek personel, ücret, ödeme verisine otomatik test/örnek kayıt oluşturulmadı.** Aktif iki gerçek PC oturumuyla eşzamanlı kullanıcı kabulü, kart ücreti concurrency, güvenli ödeme kaydı ve gerçek Chrome/Epson çıktı testleri **ayrıca bekliyor**; yalnız kod/CI/yayın ile bunlar başarılı ilan edilmez.


## 18.10.2026 — Günlük Operasyon 5 sekme kritik denetim düzeltmeleri (test/yayın sürecinde)
- User request: mevcut canonical Günlük Operasyon kodunda 5 sekmenin tüm kritik yetki/işlem/kilit/senkron/hesap/Excel/log eksiklerini düzelt, kompakt tasarımı iyileştir, testsiz canlıya çıkma.
- Başlangıç canonical SHA `15bd6d0c6921c5211623a2fb28e4b694d4ce318f`, feature `fix/gunluk-tam-denetim-kritik-guvenlik-senkron-20261018`.
- Worker `gunluk-operasyon-access.ts`: oturum, IK modül izinleri, tenant header/query/body tutarlılığı ve tenant sahipliği kontrolü. `main.ts` /api/gunluk-operasyon/* koruması. Yetkisiz veya belirsiz firma fail-closed.
- Dönem kilidi: frontend D1 array status + `date`, sunucu `action: LOCK/UNLOCK` ve zorunlu gerekçe; kilit doğrulanamazsa ekran yazma kapalı. Worker'da check-only, roster add/remove ve ek ödeme/kesinti işlemleri için de kilit aralığı kontrolü. Dönem kaydı kullanıcı onayıyla aç/kapat.
- Kontrol özeti: GET attendance gerçek `hr_daily_attendance_check` vardiya onaylarını gün/gece ayrı döndürür, bekleyenler vardiya bazlı; dönemde ✓=onay, •=bekleyen, –=yok.
- Gerçek `/excel-upload` önizleme: XLSX/XLS SheetJS ayrıştırma, tarih/kimlik/firmaya ait personel doğrulama, 3MB/2500 satır, sadece işaretli yeni vardiyaları önizler, eksik/verisi eşleşmeyen personelde hata, BOŞ Excel hücresi mevcut vardiyayı silmez; `/excel-apply` ancak ayrı onayda yazar.
- Personel oluşturma, ücret dışı kart güncellemeleri, pasife alma: audit; mevcut efektif ücret değişimi audit'i korunur. Toplu kart işlemlerinde `Promise.allSettled` ile kısmi başarı tespiti, toplu ödemede kişi bazlı hata raporu ve kullanıcıdan 'fiilen ödendi' onayı.
- İki bilgisayar: D1 1.5sn versiyon polling ve eşzamanlı kayıt korumaları devam eder, senkron hatası artık kullanıcıya görünür. D1 üzerinde otomatik test personeli/ödeme yazılmaz. Race condition gerçek iki-PC testi ayrıca beklenir.
- Tasarım: dönem matrisi onay-bekleyen renk farkı, kompakt/okunur tablo sticky başlıkları, kilit/senkron güvenlik şeridi, hızlı giriş onaylı kartını belirgin yeşil, responsif.
- Kod/test sonuçları PR ve Actions sonrası girilecektir; Merge/Pages/Worker üretim yayını kanıttan önce tamamlandı denemez. Canlı D1 yeni migration yok; varsa yayın workflow full backup gate kullanılacak.


## 18.10.2026 — Günlük Operasyon A4 fiş PR #441 CANLI yayın ve düzen kabul kanıtı
- Kullanıcı gerçek Chrome baskı görüntüsünde A4 10 kişi şablonunda GENEL TOPLAM'ın sayfa taşması / tekrarını bildirdi; istek: `Ücret | Adet | Toplam` yanyana, son sayfanın altında bir genel toplam.
- PR [#441](https://github.com/cetin60kaya-lgtm/ky-erp/pull/441) **merge** SHA `0ba50a90c696bf87bf173c552f730e7725aa78b1`.
- Son commit üzerinde Frontend + Worker [CI #39111619324](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39111619324) **success**. Regression: 1,9,10,11,19,20,26,29,30 personel gerçek print fonksiyonu ile sayfalama ve son sayfa footer, 1350×5=6750 ve tarih bazlı birden çok ücret, boş dönem.
- Cloudflare Pages production [Actions #39111803910](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39111803910) **success**, release SHA `ce01a81bd2d2d95409ed3f6746b50dfaa2f4c13b`; GitHub ancestry `0ba50a90...ce01a81`: ahead=1, behind=0. CI release job canlı `Günlük Operasyon` chunk doğrulaması **PASS**. Worker/D1 değişmedi.
- Layout: A4 portrait, 5mm kenar, 286mm tek sayfa gövdesi, 2 sütun × 5 sabit 45mm fiş; üst not sayfa header'ında. Gündüz/gece satırı 4 hizalı kolon `Vardiya / Ücret / Adet / Toplam`; ek ödeme/kesinti ve net satırı fiş içinde. `GENEL TOPLAM` yalnız son sayfada.
- Bağımsız sentetik 26 kişiyle HTML/CSS → WeasyPrint PDF → pdftotext ve görsel render kontrolünde **3 A4 sayfa, ilk iki sayfada 10'ar, son sayfada 6 kişi ve 1 GENEL TOPLAM**, ekstra sayfa yok. Gerçek Chrome yazdırma önizlemesi ve fiziksel Epson cihaz testi kullanıcı oturumunda ayrıca kontrol edilecek; WeasyPrint Chrome baskı kabulünün yerine geçmez.
- Personel ücretleri, gerçek ek ödeme/ödemeler, Günlük Personel Girişi, Cloudflare D1 ve Worker verisi hiç değiştirilmedi.


## 18.10.2026 — Günlük Operasyon hakediş A4 fişi: tek satırda ücret/adet/toplam, yalnız son sayfa GENEL TOPLAM
- Gerçek 18.10.2026 Chrome yazdırma önizlemesinde 26 personel çıktısı 3 sayfa hedeflenirken GENEL TOPLAM her sayfada ve ilk 10 kişi fişlerinin altından taşarak sayfa başına tek başına atlayabiliyordu. Kullanıcı onayı: gündüz ve gece satırları `Vardiya | Birim Ücret | Adet | Toplam` yan yana ve 10 kişi / A4 (2 sütun × 5 satır).
- Kaynak: `APP/app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx`, `printDailyPaymentSlips`. Önceki `page-grand` bütün sayfalarda oluşturuluyordu, ayrıca ana çıktıda sayfa yüksekliğine dahil edilmeyen ek uyarı paragrafı ve 47mm kartlar bulunuyordu.
- Çözüm feature dalı `fix/gunluk-hakedis-a4-10-fis-sabit-20261018`: gerçek sayfa başına 10 fiş, 45mm sabit kart, her satır `Ücret × Adet = Toplam` eş sıralı grid, varsa +ek ödeme/-kesinti, net hakediş; tüm uyarı sayfa başlığının içinde; 286mm A4 gövde ve 5mm sayfa kenarı; **GENEL TOPLAM sadece son sayfanın sonunda**. Ücret geçmişinde iki farklı tarife varsa ortalama uydurulmaz, aralık ile gerçek tutar birlikte yazılır. Veri, ödeme ve D1 hiç değişmedi.
- `DailyHrA4SlipsPagination.test.js`: 1,9,10,11,19,20,26,29,30 kişi; sayfa sayısı, 10 kişi/sayfa, genel toplam tek/son sayfa, 1350×5=6750, boş çıktı, ücret tarife değişimi ve sabit ölçü kontratı.
- CI/merge/Pages deployment ancestry ve mümkünse gerçek Chromium/PDF görsel kontrolü ayrı kanıtlanacak; oturumlu kullanıcı baskı testi beklenir.


## 17.10.2026 — Günlük Operasyon Ek Ödeme/Kesinti PR #440 canlı yayın kanıtı
- PR #440 merge commit: 91bf79ba2378bc5fd47def8fd6fd2d51d5990c97. Frontend ve Worker CI #39065684356 SUCCESS.
- Worker ve D1 CANLI: Actions #39065800668 SUCCESS, release SHA ceec10a161b613688239e101e1d36b5c6da3f10c. D1 tam yedeği artifact olarak saklandı, 0061_hr_daily_payment_adjustments.sql prerequisite + tablo/trigger canlı proof başarılı. Worker deploy ve api.kyerp.net/api/health başarılı.
- Cloudflare Pages CANLI: Actions #39065964738 SUCCESS, release SHA ae7eddf69a3a8844cf822310f9ca8cffbce83fe7. Production Pages deploy + canlı giriş bundle / Günlük Operasyon chunk SHA256 doğrulaması başarılı.
- Merge commit Worker release'in 1 commit, Pages release'in 2 commit atasıdır (GitHub compare: behind=0).
- Hakediş & Ödeme → Dönem / Çıktı → Ek / Kesinti: açıklama, tarih, tutar, işlemi yapan; gerekçeli iptal, silinmeyen geçmiş, D1 sync-state, tam kuruş net tutar, A4 fişleri ve immutable ödeme geçmiş snapshot.
- Kullanıcının gerçek Chrome oturumunda görsel ve iki ayrı bilgisayar D1 sync kabulü HENÜZ yapılmadı. Gerçek personel için otomatik sahte test ödeme/ek kalem oluşturulmadı.
- Links: https://github.com/cetin60kaya-lgtm/ky-erp/pull/440 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065684356 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065800668 ; https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39065964738


## 17.10.2026 — Günlük Operasyon: Ek Ödeme / Kesinti + Kesin Log/Geçmiş
- Kullanıcı isteği: Günlük Personel Girişi ve hızlı kayıt ekranını kesinlikle değiştirmeden **Hakediş & Ödeme → Dönem / Çıktı** personel satırına küçük `Ek / Kesinti` düğmesi; prim, avans, başka ek ödeme/kesintiler; açıklama/tutar/tarih/yapan, gerekçeli iptal ve kalıcı geçmiş.
- Kod dalı `feat/gunluk-hakedis-ek-odeme-kesinti-log-20261017`: dönem-personel bazlı `hr_daily_payment_adjustments` (ACTIVE/VOID, tür ADD/DEDUCT, kuruş, actor, created/voided), değişmez `hr_daily_payment_adjustment_snapshots` ve `hr_daily_operation_audit` aksiyonları `PAYMENT_ADJUSTMENT_ADD/VOID`. Ödeme geçmişinden silme yok; ödenen fiş anlık detayları sonraki iptalden sonra bile korunur.
- Worker API `GET/POST /api/gunluk-operasyon/payments/adjustments`, `POST .../adjustments/:id/void`: tenant, çalışan, dönem, açıklama ve tutar doğrulaması; aktif ödeme varken ekleme/iptal bloke; D1 trigger ile başka bilgisayardan eşzamanlı çakışmada fail; `hr_daily_sync_state` trigger ile bilgisayarlar arası yenileme. Sadece açıklamalı `PAYMENT_CANCEL` sonrası kayıtlar yeniden açık hâle gelir.
- Hakediş ve ödeme havuzu/period-status gerçek net = vardiya + ek ödeme − kesinti. Worker `dailyAdjustmentNetCents` ile kuruş bazlı hesap; net negatifse ödeme durur. Ödeme kaydıyla aynı transaction içinde kalem snapshotları tutulur. A4 hakediş ve ödeme fişleri ile ödeme geçmişi tutarları aynı D1 defterinden gelir. Çıktı almak ödeme oluşturmaz.
- Migration `0061_hr_daily_payment_adjustments.sql`; Worker production release workflow'da **tam D1 yedeği artifact olarak saklandıktan sonra**, 0061 prerequisites ve tablo+trigger proof; DROP/DELETE yok. Frontend sadece Hakediş ekranında değişti. Canlı Pages ve Worker yayın kanıtı ayrı istenmeli.
- Öncelikli canlı kabul senaryosu (gerçek personele para/ücret değiştirmeden yetkili test): +100 TL/−30 TL, net +70 TL; aynı personel iki PC'de görüntü; gerekçeli iptal ve log; ödenmiş dönem kilidi; fiş ve ödeme geçmişi immutable; iptal edilen ödeme snapshotının korunması. **Gerçek iş verisini izinsiz test amacıyla değiştirme.**


## 17.10.2026 — Günlük Operasyon Kompakt V3 canlı yayın kanıtı
- Kullanıcı isteği: Hızlı Personel Girişi kartlarını **enine ve boyuna daraltıp** önceki düzen gibi aynı yatay sırada masaüstünde yaklaşık 5 kart yan yana göstermek, Seç/Kontrolü kart içinde ayrı butonlar halinde tek satıra almak. Kontrol edilmiş tam yeşil kart, turuncu seçim korunur.
- PR [#439](https://github.com/cetin60kaya-lgtm/ky-erp/pull/439) başarılı [CI #39056136105](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39056136105) sonrasında **merge**: `45ff7d5c33e89b4f3488975bc9d096a5565506a3`.
- Cloudflare Pages production [Actions #39056248820](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39056248820) **success** head `cbfc5e8c25dd0fef32080099ec83d2e40fe484ff`. GitHub compare merge→release **ahead=1 / behind=0**. Pages production target `ky-erp-frontend`; canlı entry `/assets/index-Dnbmp8SE.js`, Günlük Operasyon doğrulanan chunk `/assets/AppV3-Bwo1z4e6.js`, **SHA256 `54c8e57cdb74ae29d14ad04653563dd4f57ac0ad108da9dd4196e0666c56b51f`**.
- Öncelikli ekran testi: Günlük Personel Girişi → Hızlı Personel Girişi başlığında **KOMPAKT KONTROL KARTLARI V3** görünmeli; 220px kart, uygun genişlikte 5 yan yana, düğmeler birbirinden ayrı aynı satırda. Ekran daralınca otomatik sütun azalır. Eski açık oturumda kaydedilmemiş işlem varsa yenileme öncesi kaydet.
- **Açık kabul:** gerçek oturumlu kullanıcı PC ekran görüntüsüyle görsel doğrulama; iki bilgisayarlı fiziksel D1 davranış testi ayrıca beklenecek. Bu PR yalnız frontend görünümüdür, Worker/D1/personel/ödeme işlem kodu değişmedi.


## 17.10.2026 — Hızlı Personel Girişi Kompakt V3 (5 yatay kart) kullanıcı kararı
- Kullanıcı bir önceki V2'nin kartlarının **enine ve boyuna küçültülmesini**, eski ilk düzene benzer çok sütunlu tek yatay sırayı ve **Seç/Kontrol** eylemlerinin aynı kartın altında **birbirinden ayrı** yatay butonlar olarak yerleşmesini onayladı. Önceki V2 iki alt satır artık hedef değildir.
- Feature `fix/gunluk-hizli-giris-v3-kompakt-5li-20261017`: V3 görünür başlık; kart eni varsayılan **220px** (`quickCardWidth.v5`, kullanıcı slider 205–320px); masaüstünde yer varsa beş kart yan yana; en küçültülmüş kart yüksekliği yaklaşık 66–74px; tablo enine sığmıyorsa otomatik azalan sütun. Kontrol edildiğinde tam yeşil kart korunur, seçildi ama kontrol edilmediyse turuncu vurgulanır. Seç/Kontrol ayrı işlevler ve ayrı tıklama hedefleri; kısa seçili etiketi.
- `daily-quick-entry-card-v2.css` mevcut benzersiz sınıfları koruyarak V3 kompakt stile güncellendi. Eski final CSS'deki quick-person kuralları V3 kartlarına uygulanmaz. İlgili regresyon testi güncellendi.
- Sadece frontend görünümüne dokunuldu; **D1, personel ve ödeme kayıtları, iki PC eşitleme/sürüm onayı ve Worker API değiştirilmedi.** Gerçek canlı kullanıcı görsel kabulü ancak oturum içi yeni ekranla tamamlanır.


## 17.10.2026 — Hızlı Personel Girişi V2 Pages canlı yayın kanıtı
- Gerçek kullanıcı ekranında eski sıkışık kontrol alanı kaldığı için hızlı giriş kartı eski CSS sınıflarından tamamen ayrıldı.
- PR [#438](https://github.com/cetin60kaya-lgtm/ky-erp/pull/438) merge SHA: `2039e4c2f8b097fbd78ad8c748eff7fee146ee71`.
- Frontend/Worker CI: [Actions #39050680228](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39050680228) **success**.
- Cloudflare Pages production: [Actions #39050827903](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39050827903) commit `448585f9918defdbe3b38a1c92f00dfab775416e` **success**, GitHub compare `2039e4c2...448585f` ahead=1 behind=0. Canlı giriş + Günlük Operasyon chunk SHA256 karşılaştırması başarılı, AppV3 asset `/assets/AppV3-CpYVkLAU.js`, `sha256=f9af96ae6861d59c16fbcebc0685332045d6e25bf5b8d65a785e2afd34b6f16f`.
- Hızlı Giriş modalında **KONTROL KARTLARI V2** işareti; kart içi veri üstte, `VARDİYAYA SEÇ` / `KONTROL ET` alt alta. Kontrol edilen kişinin kartı tamamen yeşil ve kenarı koyu yeşil. CSS `daily-quick-entry-card-v2.css` ayrı.
- Worker/D1 için değişiklik/deploy gerekli değildir: bu PR frontend-only. Kayıt/senkronizasyon işlevine dokunulmadı.
- **Açık:** kullanıcının gerçek Chrome oturumunda V2 modalı açıp görsel ekran kabulü. Bundle SHA kanıtı oturum içi render yerine geçmez; eski açık sekme kaydetmeden yenilenmemelidir.


## 17.10.2026 — Hızlı Personel Girişi V2 / gerçek ekran tasarım düzeltmesi
- Kullanıcı gerçek canlı ekran görüntüsünde #437 sonrasında dahi eski dar/yanyana kontrol butonlarının göründüğünü bildirdi. Önceki canlı UI onayı **görsel kabul anlamına gelmiyor**.
- Kök neden analizi: `daily-hr-workspace-final.css` dosyasında aynı `quick-person` / `quick-main-toggle` / `quick-check-button` sınıflarına yüzlerce satır birikmiş `!important` ve sabit grid yüksekliği kuralı var. Son CSS yaması güvenilir uygulama garantisi vermiyordu; tarayıcı önbelleği bu gözlemi tek başına açıklamaz.
- Çözüm dalı: `fix/gunluk-hizli-giris-kart-v2-gorunum-20261017`. Eski kart sınıflarına bağlı olmayan `kyq2-*` yapısıyla personel bilgi satırı + birbirinden tamamen ayrı iki geniş seçim/kontrol satırı. Kontrol durumunda **bütün kart koyu kenarlı açık yeşil**, kontrol butonu koyu yeşil. `daily-quick-entry-card-v2.css` importu mevcut final CSS'den sonra gelir. Grid auto-rows sabit zorlaması da override edildi.
- Günlük veri kayıtları, D1 senkronizasyon, onay sürümü ve ödeme davranışına dokunulmadı. Görsel regression kontratları yenilendi.
- PR, CI, merge, Pages yayın ve **kullanıcı PC'de oturumlu ekran kabulü** ayrı kanıtlanır; ekran kabulü gelmeden tam görsel başarılı sayılmaz.


## 17.10.2026 — Günlük Operasyon PR #437 canlı yayın kanıtı
- Canonical feature PR #437 **merge edildi**: `bfd9d452c4308f88e212709ecc06907e2a7b145e`. Frontend + Worker CI: [Actions #39048318190](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048318190) **success**.
- **Pages production**: [Actions #39048530235](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048530235) `8b88e66902c14aef8efc44623fc15f697da591b9` **success**, gerçek giriş + Günlük Operasyon bundle karşılaştırması başarılı.
- **Worker production**: [Actions #39048511990](https://github.com/cetin60kaya-lgtm/ky-erp/actions/runs/39048511990) `81235934ef8aeae5af71da6929f3c745469d6ff3` **success**; tam D1 yedeği alınıp artifact'a saklandı, mevcut release hattı şema kontrolleri ve canlı API health geçti.
- GitHub compare kanıtı: feature merge `bfd9d452` hem Worker release SHA'sının **1 commit**, hem Pages release SHA'sının **2 commit** atası (`status=ahead, behind_by=0`).
- İş kapsamı: ortak dönem, D1 audit akışı, ayrı seç/kontrol + tam yeşil onay, delta-only kaydetme, check sürüm uyuşmazlığında 409, çoklu-PC roster merge/remove, tekrar eden haftalık çıktı kaldırma.
- **Açık kabul:** iki gerçek Windows/Chrome oturumunda aynı personel/gün için karşılıklı kayıt ve 409 çakışma senaryosu oturumlu uçtan uca fiziksel test olarak henüz yapılmadı. Salt CI ve deploy bunun yerine geçmez. Gerçek personel ödeme kaydı yapılmadı.


## 17.10.2026 — Günlük Operasyon / Ortak tarih, kontrol onayı ve PC eşitleme
- Kullanıcının gerçek ekran görüntülerinden: hızlı girişte personel seçimi ile kontrol onayı çok yakın, kontrol edileni güçlü yeşil göster, günlük girişin altına D1 denetim logu getir, haftalık aynı çıktıyı üreten ikinci butonu kaldır.
- Günlük Personel Girişi / Dönem Kontrolü / Yönetim Özeti / Hakediş aynı `kyerp.dailyOperations.range.v5` seçili aralığını kullanır; sekmeler ve tarayıcı pencereleri BroadcastChannel / storage üzerinden güncellenir. **Diğer PC'nin ekranını zorla aynı tarihe geçirme**; firma bazlı asıl çalışma ve onay kayıtları Cloudflare D1 ve `/sync-state` 1.5 sn kontrolüyle aktarılır.
- Hızlı giriş ilk okunan personel/vardiya ve kontrol sürümlerini tutar, sunucunun 409 `DAILY_RECORD_CHANGED` / `DAILY_CHECK_CHANGED` kontrolleri kaydetmeden önce eşleştirir. Günlük Kaydet sadece farkları yollar. Roster `mode: merge` ve hedefli `mode: remove` ile iki PC arasında diğer kişinin listesini silmez.
- D1 `/audit` son işlemleri günlük girişin altında, tarih, işlem, personel, vardiya, yapan kişiyle görünür; detaylar mevcut Log penceresinde. Kontrol onayı ayrı satır/düğme, tüm kart güçlü yeşil; seçim turuncudur.
- Dal: `fix/gunluk-operasyon-sync-log-kontrol-20261017`. Kod/test/PR/CI/merge/Pages+Worker yayın+canlı E2E için durum ayrı kanıtlanmalıdır. Gerçek personel kartına/ödeme kaydına yazma **yapılmadı**.


## 17.10.2026 — Günlük Operasyon ücret kartı / çıktılar kontrolü
- Kullanıcı kararı: personelin gündüz/gece ücretleri ve geçerlilik tarihi **Personel & Ücret Kartları** üzerinden tek kaynaktan yönetilir. Tarih etkili ücret geçmişi ve ödenmiş vardiya anlık görüntüsü korunur.
- Çalışma dalı: `fix/gunluk-operasyon-ucret-kart-cikti-20261017`; değişiklikler: ücret değişiklik geçmişi görünümü, toplu ücret güncellemede tarih, tarihli ücretlerin haftalık PDF/Excel'e eklenmesi, kullanıcı arayüzünün okunaklı/responsive düzeni.
- Güvenlik düzeltmesi: **hakediş fişi yazdırmak ödeme oluşturmaz**; gerçek ödeme ancak ayrı kullanıcı `Tamamla` eyleminde oluşur. Geçmiş haftada açık borç saklanmaz. Dönem ödeme durumu `/payments/period-status` üzerinden gerçek vardiya/ledger kayıtlarından belirlenir, veri okunamazsa `DOĞRULANAMADI` gösterilir.
- Kod + regresyon testleri feature dalına yazıldı. **CI, PR merge, Worker/Pages yayın ve gerçek D1/oturumlu kabul sonucu ayrı doğrulanmadıkça canlı veya tam test başarılı sayılmaz.** Production D1 migration ve gerçek personel ödeme kaydı yapılmadı.


## 09.10.2026 — Modül kabul kontrolü ve son açık kanıt
- PR #409 merge `2d0e33a24d4ce319baff4ae6f9cc57b670a6552d` → frontend publish `844a4337523e24d9f5f944cef5b57a5f1506051f`, Actions #37891886962 (PR CI PASS) + #37892077343 (Pages + real Chrome PASS).
- Yönetim > Sistem > Güncelleme Geçmişi > **Modül Kontrolleri** canlı; 14 ana modül, son PR ve durum görünür. Yanlış "Muhasebe" kategorisi giderildi; gerçek kullanıcı test edilmediyse "bekliyor" gösterilir.
- ChatGPT KY ERP Canlı Nöbet altı saatte bir salt okunur public API/site + GitHub yayın regresyonu izlemesi için etkinleştirildi.
- **Öncelikli eksik:** KY ERP TEST firmasında onaylı, düşük yetkili test hesap/cihazı üzerinden kimlikli işlevsel E2E: hesap+cihaz ayrı onay, PDKS, izin, makinacı üretim idempotency, yetki reddi; diğer 14 modülün yetkili ekran/işlem akışları. Test kanıtı yokken yapılan işler tamam sayılmaz. Hiçbir MFA, Turnstile veya üretim D1 kayıt güvenliği bypass edilmez.


## 09.10.2026 — Ortak güncelleme/yayın geçmişi ve yarım kalan işler
- Tüm KY ERP sohbetlerinin ortak sözleşmesi: `DOCS/KY_ERP_GUNCELLEME_YAYIN_KAYIT_SOZLESMESI_2026-10-09.md`. Değişiklik PR/commit açıklamasında; test/merge/Pages/Worker canlı kanıtları ayrı kaydedilir.
- Yönetim > Sistem > Güncelleme Geçmişi, public GitHub PR/commit/Actions verilerini salt-okunur gösterir. Yayın kanıtı olmayan iş canlı sayılmaz.
- Personel portalı PR #405 Worker + Pages canlı yayını: Action 37885380200 ve 37885546558 SUCCESS, D1 0060 migration ve backup kanıtlı. Mobil rota/hatalı giriş döngüsü PR #407 için frontend Action 37889109158 SUCCESS.
- **YENİ SONUÇ:** PR #408 merged, canlı frontend Action #37890106512 SUCCESS; yeni Güncelleme Geçmişi yönetim ekranı yayında. Önceki yarım kalan gerçek Chrome testini Pages workflow'una bağlama işi tamamlandı: canlı test 6/6 PASS, kanıt artifact 11597916502. Kalan: onaylı ayrı test personeliyle yönetici/cihaz onayı, İK/PDKS, yıllık izin, makinacı üretim ve diğer yetkili modüllerin gerçek CRUD kabulü; henüz bu işlevler E2E başarılı diye işaretlenmez.
- Modüllerde gerçek yeni mutasyon için yedek, tenant izolasyonu, rol yetkisi ve idempotency korunur. İkinci ERP/test sitesi ve MFA bypass yapılmaz.


## ZORUNLU TEK YEREL KÖK — 01.10.2026

- Tek aktif yerel KY ERP kökü: `D:\Googledrive\KYERP`.
- Tek aktif Git working copy: `D:\Googledrive\KYERP\00_CANONICAL\GITHUB\ky-erp`.
- Canlı veri otoritesi: Cloudflare D1 `ky-erp-db`; Drive SQL/DB dosyaları yedek/export/referanstır.
- Bağımsız `KYERP-PDKS-*` klasörleri kalabilir; ancak canonical değildir ve yeni sohbet/ajan bunlardan yeni iş başlatmaz.
- Eski `KYERP-MERKEZ`, `KYERP-GELISTIRME-MERKEZI` ve OneDrive `KY-ERP-MERKEZ` yolları yeni geliştirme/deploy kaynağı değildir.
- Yeni paralel KY ERP kökü veya clone oluşturulmaz. Ayrıntı: `DOCS/KY_ERP_TEK_YEREL_KOK_2026-10-01.md`.

## 21.09.2026 — Android KY ERP Güvenlik PWA final feature paketi

- Branch: `codex/security-pwa-enrollment-final-20260921`.
- Kurulum ve güvenilir cihaz bağlama ayrıldı: Android browser yalnız gerçek PWA kurulumunu, standalone uygulama yalnız enrollment/relink akışını yürütür.
- Canonical origin/path `security.kyerp.net/ky-guvenlik/`; manifest id sabit, start URL ve scope sürüm parametresizdir.
- Enrollment token kurulum boyunca aynı origin localStorage'da kısa süreli korunur ve URL'den temizlenir; bağlı cihaz IndexedDB kaydı, signing key ve push kimliği migration sırasında silinmez.
- Eski `/security/` worker/cache akışı kontrollü göç ile emekliye ayrılır. Sürümlü boot/flow/shell workaroundları kaldırılmıştır.
- Frontend lint + 173 test + production build; Worker typecheck + 458 unit test + local auth integration + dry-run build başarılıdır.
- D1/production write veya deploy yapılmadı. Sonraki adım: temiz PR incelemesi, kullanıcı onayı, production merge, Git Integration yayını ve gerçek Android cihaz smoke testi.
## 06.09.2026

**Amaç:** Yeni sohbetlerin/ajanların son yapılan işleri tekrar araştırmadan, eski notlara dönmeden ve iş sırasını bozmadan devam etmesi için güncel özet kaynak.

**Repo:** `cetin60kaya-lgtm/ky-erp`  
**Canonical production branch:** `codex/model-uretim-kontrol-merkezi-final`  
**Bu kayıt hazırlanırken production HEAD:** `e050e9c42ac32da270c672267dabf9d8413a7ab5`

> Production branch paralel sohbetlerle ilerleyebilir. Yeni sohbet bu SHA'yı körlemesine kullanmaz; her işlem öncesi güncel production HEAD'i GitHub'dan doğrular. Bu dosya yapılan işlerin ve kararların kaydıdır.

---

# 1. YENİ SOHBETİN ZORUNLU OKUMA SIRASI

1. `AGENTS.md`
2. `DOCS/KY_ERP_PROJE_KONTROL_MERKEZI.md`
3. `DOCS/KY_ERP_GUNCEL_DEVAM_KAYNAGI_2026-09-06.md`
4. Canlıya alma işi varsa: `DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`
5. Cloudflare/AI işi varsa: `DOCS/KY_ERP_CLOUDFLARE_PRO_AI_YAYIN_KAYNAGI_2026-09-04.md`
6. İlgili modülün özel kaynak/dokümanı

Çelişki sırası:
- teknik/güvenlikte `AGENTS.md`,
- güncel devam/iş sırası ve kullanıcı kararlarında bu dosya + Proje Kontrol Merkezi,
- production deploy yönteminde `KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`.

---

# 2. 06.09.2026 İTİBARIYLA TAMAMLANAN CLOUDFLARE ÇEKİRDEĞİ

Aşağıdakiler çekirdek production kurulumu olarak **tamam kabul edilir**:

- Cloudflare Pro aktif.
- Frontend production: Cloudflare Pages `ky-erp-frontend`.
- API production: Cloudflare Worker `ky-erp-api`.
- Canonical deploy: production branch -> Cloudflare Git Integration -> Pages / Workers Builds.
- GitHub Actions production deploy yolu değildir.
- Normal release sırasında kullanıcıdan PowerShell / Cloudflare tokenı / manuel deploy istenmez.
- Worker build kapısı: `npm run typecheck && npm test && npm run build`.
- Worker build fail olursa manuel deploy ile bypass edilmez; log okunur, kaynak düzeltilir, regression testi eklenir ve yeni production commitinin otomatik buildi beklenir.
- D1 migration auto-deploy'dan ayrıdır; backup + readiness + hedefli/additive migration şarttır.
- Cloudflare Managed WAF aktif ve **Observe/Log** modundadır.
- OWASP geniş enforce bilerek deferred; false-positive verisi görülmeden açılmaz.
- Login rate limit aktif: `/api/auth/login` için 10 / 60 sn / IP, 60 sn block.
- İkinci Pro rate-limit slotu bilerek boştur.
- `api.kyerp.net/api` ve `/api/*` cache bypass aktif.
- Bot policy audit tamam; Verified Bots allow ve geniş SBFM block/challenge kapalı/ertelenmiş durumda.
- Turnstile web login entegrasyonu server-side verify + fail-closed tamam.
- Owner/admin MFA zorunluluğu korunur.
- Uygulama sahibi için kalıcı browser restore kapalı.
- Uygulama sahibi rolling/automatic session refresh kapalı.
- Normal kullanıcı session davranışı owner düzeni nedeniyle bozulmaz.
- Uygulama sahibi eski tek kullanımlık recovery code akışı kapatıldı; özel soru-cevap + doğrulanmış iletişim + MFA step-up güvenli recovery modeli kullanılır.
- Workers AI binding `AI` aktif.
- Workers AI çağrıları Cloudflare AI Gateway `default` üzerinden yürütülür.
- AI Gateway request cache bypass edilir.
- Hassas ERP prompt/response persistent gateway logging varsayılan kapalıdır (`AI_GATEWAY_COLLECT_LOGS=false`).
- AI tenant/permission guard ve KY ERP billing ledger korunur.
- Serbest SQL / sınırsız AI write executor açılmamıştır.
- Management token least-privilege: D1 yalnız **Read**; D1 Edit/Billing/API Tokens/Account Members/DNS Edit verilmez.

---

# 3. CANLIYA ALMA DÜZENİ — KALICI KARAR

Normal akış:

`feature branch -> test/build -> kullanıcı onayı -> production merge -> Cloudflare Git Integration -> Pages + Workers Builds -> canlı smoke`

Kurallar:

- Kullanıcı `canlıya al` dediğinde PowerShell isteme.
- Production HEAD merge öncesi tekrar doğrulanır.
- Paralel sohbet yeni commit eklediyse eski SHA körlemesine deploy edilmez.
- Pages success + Worker fail = release tamam değildir.
- Canlı health/auth/modül smoke olmadan `tamam` denmez.
- GitHub Actions normal production release için çalıştırılmaz.
- Secret/token/recovery cevabı repo, doküman veya loga yazılmaz.

Ana kaynak:
`DOCS/KY_ERP_CANLIYA_ALMA_CANONICAL_2026-09-06.md`

---

# 4. SON DÜZELTİLEN ÖNEMLİ INCIDENT

Cloudflare Worker build otomatik tetiklenmiş ancak `notifications-cloud.test.ts` Node ESM çözümlemesinde:

`ERR_MODULE_NOT_FOUND: .../src/auth-cloud`

hatası vermişti.

Kök neden:
- `notifications-cloud.ts` içindeki extensionless TypeScript relative import.

Final çözüm:
- explicit `.ts` import,
- regression/contract testi,
- manuel deploy ile test bypass edilmedi.

Bu incident, Cloudflare Workers Builds otomatik tetik zincirinin çalıştığını ve build kapısının hatalı backend'i production'a göndermediğini doğruladı.

---

# 5. BİLDİRİM MERKEZİ SON DURUMU

- Sağ üst sabit `3` kaldırıldı.
- Rozet gerçek `unreadCount` kullanır.
- Kaynaklar: giriş onayları, e-Belge açık sorunları, ödeme hatırlatmaları.
- Tenant + kullanıcı modül yetkisi uygulanır.
- Okundu bilgisi kullanıcı + firma bazında saklanır.
- Bildirim API canonical endpointleri:
  - `GET /api/notifications`
  - `POST /api/notifications/read`
- Ayrıntılı kaynak:
  `DOCS/KY_ERP_CANLI_YAYIN_BILDIRIM_KAYNAGI_2026-09-06.md`

---

# 6. AUTH / GİRİŞ SON DURUMU

07.09.2026 itibarıyla final kullanıcı akışı:

`Turnstile -> kullanıcı adı/şifre -> kayıtlı telefon varsa KY ERP Telefonla Onay -> gerekirse firma sahibi onayı -> session -> ERP`

Telefon kaydı yoksa veya kullanıcı açıkça isterse Google/Microsoft Authenticator 6 haneli kodu fallback olarak devam eder. iPhone/iPad için Web Push yalnız Ana Ekrana eklenmiş KY ERP web app içinde etkinleştirilir; iOS action butonu göstermese bile bildirim uygulamayı açtığında foreground onay ekranı pending isteği cihaz capability anahtarıyla çeker. Telefon push verileri yeni D1 tablosu açmadan mevcut tenant-kapsamlı `json_store` içinde tutulur; bu özellik için production migration gerekmez.

Uygulama sahibi için:

- yeni browser oturumunda tekrar giriş + MFA,
- eski kalıcı owner localStorage restore kullanılmaz,
- active browser session içinde F5/yenileme çalışabilir,
- otomatik owner refresh kapalı,
- tek kullanımlık owner recovery code devre dışı,
- özel 3 soru kaydı; kurtarmada rastgele 2 soru + doğrulanmış iletişim kanalı + MFA kontrollü yeniden kurulum.

Normal kullanıcılar için:
- owner sıkılaştırması yüzünden mevcut normal session/persistence davranışı bozulmaz.

---

# 7. CLOUDFLARE'DA BİLEREK DEFERRED OLANLAR

Aşağıdakiler **eksik çekirdek kurulum değildir**:

- WAF block/enforce: event verisi görülmeden açılmayacak.
- OWASP ikinci geniş managed enforce: false-positive riski nedeniyle deferred.
- İkinci rate-limit slotu: somut endpoint ihtiyacında kullanılacak.
- Geniş Bot Fight/SBFM challenge/block: API/mobile/PDKS/File Agent riski nedeniyle açılmayacak.
- Queues / Workflows: gerçek asenkron/uzun iş ihtiyacında feature paketi.
- Vectorize / AI Search: semantik dosya/desen araması gerektiğinde feature paketi.

Yeni sohbet bunları otomatik olarak `kalan zorunlu Cloudflare işi` diye açmamalıdır.

---

# 8. ŞİMDİKİ İŞ SIRASI — KULLANICI İLE KİLİTLENEN DEVAM

Cloudflare çekirdeği kapatıldıktan sonra modül/ürün sırası:

## 1. e-Belge / İşNet + manuel fatura / irsaliye final kontrolü
Kontrol edilecek:
- İşNet gelen/giden belge akışı,
- manuel PDF/XML/JPEG okuma,
- OCR sadece gerektiğinde,
- fatura/irsaliye eşleşmesi,
- ürün kalemlerinin doğru ayrılması,
- firma/ürün alias,
- EXPENSE / STOCK / BOYAHANE yönlendirme,
- LOT gereken ürünlerde LOT zorunluluğu,
- resmî gönderimde kullanıcı onayı.

Mevcut not:
- `0046_accounting_canonical_report_controls.sql` production D1'e otomatik uygulanmaz.
- İleride ayrı bakım penceresinde backup + readiness + hedefli additive migration.

## 2. Muhasebe / Cari / FİBE final
- hızlı cari giriş/kontrol,
- haftalık gelen/giden/borç görünümü,
- resmi/gayriresmi ve elden ödeme takibi,
- firma kartında isteğe bağlı FİBE takibi,
- normal cari ile FİBE bakiyesi ayrı tutulur.

## 3. PDKS / İK final ekran + operasyon kontrolü
- Desktop/telefon/tablet uyum,
- PDKS operasyon çekirdeği,
- günlük/aylık İK,
- toplu/tekli ödeme fişleri,
- ödeme özet listesi,
- owner/admin güvenlik kuralları bozulmadan kullanıcı deneyimi.

## 4. Depolama / KY File Hub + Mail / İletişim Merkezi
- Google Drive / OneDrive / SharePoint / yerel / NAS tek File Hub,
- Mail/Gmail/Outlook entegrasyonu uygulama içinde ortak iletişim merkezi,
- dosya ve mail ilişkileri modüllerle tek contract üzerinden.

## 5. KY ERP AI / Asistan ürünleştirme
- mevcut Workers AI + AI Gateway temelinin üzerinde,
- typed/allowlisted işlemler,
- tenant/permission guard,
- kullanıcı onayı,
- audit,
- ihtiyaç çıkarsa Queues/Workflows/Vectorize/AI Search.

Bu sıra yeni sohbetlerde varsayılan çalışma sırasıdır. Kullanıcı yeni bir öncelik verirse güncellenir.

---

# 9. YENİ SOHBETE HAZIR DEVAM CÜMLESİ

Yeni KY ERP sohbeti açıldığında şu çerçeve kabul edilir:

> **Cloudflare çekirdeği tamam. Normal deploy production merge sonrası Cloudflare Git Integration ile otomatik; PowerShell yok. Owner auth sıkı, normal kullanıcı davranışı korunuyor. AI Gateway + Workers AI hazır. Şimdi modül sırasıyla e-Belge/İşNet -> Muhasebe/Cari/FİBE -> PDKS/İK -> File Hub/Mail -> AI/Asistan ürünleştirme devam eder.**

---

# 10. KAYIT GÜNCELLEME KURALI

Aşağıdakilerden biri değişirse bu dosya ve `KY_ERP_PROJE_KONTROL_MERKEZI.md` birlikte güncellenir:

- kullanıcı iş sırasını değiştirirse,
- önemli modül final/onayı oluşursa,
- production deploy yöntemi değişirse,
- auth/security kuralı değişirse,
- Cloudflare servislerinden deferred olan biri gerçek production özelliğine dönüşürse,
- kritik incident yeni kalıcı mimari kural doğurursa.

Secret, parola, MFA kodu, recovery cevabı veya API token değeri hiçbir zaman bu kaynağa yazılmaz.


## 06.09.2026 — Mail & Dosyalar production merge + P1 hotfix

- PR #94 production branch'e merge edildi.
- Production merge commit: `efc774fc4891d6c4fa72578f4d108b2a21c80f42`.
- Merge sonrası yakalanan P1: normal kullanıcıların günlük Dosyalar sekmesi owner-only File Hub indeks endpointlerini çağırıyordu.
- P1, PR #103 ile düzeltildi; günlük dosya görünümü artık `/api/mail/files` üzerinden tenant + MAIL izni + kullanıcının modül `canView` ilişkilerine göre scope edilir.
- P1 hotfix production commit: `322362bc35a229f100f0ce6f33025b86cb7d1444`.
- `0050_mail_communication_core.sql` bu sohbet oturumunda production D1'e uygulanamadı; Cloudflare D1 write yetkili aracı mevcut değildi.
- Bu nedenle Mail Core fail-soft çalışır: Mail & Dosyalar arayüzü canlıda önizleme/kurulum bekliyor durumunda açılabilir; mail hesap talebi, bağlantı ve gönderim 0050 uygulanana kadar kapalıdır.
- 0050 aktivasyonu için canonical sıra değişmez: remote D1 full backup -> readiness -> hedefli 0050 additive migration -> schema doğrulaması. GitHub Actions production deploy için kullanılmaz.


## 06.09.2026 — PDKS / İK final ayrım feature paketi hazırlandı

- Branch: `codex/ik-pdks-yillik-izin-final-20260906`.
- İK artık yalnız personel/ücret/finans/bordro/SGK-evrak alanlarını gösterir; puantaj, giriş/çıkış, vardiya, terminal ve izin hareketleri PDKS'nin operasyon alanıdır.
- Personel Kartında yıllık izin özlük özeti tamamlandı: hakediş + devreden = toplam hak; kullanılan; kalan; hizmet yılına göre hakediş geçmişi.
- Yıllık izin kullanılan/kalan hesabı modern PDKS izin planları ile eski izin geçmişini exact duplicate kayıtları çift saymadan birleştirir.
- İK izin geçmişi aynı şekilde modern + tarihsel kayıtları birlikte okur.
- Mevcut production bordro/ödeme fişi ve Mail & Dosyalar kodu korunmuştur; paket güncel production HEAD üzerinden açılmıştır.
- Bordro çıktısı finali aynı branch'te: A4 ödeme listesi okunaklı genişliklere çekildi, HKN adın altına taşındı; EK ayrı sütun olarak kalır. 10'lu A4 fiş korunur ve EK>0 personelde kesilebilir EK ÖDEME kuponu gösterilir.
- Yeni D1 migration yok; production'a henüz merge/deploy edilmedi.
- Sonraki kapı: kontrat/static doğrulama -> kullanıcı gerçek ekran kontrolü -> açık `canlıya al` onayı -> canonical Cloudflare Git Integration yayını.


## 06.09.2026 — Kurumsal Yönetim / Süper Yönetici modeli kilitlendi

- Yönetim modülü kurumsal isimlendirmeye geçirildi.
- `Uygulama Sahibi` kullanıcı adı/etiketi yerine **Süper Yönetici** kullanılır.
- Yönetim menüsü: **Yönetim Konsolu**, **Süper Yönetici & Güvenlik**, **Kullanıcı & Yetkiler**, **Firmalar & Organizasyon**, **Firma Paket / Kullanım**.
- Ayrı **Giriş Onayları** sekmesi kaldırıldı; eski URL/alias Yönetim Konsolu'na yönlenir.
- Bekleyen yeni cihaz girişleri Yönetim Konsolu içindeki **Karar Merkezi** kartında gösterilir.
- **Firma Sahibi / İşveren = COMPANY_ADMIN**. Kendi firmasının kullanıcı, Mail ve Drive/File Hub yönetim kararlarını verir.
- Mail hesabı bağlantı onayı tek firma-sahibi adımıdır; eski uygulama-sahibi ikinci onay adımı kaldırılmıştır.
- Firma sahibine düşen Mail ve giriş onayları **Süper Yönetici bildirim merkezine tüm firmalar üzerinden aynalanır**. Süper Yönetici gözetim görünürlüğüne sahiptir; firma sahibinin Mail karar adımını sessizce devralmaz.
- Google Drive / OneDrive / SharePoint / File Hub yazma-yönetim işlemleri ilgili firmanın Firma Sahibi / İşveren rolüne bağlandı.
- Firma kartında o firmaya bağlı **işveren, muhasebe ve diğer bölüm kullanıcıları**, aktif/pasif durumu ve kişi sayıları görünür.
- Kullanıcı & Yetki Merkezi firma filtresi, rol/firma görünürlüğü ve daha geniş kurumsal kart düzeniyle yenilendi.
- Üst sağ kullanıcı profilinde ham `SUPER_ADMIN` yerine **Süper Yönetici**, `COMPANY_ADMIN` yerine **Firma Sahibi / İşveren** gösterilir.
- Regression sözleşmesi: `APP/cloud/ky-erp-api/src/admin-governance-v2-contract.test.ts`.


## 06.09.2026 — Süper Yönetici hesap kurtarma final düzeni

- Süper Yönetici güvenlik ekranındaki genel HTTP 500 recovery hatası için auth recovery şeması runtime-readiness ile korumaya alındı.
- `auth_owner_recovery_questions` ve `auth_owner_recovery_challenges` tabloları ile gerekli 0019/0021 security kolonları idempotent olarak doğrulanır/eksikse hazırlanır.
- Şema hazırlanamazsa global `INTERNAL_ERROR` yerine `OWNER_RECOVERY_SCHEMA_UNAVAILABLE` ile anlaşılır 503 döner.
- Eski tek kullanımlık recovery-code tablosu artık kurtarma akışının zorunlu bağımlılığı değildir; mevcutsa yalnız güvenli şekilde emekliye ayrılır.
- Süper Yönetici ekranındaki bölüm adı **Hesap Kurtarma ve Kimlik Doğrulama** olarak yenilendi.
- Durum kartları: Kurtarma Durumu, Güvenlik Soruları 3/3, E-posta, Kurtarma Kanalı.
- Üç güvenlik sorusu ayrı kartlarda gösterilir. Yeni yazılan cevaplarda **Göster / Gizle** vardır.
- Daha önce kaydedilmiş cevaplar güvenlik gereği düz metin olarak geri getirilemez; salt + PBKDF2 hash saklama kuralı korunur. Kayıtlı cevap değiştirilecekse yeni cevap yazılır.
- Kullanıcı arayüzünde eski tek kullanımlık kurtarma-kodu mantığı kaldırıldı. Canonical kurtarma: parola doğrulaması -> doğrulanmış e-posta/SMS -> rastgele 2 güvenlik sorusu -> Authenticator yeniden kurulumudur.
- Cloudflare Access / Zero Trust, ileride yalnız Süper Yönetici için ek dış güvenlik katmanı olarak değerlendirilebilir; mevcut KY ERP kurtarmasının yerine geçirilmedi ve normal kullanıcı akışına ikinci giriş eklenmedi.
- Regression: `APP/cloud/ky-erp-api/src/super-admin-recovery-final-contract.test.ts`.


---

## 2026-09-07 — MAIL MERKEZİ / HOTMAIL GEÇİCİ ENTEGRASYON KARARI

Bu karar sonraki mail çalışmalarında kaynak kabul edilecektir.

- Gmail doğrudan Google OAuth + Gmail API ile çalışmaya devam edecek. Mevcut Gmail bağlantısına dokunulmayacak.
- Desen mailbox: `hkndesen@gmail.com`.
- Hotmail/Microsoft kişisel hesap için mevcut doğrudan Microsoft OAuth yolu şimdilik zorlanmayacak.
- Hakan Emprime ana mail: `hkngursu@hotmail.com`.
- Hotmail için tercih edilen ikinci yol yalnız bu hesapta aracı provider kullanmaktır.
- İlk değerlendirilecek aracı: **Nylas**.
- Mimari hedef: `Gmail -> mevcut direkt Google adapter`, `Hotmail -> Nylas Microsoft/Outlook adapter`.
- Nylas katmanı yalnız Hotmail tarafına eklenecek; Gmail kodu, OAuth secretları, senkron mantığı ve çalışan mailbox etkilenmeyecek.
- KY ERP Mail Merkezi tek arayüz olarak kalacak. Kullanıcı iki hesabı aynı posta merkezi içinde görecek.
- Hotmail adapterı şu yetenekleri sağlamadan tamamlandı sayılmayacak: gelen/giden, klasörler, okundu/okunmadı, sil/çöp kutusu, arşiv, taşıma, bayrak/sabitleme eşlemesi, ek indirme/önizleme, gönderim ve güvenli OAuth/token yenileme.
- Provider farkı kullanıcıya mümkün olduğunca gösterilmeyecek; provider-specific hata/log bilgisi yönetim tarafında tutulacak.
- Nylas hesabı açılırken secret/API key değerleri repoya veya sohbete yazılmayacak; Cloudflare secret olarak girilecek.
- Nylas uygun olmazsa ikinci alternatif araştırılacak; Gmail tarafı yine değiştirilmeyecek.
- Bu iş, mevcut Gmail final kontrolleri tamamlandıktan sonra ele alınacak.

### Uygulama sırası

1. Nylas hesabı/projesi oluştur.
2. Hotmail kişisel Microsoft hesabı desteğini ve Hosted OAuth akışını gerçek hesapla doğrula.
3. Gerekli Client ID / API key / callback değerlerini Cloudflare secret olarak tanımla.
4. Worker tarafına provider adapter ekle.
5. Mevcut `mail_accounts`, klasör, mesaj, attachment ve action contractlarını bozmadan Nylas cevabını canonical mail modeline map et.
6. `hkngursu@hotmail.com` hesabını yalnız Nylas üzerinden bağla.
7. Gelen kutusu, gönderilmiş postalar, çöp kutusu, okundu, sil, taşı, ek, gönderim ve token refresh uçtan uca testlerini tamamla.
8. Gmail hesabında regression testi yap; hiçbir davranış değişmediğini doğrula.
9. Sonra production yayını yap ve gerçek Hotmail smoke testi ile kapat.



## 09.09.2026 — Günlük Operasyon bağımsız modül olarak kilitlendi

- İK içindeki günlük çalışan akışı görünür İK menüsünden ayrıldı.
- Yeni bağımsız modül: **Günlük Operasyon** (`GUNLUK_OPERASYON`).
- Sekmeler: **Ana Ekran**, Günlük Giriş, Personel Kartları, Haftalık Özet, Ödeme Fişleri.
- Ana Ekran operasyon kontrol panelidir: bugün gelen kişi, gündüz/gece adetleri, bu haftanın tahmini ödemesi, gün gün haftalık durum, bugünkü ekip, bu hafta/geçen hafta karşılaştırması ve son dönem günlük hareket özeti.
- Günlük Operasyon alt ekranları mevcut canonical günlük personel / devam API'lerini kullanır; aylık İK personel, izin, mesai, bordro ve evrak kaynaklarını yüklemez.
- İK görünür sekmeleri yalnız aylık/personel-finans akışıdır. Günlük Operasyon ayrı modül/yetki olarak yönetilir.
- **DENETIM** rolünde Günlük Operasyon varsayılan ve canonical olarak kapalıdır; Denetim yalnız mevcut İK denetim kapsamını görür.
- Süper Yönetici yeni `GUNLUK_OPERASYON` yetkisini Kullanıcı & Yetkiler ekranından ayrı yönetebilir.
- Legacy Prisma `ModuleKey` enum ve migration da `GUNLUK_OPERASYON` ile hizalandı.
- Regression: `APP/cloud/ky-erp-api/src/daily-operations-separation-contract.test.ts`.

## 09.10.2026 — KY ERP TEST giriş güvenliği: kaynak çelişkisinin giderilmesi
- Kaynak nedeni: D1 migration `0029_auth_security_policy_guard.sql` trigger'ı `PASSWORD_ONLY` değerini ve 36000 saniyeden farklı session süresini reddediyor; `/api/auth/status` da `passwordOnlyEnabled:false` bildiriyor. Önceki PR #410/#411 UI bileşenlerinin sunduğu salt parola seçeneği gerçek canlı güvenlik politikası ile uyumsuzdu. Kullanıcıda doğrulanamayan giriş politikası hatasına yol açtı.
- Düzen: `auth-policy-cloud.ts` PATCH isteklerinde yasak politikayı açık `AUTH_MFA_POLICY_REQUIRED` (409) hatasıyla önceden reddeder. Yönetim ekranından sahte 'Sadece parola' seçimi kaldırılır; KY ERP TEST güvenli hazırlama düğmesi sadece Gör yetkilerini bırakır, sunucudan tekrar doğrular ve yalnız test hesabının eski oturumlarını kapatır. KY Güvenlik / Authenticator MFA zorunluluğu korunur.
- Kullanıcı testini bir kez gerçek onaylı oturumla başlatabilir; bütün 14 modülün kimlik doğrulanmış uçtan uca testi henüz tamamlandı sayılmaz. Yeni D1 migration veya ikinci test sistemi oluşturulmaz. Yayın gerçek Actions kanıtına göre ayrıca kaydedilir.


## 20.11.2026 — KY ERP Masaüstü 1.5.1 / Tek kurulum + onaylı yerel klasör merkezi (feature)
- Kullanıcı kararı: İşNet için ayrı portal API başvurusu/PC başına program değil, **mevcut KY ERP Masaüstü tek Windows paketi** içinde İşNet, yerel dosya okuma, kod/XML/CSV inceleme, File Hub, firma klasör yedeği ve PDKS; web/telefon aynı D1/Belge Havuzu.
- Branch: `feature/kyerp-desktop-tek-kurulum-yerel-merkez-20261120`. Ana uygulama `APP/desktop/ky-pdks`; izinli klasör `LocalFolderService`/`LocalFolderWindow`, metin inceleme `LocalFileInspectorWindow`, `tools/file-hub-agent/local-folder-authorization.mjs`; Inno Setup'a tek gömülü Node+İşNet+FileHub modülleri eklendi.
- İzinler: kullanıcı tek tek dizin seçer; kod/muhasebe salt okunur, File Hub indeks ve yazma farklı izin, backup sadece ayrı onaylı hedefe; D1 ve gerçek ticari belgeler başka yerde silinmez, otomatik kod çalıştırılmaz.
- Windows DESEN testleri: Node 24 `--check` PASS, folder-agent 5 test PASS, .NET8 xUnit 14 PASS, WPF Release 0 hata, Inno Setup 1.5.1 94.611.901 bytes SHA256 `48c26c78018f7048b0a7ea5c4c1f00564c44167418c97f32b8540bd94a54da2b`.
- Lokal build copy: `D:\KYERP\_BUILDS\KY-ERP-Desktop-1.5.1-20261120\KY-ERP-Masaustu-Setup-1.5.1.exe`; yalnız derleme paketi. İmzasız, gerçek Windows kurulum/PDKS servis ve İşNet XML/PDF → D1/FileHub E2E kabulü henüz YOK. Kurulumda mevcut PDKS hizmetini değiştirebilen eski installer davranışı var; bakım onayı olmadan canlı cihaza kurulmamalı.
- Canonical File Hub fiziksel kaynak esastır; yapılan firma klasör snapshot'ı tam D1 şirket veritabanı yedeği değildir. Agent secret yoksa cloud indeksleme açılmış sayılmaz. Detay: `DOCS/KY_ERP_MASAUSTU_TEK_KURULUM_YEREL_MERKEZ_20261120.md`.
