param(
  [ValidateSet("check", "backup", "full")]
  [string]$Action = "full"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Database = Join-Path $Root "DATA\KYERP.db"
$BackupDirectory = Join-Path $Root "SQL-BACKUP"
$Sqlite = (Get-Command sqlite3 -ErrorAction Stop).Source

function Invoke-SqliteLines {
  param([string]$DatabasePath, [string]$Sql)
  $output = & $Sqlite $DatabasePath ".timeout 30000" $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "SQLite komutu basarisiz: $($output -join [Environment]::NewLine)"
  }
  return @($output)
}

function Assert-DatabaseHealth {
  param([string]$DatabasePath)
  $quickCheck = (Invoke-SqliteLines $DatabasePath "PRAGMA quick_check;") -join "`n"
  if ($quickCheck.Trim() -ne "ok") {
    throw "Veritabani quick_check basarisiz: $quickCheck"
  }

  $foreignKeyViolations = @(Invoke-SqliteLines $DatabasePath "PRAGMA foreign_key_check;")
  if ($foreignKeyViolations.Count -gt 0) {
    throw "Veritabaninda $($foreignKeyViolations.Count) yabanci anahtar ihlali bulundu."
  }

  $requiredTablesSql = @"
SELECT required.name
FROM (
  SELECT 'auth_users' AS name UNION ALL
  SELECT 'main_companies' UNION ALL
  SELECT 'companies' UNION ALL
  SELECT 'documents' UNION ALL
  SELECT 'current_account_movements' UNION ALL
  SELECT 'vat_records' UNION ALL
  SELECT 'hr_monthly_employees' UNION ALL
  SELECT 'hr_daily_employees'
) AS required
LEFT JOIN sqlite_master actual
  ON actual.type = 'table' AND actual.name = required.name
WHERE actual.name IS NULL;
"@
  $missingTables = @(Invoke-SqliteLines $DatabasePath $requiredTablesSql)
  if ($missingTables.Count -gt 0) {
    throw "Zorunlu tablolar eksik: $($missingTables -join ', ')"
  }

  $duplicateTaxNumbersSql = @"
SELECT main_company_slug || ':' || tax_no || ':' || COUNT(*)
FROM companies
WHERE deleted_at IS NULL
  AND tax_no IS NOT NULL
  AND TRIM(tax_no) <> ''
GROUP BY main_company_slug, tax_no
HAVING COUNT(*) > 1;
"@
  $duplicateTaxNumbers = @(Invoke-SqliteLines $DatabasePath $duplicateTaxNumbersSql)
  if ($duplicateTaxNumbers.Count -gt 0) {
    throw "Aktif firma vergi numarasi tekrarli: $($duplicateTaxNumbers -join ', ')"
  }

  [pscustomobject]@{
    Database = $DatabasePath
    QuickCheck = "ok"
    ForeignKeyViolations = 0
    MissingRequiredTables = 0
    DuplicateActiveTaxNumbers = 0
  }
}

if (-not (Test-Path -LiteralPath $Database)) {
  throw "Veritabani bulunamadi: $Database"
}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null

if ($Action -in @("check", "full")) {
  Assert-DatabaseHealth -DatabasePath $Database | Format-List
}

if ($Action -in @("backup", "full")) {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $backupPath = Join-Path $BackupDirectory "KYERP_$stamp.online.db"
  $escapedBackupPath = $backupPath.Replace("'", "''").Replace("\", "/")
  Invoke-SqliteLines $Database ".backup '$escapedBackupPath'" | Out-Null
  $backupHealth = Assert-DatabaseHealth -DatabasePath $backupPath
  $backupItem = Get-Item -LiteralPath $backupPath
  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  [pscustomobject]@{
    Backup = $backupItem.FullName
    Bytes = $backupItem.Length
    SHA256 = $backupHash
    QuickCheck = $backupHealth.QuickCheck
    ForeignKeyViolations = $backupHealth.ForeignKeyViolations
  } | Format-List
}
