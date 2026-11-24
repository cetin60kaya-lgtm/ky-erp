# KY ERP / IsNet Cloudflare QA - DESEN-only guided activation.
# Default: READ-ONLY preflight. Activation requires -Asama Aktiflestir and user approval.
# Does not read or write production D1, File Hub, Drive files, or accounting documents.
[CmdletBinding()]
param(
  [ValidateSet("Kontrol","Aktiflestir")]
  [string]$Asama = "Kontrol"
)
Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$workerName = "kyerp-isnet-cloud-qa"
$qaDatabase = "kyerp-isnet-qa-20261124"
$qaDatabaseId = "cda199d5-23cf-405b-a15e-c579ac8fa6fb"
$qaUrl = "https://kyerp-isnet-cloud-qa.cetin60kaya.workers.dev"
$branch = "feat/isnet-cloud-first-shared-filehub-20261123"
$base = "https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/$branch/TOOLS/isnet-cloud-qa-live"

if ([string]$env:COMPUTERNAME -ine "DESEN") {
  throw "DEVICE_MISMATCH: This QA activation is limited to the DESEN computer."
}
Write-Output "QA_TARGET=DESEN"
Write-Output ("QA_STAGE=" + $Asama)

$wranglerCommand = Get-Command "wrangler.cmd" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wranglerCommand) {
  $wranglerCommand = Get-Command "wrangler" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $wranglerCommand) {
  Write-Output "WRANGLER_PRESENT=False"
  Write-Output "NO_INSTALL_PERFORMED=True"
  Write-Output "Tell ChatGPT that Wrangler was not found on DESEN."
  return
}
$wrangler = [string]$wranglerCommand.Source
Write-Output "WRANGLER_PRESENT=True"

function Run-WranglerQuiet([string[]]$options) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $wrangler @options 2>&1 | Out-Null
    return [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
}
if ((Run-WranglerQuiet @("whoami")) -ne 0) {
  Write-Output "CLOUDFLARE_DESEN_AUTH=False"
  Write-Output "On DESEN, sign in through the browser with: wrangler login"
  Write-Output "Do not paste tokens or passwords in the chat or GitHub."
  return
}
Write-Output "CLOUDFLARE_DESEN_AUTH=True"

$qaDir = Join-Path $env:TEMP "KYERP-ISNET-DESEN-QA"
New-Item -ItemType Directory -Force -Path $qaDir | Out-Null
$confPath = Join-Path $qaDir "wrangler.qa.jsonc"
Invoke-WebRequest -UseBasicParsing -Uri "$base/wrangler.qa.jsonc" -OutFile $confPath -TimeoutSec 40
$conf = Get-Content -LiteralPath $confPath -Raw | ConvertFrom-Json
if ($conf.name -ne $workerName -or $conf.workers_dev -ne $true -or
    $conf.d1_databases.Count -ne 1 -or
    $conf.d1_databases[0].binding -ne "DB" -or
    $conf.d1_databases[0].database_name -ne $qaDatabase -or
    $conf.d1_databases[0].database_id -ne $qaDatabaseId -or
    $conf.vars.QA_ENV -ne "ISOLATED_QA" -or
    $conf.vars.OFFICIAL_DOCUMENT_SEND_ENABLED -ne "false") {
  throw "QA_CONFIG_REJECTED: No production bindings are allowed."
}
Write-Output "ISOLATED_QA_CONFIG=True"

$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  $listed = & $wrangler secret list --name $workerName --config $confPath 2>&1 | Out-String
  $listExit = [int]$LASTEXITCODE
} finally {
  $ErrorActionPreference = $previous
}
if ($listExit -ne 0) {
  Write-Output "QA_WORKER_ACCESS=False"
  Write-Output "Check that DESEN was authorized for the Cloudflare account holding this QA Worker."
  return
}
Write-Output "QA_WORKER_ACCESS=True"
$hasKey = [bool]($listed -match '"name"\s*:\s*"QA_SESSION_KEY"')
$hasIp  = [bool]($listed -match '"name"\s*:\s*"QA_ALLOWED_IP"')
Write-Output ("QA_SESSION_KEY_PRESENT=" + $hasKey)
Write-Output ("QA_ALLOWED_IP_PRESENT=" + $hasIp)

try {
  $health = Invoke-RestMethod -Uri "$qaUrl/api/health" -Method GET -TimeoutSec 20
  $healthOk = [bool]($health.ok -eq $true -and $health.environment -eq "ISOLATED_QA" -and $health.noProductionBinding -eq $true)
} catch {
  $healthOk = $false
}
Write-Output ("ISOLATED_WORKER_HEALTH=" + $healthOk)
if (-not $healthOk) { throw "QA_WORKER_HEALTH_FAILED" }

if ($Asama -eq "Kontrol") {
  Write-Output "READ_ONLY_PREFLIGHT_COMPLETE=True"
  Write-Output "NO_CLOUDFLARE_CHANGES=True"
  Write-Output "To activate later, run the same script with -Asama Aktiflestir."
  return
}

# Explicit activation on DESEN only. Re-deploy this isolated QA Worker (not production).
foreach ($name in @("worker.mjs", "ui.mjs")) {
  $target = Join-Path $qaDir $name
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $target -TimeoutSec 40
  if ((Get-Item -LiteralPath $target).Length -lt 200) { throw "QA_SOURCE_MISSING" }
}
if ((Run-WranglerQuiet @("deploy", "--config", $confPath, "--cwd", $qaDir)) -ne 0) {
  throw "ISOLATED_QA_DEPLOY_FAILED"
}
Write-Output "ISOLATED_QA_DEPLOY=True"

function Put-QA-Secret([string]$name, [string]$value) {
  $previousError = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $value | & $wrangler secret put $name --name $workerName --config $confPath 2>&1 | Out-Null
    $code = [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousError
  }
  if ($code -ne 0) { throw ("QA_SECRET_UPDATE_FAILED:" + $name) }
}
if (-not $hasKey) {
  $buffer = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
    $sessionKey = ([BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
    Put-QA-Secret "QA_SESSION_KEY" $sessionKey
  } finally {
    $sessionKey = $null
    [Array]::Clear($buffer, 0, $buffer.Length)
    $rng.Dispose()
  }
  Write-Output "QA_SESSION_KEY_CREATED=True"
} else {
  Write-Output "QA_SESSION_KEY_PRESERVED=True"
}

# The allowed visitor address is derived locally at the time of activation.
# It is never printed, committed, uploaded to Drive or added to a log by this script.
$addressReply = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -Method GET -TimeoutSec 20
$address = [string]$addressReply.ip
$parsed = $null
if (-not [System.Net.IPAddress]::TryParse($address, [ref]$parsed)) {
  throw "DESEN_PUBLIC_IP_UNVERIFIED"
}
Put-QA-Secret "QA_ALLOWED_IP" $address
$address = $null
Write-Output "DESEN_QA_ACCESS_RULE_UPDATED=True"

# A successful health response alone is NOT an acceptance test.
# The protected UI must be reachable from DESEN, and the JavaScript must load.
$uiResponse = Invoke-WebRequest -Uri $qaUrl -UseBasicParsing -TimeoutSec 25
$jsResponse = Invoke-WebRequest -Uri "$qaUrl/app.js" -UseBasicParsing -TimeoutSec 25
$uiPass = [bool]([int]$uiResponse.StatusCode -eq 200 -and
                 $uiResponse.Content -match "IsNet|İşNet|Cloudflare QA")
$jsPass = [bool]([int]$jsResponse.StatusCode -eq 200 -and
                 $jsResponse.Content.Length -gt 400)
Write-Output ("QA_UI_HTTP=" + [int]$uiResponse.StatusCode)
Write-Output ("QA_JS_HTTP=" + [int]$jsResponse.StatusCode)
Write-Output ("QA_UI_VALIDATED=" + $uiPass)
Write-Output ("QA_JS_VALIDATED=" + $jsPass)
if (-not $uiPass -or -not $jsPass) { throw "DESEN_QA_UI_NOT_VERIFIED" }
Write-Output ("QA_TEST_URL=" + $qaUrl)
Write-Output "QA_READY_FOR_REAL_USER_TEST=True"
Write-Output "NEXT: Use your own IsNet account, select the authorized firm, list 1-2 despatches and download XML/PDF."
