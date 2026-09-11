param(
  [Parameter(Mandatory=$true)][string]$ExePath,
  [switch]$Uninstall
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$ServiceName='KYERP.PDKS.Agent'
$DisplayName='KY ERP PDKS Agent'

function Invoke-Sc {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  & sc.exe @Args | Out-Host
  return $LASTEXITCODE
}

function Service-Exists {
  & sc.exe query $ServiceName *> $null
  return $LASTEXITCODE -eq 0
}

function Wait-ServiceGone([int]$Seconds=20) {
  $limit=(Get-Date).AddSeconds($Seconds)
  while((Get-Date)-lt $limit) {
    if(-not (Service-Exists)) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$ServiceName servisi Windows'tan zamaninda temizlenemedi."
}

if(Service-Exists) {
  try { Invoke-Sc stop $ServiceName | Out-Null } catch {}
  $limit=(Get-Date).AddSeconds(15)
  do {
    $svc=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if(-not $svc -or $svc.Status -eq 'Stopped') { break }
    Start-Sleep -Milliseconds 500
  } while((Get-Date)-lt $limit)

  Invoke-Sc delete $ServiceName | Out-Null
  Wait-ServiceGone
}

if($Uninstall) {
  Write-Host "$ServiceName kaldırıldı."
  exit 0
}

$resolved=(Resolve-Path -LiteralPath $ExePath).Path
if(-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
  throw "PDKS Agent EXE bulunamadı: $resolved"
}

# FP_CLOCK üretici çalışma zamanı yalnız bir kez eski kurulumdan KY PDKS alanına taşınır.
# Bundan sonraki çalışma Hedef500 uygulamasını, timerecords.txt dosyasını veya eski EXE'leri kullanmaz.
$agentDir=Split-Path -Parent $resolved
$runtimeDir=Join-Path $agentDir 'DeviceBridge\runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Find-RuntimeSource {
  param([string]$EnvName,[string[]]$Candidates)
  $fromEnv=[Environment]::GetEnvironmentVariable($EnvName)
  if($fromEnv -and (Test-Path -LiteralPath $fromEnv -PathType Leaf)) { return (Resolve-Path -LiteralPath $fromEnv).Path }
  foreach($candidate in $Candidates) {
    if($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).Path }
  }
  return $null
}

$fpTarget=Join-Path $runtimeDir 'FP_CLOCK.ocx'
$tmpTarget=Join-Path $runtimeDir 'TMPCCOMM.dll'
$chTarget=Join-Path $runtimeDir 'CH375DLL.DLL'

if(-not (Test-Path -LiteralPath $fpTarget -PathType Leaf)) {
  $src=Find-RuntimeSource 'KY_PDKS_FP_CLOCK_OCX' @(
    'C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx',
    'D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx'
  )
  if($src) { Copy-Item -LiteralPath $src -Destination $fpTarget -Force }
}
if(-not (Test-Path -LiteralPath $tmpTarget -PathType Leaf)) {
  $src=Find-RuntimeSource 'KY_PDKS_TMPCCOMM_DLL' @(
    'C:\Hedef500\Terminal Bilgi Aktar\support\TMPCCOMM.dll',
    'D:\personel yedek son\Terminal Bilgi Aktar\support\TMPCCOMM.dll'
  )
  if($src) { Copy-Item -LiteralPath $src -Destination $tmpTarget -Force }
}
if(-not (Test-Path -LiteralPath $chTarget -PathType Leaf)) {
  $src=Find-RuntimeSource 'KY_PDKS_CH375_DLL' @(
    'C:\Hedef500\Terminal Bilgi Aktar\support\CH375DLL.DLL',
    'D:\personel yedek son\Terminal Bilgi Aktar\support\CH375DLL.DLL',
    'C:\Program Files\SAi\SAi Production Suite 21\Program\CH375DLL.DLL',
    'C:\Program Files (x86)\SAi\SAi Production Suite 21\Program\CH375DLL.DLL'
  )
  if($src) { Copy-Item -LiteralPath $src -Destination $chTarget -Force }
}

if(-not (Test-Path -LiteralPath $fpTarget -PathType Leaf) -or -not (Test-Path -LiteralPath $tmpTarget -PathType Leaf)) {
  throw 'FP_CLOCK üretici çalışma zamanı bulunamadı. Eski Terminal Bilgi Aktar support klasörü veya KY_PDKS_FP_CLOCK_OCX/KY_PDKS_TMPCCOMM_DLL kaynakları gerekli.'
}
Write-Host "FP_CLOCK runtime hazır: $runtimeDir (Hedef500 çalışma bağımlılığı yok)."

$quoted='"'+$resolved+'"'
$create=Invoke-Sc create $ServiceName "binPath= $quoted" "start= delayed-auto" "DisplayName= $DisplayName"
if($create -ne 0) { throw "PDKS Agent servis kaydı oluşturulamadı. Kod=$create" }

Invoke-Sc description $ServiceName "KY ERP kart terminali toplama, offline kuyruk ve D1 HTTPS senkron servisi" | Out-Null
Invoke-Sc failure $ServiceName "reset= 86400" "actions= restart/5000/restart/15000/restart/30000" | Out-Null
Invoke-Sc failureflag $ServiceName 1 | Out-Null

$start=Invoke-Sc start $ServiceName
if($start -ne 0) { throw "PDKS Agent başlatılamadı. Kod=$start" }

$limit=(Get-Date).AddSeconds(20)
do {
  $svc=Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if($svc -and $svc.Status -eq 'Running') {
    Write-Host "$ServiceName çalışıyor. EXE=$resolved"
    exit 0
  }
  Start-Sleep -Milliseconds 500
} while((Get-Date)-lt $limit)

throw "$ServiceName başlatıldı ancak Running durumuna geçmedi."
