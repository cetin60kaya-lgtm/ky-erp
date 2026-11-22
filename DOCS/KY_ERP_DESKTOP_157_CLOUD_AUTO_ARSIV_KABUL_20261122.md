# KY ERP Masaüstü 1.5.7 — Bulut firma arşivi seçici kalıcı onarımı

22.11.2026 · Tek final Windows revizyonu · PR #640

## Gerçek sorun
- X üzerinde Masaüstü 1.5.6'da "Firma Ana Klasörünü Seç" komutu, yol boş olduğunda hâlâ Windows `OpenFolderDialog` açıyordu. Google Drive junction atasına "güvenilmeyen bağlama noktası" dediği için ilerleme imkânsızdı.
- Türkçe noktasız `ı` / ASCII `i` farkı manuel giriş için ayrı hata üretiyordu. Mevcut Google Drive klasörü kayıp değildi.

## 1.5.7 tek kalıcı çözüm
- Ana firma için `OpenFolderDialog` KALDIRILDI; ilk buton artık "Mevcut Firma Arşivini Otomatik Bul ve Önizle".
- Windows'taki Google Drive/OneDrive konumlarını makineye özel sabit yol olmadan; yalnız bulut hesap konteyneri + gerçek firma kökü derinliği ile, sınırlı ve salt-okunur olarak keşfeder.
- En az iki firma arşiv işaretçisi mevcut olmayan veya junction olan klasörler aday olmaz. Tek aday bulunduğunda yalnız ONAY ÖNİZLEMESİ açılır, izin kendiliğinden verilmez. Birden fazla aday olduğunda seçimi kullanıcı yapar.
- Manuel tam yol ve Türkçe `i/ı` güvenli düzeltmesi yedek olarak durur; dosya/klasör yaratmaz, yeniden adlandırmaz, başka firma grant'ini açmaz.
- "Eksik standart klasörleri oluştur" ayrı kutusu varsayılan kapalı; yalnız firma ana arşivi izni verilmesi hiçbir yeni klasör oluşturmaz. İşNet arşiv ayarı da ayrı isteğe bağlıdır.
- Ek/ikinci klasör izni kapalı genişleyebilir panelde. PDKS servisi isteğe bağlı ve varsayılan kapalı.

## Kanıt
- X cihazında feature dalındaki xUnit ve WPF derlemesi: 24/24 PASS, WPF 0 hata/uyarı.
- X üzerindeki gerçek `D:\Googledrive` bağlama noktasında opt-in test: **25/25 PASS**.
- `CompanyArchiveDiscovery.FindExistingCompanyRoots()` hiçbir yol verilmeden X'teki aynı firma arşivini buldu: **25/25 PASS**, test X'in gerçek Windows yanıtıyla doğrulandı.
- **1.5.7 X full Setup PASS:** source `642853e2a27bfb96467b4a727f5617d1b3d84b37`; full `BUILD_SETUP.ps1` restore, desktop+agent build, 25/25 xUnit tests, win-x64 publish, Inno Setup 6.7.3 PASS; `KY-ERP-Masaustu-Setup-1.5.7.exe` 93.273.249 byte, SHA256 `D6B0B42787DD062588A09FDFF665039D744DBCEB195DDF380C4FF929D77CCC0E`, ProductVersion `1.5.7`. Eski 1.5.6 Setup SHA doğrulanıp QA arşivine kopyalandı. Kurulum X'te PID 20180 olarak başlatıldı, **o andaki Windows kurulu EXE 1.5.6**. Gerçek UAC/Setup bitiş ve önizleme onayı ayrı açık.

## Kalan kullanıcı kabulü
1. X 1.5.7 Setup checksum ve sürüm; kurulum öncesi 1.5.6 korunur.
2. UAC sonrası kurulu 1.5.7; tek butonla gerçek arşiv önizleme ve firma/klasör adı doğrulama.
3. Kullanıcı onayından sonra tam **tek FILE_HUB READ_ONLY** izni; tekrar tıklandığında yeni duplicate kaydı oluşmaması.
4. İşNet 8791, PDKS ve Cloudflare D1 korunumu; gerçek delta/Belge Havuzu kabulü ayrı.
5. Diğer Windows cihazı kabulü; mevcut firma OAuth/D1 ortak indeks kullanılacak, yeni bulut indeksi oluşturulmayacak.
