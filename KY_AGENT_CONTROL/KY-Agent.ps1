# KY_AGENT_VERSION=1.0.0
param(
  [string]$ConfigPath = "$env:ProgramData\KY-Agent\config.json"
)

$ErrorActionPreference = 'Stop'
$script:Version = '1.0.0'
$script:Loop = 0

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ('KYAgent.Native' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace KYAgent {
  public static class Native {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  }
}
"@
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

$InstallRoot = Split-Path -Parent $ConfigPath
Ensure-Directory $InstallRoot
$LogFile = Join-Path $InstallRoot 'agent.log'
$StateFile = Join-Path $InstallRoot 'state.json'
$StopFile = Join-Path $InstallRoot 'STOP'

function Write-Log([string]$Text) {
  $line = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Text
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Read-Config {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Config bulunamadı: $ConfigPath" }
  return (Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

$Config = Read-Config
$AgentId = [string]$Config.agentId
$ControlUrl = [string]$Config.controlUrl
$AgentUrl = [string]$Config.agentUrl
$ResultRoot = [string]$Config.resultRoot
$PollSeconds = if ($Config.pollSeconds) { [int]$Config.pollSeconds } else { 2 }
Ensure-Directory $ResultRoot
$DriveStopFile = Join-Path (Split-Path -Parent $ResultRoot) 'DURDUR.txt'
$StatusFile = Join-Path (Split-Path -Parent $ResultRoot) 'status.json'

function Get-LastCommandId {
  try {
    if (Test-Path -LiteralPath $StateFile) {
      $state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
      return [string]$state.lastCommandId
    }
  } catch {}
  return ''
}

function Save-LastCommandId([string]$Id) {
  @{ lastCommandId = $Id; updatedAt = (Get-Date).ToUniversalTime().ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Write-Status([string]$State, [string]$Message, [string]$CommandId = '') {
  $obj = [ordered]@{
    agentId = $AgentId
    version = $script:Version
    computer = $env:COMPUTERNAME
    user = $env:USERNAME
    state = $State
    message = $Message
    commandId = $CommandId
    at = (Get-Date).ToUniversalTime().ToString('o')
  }
  $obj | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}

function Save-Screenshot([string]$Path) {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
  return $Path
}

function Invoke-MouseClick([int]$X, [int]$Y, [string]$Button = 'left', [int]$Count = 1) {
  [KYAgent.Native]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 80
  $down = if ($Button -eq 'right') { 0x0008 } elseif ($Button -eq 'middle') { 0x0020 } else { 0x0002 }
  $up   = if ($Button -eq 'right') { 0x0010 } elseif ($Button -eq 'middle') { 0x0040 } else { 0x0004 }
  for ($i=0; $i -lt [Math]::Max(1,$Count); $i++) {
    [KYAgent.Native]::mouse_event($down,0,0,0,[UIntPtr]::Zero)
    [KYAgent.Native]::mouse_event($up,0,0,0,[UIntPtr]::Zero)
    if ($Count -gt 1) { Start-Sleep -Milliseconds 120 }
  }
}

function Invoke-MouseMove([int]$X, [int]$Y) {
  [KYAgent.Native]::SetCursorPos($X, $Y) | Out-Null
}

function Invoke-Scroll([int]$Delta) {
  [KYAgent.Native]::mouse_event(0x0800,0,0,$Delta,[UIntPtr]::Zero)
}

function Invoke-TypeText([string]$Text) {
  $ok = $false
  for ($i=0; $i -lt 5 -and -not $ok; $i++) {
    try { [System.Windows.Forms.Clipboard]::SetText($Text); $ok = $true } catch { Start-Sleep -Milliseconds 150 }
  }
  if (-not $ok) { throw 'Clipboard kullanılamadı.' }
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}

function Invoke-Hotkey([string]$Keys) {
  [System.Windows.Forms.SendKeys]::SendWait($Keys)
}

function Focus-Window([string]$ProcessName, [string]$Title, [int]$TimeoutSeconds = 10) {
  $until = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $p = Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.MainWindowHandle -ne 0 -and
      ((-not $ProcessName -or $_.ProcessName -like "*$ProcessName*") -and
       (-not $Title -or $_.MainWindowTitle -like "*$Title*"))
    } | Select-Object -First 1
    if ($p) {
      [KYAgent.Native]::ShowWindowAsync($p.MainWindowHandle,9) | Out-Null
      [KYAgent.Native]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
      Start-Sleep -Milliseconds 250
      return $p
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $until)
  throw "Pencere bulunamadı. Process=$ProcessName Title=$Title"
}

function Invoke-PowerShellAction([string]$ScriptText) {
  $outFile = Join-Path $env:TEMP ("ky-agent-out-" + [guid]::NewGuid().ToString('N') + '.txt')
  $errFile = Join-Path $env:TEMP ("ky-agent-err-" + [guid]::NewGuid().ToString('N') + '.txt')
  try {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ScriptText))
    $p = Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) -PassThru -Wait -RedirectStandardOutput $outFile -RedirectStandardError $errFile -WindowStyle Hidden
    $stdout = if (Test-Path $outFile) { Get-Content $outFile -Raw -ErrorAction SilentlyContinue } else { '' }
    $stderr = if (Test-Path $errFile) { Get-Content $errFile -Raw -ErrorAction SilentlyContinue } else { '' }
    return [ordered]@{ exitCode = $p.ExitCode; stdout = $stdout; stderr = $stderr }
  } finally {
    Remove-Item $outFile,$errFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-RemoteControl {
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sep = if ($ControlUrl.Contains('?')) { '&' } else { '?' }
  return Invoke-RestMethod -Uri ($ControlUrl + $sep + 't=' + $stamp) -Headers @{ 'Cache-Control'='no-cache'; 'User-Agent'='KY-Agent/1.0' } -TimeoutSec 10
}

function Test-Expired($Command) {
  if (-not $Command.expiresAt) { return $false }
  try { return ((Get-Date).ToUniversalTime() -gt ([datetime]$Command.expiresAt).ToUniversalTime()) } catch { return $true }
}

function Try-SelfUpdate {
  if (-not $AgentUrl) { return }
  try {
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $sep = if ($AgentUrl.Contains('?')) { '&' } else { '?' }
    $remote = (Invoke-WebRequest -UseBasicParsing -Uri ($AgentUrl + $sep + 't=' + $stamp) -Headers @{ 'Cache-Control'='no-cache'; 'User-Agent'='KY-Agent-Updater/1.0' } -TimeoutSec 15).Content
    if ($remote -match 'KY_AGENT_VERSION=([0-9\.]+)') {
      $remoteVersion = $Matches[1]
      if ($remoteVersion -ne $script:Version) {
        $current = $MyInvocation.ScriptName
        if (-not $current) { $current = $PSCommandPath }
        $tmp = $current + '.new'
        Set-Content -LiteralPath $tmp -Value $remote -Encoding UTF8
        Move-Item -LiteralPath $tmp -Destination $current -Force
        Write-Log "Self update $script:Version -> $remoteVersion"
        Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',('"'+$current+'"'),'-ConfigPath',('"'+$ConfigPath+'"'))
        exit 0
      }
    }
  } catch { Write-Log ('Self update error: ' + $_.Exception.Message) }
}

function Invoke-Action($Action, [string]$ResultDir, [int]$Index) {
  $type = [string]$Action.type
  $started = (Get-Date).ToUniversalTime().ToString('o')
  $data = $null
  switch ($type) {
    'wait' { Start-Sleep -Milliseconds ([int]($Action.ms)); $data = 'ok' }
    'screenshot' {
      $name = if ($Action.name) { [string]$Action.name } else { ('shot-' + $Index) }
      $safe = $name -replace '[^a-zA-Z0-9_-]','_'
      $data = Save-Screenshot (Join-Path $ResultDir ($safe + '.jpg'))
    }
    'move' { Invoke-MouseMove ([int]$Action.x) ([int]$Action.y); $data = 'ok' }
    'click' { Invoke-MouseClick ([int]$Action.x) ([int]$Action.y) ([string]$Action.button) ([int]([Math]::Max(1,[int]$Action.count))); $data = 'ok' }
    'scroll' { Invoke-Scroll ([int]$Action.delta); $data = 'ok' }
    'type' { Invoke-TypeText ([string]$Action.text); $data = 'ok' }
    'hotkey' { Invoke-Hotkey ([string]$Action.keys); $data = 'ok' }
    'focus' { $p = Focus-Window ([string]$Action.process) ([string]$Action.title) ([int]([Math]::Max(1,[int]$Action.timeoutSeconds))); $data = @{ process=$p.ProcessName; title=$p.MainWindowTitle; pid=$p.Id } }
    'launch' {
      $args = if ($Action.args) { [string]$Action.args } else { '' }
      $p = Start-Process -FilePath ([string]$Action.path) -ArgumentList $args -PassThru
      $data = @{ pid=$p.Id; path=[string]$Action.path }
    }
    'powershell' { $data = Invoke-PowerShellAction ([string]$Action.script) }
    'writeFile' {
      $path = [string]$Action.path
      Ensure-Directory (Split-Path -Parent $path)
      Set-Content -LiteralPath $path -Value ([string]$Action.content) -Encoding UTF8
      $data = $path
    }
    default { throw "Bilinmeyen action type: $type" }
  }
  return [ordered]@{ index=$Index; type=$type; startedAt=$started; finishedAt=(Get-Date).ToUniversalTime().ToString('o'); ok=$true; data=$data }
}

Write-Log "KY Agent $script:Version started. AgentId=$AgentId ResultRoot=$ResultRoot"
Write-Status 'online' 'KY Agent çalışıyor.'
$lastHeartbeat = [datetime]::MinValue

while ($true) {
  try {
    $script:Loop++
    if (($script:Loop % 30) -eq 0) { Try-SelfUpdate }

    if (Test-Path -LiteralPath $StopFile -or Test-Path -LiteralPath $DriveStopFile) {
      if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 15) {
        Write-Status 'paused' 'DURDUR anahtarı aktif.'
        $lastHeartbeat = Get-Date
      }
      Start-Sleep -Seconds $PollSeconds
      continue
    }

    $cmd = Get-RemoteControl
    $lastId = Get-LastCommandId
    $cmdId = [string]$cmd.commandId
    $targetOk = ([string]$cmd.target -eq $AgentId -or [string]$cmd.target -eq '*' -or -not $cmd.target)

    if ($cmd.enabled -and $targetOk -and $cmdId -and $cmdId -ne $lastId -and -not (Test-Expired $cmd)) {
      $safeId = $cmdId -replace '[^a-zA-Z0-9_-]','_'
      $resultDir = Join-Path $ResultRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '_' + $safeId)
      Ensure-Directory $resultDir
      Write-Status 'running' 'Komut çalışıyor.' $cmdId
      Write-Log "Command start: $cmdId"
      $results = @()
      $status = 'ok'
      $errorText = ''
      try {
        $index = 0
        foreach ($action in @($cmd.actions)) {
          $index++
          try { $results += (Invoke-Action $action $resultDir $index) }
          catch {
            $results += [ordered]@{ index=$index; type=[string]$action.type; ok=$false; error=$_.Exception.Message }
            throw
          }
        }
      } catch {
        $status = 'error'
        $errorText = $_.Exception.Message
        try { Save-Screenshot (Join-Path $resultDir 'error.jpg') | Out-Null } catch {}
      } finally {
        Save-LastCommandId $cmdId
        $report = [ordered]@{
          agentId=$AgentId
          computer=$env:COMPUTERNAME
          user=$env:USERNAME
          version=$script:Version
          commandId=$cmdId
          status=$status
          error=$errorText
          finishedAt=(Get-Date).ToUniversalTime().ToString('o')
          results=$results
        }
        $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $resultDir 'result.json') -Encoding UTF8
        Write-Status $status (if ($status -eq 'ok') { 'Komut tamamlandı.' } else { 'Komut hata ile tamamlandı: ' + $errorText }) $cmdId
        Write-Log "Command finish: $cmdId status=$status"
      }
    } elseif (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 15) {
      Write-Status 'online' 'Komut bekliyor.' $lastId
      $lastHeartbeat = Get-Date
    }
  } catch {
    Write-Log ('Loop error: ' + $_.Exception.Message)
    try { Write-Status 'warning' $_.Exception.Message } catch {}
  }

  Start-Sleep -Seconds $PollSeconds
}
