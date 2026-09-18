# KY Agent Live installer v2.0.2
$ErrorActionPreference='Stop'

$AgentId=[string]$env:KY_AGENT_ID
if(-not $AgentId){$AgentId=Read-Host 'Cihaz adi (ornegin desen-pc-01)'}
$AgentId=$AgentId.Trim().ToLowerInvariant()
if($AgentId -notmatch '^[a-z0-9][a-z0-9-]{2,48}$'){throw 'Cihaz adi gecersiz. Ornek: desen-pc-01'}

$relative="OTOMASYON\KY-CONTROL\DEVICES\$AgentId"
$DeviceDir=[string]$env:KY_AGENT_DEVICE_DIR

function Add-Candidate([System.Collections.Generic.List[string]]$List,[string]$Path){
  if($Path -and -not $List.Contains($Path)){$List.Add($Path)}
}

if(-not $DeviceDir){
  $candidates=New-Object 'System.Collections.Generic.List[string]'
  foreach($drive in @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)){
    $root=$drive.Root
    Add-Candidate $candidates (Join-Path $root ("GoogleDrive\Hakan Emp\"+$relative))
    Add-Candidate $candidates (Join-Path $root ("Google Drive\Hakan Emp\"+$relative))
    Add-Candidate $candidates (Join-Path $root ("Hakan Emp\"+$relative))
    Add-Candidate $candidates (Join-Path $root ("My Drive\"+$relative))
    Add-Candidate $candidates (Join-Path $root $relative)
  }
  Add-Candidate $candidates (Join-Path $env:USERPROFILE ("Google Drive\Hakan Emp\"+$relative))
  Add-Candidate $candidates (Join-Path $env:USERPROFILE ("My Drive\"+$relative))

  $DeviceDir=$candidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1

  if(-not $DeviceDir){
    $knownParent='D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL\DEVICES'
    if(Test-Path -LiteralPath $knownParent){
      $DeviceDir=Join-Path $knownParent $AgentId
      New-Item -ItemType Directory -Path $DeviceDir -Force|Out-Null
    }
  }
}

if(-not $DeviceDir){
  throw "KY-CONTROL Drive klasoru bulunamadi. Google Drive senkronunu ac veya komuttan once `$env:KY_AGENT_DEVICE_DIR='tam_yol' ayarla."
}

$DeviceDir=(Resolve-Path -LiteralPath $DeviceDir).Path
$Outbox=Join-Path $DeviceDir 'OUTBOX'
New-Item -ItemType Directory -Path $Outbox -Force|Out-Null
$ControlFile=Join-Path $DeviceDir 'control.json'

# Buluttaki control.json yeni olusturulduysa Drive'in indirmesine zaman ver.
if(-not(Test-Path -LiteralPath $ControlFile)){
  Write-Host 'Drive control.json bekleniyor...' -ForegroundColor Cyan
  for($i=0;$i -lt 40 -and -not(Test-Path -LiteralPath $ControlFile);$i++){
    Start-Sleep -Milliseconds 500
  }
}
if(-not(Test-Path -LiteralPath $ControlFile)){
  [ordered]@{version=1;enabled=$false;target=$AgentId;commandId='idle-local';expiresAt='2099-12-31T23:59:59Z';liveMode=$false;liveUntil=$null;actions=@()} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ControlFile -Encoding UTF8
}

$InstallRoot=Join-Path $env:LOCALAPPDATA 'KY-Agent'
New-Item -ItemType Directory -Path $InstallRoot -Force|Out-Null
$AgentPath=Join-Path $InstallRoot 'KY-Agent-Live.ps1'
$ConfigPath=Join-Path $InstallRoot 'config.json'
$AgentUrl='https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/main/KY_AGENT_CONTROL/KY-Agent-Live.ps1'

Write-Host 'KY Agent indiriliyor...' -ForegroundColor Cyan
Invoke-WebRequest -UseBasicParsing -Uri ($AgentUrl+'?t='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Headers @{'Cache-Control'='no-cache'} -OutFile $AgentPath

$config=[ordered]@{
  agentId=$AgentId
  deviceDir=$DeviceDir
  controlFile=$ControlFile
  outbox=$Outbox
  liveImage=(Join-Path $DeviceDir 'LIVE.jpg')
  liveMeta=(Join-Path $DeviceDir 'LIVE.json')
  statusFile=(Join-Path $DeviceDir 'status.json')
  pollMs=300
  liveIntervalMs=1200
  selfUpdateUrl=$AgentUrl
}
$config|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ConfigPath -Encoding UTF8

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like '*KY-Agent-Live.ps1*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
Start-Sleep -Milliseconds 400

$runKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runCmd='powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "'+$AgentPath+'" -ConfigPath "'+$ConfigPath+'"'
New-Item -Path $runKey -Force|Out-Null
Set-ItemProperty -Path $runKey -Name 'KYAgentLive' -Value $runCmd

$desktop=[Environment]::GetFolderPath('Desktop')
$stopCmd=Join-Path $desktop 'KY_AGENT_DURDUR.cmd'
$resumeCmd=Join-Path $desktop 'KY_AGENT_DEVAM.cmd'
('@echo off'+[Environment]::NewLine+'type nul > "'+(Join-Path $InstallRoot 'STOP')+'"'+[Environment]::NewLine+'echo KY Agent DURDURULDU'+[Environment]::NewLine+'pause') | Set-Content -LiteralPath $stopCmd -Encoding ASCII
('@echo off'+[Environment]::NewLine+'del /f /q "'+(Join-Path $InstallRoot 'STOP')+'" 2>nul'+[Environment]::NewLine+'echo KY Agent AKTIF'+[Environment]::NewLine+'pause') | Set-Content -LiteralPath $resumeCmd -Encoding ASCII

Remove-Item (Join-Path $InstallRoot 'STOP') -Force -ErrorAction SilentlyContinue
Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',('"'+$AgentPath+'"'),'-ConfigPath',('"'+$ConfigPath+'"'))

Write-Host 'Ajan baslatildi, durum bekleniyor...' -ForegroundColor Cyan
$statusFile=Join-Path $DeviceDir 'status.json'
$ok=$false
for($i=0;$i -lt 20;$i++){
  Start-Sleep -Milliseconds 500
  if(Test-Path -LiteralPath $statusFile){
    try{$s=Get-Content $statusFile -Raw -Encoding UTF8|ConvertFrom-Json;if($s.agentId -eq $AgentId){$ok=$true;break}}catch{}
  }
}

if($ok){
  Write-Host ''
  Write-Host 'KY AGENT LIVE HAZIR' -ForegroundColor Green
  Write-Host ('Cihaz : '+$AgentId)
  Write-Host ('Drive : '+$DeviceDir)
  Write-Host ('Durum : '+$statusFile)
  Write-Host ('Ekran : '+(Join-Path $DeviceDir 'LIVE.jpg'))
  Write-Host 'Bilgisayar acildiginda otomatik baslayacak.'
}else{
  Write-Warning ('Ajan kuruldu ama status.json henuz olusmadi. Log: '+(Join-Path $InstallRoot 'agent.log'))
}
