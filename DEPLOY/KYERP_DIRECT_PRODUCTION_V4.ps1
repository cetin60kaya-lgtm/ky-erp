$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$V3 = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3_RUNTIME.ps1"

function Fail($message) {
    Write-Host ""
    Write-Host "HATA: $message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

function Project-Domains($project) {
    if ($null -eq $project -or $null -eq $project.domains) { return @() }
    return @($project.domains | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ })
}

function Project-RepoMatches($project) {
    try {
        $repoName = ([string]$project.source.config.repo_name).Trim().ToLowerInvariant()
        $owner = ([string]$project.source.config.owner).Trim().ToLowerInvariant()
        if ($repoName -eq "ky-erp") { return $true }
        if ("$owner/$repoName" -eq "cetin60kaya-lgtm/ky-erp") { return $true }
    } catch {}
    return $false
}

function Resolve-Pages-Project {
    if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi." }
    if (-not (Test-Path $FRONTEND)) { Fail "Frontend klasoru bulunamadi: $FRONTEND" }

    Set-Location $FRONTEND
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    try {
        & wrangler pages project list --json 1>$stdoutFile 2>$stderrFile
        $exitCode = $LASTEXITCODE
        $raw = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
        $stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
        if ($exitCode -ne 0) { Fail "Cloudflare Pages proje listesi alinamadi: $stderr $raw" }
        if (-not $raw.Trim()) { Fail "Cloudflare Pages proje listesi bos dondu." }

        try { $parsed = $raw | ConvertFrom-Json }
        catch { Fail "Cloudflare Pages JSON okunamadi. STDOUT: $raw STDERR: $stderr" }

        $projects = @()
        if ($parsed -is [System.Array]) {
            $projects = @($parsed)
        } elseif ($null -ne $parsed.result) {
            $projects = @($parsed.result)
        } elseif ($null -ne $parsed.projects) {
            $projects = @($parsed.projects)
        } elseif ($null -ne $parsed.name) {
            $projects = @($parsed)
        }
        $projects = @($projects | Where-Object { ([string]$_.name).Trim() })
        if ($projects.Count -eq 0) { Fail "Cloudflare hesabinda okunabilir Pages projesi bulunamadi." }

        Write-Host "Cloudflare Pages projeleri:" -ForegroundColor Cyan
        foreach ($project in $projects) {
            $domains = Project-Domains $project
            $pb = ([string]$project.production_branch).Trim()
            Write-Host ("- {0} | production={1} | domains={2}" -f ([string]$project.name), $pb, ($domains -join ", "))
        }

        $both = @($projects | Where-Object {
            $domains = Project-Domains $_
            ($domains -contains "kyerp.net") -and ($domains -contains "app.kyerp.net")
        })
        $root = @($projects | Where-Object { (Project-Domains $_) -contains "kyerp.net" })
        $app = @($projects | Where-Object { (Project-Domains $_) -contains "app.kyerp.net" })
        $repo = @($projects | Where-Object { Project-RepoMatches $_ })
        $branch = @($projects | Where-Object { ([string]$_.production_branch).Trim() -eq $BRANCH })

        if ($root.Count -eq 1 -and $app.Count -eq 1 -and ([string]$root[0].name) -ne ([string]$app[0].name)) {
            Fail "kyerp.net ve app.kyerp.net iki farkli Pages projesine bagli. Canliya yazmadan durduruldu: kyerp.net=$([string]$root[0].name), app.kyerp.net=$([string]$app[0].name)"
        }

        $selected = $null
        if ($both.Count -eq 1) { $selected = $both[0] }
        elseif ($root.Count -eq 1 -and $app.Count -eq 0) { $selected = $root[0] }
        elseif ($app.Count -eq 1 -and $root.Count -eq 0) { $selected = $app[0] }
        elseif ($repo.Count -eq 1) { $selected = $repo[0] }
        elseif ($branch.Count -eq 1) { $selected = $branch[0] }
        elseif ($projects.Count -eq 1) { $selected = $projects[0] }

        if ($null -eq $selected) {
            $summary = ($projects | ForEach-Object {
                $domains = Project-Domains $_
                "{0}[production={1};domains={2}]" -f ([string]$_.name), ([string]$_.production_branch), ($domains -join ",")
            }) -join " | "
            Fail "KY ERP Pages projesi tekil olarak cozumlenemedi. Projeler: $summary"
        }

        $name = ([string]$selected.name).Trim()
        $productionBranch = ([string]$selected.production_branch).Trim()
        if (-not $productionBranch) { $productionBranch = $BRANCH }
        return [pscustomobject]@{
            Name = $name
            ProductionBranch = $productionBranch
            Domains = Project-Domains $selected
        }
    } finally {
        Remove-Item $stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $V3)) { Fail "Production V3 scripti bulunamadi: $V3" }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - PRODUCTION DEPLOY V4 / PAGES AUTO RESOLVE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$pages = Resolve-Pages-Project
Write-Host "Pages proje       : $($pages.Name)" -ForegroundColor Green
Write-Host "Pages production  : $($pages.ProductionBranch)" -ForegroundColor Green
Write-Host "Pages domains     : $($pages.Domains -join ', ')" -ForegroundColor Green
Write-Host "Kaynak Git branch : $BRANCH" -ForegroundColor Green
Write-Host "Not: Pages production branch farkliysa deployment environment icin Pages'in production branch'i kullanilir; yayinlanan kod yine local canonical SHA buildidir." -ForegroundColor Yellow

try {
    $source = Get-Content $V3 -Raw
    $oldDeploy = 'wrangler pages deploy dist --project-name=ky-erp-frontend --branch=$BRANCH --commit-hash=$LOCAL_SHA'
    if (-not $source.Contains($oldDeploy)) { Fail "V3 Pages deploy satiri beklenen formatta bulunamadi; runtime patch guvenle uygulanamadi." }

    $safeProject = $pages.Name.Replace('"','')
    $safeBranch = $pages.ProductionBranch.Replace('"','')
    $newDeploy = 'wrangler pages deploy dist --project-name="' + $safeProject + '" --branch="' + $safeBranch + '" --commit-hash=$LOCAL_SHA'
    $source = $source.Replace($oldDeploy, $newDeploy)

    # Canonical deploy da BAT'tan bagimsiz tam auth integration testini gecsin.
    if (-not $source.Contains('npm run test:unit')) { Fail "V3 Worker unit test satiri bulunamadi; tam test runtime patch uygulanamadi." }
    $source = $source.Replace('npm run test:unit', 'npm test')
    $source = $source.Replace('Check-Exit "Worker unit/contract testleri basarisiz."', 'Check-Exit "Worker tam unit/auth integration testleri basarisiz."')

    Set-Content -LiteralPath $RUNTIME -Value $source -Encoding utf8NoBOM
    & $RUNTIME
    $exitCode = $LASTEXITCODE
    exit $exitCode
} finally {
    Remove-Item $RUNTIME -Force -ErrorAction SilentlyContinue
}
