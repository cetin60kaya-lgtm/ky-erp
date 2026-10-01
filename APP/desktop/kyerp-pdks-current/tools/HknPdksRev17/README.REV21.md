# HKN PDKS REV21 — Aylık kontrol

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
- Saat üretimi: giriş 08:20–08:35, çıkış 18:55–19:05. Cumartesi/pazar, resmî tatil/arife, izin, özel vardiya, E, gelecek gün ve belirsiz tarih/plan dışlanır.
- Dini tatil güvenlik takvimi 2026 ile sınırlıdır; diğer yıllarda saat üretimi kapalıdır. Arife/yarım günler güvenlik için tamamen dışlanır. DB tatil/izin/kişisel plan istisnaları ayrıca değerlendirilir.
- Tanınmayan aktif GIRCIK/DB trigger'ı DB yazmasını engeller; mevcut trigger'lar değiştirilmez. Ağustos beş-personel kilidi korunur.
- TNF aşamasında yalnız DB SELECT: gerçek kart/tarih/saat kullanılır, E'den eksik üretilmez, canonical `KartNo,Saat,GGAAYY,1,001` korunur. Önceki REV20 temp/atomic çıktı ve tek yedek mantığı değiştirilmedi.
- Ağır işler Task.Run + CancellationToken üzerinde; aynı anda ikinci işlem engellenir. Grid toplu bağlanır. Açılışta otomatik aylık tarama yoktur.

## 01.10.2026 doğrulaması

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
