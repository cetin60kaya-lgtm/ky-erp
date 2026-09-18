# KY_AGENT_VERSION=2.0.0
param([string]$ConfigPath = "$env:LOCALAPPDATA\KY-Agent\config.json")

$ErrorActionPreference = 'Stop'
$script:Version = '2.0.0'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if (-not ('KYLive.Native' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace KYLive {
  public static class Native {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    public struct POINT { public int X; public int Y; }
  }
}
"@
}

function Ensure-Dir([string]$Path) {
  if ($Path -and -not (Test-Path -LiteralPath $Path)) { New-Item -ItemType Directory -Path $Path -Force | Out-Null }
}

if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "KY Agent config bulunamadı: $ConfigPath" }
$cfg = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$AgentId = [string]$cfg.agentId
$DeviceDir = [string]$cfg.deviceDir
$ControlFile = [string]$cfg.controlFile
$Outbox = [string]$cfg.outbox
$LiveImage = [string]$cfg.liveImage
$LiveMeta = [string]$cfg.liveMeta
$StatusFile = [string]$cfg.statusFile
$PollMs = if ($cfg.pollMs) { [int]$cfg.pollMs } else { 300 }
$LiveIntervalMs = if ($cfg.liveIntervalMs) { [int]$cfg.liveIntervalMs } else { 1200 }
$SelfUpdateUrl = [string]$cfg.selfUpdateUrl
$InstallRoot = Split-Path -Parent $ConfigPath
$LogFile = Join-Path $InstallRoot 'agent.log'
$StateFile = Join-Path $InstallRoot 'state.json'
$StopFile = Join-Path $InstallRoot 'STOP'

Ensure-Dir $DeviceDir
Ensure-Dir $Outbox

function Log([string]$Text) {
  Add-Content -LiteralPath $LogFile -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $Text)
}

function Read-State {
  try {
    if (Test-Path -LiteralPath $StateFile) { return Get-Content $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json }
  } catch {}
  return [pscustomobject]@{ lastCommandId=''; lastControlWrite=''; lastUpdateCheck='' }
}

function Save-State([string]$CommandId, [string]$ControlWrite) {
  [ordered]@{
    lastCommandId=$CommandId
    lastControlWrite=$ControlWrite
    updatedAt=(Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Write-Status([string]$State,[string]$Message,[string]$CommandId='') {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  [ordered]@{
    agentId=$AgentId
    version=$script:Version
    computer=$env:COMPUTERNAME
    user=$env:USERNAME
    state=$State
    message=$Message
    commandId=$CommandId
    screen=@{ left=$bounds.Left; top=$bounds.Top; width=$bounds.Width; height=$bounds.Height }
    at=(Get-Date).ToUniversalTime().ToString('o')
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
}

function Capture-Screen([string]$Path) {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width,$bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size)
    $tmp = $Path + '.tmp.jpg'
    $bmp.Save($tmp,[System.Drawing.Imaging.ImageFormat]::Jpeg)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
  $p = New-Object KYLive.Native+POINT
  [KYLive.Native]::GetCursorPos([ref]$p) | Out-Null
  [ordered]@{
    agentId=$AgentId
    capturedAt=(Get-Date).ToUniversalTime().ToString('o')
    width=$bounds.Width; height=$bounds.Height; left=$bounds.Left; top=$bounds.Top
    cursor=@{ x=$p.X; y=$p.Y }
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $LiveMeta -Encoding UTF8
}

function Mouse-Move([int]$X,[int]$Y) { [KYLive.Native]::SetCursorPos($X,$Y) | Out-Null }
function Mouse-Down([string]$Button='left') {
  $flag = if ($Button -eq 'right') { 0x0008 } elseif ($Button -eq 'middle') { 0x0020 } else { 0x0002 }
  [KYLive.Native]::mouse_event($flag,0,0,0,[UIntPtr]::Zero)
}
function Mouse-Up([string]$Button='left') {
  $flag = if ($Button -eq 'right') { 0x0010 } elseif ($Button -eq 'middle') { 0x0040 } else { 0x0004 }
  [KYLive.Native]::mouse_event($flag,0,0,0,[UIntPtr]::Zero)
}
function Mouse-Click([int]$X,[int]$Y,[string]$Button='left',[int]$Count=1) {
  Mouse-Move $X $Y; Start-Sleep -Milliseconds 60
  for($i=0;$i -lt [Math]::Max(1,$Count);$i++) { Mouse-Down $Button; Mouse-Up $Button; if($Count -gt 1){Start-Sleep -Milliseconds 110} }
}
function Mouse-Drag([int]$X1,[int]$Y1,[int]$X2,[int]$Y2,[int]$DurationMs=500,[string]$Button='left') {
  Mouse-Move $X1 $Y1; Start-Sleep -Milliseconds 80; Mouse-Down $Button
  $steps=[Math]::Max(4,[Math]::Min(60,[int]($DurationMs/20)))
  for($i=1;$i -le $steps;$i++) {
    $x=[int]($X1+(($X2-$X1)*$i/$steps)); $y=[int]($Y1+(($Y2-$Y1)*$i/$steps))
    Mouse-Move $x $y; Start-Sleep -Milliseconds ([Math]::Max(5,[int]($DurationMs/$steps)))
  }
  Mouse-Up $Button
}
function Mouse-Scroll([int]$Delta) { [KYLive.Native]::mouse_event(0x0800,0,0,$Delta,[UIntPtr]::Zero) }

function Type-Text([string]$Text) {
  $done=$false
  for($i=0;$i -lt 8 -and -not $done;$i++) {
    try { [System.Windows.Forms.Clipboard]::SetText($Text); $done=$true } catch { Start-Sleep -Milliseconds 100 }
  }
  if(-not $done){ throw 'Clipboard kullanılamadı.' }
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}
function Send-Hotkey([string]$Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }

function Focus-Window([string]$ProcessName,[string]$Title,[int]$Timeout=8) {
  $until=(Get-Date).AddSeconds([Math]::Max(1,$Timeout))
  do {
    $p=Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.MainWindowHandle -ne 0 -and
      ((-not $ProcessName -or $_.ProcessName -like "*$ProcessName*") -and (-not $Title -or $_.MainWindowTitle -like "*$Title*"))
    } | Select-Object -First 1
    if($p){ [KYLive.Native]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null; [KYLive.Native]::SetForegroundWindow($p.MainWindowHandle)|Out-Null; Start-Sleep -Milliseconds 250; return $p }
    Start-Sleep -Milliseconds 200
  } while((Get-Date)-lt $until)
  throw "Pencere bulunamadı: process=$ProcessName title=$Title"
}

function Run-PowerShell([string]$ScriptText) {
  $out=Join-Path $env:TEMP ('kyout-'+[guid]::NewGuid().ToString('N')+'.txt')
  $err=Join-Path $env:TEMP ('kyerr-'+[guid]::NewGuid().ToString('N')+'.txt')
  try {
    $enc=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ScriptText))
    $p=Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$enc) -PassThru -Wait -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
    return [ordered]@{ exitCode=$p.ExitCode; stdout=(Get-Content $out -Raw -ErrorAction SilentlyContinue); stderr=(Get-Content $err -Raw -ErrorAction SilentlyContinue) }
  } finally { Remove-Item $out,$err -Force -ErrorAction SilentlyContinue }
}

function Visible-Windows {
  @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
    [ordered]@{ process=$_.ProcessName; pid=$_.Id; title=$_.MainWindowTitle }
  })
}

function Read-Control {
  if(-not (Test-Path -LiteralPath $ControlFile)){ return $null }
  for($i=0;$i -lt 8;$i++) {
    try { return Get-Content -LiteralPath $ControlFile -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { Start-Sleep -Milliseconds 80 }
  }
  throw 'control.json okunamadı; Drive senkronu tamamlanmamış olabilir.'
}

function Expired($Command) {
  if(-not $Command.expiresAt){return $false}
  try { return (Get-Date).ToUniversalTime() -gt ([datetime]$Command.expiresAt).ToUniversalTime() } catch { return $true }
}

function Invoke-Action($a,[string]$ResultDir,[int]$Index) {
  $type=[string]$a.type; $data=$null
  switch($type) {
    'wait' { Start-Sleep -Milliseconds ([int]$a.ms); $data='ok' }
    'screenshot' { $name=if($a.name){[string]$a.name}else{"shot-$Index"}; $path=Join-Path $ResultDir (($name -replace '[^a-zA-Z0-9_-]','_')+'.jpg'); Capture-Screen $path; $data=$path }
    'move' { Mouse-Move ([int]$a.x) ([int]$a.y); $data='ok' }
    'click' { $button=if($a.button){[string]$a.button}else{'left'}; $count=if($a.count){[int]$a.count}else{1}; Mouse-Click ([int]$a.x) ([int]$a.y) $button $count; $data='ok' }
    'drag' { $button=if($a.button){[string]$a.button}else{'left'}; $dur=if($a.durationMs){[int]$a.durationMs}else{500}; Mouse-Drag ([int]$a.x1) ([int]$a.y1) ([int]$a.x2) ([int]$a.y2) $dur $button; $data='ok' }
    'scroll' { Mouse-Scroll ([int]$a.delta); $data='ok' }
    'type' { Type-Text ([string]$a.text); $data='ok' }
    'hotkey' { Send-Hotkey ([string]$a.keys); $data='ok' }
    'focus' { $p=Focus-Window ([string]$a.process) ([string]$a.title) (if($a.timeout){[int]$a.timeout}else{8}); $data=@{process=$p.ProcessName;pid=$p.Id;title=$p.MainWindowTitle} }
    'launch' { $args=if($a.args){[string]$a.args}else{''}; $p=Start-Process -FilePath ([string]$a.path) -ArgumentList $args -PassThru; $data=@{pid=$p.Id;path=[string]$a.path} }
    'powershell' { $data=Run-PowerShell ([string]$a.script) }
    'windows' { $data=Visible-Windows }
    'systemInfo' { $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $data=@{computer=$env:COMPUTERNAME;user=$env:USERNAME;screen=@{left=$b.Left;top=$b.Top;width=$b.Width;height=$b.Height};psVersion=$PSVersionTable.PSVersion.ToString()} }
    'writeFile' { $path=[string]$a.path; Ensure-Dir (Split-Path -Parent $path); Set-Content -LiteralPath $path -Value ([string]$a.content) -Encoding UTF8; $data=$path }
    default { throw "Bilinmeyen action: $type" }
  }
  if($a.captureAfter){ Capture-Screen $LiveImage }
  return [ordered]@{index=$Index;type=$type;ok=$true;finishedAt=(Get-Date).ToUniversalTime().ToString('o');data=$data}
}

function Check-SelfUpdate {
  if(-not $SelfUpdateUrl -or -not $PSCommandPath){return}
  try {
    $u=$SelfUpdateUrl + (if($SelfUpdateUrl.Contains('?')){'&'}else{'?'}) + 't=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $remote=(Invoke-WebRequest -UseBasicParsing -Uri $u -Headers @{'Cache-Control'='no-cache'} -TimeoutSec 15).Content
    if($remote -match 'KY_AGENT_VERSION=([0-9\.]+)' -and $Matches[1] -ne $script:Version){
      $tmp=$PSCommandPath+'.new'; Set-Content -LiteralPath $tmp -Value $remote -Encoding UTF8; Move-Item $tmp $PSCommandPath -Force
      Log "Self update $script:Version -> $($Matches[1])"
      Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',('"'+$PSCommandPath+'"'),'-ConfigPath',('"'+$ConfigPath+'"'))
      exit 0
    }
  } catch { Log ('Self update error: '+$_.Exception.Message) }
}

$state=Read-State
$lastId=[string]$state.lastCommandId
$lastControlWrite=[string]$state.lastControlWrite
$lastLive=[datetime]::MinValue
$lastStatus=[datetime]::MinValue
$lastUpdate=[datetime]::MinValue
Log "KY Agent LIVE $script:Version started: $AgentId / $DeviceDir"
Write-Status 'online' 'Canlı bağlantı hazır.' $lastId
try { Capture-Screen $LiveImage } catch { Log ('Initial screenshot error: '+$_.Exception.Message) }

while($true) {
  try {
    if(Test-Path -LiteralPath $StopFile){
      if(((Get-Date)-$lastStatus).TotalSeconds -ge 5){Write-Status 'paused' 'Yerel DURDUR anahtarı aktif.' $lastId; $lastStatus=Get-Date}
      Start-Sleep -Milliseconds $PollMs; continue
    }

    if(((Get-Date)-$lastUpdate).TotalMinutes -ge 3){ Check-SelfUpdate; $lastUpdate=Get-Date }

    $controlWrite=''
    if(Test-Path -LiteralPath $ControlFile){ $controlWrite=(Get-Item -LiteralPath $ControlFile).LastWriteTimeUtc.ToString('o') }
    $cmd=$null
    if($controlWrite -and $controlWrite -ne $lastControlWrite){ $cmd=Read-Control; $lastControlWrite=$controlWrite }
    elseif(((Get-Date)-$lastStatus).TotalSeconds -ge 5){ $cmd=Read-Control }

    if($cmd){
      $cmdId=[string]$cmd.commandId
      $target=[string]$cmd.target
      $targetOk=(-not $target -or $target -eq '*' -or $target -eq $AgentId)
      if($cmd.enabled -and $targetOk -and $cmdId -and $cmdId -ne $lastId -and -not (Expired $cmd)){
        $safeId=$cmdId -replace '[^a-zA-Z0-9_-]','_'
        $resultDir=Join-Path $Outbox ((Get-Date -Format 'yyyyMMdd-HHmmss')+'_'+$safeId); Ensure-Dir $resultDir
        Write-Status 'running' 'Komut çalışıyor.' $cmdId; Log "Command start $cmdId"
        $results=@(); $status='ok'; $errorText=''
        try {
          Capture-Screen (Join-Path $resultDir 'before.jpg')
          $i=0; foreach($a in @($cmd.actions)){ $i++; try{$results+=Invoke-Action $a $resultDir $i}catch{$results+=[ordered]@{index=$i;type=[string]$a.type;ok=$false;error=$_.Exception.Message};throw} }
          Capture-Screen (Join-Path $resultDir 'after.jpg'); Capture-Screen $LiveImage
        } catch { $status='error';$errorText=$_.Exception.Message;try{Capture-Screen (Join-Path $resultDir 'error.jpg')}catch{} }
        $lastId=$cmdId; Save-State $lastId $lastControlWrite
        [ordered]@{agentId=$AgentId;version=$script:Version;commandId=$cmdId;status=$status;error=$errorText;finishedAt=(Get-Date).ToUniversalTime().ToString('o');results=$results} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $resultDir 'result.json') -Encoding UTF8
        Write-Status $status (if($status -eq 'ok'){'Komut tamamlandı.'}else{'Hata: '+$errorText}) $cmdId; Log "Command finish $cmdId status=$status"
      }

      $live=$false
      if($cmd.liveMode){
        if($cmd.liveUntil){try{$live=(Get-Date).ToUniversalTime() -lt ([datetime]$cmd.liveUntil).ToUniversalTime()}catch{$live=$false}}else{$live=$true}
      }
      if($live -and ((Get-Date)-$lastLive).TotalMilliseconds -ge $LiveIntervalMs){ try{Capture-Screen $LiveImage;$lastLive=Get-Date}catch{Log ('Live capture error: '+$_.Exception.Message)} }
    }

    if(((Get-Date)-$lastStatus).TotalSeconds -ge 5){Write-Status 'online' 'Canlı bağlantı hazır; komut bekliyor.' $lastId;$lastStatus=Get-Date}
  } catch { Log ('Loop error: '+$_.Exception.Message);try{Write-Status 'warning' $_.Exception.Message $lastId}catch{} }
  Start-Sleep -Milliseconds $PollMs
}
