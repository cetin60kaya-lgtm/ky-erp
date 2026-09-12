$ErrorActionPreference = "Stop"
$taskName = "KY ERP System Sentinel Agent"
$root = "$env:ProgramData\KYERP\Sentinel"
try { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue } catch {}
try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
Write-Host "KY Sentinel Agent kaldırıldı." -ForegroundColor Green
