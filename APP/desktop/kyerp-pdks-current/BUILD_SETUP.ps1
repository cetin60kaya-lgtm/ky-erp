$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupOut = Join-Path $root "artifacts\Setup"
$artifacts = Join-Path $root "artifacts"
$isccCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
) | Where-Object { $_ -and (Test-Path $_) }

& (Join-Path $root "BUILD.ps1")
if ($LASTEXITCODE -ne 0) { throw "KYERP PDKS build basarisiz." }

$iscc = $isccCandidates | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 bulunamadi. Kurulum paketi icin Inno Setup 6 gereklidir." }

New-Item -ItemType Directory -Force -Path $setupOut | Out-Null
$env:KY_PDKS_ARTIFACTS = $artifacts
$env:KY_PDKS_SETUP_OUT = $setupOut
& $iscc (Join-Path $root "installer\KYERP-PDKS.iss")
if ($LASTEXITCODE -ne 0) { throw "KYERP PDKS setup derlemesi basarisiz." }

$setup = Join-Path $setupOut "KYERP-PDKS-Setup-2.0.0.exe"
if (-not (Test-Path $setup)) { throw "Setup olusmadi: $setup" }
if ((Get-Item $setup).Length -lt 5MB) { throw "Setup beklenenden kucuk; paket kontrol edilmeli." }

$hash = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  KYERP-PDKS-Setup-2.0.0.exe" | Set-Content "$setup.sha256.txt" -Encoding ascii
Write-Host "KYERP PDKS SETUP OK: $setup" -ForegroundColor Green
Write-Host "SHA256: $hash" -ForegroundColor Green
