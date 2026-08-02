[CmdletBinding()]
param(
    [int]$ApiPort = 8787,
    [int]$WebPort = 5173,
    [switch]$ResetLocalData,
    [switch]$Reinstall,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Worker = Join-Path $RepoRoot "APP\cloud\ky-erp-api"
$Frontend = Join-Path $RepoRoot "APP\app\ky-erp-frontend"
$WorkerConfig = Join-Path $Worker "wrangler.production-local.jsonc"
$PersistName = ".local-kyerp-dev"
$PersistPath = Join-Path $Worker $PersistName
$InitMarker = Join-Path $PersistPath ".kyerp-initialized"
$ProcessFile = Join-Path $env:TEMP "kyerp-local-processes.json"
$ApiOrigin = "http://127.0.0.1:$ApiPort"
$WebOrigin = "http://localhost:$WebPort"

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "'$Name' bulunamadı. Node.js kurulumunu kontrol edin."
    }
}

function Get-ListeningProcessId([int]$Port) {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Wait-Endpoint([string]$Url, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 4
            if ($response -and $response.ok -eq $true) { return $true }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Wait-Web([string]$Url, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Install-Packages([string]$Path, [string]$Label) {
    $nodeModules = Join-Path $Path "node_modules"
    if ($Reinstall -or -not (Test-Path $nodeModules)) {
        Write-Step "$Label paketleri kuruluyor"
        Push-Location $Path
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "$Label paketleri kurulamadı." }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "$Label paketleri hazır." -ForegroundColor DarkGreen
    }
}

Assert-Command "node"
Assert-Command "npm"

if (-not (Test-Path (Join-Path $Worker "package.json"))) {
    throw "Worker klasörü bulunamadı: $Worker"
}
if (-not (Test-Path (Join-Path $Frontend "package.json"))) {
    throw "Frontend klasörü bulunamadı: $Frontend"
}
if (-not (Test-Path $WorkerConfig)) {
    throw "Yerel Worker yapılandırması bulunamadı: $WorkerConfig"
}

Install-Packages $Worker "Worker"
Install-Packages $Frontend "Frontend"

$mustInitialize = $ResetLocalData -or -not (Test-Path $InitMarker)
if ($mustInitialize) {
    if (Test-Path $PersistPath) {
        Write-Step "Eksik veya eski izole yerel veri temizleniyor"
        Remove-Item $PersistPath -Recurse -Force
    }

    Write-Step "İzole yerel D1 verisi hazırlanıyor"
    Push-Location $Worker
    try {
        $sqlFiles = @(
            "local-production-center.sql",
            "local-boyahane-inventory.sql",
            "local-isnet-cloud.sql"
        )
        foreach ($sqlFile in $sqlFiles) {
            $sqlPath = Join-Path $Worker $sqlFile
            if (-not (Test-Path $sqlPath)) {
                throw "Yerel kurulum dosyası bulunamadı: $sqlFile"
            }
            Write-Host "Yükleniyor: $sqlFile" -ForegroundColor Yellow
            & npx wrangler d1 execute ky-erp-production-local `
                --local `
                --config $WorkerConfig `
                --persist-to $PersistName `
                --file $sqlFile
            if ($LASTEXITCODE -ne 0) {
                throw "$sqlFile yerel D1'e yüklenemedi."
            }
        }
        New-Item -ItemType File -Path $InitMarker -Force | Out-Null
    } catch {
        if (Test-Path $InitMarker) {
            Remove-Item $InitMarker -Force -ErrorAction SilentlyContinue
        }
        throw
    } finally {
        Pop-Location
    }
}

$apiHostPid = 0
$apiPid = Get-ListeningProcessId $ApiPort
if ($apiPid -gt 0) {
    if (-not (Wait-Endpoint "$ApiOrigin/api/health" 5)) {
        throw "$ApiPort portu başka bir işlem tarafından kullanılıyor (PID $apiPid). O işlemi kapatıp tekrar çalıştırın."
    }
    Write-Host "Yerel API zaten çalışıyor (PID $apiPid)." -ForegroundColor Green
} else {
    Write-Step "Yerel API başlatılıyor"
    $workerCommand = @"
Set-Location '$Worker'
npx wrangler dev --local --config '$WorkerConfig' --persist-to '$PersistName' --port $ApiPort
"@
    $apiProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $workerCommand
    )
    $apiHostPid = $apiProcess.Id
    if (-not (Wait-Endpoint "$ApiOrigin/api/health" 75)) {
        Stop-Process -Id $apiHostPid -Force -ErrorAction SilentlyContinue
        throw "Yerel API başlayamadı. Açılan Worker penceresindeki hatayı kontrol edin."
    }
    $apiPid = Get-ListeningProcessId $ApiPort
    if ($apiPid -le 0) {
        throw "Yerel API yanıt verdi ancak dinleyen işlem belirlenemedi."
    }
}

$webHostPid = 0
$webPid = Get-ListeningProcessId $WebPort
if ($webPid -gt 0) {
    Write-Host "Frontend zaten çalışıyor (PID $webPid)." -ForegroundColor Green
} else {
    Write-Step "KY ERP arayüzü başlatılıyor"
    $frontendCommand = @"
Set-Location '$Frontend'
`$env:VITE_API_URL = '$ApiOrigin'
npm run dev -- --host localhost --port $WebPort --strictPort
"@
    $webProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command", $frontendCommand
    )
    $webHostPid = $webProcess.Id

    if (-not (Wait-Web $WebOrigin 60)) {
        Stop-Process -Id $webHostPid -Force -ErrorAction SilentlyContinue
        throw "Frontend başlayamadı. Açılan frontend penceresindeki hatayı kontrol edin."
    }
    $webPid = Get-ListeningProcessId $WebPort
    if ($webPid -le 0) {
        throw "Frontend yanıt verdi ancak dinleyen işlem belirlenemedi."
    }
}

@{
    apiPid = $apiPid
    apiHostPid = $apiHostPid
    webPid = $webPid
    webHostPid = $webHostPid
    apiPort = $ApiPort
    webPort = $WebPort
    repoRoot = $RepoRoot
    startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Path $ProcessFile -Encoding UTF8

Write-Host "`nKY ERP yerel kontrol hazır." -ForegroundColor Green
Write-Host "API      : $ApiOrigin/api/health"
Write-Host "Uygulama : $WebOrigin"
Write-Host "Veri     : İzole yerel D1/R2 ($PersistPath)"
Write-Host "Durdurma : .\SCRIPTS\KYERP_YEREL_DURDUR.ps1"

if (-not $NoBrowser) {
    Start-Process "$WebOrigin/muhasebe/yonetim-ozeti"
}
