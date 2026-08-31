$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$V3 = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3_RUNTIME.ps1"
$SITE_DOMAIN = "kyerp.net"
$APP_DOMAIN = "app.kyerp.net"
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

function Get-KyFreshWranglerToken {
    $authRaw = (& wrangler auth token --json 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $authRaw) {
        Fail "Wrangler OAuth tokeni okunamadi. Once wrangler login calistirin."
    }
    try { $auth = $authRaw | ConvertFrom-Json }
    catch { Fail "Wrangler auth token JSON okunamadi." }

    $token = ([string]$auth.token).Trim()
    if (-not $token) { Fail "OAuth/API token bulunamadi. wrangler login ile OAuth kullanin." }
    return $token
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

function Assert-NoWorkerConflict([string]$Domain) {
    $workerDomains = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/workers/domains?hostname=$Domain"
    $matches = @($workerDomains.result | Where-Object {
        ([string]$_.hostname).Trim().ToLowerInvariant() -eq $Domain
    })
    if ($matches.Count -gt 0) {
        $services = ($matches | ForEach-Object { [string]$_.service } | Where-Object { $_ }) -join ", "
        Fail "$Domain bir Worker custom domainine bagli. Pages kurulumu yapilmadi. Worker: $services"
    }

    $routeResponse = Invoke-KyCfApi "GET" "/zones/$($script:CF_ZONE_ID)/workers/routes"
    $routeMatches = @($routeResponse.result | Where-Object {
        $pattern = ([string]$_.pattern).Trim().ToLowerInvariant()
        $pattern -eq $Domain -or $pattern -eq "$Domain/*" -or $pattern.StartsWith("$Domain/")
    })
    if ($routeMatches.Count -gt 0) {
        $patterns = ($routeMatches | ForEach-Object { [string]$_.pattern }) -join ", "
        Fail "$Domain bir Worker route tarafindan kullaniliyor. Pages kurulumu yapilmadi. Route: $patterns"
    }
}

function Initialize-KyCloudflareContext {
    Write-Host "Cloudflare site + uygulama domain kontrolu..." -ForegroundColor Cyan

    # Wrangler deploy komutlari OAuth tokenini yenileyebilir. Tokeni burada her
    # production calismasinda Wrangler'in guncel oturumundan al.
    $script:CF_TOKEN = Get-KyFreshWranglerToken

    $zoneResponse = Invoke-KyCfApi "GET" "/zones?name=$SITE_DOMAIN"
    $zones = @($zoneResponse.result)
    if ($zones.Count -ne 1) { Fail "$SITE_DOMAIN Cloudflare zone kaydi tekil olarak bulunamadi." }

    $zone = $zones[0]
    $script:CF_ZONE_ID = [string]$zone.id
    $script:CF_ACCOUNT_ID = [string]$zone.account.id
    if (-not $script:CF_ZONE_ID -or -not $script:CF_ACCOUNT_ID) { Fail "Cloudflare zone/account kimligi okunamadi." }

    Assert-NoWorkerConflict $SITE_DOMAIN
    Assert-NoWorkerConflict $APP_DOMAIN
    Write-Host "Cloudflare Pages domain cakismasi: YOK" -ForegroundColor Green
}

function Resolve-Or-Create-KyPagesProject {
    Initialize-KyCloudflareContext

    $desiredDomains = @($SITE_DOMAIN, $APP_DOMAIN)
    $projects = Get-KyPagesProjects
    $ownerNames = @()
    $ownerProject = $null

    foreach ($project in $projects) {
        $name = ([string]$project.name).Trim()
        if (-not $name) { continue }
        $domains = Get-KyProjectDomains $name
        $ownsDesired = @($domains | Where-Object {
            $domainName = ([string]$_.name).Trim().ToLowerInvariant()
            $desiredDomains -contains $domainName
        }).Count -gt 0
        if ($ownsDesired) {
            $ownerNames += $name
            if ($null -eq $ownerProject) { $ownerProject = $project }
        }
    }

    $uniqueOwners = @($ownerNames | Select-Object -Unique)
    if ($uniqueOwners.Count -gt 1) {
        Fail ("kyerp.net ve app.kyerp.net farkli Pages projelerine bagli. Otomatik birlestirme yapilmadi: " + ($uniqueOwners -join ", "))
    }

    $selected = $ownerProject
    if ($null -eq $selected) {
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

    # Account/project bilgisi uzun deploy boyunca sabit kalir. OAuth token ise
    # Pages deploy sonrasinda tekrar Wrangler'dan tazelenecektir.
    $env:KYERP_CF_ACCOUNT_ID = $script:CF_ACCOUNT_ID
    $env:KYERP_PAGES_PROJECT = $script:PAGES_PROJECT

    Write-Host "Pages proje       : $($script:PAGES_PROJECT)" -ForegroundColor Green
    Write-Host "Pages production  : $BRANCH" -ForegroundColor Green
    Write-Host "Tanitim sitesi    : https://$SITE_DOMAIN/" -ForegroundColor Green
    Write-Host "ERP uygulamasi    : https://$APP_DOMAIN/" -ForegroundColor Green
}

function Ensure-KyPagesDomain([string]$Domain) {
    if (-not $env:KYERP_CF_ACCOUNT_ID -or -not $env:KYERP_PAGES_PROJECT) {
        Fail "Pages domain baglama bilgisi eksik."
    }

    $script:CF_ACCOUNT_ID = $env:KYERP_CF_ACCOUNT_ID
    $script:PAGES_PROJECT = $env:KYERP_PAGES_PROJECT

    # Kritik: `wrangler pages deploy` OAuth tokenini rotate/refresh edebilir.
    # Deploy basinda saklanan tokeni kullanma; domain REST kontrolu icin guncel
    # Wrangler OAuth tokenini yeniden oku. Bu 401 Unauthorized tekrarini kapatir.
    $script:CF_TOKEN = Get-KyFreshWranglerToken

    $domains = Get-KyProjectDomains $script:PAGES_PROJECT
    $row = @($domains | Where-Object { ([string]$_.name).Trim().ToLowerInvariant() -eq $Domain }) | Select-Object -First 1
    if ($null -eq $row) {
        Write-Host "$Domain Pages projesine baglaniyor..." -ForegroundColor Yellow
        $safeProject = [uri]::EscapeDataString($script:PAGES_PROJECT)
        Invoke-KyCfApi "POST" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject/domains" @{ name = $Domain } | Out-Null
    }

    $safeProject = [uri]::EscapeDataString($script:PAGES_PROJECT)
    $safeDomain = [uri]::EscapeDataString($Domain)
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        $statusResponse = Invoke-KyCfApi "GET" "/accounts/$($script:CF_ACCOUNT_ID)/pages/projects/$safeProject/domains/$safeDomain"
        $statusRow = $statusResponse.result
        $status = ([string]$statusRow.status).Trim().ToLowerInvariant()
        $validation = ([string]$statusRow.validation_data.status).Trim().ToLowerInvariant()
        Write-Host "[$attempt/60] $Domain Pages durumu: $status / validation=$validation"
        if ($status -eq "active") {
            Write-Host "$Domain Pages custom domain: ACTIVE" -ForegroundColor Green
            return
        }
        if ($status -in @("error", "blocked", "deactivated") -or $validation -eq "error") {
            $detail = try { $statusRow | ConvertTo-Json -Depth 8 -Compress } catch { "" }
            Fail "$Domain Pages domain aktivasyonu basarisiz: $detail"
        }
        if ($attempt -lt 60) { Start-Sleep -Seconds 5 }
    }
    Fail "$Domain 300 saniye icinde Pages ACTIVE olmadi."
}

function Ensure-KyDualPublicDomains {
    Ensure-KyPagesDomain $SITE_DOMAIN
    Ensure-KyPagesDomain $APP_DOMAIN
}

if (-not (Test-Path $V3)) { Fail "Production V3 motoru bulunamadi: $V3" }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi." }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - PRODUCTION V6 / SITE + APP" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Tanitim : https://$SITE_DOMAIN/" -ForegroundColor Green
Write-Host "ERP     : https://$APP_DOMAIN/" -ForegroundColor Green
Write-Host "API     : https://api.kyerp.net" -ForegroundColor DarkGray
Write-Host ""

try {
    $source = Get-Content $V3 -Raw

    if (-not $source.Contains('npm run test:unit')) { Fail "V3 Worker test satiri bulunamadi." }
    $source = $source.Replace('npm run test:unit', 'npm test')
    $source = $source.Replace('Check-Exit "Worker unit/contract testleri basarisiz."', 'Check-Exit "Worker tam unit/auth integration testleri basarisiz."')

    $d1Marker = 'Write-Host "=== 5/11 D1 YEDEK + HEDEFLI UYUMLULUK ===" -ForegroundColor Cyan'
    if (-not $source.Contains($d1Marker)) { Fail "V3 D1 asama isareti bulunamadi." }
    $pagesInit = @'
Resolve-Or-Create-KyPagesProject
Write-Host ""
'@
    $source = $source.Replace($d1Marker, $pagesInit + "`r`n" + $d1Marker)

    $oldDeploy = 'wrangler pages deploy dist --project-name=ky-erp-frontend --branch=$BRANCH --commit-hash=$LOCAL_SHA'
    if (-not $source.Contains($oldDeploy)) { Fail "V3 Pages deploy satiri beklenen formatta bulunamadi." }
    $newDeploy = 'wrangler pages deploy dist --project-name="$PAGES_PROJECT" --branch=$BRANCH --commit-hash=$LOCAL_SHA --commit-dirty=true'
    $newDeploy = $newDeploy.Replace('\"','"')
    $source = $source.Replace($oldDeploy, $newDeploy)

    $pagesCheck = 'Check-Exit "Cloudflare Pages deploy basarisiz."'
    if (-not $source.Contains($pagesCheck)) { Fail "V3 Pages deploy kontrol satiri bulunamadi." }
    $source = $source.Replace($pagesCheck, $pagesCheck + "`r`nEnsure-KyDualPublicDomains")

    $source = $source.Replace('Origin = "https://kyerp.net"', 'Origin = "https://app.kyerp.net"')

    if (-not $source.Contains('Live-Asset "https://kyerp.net"')) { Fail "V3 kyerp.net asset kontrolu bulunamadi." }
    if (-not $source.Contains('Live-Asset "https://app.kyerp.net"')) { Fail "V3 app.kyerp.net asset kontrolu bulunamadi." }

    $helperText = Get-Content $PSCommandPath -Raw
    $helperStart = $helperText.IndexOf('function Get-KyFreshWranglerToken')
    $helperEnd = $helperText.IndexOf('if (-not (Test-Path $V3))')
    if ($helperStart -lt 0 -or $helperEnd -le $helperStart) { Fail "V6 helper bolumu okunamadi." }
    $helpers = $helperText.Substring($helperStart, $helperEnd - $helperStart)

    $runtimePrefix = @"
# --- KY ERP V6 SITE + APP RUNTIME HELPERS ---
`$SITE_DOMAIN = "kyerp.net"
`$APP_DOMAIN = "app.kyerp.net"
`$CANONICAL_PROJECT = "ky-erp-frontend"
`$script:CF_TOKEN = ""
`$script:CF_ACCOUNT_ID = ""
`$script:CF_ZONE_ID = ""
`$script:PAGES_PROJECT = ""
"@

    Set-Content -LiteralPath $RUNTIME -Value ($runtimePrefix + "`r`n" + $helpers + "`r`n" + $source) -Encoding utf8NoBOM
    & $RUNTIME
    $exitCode = $LASTEXITCODE
    exit $exitCode
} finally {
    Remove-Item $RUNTIME -Force -ErrorAction SilentlyContinue
    Remove-Item Env:KYERP_CF_ACCOUNT_ID -ErrorAction SilentlyContinue
    Remove-Item Env:KYERP_PAGES_PROJECT -ErrorAction SilentlyContinue
}
