param(
  [Parameter(Mandatory=$true)][string]$AgentId,
  [Parameter(Mandatory=$true)][string]$AgentToken,
  [string]$ApiBase = "https://api.kyerp.net",
  [switch]$WakeBridge,
  [string[]]$AllowedServices = @("KYERP.PDKS.Agent", "KYERP.FileAgent")
)
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "KY Sentinel Agent kurulumu Yönetici olarak çalıştırılmalıdır."
}

$api = [Uri]$ApiBase
if ($api.Scheme -ne "https") { throw "ApiBase yalnız HTTPS olabilir." }
if (-not (Test-Path -LiteralPath "$PSScriptRoot\sentinel-agent.ps1")) { throw "sentinel-agent.ps1 kurulum dosyasının yanında bulunamadı." }

$root = "$env:ProgramData\KYERP\Sentinel"
$agentPath = "$root\sentinel-agent.ps1"
$configPath = "$root\sentinel-config.json"
$taskName = "KY ERP System Sentinel Agent"
New-Item -ItemType Directory -Path $root -Force | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot\sentinel-agent.ps1" -Destination $agentPath -Force

$plain = [Text.Encoding]::UTF8.GetBytes($AgentToken)
$protected = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
$encryptedToken = [Convert]::ToBase64String($protected)
$capabilities = @("SYSTEM_CONTROL", "REMOTE_DESKTOP")
if ($WakeBridge) { $capabilities += "WAKE_BRIDGE" }

$config = [ordered]@{
  agentId = $AgentId
  apiBase = $ApiBase.TrimEnd('/')
  encryptedToken = $encryptedToken
  capabilities = @($capabilities | Select-Object -Unique)
  allowedServices = @($AllowedServices | Where-Object { $_ } | Select-Object -Unique)
  installedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$config | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath -Encoding UTF8

try {
  $acl = Get-Acl -LiteralPath $root
  $acl.SetAccessRuleProtection($true, $false)
  $systemRule = [Security.AccessControl.FileSystemAccessRule]::new("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
  $adminsRule = [Security.AccessControl.FileSystemAccessRule]::new("BUILTIN\Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
  $acl.AddAccessRule($systemRule)
  $acl.AddAccessRule($adminsRule)
  Set-Acl -LiteralPath $root -AclObject $acl
} catch { Write-Warning "Sentinel klasör ACL'i sıkılaştırılamadı: $($_.Exception.Message)" }

if ($WakeBridge) {
  try {
    Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
      try { Enable-NetAdapterPowerManagement -Name $_.Name -WakeOnMagicPacket -ErrorAction Stop | Out-Null } catch {}
    }
  } catch { Write-Warning "Wake-on-LAN Windows NIC ayarı otomatik doğrulanamadı." }
}

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$agentPath`" -ConfigPath `"$configPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $taskPrincipal -Settings $settings -Description "KY ERP cihaz sağlık, WoL ve güvenli uzak müdahale agentı"
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "KY Sentinel Agent kuruldu ve başlatıldı." -ForegroundColor Green
Write-Host "Agent ID: $AgentId"
Write-Host "API: $($config.apiBase)"
Write-Host "Wake Bridge: $([bool]$WakeBridge)"
