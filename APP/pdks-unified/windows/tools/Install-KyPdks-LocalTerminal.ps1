# KY PDKS: per-user local QR/USB terminal setup; no service or production writes.
[CmdletBinding()]
param(
  [ValidateSet('Install','Start','Stop','Status','ShowOperatorKey')][string]$Action='Status',
  [Parameter(Mandatory=$true)][string]$TerminalId,
  [string]$CompanyId='',
  [ValidateRange(5197,5205)][int]$Port=5197
)
$ErrorActionPreference='Stop'
if($TerminalId -cnotmatch '^[A-Za-z0-9._-]{3,64}$'){throw 'TERMINAL_ID_INVALID'}
if(!$env:LOCALAPPDATA){throw 'USER_LOCALAPPDATA_REQUIRED'}
$root=Join-Path $env:LOCALAPPDATA ('KYERP\KY-PDKS\LocalTerminals\'+$TerminalId)
$config=Join-Path $root 'terminal.json'
$signFile=Join-Path $root 'qr-sign.dpapi'
$operatorFile=Join-Path $root 'qr-operator.dpapi'
$pidFile=Join-Path $root 'terminal-process.json'
$journal=Join-Path $root 'journal'
$cli=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\device-gateway\terminal-cli.mjs'))
if(!(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'KY_TERMINAL_CLI_NOT_FOUND'}
function NewSecret {
  $bytes=New-Object byte[] 48
  $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
  try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
function ProtectSecret([string]$plain,[string]$destination){
  $secure=ConvertTo-SecureString $plain -AsPlainText -Force
  $dpapi=ConvertFrom-SecureString -SecureString $secure
  [IO.File]::WriteAllText($destination,$dpapi,[Text.UTF8Encoding]::new($false))
}
function UnprotectSecret([string]$destination) {
  $secure=Get-Content -LiteralPath $destination -Raw|ConvertTo-SecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}
  finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
function ValidProfile {
  if(!(Test-Path -LiteralPath $config -PathType Leaf)){throw 'INSTALL_QR_TERMINAL_FIRST'}
  $item=Get-Content -LiteralPath $config -Raw|ConvertFrom-Json
  if($item.terminalId -cne $TerminalId -or $item.connectorId -cne 'KY_QR_LOCAL'){
    throw 'LOCAL_TERMINAL_PROFILE_IDENTITY_MISMATCH'
  }
  return $item
}
function Ready([int]$value){
  try{
    $r=Invoke-RestMethod -Method Get -Uri ('http://127.0.0.1:'+$value+'/health') -TimeoutSec 2
    return $r.ok -eq $true -and $r.terminalId -eq $TerminalId
  }catch{return $false}
}
switch($Action){
  Install {
    if($CompanyId -cnotmatch '^[A-Za-z0-9._:-]{3,100}$'){throw 'REAL_COMPANY_ID_REQUIRED'}
    if(Test-Path -LiteralPath $config){throw 'LOCAL_TERMINAL_ALREADY_INSTALLED'}
    New-Item -ItemType Directory -Force -Path $root,$journal | Out-Null
    $profile=[ordered]@{schemaVersion=1;terminalId=$TerminalId;companyId=$CompanyId;
      vendor='KY';model='KY Local Signed QR + USB HID';connectorId='KY_QR_LOCAL';
      timezone='Europe/Istanbul';inputMethods=@('QR_SIGNED','BARCODE_WEDGE');
      directionMode='EXPLICIT_IN_OUT';approvalState='DRAFT'}
    ProtectSecret (NewSecret) $signFile
    ProtectSecret (NewSecret) $operatorFile
    [IO.File]::WriteAllText($config,($profile|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    Write-Output 'RESULT=LOCAL_QR_USB_TERMINAL_INSTALLED_DRAFT'
    Write-Output 'SECRETS=ENCRYPTED_WITH_WINDOWS_CURRENT_USER_DPAPI'
    Write-Output 'NO_FDB_TNF_CLOUD_WRITES=true'
    Write-Output 'NEXT=ShowOperatorKey then Start (explicit actions)'
  }
  ShowOperatorKey {
    $null=ValidProfile
    Write-Warning 'View only on a private local screen; do not copy the key to a chat or log.'
    if((Read-Host 'Type YES to show the local kiosk operator key') -cne 'YES'){
      throw 'KEY_DISPLAY_CANCELLED'
    }
    Write-Host ('OPERATOR_KEY='+(UnprotectSecret $operatorFile))
  }
  Start {
    $null=ValidProfile
    if(Test-Path -LiteralPath $pidFile){throw 'TERMINAL_START_RECEIPT_EXISTS_CHECK_STATUS'}
    $node=(Get-Command node.exe -ErrorAction Stop).Source
    $variables=@('KY_PDKS_TERMINAL_ENABLE','KY_PDKS_TERMINAL_CONFIG',
      'KY_PDKS_TERMINAL_JOURNAL','KY_PDKS_TERMINAL_PORT',
      'KY_PDKS_QR_HMAC_SECRET','KY_PDKS_TERMINAL_OPERATOR_KEY')
    $original=@{}
    foreach($k in $variables){$original[$k]=[Environment]::GetEnvironmentVariable($k,'Process')}
    try{
      $env:KY_PDKS_TERMINAL_ENABLE='1'
      $env:KY_PDKS_TERMINAL_CONFIG=$config
      $env:KY_PDKS_TERMINAL_JOURNAL=$journal
      $env:KY_PDKS_TERMINAL_PORT=[string]$Port
      $env:KY_PDKS_QR_HMAC_SECRET=UnprotectSecret $signFile
      $env:KY_PDKS_TERMINAL_OPERATOR_KEY=UnprotectSecret $operatorFile
      $process=Start-Process -FilePath $node -PassThru -WorkingDirectory (Split-Path $cli -Parent) -ArgumentList @('"'+$cli+'"','--serve') -RedirectStandardOutput (Join-Path $root 'kiosk.out.log') -RedirectStandardError (Join-Path $root 'kiosk.err.log')
    }finally{
      foreach($k in $variables){[Environment]::SetEnvironmentVariable($k,$original[$k],'Process')}
    }
    $started=$false
    for($n=0;$n -lt 35;$n++){
      if($process.HasExited){break}
      if(Ready $Port){$started=$true;break}
      Start-Sleep -Milliseconds 180
    }
    if(!$started){
      if(!$process.HasExited){Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue}
      throw 'LOCAL_KIOSK_START_FAILED_INSPECT_KIOSK_ERR_LOG'
    }
    $receipt=[ordered]@{pid=$process.Id;terminalId=$TerminalId;
      runtime=$cli;port=$Port;startedUtc=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($pidFile,($receipt|ConvertTo-Json -Depth 4))
    Start-Process ('http://127.0.0.1:'+$Port+'/')
    Write-Output ('RESULT=LOCAL_QR_KIOSK_READY http://127.0.0.1:'+$Port)
    Write-Output 'EVENT_STATUS=PENDING_RECONCILIATION'
  }
  Status {
    $profile=ValidProfile
    if(!(Test-Path -LiteralPath $pidFile)){Write-Output 'STATUS=STOPPED';break}
    $receipt=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json
    if(Ready ([int]$receipt.port)){Write-Output 'STATUS=LOCAL_SERVICE_REACHABLE'}
    else{Write-Output 'STATUS=NOT_REACHABLE'}
    Write-Output ('TERMINAL_ID='+$profile.terminalId)
    Write-Output 'PHYSICAL_VENDOR_CERTIFIED=false'
  }
  Stop {
    $null=ValidProfile
    if(!(Test-Path -LiteralPath $pidFile)){Write-Output 'RESULT=ALREADY_STOPPED';break}
    $receipt=Get-Content -LiteralPath $pidFile -Raw|ConvertFrom-Json
    if($receipt.terminalId -cne $TerminalId -or $receipt.runtime -cne $cli){
      throw 'TERMINAL_PID_RECEIPT_MISMATCH'
    }
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$receipt.pid) -ErrorAction SilentlyContinue
    if($process){
      if(!$process.CommandLine -or !$process.CommandLine.Contains($cli)){
        throw 'PID_REASSIGNED_REFUSE_TO_STOP_OTHER_PROCESS'
      }
      Stop-Process -Id ([int]$receipt.pid) -Force -ErrorAction Stop
    }
    Remove-Item -LiteralPath $pidFile -Force
    Write-Output 'RESULT=LOCAL_QR_TERMINAL_STOPPED'
  }
}
