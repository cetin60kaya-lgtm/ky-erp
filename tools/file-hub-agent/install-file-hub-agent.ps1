param(
  [string]$TaskName = "KY ERP File Hub Agent"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $Root "start-file-hub-agent-hidden.vbs"
$StartCmd = Join-Path $Root "start-file-hub-agent.cmd"
$BundledNode = Join-Path $Root "runtime\node.exe"

if (-not (Test-Path -LiteralPath $Launcher)) { throw "Gizli baslatma dosyasi bulunamadi: $Launcher" }
if (-not (Test-Path -LiteralPath $StartCmd)) { throw "File Hub baslatma dosyasi bulunamadi: $StartCmd" }
if (-not (Test-Path -LiteralPath $BundledNode) -and -not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "KY File Agent Node runtime bulunamadi."
}

if (-not [Environment]::GetEnvironmentVariable("KYERP_API_URL", "User")) {
  [Environment]::SetEnvironmentVariable("KYERP_API_URL", "https://api.kyerp.net", "User")
}
if (-not [Environment]::GetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", "User")) {
  [Environment]::SetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", "mecit-hakan", "User")
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"{0}"' -f $Launcher)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "KY ERP File Hub: Google Drive, OneDrive, SharePoint senkron klasoru, yerel klasor ve NAS indeksleyici + muhasebe arsiv worker" -Force | Out-Null

$agentKey = [Environment]::GetEnvironmentVariable("KYERP_AGENT_KEY", "User")
if (-not $agentKey) { $agentKey = [Environment]::GetEnvironmentVariable("KYERP_AGENT_KEY", "Machine") }
if ($agentKey) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "KY File Hub Agent kuruldu ve baslatildi." -ForegroundColor Green
} else {
  Write-Host "KY File Hub Agent kuruldu. Agent anahtari Depolama ekranindan tanimlaninca otomatik baslatilacak." -ForegroundColor Yellow
}

Write-Host "Gorev: $TaskName"
Write-Host "Launcher: $Launcher"
Write-Host "Node: $(if(Test-Path $BundledNode){$BundledNode}else{'Sistem Node.js'})"
Write-Host "Depolama kaynaklari KY ERP > Depolama > Baglantilar ekranindan okunur."