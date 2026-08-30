$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$AUTH_VERSION = "canonical-v3"
$DB_NAME = "ky-erp-db"
$DB_CONFIG = "wrangler.jsonc"
$SESSION_GUARD_FILE = Join-Path $WORKER "migrations\0022_auth_same_browser_session_guard.sql"
$BACKUP_DIR = Join-Path $ROOT "BACKUPS\D1\PRE_DEPLOY"

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

function Invoke-Remote-D1Json($sql, $label) {
    Set-Location $WORKER
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    try {
        & wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --command $sql --json 1>$stdoutFile 2>$stderrFile
        $exitCode = $LASTEXITCODE
        $raw = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
        $stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
        if ($exitCode -ne 0) { Fail "$label yapilamadi: $stderr $raw" }
        try { return ($raw | ConvertFrom-Json) }
        catch { Fail "$label cevabi okunamadi. STDOUT: $raw STDERR: $stderr" }
    } finally {
        Remove-Item $stdoutFile,$stderrFile -Force -ErrorAction SilentlyContinue
    }
}

function Remote-Trigger-Exists($triggerName) {
    $sql = "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name='$triggerName';"
    $json = Invoke-Remote-D1Json $sql "Canli D1 trigger kontrolu"
    $total = [int]$json[0].results[0].total
    return ($total -gt 0)
}

function Assert-Remote-Schema-Readiness {
    $tableSql = @"
WITH required(name) AS (
  VALUES
    ('main_companies'),
    ('companies'),
    ('json_store'),
    ('company_aliases'),
    ('invoice_items'),
    ('auth_users'),
    ('auth_user_security'),
    ('auth_user_module_permissions'),
    ('auth_system_secrets'),
    ('auth_login_challenges'),
    ('auth_login_approvals'),
    ('auth_sessions'),
    ('auth_security_audit'),
    ('auth_owner_recovery_challenges'),
    ('hr_monthly_employees'),
    ('ik_person_card_settings')
)
SELECT r.name AS missing
  FROM required r
 WHERE NOT EXISTS (
   SELECT 1 FROM sqlite_master s WHERE s.type='table' AND s.name=r.name
 )
 ORDER BY r.name;
"@
    $tableJson = Invoke-Remote-D1Json $tableSql "Canli D1 tablo hazirlik kontrolu"
    $missingTables = @($tableJson[0].results | ForEach-Object { [string]$_.missing } | Where-Object { $_ })
    if ($missingTables.Count -gt 0) {
        Fail ("Canli D1 gerekli tablolar eksik. Genel migration otomatik calistirilmadi. Eksik: " + ($missingTables -join ", "))
    }

    $columnSql = @"
SELECT 'hr_monthly_employees.sgk_status' AS missing
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('hr_monthly_employees') WHERE name='sgk_status')
UNION ALL
SELECT 'ik_person_card_settings.card_no'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('ik_person_card_settings') WHERE name='card_no')
UNION ALL
SELECT 'company_aliases.main_company_slug'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('company_aliases') WHERE name='main_company_slug')
UNION ALL
SELECT 'company_aliases.normalized_name'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('company_aliases') WHERE name='normalized_name')
UNION ALL
SELECT 'company_aliases.deleted_at'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('company_aliases') WHERE name='deleted_at')
UNION ALL
SELECT 'auth_sessions.device_label'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('auth_sessions') WHERE name='device_label')
UNION ALL
SELECT 'auth_sessions.token_hash'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('auth_sessions') WHERE name='token_hash')
UNION ALL
SELECT 'auth_user_security.email_verified'
 WHERE NOT EXISTS (SELECT 1 FROM pragma_table_info('auth_user_security') WHERE name='email_verified');
"@
    $columnJson = Invoke-Remote-D1Json $columnSql "Canli D1 kolon hazirlik kontrolu"
    $missingColumns = @($columnJson[0].results | ForEach-Object { [string]$_.missing } | Where-Object { $_ })
    if ($missingColumns.Count -gt 0) {
        Fail ("Canli D1 gerekli kolonlar eksik. Genel migration otomatik calistirilmadi. Eksik: " + ($missingColumns -join ", "))
    }
    Write-Host "D1 yonetim/auth/IK sema hazirligi: HAZIR" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - CANONICAL DIRECT PRODUCTION DEPLOY" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Repo: $ROOT"
Write-Host ""
Write-Host "KORUMA:" -ForegroundColor Yellow
Write-Host "- Production D1 RESET YOK." -ForegroundColor Yellow
Write-Host "- Genel migration zinciri YOK." -ForegroundColor Yellow
Write-Host "- Local migration entegrasyon testi YOK." -ForegroundColor Yellow
Write-Host "- Canli sema kontrolu salt-okumadir; eksikte deploy durur." -ForegroundColor Yellow
Write-Host "- Yalniz gerekli same-browser session guard eksikse 0022 uygulanir." -ForegroundColor Yellow
Write-Host "- D1 yedegi alinmadan 0022 uygulanmaz." -ForegroundColor Yellow
Write-Host "- Production test INSERT/UPDATE/DELETE YOK." -ForegroundColor Yellow
Write-Host "- Kirli tracked Git agaci otomatik resetlenmez." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Bu klasor Git reposu degil: $ROOT" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git bulunamadi." }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi. npm install -g wrangler calistirin." }
if (-not (Test-Path $SESSION_GUARD_FILE)) { Fail "0022 session guard dosyasi bulunamadi: $SESSION_GUARD_FILE" }

Write-Host "=== 1/11 REPO ===" -ForegroundColor Cyan
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
Write-Host "=== 2/11 CLOUDFLARE ===" -ForegroundColor Cyan
wrangler whoami
Check-Exit "Cloudflare OAuth oturumu bulunamadi. wrangler login calistirin."

Write-Host ""
Write-Host "=== 3/11 D1 YEDEK + SEMA + SAME-BROWSER GUARD ===" -ForegroundColor Cyan
Set-Location $WORKER
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BACKUP_DIR "ky-erp-db-predeploy-$backupStamp.sql"
wrangler d1 export $DB_NAME --remote --config $DB_CONFIG --output $backupFile
Check-Exit "Canli D1 yedegi alinamadi. Deploy ve session guard uygulanmadi."
if (-not (Test-Path $backupFile)) { Fail "D1 yedek dosyasi olusmadi: $backupFile" }
if ((Get-Item $backupFile).Length -lt 100) { Fail "D1 yedek dosyasi beklenenden kucuk; deploy durduruldu." }
Write-Host "D1 yedek: $backupFile" -ForegroundColor Green

Assert-Remote-Schema-Readiness

$guardName = "trg_auth_sessions_replace_same_browser"
if (-not (Remote-Trigger-Exists $guardName)) {
    Write-Host "Same-browser guard eksik. Yalniz 0022 uygulanacak..." -ForegroundColor Yellow
    Set-Location $WORKER
    wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $SESSION_GUARD_FILE
    Check-Exit "0022 same-browser session guard uygulanamadi."
}
if (-not (Remote-Trigger-Exists $guardName)) { Fail "Same-browser session guard canli D1'de dogrulanamadi." }
Write-Host "Same-browser session guard: HAZIR" -ForegroundColor Green

Write-Host ""
Write-Host "=== 4/11 WORKER TYPECHECK + UNIT + DRY-RUN ===" -ForegroundColor Cyan
Set-Location $WORKER
npm ci
Check-Exit "Worker npm ci basarisiz."
npm run typecheck
Check-Exit "Worker typecheck basarisiz."
npm run test:unit
Check-Exit "Worker unit/contract testleri basarisiz."
npm run build
Check-Exit "Worker dry-run basarisiz."

Write-Host ""
Write-Host "=== 5/11 WORKER PRODUCTION DEPLOY ===" -ForegroundColor Green
wrangler deploy --config $DB_CONFIG
Check-Exit "Worker production deploy basarisiz."

Write-Host ""
Write-Host "=== 6/11 CANLI API + AUTH CONTRACT ===" -ForegroundColor Cyan
Start-Sleep -Seconds 4

$health = Invoke-WebRequest "https://api.kyerp.net/api/health?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -TimeoutSec 20
if ($health.StatusCode -ne 200) { Fail "api.kyerp.net health HTTP 200 degil." }
Write-Host "API health: HTTP 200" -ForegroundColor Green

$statusResponse = Invoke-WebRequest "https://api.kyerp.net/api/auth/status?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ Origin = "https://kyerp.net" } -UseBasicParsing -TimeoutSec 20
if ($statusResponse.StatusCode -ne 200) { Fail "Auth status HTTP 200 degil." }
$statusJson = $statusResponse.Content | ConvertFrom-Json
if ($statusJson.authVersion -ne $AUTH_VERSION) { Fail "Auth version beklenen degil: $($statusJson.authVersion)" }
if ([string]$statusJson.endpoints.refresh -ne "/api/auth/refresh") { Fail "Auth refresh endpointi canonical degil." }
if ([int]$statusJson.sessionPolicy.passwordOnlySeconds -ne 28800) { Fail "Password session 8 saat degil." }
if ([int]$statusJson.sessionPolicy.mfaSeconds -ne 36000) { Fail "MFA session 10 saat degil." }
if ([int]$statusJson.sessionPolicy.ownerRollingSeconds -ne 86400) { Fail "Owner rolling session 24 saat degil." }
Write-Host "Auth: $AUTH_VERSION | parola 8h | MFA 10h | owner rolling 24h" -ForegroundColor Green

$refreshContractOk = $false
try {
    Invoke-WebRequest "https://api.kyerp.net/api/auth/refresh" -Method POST -Headers @{ Origin = "https://kyerp.net"; Accept = "application/json" } -UseBasicParsing -TimeoutSec 20 | Out-Null
} catch {
    $refreshCode = $null
    $refreshBody = ""
    if ($_.Exception.Response) {
        try { $refreshCode = [int]$_.Exception.Response.StatusCode } catch {}
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $refreshBody = $reader.ReadToEnd()
            $reader.Dispose()
        } catch {}
    }
    if ($refreshCode -eq 401) { $refreshContractOk = $true }
}
if (-not $refreshContractOk) { Fail "Auth refresh endpointi tokensiz istekte beklenen HTTP 401 cevabini vermedi." }
Write-Host "Auth refresh contract: HTTP 401 beklenen" -ForegroundColor Green

Write-Host "30x preflight-free login transport kontrolu..."
for ($i = 1; $i -le 30; $i++) {
    $ok = $false
    try {
        Invoke-WebRequest "https://api.kyerp.net/api/auth/login?transport=$i-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Method POST -ContentType "text/plain;charset=UTF-8" -Body "{}" -Headers @{ Origin = "https://kyerp.net"; Accept = "application/json" } -UseBasicParsing -TimeoutSec 20 | Out-Null
    } catch {
        $code = $null
        if ($_.Exception.Response) { try { $code = [int]$_.Exception.Response.StatusCode } catch {} }
        if ($code -eq 400) { $ok = $true }
    }
    if (-not $ok) { Fail "Login transport testi $i/30 beklenen HTTP 400 cevabini alamadi." }
}
Write-Host "Login transport: 30/30 HTTP cevap" -ForegroundColor Green

try {
    $preflight = Invoke-WebRequest "https://api.kyerp.net/api/auth/login" -Method OPTIONS -Headers @{
        Origin = "https://kyerp.net"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type"
    } -UseBasicParsing -TimeoutSec 20
    if ($preflight.StatusCode -notin @(200,204)) { Fail "CORS preflight basarisiz: HTTP $($preflight.StatusCode)" }
    Write-Host "CORS fallback: HTTP $($preflight.StatusCode)" -ForegroundColor Green
} catch { Fail "CORS fallback kontrolu basarisiz: $($_.Exception.Message)" }

Write-Host ""
Write-Host "=== 7/11 FRONTEND LINT + TEST + BUILD ===" -ForegroundColor Cyan
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
Write-Host "=== 8/11 PAGES PRODUCTION DEPLOY ===" -ForegroundColor Green
wrangler pages deploy dist --project-name=ky-erp-frontend --branch=$BRANCH --commit-hash=$LOCAL_SHA
Check-Exit "Cloudflare Pages deploy basarisiz."

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

Write-Host ""
Write-Host "=== 10/11 SON CANLI API KONTROL ===" -ForegroundColor Cyan
$finalHealth = Invoke-WebRequest "https://api.kyerp.net/api/health?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -TimeoutSec 20
if ($finalHealth.StatusCode -ne 200) { Fail "Son API health kontrolu basarisiz." }
if (-not (Remote-Trigger-Exists $guardName)) { Fail "Deploy sonunda same-browser guard kayip." }
Write-Host "API + same-browser guard son kontrol: HAZIR" -ForegroundColor Green

Write-Host ""
Write-Host "=== 11/11 SONUC ===" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green
Write-Host " KY ERP PRODUCTION DEPLOY BASARILI " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Repo SHA       : $LOCAL_SHA"
Write-Host "Auth           : $AUTH_VERSION"
Write-Host "Worker API     : HTTP 200"
Write-Host "D1 schema      : HAZIR"
Write-Host "Login transport: 30/30"
Write-Host "Session refresh: HAZIR"
Write-Host "Session guard  : HAZIR"
Write-Host "D1 pre-backup  : $backupFile"
Write-Host "Build asset    : $EXPECTED_ASSET"
Write-Host "kyerp.net      : $kyerpAsset"
Write-Host "app.kyerp.net  : $appAsset"
Write-Host ""
$finalStamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Host "CANLI TEST:" -ForegroundColor Yellow
Write-Host "https://kyerp.net/?release=$finalStamp" -ForegroundColor White
Write-Host ""
Read-Host "Kapatmak icin ENTER"