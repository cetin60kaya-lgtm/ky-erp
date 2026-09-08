param(
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$ApiBase = "https://api.kyerp.net",
  [string]$RepoUrl = "https://github.com/cetin60kaya-lgtm/ky-erp.git",
  [int]$PollSeconds = 15
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

$Root = Join-Path $env:LOCALAPPDATA 'KY ERP\BuildAgent'
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentSource = Join-Path $SourceRoot 'build-agent.ps1'
$AgentTarget = Join-Path $Root 'build-agent.ps1'
$ConfigPath = Join-Path $Root 'config.json'
$TokenPath = Join-Path $Root 'token.dat'
$StartCmd = Join-Path $Root 'KY Build Agent Baslat.cmd'

if (-not (Test-Path $AgentSource)) { throw "Build Agent scripti bulunamadı: $AgentSource" }
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git bulunamadı. Build Agent özel GitHub deposunu kullanıcı kimliğinizle okumak için Git gerektirir.' }

New-Item $Root -ItemType Directory -Force | Out-Null
Copy-Item $AgentSource $AgentTarget -Force

@{
  apiBase=$ApiBase.TrimEnd('/')
  repoUrl=$RepoUrl
  agentName="BUILD-$env:COMPUTERNAME-$env:USERNAME"
  pollSeconds=[Math]::Max(10,$PollSeconds)
  installedAt=(Get-Date).ToString('o')
} | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Encoding UTF8

$secure = ConvertTo-SecureString $Token -AsPlainText -Force
$secure | ConvertFrom-SecureString | Set-Content $TokenPath -Encoding ASCII

@"
@echo off
title KY ERP Build Agent
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$AgentTarget"
pause
"@ | Set-Content $StartCmd -Encoding ASCII

Write-Host "KY Build Agent hazırlandı." -ForegroundColor Green
Write-Host "Klasör : $Root"
Write-Host "Başlat : $StartCmd"
Write-Host "Agent  : BUILD-$env:COMPUTERNAME-$env:USERNAME"
Write-Host "Build bilgisayarında bu pencere açıkken Sürüm Merkezi talepleri otomatik alınır." -ForegroundColor Cyan

Start-Process -FilePath $StartCmd
