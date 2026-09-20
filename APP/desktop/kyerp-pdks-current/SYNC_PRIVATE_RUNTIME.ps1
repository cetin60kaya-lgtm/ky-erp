param(
    [string]$Source = 'D:\GoogleDrive\Hakan Emp\KYERP-PDKS\PRIVATE_RUNTIME\Hedef500_2026-09-20',
    [string]$Target = (Join-Path $PSScriptRoot 'private-runtime\Hedef500')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Source)) {
    throw "Private runtime bulunamadı: $Source"
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null

robocopy $Source $Target /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) {
    throw "Robocopy hata kodu: $LASTEXITCODE"
}

$required = @(
    'Hedef.exe',
    'Data',
    'Library',
    'Report',
    'Temp',
    'Terminal Bilgi Aktar',
    'Yedek'
)

foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $Target $item))) {
        throw "Eksik runtime öğesi: $item"
    }
}

$timeFile = Join-Path $Target 'Terminal Bilgi Aktar\timerecords.txt'
if (-not (Test-Path $timeFile)) {
    New-Item -ItemType File -Force -Path $timeFile | Out-Null
}

Write-Host "Private runtime senkronlandı: $Target"
Write-Host "Temp ve timerecords.txt korunmuştur."
