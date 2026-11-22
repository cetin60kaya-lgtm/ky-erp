# KY ERP Desktop single-install integration launcher.
# Bundled Node: no external Node installation or arbitrary npm commands.
# No secrets are written or printed. Folder access is opt-in.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Join-Path $root 'bin\node.exe'
$portal = Join-Path $root 'isnet\server.mjs'
$hubRoot = Join-Path $root 'file-hub-agent'
$grants = Join-Path $env:LOCALAPPDATA 'KY ERP\Desktop\folder-grants.json'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'KY ERP Node runtime eksik.' }
if (-not (Test-Path -LiteralPath $portal -PathType Leaf)) { throw 'İşNet adaptörü paket içinde eksik.' }
$env:KYERP_API_URL = 'https://api.kyerp.net'
$env:KYERP_FOLDER_GRANTS = $grants
$env:KYERP_REQUIRE_LOCAL_FOLDER_GRANTS = '1'
function Start-Agent {
  param([string]$Script, [string]$WorkDir)
  if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) { return }
  # No automatic process kill, remote shell, or Windows firewall changes.
  Start-Process -FilePath $node -ArgumentList ('"' + $Script + '"') -WorkingDirectory $WorkDir -WindowStyle Hidden | Out-Null
}
# Fixed loopback İşNet portal adapter; user enters credentials only through KY ERP.
Start-Agent -Script $portal -WorkDir (Split-Path -Parent $portal)
# Optional 8791 archive starts only when the Windows user already configured
# an absolute, existing approved Drive/local root; it never stores credentials.
$archiveScript = Join-Path $root 'isnet-archive\isnet-drive-yerel.mjs'
$archiveRoot = [Environment]::GetEnvironmentVariable('KY_ISNET_ARCHIVE_ROOT','User')
if (-not $archiveRoot) {
  $archiveRoot = [Environment]::GetEnvironmentVariable('KY_ISNET_ARCHIVE_ROOT','Machine')
}
if ($archiveRoot -and [IO.Path]::IsPathRooted($archiveRoot) -and
    (Test-Path -LiteralPath $archiveRoot -PathType Container) -and
    (Test-Path -LiteralPath $archiveScript -PathType Leaf)) {
  $listener = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 8791 -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) {
    $env:KY_ISNET_ARCHIVE_ROOT = $archiveRoot
    Start-Agent -Script $archiveScript -WorkDir (Split-Path -Parent $archiveScript)
  }
}
# File Hub requires existing authorized secret and explicit local folder grants.
$agentKey = [Environment]::GetEnvironmentVariable('KYERP_AGENT_KEY','User')
if (-not $agentKey) { $agentKey = [Environment]::GetEnvironmentVariable('KYERP_AGENT_KEY','Machine') }
if ($agentKey -and (Test-Path -LiteralPath $grants -PathType Leaf)) {
  $env:KYERP_AGENT_KEY = $agentKey
  if (-not $env:KYERP_MAIN_COMPANY_SLUG) {
    $env:KYERP_MAIN_COMPANY_SLUG = [Environment]::GetEnvironmentVariable('KYERP_MAIN_COMPANY_SLUG','User')
  }
  if ($env:KYERP_MAIN_COMPANY_SLUG) {
    Start-Agent -Script (Join-Path $hubRoot 'file-hub-agent.mjs') -WorkDir $hubRoot
    Start-Agent -Script (Join-Path $hubRoot 'accounting-archive-worker.mjs') -WorkDir $hubRoot
    Start-Agent -Script (Join-Path $hubRoot 'psd-preview-worker.mjs') -WorkDir $hubRoot
  }
}
