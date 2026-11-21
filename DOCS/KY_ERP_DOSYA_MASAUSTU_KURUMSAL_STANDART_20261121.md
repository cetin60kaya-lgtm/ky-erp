# KY ERP — Tüm Firmalar File Hub / Yerel Masaüstü / Kurulum Standardı (21.11.2026)

## Ürün kararı: tek ERP, tek firma otoritesi, her firmada dinamik klasör
- KYERP.NET'te her **ana firma** kendi Google Drive, OneDrive, SharePoint, NAS veya kullanıcı izinli yerel kökünü seçer. Cari/müşteri kartları ana firmadan farklı depolama tenantı oluşturmaz. Hiçbir sabit `Hakan Emp` kökü kodlamayla başka firmalara dayatılmaz.
- Kanonik **iş kaydı**: Cloudflare D1; **dosya içeriği**: firmanın yetkilendirdiği provider; **dosya kimliği**: File Hub asset; provider konumları ve ilişkileri ayrı tutulur. Aynı dosya muhasebe, desen, numune veya imalatta ayrı fiziksel kopyalanmaz.
- Admin ekranında `Bağlantılar & Depolama → Klasör Haritası`: 52 farklı modül/dosya amacı sürümlü gösterilir. **42 katalog kodu**, **10 yeni amaç** ayrılmıştır. Mevcut amaçlarda `Klasör Bağla` doğrudan çalışan atama ekranına geçer; yeni amaçların sahte kurulumu yoktur.
- İsim, kök ve fiziksel konum admin tarafından değiştirilir; **etiket yeniden adlandırması** ile provider fiziksel yeniden adlandırması iki farklı işlemdir. Bağlantı kaldırma orijinal dosyayı silmez. Gerçek taşıma önizleme/açık onay/sürümleme olmadan yapılmaz.
- Aktif atama ve izinler Excel'den değil, **D1'daki ana firma kayıtlarından** gelir. Tek ana kaynak sürümlü JSON: `APP/app/ky-erp-frontend/src/pages/admin/FileHubFolderPolicy.v1.json`. Excel raporu KYERP Drive kökündeki sistem envanteridir, otomatik DB importu değildir.

## Model Kartı — paylaşılan **yalnız 3 dosya türü**
1. JPEG/PNG ana model görseli; `MODEL_IMAGE` klasörüne atılmış dosyanın uzantısız adı canonical Model Kartı adıdır. Dosya adından müşteri firması tahmin edilmez.
2. `PLACEMENT` yerleşim PDF'i; tek dosya kimliği, aynı model ilişkisi. Yeniden dosya kopyalanmaz.
3. PSD **önizlemesi** (yeni amaç: `MODEL_PSD_PREVIEW`); ham PSD doğrudan genel bölümlere sunulmaz. Önizleme yaratımı için gerçek Photoshop/Agent yetkisi test edilmelidir.
- Orijinal `MODEL_SOURCE` PSD/AI/TIFF yalnız yetkili DESEN tarafından görüntülenir/düzenlenir. DTF/RIP üretim dosyaları ilgili yetkiyle sınırlanır.
- İmalat, yalnız **modele ilişkilendirilmiş müşteri irsaliyesini** görebilir; muhasebenin fatura, cari, çek/banka dosyalarının tamamını göremez.

## İşNet ve Muhasebe
- X'in Google Drive eşitlenmiş dizinindeki `ISNET-BASLAT.cmd` + `isnet-drive-yerel.mjs`, **8791 portunda ayrı arşiv alıcısıdır**. Yeni masaüstü paketteki `TOOLS/isnet-portal-adapter/server.mjs` **8788** üzerinden çalışır. İkisini eşzamanlı resmî portal görevlerine bağlama.
- 8791 kullanım belgesi **tek sorgu tarih penceresi azami 31 gün, belge türü başına 200 sonuç eşiği** bildirir. Bu belge saklama süresi değildir; daha uzun dönem taraması tarih dilimleri ve sonuç sayısı doğrulamasıyla ele alınır. 8791 kodunda otomatik dilimleme varmış gibi sunulmaz.
- Dört belge yönü tek D1 kimliğine alınır: gelen/giden e-fatura ve e-irsaliye; aynı XML/PDF bir belge olarak. Numara + boşluk + model adı, dosyanın manuel Windows arama gövdesidir; gerçek e-belge kimliği için XML ETTN / sağlayıcı belge kimliği asıldır.
- Kod eşleştirmesi `EBELGE/E_BELGE`, bulut klasörlerinden XML/PDF'nin tek taslak belgeye alınması ve görselden otomatik model için ayrı **taslak PR #631**. Bu PR merge edilmeden canlı başarı sayılmaz.

## Yerel masaüstü 1.5.1 — X testi
- Kaynak git SHA: `32d6be738a908d61d20dfdfdb1d8378a2d1bdf77`.
- X'te izole `D:\KYERP-TEST-20261121\repo` çalışma kopyası, `D:\KYERP-TEST-20261121\portable\KY ERP Masaüstü.exe` EXE üretildi.
- .NET 8 testleri **14/14 PASS**; self-contained Windows publish `0`; EXE SHA-256 `E27CBA23CCD468836D20AFA280ACA5AE3EF46A938AF3D759D7772818CBD38BB6`; 165344906 bayt.
- File Hub'ın 5 MJS kaynağı ve 8788 İşNet adaptör Node sözdizimi kontrolü **PASS**; bunlar `portable/Integrations` altına kopyalandı. X gerçek Windows'dan EXE süreci ve ana pencere handle **PASS**.
- **Kurulum EXE henüz oluşturulmadı/kurulmadı; gerçek 8788 portal oturumu, D1 token/Agent File Hub, firma klasörü seçimi, model JPEG, belge/XML/PDF ve ikinci cihaz kabulü yapılmadı.** Windows WPF açılışı, uygulama yetki/oturum kabulünün yerine geçmez.
- 20 Kasım DESEN derlemesi `KY-ERP-Masaustu-Setup-1.5.1.exe` 94611901 bayt ve SHA-256 `48c26c78018f7048b0a7ea5c4c1f00564c44167418c97f32b8540bd94a54da2b` idi. X test EXE'si **aynı dosya değildir**.

## Kurulum yönetimi / PDKS garantisi
- Yeni taslakta `installer/KY-PDKS.iss`: `PDKS cihaz hizmetini de kur/güncelle` seçeneği **varsayılan kapalı**dır; `sc stop/delete/create/start` sadece o görev işaretlenirse çalışacaktır. Uninstall'da sadece bu installerın `{app}/Agent` path'inden gelen PDKS servisini kaldırmaya yönelik koruma eklenmiştir. **Inno derleyici/kurulum kabulü tamamlanmadan üretimde kullanılmaz.**
- Yönetim → `Masaüstü Kurulum` sekmesi paket adı, sürüm, hash ve yayın statüsünü ayrı manifestten gösterir: `KyErpDesktopReleaseManifest.v1.json`.
- **Doğrulanmış SHA256 + GitHub commit + güvenilir HTTPS indirme URL + PUBLISHED durumu** yoksa indir bağlantısı açılmaz. Dosya bulut depolama alanında gerçekten bulunmadan buton etkin olmaz.
- EXE, şifre, erişim anahtarı, kişisel belge, canlı portal cookies kaynak GitHub depolarına veya chat'e yazılmaz.

## Sıradaki test kapıları
1. Bu taslak PR'ın Node sözleşme testleri, Vite lint/build, installer Inno syntax compile (varsa) ve kaynak diff kabulü.
2. 52 amaç tablosundaki **10 yeni purpose** için D1 migration + çoklu klasör binding/ACL; eski atamaların birebir korunması ve silme/taşıma olmaması.
3. 8788 ile 8791 arasında açıkça seçilmiş tek portal alıcısı; tek gerçek XML+PDF → Drive → File Hub → Muhasebe taslak belge kabulü.
4. `MODEL_IMAGE` kökünü seçerek JPEG'den canonical Model Kartı; yerleşim PDF ve PSD önizlemesinin aynı model kartına bağlanması.
5. Bulut iki cihaz + modül rol sınırları + negatif yetki testleri; yayımlanan Pages/Worker SHA kanıtı.
6. Güvenli Inno paketi, PDKS bakım kontrolleri, imza/Hash, yönetim indirme uç noktası ve gerçek canlı yayın.
