# KY PDKS Unified — preview-only one-click launcher.
# Starts a loopback-only Vite design server and then opens the native WebView2
# host with --dev-preview. It never touches the live KY PDKS executable or DB.
param(
    [Parameter(Mandatory=$true)][string]$FrontendPath,
    [Parameter(Mandatory=$true)][string]$HostExe,
    [int]$Port = 5186
)
$ErrorActionPreference = 'Stop'
if ($Port -ne 5186) { throw 'KY PDKS visual preview uses fixed local port 5186.' }
$frontend = (Resolve-Path -LiteralPath $FrontendPath).Path
$exe = (Resolve-Path -LiteralPath $HostExe).Path
$vite = Join-Path $frontend 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Vite missing in isolated test checkout. Run npm ci inside frontend.' }

$localUrl = 'http://127.0.0.1:5186/pdks-studio'
function Test-KyPdksStudio {
    try {
        $response = Invoke-WebRequest -UseBasicParsing $localUrl -TimeoutSec 2
        return ($response.StatusCode -eq 200 -and $response.Content -like '*id="root"*')
    } catch { return $false }
}
if (-not (Test-KyPdksStudio)) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $logDir = Join-Path $env:TEMP 'KYERP-PDKS-UNIFIED-STUDIO'
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null
    Start-Process -FilePath $node -WorkingDirectory $frontend `
        -ArgumentList @($vite, '--host','127.0.0.1','--port','5186','--strictPort') `
        -RedirectStandardOutput (Join-Path $logDir 'vite.stdout.log') `
        -RedirectStandardError (Join-Path $logDir 'vite.stderr.log') | Out-Null
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline -and -not (Test-KyPdksStudio)) {
        Start-Sleep -Milliseconds 600
    }
}
if (-not (Test-KyPdksStudio)) { throw 'The local design server is not responding. Nothing was changed.' }
Start-Process -FilePath $exe -ArgumentList '--dev-preview' -WorkingDirectory (Split-Path $exe) | Out-Null
