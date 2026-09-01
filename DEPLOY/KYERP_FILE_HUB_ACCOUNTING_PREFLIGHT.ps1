$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$WORKER = Join-Path $ROOT "APP\cloud\ky-erp-api"
$FRONTEND = Join-Path $ROOT "APP\app\ky-erp-frontend"
$LOCAL_CONFIG = "wrangler.production-local.jsonc"
$LOCAL_DB = "ky-erp-production-local"
$PERSIST = Join-Path $WORKER ".file-hub-accounting-preflight"
$MIGRATIONS = @(
  "0028_file_hub_multistorage.sql",
  "0029_file_hub_outgoing_team_links.sql",
  "0030_file_hub_provider_defaults.sql",
  "0031_file_hub_primary_location_failover.sql",
  "0032_accounting_document_core.sql",
  "0033_accounting_intelligence_profiles.sql",
  "0034_accounting_document_archive_queue.sql"
)
$REQUIRED_SCHEMA_OBJECTS = @(
  "file_hub_connections","file_hub_bindings","file_hub_assets","file_hub_locations","file_hub_relations","file_hub_revisions","file_hub_events","file_hub_agent_status",
  "accounting_documents","accounting_document_lines","accounting_document_taxes","accounting_document_relations","accounting_document_issues","accounting_payment_plans","accounting_ledger_entries",
  "accounting_extraction_profiles","accounting_bank_import_batches","accounting_bank_import_rows","accounting_document_archive_jobs",
  "trg_file_hub_outgoing_package_teammates","trg_file_hub_primary_location_failover","trg_accounting_documents_enqueue_archive"
)

function Fail([string]$Message) { Write-Host ""; Write-Host "HATA: $Message" -ForegroundColor Red; exit 1 }
function Check([string]$Message) { if ($LASTEXITCODE -ne 0) { Fail $Message } }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " KY ERP - FILE HUB + MUHASEBE CANLI ONCESI KONTROL" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Bu script production'a yazmaz, deploy yapmaz ve remote D1'e dokunmaz." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path (Join-Path $ROOT ".git"))) { Fail "Git repo bulunamadi: $ROOT" }
foreach ($cmd in @("git","node","npm","npx")) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$cmd bulunamadi." } }

Set-Location $ROOT
$dirty = git status --porcelain --untracked-files=no
Check "Git durumu okunamadi."
if ($dirty) { Write-Host $dirty -ForegroundColor Yellow; Fail "Tracked degisiklik var. Preflight temiz kaynakta calismalidir." }
$branch = (git branch --show-current).Trim()
$sha = (git rev-parse HEAD).Trim()
Write-Host "Branch : $branch"
Write-Host "SHA    : $sha" -ForegroundColor Green

foreach ($name in $MIGRATIONS) { $p = Join-Path $WORKER "migrations\$name"; if (-not (Test-Path $p)) { Fail "Migration eksik: $name" } }
foreach ($p in @((Join-Path $ROOT "tools\file-hub-agent\file-hub-agent.mjs"),(Join-Path $ROOT "tools\file-hub-agent\accounting-archive-worker.mjs"),(Join-Path $ROOT "tools\file-hub-agent\start-file-hub-agent.cmd"))) { if (-not (Test-Path $p)) { Fail "Agent dosyasi eksik: $p" } }

Write-Host ""; Write-Host "[1/6] Worker dependency + security + typecheck + tests + dry-run" -ForegroundColor Cyan
Set-Location $WORKER
npm ci; Check "Worker npm ci basarisiz."
npm audit --omit=dev --audit-level=high; Check "Worker production dependency security audit basarisiz."
npm run typecheck; Check "Worker typecheck basarisiz."
npm test; Check "Worker testleri basarisiz."
npm run build; Check "Worker dry-run build basarisiz."

Write-Host ""; Write-Host "[2/6] File Hub Windows Agent syntax" -ForegroundColor Cyan
$agentMain = Join-Path $ROOT "tools\file-hub-agent\file-hub-agent.mjs"
$archiveWorker = Join-Path $ROOT "tools\file-hub-agent\accounting-archive-worker.mjs"
node --check $agentMain; Check "file-hub-agent.mjs syntax hatasi."
node --check $archiveWorker; Check "accounting-archive-worker.mjs syntax hatasi."

Write-Host ""; Write-Host "[3/6] Frontend lint + tests + production build" -ForegroundColor Cyan
Set-Location $FRONTEND
npm ci; Check "Frontend npm ci basarisiz."
npm run lint; Check "Frontend lint basarisiz."
npm test; Check "Frontend testleri basarisiz."
npm run build; Check "Frontend build basarisiz."
if (-not (Test-Path (Join-Path $FRONTEND "dist\index.html"))) { Fail "Frontend dist/index.html olusmadi." }

Write-Host ""; Write-Host "[4/6] Izole yerel D1 migration provasi" -ForegroundColor Cyan
Set-Location $WORKER
if (-not (Test-Path (Join-Path $WORKER $LOCAL_CONFIG))) { Fail "$LOCAL_CONFIG bulunamadi." }
if (-not (Test-Path (Join-Path $WORKER "local-production-center.sql"))) { Fail "local-production-center.sql bulunamadi." }
if (Test-Path $PERSIST) { Remove-Item $PERSIST -Recurse -Force }
npx wrangler d1 execute $LOCAL_DB --local --config $LOCAL_CONFIG --persist-to $PERSIST --file local-production-center.sql; Check "Izole D1 baseline kurulumu basarisiz."
foreach ($name in $MIGRATIONS) { Write-Host "  -> $name"; $migrationPath = Join-Path "migrations" $name; npx wrangler d1 execute $LOCAL_DB --local --config $LOCAL_CONFIG --persist-to $PERSIST --file $migrationPath; Check "Yerel migration provasi basarisiz: $name" }
$quoted = ($REQUIRED_SCHEMA_OBJECTS | ForEach-Object { "'$_'" }) -join ","
$requiredSql = "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ($quoted);"
$schemaRaw = (& npx wrangler d1 execute $LOCAL_DB --local --config $LOCAL_CONFIG --persist-to $PERSIST --command $requiredSql --json 2>&1 | Out-String).Trim(); Check "Yerel schema audit sorgusu basarisiz."
try { $schemaJson = $schemaRaw | ConvertFrom-Json } catch { Fail "Yerel schema audit JSON okunamadi: $schemaRaw" }
$schemaCount = [int]$schemaJson[0].results[0].n
if ($schemaCount -ne $REQUIRED_SCHEMA_OBJECTS.Count) { Fail "Yerel schema audit eksik. Beklenen=$($REQUIRED_SCHEMA_OBJECTS.Count) bulunan=$schemaCount" }
Write-Host "Yerel schema audit: $schemaCount/$($REQUIRED_SCHEMA_OBJECTS.Count)" -ForegroundColor Green

Write-Host ""; Write-Host "[5/6] Production config binding sozlesmesi" -ForegroundColor Cyan
$configText = Get-Content (Join-Path $WORKER "wrangler.jsonc") -Raw
foreach ($needle in @('"binding": "DB"','"binding": "FILES"','"binding": "AI"','"api.kyerp.net"')) { if (-not $configText.Contains($needle)) { Fail "wrangler.jsonc eksik binding/route: $needle" } }
$intelligence = Get-Content (Join-Path $WORKER "src\accounting-document-intelligence.ts") -Raw
if (-not $intelligence.Contains("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")) { Fail "Azure Document Intelligence endpoint sozlesmesi kaynakta yok." }
if (-not $intelligence.Contains("AZURE_DOCUMENT_INTELLIGENCE_KEY")) { Fail "Azure Document Intelligence key sozlesmesi kaynakta yok." }
$agent = Get-Content (Join-Path $WORKER "src\file-hub-agent-public.ts") -Raw
if (-not $agent.Contains("FILE_HUB_AGENT_KEY")) { Fail "File Hub Agent key sozlesmesi kaynakta yok." }

Write-Host ""; Write-Host "[6/6] Sonuc" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
Write-Host " KOD + BUILD + TEST + IZOLASYON MIGRATION PREFLIGHT HAZIR " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Canliya cikmadan once production ortaminda ayrica zorunlu:" -ForegroundColor Yellow
Write-Host "- FILE_HUB_AGENT_KEY secret"
Write-Host "- AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT secret/var"
Write-Host "- AZURE_DOCUMENT_INTELLIGENCE_KEY secret"
Write-Host "- RESEND_API_KEY mevcut mail standardi"
Write-Host "- Firma bazli File Hub storage connection + MUHASEBE INVOICE/DELIVERY_NOTE binding"
Write-Host "- Hedefli 0028-0034 remote D1 migration + tam D1 backup"
Write-Host "- Worker/Pages deploy sonrasi canli smoke"
Write-Host ""; exit 0
