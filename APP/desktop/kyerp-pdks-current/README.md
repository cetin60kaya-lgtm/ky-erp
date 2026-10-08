# KYERP PDKS

Bu klasör KYERP PDKS masaüstü uygulamasının aktif kaynak ağacıdır.

## Mimari

Aktif ürün artık tek uygulamadır: `KYERP.PDKS.exe`.

- `src/HKN.Personel.Native`: tek gerçek Windows masaüstü uygulaması; assembly adı `KYERP.PDKS`.
- `src/KYERP.PDKS.Core`: PDKS iş kuralları, terminal/TNF, rapor ve hesaplama çekirdeği.
- `tools/ContractTests`: secretsiz iş kuralı testleri.
- `tools/ShellSmokeTest`: Firebird secretı olmadan ana KYERP PDKS kabuğunun açılıp kapanabildiğini doğrular.
- `tools/SmokeTest`: açıkça sağlanan Firebird bağlantısıyla transaction/rollback veri testi.
- `tools/SchemaDump`: Firebird şema kontrolü.
- `tools/TerminalDeviceBridge`: 32-bit üretici ActiveX bileşeni ile fiziksel kart cihazını güvenli biçimde okuyan x86 yardımcı süreç.

Eski `Hedef.exe` ana uygulama olarak çalıştırılmaz. Eski uygulama launcher/overlay/yama katmanı aktif solution, setup ve kısayol zincirinden çıkarılmıştır. `KYERP.TerminalBridge.exe` yalnız 32-bit cihaz SDK uyumluluğu için KYERP PDKS tarafından arka planda çağrılır.

## Uygulama kabuğu

Ana pencere `KYERP PDKS` adını taşır ve kendi menü/toolbar sistemini kullanır. Ana modüller:

- Personel
- Giriş / Çıkış
- İzinler
- Ek Kazanç / Kesinti
- Puantaj
- Bordro / Ödemeler
- Günlük Operasyon
- Organizasyon Tanımları
- Dönemler
- Terminal / Veri Aktarımı
- Rapor Merkezi
- Kullanıcı Yönetimi

Personel ekranı ayrı pencere/yama olarak değil ana çalışma alanının içine gömülü açılır.

## Kullanıcı ve yetki

İlk çalıştırmada yerel `ADMIN` hesabının şifresini kullanıcı belirler. Şifre düz metin tutulmaz; salted PBKDF2-SHA256 hash olarak Windows kullanıcısının LocalAppData alanında saklanır.

`Ayarlar > Kullanıcı Yönetimi` ekranından firma kullanıcıları oluşturulabilir, aktif/pasif yapılabilir ve modül bazında yetki verilebilir. `ADMIN` hesabı pasif veya yetkisiz yapılamaz.

KYERP web hesabı entegrasyonu ileride ayrıca bağlanabilir; masaüstü ürün yerel hesapla bağımsız çalışabilir.

## Veritabanı bağlantısı

Uygulama veritabanı secretı olmadan ana kabuğu açabilir. Veri gerektiren ilk modülde veya `Ayarlar > Veritabanı Bağlantısı` seçildiğinde Firebird bağlantı ekranı açılır.

Temel değişkenler:

- `KY_PDKS_DB_PATH`
- `KY_PDKS_DB_HOST`
- `KY_PDKS_DB_PORT`
- `KY_PDKS_DB_USER`
- `KY_PDKS_DB_PASSWORD`
- `KY_PDKS_RUNTIME_ROOT`
- `KY_PDKS_REPORT_ROOT`

Canlı DB, yedek, lisans, personel verisi ve parola GitHub'a alınmaz.

## Hedef legacy referansı

`D:\Hedef500\Hedef500` ve Drive'daki private runtime yalnız davranış/veri/rapor referansı olarak korunur. Özellikle şu klasör/dosyalar silinmez:

- `Data`
- `Temp`
- `Report`
- `Terminal Bilgi Aktar`
- `Yedek`
- `Terminal Bilgi Aktar\timerecords.txt` — 0 KB olması normaldir; terminal akışında geçici giriş dosyasıdır.

Git'e alınmayan private referans `SYNC_PRIVATE_RUNTIME.ps1` ile çalışma alanına bağlanabilir.

## Terminal ve TNF

Terminal aktarım profilleri FixedWidth, Delimited ve strict `KYERP TNF v1` formatlarını destekler. Canonical TNF satırı:

`KartNo,HH:mm,ddMMyy,1,001`

Duplicate kayıt koruması ve transaction tabanlı aktarım çekirdekte bulunur. Fiziksel terminal üretici ActiveX arayüzü doğrulanmıştır; varsayılan cihaz `192.168.1.224:5005`, makine no `1` üzerinden `KYERP.TerminalBridge.exe` ile doğrudan okunur. Köprü `ReadMark=false` kullanır ve cihazdaki kayıtları silmez. Canlı Denetim ekranı 5 saniyede bir cihazı kontrol eder, yeni kart basımlarını mükerrer korumasıyla veritabanına eşler ve gelen/gelmeyen/izinli/içeride/çıkış kartı eksik durumlarını yeniler; aktif personel kartıyla eşleşmeyen basımlar ayrı `Eşleşmeyen Kart` alarmında görünür. Geçiş gününde legacy `backup\G&A&YYYY.txt` dosyası varsa yalnız seçili güne ait gerçek kayıtlar bir kez kurtarılır; işe girişten önce veya işten çıkıştan sonra gelen kartlar otomatik atlanır.

Gerekirse cihaz adresi `KY_PDKS_TERMINAL_IP`, `KY_PDKS_TERMINAL_PORT` ve `KY_PDKS_TERMINAL_MACHINE` değişkenleriyle değiştirilebilir.

## Build

Windows + .NET 8 SDK:

```powershell
cd APP\desktop\kyerp-pdks-current
.\BUILD.ps1
```

Build sırası:

1. Solution restore/build
2. ContractTests
3. ShellSmokeTest
4. self-contained x64 `KYERP.PDKS.exe` publish

Kurulum paketi:

```powershell
.\BUILD_SETUP.ps1
```

Setup tek kısayol oluşturur ve doğrudan `KYERP.PDKS.exe` açar. Bridge veya Hedef launcher yoktur.

Yerel hızlı kurulum:

```powershell
.\INSTALL_LOCAL.ps1
```

## Canlı Firebird smoke testi

Yalnız açıkça hazırlanmış bağlantı değişkenleriyle çalıştırılır. Test yazmaları transaction içinde yapılır ve rollback edilir:

```powershell
dotnet run --project .\tools\SmokeTest\SmokeTest.csproj -c Release
```

## Geliştirme makinesi senkronu

```powershell
.\DEV_SYNC.ps1 -OpenVsCode
```

Script branch'i günceller, private legacy referansı hazırlar, build/test yapar ve artifact'leri Drive runtime alanına taşır. Secret veya canlı veriyi Git'e kopyalamaz.


## Görsel inceleme (08.10.2026)

Gerçek Windows kabuğunu canlı veri kaynaklarını açmadan incelemek için yayımlanan `KYERP.PDKS.exe` şu parametreyle çalıştırılır:

```powershell
.\KYERP.PDKS.exe --visual-preview
```

Bu mod login, lisans, otomatik yedek/restore, Firebird bağlantısı, terminal otomatik senkronu ve Cloud agent işlemlerini **çalıştırmaz**. Ana ekran, menü, kurumsal görünüm ve gerçek uygulama kabuğu görüntülenir; veri kullanan modüllere giriş engellenir. Bu bir **görsel önizleme**, canlı uçtan uca işlev testi değildir.

DESEN'deki bağımsız derleme: `D:\KYERP\_TEMP\KY-PDKS-GORSEL-ONIZLEME-6.7\KYERP.PDKS.exe`

DESEN masaüstü kısayolu: `KY PDKS 6.7 - GORSEL ONIZLEME`

Doğrulama: `dotnet build -c Release -warnaserror`, `ContractTests`, `ShellSmokeTest` üçü de exit code 0. Görsel önizleme ayrı dizinde çalıştırıldı, gerçek Windows pencere başlığı ve yanıt verdiği doğrulandı, pencere görüntüsü test dizinine kaydedildi. Normal kurulu EXE, personel veritabanı ve terminal silinmedi/değiştirilmedi. Sonraki kapı: canlı/test FDB bağlantılı modül kabulü ve onaylı sürüm geçişi.


### 08.10 — Görsel önizleme R2 (menü yönlendirme onarımı)

Önceki görsel sürümde Personel'e geçildiğinde uygulama `Ready()` tarafından veri bağlanmadığı için durduruluyor ve **eski Giriş/Çıkış Merkezi** ekranda kalıyordu. R2 bu eski ekranın yanlış menü altında görünmesini çözer.

- `MainShellForm.Commands.cs`: yalnız `--visual-preview` modunda menü komutunu uygun görsel çalışma alanına yönlendirir. Kullanıcının seçtiği menü ile ana içerik artık aynı menüyü gösterir; canlı operasyon yönleri değiştirilmemiştir.
- `PdksVisualPreviewWorkspace.cs`: gerçek WinForms bileşenleriyle Personel sol **Kart No/Ad Soyad/Grup** ve sağ detay sekmeleri; Giriş/Çıkış doğrudan **Tarih/Kart No/Personel/Giriş/Çıkış/Kaynak/E/Durum** tablosu. Puantaj/Bordro/Raporlar ayrı ay/yıl seçicili görsel sayfalar.
- Önizlemede gerçek personel/ücret/terminal satırı oluşturulmaz; veriler boş, düzenleme düğmeleri pasif. Canlı veri bağlantısı ve üretim EXE'si değiştirilmedi.
- İzole DESEN yolu: `D:\KYERP\_TEMP\KY-PDKS-GORSEL-ONIZLEME-6.7-R2\KYERP.PDKS.exe`. Mevcut masaüstü önizleme kısayolu bu R2 EXE'ye yönlendirildi.
- Kaynak kod testi: Release `dotnet build -warnaserror`, ContractTests ve ShellSmokeTest **exit 0**. WinForms penceresi DESEN'de açıldı. **Personel ve Giriş/Çıkış gerçek ekran görüntüleri** alındı ve ikinci çekimde seçim ile içeriklerin eşleştiği doğrulandı.
- **Sınır:** R2 yalnız görsel önizleme. Canlı PDKS'nin Giriş/Çıkış işlemini ve Personel ekranını bu R2 düzenine geçirme/gerçek veriyle kabul daha yapılmamıştır. Canlı sürüm veya API production güncellendiği iddia edilmemelidir.


### 08.10 — KY PDKS PRO Menü R5 (rekabetçi ürün navigasyonu)

- Ürün tek adla **KY PDKS**. Rakip özellik araştırması: `DOCS/KY_PDKS_PRODUCT_STANDARD_20261008.md`.
- Gerçek menüler iş akışı temelli gruplandırıldı: Günlük Operasyon; Personel & Planlama; Puantaj & Ödemeler; Cihaz & Analiz. Her menü `PdksCommandCatalog` içindeki bir çalışır komuta bağlı; kullanıcı izinleri filtrelenir.
- Menüde yanlış sayfa kalmasını önleyen yönlendirme ve kontrollü hata yakalama eklendi; inceleme günlüğü `%TEMP%\KYERP-PDKS-VISUAL-PREVIEW\logs\navigation.log` üzerinde tutulur.
- DESEN güvenli önizleme R5: `D:\KYERP\_TEMP\KY-PDKS-PRO-MENU-R5\KYERP.PDKS.exe --visual-preview`. Masaüstünde `KY PDKS PRO - GORSEL INCELEME` kısayolu oluşturuldu ve eski önizleme kısayolu bu sürüme güncellendi.
- **Kaynak üzerinde Release build, ContractTests, ShellSmokeTest, PreviewNavigationStress geçti** (exit code 0). Stress sonucu: 95 gerçek sidebar tıklaması, 7.758 saniye, +28 Windows handle, 89 MB çalışma belleği. EXE yayımlandı, tek R5 süreci açıldığı teyit edildi.
- Çalışan fiziksel cihaz, tam masaüstü ürün işlevleri, gerçek Firebird/TNF/D1 yazma mutabakatı ve mobil uygulama bu görsel sürümde doğrulanmış değildir. Bu sürüm önizlemedir, production değildir; veri, bordro ve terminal işlemine girmez.
