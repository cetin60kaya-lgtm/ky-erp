$ErrorActionPreference = "Stop"

# KY ERP canonical production entrypoint.
# Tek kullanici uygulama adresi: https://kyerp.net/
# Backend servis origin'i: https://api.kyerp.net
# V5 tek-domain Cloudflare/Pages orkestrasyonudur.
# V3 korumali Worker/D1/frontend motoru V5 tarafindan runtime template olarak kullanilir:
# KYERP_DIRECT_PRODUCTION_V3.ps1

function Stop-Deploy($message) {
    Write-Host ""
    Write-Host "HATA: $message" -ForegroundColor Red
    Write-Host ""
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { Stop-Deploy "Node.js bulunamadi." }

try {
    $nodeText = (& node --version).Trim().TrimStart('v')
    $nodeVersion = [Version]$nodeText
} catch {
    Stop-Deploy "Node.js surumu okunamadi."
}

$isWindowsHost = $env:OS -eq "Windows_NT"
if ($isWindowsHost -and $nodeVersion.Major -ne 22) {
    Stop-Deploy "Windows production deploy icin Node.js 22 LTS gerekiyor. Mevcut surum: $nodeText"
}

$script = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V5.ps1"
if (-not (Test-Path $script)) {
    Stop-Deploy "Production V5 tek-adres deploy scripti bulunamadi: $script"
}

if ($isWindowsHost) {
    $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
    if (-not $pwsh) {
        Stop-Deploy "PowerShell 7 bulunamadi. Son KY ERP BAT dosyasini calistirarak PowerShell 7 kurulumunu tamamlayin."
    }
    & $pwsh.Source -NoProfile -ExecutionPolicy Bypass -File $script
} else {
    & pwsh -NoProfile -File $script
}
exit $LASTEXITCODE
