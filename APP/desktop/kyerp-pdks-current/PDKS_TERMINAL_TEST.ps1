$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = [Environment]::GetEnvironmentVariable('KYERP_PDKS_ROOT','User')
if ([string]::IsNullOrWhiteSpace($workspace)) { $workspace = 'D:\Googledrive\KYERP-PDKS-MASAUSTU' }
$ip = if ($env:KY_PDKS_TERMINAL_IP) { $env:KY_PDKS_TERMINAL_IP } else { '192.168.1.224' }
$port = if ($env:KY_PDKS_TERMINAL_PORT) { $env:KY_PDKS_TERMINAL_PORT } else { '5005' }
$machine = if ($env:KY_PDKS_TERMINAL_MACHINE) { $env:KY_PDKS_TERMINAL_MACHINE } else { '1' }
$password = if ($env:KY_PDKS_TERMINAL_PASSWORD) { $env:KY_PDKS_TERMINAL_PASSWORD } else { '0' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $workspace ("08_TEST\TERMINAL_DEVICE\" + $stamp)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Write-Host 'KY PDKS - GERCEK TERMINAL TESTI' -ForegroundColor Cyan
Write-Host ("Cihaz: {0}:{1} | Makine: {2} | FP_CLOCK" -f $ip,$port,$machine)
Write-Host 'Bu test cihaza veri YAZMAZ ve kayit SILMEZ.' -ForegroundColor Yellow
$supportCandidates = @(
    'D:\Hedef500\Hedef500\Terminal Bilgi Aktar\support',
    'C:\Hedef500\Terminal Bilgi Aktar\support'
)
$sdk = $supportCandidates | Where-Object { Test-Path (Join-Path $_ 'FP_CLOCK.ocx') } | Select-Object -First 1
if (-not $sdk) { throw 'FP_CLOCK support klasoru bulunamadi.' }
$env:KY_PDKS_TERMINAL_SDK = $sdk
$bridge = Get-ChildItem 'D:\KYERP\PDKS\BUILD\DENETIM' -Recurse -File -Filter 'KYERP.TerminalBridge.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $bridge) {
    $bridge = Get-ChildItem $projectRoot -Recurse -File -Filter 'KYERP.TerminalBridge.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $bridge) { throw 'KYERP.TerminalBridge.exe bulunamadi.' }
Write-Host ('BRIDGE=' + $bridge.FullName)
Write-Host ('SDK=' + $sdk)
$status = & $bridge.FullName status $ip $port $machine $password 2>&1
$status | Set-Content -LiteralPath (Join-Path $outDir 'STATUS.txt') -Encoding UTF8
$status | ForEach-Object { Write-Host $_ }
if (-not ($status -match '^STATUS\|OK\|')) { throw 'Terminal STATUS testi basarisiz.' }
$read = & $bridge.FullName read $ip $port $machine $password 2>&1
$read | Set-Content -LiteralPath (Join-Path $outDir 'READ.txt') -Encoding UTF8
$read | ForEach-Object { Write-Host $_ }
if (-not ($read -match '^STATUS\|OK\|')) { throw 'Terminal READ testi basarisiz.' }
$fpHash = (Get-FileHash (Join-Path $sdk 'FP_CLOCK.ocx') -Algorithm SHA256).Hash
$tmpHash = (Get-FileHash (Join-Path $sdk 'TMPCCOMM.dll') -Algorithm SHA256).Hash
$summary = @(
    'RESULT=PASS', "IP=$ip", "PORT=$port", "MACHINE=$machine",
    'WRITE_TO_DEVICE=DISABLED', 'DELETE_FROM_DEVICE=DISABLED',
    "FP_CLOCK_SHA256=$fpHash", "TMPCCOMM_SHA256=$tmpHash",
    ('COMPLETED=' + (Get-Date).ToString('s'))
)
$summary | Set-Content -LiteralPath (Join-Path $outDir 'RESULT.txt') -Encoding UTF8
$latestRoot = Join-Path $workspace '08_TEST\TERMINAL_DEVICE'
New-Item -ItemType Directory -Force -Path $latestRoot | Out-Null
Set-Content -LiteralPath (Join-Path $latestRoot 'LATEST.txt') -Value $outDir -Encoding UTF8
Write-Host ('KANIT=' + $outDir) -ForegroundColor Green
Write-Host 'TERMINAL_DEVICE_TEST_PASS' -ForegroundColor Green
