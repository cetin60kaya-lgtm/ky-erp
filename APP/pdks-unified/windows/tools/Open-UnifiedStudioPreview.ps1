# KY PDKS: open 49-tab safe design preview in the default Windows browser.
# Does NOT run live Agent or access the live FDB, TNF, terminal or Cloud write API.
[CmdletBinding()]
param([string]$RepoRoot='')
$ErrorActionPreference='Stop'
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){throw 'TEST_REPO_REQUIRED'}
$frontend=Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$vite=Join-Path $frontend 'node_modules\vite\bin\vite.js'
if(!(Test-Path -LiteralPath $vite)){throw 'VITE_DEPENDENCIES_MISSING_RUN_NPM_CI'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$port=0
foreach($candidate in 5186..5196){
  $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$candidate)
  try{$listener.Start();$listener.Stop();$port=$candidate;break}catch{}
}
if(!$port){throw 'ALL_LOCAL_PDKS_PREVIEW_PORTS_BUSY'}
$logs=Join-Path $env:TEMP ('KY-PDKS-STUDIO-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$server=$null
try{
  $server=Start-Process -FilePath $node -PassThru -WorkingDirectory $frontend -ArgumentList @($vite,'--host','127.0.0.1','--port',[string]$port,'--strictPort') -RedirectStandardOutput (Join-Path $logs 'vite.stdout.log') -RedirectStandardError (Join-Path $logs 'vite.stderr.log')
  $url='http://127.0.0.1:'+$port+'/pdks-studio'
  $ready=$false
  $deadline=(Get-Date).AddSeconds(25)
  while((Get-Date) -lt $deadline){
    if($server.HasExited){throw 'PDKS_STUDIO_SERVER_EXITED'}
    try{
      $response=Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2
      if($response.StatusCode -eq 200 -and $response.Content -match 'id="root"'){
        $ready=$true;break
      }
    }catch{}
    Start-Sleep -Milliseconds 400
  }
  if(!$ready){throw 'PDKS_STUDIO_NOT_READY'}
  Start-Process $url
  Write-Output ('PDKS_STUDIO_TEST_URL='+$url)
  Write-Output ('PDKS_STUDIO_TEST_PID='+$server.Id)
  Write-Output ('PDKS_STUDIO_LOG_DIR='+$logs)
  Write-Output 'RESULT=PDKS_STUDIO_PREVIEW_READY_NO_LIVE_WRITES'
}catch{
  if($server -and !$server.HasExited){
    try{Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue}catch{}
  }
  throw
}
