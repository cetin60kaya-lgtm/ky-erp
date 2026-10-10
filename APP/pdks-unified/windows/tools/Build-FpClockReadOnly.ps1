# Build only: publishes self-contained 32-bit WinForms/COM reader to temp output.
# No device connection, OCX registration, Firebird, TNF, D1 or deployment.
[CmdletBinding()]
param([string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\FpClock.Reader\KyPdks.FpClock.Reader.csproj'))
if(!(Test-Path -LiteralPath $project -PathType Leaf)){throw 'FP_CLOCK_READER_PROJECT_MISSING'}
if(!(Get-Command dotnet -ErrorAction SilentlyContinue)){throw 'DOTNET_8_REQUIRED'}
if(!$OutputDirectory){
  $OutputDirectory=Join-Path $env:TEMP 'KY-PDKS-FP-CLOCK-READER-ISOLATED'
}
$out=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $out -Force|Out-Null
& dotnet publish $project --configuration Release --runtime win-x86 --self-contained true --output $out -p:PublishSingleFile=true -p:PublishTrimmed=false -p:PlatformTarget=x86
if($LASTEXITCODE -ne 0){throw ('FP_CLOCK_READER_PUBLISH_FAILED='+$LASTEXITCODE)}
$exe=Join-Path $out 'KyPdks.FpClock.Reader.exe'
if(!(Test-Path -LiteralPath $exe -PathType Leaf)){throw 'FP_CLOCK_READER_EXE_MISSING'}
$file=Get-Item -LiteralPath $exe
$sha=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output ('READER_EXE='+$file.FullName)
Write-Output ('READER_SHA256='+$sha)
Write-Output ('READER_BYTES='+$file.Length)
Write-Output 'RESULT=WINDOWS_X86_COM_READER_BUILD_ONLY_NO_PHYSICAL_SDK_TEST'
