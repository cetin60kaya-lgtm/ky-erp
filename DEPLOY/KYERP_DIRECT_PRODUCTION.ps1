$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$EXPECTED_ROOT = "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ"
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$AUTH_VERSION = "canonical-v3"

function Fail($message) {
    Write-Host ""
    Write-Host "HATA: $message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

function Check-Exit($message) {
    if ($LASTEXITCODE -ne 0) { Fail $message }
}

function Live-Asset($url) {
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $response = Invoke-WebRequest "$url/?release=$stamp" -Headers @{ "Cache-Control" = "no-cache" } -UseBasicParsing -TimeoutSec 20
    if ($response.StatusCode -ne 200) { return "" }
    $match = [regex]::Match($response.Content, 'assets/index-[^"''>]+\.js')
    if ($match.Success) { return $match.Value }
    return ""
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - CANONICAL DIRECT PRODUCTION DEPLOY" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Repo: $ROOT"
Write-Host ""
Write-Host "KORUMA:" -ForegroundColor Yellow
Write-Host "- Production D1 migration/reset YOK." -ForegroundColor Yellow
Write-Host "- Production test INSERT/UPDATE/DELETE YOK." -ForegroundColor Yellow
Write-Host "- Kirli tracked Git agaci otomatik resetlenmez." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Bu klasor Git reposu degil: $ROOT" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git bulunamadi." }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi. npm install -g wrangler calistirin." }

Write-Host "=== 1/9 REPO ===" -ForegroundColor Cyan
Set-Location $ROOT
$origin = (git remote get-url origin 2>$null)
Check-Exit "Git origin okunamadi."
if ($origin -notmatch "cetin60kaya-lgtm/ky-erp") { Fail "Yanlis origin: $origin" }

$dirty = git status --porcelain --untracked-files=no
Check-Exit "Git durumu okunamadi."
if ($dirty) {
    Write-Host $dirty -ForegroundColor Yellow
    Fail "Tracked yerel degisiklik var; veri kaybetmemek icin deploy durduruldu."
}

git fetch origin
Check-Exit "git fetch basarisiz."
git checkout $BRANCH
Check-Exit "Production branch acilamadi."
git pull --ff-only origin $BRANCH
Check-Exit "Production branch guncellenemedi."

$LOCAL_SHA = (git rev-parse HEAD).Trim()
$REMOTE_SHA = (git rev-parse "origin/$BRANCH").Trim()
if ($LOCAL_SHA -ne $REMOTE_SHA) { Fail "Local ve origin SHA ayni degil." }
Write-Host "SHA: $LOCAL_SHA" -ForegroundColor Green

Write-Host ""
Write-Host "=== 2/9 CLOUDFLARE ===" -ForegroundColor Cyan
wrangler whoami
Check-Exit "Cloudflare OAuth oturumu bulunamadi. wrangler login calistirin."

Write-Host ""
Write-Host "=== 3/9 WORKER TYPECHECK + UNIT + FULL LOCAL AUTH ===" -ForegroundColor Cyan
Set-Location $WORKER
npm ci
Check-Exit "Worker npm ci basarisiz."
npm run typecheck
Check-Exit "Worker typecheck basarisiz."
npm test
Check-Exit "Worker testleri veya yerel auth integration smoke basarisiz."
npm run build
Check-Exit "Worker dry-run basarisiz."

Write-Host ""
Write-Host "=== 4/9 WORKER PRODUCTION DEPLOY ===" -ForegroundColor Green
wrangler deploy --config wrangler.jsonc
Check-Exit "Worker production deploy basarisiz."

Write-Host ""
Write-Host "=== 5/9 CANLI API + AUTH CONTRACT ===" -ForegroundColor Cyan
Start-Sleep -Seconds 4

$health = Invoke-WebRequest "https://api.kyerp.net/api/health?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -TimeoutSec 20
if ($health.StatusCode -ne 200) { Fail "api.kyerp.net health HTTP 200 degil." }
Write-Host "API health: HTTP 200" -ForegroundColor Green

$statusResponse = Invoke-WebRequest "https://api.kyerp.net/api/auth/status?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ Origin = "https://kyerp.net" } -UseBasicParsing -TimeoutSec 20
if ($statusResponse.StatusCode -ne 200) { Fail "Auth status HTTP 200 degil." }
$statusJson = $statusResponse.Content | ConvertFrom-Json
if ($statusJson.authVersion -ne $AUTH_VERSION) { Fail "Auth version beklenen degil: $($statusJson.authVersion)" }
if ([int]$statusJson.sessionPolicy.passwordOnlySeconds -ne 28800) { Fail "Password session 8 saat degil." }
if ([int]$statusJson.sessionPolicy.mfaSeconds -ne 36000) { Fail "MFA session 10 saat degil." }
Write-Host "Auth: $AUTH_VERSION | parola 8h | MFA 10h" -ForegroundColor Green

try {
    Invoke-WebRequest "https://api.kyerp.net/api/auth/login" -Method POST -ContentType "text/plain;charset=UTF-8" -Body "{}" -Headers @{ Origin = "https://kyerp.net" } -UseBasicParsing -TimeoutSec 20 | Out-Null
    Fail "Bos auth login istegi 400 yerine basarili oldu."
} catch {
    $code = $null
    if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
    if ($code -ne 400) { Fail "Canonical login bos istekte beklenen HTTP 400 yerine $code dondu." }
    Write-Host "Canonical login: HTTP 400 beklenen" -ForegroundColor Green
}

try {
    $preflight = Invoke-WebRequest "https://api.kyerp.net/api/auth/login" -Method OPTIONS -Headers @{
        Origin = "https://kyerp.net"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type"
    } -UseBasicParsing -TimeoutSec 20
    if ($preflight.StatusCode -notin @(200,204)) { Fail "CORS preflight basarisiz: HTTP $($preflight.StatusCode)" }
    Write-Host "CORS preflight: HTTP $($preflight.StatusCode)" -ForegroundColor Green
} catch { Fail "CORS preflight kontrolu basarisiz: $($_.Exception.Message)" }

Write-Host ""
Write-Host "=== 6/9 FRONTEND LINT + TEST + BUILD ===" -ForegroundColor Cyan
Set-Location $FRONTEND
npm ci
Check-Exit "Frontend npm ci basarisiz."
npm run lint
Check-Exit "Frontend lint basarisiz."
npm test
Check-Exit "Frontend testleri basarisiz."
npm run build
Check-Exit "Frontend build basarisiz."

$DIST_INDEX = Join-Path $FRONTEND "dist\index.html"
if (-not (Test-Path $DIST_INDEX)) { Fail "dist\index.html olusmadi." }
$distHtml = Get-Content $DIST_INDEX -Raw
$assetMatch = [regex]::Match($distHtml, 'assets/index-[^"''>]+\.js')
if (-not $assetMatch.Success) { Fail "Build asset hash bulunamadi." }
$EXPECTED_ASSET = $assetMatch.Value
Write-Host "Build asset: $EXPECTED_ASSET" -ForegroundColor Green

Write-Host ""
Write-Host "=== 7/9 PAGES PRODUCTION DEPLOY ===" -ForegroundColor Green
wrangler pages deploy dist --project-name=ky-erp-frontend --branch=$BRANCH --commit-hash=$LOCAL_SHA
Check-Exit "Cloudflare Pages deploy basarisiz."

Write-Host ""
Write-Host "=== 8/9 CUSTOM DOMAIN ASSET DOGRULAMA ===" -ForegroundColor Cyan
$kyerpAsset = ""
$appAsset = ""
for ($i = 1; $i -le 20; $i++) {
    try { $kyerpAsset = Live-Asset "https://kyerp.net" } catch { $kyerpAsset = "" }
    try { $appAsset = Live-Asset "https://app.kyerp.net" } catch { $appAsset = "" }
    Write-Host "[$i/20] kyerp=$kyerpAsset | app=$appAsset"
    if ($kyerpAsset -eq $EXPECTED_ASSET -and $appAsset -eq $EXPECTED_ASSET) { break }
    Start-Sleep -Seconds 5
}
if ($kyerpAsset -ne $EXPECTED_ASSET) { Fail "kyerp.net yeni build assetini gostermiyor." }
if ($appAsset -ne $EXPECTED_ASSET) { Fail "app.kyerp.net yeni build assetini gostermiyor." }

Write-Host ""
Write-Host "=== 9/9 SONUC ===" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green
Write-Host " KY ERP PRODUCTION DEPLOY BASARILI " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Repo SHA       : $LOCAL_SHA"
Write-Host "Auth           : $AUTH_VERSION"
Write-Host "Worker API     : HTTP 200"
Write-Host "Build asset    : $EXPECTED_ASSET"
Write-Host "kyerp.net      : $kyerpAsset"
Write-Host "app.kyerp.net  : $appAsset"
Write-Host ""
$finalStamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Host "CANLI TEST:" -ForegroundColor Yellow
Write-Host "https://kyerp.net/?release=$finalStamp" -ForegroundColor White
Write-Host ""
Read-Host "Kapatmak icin ENTER"
