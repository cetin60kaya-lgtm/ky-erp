$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$setupOut = Join-Path $root "artifacts\Setup"
$artifacts = Join-Path $root "artifacts"
$version = "2.1.0"

& (Join-Path $root "BUILD.ps1")
if ($LASTEXITCODE -ne 0) { throw "KYERP PDKS build basarisiz." }

$candidates = New-Object System.Collections.Generic.List[string]
if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")) }
if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")) }
if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")) }
$isccCommand = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($isccCommand) { $candidates.Add($isccCommand.Source) }
$iscc = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 bulunamadi. Kurulum paketi icin Inno Setup 6 gereklidir." }

New-Item -ItemType Directory -Force -Path $setupOut | Out-Null
$env:KY_PDKS_ARTIFACTS = $artifacts
$env:KY_PDKS_SETUP_OUT = $setupOut
& $iscc (Join-Path $root "installer\KYERP-PDKS.iss")
if ($LASTEXITCODE -ne 0) { throw "KYERP PDKS setup derlemesi basarisiz." }

$versionedSetup = Join-Path $setupOut "KYERP-PDKS-Setup-$version.exe"
if (-not (Test-Path $versionedSetup)) { throw "Setup olusmadi: $versionedSetup" }
if ((Get-Item $versionedSetup).Length -lt 5MB) { throw "Setup beklenenden kucuk; paket kontrol edilmeli." }

$hash = (Get-FileHash $versionedSetup -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  KYERP-PDKS-Setup-$version.exe" | Set-Content "$versionedSetup.sha256.txt" -Encoding ascii

$finalSetup = Join-Path $setupOut "KYERP-PDKS-Setup.exe"
Copy-Item $versionedSetup $finalSetup -Force
"$hash  KYERP-PDKS-Setup.exe" | Set-Content "$finalSetup.sha256.txt" -Encoding ascii

Write-Host "KYERP PDKS SETUP OK: $finalSetup" -ForegroundColor Green
Write-Host "Versioned setup: $versionedSetup" -ForegroundColor Green
Write-Host "SHA256: $hash" -ForegroundColor Green
