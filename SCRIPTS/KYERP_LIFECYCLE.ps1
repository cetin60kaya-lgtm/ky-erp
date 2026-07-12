param(
  [ValidateSet("start","stop","status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$Root = "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ"
$Backend = Join-Path $Root "APP\app\ky-erp-backend"
$Frontend = Join-Path $Root "APP\app\ky-erp-frontend"
$Db = Join-Path $Root "DATA\KYERP.db"
$Storage = Join-Path $Root "STORAGE"
$BackupRoot = "D:\KYERP-YEDEK"

function Stop-Port {
  param([int]$Port)

  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    ForEach-Object {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

function Check-Path {
  param([string]$Path,[string]$Label)

  if (!(Test-Path $Path)) {
    throw "$Label bulunamadi: $Path"
  }
}

Check-Path "$Backend\package.json" "Backend"
Check-Path "$Frontend\package.json" "Frontend"
Check-Path $Db "Veritabani"
Check-Path $Storage "Storage"

if ($Action -eq "stop") {
  Stop-Port 3101
  Stop-Port 5173
  Stop-Port 5174
  Write-Host "KY ERP kapatildi." -ForegroundColor Green
  exit
}

if ($Action -eq "status") {
  Write-Host "Root: $Root"
  Write-Host "Backend: $Backend"
  Write-Host "Frontend: $Frontend"
  Write-Host "DB: $Db"
  Write-Host "Storage: $Storage"
  exit
}

Stop-Port 3101
Stop-Port 5173
Stop-Port 5174

Write-Host "Backend aciliyor..." -ForegroundColor Cyan
Start-Process powershell `
  -WorkingDirectory $Backend `
  -ArgumentList "-NoExit", "-Command", "npm run start:dev"

Start-Sleep -Seconds 8

Write-Host "Frontend aciliyor..." -ForegroundColor Cyan
Start-Process powershell `
  -WorkingDirectory $Frontend `
  -ArgumentList "-NoExit", "-Command", "npm run dev -- --host 0.0.0.0"

Start-Sleep -Seconds 5

Start-Process "http://localhost:5173/"
