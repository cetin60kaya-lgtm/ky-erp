# KY PDKS Studio: repeatable 49-tab UI acceptance on 127.0.0.1 ONLY.
# Creates no personnel, terminal, TNF, Firebird or Cloudflare records.
[CmdletBinding()]
param([string]$RepoRoot='', [string]$Screenshot='')
$ErrorActionPreference='Stop'
function Fail([string]$reason){throw $reason}
function Gate([string]$name,[scriptblock]$task){
  Write-Output ('STEP='+$name)
  & $task
  if($LASTEXITCODE -ne 0){Fail ('UI_GATE_FAILED '+$name+' EXIT='+$LASTEXITCODE)}
  Write-Output ('PASS='+$name)
}
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){Fail 'REPO_REQUIRED'}
$frontend=Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$vite=Join-Path $frontend 'node_modules\vite\bin\vite.js'
$browserSmoke=Join-Path $frontend 'tools\verifyPdksUnifiedBrowser.mjs'
if(!(Test-Path -LiteralPath $vite)){Fail 'FRONTEND_DEPENDENCIES_REQUIRED_RUN_NPM_CI'}
if(!(Test-Path -LiteralPath $browserSmoke)){Fail 'BROWSER_TEST_REQUIRED'}
$chrome=$env:CHROME_PATH
if(!$chrome){$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'}
if(!(Test-Path -LiteralPath $chrome)){Fail 'CHROME_HEADLESS_REQUIRED'}
$port=0
foreach($candidate in 5186..5196){
  $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$candidate)
  try{$listener.Start();$listener.Stop();$port=$candidate;break}catch{}
}
if(!$port){Fail 'NO_FREE_LOOPBACK_TEST_PORT_5186_TO_5196'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$logRoot=Join-Path $env:TEMP ('KY_PDKS_UI_ACCEPT_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$server=$null
$previousChrome=$env:CHROME_PATH
$previousPort=$env:KY_PDKS_BROWSER_PORT
try {
  Push-Location $frontend
  try {
    # Only this PDKS product's tests belong to its acceptance gate.
    # Whole-ERP tests are tracked separately: unrelated security PWA
    # assertions can fail without the PDKS preview being defective.
    $unitRoot=Join-Path $frontend 'src\pages\pdksUnified'
    $specs=@(Get-ChildItem -LiteralPath $unitRoot -Filter '*.test.js' -File |
      Sort-Object FullName | ForEach-Object {$_.FullName})
    if(!$specs.Count){Fail 'PDKS_UI_TEST_FILES_MISSING'}
    Write-Output ('PDKS_UI_SPEC_FILES='+$specs.Count)
    Gate 'PDKS_UI_UNIT' {& node.exe --test @specs}
    $eslint=Join-Path $frontend 'node_modules\.bin\eslint.cmd'
    if(!(Test-Path -LiteralPath $eslint)){Fail 'ESLINT_LOCAL_BINARY_REQUIRED'}
    Gate 'PDKS_UI_LINT' {& $eslint 'src/pages/pdksUnified' '--max-warnings=0'}
    # Some bundlers emit nonfatal chunk/dynamic-import warnings on STDERR.
    # PowerShell 5 with ErrorActionPreference=Stop otherwise treats them as
    # NativeCommandError even when npm exits 0. CMD merges its own streams;
    # Gate still checks the actual process exit code strictly.
    Gate 'ERP_FRONTEND_BUILD' {& cmd.exe /d /c 'npm.cmd run build 2>&1'}
    Write-Output 'STEP=UI_LOCAL_BROWSER_START'
    $server=Start-Process -FilePath $node -WorkingDirectory $frontend -PassThru -ArgumentList @($vite,'--host','127.0.0.1','--port',[string]$port,'--strictPort') -RedirectStandardOutput (Join-Path $logRoot 'vite.out.log') -RedirectStandardError (Join-Path $logRoot 'vite.err.log')
    $ready=$false
    $deadline=(Get-Date).AddSeconds(30)
    while((Get-Date) -lt $deadline){
      if($server.HasExited){Fail 'VITE_PREVIEW_EXITED'}
      try{
        $req=Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:'+ $port +'/pdks-studio') -TimeoutSec 2
        if($req.StatusCode -eq 200 -and $req.Content -match 'id="root"'){$ready=$true;break}
      }catch{}
      Start-Sleep -Milliseconds 350
    }
    if(!$ready){Fail 'VITE_LOCAL_PREVIEW_NOT_READY'}
    $env:CHROME_PATH=$chrome
    $env:KY_PDKS_BROWSER_PORT=[string]$port
    Write-Output ('UI_TEST_LOOPBACK_PORT='+$port)
    if($Screenshot){
      $shot=[IO.Path]::GetFullPath($Screenshot)
      if(!(Test-Path -LiteralPath (Split-Path -Parent $shot))){Fail 'SCREENSHOT_PARENT_NOT_FOUND'}
      Gate 'CHROME_49_TABS_OPERATIONS_DARK_MODE' {& node.exe $browserSmoke $shot}
    } else {
      Gate 'CHROME_49_TABS_OPERATIONS_DARK_MODE' {& node.exe $browserSmoke}
    }
    Write-Output 'RESULT=PASS_49_TAB_STUDIO_PREVIEW_NO_LIVE_WRITE'
  } finally {Pop-Location}
} catch {
  Write-Error ('RESULT=FAIL '+$_.Exception.Message)
  exit 1
} finally {
  if($server -and !$server.HasExited){
    try{Stop-Process -Id $server.Id -Force -ErrorAction Stop}catch{}
  }
  $env:CHROME_PATH=$previousChrome
  $env:KY_PDKS_BROWSER_PORT=$previousPort
  try{Remove-Item -LiteralPath $logRoot -Recurse -Force -ErrorAction SilentlyContinue}catch{}
}
