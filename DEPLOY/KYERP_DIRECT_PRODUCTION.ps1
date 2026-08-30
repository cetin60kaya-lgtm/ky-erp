$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "KYERP_DIRECT_PRODUCTION_V3.ps1"
if (-not (Test-Path $script)) {
    Write-Host "HATA: Production V3 deploy scripti bulunamadi: $script" -ForegroundColor Red
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
exit $LASTEXITCODE
