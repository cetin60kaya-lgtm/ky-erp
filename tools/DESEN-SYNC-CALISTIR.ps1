param(
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$mutex = New-Object System.Threading.Mutex($false, 'Local\KYERP_DESEN_SYNC_V2')
$hasMutex = $false
try {
  $hasMutex = $mutex.WaitOne(0)
  if (-not $hasMutex) { exit 0 }

  $localRoot = Join-Path $env:LOCALAPPDATA 'KYERP\DesenSync'
  $configPath = Join-Path $localRoot 'config.json'
  $credentialPath = Join-Path $localRoot 'credential.xml'
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Desen Sync kurulumu bulunamadı. Önce tools\DESEN-SISTEM-KUR.bat çalıştırın."
  }
  if (-not (Test-Path -LiteralPath $credentialPath)) {
    throw "KY ERP Desen Sync kullanıcı bilgisi bulunamadı. Kurulumu yeniden çalıştırın."
  }

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $credential = Import-Clixml -LiteralPath $credentialPath
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
  }

  $scriptPath = Join-Path $PSScriptRoot 'desen-sync\desen-sync.mjs'
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Desen Sync motoru bulunamadı: $scriptPath"
  }

  $env:KYERP_DESEN_ROOT = [string]$config.desenRoot
  $env:KYERP_API_URL = 'https://api.kyerp.net'
  $env:KYERP_COMPANY = 'mecit-hakan'
  $env:KYERP_USER = $credential.UserName
  $env:KYERP_PASSWORD = $plainPassword
  $env:KYERP_DESEN_POLL_MS = '4000'
  if ($Once) { $env:KYERP_DESEN_ONCE = '1' } else { Remove-Item Env:KYERP_DESEN_ONCE -ErrorAction SilentlyContinue }

  do {
    & node $scriptPath $(if ($Once) { '--once' } else { @() })
    $exitCode = $LASTEXITCODE
    if ($Once -or $exitCode -eq 0) { break }
    Start-Sleep -Seconds 15
  } while ($true)
} finally {
  Remove-Item Env:KYERP_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:KYERP_USER -ErrorAction SilentlyContinue
  $plainPassword = $null
  if ($hasMutex) {
    try { $mutex.ReleaseMutex() | Out-Null } catch {}
  }
  $mutex.Dispose()
}
