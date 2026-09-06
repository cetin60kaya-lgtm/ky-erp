$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$AUTH_VERSION = "canonical-v3"
$DB_NAME = "ky-erp-db"
$DB_CONFIG = "wrangler.jsonc"
$SESSION_GUARD_FILE = Join-Path $WORKER "migrations\0022_auth_same_browser_session_guard.sql"
$ALIAS_SCHEMA_FILE = Join-Path $WORKER "migrations\0023_admin_company_alias_schema.sql"
$AUDIT_USER_FILE = Join-Path $WORKER "migrations\0024_denetime_pdks_system_user.sql"
$MAIL_CORE_FILE = Join-Path $WORKER "migrations\0050_mail_communication_core.sql"
$APPROVAL_CENTER_FILE = Join-Path $WORKER "migrations\0051_company_mail_approval_center.sql"
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
    return ([int]$json[0].results[0].total -gt 0)
}

function Remote-Column-Exists($tableName, $columnName) {
    $safeTable = ([string]$tableName).Replace("'", "''")
    $safeColumn = ([string]$columnName).Replace("'", "''")
    $sql = "SELECT COUNT(*) AS total FROM pragma_table_info('$safeTable') WHERE name='$safeColumn';"
    $json = Invoke-Remote-D1Json $sql "Canli D1 kolon kontrolu $tableName.$columnName"
    return ([int]$json[0].results[0].total -gt 0)
}

function Assert-Denetime-System-User {
    $userSql = @"
SELECT u.id,u.username,u.role,u.is_active,
       COALESCE(s.main_company_slug,'') AS main_company_slug,
       COALESCE(h.scope,'') AS hr_scope
  FROM auth_users u
  LEFT JOIN auth_user_security s ON s.user_id=u.id
  LEFT JOIN ik_user_hr_scope h ON h.user_id=u.id
 WHERE LOWER(TRIM(u.username))='denetim'
 LIMIT 1;
"@
    $userJson = Invoke-Remote-D1Json $userSql "DENETIM sistem hesabi kontrolu"
    $rows = @($userJson[0].results)
    if ($rows.Count -ne 1) { Fail "DENETIM sistem hesabi canli D1'de bulunamadi." }
    $auditUser = $rows[0]
    if ([string]$auditUser.role -ne "DENETIM") { Fail "denetim kullanicisinin rolu DENETIM degil: $($auditUser.role)" }
    if ([string]$auditUser.hr_scope -ne "AUDIT") { Fail "denetim kullanicisinin IK kapsami AUDIT degil: $($auditUser.hr_scope)" }

    $permSql = @"
SELECT
  SUM(CASE WHEN UPPER(module_key)<>'IK' AND (can_view<>0 OR can_create<>0 OR can_update<>0 OR can_delete<>0 OR can_approve<>0) THEN 1 ELSE 0 END) AS foreign_permissions,
  SUM(CASE WHEN UPPER(module_key)='IK' AND can_view=1 AND can_create=0 AND can_update=0 AND can_delete=0 AND can_approve=0 THEN 1 ELSE 0 END) AS valid_ik_permissions,
  SUM(CASE WHEN can_create<>0 OR can_update<>0 OR can_delete<>0 OR can_approve<>0 THEN 1 ELSE 0 END) AS write_permissions
FROM auth_user_module_permissions
WHERE user_id=(SELECT id FROM auth_users WHERE LOWER(TRIM(username))='denetim' LIMIT 1);
"@
    $permJson = Invoke-Remote-D1Json $permSql "DENETIM izin kilidi kontrolu"
    $perm = $permJson[0].results[0]
    if ([int]($perm.foreign_permissions ?? 0) -ne 0) { Fail "DENETIM hesabinda IK disi aktif izin bulundu." }
    if ([int]($perm.valid_ik_permissions ?? 0) -lt 1) { Fail "DENETIM hesabinda sabit IK goruntuleme izni bulunamadi." }
    if ([int]($perm.write_permissions ?? 0) -ne 0) { Fail "DENETIM hesabinda yazma/silme/onay yetkisi bulundu." }
    Write-Host "DENETIM: hazir sistem hesabi | yalniz IK/PDKS | salt-okunur" -ForegroundColor Green
}

function Get-Worker-SecretNames {
    Set-Location $WORKER
    $raw = (& wrangler secret list --format json --config $DB_CONFIG 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $raw) { Fail "Worker secret listesi okunamadi." }
    try { $rows = @($raw | ConvertFrom-Json) }
    catch { Fail "Worker secret listesi JSON olarak okunamadi: $raw" }
    return @($rows | ForEach-Object { ([string]$_.name).Trim() } | Where-Object { $_ })
}

function Assert-Mail-Provider-Secrets {
    $required = @(
        "FILE_HUB_OAUTH_KEY",
        "MICROSOFT_GRAPH_CLIENT_ID",
        "MICROSOFT_GRAPH_CLIENT_SECRET"
    )
    $names = @(Get-Worker-SecretNames)
    $missing = @($required | Where-Object { $names -notcontains $_ })
    if ($missing.Count -gt 0) {
        Write-Host ("UYARI: Microsoft Mail/OneDrive OAuth production secretleri eksik; provider bagli gorunmeyecek. Eksik: " + ($missing -join ", ")) -ForegroundColor Yellow
        return $false
    }
    Write-Host "Mail / Microsoft Graph secret readiness: HAZIR" -ForegroundColor Green
    return $true
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
    ('ik_person_card_settings'),
    ('ik_user_hr_scope'),
    ('mail_audit_log'),
    ('mail_approval_requests'),
    ('mail_send_jobs'),
    ('mail_drafts'),
    ('mail_messages'),
    ('mail_oauth_states'),
    ('mail_account_members'),
    ('mail_account_credentials'),
    ('mail_accounts'),
    ('critical_approval_requests'),
    ('critical_approval_events')
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
        Fail ("Canli D1 gerekli tablolar eksik. Genel migration calistirilmadi. Eksik: " + ($missingTables -join ", "))
    }

    # Cloudflare D1, pragma_table_info sorgularini UNION ALL ile tek komutta
    # birlestirince SQLITE "too many terms in compound SELECT" uretebiliyor.
    # Kolonlari ayri, kucuk ve salt-okunur sorgularla kontrol et.
    $requiredColumns = @(
        @{ Table = "hr_monthly_employees"; Column = "sgk_status" },
        @{ Table = "ik_person_card_settings"; Column = "card_no" },
        @{ Table = "company_aliases"; Column = "main_company_slug" },
        @{ Table = "company_aliases"; Column = "normalized_name" },
        @{ Table = "company_aliases"; Column = "deleted_at" },
        @{ Table = "auth_sessions"; Column = "device_label" },
        @{ Table = "auth_sessions"; Column = "token_hash" },
        @{ Table = "auth_user_security"; Column = "email_verified" },
        @{ Table = "mail_accounts"; Column = "account_scope" },
        @{ Table = "mail_accounts"; Column = "owner_user_id" }
    )
    $missingColumns = @()
    foreach ($required in $requiredColumns) {
        if (-not (Remote-Column-Exists $required.Table $required.Column)) {
            $missingColumns += "$($required.Table).$($required.Column)"
        }
    }
    if ($missingColumns.Count -gt 0) {
        Fail ("Canli D1 gerekli kolonlar eksik. Genel migration calistirilmadi. Eksik: " + ($missingColumns -join ", "))
    }
    Write-Host "D1 yonetim/auth/IK sema hazirligi: HAZIR" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " KY ERP - PRODUCTION DEPLOY V3" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Repo: $ROOT"
Write-Host ""
Write-Host "KORUMA:" -ForegroundColor Yellow
Write-Host "- Tum Worker + frontend test/build bitmeden canliya yazma YOK." -ForegroundColor Yellow
Write-Host "- Production D1 RESET YOK." -ForegroundColor Yellow
Write-Host "- Genel migration zinciri YOK." -ForegroundColor Yellow
Write-Host "- Yalniz additive 0023, DENETIM 0024, gerekli 0022 session guard ve Mail Core 0050 uygulanabilir." -ForegroundColor Yellow
Write-Host "- D1 uyumluluk adimlarindan once tam D1 export yedegi alinir." -ForegroundColor Yellow
Write-Host "- Production test INSERT/UPDATE/DELETE YOK." -ForegroundColor Yellow
Write-Host "- Kirli tracked Git agaci otomatik resetlenmez." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Bu klasor Git reposu degil: $ROOT" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git bulunamadi." }
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi. npm install -g wrangler calistirin." }
if (-not (Test-Path $SESSION_GUARD_FILE)) { Fail "0022 session guard dosyasi bulunamadi: $SESSION_GUARD_FILE" }
if (-not (Test-Path $ALIAS_SCHEMA_FILE)) { Fail "0023 firma eslestirme sema dosyasi bulunamadi: $ALIAS_SCHEMA_FILE" }
if (-not (Test-Path $AUDIT_USER_FILE)) { Fail "0024 DENETIM sistem kullanicisi dosyasi bulunamadi: $AUDIT_USER_FILE" }
if (-not (Test-Path $MAIL_CORE_FILE)) { Fail "0050 Mail Core sema dosyasi bulunamadi: $MAIL_CORE_FILE" }
if (-not (Test-Path $APPROVAL_CENTER_FILE)) { Fail "0051 Onay Merkezi sema dosyasi bulunamadi: $APPROVAL_CENTER_FILE" }

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
Assert-Mail-Provider-Secrets

Write-Host ""
Write-Host "=== 3/11 WORKER PREFLIGHT ===" -ForegroundColor Cyan
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
Write-Host "=== 4/11 FRONTEND PREFLIGHT ===" -ForegroundColor Cyan
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
Write-Host "Frontend build asset: $EXPECTED_ASSET" -ForegroundColor Green

Write-Host ""
Write-Host "=== 5/11 D1 YEDEK + HEDEFLI UYUMLULUK ===" -ForegroundColor Cyan
Set-Location $WORKER
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
$backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $BACKUP_DIR "ky-erp-db-predeploy-$backupStamp.sql"
wrangler d1 export $DB_NAME --remote --config $DB_CONFIG --output $backupFile
Check-Exit "Canli D1 yedegi alinamadi. Canliya hicbir D1 uyumluluk islemi uygulanmadi."
if (-not (Test-Path $backupFile)) { Fail "D1 yedek dosyasi olusmadi: $backupFile" }
if ((Get-Item $backupFile).Length -lt 100) { Fail "D1 yedek dosyasi beklenenden kucuk; deploy durduruldu." }
Write-Host "D1 tam yedek: $backupFile" -ForegroundColor Green

Write-Host "0023 additive firma eslestirme semasi kontrol/uygulama..." -ForegroundColor Yellow
wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $ALIAS_SCHEMA_FILE
Check-Exit "0023 additive firma eslestirme semasi uygulanamadi. D1 yedegi korunuyor; deploy durduruldu."

$guardName = "trg_auth_sessions_replace_same_browser"
if (-not (Remote-Trigger-Exists $guardName)) {
    Write-Host "Same-browser guard eksik. Yalniz 0022 uygulanacak..." -ForegroundColor Yellow
    wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $SESSION_GUARD_FILE
    Check-Exit "0022 same-browser session guard uygulanamadi. D1 yedegi korunuyor."
}
if (-not (Remote-Trigger-Exists $guardName)) { Fail "Same-browser session guard canli D1'de dogrulanamadi." }

Write-Host "0024 DENETIM / PDKS sistem hesabi kontrol/uygulama..." -ForegroundColor Yellow
wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $AUDIT_USER_FILE
Check-Exit "0024 DENETIM sistem hesabi uygulanamadi. D1 yedegi korunuyor; deploy durduruldu."

Write-Host "0050 Mail / Iletisim Core additive semasi kontrol/uygulama..." -ForegroundColor Yellow
wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $MAIL_CORE_FILE
Check-Exit "0050 Mail Core additive semasi uygulanamadi. D1 yedegi korunuyor; deploy durduruldu."

Write-Host "0051 Firma Mail Ayrimi + Onay Merkezi additive semasi kontrol/uygulama..." -ForegroundColor Yellow
wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $APPROVAL_CENTER_FILE
Check-Exit "0051 Firma Mail Ayrimi / Onay Merkezi semasi uygulanamadi. D1 yedegi korunuyor; deploy durduruldu."

Assert-Remote-Schema-Readiness
Assert-Denetime-System-User
Write-Host "D1 hedefli uyumluluk + sema + DENETIM + MAIL + ONAY MERKEZI: HAZIR" -ForegroundColor Green

Write-Host ""
Write-Host "=== 6/11 WORKER PRODUCTION DEPLOY ===" -ForegroundColor Green
Set-Location $WORKER
wrangler deploy --config $DB_CONFIG
Check-Exit "Worker production deploy basarisiz."

Write-Host ""
Write-Host "=== 7/11 CANLI API + AUTH CONTRACT ===" -ForegroundColor Cyan
Start-Sleep -Seconds 4
$health = Invoke-WebRequest "https://api.kyerp.net/api/health?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -TimeoutSec 20
if ($health.StatusCode -ne 200) { Fail "api.kyerp.net health HTTP 200 degil." }
Write-Host "API health: HTTP 200" -ForegroundColor Green

$statusResponse = Invoke-WebRequest "https://api.kyerp.net/api/auth/status?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ Origin = "https://kyerp.net" } -UseBasicParsing -TimeoutSec 20
if ($statusResponse.StatusCode -ne 200) { Fail "Auth status HTTP 200 degil." }
$statusJson = $statusResponse.Content | ConvertFrom-Json
if ($statusJson.authVersion -ne $AUTH_VERSION) { Fail "Auth version beklenen degil: $($statusJson.authVersion)" }
if ([string]$statusJson.endpoints.refresh -ne "/api/auth/refresh") { Fail "Auth refresh endpointi canonical degil." }
if ([bool]$statusJson.sessionPolicy.passwordOnlyEnabled -ne $false) { Fail "Password-only giris kapali degil." }
if ([int]$statusJson.sessionPolicy.passwordOnlySeconds -ne 0) { Fail "Password-only session suresi 0 degil." }
if ([int]$statusJson.sessionPolicy.mfaSeconds -ne 36000) { Fail "MFA session 10 saat degil." }
if ([int]$statusJson.sessionPolicy.ownerRollingSeconds -ne 86400) { Fail "Owner rolling session 24 saat degil." }
Write-Host "Auth: $AUTH_VERSION | parola-only KAPALI | MFA 10h | owner rolling 24h" -ForegroundColor Green

$refreshContractOk = $false
try {
    Invoke-WebRequest "https://api.kyerp.net/api/auth/refresh" -Method POST -Headers @{ Origin = "https://kyerp.net"; Accept = "application/json" } -UseBasicParsing -TimeoutSec 20 | Out-Null
} catch {
    $refreshCode = $null
    if ($_.Exception.Response) { try { $refreshCode = [int]$_.Exception.Response.StatusCode } catch {} }
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
    if ($preflight.StatusCode -notin @(200,204)) { Fail "CORS fallback basarisiz: HTTP $($preflight.StatusCode)" }
    Write-Host "CORS fallback: HTTP $($preflight.StatusCode)" -ForegroundColor Green
} catch { Fail "CORS fallback kontrolu basarisiz: $($_.Exception.Message)" }

Write-Host ""
Write-Host "=== 8/11 PAGES PRODUCTION DEPLOY ===" -ForegroundColor Green
Set-Location $FRONTEND
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
Write-Host "=== 10/11 SON CANLI KONTROL ===" -ForegroundColor Cyan
$finalHealth = Invoke-WebRequest "https://api.kyerp.net/api/health?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -UseBasicParsing -TimeoutSec 20
if ($finalHealth.StatusCode -ne 200) { Fail "Son API health kontrolu basarisiz." }
if (-not (Remote-Trigger-Exists $guardName)) { Fail "Deploy sonunda same-browser guard kayip." }
Assert-Remote-Schema-Readiness
Assert-Denetime-System-User
Write-Host "API + D1 sema + session guard + DENETIM son kontrol: HAZIR" -ForegroundColor Green

Write-Host ""
Write-Host "=== 11/11 SONUC ===" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green
Write-Host " KY ERP PRODUCTION DEPLOY BASARILI " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Repo SHA        : $LOCAL_SHA"
Write-Host "Auth            : $AUTH_VERSION"
Write-Host "Worker API      : HTTP 200"
Write-Host "D1 schema       : HAZIR"
Write-Host "DENETIM         : IK/PDKS salt-okunur"
Write-Host "Login transport : 30/30"
Write-Host "Session refresh : HAZIR"
Write-Host "Session guard   : HAZIR"
Write-Host "D1 pre-backup   : $backupFile"
Write-Host "Build asset     : $EXPECTED_ASSET"
Write-Host "kyerp.net       : $kyerpAsset"
Write-Host "app.kyerp.net   : $appAsset"
Write-Host ""
$finalStamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Host "CANLI TEST:" -ForegroundColor Yellow
Write-Host "https://kyerp.net/?release=$finalStamp" -ForegroundColor White
Write-Host ""
Read-Host "Kapatmak icin ENTER"