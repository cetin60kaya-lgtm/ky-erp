# KY ERP - Cloudflare isolated ISNET QA, not production.
# Uses existing authenticated Wrangler on X; never reads production D1/credentials.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "KYERP-ISNET-CF-QA-20261124"
New-Item -ItemType Directory -Force -Path $root | Out-Null
$branch = "feat/isnet-cloud-first-shared-filehub-20261123"
$base = "https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/$branch/TOOLS/isnet-cloud-qa-live"
foreach ($name in @("worker.mjs", "ui.mjs", "schema.sql", "wrangler.qa.jsonc")) {
  $target = Join-Path $root $name
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $target -TimeoutSec 45
  if ((Get-Item -LiteralPath $target).Length -lt 200) { throw "QA kaynak dosyası eksik: $name" }
}
$config = Get-Content (Join-Path $root "wrangler.qa.jsonc") -Raw | ConvertFrom-Json
if ($config.name -ne "kyerp-isnet-cloud-qa" -or
    $config.d1_databases[0].database_name -ne "kyerp-isnet-qa-20261124" -or
    $config.d1_databases[0].binding -ne "DB") { throw "QA config eşleşmedi. Productiona dokunulmadı." }
Push-Location $root
try {
  & wrangler whoami | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare oturumu yok." }
  & wrangler d1 execute kyerp-isnet-qa-20261124 --remote --config wrangler.qa.jsonc --file schema.sql
  if ($LASTEXITCODE -ne 0) { throw "Yalnız QA D1 şeması kurulamadı." }
  $buildOutput = & wrangler deploy --config wrangler.qa.jsonc 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "QA Worker deploy başarısız: $buildOutput" }
  Write-Output "QA_WORKER_DEPLOYED=True"
  # Browser session protection: never write IP or AES key to files, git or logs.
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $qaKey = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
  $qaKey | & wrangler secret put QA_SESSION_KEY --name kyerp-isnet-cloud-qa --config wrangler.qa.jsonc | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "QA AES secret kurulamadı." }
  $ipResult = Invoke-RestMethod "https://api.ipify.org?format=json" -TimeoutSec 20
  $qaIp = [string]$ipResult.ip
  if (!$qaIp -or $qaIp.Length -gt 55) { throw "QA cihaz IP doğrulanamadı." }
  $qaIp | & wrangler secret put QA_ALLOWED_IP --name kyerp-isnet-cloud-qa --config wrangler.qa.jsonc | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "QA IP koruması kurulamadı." }
  $script:subdomain = ([regex]::Match($buildOutput, "https://kyerp-isnet-cloud-qa\.[a-z0-9-]+\.workers\.dev")).Value
  if ($script:subdomain) {
    $url = $script:subdomain
    $r = Invoke-WebRequest -Uri "$url/api/health" -UseBasicParsing -TimeoutSec 25
    Write-Output ("QA_HEALTH_HTTP=" + [int]$r.StatusCode)
    $p = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
    Write-Output ("QA_UI_HTTP=" + [int]$p.StatusCode)
    Write-Output ("QA_UI_TITLE_FOUND=" + [bool]($p.Content -match "İşNet Gerçek Bulut Testi"))
    Write-Output ("QA_TEST_URL=" + $url)
  } else {
    Write-Output "QA_DEPLOY_OUTPUT_URL_NOT_PARSED=True"
  }
  Write-Output "QA_DEPLOY_EXIT=0"
} finally {
  $qaKey = $null
  $qaIp = $null
  Pop-Location
}