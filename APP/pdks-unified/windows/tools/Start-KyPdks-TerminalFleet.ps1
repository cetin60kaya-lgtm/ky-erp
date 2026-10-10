# KY PDKS — operator-started local terminal observer.
# Never writes production Firebird/TNF/D1 or sends a delete/settime command.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$ProfilesFile,
 [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._:-]{3,100}$')][string]$CompanyId,
 [switch]$ReadEnabled,
 [string[]]$ApprovedTerminalIds=@(),
 [string]$ReaderExe='',
 [string]$ReaderSha256='',
 [switch]$Once
)
$ErrorActionPreference='Stop'
$profiles=[IO.Path]::GetFullPath($ProfilesFile)
if(!(Test-Path -LiteralPath $profiles -PathType Leaf)){throw 'TERMINAL_PROFILE_FILE_NOT_FOUND'}
if((Get-Item -LiteralPath $profiles).Length -gt 65536){throw 'TERMINAL_PROFILE_FILE_TOO_LARGE'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\device-gateway'))
$cli=Join-Path $root 'terminal-fleet-cli.mjs'
if(!(Test-Path -LiteralPath $cli -PathType Leaf)){throw 'TERMINAL_CLI_MISSING'}
$node=(Get-Command node.exe -ErrorAction Stop).Source
$names=@('KY_PDKS_COMPANY_ID','KY_PDKS_FP_CLOCK_ENABLE_READ',
 'KY_PDKS_FP_CLOCK_APPROVED_IDS','KY_PDKS_FP_CLOCK_READER_EXE',
 'KY_PDKS_FP_CLOCK_READER_SHA256')
$previous=@{}
foreach($key in $names){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 $env:KY_PDKS_COMPANY_ID=$CompanyId
 $env:KY_PDKS_FP_CLOCK_ENABLE_READ='0'
 $env:KY_PDKS_FP_CLOCK_APPROVED_IDS=''
 $env:KY_PDKS_FP_CLOCK_READER_EXE=''
 $env:KY_PDKS_FP_CLOCK_READER_SHA256=''
 if($ReadEnabled){
   if(!$ApprovedTerminalIds -or
      ($ApprovedTerminalIds | Where-Object {$_ -cnotmatch '^HEDEF-[A-Za-z0-9._-]{3,64}$'})){
     throw 'TERMINAL_EXPLICIT_APPROVAL_IDS_REQUIRED'
   }
   $exe=[IO.Path]::GetFullPath($ReaderExe)
   if((Split-Path $exe -Leaf) -ine 'KyPdks.FpClock.Reader.exe' -or
      !(Test-Path -LiteralPath $exe -PathType Leaf)){
      throw 'SIGNED_FP_CLOCK_READER_EXE_REQUIRED'
   }
   if($ReaderSha256 -cnotmatch '^[0-9a-fA-F]{64}$'){
     throw 'READER_SHA256_APPROVAL_REQUIRED'
   }
   $digest=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
   if($digest -ine $ReaderSha256){throw 'FP_CLOCK_READER_HASH_MISMATCH'}
   $env:KY_PDKS_FP_CLOCK_ENABLE_READ='1'
   $env:KY_PDKS_FP_CLOCK_APPROVED_IDS=($ApprovedTerminalIds -join ',')
   $env:KY_PDKS_FP_CLOCK_READER_EXE=$exe
   $env:KY_PDKS_FP_CLOCK_READER_SHA256=$digest.ToLowerInvariant()
 }
 $action=if($Once){'--once'}else{'--watch'}
 & $node $cli '--profiles' $profiles $action
 if($LASTEXITCODE -ne 0){throw ('TERMINAL_OBSERVER_FAILED='+$LASTEXITCODE)}
}finally{
 foreach($key in $names){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
}
