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

Eski `Hedef.exe` ana uygulama olarak çalıştırılmaz. Bridge/overlay/yama katmanı aktif solution, build, setup ve kısayol zincirinden tamamen çıkarılmıştır.

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

Duplicate kayıt koruması ve transaction tabanlı aktarım çekirdekte bulunur. Fiziksel terminalin üretici protokolü doğrulanmadan tahmine dayalı doğrudan cihaz protokolü eklenmez.

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
