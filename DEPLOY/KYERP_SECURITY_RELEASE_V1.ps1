$ErrorActionPreference = "Stop"

$FINAL = Join-Path $PSScriptRoot "KYERP_FINAL_ROUND_RELEASE_20260901_V3.ps1"

if (-not (Test-Path $FINAL)) {
    Write-Host "HATA: Final security release bulunamadi: $FINAL" -ForegroundColor Red
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

$pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $pwsh) { $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue }
if (-not $pwsh) {
    Write-Host "HATA: PowerShell 7 bulunamadi." -ForegroundColor Red
    Read-Host "Kapatmak icin ENTER"
    exit 1
}

Write-Host "KYERP_SECURITY_RELEASE_V1 eski compatibility girisidir." -ForegroundColor Yellow
Write-Host "Guvenlik icin canonical final zincire yonlendiriliyor: KYERP_FINAL_ROUND_RELEASE_20260901_V3.ps1" -ForegroundColor Cyan
& $pwsh.Source -NoProfile -ExecutionPolicy Bypass -File $FINAL
exit $LASTEXITCODE
