# One-time scheduled safe KY PDKS test worker. Codex coding is NOT
# scheduled; only new GitHub feature HEADs trigger protected full QA.
[CmdletBinding()]
param([ValidateSet('Install','Status','Remove')][string]$Mode='Install')
$ErrorActionPreference='Stop'
$name='KY PDKS - Guvenli Gelistirme Kontrolu'
$script=Join-Path $PSScriptRoot 'Invoke-KyPdks-DevWorker.ps1'
if(!(Test-Path -LiteralPath $script -PathType Leaf)){throw 'COORDINATOR_SCRIPT_NOT_FOUND'}
if([IO.Path]::GetFullPath($script) -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_SAFE_VERIFY_[^\\]+\\web\\APP\\pdks-unified\\windows\\tools\\Invoke-KyPdks-DevWorker\.ps1$'){
  throw 'INSTALL_ONLY_FROM_ISOLATED_CHECKOUT'
}
Import-Module ScheduledTasks -ErrorAction Stop
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if($Mode -eq 'Status'){
  Write-Output ('TASK_INSTALLED='+[bool]$existing)
  if($existing){Write-Output ('TASK_STATE='+$existing.State)}
  return
}
if($Mode -eq 'Remove'){
  if($existing){Unregister-ScheduledTask -TaskName $name -Confirm:$false}
  Write-Output 'RESULT=SAFE_PDKS_WORKER_TASK_REMOVED'
  return
}
if($existing){
  $command=$existing.Actions|Select-Object -First 1
  if($command.Arguments -notlike '*Invoke-KyPdks-DevWorker.ps1*' -or
    $command.Arguments -notlike '*-Mode Auto*'){
    throw 'EXISTING_TASK_DIFFERS_NO_OVERWRITE'
  }
  Write-Output 'RESULT=SAFE_PDKS_WORKER_ALREADY_INSTALLED'
  return
}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -Mode Auto'
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 365)
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 25)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -ErrorAction Stop|Out-Null
$check=Get-ScheduledTask -TaskName $name -ErrorAction Stop
Write-Output ('TASK_STATE='+$check.State)
Write-Output 'RESULT=SAFE_PDKS_WORKER_INSTALLED'
Write-Output 'AUTOMATION=GITHUB_HEAD_CHANGE_FULL_TEST_EVERY_30_MINUTES'
Write-Output 'CODEX_CODING=SEPARATE_MANUAL_ONE_TASK'
Write-Output 'CANONICAL_REPO_AND_PRODUCTION_UNTOUCHED=true'
