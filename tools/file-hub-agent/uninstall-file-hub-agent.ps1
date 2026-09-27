param(
  [string]$TaskName = "KY ERP File Hub Agent"
)

$ErrorActionPreference = "Stop"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "KY File Hub Agent gorevi zaten kurulu degil."
  exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "KY File Hub Agent Windows otomatik baslatmadan kaldirildi." -ForegroundColor Green
Write-Host "Ortam degiskenleri ve dosyalar silinmedi."
