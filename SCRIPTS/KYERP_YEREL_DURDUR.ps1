[CmdletBinding()]
param(
    [switch]$ForcePorts,
    [int]$ApiPort = 8787,
    [int]$WebPort = 5173
)

$ErrorActionPreference = "Stop"
$ProcessFile = Join-Path $env:TEMP "kyerp-local-processes.json"
$stopped = New-Object System.Collections.Generic.List[int]

function Stop-SafeProcess([int]$ProcessId) {
    if ($ProcessId -le 0 -or $stopped.Contains($ProcessId)) { return }
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $process) { return }
    if ($process.ProcessName -notin @("powershell", "pwsh", "node")) {
        Write-Warning "PID $ProcessId ($($process.ProcessName)) KY ERP işlemi gibi görünmüyor; kapatılmadı."
        return
    }
    Stop-Process -Id $ProcessId -Force
    $stopped.Add($ProcessId)
    Write-Host "Durduruldu: PID $ProcessId ($($process.ProcessName))" -ForegroundColor Green
}

if (Test-Path $ProcessFile) {
    try {
        $state = Get-Content $ProcessFile -Raw | ConvertFrom-Json
        Stop-SafeProcess ([int]$state.apiPid)
        Stop-SafeProcess ([int]$state.webPid)
    } catch {
        Write-Warning "Kayıtlı işlem bilgisi okunamadı: $($_.Exception.Message)"
    }
    Remove-Item $ProcessFile -Force -ErrorAction SilentlyContinue
}

if ($ForcePorts) {
    foreach ($port in @($ApiPort, $WebPort)) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-SafeProcess ([int]$_) }
    }
}

if ($stopped.Count -eq 0) {
    Write-Host "Çalışan KY ERP yerel işlemi bulunamadı." -ForegroundColor Yellow
} else {
    Write-Host "`nKY ERP yerel servisleri kapatıldı." -ForegroundColor Cyan
}
