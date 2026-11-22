# KY ERP Masaüstü 1.5.9 — Google Drive mount gerçek kök neden onarımı
22.11.2026 · PR #640 özellik dalı

## Kesin Windows kanıtı
- 1.5.8 kurulu ve çalışan X WPF uygulamasında gerçek Hakan Emp yolu doğrudan UI Automation ile yazılıp `Yolu Doğrula ve Önizle` tetiklendi. Windows yanıtı: `Yol, güvenilmeyen bir bağlama noktası içerdiğinden açılamıyor: D:\Googledrive`.
- X'te aynı Windows kullanıcısı/oturumu içinde, WPF ana süreç `RedirectionTrustFlags=1, Enforced=True`; PowerShell süreci `Flags=0`. Bu sonuç gerçek ProcessMitigation sorgusuyla doğrulandı. Uygulama güvenlik politikasını kapatmak yerine dosya erişimi ayrı process'e taşındı.
- Aynı Windows kullanıcı oturumunda mevcut kurulumun paketlediği Node File Hub aracı ile gerçek `D:\Googledrive\Drive'ım\Hakan Emp` kökü okunabildi: 6 arşiv işareti, standart klasör bilgileri. 40 dizinlik salt-okunur kontrol yaklaşık 10,6 saniye ve başarılı.
- Node keşfi, `Diğer bilgisayarlar` ve gerçek `Hakan Emp` dahil birden fazla aday döndü; yalnız Windows kullanıcı profili içindeki önceden doğrulanmış tam Hakan Emp adayının eşleşmesi halinde onu önceliklendirir. Aday hiçbir durumda erişim izni değildir.

## 1.5.9 düzeltmesi
- C# `CloudArchiveProbe.cs` Program Files içindeki sabit `Integrations/bin/node.exe` ve `Integrations/file-hub-agent/archive-root-probe.mjs` dosyalarını **UseShellExecute=false**, kapalı standart girdi/çıktı ile çalıştırır. Komut enjeksiyonu, uzak servis, token veya credential aktarımı yok.
- Sadece bulut kökü altındaki gerçek mevcut alt klasörler salt-okunur doğrulanır; WPF WebView2 işleminin Windows RedirectionTrust politikası değiştirilmez.
- `LocalFolderService.ValidateRoot`, `ResolveUserEnteredRoot`, `CompanyArchiveLayout.MissingPaths` ve `CompanyArchiveDiscovery` korumalı montajlarda aynı ayrı süreci kullanır. Başka normal klasörlerde eski doğrulama ve disk kökü kontrolü korunur.
- UI kök/yol ve standart klasör sorgusu Task.Run ile yapılır; WPF arayüzü uzun disk taramasında kilitlenmez.
- Google/OneDrive mount'ta eksik klasör oluşturma butonu güvenlik için pasif; kullanıcı açıkça izin vermeden hiçbir klasör taşınmaz, silinmez veya oluşturulmaz. İzole araca yalnız `inspect` ve `discover` komutu eklenir; yazma modu yok.
- Nihai File Hub grant hâlâ yalnız kullanıcının `Evet` seçimiyle `FILE_HUB/READ_ONLY` ve firma izolasyonu/duplicate kontrollerinden sonra Windows kullanıcı profiline yazılır.

## Kaynak ve test kabulü
- X QA C# xUnit **30/30 PASS**, WPF Desktop build **0 hata, 0 uyarı**.
- X'te Node script `--check` PASS; gerçek Google Drive üzerinde `discover` PASS ve `inspect` PASS; 6 arşiv göstergesi ve dizin listesi okundu.
- **Tamamlanan X Windows kabulü:** 1.5.9 tam BUILD_SETUP.ps1 ve Inno Setup 6.7.3 PASS; 30/30 test PASS. `KY-ERP-Masaustu-Setup-1.5.9.exe` 93.280.198 byte, SHA256 `4E91B21DF63891F62AB68E7820F26E7B31C04B9F14970E569A3307363ACF2E28`. Gerçek `Program Files` EXE ProductVersion `1.5.9+8ee17a599fdac11bab4ab6866a1499df21d65370`; Setup alt süreçleri kapanmış, uygulama PID 25008 çalışıyor, yeni `archive-root-probe.mjs` kurulu ve isteğe bağlı PDKS Agent yok. Eski 1.5.8 Setup QA yedeğinde korundu.
- **Henüz açık:** 1.5.9 gerçek WPF arşiv önizleme kabulü, kullanıcı `FILE_HUB/READ_ONLY` izin onayı, mükerrer kayıt kontrolü, D1/OAuth/İşNet XML+PDF belge zinciri; kurulum PASS bunları otomatik olarak tamamlanmış yapmaz.
- 1.5.8 Setup ve önceki arşiv korunur, PDKS servisi işaretlenmez, D1 migration/İşNet oturum restart/resmî gönderim yapılmaz.

## 22.11.2026 — 1.5.9 gerçek kullanıcı ekranı kabulü

- Test 1 PASS: X Windows kurulu sürümü 1.5.9, çalışan KY ERP masaüstü penceresi doğrulandı.
- Test 2 FAIL: Otomatik firma arşivi butonu 3 bağlantı kontrol edip mevcut arşivi bulamadı. Gerçek ve Windows'ta mevcut firma klasörü, uygulama yolu üzerinden önizlenince Node alt işleminde UNKNOWN / lstat hatası görüldü. Türkçe noktasız harf hata mesajının stdout aktarımında yanlış çözümleniyor; tek başına giriş yolunun yanlış olduğunu kanıtlamaz.
- FILE_HUB/READ_ONLY izni: folder-grants.json yok. Kullanıcı onayı/klasör oluşturma yapılmadı. Windows koruması kapatılmadı.
- Bağımsız sağlık: İşNet 8791 ana sayfa HTTP 200, 8791 /health HTTP 404; 8788 /health HTTP 403 (yetki gerektiren uç nokta; hata servis kapalı anlamına gelmez). İsteğe bağlı KYERP.PDKS.Agent kurulu değil.
- Açık kabul: WPF -> Node çocuk işlem erişim engeli, gerçek arşiv önizleme, kullanıcı onaylı tek grant, delta/ortak D1 indeks, gerçek XML/PDF Belge Havuzu, diğer cihaz.
- Yeni kurulum veya güvenlik gevşetmesi yapılmadan önce Node çocuk işlem erişim hatası açıklığa kavuşturulmalı.
