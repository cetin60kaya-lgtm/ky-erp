param(
  [string]$DriveRuntime = 'D:\GoogleDrive\Hedef500',
  [string]$TargetRuntime = "$PSScriptRoot\.runtime\Hedef500",
  [switch]$IncludePrivateRuntime
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $DriveRuntime)) {
  throw "Runtime kaynagi bulunamadi: $DriveRuntime"
}

New-Item -ItemType Directory -Force -Path $TargetRuntime | Out-Null

$publicItems = @(
  'Hedef.exe',
  'Library',
  'Report',
  'Terminal Bilgi Aktar',
  'donemolustur.exe'
)

foreach ($item in $publicItems) {
  $src = Join-Path $DriveRuntime $item
  if (!(Test-Path $src)) { continue }
  $dst = Join-Path $TargetRuntime $item
  if (Test-Path $src -PathType Container) {
    robocopy $src $dst /E /PURGE /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Kopyalama hatasi: $item" }
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

if ($IncludePrivateRuntime) {
  foreach ($item in @('Hedef.Lic','HKN_MASTER.ini','Data')) {
    $src = Join-Path $DriveRuntime $item
    if (!(Test-Path $src)) { continue }
    $dst = Join-Path $TargetRuntime $item
    if (Test-Path $src -PathType Container) {
      robocopy $src $dst /E /PURGE /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Kopyalama hatasi: $item" }
    } else {
      Copy-Item -LiteralPath $src -Destination $dst -Force
    }
  }
}

Write-Host "KYERP PDKS runtime hazir: $TargetRuntime" -ForegroundColor Green
Write-Host 'Kaynak build icin: .\BUILD.ps1' -ForegroundColor Cyan
