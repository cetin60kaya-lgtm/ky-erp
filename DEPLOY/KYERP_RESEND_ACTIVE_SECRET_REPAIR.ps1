$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$WORKER_DIR = Join-Path $ROOT "APP\cloud\ky-erp-api"
$WRANGLER_CONFIG = Join-Path $WORKER_DIR "wrangler.jsonc"
$SECRET_NAME = "RESEND_API_KEY"

function Fail([string]$Message) {
    throw $Message
}

function Test-WranglerSession {
    try {
        $raw = (& wrangler auth token --json 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $raw) { return $false }
        $auth = $raw | ConvertFrom-Json
        return -not [string]::IsNullOrWhiteSpace([string]$auth.token)
    } catch {
        return $false
    }
}

function Ensure-WranglerSession {
    if (Test-WranglerSession) {
        Write-Host "[OK] Wrangler oturumu hazir." -ForegroundColor Green
        return
    }

    Write-Host "[BILGI] Wrangler oturumu yok; Cloudflare girisi aciliyor..." -ForegroundColor Yellow
    & wrangler login | Out-Host
    if ($LASTEXITCODE -ne 0 -or -not (Test-WranglerSession)) {
        Fail "Wrangler oturumu dogrulanamadi."
    }
    Write-Host "[OK] Wrangler oturumu yenilendi." -ForegroundColor Green
}

function Read-ResendKey {
    $secure = Read-Host "RESEND API KEY (re_...)" -AsSecureString
    if ($null -eq $secure -or $secure.Length -eq 0) { Fail "Resend API key girilmedi." }

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        if ([string]::IsNullOrWhiteSpace($plain) -or -not $plain.StartsWith("re_")) {
            Fail "Gecerli bir Resend API key girilmedi."
        }
        return $plain
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $secure = $null
    }
}

function Test-SecretListed {
    Push-Location $WORKER_DIR
    try {
        $raw = (& wrangler secret list --config $WRANGLER_CONFIG --format json 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $raw) { return $false }
        try { $rows = @($raw | ConvertFrom-Json) } catch { return $false }
        return @($rows | Where-Object { ([string]$_.name).Trim() -eq $SECRET_NAME }).Count -gt 0
    } finally {
        Pop-Location
    }
}

$plainKey = $null
try {
    Write-Host ""
    Write-Host "KY ERP - AKTIF WORKER RESEND SECRET ONARIMI" -ForegroundColor Cyan
    Write-Host "Bu arac yalniz aktif Worker secretini duzeltir; DNS, D1 ve Pages degistirilmez." -ForegroundColor DarkGray
    Write-Host ""

    if (-not (Test-Path $WRANGLER_CONFIG)) { Fail "Wrangler config bulunamadi: $WRANGLER_CONFIG" }
    if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi." }

    Ensure-WranglerSession
    $plainKey = Read-ResendKey

    Push-Location $WORKER_DIR
    try {
        # Standart secret put aktif Worker icin yeni secret-bearing version olusturur ve deploy eder.
        $plainKey | & wrangler secret put $SECRET_NAME --config $WRANGLER_CONFIG
        if ($LASTEXITCODE -ne 0) {
            Fail "RESEND_API_KEY aktif Worker'a yazilamadi. Canonical production deployunu calistirip bu onarimi yeniden deneyin; secret yalniz stage edilmedi."
        }
    } finally {
        Pop-Location
        $plainKey = $null
    }

    if (-not (Test-SecretListed)) {
        Fail "RESEND_API_KEY yazildi ancak Wrangler secret list kontrolunde gorulemedi."
    }

    Write-Host ""
    Write-Host "[OK] RESEND_API_KEY aktif Worker secreti olarak guncellendi." -ForegroundColor Green
    Write-Host "[OK] DNS, D1 ve Pages'e dokunulmadi." -ForegroundColor Green
    Write-Host "Simdi app.kyerp.net > Admin > Kullanicilar > Giris & MFA ekranini yenileyin." -ForegroundColor Cyan
    Write-Host "E-posta servisi RESEND olarak gorunmeli ve 'Dogrulama Kodu Gonder' aktif olmalidir." -ForegroundColor Cyan
    exit 0
} catch {
    Write-Host ""
    Write-Host "[HATA] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    $plainKey = $null
}
