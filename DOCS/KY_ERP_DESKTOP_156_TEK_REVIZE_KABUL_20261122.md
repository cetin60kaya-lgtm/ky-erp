# KY ERP Masaüstü — Tek Windows revizyonu kabul listesi (22.11.2026)

## Amaç
Aynı Google Drive / OneDrive firma kökünü farklı Windows bilgisayarlarda, dosya seçicinin junction uyarısına veya Türkçe `i/ı` kopyalama farkına takılmadan güvenli biçimde tanıtmak. Kaynak, indeks, İşNet oturumu ve PDKS kaydı korunur. Çoklu ara Setup yerine kabul maddeleri tek masaüstü revizyonuna toplanır.

## Kanıtlanmış başlangıç
- [x] Windows X üzerinde Masaüstü 1.5.5 kurulu EXE, çalışan uygulama ve ProductVersion 1.5.5 doğrulandı.
- [x] Windows shell `OpenFolderDialog` Google Drive junction ata yolunu engelleyebiliyor; bu File Hub cloud/OAuth hatası değildir.
- [x] Aynı dizinin noktasız `ı` sürümü Windows'ta mevcut; ASCII `i` sürümü yok. Eski manuel doğrulama yalnız `Directory.Exists` kullandığı için kullanıcı yol yanlış yazıldığında hata veriyor.
- [x] Uygulama düzeltmesi: yalnız gerçek ve benzersiz dosya sistemi alt klasörü olan Türkçe harf karşılığını kabul eder; hiçbir dosya taşıma/yeniden adlandırma yok.
- [x] WPF ekran: dolu ana kök alanı doğrudan önizlenir; ayrı isteğe bağlı klasör yetkisi kapalı bölüme alındı; otomatik düzeltme kullanıcının önüne yazılı gelir.

## Sürüm öncesi kabul sırası
- [x] `KyPdks.Tests` gerçek X .NET testi: **21/21 PASS**, sıfır başarısız, sıfır atlanan (feature commit `ffa456a6fcf9dec766312d56bf0d546a19228b19`).
- [x] WPF Desktop test derlemesi: **0 hata, 0 uyarı** (X QA; kurulu 1.5.5 değiştirilmedi).
- [x] Tek revizyon **1.5.6**: Desktop, Agent, VERSION, Inno Setup ve BUILD_SETUP.ps1 dosyaları aynı sürüm; kaynak commit `3e37312fc46c9e1a40ba233b3a2af16ba775262f`.
- [x] X QA **BUILD_156_SUCCESS**, Inno Setup 6.7.3 başarılı; `KY-ERP-Masaustu-Setup-1.5.6.exe`, 93.273.006 byte, SHA256 `AB8166E4E9441B3AE05E8F7C20C1FBEAE649D6ECA6B1CD45F1AAFC45588B3C56`, ProductVersion 1.5.6; 21/21 test PASS; önceki 1.5.5 Setup SHA doğrulanarak QA arşivine korundu.
- [ ] Windows onay penceresinde varsa düzeltilen tam yol ve seçili firma görülür; yanlış şirket klasörü bağlanmaz.
- [ ] Kullanıcı `Yes` vermeden File Hub grant veya yeni klasör oluşturulmaz.
- [ ] Onaydan sonra tek firma + tek kök + `FILE_HUB` + `READ_ONLY` kaydı; tekrar tıklamada ikinci grant üretilmez.
- [ ] Aynı dizin başka firma tarafından onaylıysa izin verilmez; reparse final kökü reddedilir.
- [ ] Yerel 8791 İşNet servis ve mevcut arşiv yolu değiştirilmeden sağlık kontrolü.
- [ ] PDKS servisi ve Firebird verileri değiştirilmez; kurulumun isteğe bağlı agent görevi işaretlenmez.
- [ ] Bulut sağlayıcı bağlantısı ve ortak D1 File Hub indeks/kaldığı yerden tarama kabulü.
- [ ] İlk gerçek Google/Graph delta ve XML+PDF tek kanonik muhasebe belgesi bağlantısı.
- [ ] Diğer Windows cihazında aynı UX ile kök seçim kabulü; mevcut firma kayıtlarına mükerrer ekleme yok.

## Yayın kuralı
Bu kayıt tamamlanan tek Windows revizyonunun kapsamını tanımlar; mevcut 1.5.5'in otomatik güncellendiği anlamına gelmez. Kanıtlanmamış her madde açık tutulur. Yeni revizyonun Setup dosyası, boyutu, SHA256 ve gerçek kullanıcı kurulum sonucu ayrıca belirtilir. Uygulama veri tabanı D1 production migration, geçmiş belge/fatura değişikliği veya Windows otomatik servis yönetimi bu çalışmanın kapsamı dışındadır.
