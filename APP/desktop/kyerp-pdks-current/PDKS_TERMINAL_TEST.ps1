$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host 'KY PDKS - GERCEK TERMINAL TESTI' -ForegroundColor Cyan
Write-Host 'Cihaz: 192.168.1.224 | ANA FP_CLOCK: 5005 | Native fallback: 5001'
Write-Host 'Bu test cihaza veri YAZMAZ ve kayit SILMEZ.' -ForegroundColor Yellow

$bridge = Get-ChildItem -LiteralPath $projectRoot -Recurse -Filter 'KYERP.TerminalBridge.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $bridge) { throw 'KYERP.TerminalBridge.exe bulunamadi.' }
$env:KY_PDKS_TERMINAL_BRIDGE = $bridge.FullName
Write-Host ('BRIDGE=' + $bridge.FullName)

$project = '.\tools\TerminalNativeAudit\TerminalNativeAudit.csproj'
if (-not (Test-Path -LiteralPath $project)) {
    throw "TerminalNativeAudit bulunamadi: $project"
}

dotnet run --project $project -c Release
if ($LASTEXITCODE -ne 0) {
    throw "Gercek terminal testi BASARISIZ. ExitCode=$LASTEXITCODE"
}
$workspace = [Environment]::GetEnvironmentVariable('KYERP_PDKS_ROOT','User')
if ([string]::IsNullOrWhiteSpace($workspace)) { $workspace = 'D:\Googledrive\KYERP-PDKS-MASAUSTU' }
$latest = Join-Path $workspace '08_TEST\TERMINAL_NATIVE\LATEST.txt'
if (Test-Path -LiteralPath $latest) {
    Write-Host ('KANIT=' + (Get-Content -LiteralPath $latest -Raw).Trim()) -ForegroundColor Green
}
Write-Host 'TERMINAL_STATUS_TEST_PASS' -ForegroundColor Green
