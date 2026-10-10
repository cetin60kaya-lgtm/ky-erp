# KY PDKS Windows Agent scheduled startup - verification first, opt-in install.
# NEVER installs/removes tasks by default. Never stores a credential in task arguments.
[CmdletBinding()]
param(
  [ValidateSet('Validate','Install','Remove')][string]$Mode='Validate',
  [string]$Executable='',
  [string]$ApprovedSha256='',
  [switch]$ConfirmRemove
)
$ErrorActionPreference='Stop'
$taskName='KY PDKS Unified Agent'
if($Mode -eq 'Remove'){
 if(!$ConfirmRemove){throw 'CONFIRM_REMOVE_REQUIRED'}
 $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
 if($task){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
 Write-Output 'AGENT_TASK_REMOVED'
 return
}
if([string]::IsNullOrWhiteSpace($Executable) -or !(Test-Path -LiteralPath $Executable -PathType Leaf)){
 throw 'SIGNED_RELEASE_EXECUTABLE_REQUIRED'
}
$exe=[IO.Path]::GetFullPath($Executable)
if([IO.Path]::GetExtension($exe) -ne '.exe'){throw 'ONLY_EXE_APPHOST_ACCEPTED'}
if($exe -match '\\_TEMP\\|\\Downloads\\|\\Temp\\'){throw 'TEMP_OR_DOWNLOAD_BINARY_REJECTED'}
if($ApprovedSha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'APPROVED_EXE_SHA256_REQUIRED'}
$actualHash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
if(![string]::Equals($actualHash,$ApprovedSha256,[StringComparison]::OrdinalIgnoreCase)){
 throw 'EXE_SHA256_NOT_APPROVED'
}
$required=@(
 'KY_PDKS_DEVICE_ID','KY_PDKS_DEVICE_SECRET','KY_PDKS_DEVICE_COMPANY',
 'KY_PDKS_UNIFIED_SYNC_KEY','KY_PDKS_COMPANY_ROOT','KY_PDKS_DB_PASSWORD'
)
$missing=@()
foreach($name in $required){
 $value=[Environment]::GetEnvironmentVariable($name,'User')
 if([string]::IsNullOrWhiteSpace($value)){$missing+=$name}
}
if($missing.Count){throw ('USER_AGENT_ENV_MISSING '+($missing -join ','))}
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if($task){
 $existing=@($task.Actions | Select-Object -First 1)[0]
 if($existing.Execute -ne $exe -or $existing.Arguments -ne '--agent-loop'){
  throw 'EXISTING_AGENT_TASK_DIFFERS'
 }
 if($Mode -eq 'Install'){Write-Output 'AGENT_TASK_ALREADY_CORRECT';return}
}
if($Mode -eq 'Validate'){
 Write-Output ('AGENT_TASK_READY EXE_SHA256='+$actualHash)
 Write-Output ('AGENT_TASK_INSTALLED='+[bool]$task)
 return
}
Import-Module ScheduledTasks -ErrorAction Stop
$action=New-ScheduledTaskAction -Execute $exe -Argument '--agent-loop' -WorkingDirectory (Split-Path -Parent $exe)
$trigger=New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal=New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 365) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -ErrorAction Stop | Out-Null
Write-Output 'AGENT_TASK_INSTALLED_ON_NEXT_LOGON'
