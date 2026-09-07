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
