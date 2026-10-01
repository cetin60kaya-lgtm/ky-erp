# HKN PDKS REV20 — salt okunur DB, sade TNF çıktı akışı

REV19 projesinin son DB–TNF revizyonudur. Diğer modüller ve açılış şifresi korunur.

## İş kuralları

- DATABASE.GDB ana kaynaktır. Bu sekmenin motorunda yalnız SELECT vardır; DB temizleme düğmesi ve yazma kodu kaldırıldı.
- Normal DB hareketi eksikse gerçek kart/tarih/saat ayrı `*_EKSIK.Tnf` dosyasına yazılır. Format `KartNo,Saat,GGAAYY,1,001`; baştaki sıfırlar korunur. Eksikler corrected dosyasına eklenmez.
- DB karşılığı olmayan TNF güvenli FAZLA; yalnız E içeren DB tarafının TNF karşılığı güvenli E silmedir. E karşılığı yoksa doğrudur; E'den eksik satır üretilmez.
- Tekil eşleşmedeki saat farkı gerçek DB saatine çekilir. Saat üretme, tahmin, random, yuvarlama veya saniyeyi dakika gibi kırpma yapılmaz. HH:mm ile bire bir temsil edilemeyen DB saati İNCELE kalır.
- Gerçek çoklu/belirsiz eşleşme ve bozuk format otomatik değiştirilmez. DB tamamen boşsa çoklu TNF kayıtları da güvenli fazladır.
- Personel tarih/durum bilgisi özette gösterilir; normal DB hareketini silmek veya yerine saat üretmek için kullanılmaz.
- Mevcut belirsiz mükerrer TNF satırları İNCELE olarak korunur; bunları sessizce tekilleştirmek yasaktır. Yeni eksik satırlar ve yinelenen işlem seçimleri tekilleştirilir.

## Kullanım ve dosya güvenliği

- Beş ana düğme: KONTROL ET, BU PERSONELİ DB'YE GÖRE DÜZELT, TÜM GÜVENLİLERİ UYGULA, SON TAM KONTROL, ÇIKTI DOSYALARINI AÇ.
- Personel işlemi yalnız visiblePairs güvenlilerini kullanır. Tüm güvenliler işlemi önce dosya yılının tamamını kontrol eder, sonra filtrelerden bağımsız snapshot.Table güvenlilerini uygular.
- Kullanıcı özet onayı sonrasında kaynak bir kez `_YEDEK` altına bire bir yedeklenir; orijinal TNF değişmez. İki yeni çıktı `_TNF_CIKTILARI` altında benzersiz adlarla oluşturulur.
- Plan bellekte uygulanır; her dosya aynı klasörde temp, disk flush ve atomik rename ile bir kez yayımlanır. Mevcut dosya üzerine yazılmaz. Hata/iptalde temp ve kısmi çıktı temizlenir; yedek korunur.
- İşlem öncesi DB/personel/TNF fingerprint yeniden doğrulanır; kaynak değişmişse eski plan uygulanmaz.
- İşlem sonrası düzeltilmiş dosya üzerinde otomatik tam yıl kontrolü yapılır. Eksikler ayrı çıktıda olduğunda EKSİK TNF HAZIR gösterilir; kullanıcı bu dosyayı Hedef'e ayrıca okutur.
- Tek sorgu/okuma, lookup karşılaştırma, arka plan işi, iptal, tek işlem kilidi ve hizalı iki grid korunur. PERF.log kullanıcının LocalAppData/HKN-PDKS klasöründedir.

## Doğrulama — 01.10.2026

- 118 assertion geçti: altı ana senaryo, E/çoklu kayıt, bire bir saat/format, yedek, orijinal korunması, stale kaynak, iptal, tekrar çıktı, UI ve parola koruması.
- Canlı DATABASE.GDB/TR2026.Tnf yalnız okundu; hiçbir canlı yazma testi yapılmadı. Çıktı/yazma testleri yalnız yeni sentetik fixture üzerinde çalıştı.
- Canlı başlangıç: Fazla 1069, Saat farkı 1, Eksik 118, İncele 5, E hatası 0. Bellek-only çıktı planı: Fazla 0, Saat farkı 0, E hatası 0; Eksik 118 ayrı dosya planında, İncele 5 korunur. Bu sonuç canlı dosyaların değiştirildiği anlamına gelmez.
- UI ölçümü: DB 88 ms, TNF 6 ms, compare 37 ms, grid bind 18 ms, toplam 213 ms; en büyük heartbeat aralığı 282 ms.
- Standart PDKS_DENETIM_PASS: 39 fonksiyon, 24 form, 0 hata; contract/CRUD/shell kontrolleri geçti.
- .NET 8 / win-x64 / self-contained / single-file publish başarılı. Nullable uyarılar mevcut; derleme hatası yok. Final EXE giriş ekranı Responding=True, parola bypass edilmedi.
- Final: `D:/Googledrive/KYERP-PDKS-HIZLI-VERİ/_PAKETLER/GUNCEL/HKN-PDKS-REV20-FINAL.exe`; SHA256 `4C46251C0FC430425E3B9CDD097C3F4E5B037B5E118C409C6602A7AD529CED71`.
- Başlangıçta MainForm'da bulunan görev dışı ödeme/bordro/sorgu değişiklikleri korunup release ve commit dışında bırakıldı; release Git başlangıç MainForm'u ve yalnız REV20 başlığını kullanır. Temiz commit standart proje ile derlenir; yerel override targets yalnız kirli çalışma ağacını izole eder.
- Şirket kayıtları, private password verifier, loglar, screenshot ve EXE Git'e eklenmez. Eski EXE'ler korunur.
