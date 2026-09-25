param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'KYERP\PDKS'),
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SkipBuild) {
    & (Join-Path $root 'BUILD.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'PDKS build basarisiz.' }
}

$appSource = Join-Path $root 'artifacts\Personel'
$appExe = Join-Path $appSource 'KYERP.PDKS.exe'
if (-not (Test-Path $appExe)) { throw 'KYERP.PDKS.exe publish ciktilari bulunamadi.' }

if (Test-Path $InstallRoot) {
    $backup = $InstallRoot + '_ESKI_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
    Move-Item $InstallRoot $backup
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item (Join-Path $appSource '*') $InstallRoot -Recurse -Force

$installedExe = Join-Path $InstallRoot 'KYERP.PDKS.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'KYERP PDKS.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $installedExe
$link.WorkingDirectory = $InstallRoot
$link.IconLocation = $installedExe + ',0'
$link.Description = 'KYERP PDKS'
$link.Save()

Write-Host "KYERP PDKS kuruldu: $InstallRoot" -ForegroundColor Green
Write-Host "Masaustu kisayolu: $linkPath" -ForegroundColor Green
Write-Host 'Tek uygulama: Bridge/Hedef overlay kullanilmaz.' -ForegroundColor Green
