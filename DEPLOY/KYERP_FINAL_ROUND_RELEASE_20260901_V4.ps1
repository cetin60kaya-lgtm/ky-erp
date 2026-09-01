$ErrorActionPreference = "Stop"

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {}
$env:NO_COLOR = "1"
$env:FORCE_COLOR = "0"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$CONFIG = Join-Path $WORKER "wrangler.jsonc"
$DIRECT = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION.ps1"
$PROMPT = Join-Path $PSScriptRoot "KYERP_RESEND_KEY_PROMPT_GUI.ps1"
$CUTOVER = Join-Path $PSScriptRoot "KYERP_FINAL_ROUND_SECURITY_CUTOVER_V1.sql"
$ISNET_BACKFILL = Join-Path $WORKER "migrations\0027_isnet_tenant_scope_backfill.sql"
$ISNET_GUARD = Join-Path $WORKER "migrations\0028_isnet_tenant_scope_guard.sql"
$AUTH_GUARD = Join-Path $WORKER "migrations\0029_auth_security_policy_guard.sql"
$DB = "ky-erp-db"
$SENDER = "KY ERP <admin@kyerp.net>"
$LOG = Join-Path $env:USERPROFILE "Desktop\KY_ERP_FINAL_ROUND_RELEASE_20260901.log"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "[HATA] $Message" -ForegroundColor Red
    Add-Content -LiteralPath $LOG -Value "[HATA] $Message"
    Write-Host "Log: $LOG" -ForegroundColor Yellow
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

function Invoke-Captured([string]$Label, [scriptblock]$Action) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & $Action *> $tmp
        $code = $LASTEXITCODE
        $raw = Get-Content -LiteralPath $tmp -Raw -ErrorAction SilentlyContinue
        Add-Content -LiteralPath $LOG -Value "`r`n--- $Label ---`r`n$raw"
        return [pscustomobject]@{ Ok = ($code -eq 0); Code = $code; Text = [string]$raw }
    } catch {
        $message = $_.Exception.Message
        Add-Content -LiteralPath $LOG -Value "`r`n--- $Label EXCEPTION ---`r`n$message"
        return [pscustomobject]@{ Ok = $false; Code = -1; Text = [string]$message }
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Require-Captured([string]$Label, [scriptblock]$Action, [string]$FailureMessage) {
    $result = Invoke-Captured -Label $Label -Action $Action
    if (-not $result.Ok) {
        $tail = (($result.Text -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -Last 4) -join " | "
        if ($tail) { Add-Content -LiteralPath $LOG -Value "TAIL: $tail" }
        Fail "$FailureMessage Cikis kodu: $($result.Code)."
    }
    return $result
}

function Invoke-D1Json([string]$Sql, [string]$Label) {
    Push-Location $WORKER
    try {
        $stdout = [System.IO.Path]::GetTempFileName()
        $stderr = [System.IO.Path]::GetTempFileName()
        try {
            & wrangler d1 execute $DB --remote --config $CONFIG --command $Sql --json 1>$stdout 2>$stderr
            $exitCode = $LASTEXITCODE
            $raw = Get-Content $stdout -Raw -ErrorAction SilentlyContinue
            $err = Get-Content $stderr -Raw -ErrorAction SilentlyContinue
            Add-Content -LiteralPath $LOG -Value "`r`n--- $Label ---`r`n$err`r`n$raw"
            if ($exitCode -ne 0) { Fail "$Label basarisiz. Ayrinti log dosyasinda." }
            try { return ($raw | ConvertFrom-Json) }
            catch { Fail "$Label JSON cevabi okunamadi." }
        } finally {
            Remove-Item $stdout,$stderr -Force -ErrorAction SilentlyContinue
        }
    } finally {
        Pop-Location
    }
}

function First-D1Row([string]$Sql, [string]$Label) {
    $json = Invoke-D1Json $Sql $Label
    $batch = @($json)[0]
    return @($batch.results)[0]
}

function Read-ResendKeyGui {
    Write-Host "[BILGI] Guvenli Resend key penceresi aciliyor..." -ForegroundColor Yellow
    $value = (& pwsh -STA -NoProfile -ExecutionPolicy Bypass -File $PROMPT | Out-String).Trim()
    $code = $LASTEXITCODE
    if ($code -ne 0) { Fail "Resend key penceresi iptal edildi veya acilamadi. Cikis kodu: $code." }
    if ([string]::IsNullOrWhiteSpace($value) -or -not $value.StartsWith("re_") -or $value.Length -lt 10) {
        Fail "Gecerli Resend API key alinamadi."
    }
    return $value
}

Set-Content -LiteralPath $LOG -Value "KY ERP FINAL ROUND RELEASE 2026-09-01 V4`r`nBaslangic: $(Get-Date -Format o)" -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " KY ERP - FINAL ROUND RELEASE / CLEAN V4" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Mail + MFA + Session + IsNet tenant + Worker + Pages"
Write-Host " Worker activation BEFORE standard Resend secret put"
Write-Host " Resend key input: MASKED WINDOWS DIALOG"
Write-Host " D1 reset: NO | DROP: NO | git reset/clean: NO" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($required in @($DIRECT,$PROMPT,$CUTOVER,$ISNET_BACKFILL,$ISNET_GUARD,$AUTH_GUARD,$CONFIG)) {
    if (-not (Test-Path $required)) { Fail "Gerekli dosya bulunamadi: $required" }
}
if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Git repo bulunamadi: $ROOT" }
foreach ($command in @("git","node","npm","wrangler","pwsh")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { Fail "$command bulunamadi." }
}

Write-Host "[1/9] SOURCE / BRANCH" -ForegroundColor Cyan
Set-Location $ROOT
$dirty = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0) { Fail "Git durumu okunamadi." }
if ($dirty) { Write-Host $dirty -ForegroundColor Yellow; Fail "Tracked yerel degisiklik var. Otomatik reset yapilmadi." }
Require-Captured "git fetch" { git fetch origin } "git fetch basarisiz." | Out-Null
Require-Captured "git checkout" { git checkout $BRANCH } "Production branch acilamadi." | Out-Null
Require-Captured "git pull" { git pull --ff-only origin $BRANCH } "Production branch guncellenemedi." | Out-Null
$LOCAL_SHA = (git rev-parse HEAD).Trim()
$REMOTE_SHA = (git rev-parse "origin/$BRANCH").Trim()
if ($LOCAL_SHA -ne $REMOTE_SHA) { Fail "Local ve origin SHA ayni degil." }
Write-Host "[OK] Production HEAD: $LOCAL_SHA" -ForegroundColor Green
Add-Content $LOG "HEAD: $LOCAL_SHA"

Write-Host ""
Write-Host "[2/9] CLOUDFLARE SESSION + OWNER MAIL" -ForegroundColor Cyan
Require-Captured "wrangler whoami" { wrangler whoami } "Cloudflare Wrangler oturumu yok." | Out-Null
Write-Host "[OK] Cloudflare session ready." -ForegroundColor Green
$ownerSql = @"
SELECT s.email AS email
  FROM auth_users u
  JOIN auth_user_security s ON s.user_id=u.id
 WHERE TRIM(COALESCE(s.email,''))<>''
   AND REPLACE(UPPER(TRIM(COALESCE(NULLIF(s.role_override,''),u.role,''))), char(304), 'I') IN ('SUPER_ADMIN','ADMIN')
 ORDER BY CASE WHEN COALESCE(s.email_verified,0)=1 THEN 0 ELSE 1 END, u.created_at ASC
 LIMIT 1;
"@
$owner = First-D1Row -Sql $ownerSql -Label "Owner email check"
$OWNER_EMAIL = [string]$owner.email
if (-not $OWNER_EMAIL -or $OWNER_EMAIL -notmatch '@') { Fail "Uygulama sahibinin gecerli e-posta adresi D1'de bulunamadi." }
Write-Host "[OK] Provider test target resolved." -ForegroundColor Green

Write-Host ""
Write-Host "[3/9] WORKER PREFLIGHT + LATEST VERSION ACTIVATION" -ForegroundColor Cyan
Push-Location $WORKER
try {
    Require-Captured "worker npm ci" { npm ci } "Worker npm ci basarisiz." | Out-Null
    Write-Host "[OK] Worker packages." -ForegroundColor Green
    Require-Captured "worker test" { npm test } "Worker testleri basarisiz." | Out-Null
    Write-Host "[OK] Worker tests." -ForegroundColor Green
    Require-Captured "worker typecheck" { npm run typecheck } "Worker typecheck basarisiz." | Out-Null
    Write-Host "[OK] Worker typecheck." -ForegroundColor Green
    Require-Captured "worker dry-run" { npm run build } "Worker dry-run basarisiz." | Out-Null
    Write-Host "[OK] Worker dry-run." -ForegroundColor Green
    Require-Captured "worker activation deploy" { wrangler deploy --config $CONFIG } "Latest Worker source aktif edilemedi." | Out-Null
} finally { Pop-Location }
Start-Sleep -Seconds 3
try {
    $preHealth = Invoke-RestMethod -Uri "https://api.kyerp.net/api/health?activate=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 30
    if (-not $preHealth.ok) { Fail "Worker activation sonrasi API health ok=true degil." }
} catch { Fail "Worker activation sonrasi API health basarisiz: $($_.Exception.Message)" }
Write-Host "[OK] Latest Worker source is active and healthy." -ForegroundColor Green

Write-Host ""
Write-Host "[4/9] RESEND SECRET + REAL PROVIDER TEST" -ForegroundColor Cyan
Write-Host "Key terminale yazilmaz; maskeli Windows penceresine yapistirilir." -ForegroundColor Yellow
$plainKey = $null
try {
    $plainKey = Read-ResendKeyGui

    Push-Location $WORKER
    try {
        $secretResult = Invoke-Captured "wrangler secret put RESEND_API_KEY" { $plainKey | & wrangler secret put RESEND_API_KEY --config $CONFIG }
        if (-not $secretResult.Ok) {
            Add-Content -LiteralPath $LOG -Value "SECRET_PUT_OUTPUT: $($secretResult.Text)"
            Fail "RESEND_API_KEY standard secret put ile aktif Worker'a yazilamadi. Ayrinti logda."
        }
        $secretList = Invoke-Captured "wrangler secret list" { wrangler secret list --config $CONFIG --format json }
        if (-not $secretList.Ok -or $secretList.Text -notmatch 'RESEND_API_KEY') { Fail "RESEND_API_KEY secret list kontrolunde gorulemedi." }
    } finally { Pop-Location }
    Write-Host "[OK] RESEND_API_KEY active Worker secret." -ForegroundColor Green

    $mailBody = @{
        from = $SENDER
        to = @($OWNER_EMAIL)
        subject = "KY ERP production mail final check"
        text = "KY ERP production mail provider acceptance check. Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } | ConvertTo-Json -Depth 5
    try {
        $mailResponse = Invoke-RestMethod -Uri "https://api.resend.com/emails" -Method POST -Headers @{ Authorization = "Bearer $plainKey" } -ContentType "application/json" -Body $mailBody -TimeoutSec 30
    } catch { Fail "Resend real provider test rejected: $($_.Exception.Message)" }
    if (-not [string]$mailResponse.id) { Fail "Resend provider kabul kimligi donmedi." }
    Add-Content $LOG "RESEND_PROVIDER_ACCEPTED=YES"
    Write-Host "[OK] Resend provider accepted real test mail." -ForegroundColor Green
} finally {
    $plainKey = $null
}

Write-Host ""
Write-Host "[5/9] CANONICAL PRODUCTION TEST + DEPLOY" -ForegroundColor Cyan
Write-Host "Canonical deploy sonunda ENTER isterse bir kez ENTER'a basin." -ForegroundColor Yellow
& pwsh -NoProfile -ExecutionPolicy Bypass -File $DIRECT
if ($LASTEXITCODE -ne 0) { Fail "Canonical production deploy basarisiz. Final D1 cutover uygulanmadi." }
Write-Host "[OK] Canonical Worker + Pages production deploy." -ForegroundColor Green

Write-Host ""
Write-Host "[6/9] AUTH PRE-CUTOVER CHECK" -ForegroundColor Cyan
$preSql = @"
SELECT
  (SELECT COUNT(*) FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE s.user_id IS NULL) AS missing_security,
  (SELECT COUNT(*) FROM auth_user_security WHERE TRIM(COALESCE(main_company_slug,''))='') AS missing_company;
"@
$pre = First-D1Row -Sql $preSql -Label "Auth pre-cutover check"
if ([int]$pre.missing_security -ne 0) { Fail "auth_user_security kaydi eksik kullanici var: $($pre.missing_security)" }
if ([int]$pre.missing_company -ne 0) { Fail "Ana firma baglami eksik auth kullanicisi var: $($pre.missing_company)" }
Write-Host "[OK] Auth security rows and company scope." -ForegroundColor Green

Write-Host ""
Write-Host "[7/9] MFA + SESSION + ISNET + AUTH D1 CUTOVER" -ForegroundColor Cyan
Push-Location $WORKER
try {
    Require-Captured "final security cutover" { wrangler d1 execute $DB --remote --config $CONFIG --file $CUTOVER } "Final MFA/session cutover uygulanamadi." | Out-Null
    Require-Captured "0027 IsNet backfill" { wrangler d1 execute $DB --remote --config $CONFIG --file $ISNET_BACKFILL } "0027 IsNet tenant backfill uygulanamadi." | Out-Null
    Require-Captured "0028 IsNet guard" { wrangler d1 execute $DB --remote --config $CONFIG --file $ISNET_GUARD } "0028 IsNet tenant guard uygulanamadi." | Out-Null
    Require-Captured "0029 Auth guard" { wrangler d1 execute $DB --remote --config $CONFIG --file $AUTH_GUARD } "0029 Auth security guard uygulanamadi." | Out-Null
} finally { Pop-Location }
Write-Host "[OK] D1 security cutover and guards." -ForegroundColor Green

Write-Host ""
Write-Host "[8/9] FINAL D1 + SECRET + LIVE API VERIFY" -ForegroundColor Cyan
$verifySql = @"
SELECT
  (SELECT COUNT(*) FROM auth_system_secrets WHERE secret_key='FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1') AS cutover_marker,
  (SELECT COUNT(*) FROM auth_user_security
    WHERE REPLACE(UPPER(TRIM(COALESCE(login_policy,''))), char(304), 'I') NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
       OR COALESCE(session_seconds,0)<>36000) AS unsafe_policy,
  (SELECT COUNT(*) FROM auth_users
    WHERE role IS NOT NULL AND role<>REPLACE(UPPER(TRIM(COALESCE(role,''))), char(304), 'I')) AS unsafe_role,
  (SELECT COUNT(*) FROM auth_user_module_permissions
    WHERE module_key IS NOT NULL AND module_key<>REPLACE(UPPER(TRIM(COALESCE(module_key,''))), char(304), 'I')) AS unsafe_module,
  (SELECT COUNT(*) FROM json_store
    WHERE scope LIKE 'ISNET_%' AND (main_company_slug IS NULL OR TRIM(main_company_slug)='')) AS global_isnet,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type='trigger' AND name IN ('trg_isnet_json_store_tenant_insert','trg_isnet_json_store_tenant_update')) AS isnet_guard_triggers,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type='trigger' AND name IN (
      'trg_auth_users_role_canonical_insert','trg_auth_users_role_canonical_update',
      'trg_auth_security_mfa_insert','trg_auth_security_mfa_update',
      'trg_auth_module_key_canonical_insert','trg_auth_module_key_canonical_update'
    )) AS auth_guard_triggers,
  (SELECT COUNT(*) FROM auth_sessions s
    WHERE s.revoked_at IS NULL
      AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND s.created_at <= COALESCE((SELECT created_at FROM auth_system_secrets WHERE secret_key='FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1' LIMIT 1),'9999-12-31T23:59:59Z')) AS old_active_sessions;
"@
$verify = First-D1Row -Sql $verifySql -Label "Final D1 verify"
if ([int]$verify.cutover_marker -lt 1) { Fail "Final security cutover marker bulunamadi." }
if ([int]$verify.unsafe_policy -ne 0) { Fail "MFA disinda kalan login policy var: $($verify.unsafe_policy)" }
if ([int]$verify.unsafe_role -ne 0) { Fail "Canonical olmayan rol kaydi var: $($verify.unsafe_role)" }
if ([int]$verify.unsafe_module -ne 0) { Fail "Canonical olmayan modul kodu var: $($verify.unsafe_module)" }
if ([int]$verify.global_isnet -ne 0) { Fail "Tenant'siz IsNet kaydi kaldi: $($verify.global_isnet)" }
if ([int]$verify.isnet_guard_triggers -ne 2) { Fail "IsNet tenant D1 guard triggerlari eksik." }
if ([int]$verify.auth_guard_triggers -ne 6) { Fail "Auth D1 guard triggerlari eksik: $($verify.auth_guard_triggers)/6" }
if ([int]$verify.old_active_sessions -ne 0) { Fail "Cutover oncesinden kalan aktif oturum var: $($verify.old_active_sessions)" }

Push-Location $WORKER
try {
    $secretListFinal = Invoke-Captured "final secret list" { wrangler secret list --config $CONFIG --format json }
    if (-not $secretListFinal.Ok -or $secretListFinal.Text -notmatch 'RESEND_API_KEY') { Fail "Deploy sonrasi RESEND_API_KEY secret listesinde bulunamadi." }
} finally { Pop-Location }

try {
    $health = Invoke-RestMethod -Uri "https://api.kyerp.net/api/health?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 30
    if (-not $health.ok) { Fail "Canli API health ok=true degil." }
} catch { Fail "Canli API health kontrolu basarisiz: $($_.Exception.Message)" }
try {
    $status = Invoke-RestMethod -Uri "https://api.kyerp.net/api/auth/status?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ Origin = "https://app.kyerp.net" } -TimeoutSec 30
    if ([string]$status.authVersion -ne "canonical-v3") { Fail "Canli authVersion canonical-v3 degil." }
    if ([bool]$status.sessionPolicy.passwordOnlyEnabled) { Fail "Canli auth status parola-only acik gosteriyor." }
    if ([int]$status.sessionPolicy.passwordOnlySeconds -ne 0) { Fail "Canli auth status passwordOnlySeconds sifir degil." }
    if ([int]$status.sessionPolicy.mfaSeconds -ne 36000) { Fail "Canli auth status MFA suresi 36000 degil." }
} catch { Fail "Canli auth status kontrolu basarisiz: $($_.Exception.Message)" }
Write-Host "[OK] D1, secret, API and MFA live checks." -ForegroundColor Green

Write-Host ""
Write-Host "[9/9] RESULT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
Write-Host " KY ERP FINAL ROUND RELEASE BASARILI" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host " HEAD          : $LOCAL_SHA"
Write-Host " Resend        : PROVIDER ACCEPTED"
Write-Host " Worker secret : RESEND_API_KEY ACTIVE"
Write-Host " MFA           : REQUIRED FOR ALL USERS"
Write-Host " Old sessions  : REVOKED"
Write-Host " IsNet tenant  : BACKFILL + D1 GUARD ACTIVE"
Write-Host " Auth DB guard : 6/6 ACTIVE"
Write-Host " Worker + Web  : DEPLOYED"
Write-Host " D1 reset      : NOT USED"
Add-Content $LOG "FINAL_RESULT=SUCCESS"
Write-Host ""
Write-Host "Current browser session may be logged out by design. Sign in again with MFA." -ForegroundColor Yellow
Write-Host "Log: $LOG"
Read-Host "Kapatmak icin ENTER"
exit 0
