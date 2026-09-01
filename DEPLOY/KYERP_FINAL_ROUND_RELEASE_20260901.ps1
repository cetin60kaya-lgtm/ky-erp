$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$BRANCH = "codex/model-uretim-kontrol-merkezi-final"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$CONFIG = Join-Path $WORKER "wrangler.jsonc"
$DIRECT = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION.ps1"
$CUTOVER = Join-Path $PSScriptRoot "KYERP_FINAL_ROUND_SECURITY_CUTOVER_V1.sql"
$ISNET_BACKFILL = Join-Path $WORKER "migrations\0027_isnet_tenant_scope_backfill.sql"
$ISNET_GUARD = Join-Path $WORKER "migrations\0028_isnet_tenant_scope_guard.sql"
$DB = "ky-erp-db"
$SENDER = "KY ERP <admin@kyerp.net>"
$LOG = Join-Path $env:USERPROFILE "Desktop\KY_ERP_FINAL_ROUND_RELEASE_20260901.log"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "HATA: $Message" -ForegroundColor Red
    Add-Content -LiteralPath $LOG -Value "HATA: $Message"
    Write-Host "Log: $LOG" -ForegroundColor Yellow
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

function Check-Exit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { Fail $Message }
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
            if ($exitCode -ne 0) { Fail "$Label basarisiz: $err $raw" }
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

Set-Content -LiteralPath $LOG -Value "KY ERP FINAL ROUND RELEASE 2026-09-01`r`nBaslangic: $(Get-Date -Format o)" -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " KY ERP - FINAL ROUND RELEASE / 2026-09-01" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "- Resend aktif Worker secret + gercek provider kabul testi" -ForegroundColor Gray
Write-Host "- Canonical Worker + Pages test/build/deploy" -ForegroundColor Gray
Write-Host "- Tum kullanicilar icin MFA zorunlulugu" -ForegroundColor Gray
Write-Host "- Mevcut aktif oturumlar bu final cutover'da bir kez kapatilir" -ForegroundColor Gray
Write-Host "- Owner tum oturumlari tek tek yonetebilir" -ForegroundColor Gray
Write-Host "- IsNet tenant backfill + NULL/global kayit D1 guard" -ForegroundColor Gray
Write-Host "- D1 reset / DROP / is verisi silme YOK" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($required in @($DIRECT,$CUTOVER,$ISNET_BACKFILL,$ISNET_GUARD,$CONFIG)) {
    if (-not (Test-Path $required)) { Fail "Gerekli dosya bulunamadi: $required" }
}
if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Git repo bulunamadi: $ROOT" }
foreach ($command in @("git","node","wrangler","pwsh")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { Fail "$command bulunamadi." }
}

Write-Host "=== 1/8 KAYNAK / BRANCH ===" -ForegroundColor Cyan
Set-Location $ROOT
$dirty = git status --porcelain --untracked-files=no
Check-Exit "Git durumu okunamadi."
if ($dirty) { Write-Host $dirty -ForegroundColor Yellow; Fail "Tracked yerel degisiklik var. Otomatik reset yapilmadi." }
git fetch origin
Check-Exit "git fetch basarisiz."
git checkout $BRANCH
Check-Exit "Production branch acilamadi."
git pull --ff-only origin $BRANCH
Check-Exit "Production branch guncellenemedi."
$LOCAL_SHA = (git rev-parse HEAD).Trim()
$REMOTE_SHA = (git rev-parse "origin/$BRANCH").Trim()
if ($LOCAL_SHA -ne $REMOTE_SHA) { Fail "Local ve origin SHA ayni degil." }
Write-Host "Production HEAD: $LOCAL_SHA" -ForegroundColor Green
Add-Content $LOG "HEAD: $LOCAL_SHA"

Write-Host ""
Write-Host "=== 2/8 CLOUDFLARE + OWNER MAIL ===" -ForegroundColor Cyan
wrangler whoami | Tee-Object -FilePath $LOG -Append
Check-Exit "Cloudflare Wrangler oturumu yok."
$ownerSql = @"
SELECT s.email AS email
  FROM auth_users u
  JOIN auth_user_security s ON s.user_id=u.id
 WHERE TRIM(COALESCE(s.email,''))<>''
   AND REPLACE(UPPER(TRIM(COALESCE(NULLIF(s.role_override,''),u.role,''))), 'İ', 'I') IN ('SUPER_ADMIN','ADMIN')
 ORDER BY CASE WHEN COALESCE(s.email_verified,0)=1 THEN 0 ELSE 1 END, u.created_at ASC
 LIMIT 1;
"@
$owner = First-D1Row $ownerSql "Owner e-posta kontrolu"
$OWNER_EMAIL = [string]$owner.email
if (-not $OWNER_EMAIL -or $OWNER_EMAIL -notmatch '@') { Fail "Uygulama sahibinin gecerli e-posta adresi D1'de bulunamadi." }
Write-Host "Provider test hedefi: $OWNER_EMAIL" -ForegroundColor Green

Write-Host ""
Write-Host "=== 3/8 RESEND SECRET + GERCEK PROVIDER TEST ===" -ForegroundColor Cyan
Write-Host "Resend API key'i yalniz bu terminalde bir kez girin. Chat'e veya loga yazilmaz." -ForegroundColor Yellow
$secureKey = Read-Host "RESEND API KEY" -AsSecureString
if ($null -eq $secureKey -or $secureKey.Length -eq 0) { Fail "Resend API key girilmedi." }
$bstr = [IntPtr]::Zero
$plainKey = $null
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if (-not $plainKey) { Fail "Resend API key okunamadi." }

    Push-Location $WORKER
    try {
        $plainKey | & wrangler secret put RESEND_API_KEY --config $CONFIG | Tee-Object -FilePath $LOG -Append
        Check-Exit "RESEND_API_KEY aktif Worker secret olarak yazilamadi."
    } finally { Pop-Location }

    $body = @{
        from = $SENDER
        to = @($OWNER_EMAIL)
        subject = "KY ERP production mail final dogrulama"
        text = "KY ERP production mail servisi final release oncesi Resend provider kabul testidir. Tarih: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    } | ConvertTo-Json -Depth 5
    try {
        $mailResponse = Invoke-RestMethod -Uri "https://api.resend.com/emails" -Method POST -Headers @{ Authorization = "Bearer $plainKey" } -ContentType "application/json" -Body $body -TimeoutSec 30
    } catch {
        Fail "Resend gercek provider testi reddedildi: $($_.Exception.Message)"
    }
    $providerId = [string]$mailResponse.id
    if (-not $providerId) { Fail "Resend provider kabul kimligi donmedi." }
    Write-Host "Resend provider kabul etti. Provider ID mevcut." -ForegroundColor Green
    Add-Content $LOG "RESEND_PROVIDER_ACCEPTED=YES"
} finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    $plainKey = $null
    $secureKey = $null
}

Write-Host ""
Write-Host "=== 4/8 CANONICAL PRODUCTION TEST + DEPLOY ===" -ForegroundColor Cyan
Write-Host "Canonical deploy kendi sonunda ENTER isterse bir kez ENTER'a basin; final zincir otomatik devam eder." -ForegroundColor Yellow
& pwsh -NoProfile -ExecutionPolicy Bypass -File $DIRECT
if ($LASTEXITCODE -ne 0) { Fail "Canonical production deploy basarisiz. Final D1 cutover uygulanmadi." }

Write-Host ""
Write-Host "=== 5/8 AUTH PRE-CUTOVER GUVENLIK KONTROLU ===" -ForegroundColor Cyan
$pre = First-D1Row @"
SELECT
  (SELECT COUNT(*) FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE s.user_id IS NULL) AS missing_security,
  (SELECT COUNT(*) FROM auth_user_security WHERE TRIM(COALESCE(main_company_slug,''))='') AS missing_company;
"@ "Auth pre-cutover kontrolu"
if ([int]$pre.missing_security -ne 0) { Fail "auth_user_security kaydi eksik kullanici var: $($pre.missing_security)" }
if ([int]$pre.missing_company -ne 0) { Fail "Ana firma baglami eksik auth kullanicisi var: $($pre.missing_company)" }
Write-Host "Auth security row + firma baglami: TAM" -ForegroundColor Green

Write-Host ""
Write-Host "=== 6/8 FINAL MFA / OTURUM / ISNET D1 CUTOVER ===" -ForegroundColor Cyan
Push-Location $WORKER
try {
    wrangler d1 execute $DB --remote --config $CONFIG --file $CUTOVER | Tee-Object -FilePath $LOG -Append
    Check-Exit "Final MFA/session cutover uygulanamadi."
    wrangler d1 execute $DB --remote --config $CONFIG --file $ISNET_BACKFILL | Tee-Object -FilePath $LOG -Append
    Check-Exit "0027 IsNet tenant backfill uygulanamadi."
    wrangler d1 execute $DB --remote --config $CONFIG --file $ISNET_GUARD | Tee-Object -FilePath $LOG -Append
    Check-Exit "0028 IsNet tenant D1 guard uygulanamadi."
} finally { Pop-Location }

Write-Host ""
Write-Host "=== 7/8 FINAL D1 + SECRET + API VERIFY ===" -ForegroundColor Cyan
$verify = First-D1Row @"
SELECT
  (SELECT COUNT(*) FROM auth_system_secrets WHERE secret_key='FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1') AS cutover_marker,
  (SELECT COUNT(*) FROM auth_user_security
    WHERE REPLACE(UPPER(TRIM(COALESCE(login_policy,''))), 'İ', 'I') NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
       OR COALESCE(session_seconds,0)<>36000) AS unsafe_policy,
  (SELECT COUNT(*) FROM auth_users
    WHERE role IS NOT NULL AND role<>REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I')) AS unsafe_role,
  (SELECT COUNT(*) FROM auth_user_module_permissions
    WHERE module_key IS NOT NULL AND module_key<>REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I')) AS unsafe_module,
  (SELECT COUNT(*) FROM json_store
    WHERE scope LIKE 'ISNET_%' AND (main_company_slug IS NULL OR TRIM(main_company_slug)='')) AS global_isnet,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type='trigger' AND name IN ('trg_isnet_json_store_tenant_insert','trg_isnet_json_store_tenant_update')) AS isnet_guard_triggers;
"@ "Final D1 verify"
if ([int]$verify.cutover_marker -lt 1) { Fail "Final security cutover marker bulunamadi." }
if ([int]$verify.unsafe_policy -ne 0) { Fail "MFA disinda kalan login policy var: $($verify.unsafe_policy)" }
if ([int]$verify.unsafe_role -ne 0) { Fail "Canonical olmayan rol kaydi var: $($verify.unsafe_role)" }
if ([int]$verify.unsafe_module -ne 0) { Fail "Canonical olmayan modul kodu var: $($verify.unsafe_module)" }
if ([int]$verify.global_isnet -ne 0) { Fail "Tenant'siz IsNet kaydi kaldi: $($verify.global_isnet)" }
if ([int]$verify.isnet_guard_triggers -ne 2) { Fail "IsNet tenant D1 guard triggerlari eksik." }

Push-Location $WORKER
try {
    $secretRaw = (& wrangler secret list --config $CONFIG --format json 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $secretRaw -notmatch 'RESEND_API_KEY') { Fail "Deploy sonrasi RESEND_API_KEY secret listesinde bulunamadi." }
} finally { Pop-Location }

try {
    $health = Invoke-RestMethod -Uri "https://api.kyerp.net/api/health?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -TimeoutSec 30
    if (-not $health.ok) { Fail "Canli API health ok=true degil." }
} catch { Fail "Canli API health kontrolu basarisiz: $($_.Exception.Message)" }
try {
    $status = Invoke-RestMethod -Uri "https://api.kyerp.net/api/auth/status?final=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ Origin = "https://app.kyerp.net" } -TimeoutSec 30
    if ([string]$status.authVersion -ne "canonical-v3") { Fail "Canli authVersion canonical-v3 degil." }
} catch { Fail "Canli auth status kontrolu basarisiz: $($_.Exception.Message)" }
Write-Host "D1 MFA + tenant + Resend secret + API: TAM" -ForegroundColor Green

Write-Host ""
Write-Host "=== 8/8 SONUC ===" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
Write-Host " KY ERP FINAL ROUND RELEASE BASARILI" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "HEAD             : $LOCAL_SHA"
Write-Host "Resend provider  : ACCEPTED" -ForegroundColor Green
Write-Host "Worker secret    : RESEND_API_KEY HAZIR" -ForegroundColor Green
Write-Host "MFA              : TUM KULLANICILAR ZORUNLU" -ForegroundColor Green
Write-Host "Oturum cutover   : UYGULANDI" -ForegroundColor Green
Write-Host "Owner session UI : TEK TEK / TUMUNU KAPATMA HAZIR" -ForegroundColor Green
Write-Host "IsNet tenant     : NULL/GLOBAL KAYIT YOK + 2 D1 GUARD" -ForegroundColor Green
Write-Host "API              : HEALTH + AUTH STATUS HAZIR" -ForegroundColor Green
Write-Host "D1 reset         : YAPILMADI" -ForegroundColor Green
Write-Host ""
Write-Host "Bu final cutover mevcut eski oturumlari kapatir. app.kyerp.net'e yeniden MFA ile giris yapin." -ForegroundColor Yellow
Write-Host "Giris sonrasi Yonetim > Kullanicilar ekraninda E-posta Dogrulama kodunu gonderip kullanici adresini dogrulayabilirsiniz." -ForegroundColor Yellow
Add-Content $LOG "SUCCESS: $(Get-Date -Format o)"
try { Start-Process "https://app.kyerp.net/admin/kullanicilar" } catch {}
Write-Host ""
Write-Host "Log: $LOG"
Read-Host "Kapatmak icin ENTER"
exit 0
