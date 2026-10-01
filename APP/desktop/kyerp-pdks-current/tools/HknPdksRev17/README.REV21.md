# HKN PDKS REV21 — Aylık kontrol

## 01.10.2026 — Final: DB KAYIT / TNF DÜZENLE ayrımı

- Aynı REV21 sürümü korunur. Yeni **DB KAYIT** açık kullanıcı seçimiyle çalışır; **TNF DÜZENLE** yalnız SELECT kullanır. Diğer mevcut sekmeler korunur. Aşağıdaki eski aylık akış açıklamaları teslim tarihçesidir; bu bölüm son kullanıcı akışının güncel sözleşmesidir.
- DB KAYIT: DB'deki aktif/pasif bütün kartlar yüklenir, çoklu personel ve tarih/gün seçilir. Hafta sonu varsayılan kapalıdır, manuel seçilebilir. İzin, tatil, işe giriş/çıkış veya puantaj otomatik engeli uygulanmaz. Kullanıcının seçtiği E taraflarının NORMAL kayda dönüşeceği hem bilgi satırında hem onayda açıkça belirtilir; E İşlemleri ayrı kalır.
- ÖNİZLE; mevcut/yeni giriş, mevcut/yeni çıkış ve işlem özetini gösterir. Her seçili kart/gün sonunda bir giriş 08:15–08:45 ve bir çıkış 18:30–19:30 kalır. En uygun kayıt tutulur, kesin mükerrerde ilk SIRA korunur, fazlalar silinir, yanlış taraf/aralık dışı saat düzeltilir. Eksikler doğal dağılımla üretilir; onaylanan önizleme saatleri aynen uygulanır.
- DB'YE UYGULA öncesi gbak ve satır dump alınır. Personel/kayıt fingerprint'i transaction içinde yeniden okunur. DELETE/UPDATE/INSERT ve sonuç doğrulaması tek transaction içindedir; hata/iptal/tetikleyici engeli rollback yapar. Seçilmeyen gün ve satırın diğer tarihli tarafı korunur. DB işlemi TNF okumaz/yazmaz.
- E personel listesinin aktif filtreye bağımlılığı kaldırıldı; kart ve ad soyad doğrudan KIMLIK'ten asenkron yüklenir. Çıkış tarafı kendi CTARIH'i üzerinden önizlenir; çıkış-only kayıtlar atlanmaz. E uygulaması normal çift üretmez.
- TNF DÜZENLE: seçili ayın bütün personelleri karşılaştırılır. Eksikler aynı DUZELTILMIS dosyasına DB kart/tarih/saatiyle eklenir; fazla, mükerrer ve E karşılıkları silinir; saat farkları DB dakikasına çekilir. Tek DB tarafına uyan ilk TNF tutulur. TNF mükerrerleri İNCELE değildir. Teknik olarak bozuk veya henüz tekilleştirilmemiş DB kaynağı, format bozukluğu ve aynı saatte iki farklı DB tarafı varsa dosya yayınlanmaz; kaynak önce düzeltilir.
- Orijinal TNF korunur, _YEDEK alınır, *_DUZELTILMIS.Tnf tek pending/atomic yayınla oluşturulur. Ayrı EKSIK dosyası yoktur. Format KartNo,Saat,GGAAYY,1,001; DB saati yuvarlanmaz/yeniden üretilmez. Yayın öncesi ve sonrası düzeltilmiş dosyanın seçili kapsamı DB ile bire bir doğrulanır.
- Ağır sorgu/önizleme/karşılaştırma/transaction işleri arka plandadır; iptal ve eşzamanlı işlem koruması vardır. Grid tek DataSource ile bağlanır. Canlı DB/TNF testleri yalnız okuma; yazma testleri ayrı sentetik Firebird veritabanındadır.
- Kanıt: 08_TEST/REV21_SEPARATED_TEST.log, REV21_SEPARATED_GATE.log; şirket kayıtları, gbak/dump, ekran görüntüleri, EXE ve parola verifier'ı Git'e eklenmez.
- Final doğrulama: 265 assertion geçti; standart PDKS_DENETIM_PASS, 39 fonksiyon/24 ekran/0 hata. Sentetik DB'de gerçek gbak/transaction/rollback, tek çift, seçim dışı karşı taraf, E çıkış önizlemesi, TNF mükerrer temizliği ve bire bir çıktı doğrulandı. Canlı DB/TNF yalnız okundu ve değişmedi.
- Eylül canlı süreleri: DB query 50 ms, TNF parse 8 ms, compare 6 ms; ayrı TNF ekranında grid bind 8 ms, toplam 100 ms, en büyük UI heartbeat 96 ms. Tam yıl: DB58/TNF4/compare52/toplam115 ms (grid hariç).
- Aynı REV21 .NET 8 / win-x64 / self-contained / single-file olarak derlendi; final 172758338 byte. Paket: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV21-FINAL.exe`. SHA256: `3BB3F76649D0A2179F41759B427C46DAF6260DF5517636BD0CBB4660604BC600`. Önceki EXE 99_ARSIV altında korunur. Publish/startup kanıtları 08_TEST/REV21_SEPARATED_PUBLISH.log ve REV21_SEPARATED_STARTUP.log dosyalarındadır.

## 01.10.2026 — Son kural: normal iş gününde tek giriş / tek çıkış

- Aynı REV21 korunur. **DB GÜVENLİLERİ DÜZELT** artık kullanıcıya kapsam ve değişiklik özeti göstererek seçili ayın normal günlerini tek giriş/tek çıkışa getirir. Bu onaylı akış aralık dışındaki GERÇEK saatleri değiştirir; önceki teslimlerin gerçek saat koruma kuralını bu düğme için geçersiz kılar. Normal DB–TNF eşitleme ise hâlâ yalnız SELECT yapar ve gerçek DB saatine bire bir bağlıdır.
- Normalleştirme giriş bandı 08:15–08:45, çıkış bandı 18:30–19:30; kaynak etiketi açıkça **REV21 kullanıcı kuralı**. Diğer ekranlardaki ortak Hedef DB ayarı sessizce değiştirilmez. İlk SIRA kesin mükerrerde korunur. En uygun tek taraf, bandın içinde olma/doğru taraf/referansa yakınlık/SIRA sırasıyla seçilir; fazla taraflar silinir. Sabah/akşam yanlış tarafları düzeltilir; bandın içindeki seçilen saatler değişmez. Değişen saatin E dışındaki mevcut türü korunur.
- Uygun normal günün eksik tarafı veya hiç basılmamış çift doğal dağılımla üretilir; aynı personelin peş peşe üretilen dakikaları tekrarlanmaz. Ayrı **DB EKSİKLERİNİ TAMAMLA** akışı gerçek saati değiştirmeyen önceki davranışını korur.
- E günü, hafta sonu, tatil/arife, izin, açık vardiya/mesai istisnası, gelecek gün, personel kilidi, belirsiz/eksik plan ve işe giriş/çıkış boşluğu üretime kapalıdır. Açık ikinci vardiyalar korunur. Planı/tarihi teknik olarak doğrulanamayan gün zorla standartlaştırılmaz. İzin istisnalı gün zaten doğru bir normal çift içeriyorsa yalnız kesin fazlalık temizlenebilir; yeni saat üretilmez.
- İşlem öncesi TNF yedeği/pending çıktılar ve Firebird gbak + satır dump alınır. Ayın personel/plan/tatil/izin/trigger fingerprint'i transaction içinde yeniden doğrulanır. Planın tamamı ve sonuç hareketleri bire bir doğrulanmadan COMMIT yapılmaz. Kısmi gün planı, bant dışı üretilmiş saat, SQL hatası veya iptal rollback yapar.
- Değişen günler düzeltilmiş TNF'de **COMMIT edilen DB kart/tarih/saatinin aynısıyla** yeniden oluşturulur; aynı satır iki kere yazılmaz, yeni kayıtlar ayrıca EKSIK dosyasına yinelenmez. Orijinal TNF ve ay dışı kayıtlar korunur. Eski, dokunulmayan DB eksikleri ayrı EKSIK çıktısında kalır. DB COMMIT sonrası dosya yayın hatasında hazırlanmış kurtarma dosyaları korunur; iki ayrı depoda dağıtık atomic transaction iddiası yoktur.
- **232 assertion geçti**. Sentetik Firebird üzerinde mükerrer, ekstra akşam girişi, çoklu sabah girişi, yanlış taraf, gerçek aralık dışı saat, tek eksik/tam boş gün, E/izin/tatil/vardiya/kilit/rehire, kısmi plan reddi, gerçek midbatch rollback, gbak/dump, bire bir DB–TNF ve tekrar işlemde değişmezlik test edildi. 20 işlem/12 normal gün/24 bire bir TNF satırı doğrulandı. Canlı DB/TNF üzerinde yazma yapılmadı; DB fingerprint ve TNF SHA kontrolü geçti.
- Canlı Mayıs okuma: DB 40 ms, TNF 4 ms, compare 2 ms, ek aylık denetim 53 ms, toplam 102 ms. Ayrı Mayıs UI: bind 3 ms, toplam 142 ms, en büyük heartbeat 105 ms. Tam yıl UI: bind 17 ms, toplam 185 ms, heartbeat 229 ms. Ölçümler ayrı çalıştırmalardır; bütün UI aralıkları 2 saniyenin altında.
- **PDKS_DENETIM_PASS**: 39 fonksiyon, 24 ekran, sıfır hata. .NET 8 win-x64 self-contained single-file publish ve final EXE'nin gizli parola penceresi smoke geçti; eski parola bypass edilmedi. Görev dışındaki beş kullanıcı değişikliği çalışma ağacında ve commit dışında korunur.
- Final: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV21-FINAL.exe`; 172705090 byte. SHA256: `7725E7E016540E472966E05E20B59321437C801F4B42BB6626317519FDFE74FE`.
- Önceki final 99_ARSIV altında korunur. Çalışan eski EXE kapatılmadan arşive yeniden adlandırıldı ve yeni final doğrulanmış staging dosyasından yerleştirildi; açık kullanıcı oturumu zorla kapatılmadı. Yeni davranış için uygulama yeniden açılmalıdır.
- Kanıtlar: `08_TEST/REV21_SINGLE_PAIR_TEST.log`, `REV21_SINGLE_PAIR_DENETIM.log`, `REV21_SINGLE_PAIR_PUBLISH.log`, `REV21_SINGLE_PAIR_STARTUP.log`. Canlı kayıt/EXE/verifier/dump/log Git'e eklenmez. Aşağıdaki bölümler önceki REV21 teslimlerinin tarihçesidir.

## 01.10.2026 — Son aylık düzeltme ve yeni DB kayıtlarının aynı TNF çıktısı

- Aynı REV21 korunur. Eksik tamamlama penceresinde ortak Hedef ayarından dört aralık sınırı gösterilir; doğal dağılım varsayılan açıktır, sabit mod aynı kaynağın 08:30/19:00 referanslarını kullanır. Gerçek kart saatleri değişmez; hiç basılmamış gün için açık kullanıcı onayı gerekir.
- Yeni DB hareketinin onaylanan kart/tarih/saati ikinci kez üretilmez: aynı tamamlamada bire bir DUZELTILMIS TNF'ye aktarılır. Bu yeni hareketler ayrıca EKSIK dosyasına yazılmaz; önceki gerçek DB eksikleri EKSIK dosyasında kalır. Orijinal TNF korunur.
- TNF yedeği ve iki dayanıklı pending çıktı DB transaction'ından önce hazırlanır; mevcut gbak/satır dump/fingerprint/rollback kapıları korunur. Başarılı DB COMMIT ardından çıktılar dosya başına atomic yayımlanır. DB ve dosyalar dağıtık atomic transaction değildir: COMMIT sonrası yayın hatasında pending dosyalar kurtarma için korunur ve kullanıcıya DB'nin tamamlandığı açıkça bildirilir; tekrar DB eklemesi yapılmamalıdır.
- E tarafı artık eksik giriş/çıkış sayılmaz ve tamamlamaya girmez. Normal tamamlanmış çiftin ardından tekil geç-bandı fazla giriş güvenli temizlik adayıdır; açık kişisel vardiya/mesai planı ve gerçek çoklu belirsizlik otomatik silinmez. Canlı kayıt üzerinde silme uygulanmadı.
- Global TNF düğmesi görünür kişi filtresinden bağımsız bütün aylık snapshot'ı işler; onayda Tüm ay / kişi sayısı gösterilir. Ayrı personel düğmesi yalnız seçili kişiyi işler. Hizalı iki grid, async/iptal ve diğer modüller korunur.
- DB önceliği değişmedi: canlı HAFTA İÇİ EGTOL=510, yani 08:30 bulundu. Canlı giriş aralığı 08:30–08:45; DB okunamazsa istenen fallback 08:15–08:45. Çıkış 18:30–19:30. Uygulama kaynak etiketini gerçek ayarla gösterir; canlı DB ayarı sessizce değiştirilmez.
- **204 assertion geçti**: sınır sınıflandırmaları, E/missing ayrımı, eksik tek taraf/tam gün onayı, doğal dağılım, DB/TNF aynı yeni saatler, çıktı tekrarsızlığı, gerçek rollback/pending temizliği, vardiya koruması ve global/personel kapsamı. Canlı DB/TNF yalnız okundu, fingerprint ve TNF SHA değişmedi. Tüm yazma testleri yeni sentetik fixture üzerinde yapıldı.
- Mayıs okuma: DB 41 ms, TNF 4 ms, compare 3 ms, ek aylık denetim 51 ms, toplam 102 ms. UI bind 4 ms, toplam 141 ms, heartbeat 111 ms. Tam 2026 okuma: DB 57/TNF 5/compare 32/toplam 96 ms; UI bind 20/toplam 191/heartbeat 243 ms. Ölçümler ayrı çalıştırmalardır.
- Bellekte canlı TNF düzeltme planı: Eksik 71, Fazla 0, Saat Farkı 0, E Hatası 0, İncele 3; canlı dosyada bu değişiklikler uygulanmadı. Eksiklerin ayrı çıktıya taşınması gerçek TNF içe aktarımının tamamlandığı anlamına gelmez.
- Standart **PDKS_DENETIM_PASS**: 39 fonksiyon/24 ekran, sıfır hata; restore/build/contract/kopya DB CRUD/shell/UI/V4 geçti. Final parola kapısı HKN PDKS - Giriş, Responding=True; parola bypass edilmedi.
- .NET 8 win-x64 self-contained single-file publish başarılı; final 172680514 byte. Önceki REV21 EXE 99_ARSIV altında korunur. Görev başındaki beş görev dışı değişiklik çalışma ağacında bırakıldı, bu commit'e eklenmedi.
- Final: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV21-FINAL.exe`.
- SHA256: `3E41B86DE699A7A16B8F76C78A3766B75C50BC35ACF86C57D3A0C16D5EAE38D7`.
- Yerel kanıtlar: 08_TEST/REV21_MONTHLY_FINAL_TEST.log, REV21_MONTHLY_FINAL_DENETIM.log, REV21_MONTHLY_FINAL_PUBLISH.log, REV21_MONTHLY_FINAL_STARTUP.log. EXE/DB/TNF/verifier/şirket logları Git'e alınmaz. Aşağıdaki bölümler önceki REV21 teslimlerinin tarihçesidir.

## 01.10.2026 — Aynı REV21 içinde ortak Hedef saat kaynağı

- `WorkTimePolicy` tek ortak ve değişmez değerlendirme kaynağıdır. HAFTA İÇİ satırı Türkçe karakter/case normalize edilerek seçilir; HAFTA İÇİ YENİ/RAMAZAN ile karıştırılmaz. Belirsiz, eksik, bozuk veya okunamayan ayarda bütünüyle sabit fallback kullanılır.
- Gerçek DB eşlemesi: IGIRISS / EGTOL / GGTOL, DCIKISS / ECTOL / GCTOL, GDSAAT, GUNBIT, BASLAMAS1 / BITISS1, MAKSURE1. Sayısal dakika ve HH:mm desteklenir; GUNBIT=1860 ertesi gün 07:00 olarak normalize edilir. DB ayarı değiştirilmez.
- Fallback: giriş 08:30, normal 08:15–08:45; çıkış 19:00, normal 18:30–19:30; gün dönümü/bitişi 07:00; normal çalışma 08:30–19:00; günlük çalışma 07:30. Sınırlar dahildir. Erken geliş bilgi olup hata/ceza sayılmaz; geç çıkış mesai adayı olarak gösterilir.
- Canlı HAFTA İÇİ satırında EGTOL=510 (08:30) bulunmuştur. Kullanıcının DB önceliği gereği gerçek normal giriş bandı 08:30–08:45 gösterilir; fallback 08:15 ile sessizce değiştirilmez. Diğer okunan değerler verilen fallback ile aynıdır.
- Aylık/DB kontrol ve son kontrol aynı policy ile sınıflandırır. DB eksik tamamlama, toplu işlem ve TNF Hazırla referans/izinli aralıkları aynı nesneden alır; varsayılan üretim aralıkları tek sabit referanstır. Önceden mevcut kullanıcı-onaylı yeni eksik saat özelliği ayrıdır; çalışma referansının okunması/sınıflandırılması hiçbir gerçek kart saatini değiştirmez.
- DB–TNF eşitleme toleranslı hale getirilmemiştir: gerçek kart/tarih/saat bire bir kalır. 08:23 ile 08:38 ikisi bir çalışma bandında olsa bile TNF saat farkı olarak tespit edilir. E/yan yana grid/atomic ayrı çıktılar/parola korunur.
- Küçük bilgi satırı gerçek ayarları ve `Kaynak: Hedef DB` / `Kaynak: Sabit Varsayılan` bilgisini gösterir. Ayar okuması background/read-only transaction; başlangıçta ağır otomatik tarama yoktur. DB yazma öncesi policy de fingerprint ile yeniden doğrulanır.
- **188 assertion geçti**: 32 yeni ortak kaynak/sınır/normalizasyon/fallback/consumer testi ve önceki regresyonlar. Canlı Mayıs okuma: DB 47 ms, TNF 5 ms, compare 2 ms, aylık ek denetim 57 ms, toplam 115 ms. Ayrı UI: bind 3 ms, toplam 152 ms, en büyük heartbeat 116 ms.
- Canlı DB/TNF yalnız okundu; hareket/metadata fingerprint ve TNF SHA değişmedi. DB yazma/gbak/rollback testleri yalnız yeni sentetik fixture üzerinde çalışır.
- Aynı REV21 yeniden derlendi: .NET 8 win-x64 self-contained single-file, 172672322 byte. Parola kapısı `HKN PDKS - Giriş`, Responding=True. Önceki REV21 EXE 99_ARSIV altında korunmuştur.
- Final aynı dosyadır: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV21-FINAL.exe`. SHA256: `D02D3AD7171F1006B6B312B2870105D7ABDF52AB9FF5F0492B11EB4906144765`.
- Kanıtlar: yerel 08_TEST/REV21_TIME_TEST.log, REV21_TIME_PUBLISH.log, REV21_TIME_FINAL_STARTUP.log. Görev dışı MainForm SQL değişiklikleri ve csproj BOM farkı çalışma ağacında korunup commit/release dışında bırakılır.

## Akış

- Yıl/ay seç → **BU AYI KONTROL ET**. DB bulguları ve hizalı DB/TNF karşılaştırması ayrı detay sekmelerindedir.
- **DB GÜVENLİLERİ DÜZELT**: seçili ayda tüm personeller veya yalnız seçili personel; kesin mükerrer/tarih dışı/fazla taraf için özet onay.
- **DB EKSİKLERİ TAMAMLA**: tek taraf veya açıkça onaylanan hiç basılmamış tam gün; sabit referans veya kontrollü dağılım. Takvim/izin güncelliği ayrıca onaylanır.
- **TNF'Yİ DB'YE GÖRE DÜZELT**: yeniden DB kontrolü; güvenli DB temizliği bekliyorsa durur. Bu aşama DB'ye yazmaz. Orijinal TNF korunur; düzeltilmiş/eksik çıktılar ayrı üretilir.
- **SON TAM KONTROL** seçili ayı baştan sona tarar; TNF çıktı işleminden sonra düzeltilmiş dosyada otomatik çalışır. **ÇIKTI DOSYALARINI AÇ** çıktı klasörünü açar.
- Opsiyonel birleşik “BU AYI HAZIRLA” eklenmedi: yeni saat üretimi için ayrı ve açık onay korundu.

## Güvenlik

- DB yazması yalnız iki ayrı DB düğmesindedir. Başarılı, boş olmayan `gbak` yedeği ve ayın satır/işlem JSON dump'ı olmadan yazılmaz. `_YEDEK` yereldir; şirket bilgileri Git'e alınmaz.
- `gbak` kullanıcı/şifreyi yalnız process environment üzerinden alır; argv/diske/loga parola yazılmaz. Uzak DB'ye otomatik yazma engellidir.
- Yazma transaction'ında DB/personel/plan/izin/trigger fingerprint yeniden doğrulanır. Kaynak değişikliği, beklenmeyen satır adedi, iptal veya SQL hatasında rollback.
- Temizlik yalnız hedef tarafı temizler; aynı satırın diğer tarafı ve ay dışındaki hareketi korunur. Boş satır ancak iki taraf da boşsa silinir.
- Gerçek 08:50 giriş / 18:20 çıkış değişmez. Geç/erken süreler DB çalışma planına göre bilgi olarak gösterilir; bordro hesaplarına müdahale edilmez.
- İki gerçek vardiya silinmez. E normal TNF kaynağı değildir. İşe giriş/çıkış ve yeniden işe giriş boşluğu dikkate alınır; eski geçmişe yeni saat üretilmez.
- Ayrı kullanıcı onaylı eksik saat üretiminin referans/izinli bandı ortak WorkTimePolicy kaynağındandır. Cumartesi/pazar, resmî tatil/arife, izin, özel vardiya, E, gelecek gün ve belirsiz tarih/plan dışlanır.
- Dini tatil güvenlik takvimi 2026 ile sınırlıdır; diğer yıllarda saat üretimi kapalıdır. Arife/yarım günler güvenlik için tamamen dışlanır. DB tatil/izin/kişisel plan istisnaları ayrıca değerlendirilir.
- Tanınmayan aktif GIRCIK/DB trigger'ı DB yazmasını engeller; mevcut trigger'lar değiştirilmez. Ağustos beş-personel kilidi korunur.
- TNF aşamasında yalnız DB SELECT: gerçek kart/tarih/saat kullanılır, E'den eksik üretilmez, canonical `KartNo,Saat,GGAAYY,1,001` korunur. Önceki REV20 temp/atomic çıktı ve tek yedek mantığı değiştirilmedi.
- Ağır işler Task.Run + CancellationToken üzerinde; aynı anda ikinci işlem engellenir. Grid toplu bağlanır. Açılışta otomatik aylık tarama yoktur.

## 01.10.2026 ilk REV21 doğrulaması (ortak saat düzeltmesi öncesi)

- **156 assertion geçti**: önceki karşılaştırma/çıktı/parola/UI regresyonları, gerçek gbak, yedek hatası, başarılı işlem sonrası hata ile gerçek rollback, tek/tam gün üretimi, gerçek saat korunması, ay dışı karşı taraf korunması, E/tatil/izin/vardiya/rehire/kilit/iptal.
- Canlı `DATABASE.GDB` ve `TR2026.Tnf` yalnız okundu. DB metadata/hareket fingerprint ve TNF SHA değişmedi. Yazma testleri yalnız yeni sentetik Firebird fixture üzerinde çalıştı.
- Mayıs canlı okuma: DB 39 ms; TNF 4 ms; compare 3 ms; ek aylık DB/takvim denetimi 237 ms; toplam 287 ms (grid hariç). Ayrı tam UI ölçümü: bind 17 ms, toplam 305 ms, en büyük heartbeat 129 ms.
- İstenen canlı fazla-giriş örneği tespit edildi. Aynı gün gerçek DB izin/tatil istisnası bulunduğundan güvenli silme sayılmadı; açık İNCELE açıklaması bırakıldı. Tamamlanmış gerçek giriş/çıkış çifti korunur. İstisnasız sentetik eşdeğer gün güvenli temizlendi. Kişisel canlı kayıt ayrıntıları yalnız yerel test kanıtındadır.
- Mayıs DB: fazla taraf adayı 1, eksik giriş 3, E 3, geç 24, erken 130, incele 1, güvenli temizlik 0. Mevcut takvim/izin kanıtları nedeniyle canlı saat üretim planı 0; bu kayıtların otomatik tamamlandığı iddia edilmez.
- Standart `PDKS_DENETIM_PASS`: 39 fonksiyon, 24 form, sıfır hata; contract/CRUD kopya DB/shell/UI/V4 smoke geçti. Standart scriptin yalnız çalışma/build yolları yerel 06_BUILD runner'da uyarlanmıştır.
- .NET 8, win-x64, self-contained, single-file publish başarılı. Mevcut nullable uyarılar kalır; build hatası yok. Final EXE 172664130 byte; gerçek parola penceresi `HKN PDKS - Giriş`, Responding=True; parola bypass edilmedi.
- Final: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV21-FINAL.exe`.
- SHA256: `D8DBD3E15067870063475CFB4277A8E7118FE940DDAF1A7FECEFDDA2266A2685`.
- Başlangıçtaki görev dışı MainForm ödeme/bordro SQL değişiklikleri çalışma ağacında korunup release/commit dışında tutuldu. Release başlangıç Git MainForm'u ve yalnız REV21 başlığını kullanır. Yerel override 06_BUILD altında kalır; temiz commit normal proje ile derlenir.
- Kanıtlar 08_TEST altında; EXE, verifier, DB/TNF ve kişisel kayıt içeren log/dump/ekranlar Git'e eklenmez. Eski EXE'ler korunur. Kullanıcı saha kabulü ve canlı yazma testi yapılmadı.
