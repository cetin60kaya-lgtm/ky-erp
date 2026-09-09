param(
  [Parameter(Mandatory=$true)][string]$EnrollmentId,
  [Parameter(Mandatory=$true)][string]$EnrollmentCode,
  [string]$ApiBase = "https://api.kyerp.net",
  [string]$RepoUrl = "https://github.com/cetin60kaya-lgtm/ky-erp.git",
  [int]$PollSeconds = 15
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

$Root = Join-Path $env:LOCALAPPDATA 'KY ERP\BuildAgent'
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentSource = Join-Path $SourceRoot 'build-agent.ps1'
$AgentTarget = Join-Path $Root 'build-agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$TokenPath = Join-Path $Root 'token.dat'
$StartCmd = Join-Path $Root 'KY Build Agent Baslat.cmd'
$StartupDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
$StartupCmd = Join-Path $StartupDir 'KY ERP Build Agent.cmd'

if (-not (Test-Path $AgentSource)) { throw "Build Agent scripti bulunamadı: $AgentSource" }
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git bulunamadı.' }
if (-not (Get-Command dotnet.exe -ErrorAction SilentlyContinue)) { throw '.NET 8 SDK bulunamadı.' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js bulunamadı.' }

New-Item $Root -ItemType Directory -Force | Out-Null
Copy-Item $AgentSource $AgentTarget -Force

$agentId = [Guid]::NewGuid().ToString('N')
$agentName = "BUILD-$env:COMPUTERNAME-$env:USERNAME"
$enrollBody = @{
  enrollmentId=$EnrollmentId
  enrollmentCode=$EnrollmentCode
  agentId=$agentId
  agentName=$agentName
} | ConvertTo-Json -Compress

$enroll = Invoke-RestMethod -Method Post -Uri ($ApiBase.TrimEnd('/') + '/api/build-agent/enroll') -ContentType 'application/json' -Body $enrollBody -TimeoutSec 60
if ($enroll.ok -ne $true -or -not $enroll.data.agentToken -or -not $enroll.data.agentId) {
  throw 'Build Agent enrollment tamamlanamadı.'
}
$agentId = [string]$enroll.data.agentId
$agentToken = [string]$enroll.data.agentToken

@{
  apiBase=$ApiBase.TrimEnd('/')
  repoUrl=$RepoUrl
  agentId=$agentId
  agentName=$agentName
  pollSeconds=[Math]::Max(10,$PollSeconds)
  installedAt=(Get-Date).ToString('o')
} | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Encoding UTF8

$secure = ConvertTo-SecureString $agentToken -AsPlainText -Force
$secure | ConvertFrom-SecureString | Set-Content $TokenPath -Encoding ASCII

@"
@echo off
title KY ERP Build Agent
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$AgentTarget"
pause
"@ | Set-Content $StartCmd -Encoding ASCII

New-Item $StartupDir -ItemType Directory -Force | Out-Null
@"
@echo off
start "" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$AgentTarget"
"@ | Set-Content $StartupCmd -Encoding ASCII

Write-Host "KY Build Agent kuruldu." -ForegroundColor Green
Write-Host "Klasör  : $Root"
Write-Host "Agent ID: $agentId"
Write-Host "Başlat  : $StartCmd"
Write-Host "Otomatik: Windows oturum açılışında kullanıcı bağlamında çalışır." -ForegroundColor Cyan

Start-Process -FilePath $StartCmd
