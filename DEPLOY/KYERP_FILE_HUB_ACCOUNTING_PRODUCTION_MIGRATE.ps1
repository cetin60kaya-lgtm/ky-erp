param([string]$ExpectedBranch = "codex/model-uretim-kontrol-merkezi-final")
$ErrorActionPreference = "Stop"
$ROOT = Split-Path $PSScriptRoot -Parent
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$DB_NAME = "ky-erp-db"
$DB_CONFIG = "wrangler.jsonc"
$BACKUP_DIR = Join-Path $ROOT "BACKUPS\D1\PRE_DEPLOY"
$MIGRATIONS_BEFORE_0034 = @("0030_file_hub_multistorage.sql","0031_file_hub_outgoing_team_links.sql","0032_file_hub_provider_defaults.sql","0033_file_hub_primary_location_failover.sql")
$MIGRATIONS_AFTER_0034 = @("0035_accounting_intelligence_profiles.sql","0036_accounting_document_archive_queue.sql","0037_pdks_device_sync.sql","0038_company_ai_billing.sql","0039_file_hub_agent_tenant_credentials.sql")
$REQUIRED_TABLES = @("file_hub_connections","file_hub_bindings","file_hub_assets","file_hub_locations","file_hub_relations","file_hub_revisions","file_hub_events","file_hub_agent_status","file_hub_agent_credentials","accounting_documents","accounting_document_lines","accounting_document_taxes","accounting_document_relations","accounting_document_issues","accounting_payment_plans","accounting_ledger_entries","accounting_extraction_profiles","accounting_bank_import_batches","accounting_bank_import_rows","accounting_document_archive_jobs","ik_pdks_devices","ik_pdks_device_sync_logs","company_billing_profiles","company_billing_ledger")
$REQUIRED_TRIGGERS = @("trg_file_hub_outgoing_package_teammates","trg_file_hub_primary_location_failover","trg_accounting_documents_enqueue_archive")
$REQUIRED_SECRETS = @("FILE_HUB_AGENT_KEY","AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT","AZURE_DOCUMENT_INTELLIGENCE_KEY","RESEND_API_KEY")
function Fail([string]$Message) { Write-Host ""; Write-Host "HATA: $Message" -ForegroundColor Red; Write-Host "Remote D1 migration durduruldu." -ForegroundColor Yellow; exit 1 }
function Check([string]$Message) { if ($LASTEXITCODE -ne 0) { Fail $Message } }
function RemoteJson([string]$Sql) { Set-Location $WORKER; $raw = (& wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --command $Sql --json 2>&1 | Out-String).Trim(); if ($LASTEXITCODE -ne 0) { Fail "Remote D1 sorgusu basarisiz: $raw" }; try { return ($raw | ConvertFrom-Json) } catch { Fail "Remote D1 JSON okunamadi: $raw" } }
function ApplyMigration([string]$Name) { Write-Host "Uygulaniyor/idempotent: $Name" -ForegroundColor Yellow; $migrationPath = Join-Path "migrations" $Name; wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --file $migrationPath; Check "Migration basarisiz: $Name" }
Write-Host ""; Write-Host "============================================================" -ForegroundColor Cyan; Write-Host " KY ERP - FINAL HEDEFLI D1 MIGRATION 0030-0039" -ForegroundColor Cyan; Write-Host "============================================================" -ForegroundColor Cyan; Write-Host "Genel migration zinciri CALISMAZ. Yalniz hedefli 0030-0039 uygulanir; production 0027-0029 IsNet/auth guard zinciri korunur." -ForegroundColor Yellow; Write-Host "Worker veya Pages deploy etmez." -ForegroundColor Yellow; Write-Host ""
foreach ($cmd in @("git","wrangler")) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$cmd bulunamadi." } }
Set-Location $ROOT
$dirty = git status --porcelain --untracked-files=no; Check "Git durumu okunamadi."; if ($dirty) { Write-Host $dirty -ForegroundColor Yellow; Fail "Tracked yerel degisiklik var." }
$branch = (git branch --show-current).Trim(); if ($branch -ne $ExpectedBranch) { Fail "Yanlis branch. Beklenen=$ExpectedBranch mevcut=$branch" }
$localSha = (git rev-parse HEAD).Trim(); $remoteSha = (git rev-parse "origin/$ExpectedBranch").Trim(); if ($localSha -ne $remoteSha) { Fail "Local ve origin production SHA ayni degil." }; Write-Host "Production SHA: $localSha" -ForegroundColor Green
Set-Location $WORKER
foreach ($name in @($MIGRATIONS_BEFORE_0034 + "0034_accounting_document_core.sql" + $MIGRATIONS_AFTER_0034)) { if (-not (Test-Path (Join-Path "migrations" $name))) { Fail "Migration eksik: $name" } }
wrangler whoami; Check "Cloudflare oturumu yok."
$secretRaw = (& wrangler secret list --config $DB_CONFIG --json 2>&1 | Out-String).Trim(); Check "Worker secret list okunamadi."; try { $secretList = @($secretRaw | ConvertFrom-Json) } catch { Fail "Secret list JSON okunamadi." }
$secretNames = @($secretList | ForEach-Object { [string]$_.name }); $missingSecrets = @($REQUIRED_SECRETS | Where-Object { $secretNames -notcontains $_ }); if ($missingSecrets.Count -gt 0) { Fail ("Production secret eksik: " + ($missingSecrets -join ", ") + ". Secret degerlerini repoya/chat'e yazmayin; wrangler secret put ile tanimlayin.") }
Write-Host "Production secret adlari: HAZIR" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"; $backup = Join-Path $BACKUP_DIR "ky-erp-db-final-$stamp.sql"
wrangler d1 export $DB_NAME --remote --config $DB_CONFIG --output $backup; Check "Canli D1 tam yedegi alinamadi."; if (-not (Test-Path $backup) -or (Get-Item $backup).Length -lt 100) { Fail "D1 backup gecersiz/kucuk." }; Write-Host "D1 backup: $backup" -ForegroundColor Green
foreach ($name in $MIGRATIONS_BEFORE_0034) { ApplyMigration $name }
$canonical = RemoteJson("SELECT COUNT(*) AS n FROM pragma_table_info('accounting_documents') WHERE name='uuid';")
$canonicalN = [int]$canonical[0].results[0].n
if ($canonicalN -eq 1) {
  Write-Host "0034 canonical accounting_documents zaten mevcut; tekrar uygulanmiyor." -ForegroundColor Green
} else {
  $legacyCountJson = RemoteJson("SELECT COUNT(*) AS n FROM accounting_documents;")
  $legacyCount = [int]$legacyCountJson[0].results[0].n
  if ($legacyCount -ne 0) { Fail "GUVENLIK DURDURMASI: Eski accounting_documents tablosunda $legacyCount kayit var; otomatik donusum yapilmadi." }
  Write-Host "Eski accounting_documents tablosu bos; canonical semaya guvenli gecis yapiliyor." -ForegroundColor Yellow
  wrangler d1 execute $DB_NAME --remote --config $DB_CONFIG --command "DROP TABLE accounting_documents;"; Check "Bos legacy accounting_documents tablosu kaldirilamadi."
  ApplyMigration "0034_accounting_document_core.sql"
}
foreach ($name in $MIGRATIONS_AFTER_0034) { ApplyMigration $name }
$missing = @(); foreach ($table in $REQUIRED_TABLES) { $json = RemoteJson("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='$table';"); if ([int]$json[0].results[0].n -ne 1) { $missing += "table:$table" } }; foreach ($trigger in $REQUIRED_TRIGGERS) { $json = RemoteJson("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name='$trigger';"); if ([int]$json[0].results[0].n -ne 1) { $missing += "trigger:$trigger" } }; if ($missing.Count -gt 0) { Fail ("Migration sonrasi sema eksik: " + ($missing -join ", ")) }
$billing = RemoteJson("SELECT (SELECT COUNT(*) FROM pragma_table_info('company_billing_profiles') WHERE name IN ('main_company_slug','package_code','status','included_tokens','monthly_token_limit','custom_monthly_price_minor','period_start','period_end','next_renewal_at')) AS profile_cols, (SELECT COUNT(*) FROM pragma_table_info('company_billing_ledger') WHERE name IN ('main_company_slug','movement_type','source','source_ref','input_tokens','output_tokens','total_tokens','amount_minor')) AS ledger_cols;")
if ([int]$billing[0].results[0].profile_cols -ne 9 -or [int]$billing[0].results[0].ledger_cols -ne 8) { Fail "Firma AI ucretlendirme semasi eksik." }
$agent = RemoteJson("SELECT COUNT(*) AS n FROM pragma_table_info('file_hub_agent_credentials') WHERE name IN ('main_company_slug','secret_hash','is_active','last_used_at');")
if ([int]$agent[0].results[0].n -ne 4) { Fail "File Hub tenant agent credential semasi eksik." }
Write-Host ""; Write-Host "============================================================" -ForegroundColor Green; Write-Host " FINAL D1 SEMASI 0030-0039 HAZIR " -ForegroundColor Green; Write-Host "============================================================" -ForegroundColor Green; Write-Host "Backup : $backup"; Write-Host "SHA    : $localSha"; Write-Host "Sonraki adim: canonical Worker + Pages deploy ve canli smoke." -ForegroundColor Yellow; exit 0