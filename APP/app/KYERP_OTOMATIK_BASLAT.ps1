$ErrorActionPreference = 'Continue'

$appRoot = $PSScriptRoot
$backendWorker  = Join-Path $appRoot 'KYERP_BACKEND_WORKER.cmd'
$frontendWorker = Join-Path $appRoot 'KYERP_FRONTEND_WORKER.cmd'
$logDir = 'D:\KYERP-YEDEK\LOGS'
$mainLog = Join-Path $logDir 'KYERP_OTOMATIK_BASLAT.log'

function Write-Log {
param([string]$Text)
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Text" |
Add-Content -Path $mainLog -Encoding UTF8
}

function Test-Port {
param([int]$Port)
$tcp = New-Object System.Net.Sockets.TcpClient
try {
$tcp.Connect('127.0.0.1', $Port)
return $true
}
catch {
return $false
}
finally {
$tcp.Dispose()
}
}

Write-Log 'Windows otomatik başlatma çalıştı.'
Start-Sleep -Seconds 12

if (-not (Test-Path $backendWorker)) {
Write-Log "HATA: Backend worker bulunamadı: $backendWorker"
exit
}

if (-not (Test-Path $frontendWorker)) {
Write-Log "HATA: Frontend worker bulunamadı: $frontendWorker"
exit
}

if (-not (Test-Port 3101)) {
Write-Log 'Backend başlatılıyor.'
Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$backendWorker`"" -WindowStyle Hidden
}
else {
Write-Log 'Backend zaten açık.'
}

Start-Sleep -Seconds 3

if (-not (Test-Port 5173)) {
Write-Log 'Frontend başlatılıyor.'
Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$frontendWorker`"" -WindowStyle Hidden
}
else {
Write-Log 'Frontend zaten açık.'
}

$ready = $false

for ($i = 1; $i -le 120; $i++) {
if (Test-Port 5173) {
$ready = $true
break
}
Start-Sleep -Seconds 1
}

if ($ready) {
Write-Log 'Frontend hazır. Tarayıcı açılıyor.'
Start-Process 'http://localhost:5173/muhasebe/yonetim-ozeti'
}
else {
Write-Log 'HATA: Frontend 120 saniye içinde açılmadı.'
}
