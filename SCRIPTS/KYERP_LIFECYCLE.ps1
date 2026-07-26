param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "restart")]
  [string]$Action = "status",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "APP\app\ky-erp-backend"
$Frontend = Join-Path $Root "APP\app\ky-erp-frontend"
$Runtime = Join-Path $Root "TEMP\runtime"
$Logs = Join-Path $Root "LOGS"
$DatabaseCheck = Join-Path $PSScriptRoot "KYERP_DATABASE_GUVENCE.ps1"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Stop-ProcessTree {
  param([int]$ProcessId)
  $children = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $ProcessId } |
    Select-Object -ExpandProperty ProcessId)
  foreach ($childId in $children) {
    Stop-ProcessTree -ProcessId ([int]$childId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-KyErpProcesses {
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($pidFileName in @("backend.pid", "frontend.pid")) {
    $pidFile = Join-Path $Runtime $pidFileName
    if (Test-Path -LiteralPath $pidFile) {
      $savedId = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($savedId -match "^\d+$") { [void]$ids.Add([int]$savedId) }
      Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
  }

  $rootPattern = [regex]::Escape($Root)
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -match $rootPattern -and
      $_.CommandLine -match "ky-erp-(backend|frontend)" -and
      $_.ProcessId -ne $PID
    } |
    ForEach-Object { [void]$ids.Add([int]$_.ProcessId) }

  foreach ($port in 3101, 5173) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      ForEach-Object { [void]$ids.Add([int]$_) }
  }
  foreach ($processId in @($ids)) {
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
      Stop-ProcessTree -ProcessId $processId
    }
  }
  Start-Sleep -Milliseconds 500
}

function Get-PortStatus {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) { return "CALISIYOR (PID $($listener.OwningProcess))" }
  return "KAPALI"
}

function Show-Status {
  [pscustomobject]@{
    Backend3101 = Get-PortStatus 3101
    Frontend5173 = Get-PortStatus 5173
    Database = if (Test-Path -LiteralPath (Join-Path $Root "DATA\KYERP.db")) { "MEVCUT" } else { "EKSIK" }
  } | Format-List
}

function Wait-HttpReady {
  param([string]$Uri, [int]$TimeoutSeconds = 45)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 3 -UseBasicParsing
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {}
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  throw "Servis zamaninda hazir olmadi: $Uri"
}

function Start-KyErp {
  Stop-KyErpProcesses
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DatabaseCheck -Action check
  if ($LASTEXITCODE -ne 0) { throw "Veritabani guvence kontrolu basarisiz." }

  # Yalnizca yerel gelistirme servisinde ADMIN kod araclarini etkinlestirir.
  # Backend ayrica NODE_ENV=production ortaminda bu yetkiyi kesin olarak kapatir.
  $env:AI_DEVELOPER_MODE = "true"
  $env:OPENAI_DEVELOPER_MAX_OUTPUT_TOKENS = "8000"
  $backendProcess = Start-Process "cmd.exe" -ArgumentList "/c", "npm run start:dev" -WorkingDirectory $Backend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs "backend-hidden.log") -RedirectStandardError (Join-Path $Logs "backend-hidden-error.log") -PassThru
  $backendProcess.Id | Set-Content -Encoding ASCII (Join-Path $Runtime "backend.pid")
  Wait-HttpReady -Uri "http://127.0.0.1:3101/api/health"

  $frontendProcess = Start-Process "cmd.exe" -ArgumentList "/c", "npm run dev -- --host 0.0.0.0" -WorkingDirectory $Frontend -WindowStyle Hidden -RedirectStandardOutput (Join-Path $Logs "frontend-hidden.log") -RedirectStandardError (Join-Path $Logs "frontend-hidden-error.log") -PassThru
  $frontendProcess.Id | Set-Content -Encoding ASCII (Join-Path $Runtime "frontend.pid")
  Wait-HttpReady -Uri "http://127.0.0.1:5173"
  Show-Status
  if (-not $NoBrowser) { Start-Process "http://localhost:5173" }
}

switch ($Action) {
  "start" { Start-KyErp }
  "stop" { Stop-KyErpProcesses; Show-Status }
  "restart" { Stop-KyErpProcesses; Start-KyErp }
  "status" { Show-Status }
}
