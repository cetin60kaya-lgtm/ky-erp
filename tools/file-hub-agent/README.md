# KY File Agent

KY ERP File Hub'ın Windows tarafındaki sağlayıcı-bağımsız dosya izleyicisidir. Google Drive Desktop, OneDrive, yerel klasör veya NAS senkron klasörlerini aynı ajan izleyebilir.

## Çalışma modeli

1. KY ERP > Yönetim > Dosya ve Klasör Yönetimi ekranında firma için depolama bağlantısını oluşturun.
2. Ekranda oluşan bağlantı kimliğini `file-hub-agent.config.json` içine yazın.
3. `file-hub-agent.config.example.json` dosyasını `file-hub-agent.config.json` adıyla kopyalayın.
4. Worker secret olarak güçlü bir `FILE_HUB_AGENT_KEY` tanımlayın. Aynı değeri Windows'ta `KYERP_AGENT_KEY` ortam değişkenine verin.
5. `KYERP_MAIN_COMPANY_SLUG` ilgili ana firmanın slug değeridir.
6. Agent dosyayı sabit boyuta geldikten sonra SHA-256 ile indeksler; dosyanın kendisini D1'e taşımaz.

## Örnek başlatma

PowerShell:

```powershell
$env:KYERP_API_URL="https://api.kyerp.net"
$env:KYERP_AGENT_KEY="<secret>"
$env:KYERP_MAIN_COMPANY_SLUG="mecit-hakan"
$env:KYERP_FILE_HUB_CONFIG="D:\KYERP\file-hub-agent.config.json"
node D:\KYERP\file-hub-agent.mjs
```

Worker secret:

```powershell
cd APP\cloud\ky-erp-api
npx wrangler secret put FILE_HUB_AGENT_KEY
```

## Güvenlik

- Agent endpointleri kullanıcı oturumu istemez; yalnız `X-KYERP-Agent-Key` ile çalışır.
- Agent key repoya veya config dosyasına düz metin olarak commit edilmez.
- Her olay `main_company_slug` ve `storage_connection_id` ile tenant'a bağlanır.
- Silinen fiziksel dosya ERP kaydını silmez; `MISSING` durumuna geçirir.

## Desen takım bilgisi

`OUTGOING_DESIGN` olarak bağlanan klasörlerde aynı üst klasördeki modeller `OUTGOING_PACKAGE` ilişkisine alınır. D1 trigger'ı karşılıklı `MODEL_TEAMMATE` ilişkilerini üretir; böylece Asistan “A modeli hangi desenlerle takım olmuş?” sorusunu File Hub indeksinden cevaplayabilir.
