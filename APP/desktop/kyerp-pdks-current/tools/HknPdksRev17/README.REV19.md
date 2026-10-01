# HKN PDKS REV19 — kalıcı personel ve toplu seçim

REV18'in mevcut hızlı veri projesinde devamıdır. Ürün sürümü 19.0.0; native kabuk, DB/TNF karşılaştırma motoru, tarih kuralları ve yan yana hizalanmış gridler değiştirilmez. Eski EXE'ler korunur.

## Seçim kaynakları

- PERSONEL grubundaki BU PERSONELİN TÜMÜNÜ SEÇ yalnız visiblePairs içindeki güvenli işlemleri işaretler.
- BU PERSONELİ DB'YE GÖRE DÜZELT checkbox gerektirmez; yalnız seçili personelin güvenli planını uygular ve personeli yeniden kontrol eder. Tam kontrol isteğe bağlıdır.
- TOPLU grubundaki TÜM GÜVENLİLERİ SEÇ snapshot.Table kapsamındaki tüm güvenli hataları işaretler. Personel/ad/durum/hareket filtreleri kapsamı daraltmaz; kapsam son başarılı kontrolün tarih aralığıdır.
- TÜM FAZLALARI SEÇ: TNF SİL FAZLA + TNF SİL E. TÜM EKSİKLERİ SEÇ: TNF EKLE. TÜM SAAT FARKLARINI SEÇ: TNF DÜZELT.
- Seçim düğmeleri mevcut seçimlere ekler; önce yalnız bir kategori isteniyorsa SEÇİMİ KALDIR kullanılır. İNCELE, YOK ve ayrı DB temizliği satırları otomatik seçilmez.
- SEÇİMİ KALDIR snapshot.Table içindeki bütün Seç alanlarını sıfırlar; filtre dışı ve elle işaretlenmiş inceleme/DB satırları da temizlenir.
- Seçim DataRow üzerindeki Seç alanında korunur; personel/filtre değişikliği yeni satır üretmez. Yeni kontrol veya kaynak/dönem değişikliği eski snapshot'ı geçersiz kılar.
- İki grid aynı PairView örneklerini kullanır; PropertyChanged bildirimi ile bir checkbox değişince karşı tarafta da aynı seçim görünür.
- Canlı sayaç Fazla, Eksik, Saat Farkı, E Kaydı ve Toplam değerlerini tüm snapshot'taki uygulanabilir seçimlerden hesaplar. E ayrı sayılır; Toplam tüm dört kategorinin toplamıdır. Toplu seçimde sayım bir kez yapılır.

## Uygulama ve güvenlik

- SEÇİLENLERİ UYGULA visiblePairs ile sınırlı değildir: snapshot.Table içindeki Seç=true ve güvenli operasyonlu bütün satırları tek batch olarak toplar.
- Onayda seçili personel sayısı, fazla/eksik/saat/E, toplam ve işlem görmeyecek inceleme sayısı gösterilir. Hayır sonucu yazma veya seçim sıfırlama başlatmaz.
- Evet sonrası mevcut fingerprint kontrolü, tek TNF yedeği ve atomik yazma korunur. Tüm ekleme/silme/değiştirmeler bellekte planlanır; bir geçici dosya yazımı ve tek File.Replace yapılır. Her satır için ayrı dosya/yedek işlemi yoktur.
- Normal eşitleme DB'yi değiştirmez. GEÇERSİZ DB KAYDINI TEMİZLE yalnız seçili kişinin kesin geçersiz kayıtları için ayrı onay/transaction/tam satır dump/yedek akışı olarak kalır.
- Başarılı checkbox batch işleminden sonra otomatik SON TAM KONTROL tüm dosya yılı için çalışır. İptal, tek işlem kilidi, Task.Run, tek DB sorgusu, tek TNF okuma ve lookup karşılaştırması korunur.

## Doğrulama — 01.10.2026

- 127 assertion geçti. Canlı DB/TNF yalnız okundu ve seçim hesapları test edildi; canlı TNF başlangıç/son hash eşitliği doğrulandı. Önceki yazma regresyonları yalnız yeni sentetik fixture dosyalarında çalıştı.
- Mayıs 2026: karşılaştırma Fazla=75, TÜM FAZLALARI SEÇ planı=75, sayaç Toplam=75; seçili kişi ve filtre sonucu değiştirmedi. İNCELE dışarıda kaldı.
- Personel değiştirip geri dönme, gizli seçimler, iki yönlü gerçek checkbox düzenleme, tüm snapshot seçim/uygulama planı, kategori seçimleri, manuel inceleme seçiminin uygulanmaması ve global temizleme doğrulandı.
- Bellek içi fixture dört güvenli operasyonu ve E dahil fazla seçimini ayrı doğruladı; DB/TNF yazımı yapılmadı.
- Tam UI ölçümü: DB 102 ms / TNF 8 ms / karşılaştırma 41 ms / bind 23 ms / toplam 233 ms. En büyük UI heartbeat aralığı 257 ms; bütün güvenlileri seçme 25 ms. Mayıs kontrol toplamı 113 ms.
- Yerel kanıtlar 08_TEST/REV19_READONLY.log ve REV19_* ekran görüntüleri; uygulama ölçümleri LocalAppData/HKN-PDKS/PERF.log. Şirket verileri, görüntüler, özel parola verifier'ı ve EXE Git'e eklenmez.
- .NET 8 / win-x64 / self-contained / single-file publish. Özel REV15 parola doğrulayıcısı korunur; eski recovered kaynak nullable uyarıları ayrı bakım kapsamındadır.

## Kaynak değişiklikleri

DbTnfSyncControl.cs seçim grupları, kalıcı seçimler, sayaç, toplu uygulama ve tam kontrol akışını içerir. MainForm.cs ve QuickDataTool.csproj REV19 kimliğini taşır. SyncEngine.Apply.cs yalnız sürüm/temp kimliğini günceller; tek batch/yedek/yazma motorunu korur. HknRev17Tests/Program.cs seçim regresyonlarını içerir. [REV18](README.REV18.md) ve [REV17](README.REV17.md) önceki sürümlerin tarihsel notlarıdır; seçim davranışında REV19 notları üstündür.
