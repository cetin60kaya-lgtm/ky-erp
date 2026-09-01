$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$DIRECT = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION.ps1"
$TRANSITION = Join-Path $PSScriptRoot "KYERP_ENFORCE_MFA_AND_REVOKE_SESSIONS_V1.sql"
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$CONFIG = Join-Path $WORKER "wrangler.jsonc"
$DATABASE = "ky-erp-db"

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "HATA: $Message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

if (-not (Test-Path $DIRECT)) { Fail "Canonical production script bulunamadi: $DIRECT" }
if (-not (Test-Path $TRANSITION)) { Fail "MFA transition SQL bulunamadi: $TRANSITION" }
if (-not (Test-Path $CONFIG)) { Fail "Worker wrangler config bulunamadi: $CONFIG" }

$pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $pwsh) { Fail "PowerShell 7 bulunamadi." }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " KY ERP - MAIL + MFA + GUVENLI OTURUM RELEASE V1" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "1) Canonical production deploy" -ForegroundColor Gray
Write-Host "2) Mail verification fix korunur" -ForegroundColor Gray
Write-Host "3) Password-only kapatilir / MFA zorunlu olur" -ForegroundColor Gray
Write-Host "4) Teknik rol ve modul kodlari canonical hale getirilir" -ForegroundColor Gray
Write-Host "5) Mevcut aktif auth oturumlari ilk calismada kapatilir" -ForegroundColor Gray
Write-Host "6) Is verisi silinmez; tablo/drop/reset yoktur" -ForegroundColor Gray
Write-Host ""

Write-Host "=== 1/3 CANONICAL PRODUCTION DEPLOY ===" -ForegroundColor Cyan
& $pwsh.Source -NoProfile -ExecutionPolicy Bypass -File $DIRECT
if ($LASTEXITCODE -ne 0) { Fail "Canonical production deploy basarisiz. MFA session transition calistirilmadi." }

Write-Host ""
Write-Host "=== 2/3 GLOBAL MFA + ONE-TIME SECURE SESSION TRANSITION ===" -ForegroundColor Cyan
Push-Location $WORKER
try {
    $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npx) { $npx = Get-Command npx -ErrorAction SilentlyContinue }
    if (-not $npx) { Fail "npx bulunamadi." }

    & $npx.Source wrangler d1 execute $DATABASE --remote --config $CONFIG --file $TRANSITION
    if ($LASTEXITCODE -ne 0) { Fail "Global MFA transition D1 islemi basarisiz." }

    Write-Host ""
    Write-Host "=== 3/3 SECURITY VERIFY ===" -ForegroundColor Cyan
    $verifySql = @"
SELECT
  (SELECT COUNT(*) FROM auth_system_secrets WHERE secret_key='GLOBAL_MFA_ENFORCED_V1') AS marker_count,
  (SELECT COUNT(*) FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE s.user_id IS NULL) AS missing_security_count,
  (SELECT COUNT(*) FROM auth_user_security
    WHERE UPPER(COALESCE(login_policy,'')) NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
       OR COALESCE(session_seconds,0) <> 36000) AS unsafe_policy_count,
  (SELECT COUNT(*) FROM auth_users
    WHERE role IS NOT NULL
      AND role <> REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I')) AS unsafe_role_count,
  (SELECT COUNT(*) FROM auth_user_security
    WHERE role_override IS NOT NULL
      AND COALESCE(role_override,'') <> CASE
            WHEN TRIM(COALESCE(role_override,''))='' THEN ''
            ELSE REPLACE(UPPER(TRIM(role_override)), 'İ', 'I')
          END) AS unsafe_role_override_count,
  (SELECT COUNT(*) FROM auth_user_module_permissions
    WHERE module_key IS NOT NULL
      AND module_key <> REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I')) AS unsafe_module_key_count;
"@
    $raw = (& $npx.Source wrangler d1 execute $DATABASE --remote --config $CONFIG --command $verifySql --json 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Fail "MFA transition dogrulama sorgusu basarisiz." }

    try {
        $json = $raw | ConvertFrom-Json
        $first = @($json)[0]
        $row = @($first.results)[0]
        $markerCount = [int]$row.marker_count
        $missingSecurityCount = [int]$row.missing_security_count
        $unsafePolicyCount = [int]$row.unsafe_policy_count
        $unsafeRoleCount = [int]$row.unsafe_role_count
        $unsafeRoleOverrideCount = [int]$row.unsafe_role_override_count
        $unsafeModuleKeyCount = [int]$row.unsafe_module_key_count
    } catch {
        Fail "MFA transition dogrulama JSON'i okunamadi."
    }

    if ($markerCount -lt 1) { Fail "GLOBAL_MFA_ENFORCED_V1 marker bulunamadi." }
    if ($missingSecurityCount -ne 0) { Fail "Guvenlik kaydi eksik kullanici bulundu. Eksik auth_user_security: $missingSecurityCount" }
    if ($unsafePolicyCount -ne 0) { Fail "MFA zorunlulugu tum kullanicilara uygulanmadi. Kalan guvensiz politika: $unsafePolicyCount" }
    if ($unsafeRoleCount -ne 0) { Fail "Canonical olmayan auth_users.role kaydi kaldi: $unsafeRoleCount" }
    if ($unsafeRoleOverrideCount -ne 0) { Fail "Canonical olmayan role_override kaydi kaldi: $unsafeRoleOverrideCount" }
    if ($unsafeModuleKeyCount -ne 0) { Fail "Canonical olmayan modul anahtari kaldi: $unsafeModuleKeyCount" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " KY ERP SECURITY RELEASE BASARILI" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Mail     : Resend dogrulama release icinde" -ForegroundColor Green
Write-Host "MFA      : Tum kullanicilar icin zorunlu" -ForegroundColor Green
Write-Host "Roller   : Teknik rol/modul kodlari canonical" -ForegroundColor Green
Write-Host "Oturum   : Eski aktif oturumlar guvenli olarak iptal edildi" -ForegroundColor Green
Write-Host "Owner    : Tum aktif oturumlari tek tek yonetebilir" -ForegroundColor Green
Write-Host "D1 veri  : Is verisi silinmedi / reset yapilmadi" -ForegroundColor Green
Write-Host ""
Write-Host "Bu gecis mevcut tarayici oturumunuzu da kapatir." -ForegroundColor Yellow
Write-Host "app.kyerp.net adresinde yeniden giris yapin; MFA/Authenticator zorunlu olacaktir." -ForegroundColor Yellow
Write-Host ""
Read-Host "Kapatmak icin ENTER"
exit 0
