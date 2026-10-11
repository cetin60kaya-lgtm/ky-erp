[CmdletBinding()]
param([switch]$FailIfMissing)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Platform -ne 'Win32NT'){throw 'WINDOWS_REQUIRED'}
$arch=[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$proc=[System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
$runtimes=@(& dotnet.exe --list-runtimes 2>$null)
$net8=@($runtimes | Where-Object {$_ -match '^Microsoft\.WindowsDesktop\.App 8\.'}).Count -gt 0
$pf86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$roots=@($pf86,$env:ProgramFiles,$env:LOCALAPPDATA)|Where-Object {$_}
$webview=$false
foreach($root in $roots){
  $path=Join-Path $root 'Microsoft\EdgeWebView\Application'
  if(Test-Path $path){
    if(Get-ChildItem $path -Recurse -Filter msedgewebview2.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1){$webview=$true;break}
  }
}
$service=Get-Service -Name KYERP.PDKS.Agent -ErrorAction SilentlyContinue
$task=Get-ScheduledTask -TaskName '*Unified*' -ErrorAction SilentlyContinue | Select-Object -First 1
$result=[ordered]@{
 architecture=$arch
 processArchitecture=$proc
 x64Host=($arch -eq 'X64' -and $proc -eq 'X64')
 net8WindowsDesktop=$net8
 webview2=$webview
 x86FpClock='SEPARATE_TERMINAL_BRIDGE'
 legacyService=$(if($service){[string]$service.Status}else{'NOT_INSTALLED'})
 unifiedTask=$(if($task){[string]$task.State}else{'NOT_INSTALLED'})
 liveMutation=$false
}
$result|ConvertTo-Json
if($FailIfMissing -and (!$result.x64Host -or !$net8 -or !$webview)){throw 'UNIFIED_RUNTIME_PREREQUISITES_MISSING'}
