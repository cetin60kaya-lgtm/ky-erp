# KY File Agent

KY ERP File Hub'ın Windows tarafındaki sağlayıcı-bağımsız dosya izleyicisidir. Google Drive Desktop, OneDrive, yerel klasör veya NAS senkron klasörlerini aynı ajan izleyebilir.

## Çalışma modeli

1. KY ERP > Yönetim > Dosya ve Klasör Yönetimi ekranında firma için depolama bağlantısını oluşturun.
2. Ekranda oluşan bağlantı kimliğini `file-hub-agent.config.json` içine yazın.
3. `file-hub-agent.config.example.json` dosyasını `file-hub-agent.config.json` adıyla kopyalayın.
4. Worker secret olarak güçlü bir `FILE_HUB_AGENT_KEY` tanımlayın. Aynı değeri Windows'ta `KYERP_AGENT_KEY` ortam değişkenine verin.
5. `KYERP_MAIN_COMPANY_SLUG` ilgili ana firmanın slug değeridir.
6. Agent dosyayı sabit boyuta geldikten sonra SHA-256 ile indeksler; dosyanın kendisini D1'e taşımaz.

## Muhasebe PDF / tarama otomatik arşivi

`start-file-hub-agent.cmd` artık iki süreci birlikte başlatır: normal File Hub izleyicisi ve `accounting-archive-worker.mjs`.

Muhasebe Belge Havuzu'na PDF/JPG/PNG/TIFF tarama yüklendiğinde belge önce yapılandırılmış Document Intelligence ile okunur. `AI_SCAN` kaydı D1'e düştüğü anda `accounting_document_archive_jobs` kuyruğu otomatik oluşur. Arşiv worker kuyruğu alır, firma için `MUHASEBE + INVOICE` veya `MUHASEBE + DELIVERY_NOTE` bindingini çözer, yoksa firmanın primary AGENT depolamasına düşer. Dosya önce `.kyerp-part-*` geçici adıyla yazılır, SHA-256 hesaplanır ve atomik rename ile son adına alınır. Başarılı işlemde aynı `FileAsset` için gerçek provider lokasyonu oluşturulur ve `CANONICAL_ARCHIVE_PENDING` uyarısı kapatılır.

Google Drive Desktop ve OneDrive Client kullanımında hedef `local_root_path` ilgili senkron klasörüdür; provider uygulaması dosyayı kendi bulutuna senkronlar. ERP ağır/orijinal dosyanın kalıcı evi olmaz.

Arşiv yolu varsayılan olarak şu yapıda üretilir:

```text
<binding root>/<YYYY-MM>/<firma>/<belge-no> - <orijinal-dosya-adı>
```

Aynı hedefte farklı içerikli bir dosya varsa worker üzerine yazmaz; işi `RETRY/FAILED` durumuna alır. Aynı içerik SHA-256 ile doğrulanırsa güvenli/idempotent tamamlanır.

## Örnek başlatma

PowerShell:

```powershell
$env:KYERP_API_URL="https://api.kyerp.net"
$env:KYERP_AGENT_KEY="<secret>"
$env:KYERP_MAIN_COMPANY_SLUG="mecit-hakan"
$env:KYERP_FILE_HUB_CONFIG="D:\KYERP\file-hub-agent.config.json"
.\start-file-hub-agent.cmd
```

Yalnız normal indeksleyiciyi çalıştırmak gerekirse:

```powershell
node D:\KYERP\file-hub-agent.mjs
```

Yalnız muhasebe arşiv kuyruğunu çalıştırmak gerekirse:

```powershell
node D:\KYERP\accounting-archive-worker.mjs
```

Worker secret:

```powershell
cd APP\cloud\ky-erp-api
npx wrangler secret put FILE_HUB_AGENT_KEY
```

Belge yapay zeka servisi için Worker secret/variable adları:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
AZURE_DOCUMENT_INTELLIGENCE_KEY
KYERP_DOCINTEL_INVOICE_MODEL       # varsayılan prebuilt-invoice
KYERP_DOCINTEL_DISPATCH_MODEL      # varsayılan prebuilt-layout veya firma özel modeli
KYERP_DOCINTEL_API_VERSION         # varsayılan 2024-11-30
```

Secret değerleri repoya yazılmaz. `/api/muhasebe/belge-zeka/status` yalnız yapılandırmanın var/yok durumunu ve model adlarını döndürür; anahtar döndürmez.

## Güvenlik

- Agent endpointleri kullanıcı oturumu istemez; yalnız `X-KYERP-Agent-Key` ile çalışır.
- Agent key repoya veya config dosyasına düz metin olarak commit edilmez.
- Her olay `main_company_slug` ve `storage_connection_id` ile tenant'a bağlanır.
- Arşiv worker hedef yolu `path.resolve` ile kök altında doğrular; `..` ile kök dışına çıkış reddedilir.
- Silinen fiziksel dosya ERP kaydını silmez; `MISSING` durumuna geçirir.
- Tarama dosyası 40 MB üstündeyse Document Intelligence intake reddedilir.
- Muhasebe kaydı düşük AI confidence, eksik cari veya eksik kalem durumunda doğrudan muhasebeleştirilmez; inceleme/son onay gerekir.

## Desen takım bilgisi

`OUTGOING_DESIGN` olarak bağlanan klasörlerde aynı üst klasördeki modeller `OUTGOING_PACKAGE` ilişkisine alınır. D1 trigger'ı karşılıklı `MODEL_TEAMMATE` ilişkilerini üretir; böylece Asistan “A modeli hangi desenlerle takım olmuş?” sorusunu File Hub indeksinden cevaplayabilir.
