param(
  [string]$ConfigPath = "$env:ProgramData\KYERP\Sentinel\sentinel-config.json"
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "1.0.0"
$HeartbeatSeconds = 60
$CommandPollSeconds = 15

function Read-KyConfig {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Sentinel config bulunamadı: $ConfigPath" }
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $config.agentId -or -not $config.encryptedToken -or -not $config.apiBase) { throw "Sentinel config eksik." }
  $uri = [Uri]$config.apiBase
  if ($uri.Scheme -ne "https") { throw "Sentinel API yalnız HTTPS olabilir." }
  return $config
}

function Unprotect-KySecret([string]$cipherText) {
  $bytes = [Convert]::FromBase64String($cipherText)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  return [Text.Encoding]::UTF8.GetString($plain)
}

function Get-KyHeaders($config, [string]$token) {
  return @{
    "Accept" = "application/json"
    "Content-Type" = "application/json"
    "X-KYERP-Agent-Id" = [string]$config.agentId
    "X-KYERP-Agent-Token" = $token
  }
}

function Invoke-KyJson([string]$method, [string]$url, $headers, $body = $null) {
  $params = @{ Method = $method; Uri = $url; Headers = $headers; TimeoutSec = 20; UseBasicParsing = $true }
  if ($null -ne $body) { $params.Body = ($body | ConvertTo-Json -Depth 8 -Compress) }
  return Invoke-RestMethod @params
}

function Get-KyIpAddresses {
  try {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -and $_.IPAddress -notlike "169.254.*" } | Select-Object -ExpandProperty IPAddress -Unique)
  } catch { return @() }
}

function Get-KyMetrics {
  $cpu = $null; $memory = $null; $disk = $null
  try { $cpu = [math]::Round(((Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average), 0) } catch {}
  try {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.TotalVisibleMemorySize -gt 0) { $memory = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 0) }
  } catch {}
  try {
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    if ($drive.Size -gt 0) { $disk = [math]::Round(($drive.FreeSpace / $drive.Size) * 100, 0) }
  } catch {}
  return @{ cpuPercent = $cpu; memoryPercent = $memory; diskFreePercent = $disk }
}

function Send-KyHeartbeat($config, $headers) {
  $osVersion = ""
  try { $osVersion = (Get-CimInstance Win32_OperatingSystem).Version } catch {}
  $body = @{
    status = "ONLINE"
    agentVersion = $AgentVersion
    hostname = $env:COMPUTERNAME
    os = "Windows"
    osVersion = $osVersion
    ipAddresses = @(Get-KyIpAddresses)
    metrics = Get-KyMetrics
    capabilities = @($config.capabilities)
  }
  Invoke-KyJson "POST" "$($config.apiBase.TrimEnd('/'))/api/system-agent/heartbeat" $headers $body | Out-Null
}

function Send-KyMagicPacket([string]$macAddress, [string]$broadcastAddress = "255.255.255.255") {
  $clean = ($macAddress -replace '[^0-9A-Fa-f]', '')
  if ($clean.Length -ne 12) { throw "Geçersiz MAC adresi." }
  [byte[]]$mac = 0..5 | ForEach-Object { [Convert]::ToByte($clean.Substring($_ * 2, 2), 16) }
  [byte[]]$packet = (,[byte]0xFF * 6) + ($mac * 16)
  $client = [Net.Sockets.UdpClient]::new()
  try {
    $client.EnableBroadcast = $true
    [void]$client.Send($packet, $packet.Length, $broadcastAddress, 9)
  } finally { $client.Dispose() }
}

function Get-KyRecentErrors {
  try {
    $since = (Get-Date).AddMinutes(-30)
    $items = Get-WinEvent -FilterHashtable @{ LogName = @('System','Application'); Level = 2; StartTime = $since } -ErrorAction Stop | Select-Object -First 5
    return (($items | ForEach-Object { "[$($_.LogName)] $($_.Id): $($_.ProviderName)" }) -join "; ")
  } catch { return "Yakın dönem kritik Windows olayı okunamadı." }
}

function Invoke-KyCommand($command, $config) {
  $action = ([string]$command.action).ToUpperInvariant()
  switch ($action) {
    "PING" { return @{ ok = $true; message = "PONG $env:COMPUTERNAME" } }
    "WAKE" {
      Send-KyMagicPacket ([string]$command.payload.macAddress) ([string]($command.payload.broadcastAddress ?? "255.255.255.255"))
      return @{ ok = $true; message = "Magic Packet gönderildi: $($command.payload.targetDeviceId)" }
    }
    "LOCK" {
      Start-Process -FilePath "$env:SystemRoot\System32\rundll32.exe" -ArgumentList "user32.dll,LockWorkStation" -WindowStyle Hidden
      return @{ ok = $true; message = "Windows kilitleme isteği gönderildi." }
    }
    "RESTART" { return @{ ok = $true; message = "Yeniden başlatma onaylandı."; postAction = "RESTART" } }
    "SHUTDOWN" { return @{ ok = $true; message = "Kapatma onaylandı."; postAction = "SHUTDOWN" } }
    "SERVICE_RESTART" {
      $serviceName = [string]$command.payload.serviceName
      $allowed = @($config.allowedServices)
      if (-not $serviceName -or $allowed -notcontains $serviceName) { throw "Servis agent izin listesinde değil." }
      Restart-Service -Name $serviceName -Force -ErrorAction Stop
      return @{ ok = $true; message = "$serviceName yeniden başlatıldı." }
    }
    "COLLECT_LOGS" { return @{ ok = $true; message = (Get-KyRecentErrors) } }
    default { throw "İzin verilmeyen agent komutu: $action" }
  }
}

function Complete-KyCommand($config, $headers, $command, $result) {
  $body = if ($result.ok) { @{ status = "COMPLETED"; code = "OK"; message = [string]$result.message } } else { @{ status = "FAILED"; code = [string]$result.code; message = [string]$result.message } }
  Invoke-KyJson "POST" "$($config.apiBase.TrimEnd('/'))/api/system-agent/commands/$($command.id)/result" $headers $body | Out-Null
}

$config = Read-KyConfig
$token = Unprotect-KySecret ([string]$config.encryptedToken)
$headers = Get-KyHeaders $config $token
$lastHeartbeat = [DateTime]::MinValue

while ($true) {
  try {
    if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge $HeartbeatSeconds) {
      Send-KyHeartbeat $config $headers
      $lastHeartbeat = Get-Date
    }
    $response = Invoke-KyJson "GET" "$($config.apiBase.TrimEnd('/'))/api/system-agent/commands" $headers
    foreach ($command in @($response.data)) {
      $result = $null
      try { $result = Invoke-KyCommand $command $config }
      catch { $result = @{ ok = $false; code = "AGENT_COMMAND_FAILED"; message = $_.Exception.Message } }
      try { Complete-KyCommand $config $headers $command $result } catch {}
      if ($result.postAction -eq "RESTART") { Start-Process shutdown.exe -ArgumentList "/r /t 5 /f" -WindowStyle Hidden; exit 0 }
      if ($result.postAction -eq "SHUTDOWN") { Start-Process shutdown.exe -ArgumentList "/s /t 5 /f" -WindowStyle Hidden; exit 0 }
    }
  } catch {
    try { Add-Content -LiteralPath "$env:ProgramData\KYERP\Sentinel\sentinel-agent.log" -Value "$(Get-Date -Format o) $($_.Exception.Message)" -Encoding UTF8 } catch {}
  }
  Start-Sleep -Seconds $CommandPollSeconds
}
