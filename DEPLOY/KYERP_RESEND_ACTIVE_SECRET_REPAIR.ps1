$ErrorActionPreference = "Stop"

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}
$env:NO_COLOR = "1"
$env:FORCE_COLOR = "0"

$ROOT = Split-Path $PSScriptRoot -Parent
$WORKER_DIR = Join-Path $ROOT "APP\cloud\ky-erp-api"
$WRANGLER_CONFIG = Join-Path $WORKER_DIR "wrangler.jsonc"
$PROMPT = Join-Path $PSScriptRoot "KYERP_RESEND_KEY_PROMPT_GUI.ps1"
$SECRET_NAME = "RESEND_API_KEY"
$LOG = Join-Path $env:USERPROFILE "Desktop\KY_ERP_RESEND_ACTIVE_SECRET_REPAIR.log"

function Fail([string]$Message) { throw $Message }

function Invoke-Captured([string]$Label, [scriptblock]$Action) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & $Action *> $tmp
        $code = $LASTEXITCODE
        $raw = Get-Content -LiteralPath $tmp -Raw -ErrorAction SilentlyContinue
        Add-Content -LiteralPath $LOG -Value "`r`n--- $Label ---`r`n$raw"
        return [pscustomobject]@{ Ok = ($code -eq 0); Code = $code; Text = [string]$raw }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Require-Captured([string]$Label, [scriptblock]$Action, [string]$Message) {
    $result = Invoke-Captured -Label $Label -Action $Action
    if (-not $result.Ok) { Fail "$Message Cikis kodu: $($result.Code). Ayrinti: $LOG" }
    return $result
}

function Test-SecretListed {
    Push-Location $WORKER_DIR
    try {
        $result = Invoke-Captured "secret list" { wrangler secret list --config $WRANGLER_CONFIG --format json }
        return $result.Ok -and ($result.Text -match $SECRET_NAME)
    } finally { Pop-Location }
}

function Read-ResendKeyGui {
    if (-not (Test-Path $PROMPT)) { Fail "Guvenli Resend key penceresi bulunamadi." }
    Write-Host "[BILGI] Guvenli Resend key penceresi aciliyor..." -ForegroundColor Yellow
    $value = (& pwsh -STA -NoProfile -ExecutionPolicy Bypass -File $PROMPT | Out-String).Trim()
    $code = $LASTEXITCODE
    if ($code -ne 0) { Fail "Resend key penceresi iptal edildi veya acilamadi. Cikis kodu: $code." }
    if ([string]::IsNullOrWhiteSpace($value) -or -not $value.StartsWith("re_") -or $value.Length -lt 10) { Fail "Gecerli Resend API key alinamadi." }
    return $value
}

Set-Content -LiteralPath $LOG -Value "KY ERP RESEND ACTIVE SECRET REPAIR`r`nStart: $(Get-Date -Format o)" -Encoding UTF8
$plainKey = $null
try {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " KY ERP - RESEND ACTIVE WORKER SECRET REPAIR" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host " Worker source activation -> standard secret put"
    Write-Host " Key input: MASKED WINDOWS DIALOG"
    Write-Host " DNS: NO | D1: NO | Pages: NO" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan

    if (-not (Test-Path $WRANGLER_CONFIG)) { Fail "Wrangler config bulunamadi." }
    if (-not (Test-Path $PROMPT)) { Fail "Resend key penceresi bulunamadi." }
    foreach ($command in @("wrangler","npm","pwsh")) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { Fail "$command bulunamadi." }
    }

    Push-Location $WORKER_DIR
    try {
        Require-Captured "wrangler whoami" { wrangler whoami } "Wrangler oturumu dogrulanamadi." | Out-Null
        Write-Host "[OK] Cloudflare session." -ForegroundColor Green

        Require-Captured "worker dry-run" { npm run build } "Worker dry-run basarisiz." | Out-Null
        Write-Host "[OK] Worker dry-run." -ForegroundColor Green

        Require-Captured "worker activation deploy" { wrangler deploy --config $WRANGLER_CONFIG } "Latest Worker source aktif edilemedi." | Out-Null
        Write-Host "[OK] Latest Worker source active." -ForegroundColor Green
    } finally { Pop-Location }

    $plainKey = Read-ResendKeyGui

    Push-Location $WORKER_DIR
    try {
        $secretResult = Invoke-Captured "secret put" { $plainKey | & wrangler secret put $SECRET_NAME --config $WRANGLER_CONFIG }
        if (-not $secretResult.Ok) { Fail "RESEND_API_KEY standard secret put ile aktif Worker'a yazilamadi. Ayrinti: $LOG" }
    } finally { Pop-Location }

    if (-not (Test-SecretListed)) { Fail "RESEND_API_KEY secret list kontrolunde gorulemedi." }

    Write-Host "[OK] RESEND_API_KEY active Worker secret." -ForegroundColor Green
    Write-Host "[OK] DNS, D1 and Pages were not changed." -ForegroundColor Green
    Write-Host "Log: $LOG"
    exit 0
} catch {
    Write-Host ""
    Write-Host "[HATA] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    $plainKey = $null
}
