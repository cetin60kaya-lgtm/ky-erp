# KY File Agent

KY ERP File Hub'ın Windows tarafındaki sağlayıcı-bağımsız dosya izleyicisidir. Google Drive Desktop, Microsoft OneDrive, SharePoint'in yerel senkron klasörü, yerel klasör ve NAS aynı ajan tarafından izlenebilir.

## Ana çalışma modeli

1. KY ERP içinde **Depolama > Bağlantılar** ekranını açın.
2. Firma için bir veya daha fazla depolama kaynağı tanımlayın. `Windows / Senkron Kökü` alanı Agent'ın göreceği gerçek klasördür.
3. **Depolama > Bölüm / Dosya Atamaları** ekranından bölüm + dosya türü hedeflerini seçin. Örnek: `DESEN + MODEL_SOURCE -> Google Drive / DESINATOR/Modeller` veya `MUHASEBE + INVOICE -> NAS / Muhasebe/Faturalar`.
4. Worker secret olarak güçlü bir `FILE_HUB_AGENT_KEY` tanımlayın. Aynı değer Windows'ta `KYERP_AGENT_KEY` ortam değişkeninde bulunmalıdır.
5. Agent yerel `file-hub-agent.config.json` yoksa bağlantı listesini otomatik olarak KY ERP `/api/auth/file-hub-agent/config` endpointinden alır. Normal kullanımda bağlantı ID'lerini elle config dosyasına yazmak gerekmez.
6. Agent dosyayı sabit boyuta geldikten sonra SHA-256 ile indeksler. Ağır/orijinal dosyayı D1'e taşımaz. JPEG/PNG/WebP/PDF için uygun boyutta R2 web önizleme cache'i üretilebilir.

## Sağlayıcı rolleri

- `GOOGLE_DRIVE`: Google Drive Desktop ile senkronlanan klasör.
- `ONEDRIVE`: Microsoft OneDrive istemcisi ile senkronlanan klasör.
- `SHAREPOINT`: OneDrive/SharePoint istemcisi ile Windows'a senkronlanan SharePoint belge kitaplığı.
- `LOCAL_FOLDER`: Sabit bilgisayardaki yerel klasör.
- `NAS`: UNC veya eşlenmiş ağ klasörü.

File Hub sağlayıcıya bağımlı değildir. Modüller yalnız `moduleCode + purposeCode` için depolama hedefi ister. Firma daha sonra Google Drive'dan OneDrive/NAS'a geçerse modül kodu değiştirilmez; yalnız Depolama ekranındaki bağlantı/atama değiştirilir.

## Desen akışı

Desen modülü File Hub üzerinden aşağıdaki ana amaçları çözer:

- `MODEL_IMAGE`: model/desen görseli
- `MODEL_SOURCE`: PSD, AI, TIFF ve benzeri kaynak
- `PLACEMENT`: yerleşim / kalıp dosyası
- `OUTGOING_DESIGN`: giden desen / takım paketi
- `RIP_PDF`: DTF / RIP PDF

Agent bu klasörleri indekslediğinde File Hub ilişkileri otomatik oluşturulur. Uygun Desen kayıtları File Hub model senkronuna bağlanır. `OUTGOING_DESIGN` klasörlerinde aynı paket altındaki modeller `OUTGOING_PACKAGE` / `MODEL_TEAMMATE` ilişkisiyle takip edilebilir.

## Muhasebe PDF / tarama otomatik arşivi

`start-file-hub-agent.cmd` iki süreci birlikte başlatır: normal File Hub izleyicisi ve `accounting-archive-worker.mjs`.

Muhasebe Belge Havuzu'na PDF/JPG/PNG/TIFF tarama yüklendiğinde `AI_SCAN` kaydı için `accounting_document_archive_jobs` kuyruğu oluşur. Arşiv worker firma için önce `MUHASEBE + INVOICE` veya `MUHASEBE + DELIVERY_NOTE` atamasını çözer; atama yoksa firmanın primary AGENT depolamasına düşer. Dosya önce `.kyerp-part-*` geçici adıyla yazılır, SHA-256 doğrulanır ve atomik rename ile son adına alınır.

Varsayılan arşiv yolu:

```text
<binding root>/<YYYY-MM>/<firma>/<belge-no> - <orijinal-dosya-adı>
```

Aynı hedefte farklı içerikli dosya varsa üzerine yazılmaz; iş `RETRY/FAILED` durumuna alınır. Aynı içerik SHA-256 ile doğrulanırsa idempotent tamamlanır.

## Windows otomatik başlatma

Önce `KYERP_AGENT_KEY` ortam değişkenini kullanıcı veya makine seviyesinde tanımlayın. Secret değerini script, config veya repoya yazmayın.

Ardından PowerShell'de:

```powershell
cd tools\file-hub-agent
.\install-file-hub-agent.ps1
```

Kurulum `KY ERP File Hub Agent` adlı Windows Scheduled Task oluşturur, kullanıcı oturum açtığında gizli başlatır ve görevi hemen çalıştırır. Launcher `start-file-hub-agent-hidden.vbs` üzerinden konsol penceresi göstermeden çalışır.

Kaldırmak için:

```powershell
.\uninstall-file-hub-agent.ps1
```

Bu işlem dosyaları veya ortam değişkenlerini silmez; yalnız otomatik başlatma görevini kaldırır.

## Elle başlatma

```powershell
$env:KYERP_API_URL="https://api.kyerp.net"
$env:KYERP_AGENT_KEY="<secret>"
$env:KYERP_MAIN_COMPANY_SLUG="mecit-hakan"
.\start-file-hub-agent.cmd
```

Yerel `file-hub-agent.config.json` yalnız özel/izole kurulumlarda override içindir. Yoksa Depolama ekranındaki aktif `AGENT` bağlantıları otomatik alınır.

## Worker secret

```powershell
cd APP\cloud\ky-erp-api
npx wrangler secret put FILE_HUB_AGENT_KEY
```

Belge yapay zeka servisi için Worker secret/variable adları:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
AZURE_DOCUMENT_INTELLIGENCE_KEY
KYERP_DOCINTEL_INVOICE_MODEL
KYERP_DOCINTEL_DISPATCH_MODEL
KYERP_DOCINTEL_API_VERSION
```

Secret değerleri repoya yazılmaz. `/api/muhasebe/belge-zeka/status` yalnız yapılandırmanın var/yok durumunu ve model adlarını döndürür; anahtar döndürmez.

## Güvenlik ve veri sahipliği

- Agent endpointleri normal kullanıcı oturumu istemez; `X-KYERP-Agent-Key` ile doğrulanır.
- Her dosya ve olay `main_company_slug` + `storage_connection_id` ile tenant'a bağlanır.
- Fiziksel dosyanın canonical evi seçilen provider'dır. D1 dosya kimliği, hash, ilişki, revizyon ve konum bilgisini tutar.
- R2 ağır/orijinal arşiv değildir; yalnız web önizleme/cache veya kısa süreli staging rolünde kullanılır.
- Silinen fiziksel dosya ERP kaydını yok etmez; konum `MISSING` durumuna geçer ve başka erişilebilir mirror varsa primary konum devredilebilir.
- Muhasebe arşiv worker hedef yolu kök altında doğrular; `..` ile kök dışına çıkış reddedilir.
- Düşük belge confidence, eksik cari veya eksik kalem doğrudan muhasebeleştirilmez; inceleme/son onay gerekir.
