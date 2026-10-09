# KY PDKS — local QR/USB journal vs annual TNF read-only diagnostics.
# This command never updates production Firebird, terminals, TNF or Cloud.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]{3,64}$')]
  [string]$TerminalId,
  [Parameter(Mandatory=$true)][string]$TnfPath,
  [ValidateRange(2000,2099)][int]$Year=2026,
  [string]$ReportPath=''
)
$ErrorActionPreference='Stop'
if(!$env:LOCALAPPDATA){throw 'USER_LOCALAPPDATA_REQUIRED'}
$root=Join-Path $env:LOCALAPPDATA ('KYERP\KY-PDKS\LocalTerminals\'+$TerminalId)
$config=Join-Path $root 'terminal.json'
if(!(Test-Path -LiteralPath $config -PathType Leaf)){throw 'LOCAL_TERMINAL_INSTALL_REQUIRED'}
$device=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
if($device.terminalId -cne $TerminalId -or
   $device.connectorId -cne 'KY_QR_LOCAL' -or
   $device.companyId -cnotmatch '^[A-Za-z0-9._:-]{3,100}$'){
  throw 'LOCAL_TERMINAL_IDENTITY_INVALID'
}
$journal=Join-Path $root 'journal'
$tnf=[IO.Path]::GetFullPath($TnfPath)
if(!(Test-Path -LiteralPath $tnf -PathType Leaf)){throw 'TNF_REFERENCE_FILE_REQUIRED'}
$cli=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\device-gateway\terminal-reconciliation-cli.mjs'))
if(!(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'TERMINAL_RECONCILIATION_CLI_MISSING'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$arguments=@($cli,'--company',$device.companyId,'--terminal',$TerminalId,
  '--journal',$journal,'--tnf',$tnf,'--year',[string]$Year)
if($ReportPath){
  $out=[IO.Path]::GetFullPath($ReportPath)
  $folder=Split-Path -Parent $out
  if(!(Test-Path -LiteralPath $folder -PathType Container)){throw 'REPORT_DIRECTORY_REQUIRED'}
  if(Test-Path -LiteralPath $out){throw 'REPORT_ALREADY_EXISTS_NO_OVERWRITE'}
  $arguments+=@('--report',$out)
}
$operatorFile=Join-Path $root 'qr-operator.dpapi'
if(!(Test-Path -LiteralPath $operatorFile -PathType Leaf)){throw 'LOCAL_OPERATOR_DPAPI_KEY_REQUIRED'}
# Decrypt only for the child process, restore the caller environment at exit.
$previousKey=$env:KY_PDKS_TERMINAL_JOURNAL_KEY
try {
  $secure=Get-Content -LiteralPath $operatorFile -Raw|ConvertTo-SecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{$env:KY_PDKS_TERMINAL_JOURNAL_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  & $node @arguments
  if($LASTEXITCODE -ne 0){throw ('TERMINAL_EVIDENCE_DIAGNOSTIC_FAILED EXIT='+$LASTEXITCODE)}
} finally {
  $env:KY_PDKS_TERMINAL_JOURNAL_KEY=$previousKey
}
Write-Output 'RESULT=PASS_LOCAL_TERMINAL_TNF_REFERENCE_PREVIEW_ONLY'
Write-Output 'LIVE_FDB_OR_TERMINAL_OR_TNF_WRITTEN=false'
