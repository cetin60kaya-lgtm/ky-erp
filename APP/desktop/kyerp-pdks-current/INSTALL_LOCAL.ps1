param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'KYERP\PDKS'),
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SkipBuild) {
    & (Join-Path $root 'BUILD.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'PDKS build basarisiz.' }
}

$appSource = Join-Path $root 'artifacts\Personel'
$appExe = Join-Path $appSource 'KYERP.PDKS.exe'
if (-not (Test-Path $appExe)) { throw 'KYERP.PDKS.exe publish ciktilari bulunamadi.' }

if (Test-Path $InstallRoot) {
    $backup = $InstallRoot + '_ESKI_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
    Move-Item $InstallRoot $backup
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item (Join-Path $appSource '*') $InstallRoot -Recurse -Force

$ocx = Join-Path $InstallRoot 'TerminalSdk\FP_CLOCK.ocx'
if (Test-Path $ocx) {
    $regsvr32 = Join-Path $env:WINDIR 'SysWOW64\regsvr32.exe'
    if (-not (Test-Path $regsvr32)) { $regsvr32 = Join-Path $env:WINDIR 'System32\regsvr32.exe' }
    try {
        $p = Start-Process -FilePath $regsvr32 -ArgumentList @('/s', $ocx) -Wait -PassThru -Verb RunAs
        if ($p.ExitCode -ne 0) { Write-Warning "FP_CLOCK.ocx kaydi basarisiz. ExitCode=$($p.ExitCode)" }
        else { Write-Host 'Terminal SDK (FP_CLOCK.ocx) 32-bit olarak kaydedildi.' -ForegroundColor Green }
    } catch {
        Write-Warning "Terminal SDK kaydi yapilamadi: $($_.Exception.Message)"
    }
}

$installedExe = Join-Path $InstallRoot 'KYERP.PDKS.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop 'KY PDKS 6.0.lnk'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $installedExe
$link.WorkingDirectory = $InstallRoot
$link.IconLocation = $installedExe + ',0'
$link.Description = 'KY PDKS 6.0'
$link.Save()

Write-Host "KY PDKS 6.0 kuruldu: $InstallRoot" -ForegroundColor Green
Write-Host "Masaustu kisayolu: $linkPath" -ForegroundColor Green
Write-Host 'Veri klasoru uygulama disinda Hakan Emprime veri kokunde korunur.' -ForegroundColor Green
