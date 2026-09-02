param(
  [string]$LiveDataRoot = $env:KYERP_LEGACY_DATA_ROOT
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$LinkPath = Join-Path $Root "DATA"

if ([string]::IsNullOrWhiteSpace($LiveDataRoot)) {
  $LiveDataRoot = "D:\KYERP\DATA"
}

$LiveDataRoot = [System.IO.Path]::GetFullPath($LiveDataRoot)
$SourceDatabase = Join-Path $LiveDataRoot "KYERP.db"
$LinkedDatabase = Join-Path $LinkPath "KYERP.db"

if (-not (Test-Path -LiteralPath $LiveDataRoot)) {
  throw "Legacy DATA klasoru bulunamadi: $LiveDataRoot. Gerekirse KYERP_LEGACY_DATA_ROOT ortam degiskenini tanimlayin."
}

if (-not (Test-Path -LiteralPath $SourceDatabase)) {
  throw "Legacy veritabani bulunamadi: $SourceDatabase"
}

$sqlite = (Get-Command sqlite3 -ErrorAction Stop).Source
$quickCheck = (& $sqlite $SourceDatabase ".timeout 30000" "PRAGMA quick_check;" 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0 -or $quickCheck.Trim() -ne "ok") {
  throw "Legacy veritabani quick_check basarisiz: $quickCheck"
}

if (Test-Path -LiteralPath $LinkPath) {
  if (-not (Test-Path -LiteralPath $LinkedDatabase)) {
    throw "Aktif repoda DATA klasoru var ancak KYERP.db yok. Guvenlik icin dokunulmadi: $LinkPath"
  }

  $sourceResolved = (Resolve-Path -LiteralPath $SourceDatabase).Path
  $linkedResolved = (Resolve-Path -LiteralPath $LinkedDatabase).Path
  if ($sourceResolved -ne $linkedResolved) {
    $sourceHash = (Get-FileHash -LiteralPath $SourceDatabase -Algorithm SHA256).Hash
    $linkedHash = (Get-FileHash -LiteralPath $LinkedDatabase -Algorithm SHA256).Hash
    if ($sourceHash -ne $linkedHash) {
      throw "Aktif DATA farkli bir veritabanina bagli. Guvenlik icin degistirilmedi: $LinkPath"
    }
  }

  Write-Host "DATA baglantisi zaten hazir: $LinkPath" -ForegroundColor Green
} else {
  New-Item -ItemType Junction -Path $LinkPath -Target $LiveDataRoot | Out-Null
  Write-Host "DATA baglantisi olusturuldu: $LinkPath -> $LiveDataRoot" -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath $LinkedDatabase)) {
  throw "DATA baglantisi sonrasi KYERP.db gorunmuyor: $LinkedDatabase"
}

$linkedQuickCheck = (& $sqlite $LinkedDatabase ".timeout 30000" "PRAGMA quick_check;" 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0 -or $linkedQuickCheck.Trim() -ne "ok") {
  throw "Bagli veritabani quick_check basarisiz: $linkedQuickCheck"
}

[pscustomobject]@{
  ActiveRepo = $Root
  DataLink = $LinkPath
  LiveDataRoot = $LiveDataRoot
  Database = $LinkedDatabase
  Bytes = (Get-Item -LiteralPath $LinkedDatabase).Length
  QuickCheck = "ok"
} | Format-List
