$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$V3 = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3_RUNTIME.ps1"
$PUBLIC_DOMAIN = "kyerp.net"
$CANONICAL_PROJECT = "ky-erp-frontend"

$script:CF_TOKEN = ""
$script:CF_ACCOUNT_ID = ""
$script:CF_ZONE_ID = ""
$script:PAGES_PROJECT = ""

function Fail($message) {
    Write-Host ""
    Write-Host "HATA: $message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

function Invoke-KyCfApi([string]$Method, [string]$Path, $Body = $null) {
    if (-not $script:CF_TOKEN) { Fail "Cloudflare API tokeni hazir degil." }
    $uri = "https://api.cloudflare.com/client/v4$Path"
    $headers = @{ Authorization = "Bearer $($script:CF_TOKEN)" }
    try {
        if ($null -ne $Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 12 -Compress
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType "application/json" -Body $jsonBody -TimeoutSec 30
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec 30
        }
    } catch {
        Fail "Cloudflare API istegi basarisiz [$Method $Path]: $($_.Exception.Message)"
    }
    if ($null -ne $response.success -and -not [bool]$response.success) {
        $errors = try { $response.errors | ConvertTo-Json -Depth 8 -Compress } catch { "" }
        Fail "Cloudflare API basarisiz [$Method $Path]: $errors"
    }
    return $response
}

function Get-KyPagesProjects {
    $response = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects"
    return @($response.result)
}

function Get-KyProjectDomains([string]$ProjectName) {
    $safeProject = [uri]::EscapeDataString($ProjectName)
    $response = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject/domains"
    return @($response.result)
}

function Initialize-KyCloudflareContext {
    Write-Host "Cloudflare tek-domain altyapi kontrolu..." -ForegroundColor Cyan

    $authRaw = (& wrangler auth token --json 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $authRaw) { Fail "Wrangler OAuth tokeni okunamadi. Once wrangler login calistirin." }
    try { $auth = $authRaw | ConvertFrom-Json }
    catch { Fail "Wrangler auth token JSON okunamadi." }

    $token = [string]$auth.token
    if (-not $token) { Fail "OAuth/API token bulunamadi. wrangler login ile OAuth kullanin." }
    $script:CF_TOKEN = $token

    $zoneResponse = Invoke-KyCfApi "GET" "/zones?name=$PUBLIC_DOMAIN"
    $zones = @($zoneResponse.result)
    if ($zones.Count -ne 1) { Fail "$PUBLIC_DOMAIN Cloudflare zone kaydi tekil olarak bulunamadi." }

    $zone = $zones[0]
    $script:CF_ZONE_ID = [string]$zone.id
    $script:CF_ACCOUNT_ID = [string]$zone.account.id
    if (-not $script:CF_ZONE_ID -or -not $script:CF_ACCOUNT_ID) { Fail "Cloudflare zone/account kimligi okunamadi." }

    # Root domain baska bir Worker custom domainine bagliysa otomatik Pages degisikligi yapma.
    $workerDomains = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/workers/domains?hostname=$PUBLIC_DOMAIN"
    $rootWorkerDomains = @($workerDomains.result | Where-Object {
        ([string]$_.hostname).Trim().ToLowerInvariant() -eq $PUBLIC_DOMAIN
    })
    if ($rootWorkerDomains.Count -gt 0) {
        $services = ($rootWorkerDomains | ForEach-Object { [string]$_.service } | Where-Object { $_ }) -join ", "
        Fail "$PUBLIC_DOMAIN bir Worker custom domainine bagli. Otomatik Pages kurulumu yapilmadi. Worker: $services"
    }

    # Root domaini kapsayan zone Worker route varsa yine dur.
    $routeResponse = Invoke-KyCfApi "GET" "/zones/$($script:CF_ZONE_ID)/workers/routes"
    $rootRoutes = @($routeResponse.result | Where-Object {
        $pattern = ([string]$_.pattern).Trim().ToLowerInvariant()
        $pattern -eq $PUBLIC_DOMAIN -or $pattern -eq "$PUBLIC_DOMAIN/*" -or $pattern.StartsWith("$PUBLIC_DOMAIN/")
    })
    if ($rootRoutes.Count -gt 0) {
        $patterns = ($rootRoutes | ForEach-Object { [string]$_.pattern }) -join ", "
        Fail "$PUBLIC_DOMAIN bir Worker route tarafindan kullaniliyor. Otomatik Pages kurulumu yapilmadi. Route: $patterns"
    }

    Write-Host "Cloudflare root-domain Worker cakismasi: YOK" -ForegroundColor Green
}

function Resolve-Or-Create-KyPagesProject {
    Initialize-KyCloudflareContext

    $projects = Get-KyPagesProjects
    $owners = @()
    foreach ($project in $projects) {
        $name = ([string]$project.name).Trim()
        if (-not $name) { continue }
        $domains = Get-KyProjectDomains $name
        if (@($domains | Where-Object { ([string]$_.name).Trim().ToLowerInvariant() -eq $PUBLIC_DOMAIN }).Count -gt 0) {
            $owners += $project
        }
    }

    if ($owners.Count -gt 1) { Fail "$PUBLIC_DOMAIN birden fazla Pages projesinde gorunuyor; otomatik secim yapilmadi." }

    $selected = $null
    if ($owners.Count -eq 1) {
        $selected = $owners[0]
    } else {
        $selected = @($projects | Where-Object { ([string]$_.name).Trim() -eq $CANONICAL_PROJECT }) | Select-Object -First 1
    }

    if ($null -eq $selected) {
        Write-Host "Pages projesi yok. $CANONICAL_PROJECT guvenli olarak olusturuluyor..." -ForegroundColor Yellow
        $createBody = @{ name = $CANONICAL_PROJECT; production_branch = $BRANCH }
        $created = Invoke-KyCfApi "POST" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects" $createBody
        $selected = $created.result
    }

    $script:PAGES_PROJECT = ([string]$selected.name).Trim()
    if (-not $script:PAGES_PROJECT) { Fail "Pages proje adi okunamadi." }

    $currentBranch = ([string]$selected.production_branch).Trim()
    if ($currentBranch -ne $BRANCH) {
        Write-Host "Pages production branch canonical branch'e alinacak: $currentBranch -> $BRANCH" -ForegroundColor Yellow
        $safeProject = [uri]::EscapeDataString($script:PAGES_PROJECT)
        $updated = Invoke-KyCfApi "PATCH" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject" @{ production_branch = $BRANCH }
        $currentBranch = ([string]$updated.result.production_branch).Trim()
    }
    if ($currentBranch -ne $BRANCH) { Fail "Pages production branch canonical branch olarak ayarlanamadi." }

    $env:KYERP_CF_TOKEN = $script:CF_TOKEN
    $env:KYERP_CF_ACCOUNT_ID = $script:CF_ACCOUNT_ID
    $env:KYERP_PAGES_PROJECT = $script:PAGES_PROJECT

    Write-Host "Pages proje       : $($script:PAGES_PROJECT)" -ForegroundColor Green
    Write-Host "Pages production  : $BRANCH" -ForegroundColor Green
    Write-Host "Tek public domain : https://$PUBLIC_DOMAIN/" -ForegroundColor Green
}

function Ensure-KySinglePublicDomain {
    if (-not $env:KYERP_CF_TOKEN -or -not $env:KYERP_CF_ACCOUNT_ID -or -not $env:KYERP_PAGES_PROJECT) {
        Fail "Pages domain baglama bilgisi eksik."
    }

    $script:CF_TOKEN = $env:KYERP_CF_TOKEN
    $script:CF_ACCOUNT_ID = $env:KYERP_CF_ACCOUNT_ID
    $script:PAGES_PROJECT = $env:KYERP_PAGES_PROJECT

    $domains = Get-KyProjectDomains $script:PAGES_PROJECT
    $root = @($domains | Where-Object { ([string]$_.name).Trim().ToLowerInvariant() -eq $PUBLIC_DOMAIN }) | Select-Object -First 1
    if ($null -eq $root) {
        Write-Host "$PUBLIC_DOMAIN Pages projesine baglaniyor..." -ForegroundColor Yellow
        $safeProject = [uri]::EscapeDataString($script:PAGES_PROJECT)
        Invoke-KyCfApi "POST" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject/domains" @{ name = $PUBLIC_DOMAIN } | Out-Null
    }

    $safeProject = [uri]::EscapeDataString($script:PAGES_PROJECT)
    $safeDomain = [uri]::EscapeDataString($PUBLIC_DOMAIN)
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        $statusResponse = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject/domains/$safeDomain"
        $row = $statusResponse.result
        $status = ([string]$row.status).Trim().ToLowerInvariant()
        $validation = ([string]$row.validation_data.status).Trim().ToLowerInvariant()
        Write-Host "[$attempt/60] $PUBLIC_DOMAIN Pages durumu: $status / validation=$validation"
        if ($status -eq "active") {
            Write-Host "$PUBLIC_DOMAIN Pages custom domain: ACTIVE" -ForegroundColor Green
            return
        }
        if ($status -in @("error", "blocked", "deactivated") -or $validation -eq "error") {
            $detail = try { $row | ConvertTo-Json -Depth 8 -Compress } catch { "" }
            Fail "$PUBLIC_DOMAIN Pages domain aktivasyonu basarisiz: $detail"
        }
        if ($attempt -lt 60) { Start-Sleep -Seconds 5 }
    }
    Fail "$PUBLIC_DOMAIN 300 saniye icinde Pages ACTIVE olmadi."
}

if (-not (Test-Path $V3)) { Fail "Production V3 motoru bulunamadi: $V3" }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi." }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - PRODUCTION V5 / TEK ADRES" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Public app : https://$PUBLIC_DOMAIN/" -ForegroundColor Green
Write-Host "API        : https://api.kyerp.net (backend)" -ForegroundColor DarkGray
Write-Host "Kural      : Tek kullanici uygulama adresi." -ForegroundColor Green
Write-Host ""

try {
    $source = Get-Content $V3 -Raw

    # Worker canonical preflight tam auth integration testini de kapsar.
    if (-not $source.Contains('npm run test:unit')) { Fail "V3 Worker test satiri bulunamadi." }
    $source = $source.Replace('npm run test:unit', 'npm test')
    $source = $source.Replace('Check-Exit "Worker unit/contract testleri basarisiz."', 'Check-Exit "Worker tam unit/auth integration testleri basarisiz."')

    # Pages altyapisi ancak Worker/frontend preflight bittikten sonra, D1 yazimindan once hazirlanir.
    $d1Marker = 'Write-Host "=== 5/11 D1 YEDEK + HEDEFLI UYUMLULUK ===" -ForegroundColor Cyan'
    if (-not $source.Contains($d1Marker)) { Fail "V3 D1 asama isareti bulunamadi." }
    $pagesInit = @'
Resolve-Or-Create-KyPagesProject
Write-Host ""
'@
    $source = $source.Replace($d1Marker, $pagesInit + "`r`n" + $d1Marker)

    # Hard-coded Pages hedefini secilen/olusturulan projeye cevir.
    $oldDeploy = 'wrangler pages deploy dist --project-name=ky-erp-frontend --branch=$BRANCH --commit-hash=$LOCAL_SHA'
    if (-not $source.Contains($oldDeploy)) { Fail "V3 Pages deploy satiri beklenen formatta bulunamadi." }
    $newDeploy = 'wrangler pages deploy dist --project-name="$PAGES_PROJECT" --branch=$BRANCH --commit-hash=$LOCAL_SHA'
    $source = $source.Replace($oldDeploy, $newDeploy)

    # Deployment tamamlaninca yalniz kyerp.net Pages domainini garanti et.
    $pagesCheck = 'Check-Exit "Cloudflare Pages deploy basarisiz."'
    if (-not $source.Contains($pagesCheck)) { Fail "V3 Pages deploy kontrol satiri bulunamadi." }
    $source = $source.Replace($pagesCheck, $pagesCheck + "`r`nEnsure-KySinglePublicDomain")

    # Eski iki-domain asset kontrolunu tek canonical domain kontrolune indir.
    $oldAssetBlock = @'
Write-Host ""
Write-Host "=== 9/11 CUSTOM DOMAIN ASSET DOGRULAMA ===" -ForegroundColor Cyan
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
'@
    $newAssetBlock = @'
Write-Host ""
Write-Host "=== 9/11 TEK DOMAIN ASSET DOGRULAMA ===" -ForegroundColor Cyan
$kyerpAsset = ""
for ($i = 1; $i -le 30; $i++) {
    try { $kyerpAsset = Live-Asset "https://kyerp.net" } catch { $kyerpAsset = "" }
    Write-Host "[$i/30] kyerp.net=$kyerpAsset"
    if ($kyerpAsset -eq $EXPECTED_ASSET) { break }
    Start-Sleep -Seconds 5
}
if ($kyerpAsset -ne $EXPECTED_ASSET) { Fail "kyerp.net yeni build assetini gostermiyor." }
'@
    if (-not $source.Contains($oldAssetBlock)) { Fail "V3 eski iki-domain asset kontrol blogu bulunamadi." }
    $source = $source.Replace($oldAssetBlock, $newAssetBlock)

    $source = $source.Replace('Write-Host "app.kyerp.net   : $appAsset"', 'Write-Host "Public URL      : https://kyerp.net/"')

    # Runtime'da ikinci frontend domain kalmasina izin verme.
    if ($source.Contains('app.kyerp.net')) { Fail "Runtime deploy scriptinde ikinci frontend domain referansi kaldi; deploy baslatilmadi." }

    $prefix = @'
# --- KY ERP V5 SINGLE-DOMAIN RUNTIME HELPERS ---
'@
    $helperText = (Get-Content $PSCommandPath -Raw)
    $helperStart = $helperText.IndexOf('function Invoke-KyCfApi')
    $helperEnd = $helperText.IndexOf('if (-not (Test-Path $V3))')
    if ($helperStart -lt 0 -or $helperEnd -le $helperStart) { Fail "V5 helper bolumu okunamadi." }
    $helpers = $helperText.Substring($helperStart, $helperEnd - $helperStart)

    Set-Content -LiteralPath $RUNTIME -Value ($prefix + "`r`n" + $helpers + "`r`n" + $source) -Encoding utf8NoBOM
    & $RUNTIME
    $exitCode = $LASTEXITCODE
    exit $exitCode
} finally {
    Remove-Item $RUNTIME -Force -ErrorAction SilentlyContinue
    Remove-Item Env:KYERP_CF_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:KYERP_CF_ACCOUNT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:KYERP_PAGES_PROJECT -ErrorAction SilentlyContinue
}
