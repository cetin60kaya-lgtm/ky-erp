param(
  [string]$DriveRoot = 'D:\GoogleDrive\KYERP-MERKEZ',
  [switch]$OpenVsCode
)

$ErrorActionPreference = 'Stop'
$pdks = $PSScriptRoot
$repo = Resolve-Path (Join-Path $pdks '..\..\..')
$branch = (git -C $repo branch --show-current).Trim()
if (!$branch) { throw 'Aktif Git branch bulunamadi.' }

$dirty = git -C $repo status --porcelain
if ($dirty) { throw 'Calisma alani temiz degil. DEV_SYNC mevcut degisiklikleri ezmez.' }

Write-Host "KYERP PDKS sync: $branch" -ForegroundColor Cyan
git -C $repo fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'git fetch basarisiz.' }
git -C $repo pull --ff-only origin $branch
if ($LASTEXITCODE -ne 0) { throw 'git pull basarisiz.' }

$legacy = Join-Path $DriveRoot '03_REFERANS\HEDEF_LEGACY\Hedef500\Hedef500'
if (Test-Path $legacy) {
  & (Join-Path $pdks 'BOOTSTRAP_LOCAL.ps1') -DriveRuntime $legacy
}

& (Join-Path $pdks 'BUILD.ps1')
if ($LASTEXITCODE -ne 0) { throw 'PDKS build basarisiz.' }

$runtime = Join-Path $DriveRoot '01_RUNTIME\KYERP-PDKS\current'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
robocopy (Join-Path $pdks 'artifacts') $runtime /E /PURGE /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'Drive runtime kopyasi basarisiz.' }

$sha = (git -C $repo rev-parse HEAD).Trim()
@(
  'KYERP PDKS current runtime',
  "branch=$branch",
  "commit=$sha",
  "built=$(Get-Date -Format o)",
  "source=$repo",
  "pdks=$pdks",
  "legacy_runtime=$legacy"
) | Set-Content (Join-Path $runtime 'BUILD-INFO.txt') -Encoding UTF8

if ($OpenVsCode) {
  $workspace = Join-Path $repo 'KYERP.code-workspace'
  Start-Process code -ArgumentList '-n', $workspace
}

Write-Host "KYERP PDKS hazir: $sha" -ForegroundColor Green
Write-Host "Drive runtime: $runtime" -ForegroundColor Green
