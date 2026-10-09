# KY PDKS: complete isolated Windows + Cloud + Firebird-copy + 49-tab UI gate.
# Does not deploy or write any production database, terminal RAW or annual TNF.
[CmdletBinding()]
param(
  [string]$RepoRoot='',
  [Parameter(Mandatory=$true)][string]$StageDbPath,
  [Parameter(Mandatory=$true)][string]$StageCardNo,
  [string]$Screenshot=''
)
$ErrorActionPreference='Stop'
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
$copy=Join-Path $PSScriptRoot 'Test-UnifiedCopyAcceptance.ps1'
$ui=Join-Path $PSScriptRoot 'Test-UnifiedUiAcceptance.ps1'
if(!(Test-Path -LiteralPath $copy) -or !(Test-Path -LiteralPath $ui)){throw 'PDKS_ACCEPTANCE_SCRIPTS_REQUIRED'}
$ps=(Get-Process -Id $PID).Path
if(!(Test-Path -LiteralPath $ps) -or !($ps -match '(?i)powershell|pwsh')){throw 'POWERSHELL_PROCESS_REQUIRED'}
$copyArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$copy,'-RepoRoot',$RepoRoot,'-StageDbPath',$StageDbPath,'-StageCardNo',$StageCardNo)
$uiArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$ui,'-RepoRoot',$RepoRoot)
if($Screenshot){$uiArguments+=@('-Screenshot',$Screenshot)}
Write-Output 'PHASE=WINDOWS_CLOUD_FIREBIRD_COPY'
& $ps @copyArguments
if($LASTEXITCODE -ne 0){Write-Output 'RESULT=FAIL_COPY_ACCEPTANCE';exit 1}
Write-Output 'PHASE=49_TAB_UI_PREVIEW'
& $ps @uiArguments
if($LASTEXITCODE -ne 0){Write-Output 'RESULT=FAIL_UI_ACCEPTANCE';exit 1}
Write-Output 'RESULT=PASS_COMPLETE_ISOLATED_PDKS_PREVIEW_AND_SYNC_ACCEPTANCE'
