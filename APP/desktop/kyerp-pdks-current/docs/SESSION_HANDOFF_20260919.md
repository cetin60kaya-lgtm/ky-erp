# KYERP PDKS — Session Handoff 2026-09-19

## Canonical çalışma noktası
- Repo: `cetin60kaya-lgtm/ky-erp`
- Aktif geliştirme dalı: `codex/kyerp-pdks-full-app-prep`
- Açık PR: `#281`
- Ürün yolu: `APP/desktop/kyerp-pdks-current`
- Ürün adı: **KYERP PDKS**
- `main` şu anda bu büyük PDKS revizyonunu içermiyor; PR doğrulanmadan merge edilmeyecek.

## Bu oturumda yapılan son işlemler
1. Windows kurulum paketi üretmek için `installer/KYERP-PDKS.iss` eklendi.
2. Tek komut setup üretimi için `BUILD_SETUP.ps1` eklendi.
3. `appveyor.yml` canonical `kyerp-pdks-current` kaynağını build/test/publish edip `KYERP-PDKS-Setup-2.0.0.exe` artifact üretmek üzere güncellendi.
4. Uygulama ilk açılışında Firebird bağlantısı yoksa güvenli kurulum ekranı göstermek için `StartupConfiguration.cs` eklendi.
5. `Program.cs`, ana form açılmadan önce bu bağlantı doğrulamasını çalıştıracak şekilde güncellendi.
6. Parola GitHub kaynaklarına yazılmıyor; bağlantı doğrulandıktan sonra Windows kullanıcı ortam değişkeninde saklanıyor.

## Güncel commit
- `02298ab32a1c36aa1c2f383a90eceee6505792f5`
- Mesaj: `fix(pdks): make first-run setup compile safely`

## CI durumu
- AppVeyor branch build: `54751745`
- AppVeyor PR build: `54751746`
- Son kontrol: **pending / queued**.
- Build yeşil olmadan setup hazır kabul edilmeyecek.
- Beklenen artifact: `KYERP-PDKS-Setup-2.0.0.exe`

## Uzak masaüstü kullanım kuralı
Remote Desktop Commander yalnızca son aşamada gerçekten Windows GUI / çalışan EXE / fiziksel terminal / canlı Firebird doğrulaması gerektiğinde kullanılacak. Kaynak kod, PR, CI, installer ve doküman işleri GitHub üzerinden yürütülecek. Gereksiz remote çağrısı yapılmayacak.

## Sonraki işlem sırası
1. AppVeyor sonucunu kontrol et.
2. CI kırmızıysa logdaki ilk gerçek hatayı düzelt, tekrar build al.
3. CI yeşil olunca `KYERP-PDKS-Setup-2.0.0.exe` artifactını doğrula.
4. Setup oluşmadan `main` merge etme.
5. Setup hazır olduğunda DESEN bilgisayarında yalnız bir kurulum + açılış smoke testi yap.
6. İlk açılış Firebird bağlantı ekranını, personel ekranını, giriş/çıkış, izin, ödeme, günlük operasyon ve terminal profil ekranını görsel olarak kontrol et.
7. Canlı DB yazma testi gerekiyorsa kalıcı test verisi bırakma; rollback güvenliği kullan.
8. GUI smoke sonrası kalan küçük hataları aynı branchte düzelt, CI tekrar yeşil olunca PR #281'i main'e al.

## Bilinen kalan teknik noktalar
- Fiziksel terminal üretici protokolü kesin kaynak olmadan tahmin edilmeyecek.
- Worker PDKS sync route'ları canonical KYERP auth/session authorizer'a bağlanmadan canlıya açılmayacak.
- Remote D1 migration yapılmadı.
- Canlı Firebird smoke testi secret/bağlantı olmadan CI'da yapılmıyor.
- Legacy Bridge uyumluluk katmanıdır; standalone KYERP PDKS ana ürün olarak Native uygulama üzerinden kurulabilir.

## Kesin ürün kuralları
- Hedef yalnız işlev/veri davranışı referansıdır; ürün KYERP'dir.
- Hedef.exe reverse engineering / lisans patch yok.
- Canlı DB, lisans, parola, anahtar ve üçüncü taraf büyük binary Git'e konmaz.
- Yeni ayrı PDKS ürünü açılmaz; `APP/desktop/kyerp-pdks-current` geliştirilir.

## Final smoke güncellemesi — 2026-09-19
- `BUILD_SETUP.ps1` Desen cihazında 0 hata / 0 uyarı, tüm contract testleri PASS olacak şekilde çalıştırıldı.
- Final kullanıcı dosyası `artifacts/Setup/KYERP-PDKS-Setup.exe` ve sürümlü `KYERP-PDKS-Setup-2.0.0.exe` birlikte üretiliyor.
- Son doğrulanan setup SHA256: `a6ba26dfee9128389a790589ffb2667b8a431f16de6ecb89930743bc7848f303`.
- Setup `/CURRENTUSER` ile temiz klasöre kuruldu; Native EXE, Bridge ve uninstaller doğrulandı.
- Kurulu EXE gerçek Windows GUI olarak açıldı; `KYERP PDKS İlk Kurulum` penceresi ve bağlantı alanları UI Automation ile doğrulandı.
- Sessiz kaldırma testi exit code 0 ile geçti; kurulum klasörü ve uninstall kaydı temizlendi.
- Canlı Firebird bağlantısının son doğrulaması yalnız gerçek DB parolası kullanıcı tarafından ilk kurulum ekranına girildiğinde tamamlanacak.
## PDKS veritabanı bağlantı kararı — 2026-09-19
- Firebird kullanıcı/parola yönetimi son kullanıcıya bırakılmayacak.
- KYERP.NET tarafında Yönetim > Sistem Yönetimi altında `PDKS Bağlantıları` alanı açılacak.
- Standart teknik Firebird kullanıcısı `KYERP` olacak; parola yönetici tarafından belirlenip/değiştirilecek, sonradan açık gösterilmeyecek.
- Masaüstü ilk kurulumdaki SYSDBA/parola ekranı nihai kullanıcı akışından kaldırılacak; cihaz KYERP üzerinden yetkilendirilecek.
- Web oturum parolası ile Firebird teknik bağlantı parolası ayrı tutulacak.
- Bu iş sonraki entegrasyon fazına bırakıldı; şimdi öncelik doğrudan PDKS uygulamasının işlevsel ve görsel kontrolüdür.

## 2026-09-19 final canlı paket notu
- Kullanıcının isteğiyle yeniden ürün inşası yapılmadan mevcut çalışan `D:\Hedef500\Hedef500\HKN.Personel.Native.exe` stabil canlı binary olarak paketlendi.
- Teslim klasörü: `%USERPROFILE%\Desktop\KYERP-PDKS-FINAL-2026-09-19`.
- Paket: stabil Native EXE, Bridge, `HKN_MASTER.ini`, 58 rapor şablonu, 2.0.0 setup adayı, SHA256 listesi ve tek tık `KYERP_PDKS_AC.cmd`.
- Paket içinden Native EXE gerçek canlı Firebird'e açıldı: `Personel Bilgileri` GUI PASS.
- Canlı sayaç doğrulaması: aktif 14, işten ayrılan 43, toplam 57, listelenen 14.
- Erişilebilir sekmeler: Kimlik, Kişisel Bilgiler, Giriş/Çıkış, İzinler, Ek Kazanç/Kesinti, Bilgi, Ödemeler.
- Derlenmiş contract test paketi yeniden çalıştırılmadan doğrudan koşuldu ve tüm testler PASS verdi.
- Firebird teknik kullanıcı/parola yönetimi KYERP.NET Sistem Yönetimi entegrasyonuna bırakıldı; canlı DB dosyası pakete kopyalanmadı.
