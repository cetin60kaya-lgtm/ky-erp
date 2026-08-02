param(
    [switch]$Reset,
    [ValidateSet("Boyahane", "Uretim")]
    [string]$Page = "Boyahane"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try {
    chcp 65001 | Out-Null
} catch {
    # Kod sayfası değiştirilemiyorsa betik yine devam eder.
}

$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8

$Repo = Split-Path -Parent $PSScriptRoot
$WorkerDir = Join-Path $Repo "APP\cloud\ky-erp-api"
$FrontendDir = Join-Path $Repo "APP\app\ky-erp-frontend"
$ConfigFile = Join-Path $WorkerDir "wrangler.production-local.jsonc"
$SeedFile = Join-Path $WorkerDir "local-production-center.sql"
$BoyahaneSeedFile = Join-Path $WorkerDir "local-boyahane-inventory.sql"
$PersistDir = Join-Path $Repo ".local-test\production-center"
$ExpectedBranch = "codex/model-uretim-kontrol-merkezi-final"
$PageUrl = if ($Page -eq "Uretim") {
    "http://localhost:5173/uretim/uretim-merkezi"
} else {
    "http://localhost:5173/boyahane/ana-ekran"
}

function Write-Step([string]$Message) {
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Stop-Port([int]$Port) {
    Get-NetTCPConnection `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "Port $Port kapatılıyor. PID: $($_.OwningProcess)" -ForegroundColor Yellow
        Stop-Process `
            -Id $_.OwningProcess `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds = 60) {
    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $Deadline) {
        $Connection = Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue

        if ($Connection) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host " KY ERP BOYAHANE VE ÜRETİM YEREL KONTROL" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor DarkCyan

if (-not (Test-Path $Repo)) {
    throw "Repo klasörü bulunamadı: $Repo"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git bulunamadı."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js bulunamadı."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm bulunamadı."
}

Set-Location $Repo
$CurrentBranch = (git branch --show-current).Trim()

if ($CurrentBranch -ne $ExpectedBranch) {
    throw "Yanlış daldasınız. Beklenen: $ExpectedBranch | Mevcut: $CurrentBranch"
}

$Status = @(
    git status --short | Where-Object {
        $Line = [string]$_
        $Normalized = $Line.Replace("\", "/")

        # Wrangler ve yerel test klasörleri çalışma ağacını kirli sayılmaz.
        -not (
            $Normalized -match '^\?\?\s+(.*/)?\.local-[^/]+/' -or
            $Normalized -match '^\?\?\s+(.*/)?\.wrangler/'
        )
    }
)

if ($Status.Count -gt 0) {
    $Status | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    throw "Çalışma ağacında gerçek kaynak değişikliği var. Yerel değişiklikleri kaybetmemek için işlem durduruldu."
}

foreach ($Port in @(5173, 8787, 8788)) {
    Stop-Port $Port
}

if ($Reset -and (Test-Path $PersistDir)) {
    Write-Step "Yalnız izole test verisi sıfırlanıyor"
    Remove-Item $PersistDir -Recurse -Force
}

New-Item -ItemType Directory -Path $PersistDir -Force | Out-Null

Write-Step "Worker paketleri kontrol ediliyor"
Set-Location $WorkerDir

if (-not (Test-Path (Join-Path $WorkerDir "node_modules"))) {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "Worker paket kurulumu başarısız."
    }
}

Write-Step "İzole yerel D1 üretim verisi hazırlanıyor"
npx wrangler d1 execute ky-erp-production-local `
    --local `
    --config $ConfigFile `
    --persist-to $PersistDir `
    --file $SeedFile

if ($LASTEXITCODE -ne 0) {
    throw "Yerel D1 üretim örnek verisi hazırlanamadı."
}

if (Test-Path $BoyahaneSeedFile) {
    Write-Step "İzole Boyahane ürün ve lot verisi hazırlanıyor"
    npx wrangler d1 execute ky-erp-production-local `
        --local `
        --config $ConfigFile `
        --persist-to $PersistDir `
        --file $BoyahaneSeedFile

    if ($LASTEXITCODE -ne 0) {
        throw "Yerel Boyahane ürün ve lot verisi hazırlanamadı."
    }
}

$WorkerCommand = @"
`$Host.UI.RawUI.WindowTitle = 'KY ERP - YEREL WORKER 8788'
Set-Location '$WorkerDir'
chcp 65001 | Out-Null
Write-Host ''
Write-Host 'YALNIZ YEREL TEST VERISI KULLANILIYOR.' -ForegroundColor Green
Write-Host 'Canli D1 ve R2 baglantisi yoktur.' -ForegroundColor Green
Write-Host ''
npx wrangler dev --local --config '$ConfigFile' --persist-to '$PersistDir' --port 8788
"@

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $WorkerCommand
)

Write-Host "Worker başlatılıyor..." -ForegroundColor Yellow

if (-not (Wait-Port -Port 8788 -TimeoutSeconds 75)) {
    throw "Yerel Worker 8788 portunda açılamadı. Açılan Worker penceresindeki hatayı kontrol edin."
}

Write-Step "Yerel API kontrolü"
$ApiUrl = "http://127.0.0.1:8788/api/production-center?mainCompanySlug=mecit-hakan&pageSize=10"
$ApiResult = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 45

if (-not $ApiResult.ok) {
    throw "Yerel API kontrolü başarısız."
}

$ModelCount = [int]($ApiResult.data.summary.modelCount)
Write-Host "API hazır. Yerel model kartı: $ModelCount" -ForegroundColor Green

Write-Step "Frontend paketleri kontrol ediliyor"
Set-Location $FrontendDir

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend paket kurulumu başarısız."
    }
}

$FrontendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'KY ERP - YEREL FRONTEND 5173'
Set-Location '$FrontendDir'
chcp 65001 | Out-Null
`$env:VITE_API_URL = 'http://127.0.0.1:8788'
Write-Host ''
Write-Host 'Frontend izole yerel Worker ile aciliyor.' -ForegroundColor Cyan
Write-Host 'Adres: $PageUrl' -ForegroundColor Green
Write-Host ''
npm run dev -- --host 0.0.0.0 --port 5173
"@

Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $FrontendCommand
)

if (-not (Wait-Port -Port 5173 -TimeoutSeconds 75)) {
    throw "Frontend 5173 portunda açılamadı. Açılan frontend penceresindeki hatayı kontrol edin."
}

Start-Process $PageUrl

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host " YEREL TEST ORTAMI HAZIR" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host "Frontend : $PageUrl"
Write-Host "Yerel API: http://127.0.0.1:8788"
Write-Host "Yerel veri: $PersistDir"
Write-Host ""
Write-Host "Canlı D1, canlı R2, OneDrive, DATA ve STORAGE kullanılmıyor." -ForegroundColor Green
Write-Host "Boyahane ekranlarında ürün, lot, numune, imalat, renk ve rapor akışlarını güvenle deneyebilirsiniz." -ForegroundColor Green
Write-Host ""
Write-Host "Üretim merkezini açmak için:" -ForegroundColor Cyan
Write-Host "powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Page Uretim"
Write-Host ""
Write-Host "Test verisini baştan kurmak için:" -ForegroundColor Yellow
Write-Host "powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Reset"
