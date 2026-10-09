# KY PDKS Unified — one-command isolated acceptance, never a production deploy.
[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [Parameter(Mandatory=$true)][string]$StageDbPath,
  [Parameter(Mandatory=$true)][string]$StageCardNo
)
$ErrorActionPreference='Stop'
function Fail([string]$message){throw $message}
function Invoke-Gate([string]$label,[scriptblock]$script){
  Write-Output ('STEP='+$label)
  & $script
  if($LASTEXITCODE -ne 0){Fail ('GATE_FAILED '+$label+' EXIT='+$LASTEXITCODE)}
  Write-Output ('PASS='+$label)
}
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){Fail 'REPO_ROOT_REQUIRED'}
$stage=[IO.Path]::GetFullPath($StageDbPath)
if($stage -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$'){
  Fail 'COPY_STAGE_PATH_REQUIRED'
}
if(!(Test-Path -LiteralPath $stage -PathType Leaf)){Fail 'COPY_STAGE_FDB_MISSING'}
if($StageCardNo -notmatch '^[0-9]{5}$'){Fail 'FIVE_DIGIT_STAGE_CARD_REQUIRED'}
$live=$env:KY_PDKS_DB_PATH
if($live -and [string]::Equals([IO.Path]::GetFullPath($live),$stage,
    [StringComparison]::OrdinalIgnoreCase)){Fail 'STAGE_EQUALS_LIVE_PATH'}
$win=Join-Path $RepoRoot 'APP\pdks-unified\windows'
$project=Join-Path $win 'KyPdks.UnifiedHost.csproj'
$dll=Join-Path $win 'bin\Release\net8.0-windows\KY.PDKS.Unified.dll'
$cloud=Join-Path $RepoRoot 'APP\cloud\ky-erp-api'
$previous=@{}
foreach($name in @('KY_PDKS_UNIFIED_DLL','KY_PDKS_STAGE_FDB_PATH',
    'KY_PDKS_STAGE_CARD_NO','KY_PDKS_ISOLATED_COPY')){
  $previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
}
try {
  $env:KY_PDKS_UNIFIED_DLL=$dll
  $env:KY_PDKS_STAGE_FDB_PATH=$stage
  $env:KY_PDKS_STAGE_CARD_NO=$StageCardNo
  $env:KY_PDKS_ISOLATED_COPY='1'
  Write-Output ('HEAD='+(& git -C $RepoRoot rev-parse HEAD))
  Invoke-Gate 'WINDOWS_RELEASE' {& dotnet.exe build $project -c Release --nologo}
  if(!(Test-Path -LiteralPath $dll -PathType Leaf)){Fail 'WINDOWS_HOST_DLL_MISSING'}
  Invoke-Gate 'AGENT_SAFETY_5' {& dotnet.exe $dll --agent-safety-selftest}
  Invoke-Gate 'FIREBIRD_COPY_TRANSACTION_ROLLBACK' {
    & dotnet.exe $dll --isolated-firebird-copy-smoke
  }
  # Repeat against the SAME isolated copy to catch legacy trigger/key
  # allocation drift across independent agent processes.
  for($iteration=1;$iteration -le 3;$iteration++){
    Write-Output ('COPY_LEDGER_ITERATION='+$iteration)
    Invoke-Gate 'FIREBIRD_SVC_ASSIGN_ADVANCE_COMMIT_REPLAY_CLEANUP' {
      & dotnet.exe $dll --isolated-ledger-smoke
    }
  }
  Invoke-Gate 'LOCAL_QR_WINDOWS_DPAPI_INSTALL_TEST' {
    $installer=Join-Path $win 'tools\Install-KyPdks-LocalTerminal.ps1'
    if(!(Test-Path -LiteralPath $installer)){throw 'QR_INSTALLER_MISSING'}
    $tokens=$null;$parserErrors=$null
    $null=[System.Management.Automation.Language.Parser]::ParseFile(
      $installer,[ref]$tokens,[ref]$parserErrors)
    if(@($parserErrors).Count -gt 0){throw 'QR_INSTALLER_POWERSHELL_SYNTAX_INVALID'}
    $tempRoot=Join-Path $env:TEMP ('KY-PDKS-INSTALL-GATE-'+[guid]::NewGuid().ToString('N'))
    $previousLocal=$env:LOCALAPPDATA
    try {
      New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
      $env:LOCALAPPDATA=$tempRoot
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Install -TerminalId 'stage-terminal-01' -CompanyId 'stage-company-01'
      if($LASTEXITCODE -ne 0){throw 'QR_TEST_INSTALL_FAILED'}
      $app=Join-Path $tempRoot 'KYERP\KY-PDKS\LocalTerminals\stage-terminal-01'
      $draft=Get-Content -LiteralPath (Join-Path $app 'terminal.json') -Raw|ConvertFrom-Json
      if($draft.terminalId -ne 'stage-terminal-01' -or
         $draft.approvalState -ne 'DRAFT' -or
         (Get-ChildItem -LiteralPath $app -Filter '*.dpapi').Count -ne 2){
        throw 'QR_TEST_DPAPI_OR_DRAFT_INVALID'
      }
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Status -TerminalId 'stage-terminal-01'
      if($LASTEXITCODE -ne 0){throw 'QR_TEST_STATUS_FAILED'}
      $stagePort=0
      foreach($candidate in 5201..5205){
        $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$candidate)
        try{$listener.Start();$listener.Stop();$stagePort=$candidate;break}catch{}
      }
      if(!$stagePort){throw 'NO_ISOLATED_QR_TEST_LOOPBACK_PORT'}
      $receiptPath=Join-Path $app 'terminal-process.json'
      try{
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Start -TerminalId 'stage-terminal-01' -Port $stagePort -NoBrowser
        if($LASTEXITCODE -ne 0){throw 'QR_STAGE_SERVER_START_FAILED'}
        $health=Invoke-RestMethod -Method Get -Uri ('http://127.0.0.1:'+$stagePort+'/health') -TimeoutSec 2
        if($health.ok -ne $true -or $health.terminalId -ne 'stage-terminal-01' -or
          $health.productionSourceCertified -ne $false){
          throw 'QR_STAGE_SERVER_HEALTH_INCORRECT'
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Status -TerminalId 'stage-terminal-01'
        if($LASTEXITCODE -ne 0){throw 'QR_STAGE_SERVER_STATUS_FAILED'}
      }finally{
        if(Test-Path -LiteralPath $receiptPath){
          & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer -Action Stop -TerminalId 'stage-terminal-01'
          if($LASTEXITCODE -ne 0){throw 'QR_STAGE_SERVER_CLEAN_STOP_FAILED'}
        }
      }
    }finally {
      $env:LOCALAPPDATA=$previousLocal
      Remove-Item -LiteralPath $tempRoot -Force -Recurse -ErrorAction SilentlyContinue
    }
  }
  Push-Location $cloud
  try {
    Invoke-Gate 'CLOUD_CONTRACT_AND_SECURITY' {& npm.cmd run test:pdks-unified:cloud}
    Invoke-Gate 'CLOUD_TYPECHECK' {& npm.cmd run typecheck}
    Invoke-Gate 'SIGNED_CLOUD_WINDOWS_COPY_E2E' {& npm.cmd run test:pdks-unified:e2e}
  } finally {Pop-Location}
  $device=Join-Path $RepoRoot 'APP\pdks-unified'
  Invoke-Gate 'PHYSICAL_RULES_AND_PROTOCOL' {
    & node.exe --test (Join-Path $device 'core\attendanceRules.test.mjs') (Join-Path $device 'device-gateway\device-contract.test.mjs') (Join-Path $device 'device-gateway\tnf-reference-import.test.mjs') (Join-Path $device 'device-gateway\terminal-profiles.test.mjs') (Join-Path $device 'device-gateway\terminal-onboarding.test.mjs') (Join-Path $device 'sync\eventProtocol.test.mjs')
  }
  Write-Output 'RESULT=PASS_WINDOWS_CLOUD_COPY_FDB_E2E_NO_LIVE_WRITES'
} catch {
  Write-Error ('RESULT=FAIL '+$_.Exception.Message)
  exit 1
} finally {
  foreach($name in $previous.Keys){
    [Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')
  }
}
