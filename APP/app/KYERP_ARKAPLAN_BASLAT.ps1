$ErrorActionPreference = "Continue"

$appRoot  = "D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\APP\app"
$backend  = Join-Path $appRoot "ky-erp-backend"
$frontend = Join-Path $appRoot "ky-erp-frontend"
$logDir   = "D:\KYERP-YEDEK\LOGS"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$mainLog     = Join-Path $logDir "KYERP_ARKAPLAN_BASLAT.log"
$backendLog  = Join-Path $logDir "KYERP_BACKEND.log"
$frontendLog = Join-Path $logDir "KYERP_FRONTEND.log"

function Write-KyLog {
param([string]$Message)
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message" |
Add-Content -Path $mainLog -Encoding UTF8
}

function Test-KyPort {
param([int]$Port)

```
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect("127.0.0.1", $Port)
    $client.Dispose()
    return $true
}
catch {
    return $false
}
```

}

function Test-KyHttp {
param([string]$Url)

```
try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
}
catch {
    return $false
}
```

}

Write-KyLog "Başlatma isteği geldi."

if (-not (Test-Path "$backend\package.json")) {
Write-KyLog "HATA: Backend bulunamadı: $backend"
exit
}

if (-not (Test-Path "$frontend\package.json")) {
Write-KyLog "HATA: Frontend bulunamadı: $frontend"
exit
}

if (-not (Test-KyPort 3101)) {
Write-KyLog "Backend başlatılıyor."

```
Start-Process `
    -FilePath "cmd.exe" `
    -WorkingDirectory $backend `
    -WindowStyle Hidden `
    -ArgumentList "/c", "npm.cmd run start:dev >> `"$backendLog`" 2>&1"
```

}
else {
Write-KyLog "Backend zaten açık."
}

if (-not (Test-KyPort 5173)) {
Write-KyLog "Frontend başlatılıyor."

```
Start-Process `
    -FilePath "cmd.exe" `
    -WorkingDirectory $frontend `
    -WindowStyle Hidden `
    -ArgumentList "/c", "npm.cmd run dev -- --host 0.0.0.0 >> `"$frontendLog`" 2>&1"
```

}
else {
Write-KyLog "Frontend zaten açık."
}

$ready = $false

for ($i = 1; $i -le 120; $i++) {
if (Test-KyHttp "http://127.0.0.1:5173") {
$ready = $true
break
}

```
Start-Sleep -Seconds 1
```

}

if ($ready) {
Write-KyLog "Frontend hazır. Tarayıcı açılıyor."
Start-Process "http://localhost:5173/muhasebe/yonetim-ozeti"
}
else {
Write-KyLog "HATA: Frontend 120 saniye içinde hazır olmadı."
}
