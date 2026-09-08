# KY ERP Cloudflare Windows Build Center

## Amaç

GitHub Actions Windows runner kotasına bağlı kalmadan KY PDKS Pro ve KY ERP Desktop Setup üretmek.

Akış:

```text
KY ERP / Platform Yönetimi / Sürüm Merkezi
  -> Cloudflare Worker build request
  -> R2 FILES / build-center/jobs
  -> Windows KY Build Agent
  -> private GitHub branch clone
  -> test + publish + Inno Setup
  -> R2 multipart artifact upload
  -> Sürüm Merkezi / Setup İndir
```

## Cloudflare

Yeni bucket veya D1 migration yoktur.

Mevcut binding:

```json
{
  "binding": "FILES",
  "bucket_name": "ky-erp-files"
}
```

Build Center yalnız şu R2 prefixini kullanır:

```text
build-center/config/
build-center/status/
build-center/jobs/
build-center/logs/
build-center/artifacts/
```

İş verisi / File Hub dosyalarıyla prefix çakışmaz.

## Güvenlik

- Yönetim endpointleri yalnız ADMIN / SUPER_ADMIN.
- Windows Agent normal kullanıcı session tokenı kullanmaz.
- Owner "Tek Kullanımlık Kurulum Kodu Üret" dediğinde 10 dakika geçerli enrollment kodu oluşur.
- Enrollment kodunun yalnız SHA-256 hash'i R2'de tutulur ve kod tek kullanımdır.
- Windows setup kodu /api/build-agent/enroll üzerinden cihaz kimliğine bağlı 256-bit Agent secret ile değiştirir.
- Kalıcı Agent secret yalnız Windows DPAPI CurrentUser ile token.dat içinde saklanır.
- Agent her istekte X-KYERP-Build-Agent-Id + X-KYERP-Build-Agent-Token gönderir.
- Büyük Setup dosyaları 8 MB parçalarla R2 multipart upload edilir.
- Multipart parçaları yalnız ilgili job'ın artifactPendingKey alanına yazılabilir.
- Build Agent Windows kullanıcısının mevcut Git Credential Manager oturumunu kullanır; private repo tokenı kaynak dosyasına yazılmaz.

## Windows Agent

Dosyalar:

- build-agent.ps1
- setup-build-agent.ps1

Kurulum kullanıcı bağlamındadır. Bunun nedeni private GitHub repository erişiminin kullanıcının mevcut Git Credential Manager oturumuyla çalışmasıdır.

Yerel klasör:

```text
%LOCALAPPDATA%\KY ERP\BuildAgent
```

Token DPAPI CurrentUser ile şifreli token.dat dosyasında tutulur.

Agent Windows kullanıcı Startup klasörüne eklenir ve oturum açılışında otomatik başlar.

Agent açıkken 15 saniyede bir:

```text
GET /api/build-agent/next
```

kontrolü yapar. Claim/cancel/progress R2 ETag compare-and-set ile atomiktir.

## PDKS 1.9.0

Build request:

```text
Product : PDKS_PRO
Version : 1.9.0
Branch  : codex/pdks-desktop-1.8.1-device-final-20260907
```

Çalıştırılan script:

```text
APP/desktop/ky-pdks/BUILD_PDKS_PRO_SETUP.ps1
```

Beklenen artifact:

```text
KY-PDKS-Pro-Setup-1.9.0.exe
KY-PDKS-Pro-Setup-1.9.0.exe.sha256.txt
build-info-pdks.json
build.log
```

Setup Worker unit/typecheck/build, frontend test/lint/build, .NET/xUnit, win-x64 publish, Agent publish, WebView2 ve Inno Setup kapılarından geçmeden SUCCESS olamaz.

## Yönetim UI

Platform Yönetimi -> Sürüm Merkezi

- Agent durum / heartbeat
- 10 dakikalık tek-kullanımlık Agent kurulum kodu üret
- Agent kurulum PowerShell dosyası indir
- PDKS 1.9.0 Build Al
- canlı ilerleme
- build log indir
- Setup indir
- queued build iptal

## Production kuralı

Kaynak hazır olması canlı deploy değildir.

Production sırası:

```text
feature test
-> owner onayı
-> canonical merge
-> Cloudflare Git Integration
-> /api/admin/build-center/status smoke
-> Agent anahtarı
-> Windows Build Agent
-> ilk PDKS build
-> R2 Setup indirme doğrulaması
```


## Artifact bütünlüğü

- Windows Agent Setup dosyasının byte uzunluğunu ve SHA-256 özetini multipart başlangıcında gönderir.
- R2 tamamlanan object boyutu kaynak dosyayla birebir eşleşmezse object silinir ve job FAILED olur.
- SHA-256 değeri build kaydında artifactSha256 olarak tutulur; ayrıca bağımsız .sha256.txt artifact saklanır.
- R2 multipart parça boyutu 8 MiB'dir; 5 MiB minimum sınırın üzerindedir.
