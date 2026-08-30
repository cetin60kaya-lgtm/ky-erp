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

# Windows + Node 24'ün eski minor sürümlerinde libuv UV_HANDLE_CLOSING
# assertion hatasi Wrangler islemi basarili olduktan sonra process exit sirasinda
# sahte exit-code 1 uretebiliyor. 24.20.0 ve sonrasi bu Windows assertion
# duzeltmesini icerir. Node 22 LTS ve daha yeni duzeltilmis surumler engellenmez.
if ($nodeVersion.Major -eq 24 -and $nodeVersion -lt [Version]"24.20.0") {
    Stop-Deploy "Node.js $nodeText Windows/libuv cikis hatasindan etkileniyor. Node.js LTS 24.20.0 veya daha yeni surume guncelleyin; sonra deploy'u tekrar calistirin."
}

$script = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
if (-not (Test-Path $script)) {
    Stop-Deploy "Production V3 deploy scripti bulunamadi: $script"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
exit $LASTEXITCODE
