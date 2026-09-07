param(
  [string]$TaskName = "KY ERP File Hub Agent"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $Root "start-file-hub-agent-hidden.vbs"
$StartCmd = Join-Path $Root "start-file-hub-agent.cmd"

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Gizli baslatma dosyasi bulunamadi: $Launcher"
}
if (-not (Test-Path -LiteralPath $StartCmd)) {
  throw "File Hub baslatma dosyasi bulunamadi: $StartCmd"
}

$BundledNode = Join-Path $Root "runtime\node.exe"
if (Test-Path -LiteralPath $BundledNode) {
  $nodePath = $BundledNode
} else {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js bulunamadi. File Hub Agent icin paket runtime'i veya sistem Node.js'i gerekli."
  }
  $nodePath = $node.Source
}
[Environment]::SetEnvironmentVariable("KYERP_FILE_AGENT_NODE", $nodePath, "User")

$agentKey = [Environment]::GetEnvironmentVariable("KYERP_AGENT_KEY", "User")
if (-not $agentKey) {
  $agentKey = [Environment]::GetEnvironmentVariable("KYERP_AGENT_KEY", "Machine")
}
if (-not $agentKey) {
  throw "KYERP_AGENT_KEY kullanici veya makine ortam degiskeninde tanimli degil. Secret degeri repoya yazilmaz."
}

$apiUrl = [Environment]::GetEnvironmentVariable("KYERP_API_URL", "User")
if (-not $apiUrl) {
  [Environment]::SetEnvironmentVariable("KYERP_API_URL", "https://api.kyerp.net", "User")
}
$company = [Environment]::GetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", "User")
if (-not $company) {
  [Environment]::SetEnvironmentVariable("KYERP_MAIN_COMPANY_SLUG", "mecit-hakan", "User")
}

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"{0}"' -f $Launcher)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "KY ERP File Hub: Google Drive, OneDrive, SharePoint senkron klasoru, yerel klasor ve NAS indeksleyici + muhasebe arsiv worker" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "KY File Hub Agent kuruldu ve baslatildi." -ForegroundColor Green
Write-Host "Gorev: $TaskName"
Write-Host "Launcher: $Launcher"
Write-Host "Node: $nodePath"
Write-Host "Depolama kaynaklari KY ERP > Depolama > Baglantilar ekranindan okunur."
