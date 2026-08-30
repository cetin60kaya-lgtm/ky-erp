$ErrorActionPreference = "Stop"

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

# Windows production deploy standardi Node 22 LTS'tir.
# Node 24 Windows'ta Wrangler/D1 islemi basarili olduktan sonra process exit
# sirasinda UV_HANDLE_CLOSING assertion ile sahte exit-code 1 uretebiliyor.
if ($IsWindows -and $nodeVersion.Major -ne 22) {
    Stop-Deploy "Windows production deploy icin Node.js 22 LTS gerekiyor. Mevcut surum: $nodeText"
}

$script = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
if (-not (Test-Path $script)) {
    Stop-Deploy "Production V3 deploy scripti bulunamadi: $script"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
exit $LASTEXITCODE
