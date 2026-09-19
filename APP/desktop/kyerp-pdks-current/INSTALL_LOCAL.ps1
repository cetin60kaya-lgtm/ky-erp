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

$personelSource = Join-Path $root 'artifacts\Personel'
$bridgeSource = Join-Path $root 'artifacts\Bridge'
if (-not (Test-Path (Join-Path $personelSource 'HKN.Personel.Native.exe'))) { throw 'Personel publish ciktilari bulunamadi.' }
if (-not (Test-Path (Join-Path $bridgeSource 'HKN.Personel.Bridge.exe'))) { throw 'Bridge publish ciktilari bulunamadi.' }

if (Test-Path $InstallRoot) {
    $backup = $InstallRoot + '_ESKI_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
    Move-Item $InstallRoot $backup
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$bridgeRoot = Join-Path $InstallRoot 'Bridge'
New-Item -ItemType Directory -Force -Path $bridgeRoot | Out-Null
Copy-Item (Join-Path $personelSource '*') $InstallRoot -Recurse -Force
Copy-Item (Join-Path $bridgeSource '*') $bridgeRoot -Recurse -Force

$bridgeExe = Join-Path $bridgeRoot 'HKN.Personel.Bridge.exe'
$personelExe = Join-Path $InstallRoot 'HKN.Personel.Native.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'KYERP PDKS.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $bridgeExe
$link.WorkingDirectory = $InstallRoot
$link.IconLocation = $personelExe + ',0'
$link.Description = 'KYERP PDKS'
$link.Save()

Write-Host "KYERP PDKS kuruldu: $InstallRoot" -ForegroundColor Green
Write-Host "Ana masaustu kisayolu: $linkPath" -ForegroundColor Green
Write-Host 'Hedef mevcutsa entegre mod; Hedef yoksa Personel uygulamasi tek basina acilir.' -ForegroundColor Green
