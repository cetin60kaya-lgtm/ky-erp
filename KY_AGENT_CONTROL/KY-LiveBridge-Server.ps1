# KY_LIVE_BRIDGE_VERSION=1.0.0
param([string]$ConfigPath="$env:LOCALAPPDATA\KY-LiveBridge\config.json")
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if(-not ('KYBridge.Native' -as [type])){
Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace KYBridge {
  public static class Native {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,int data,UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow);
  }
}
"@
}

$cfg=Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8|ConvertFrom-Json
$AgentId=[string]$cfg.agentId
$Port=[int]$cfg.port
$Secret=[string]$cfg.secret
$Root=Split-Path -Parent $ConfigPath
$Log=Join-Path $Root 'bridge.log'

function Log([string]$m){Add-Content -LiteralPath $Log -Encoding UTF8 -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')+' '+$m)}
function B64UrlDecode([string]$s){$s=$s.Replace('-','+').Replace('_','/');switch($s.Length%4){2{$s+='=='}3{$s+='='}};[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($s))}
function HmacHex([string]$text){$h=New-Object Security.Cryptography.HMACSHA256([Convert]::FromBase64String($Secret));try{([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function QueryMap([string]$q){$o=@{};if($q.StartsWith('?')){$q=$q.Substring(1)};foreach($p in $q -split '&'){if(-not $p){continue};$kv=$p -split '=',2;$k=[uri]::UnescapeDataString($kv[0]);$v=if($kv.Count -gt 1){[uri]::UnescapeDataString($kv[1])}else{''};$o[$k]=$v};$o}
function SecureEq([string]$a,[string]$b){if(-not $a -or -not $b -or $a.Length -ne $b.Length){return $false};$x=0;for($i=0;$i -lt $a.Length;$i++){$x=$x -bor ([int][char]$a[$i] -bxor [int][char]$b[$i])};$x -eq 0}
function Auth([string]$path,$q){
  try{$ts=[int64]$q['ts'];$nonce=[string]$q['nonce'];$sig=[string]$q['sig'];$p=[string]$q['p'];if([Math]::Abs(([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-$ts)) -gt 90){return $false};$expected=HmacHex("$path|$ts|$nonce|$p");return (SecureEq $sig $expected)}catch{return $false}
}
function SendText($stream,[int]$code,[string]$type,[string]$text){$b=[Text.Encoding]::UTF8.GetBytes($text);$head=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $code OK`r`nContent-Type: $type`r`nContent-Length: $($b.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n");$stream.Write($head,0,$head.Length);$stream.Write($b,0,$b.Length)}
function SendBytes($stream,[string]$type,[byte[]]$b){$head=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($b.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n");$stream.Write($head,0,$head.Length);$stream.Write($b,0,$b.Length)}
function CaptureJpeg{
  $r=[Windows.Forms.SystemInformation]::VirtualScreen;$bmp=New-Object Drawing.Bitmap $r.Width,$r.Height;$g=[Drawing.Graphics]::FromImage($bmp)
  try{$g.CopyFromScreen($r.Left,$r.Top,0,0,$r.Size);$ms=New-Object IO.MemoryStream;$codec=[Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object MimeType -eq 'image/jpeg'|Select-Object -First 1;$ep=New-Object Drawing.Imaging.EncoderParameters 1;$ep.Param[0]=New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality,[long]55);$bmp.Save($ms,$codec,$ep);$ms.ToArray()}finally{$g.Dispose();$bmp.Dispose();if($ms){$ms.Dispose()}}
}
function Click([int]$x,[int]$y,[string]$button='left',[int]$count=1){[KYBridge.Native]::SetCursorPos($x,$y)|Out-Null;Start-Sleep -Milliseconds 50;$d=if($button -eq 'right'){0x0008}elseif($button -eq 'middle'){0x0020}else{0x0002};$u=if($button -eq 'right'){0x0010}elseif($button -eq 'middle'){0x0040}else{0x0004};for($i=0;$i -lt [Math]::Max(1,$count);$i++){[KYBridge.Native]::mouse_event($d,0,0,0,[UIntPtr]::Zero);[KYBridge.Native]::mouse_event($u,0,0,0,[UIntPtr]::Zero);if($count -gt 1){Start-Sleep -Milliseconds 100}}}
function TypeText([string]$t){for($i=0;$i -lt 5;$i++){try{[Windows.Forms.Clipboard]::SetText($t);break}catch{Start-Sleep -Milliseconds 100}};[Windows.Forms.SendKeys]::SendWait('^v')}
function FocusWin([string]$proc,[string]$title){$p=Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowHandle -ne 0 -and (-not $proc -or $_.ProcessName -like "*$proc*") -and (-not $title -or $_.MainWindowTitle -like "*$title*")}|Select-Object -First 1;if(-not $p){throw 'Pencere bulunamadi'};[KYBridge.Native]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null;[KYBridge.Native]::SetForegroundWindow($p.MainWindowHandle)|Out-Null}
function RunAction($a){switch([string]$a.type){
  'move'{[KYBridge.Native]::SetCursorPos([int]$a.x,[int]$a.y)|Out-Null;return 'ok'}
  'click'{Click ([int]$a.x) ([int]$a.y) ([string]($a.button ?? 'left')) ([int]($a.count ?? 1));return 'ok'}
  'scroll'{[KYBridge.Native]::mouse_event(0x0800,0,0,[int]$a.delta,[UIntPtr]::Zero);return 'ok'}
  'type'{TypeText ([string]$a.text);return 'ok'}
  'hotkey'{[Windows.Forms.SendKeys]::SendWait([string]$a.keys);return 'ok'}
  'wait'{Start-Sleep -Milliseconds ([int]$a.ms);return 'ok'}
  'focus'{FocusWin ([string]$a.process) ([string]$a.title);return 'ok'}
  'launch'{$p=Start-Process -FilePath ([string]$a.path) -ArgumentList ([string]$a.args) -PassThru;return @{pid=$p.Id}}
  'powershell'{$out=powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ([string]$a.script) 2>&1;return @{output=($out|Out-String)}}
  'windows'{return @(Get-Process|Where-Object{$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle}|ForEach-Object{@{process=$_.ProcessName;pid=$_.Id;title=$_.MainWindowTitle}})}
  default{throw ('Bilinmeyen action: '+[string]$a.type)}
}}

$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port);$listener.Start();Log "START $AgentId port=$Port"
while($true){
  $client=$listener.AcceptTcpClient();$stream=$client.GetStream();try{
    $reader=New-Object IO.StreamReader($stream,[Text.Encoding]::ASCII,$false,4096,$true);$first=$reader.ReadLine();if(-not $first){continue};while(($line=$reader.ReadLine()) -ne $null -and $line -ne ''){}
    $parts=$first -split ' ';$target=$parts[1];$u=[Uri]("http://127.0.0.1:$Port"+$target);$path=$u.AbsolutePath;$q=QueryMap $u.Query
    if(-not(Auth $path $q)){SendText $stream 403 'application/json' '{"ok":false,"error":"forbidden"}';continue}
    if($path -eq '/v1/status'){$r=[Windows.Forms.SystemInformation]::VirtualScreen;$j=@{ok=$true;agentId=$AgentId;computer=$env:COMPUTERNAME;user=$env:USERNAME;screen=@{left=$r.Left;top=$r.Top;width=$r.Width;height=$r.Height};version='1.0.0';at=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 5 -Compress;SendText $stream 200 'application/json' $j;continue}
    if($path -eq '/v1/screen'){SendBytes $stream 'image/jpeg' (CaptureJpeg);continue}
    if($path -eq '/v1/cmd'){$obj=(B64UrlDecode([string]$q['p']))|ConvertFrom-Json;$res=@();foreach($a in @($obj.actions)){try{$res+=@{ok=$true;type=[string]$a.type;data=(RunAction $a)}}catch{$res+=@{ok=$false;type=[string]$a.type;error=$_.Exception.Message}}};$j=@{ok=$true;agentId=$AgentId;results=$res;at=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json -Depth 8 -Compress;SendText $stream 200 'application/json' $j;continue}
    SendText $stream 404 'application/json' '{"ok":false,"error":"not_found"}'
  }catch{try{SendText $stream 500 'application/json' ('{"ok":false,"error":"'+($_.Exception.Message.Replace('"',''))+'"}')}catch{};Log ('ERR '+$_.Exception.Message)}finally{$stream.Dispose();$client.Close()}
}
