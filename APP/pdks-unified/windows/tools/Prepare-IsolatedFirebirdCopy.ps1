# KY PDKS: create an isolated Firebird backup/restore for local integration tests.
# Reads the real Firebird using official gbak online backup; NEVER writes to live FDB/TNF.
# No cleanup of user folders. Stage test always rolls back its transaction.
[CmdletBinding()]
param(
  [string]$SourcePath = 'D:\Googledrive\KYERP-PDKS-MASAUSTU\DATA\KY_PDKS_DATA.FDB',
  [string]$BasePath = 'D:\KYERP\_TEMP',
  [string]$HostDll = '',
  [switch]$RunMappingSmoke
)
$ErrorActionPreference='Stop'
function Abort([string]$code){throw $code}
$expected=[IO.Path]::GetFullPath('D:\Googledrive\KYERP-PDKS-MASAUSTU\DATA\KY_PDKS_DATA.FDB')
$actual=[IO.Path]::GetFullPath($SourcePath)
if(![string]::Equals($expected,$actual,[StringComparison]::OrdinalIgnoreCase)){Abort 'SOURCE_NOT_ALLOWED'}
if(!(Test-Path -LiteralPath $actual -PathType Leaf)){Abort 'LIVE_SOURCE_NOT_FOUND'}
$source=(Get-Item -LiteralPath $actual)
if($source.Length -lt 1024){Abort 'SOURCE_FILE_TOO_SMALL'}
if(![string]::Equals([IO.Path]::GetFullPath($BasePath),'D:\KYERP\_TEMP',[StringComparison]::OrdinalIgnoreCase)){Abort 'STAGE_BASE_NOT_ALLOWED'}
$drive=Get-PSDrive -Name D -ErrorAction Stop
$required=[Math]::Max(5GB,[long]($source.Length*3.5))
if($drive.Free -lt $required){Abort ('DISK_SPACE_INSUFFICIENT need='+$required+' free='+$drive.Free)}
$password=$env:KY_PDKS_DB_PASSWORD
if([string]::IsNullOrWhiteSpace($password)){$password=[Environment]::GetEnvironmentVariable('KY_PDKS_DB_PASSWORD','User')}
if([string]::IsNullOrWhiteSpace($password)){Abort 'FIREBIRD_SECRET_NOT_CONFIGURED'}
$user=if($env:KY_PDKS_DB_USER){$env:KY_PDKS_DB_USER}else{'SYSDBA'}
$gbak=(Get-Command gbak.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if(!$gbak){
  $paths=@(
    'C:\Program Files\Firebird\Firebird_2_5\bin\gbak.exe',
    'C:\Program Files\Firebird\Firebird_3_0\gbak.exe',
    'C:\Program Files\Firebird\Firebird_3_0\bin\gbak.exe',
    'C:\Program Files\Firebird\Firebird_4_0\gbak.exe',
    'C:\Program Files\Firebird\Firebird_4_0\bin\gbak.exe',
    'C:\Program Files (x86)\Firebird\Firebird_2_5\bin\gbak.exe'
  )
  $gbak=$paths | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1
}
if(!$gbak){Abort 'FIREBIRD_GBAK_NOT_FOUND'}
$staging=Join-Path $BasePath ('PDKS_COPY_STAGE_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$archive=Join-Path $staging 'KY_PDKS_STAGE.fbk'
$target=Join-Path $staging 'KY_PDKS_STAGE.FDB'
$log=Join-Path $staging 'STAGE_BACKUP_RESTORE.log'
$before=[ordered]@{SourceSize=$source.Length;SourceWriteTime=$source.LastWriteTimeUtc.ToString('o')}
$oldIscPassword=$env:ISC_PASSWORD
$oldIscUser=$env:ISC_USER
try {
 $env:ISC_PASSWORD=$password
 $env:ISC_USER=$user
 # Database is opened by gbak in backup/read mode. No service/database restore to source path.
 & $gbak -b -g -v -user $user $actual $archive 2>&1 | Out-File -LiteralPath $log -Encoding utf8
 if($LASTEXITCODE -ne 0){Abort ('GBAK_BACKUP_FAILED '+$LASTEXITCODE)}
 if(!(Test-Path -LiteralPath $archive) -or (Get-Item $archive).Length -lt 1024){Abort 'GBAK_BACKUP_EMPTY'}
 & $gbak -c -v -user $user $archive $target 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
 if($LASTEXITCODE -ne 0){Abort ('GBAK_RESTORE_FAILED '+$LASTEXITCODE)}
 if(!(Test-Path -LiteralPath $target) -or (Get-Item $target).Length -lt 1024){Abort 'GBAK_RESTORE_EMPTY'}
 if($RunMappingSmoke){
  if([string]::IsNullOrWhiteSpace($HostDll) -or !(Test-Path -LiteralPath $HostDll)){Abort 'HOST_DLL_NOT_FOUND'}
  $env:KY_PDKS_STAGE_FDB_PATH=$target
  $env:KY_PDKS_ISOLATED_COPY='1'
  $result=& dotnet.exe $HostDll --isolated-firebird-copy-smoke 2>&1
  if($LASTEXITCODE -ne 0){Abort ('STAGE_MAPPING_SMOKE_FAILED '+($result -join ' '))}
  $result | Out-File -LiteralPath (Join-Path $staging 'STAGE_MAPPING_SMOKE.json') -Encoding utf8
 }
 $after=Get-Item -LiteralPath $actual
 [ordered]@{
  Result='ISOLATED_COPY_READY'
  SourceFileName=$source.Name
  StageRoot=$staging
  StageFDB=$target
  Archive=$archive
  SourceSizeBefore=$before.SourceSize
  SourceSizeAfter=$after.Length
  LiveWritesPerformed=$false
  TnfWritesPerformed=$false
  DeviceWritesPerformed=$false
  MappingSmoke=if($RunMappingSmoke){'RUN'}else{'NOT_REQUESTED'}
 } | ConvertTo-Json | Out-File -LiteralPath (Join-Path $staging 'STAGE_READY.json') -Encoding utf8
 Get-Content -LiteralPath (Join-Path $staging 'STAGE_READY.json') -Raw
} finally {
 $env:ISC_PASSWORD=$oldIscPassword
 $env:ISC_USER=$oldIscUser
 $env:KY_PDKS_ISOLATED_COPY=$null
 $env:KY_PDKS_STAGE_FDB_PATH=$null
 $password=$null
}
