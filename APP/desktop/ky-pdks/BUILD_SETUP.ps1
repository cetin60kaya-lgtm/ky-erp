param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $Root 'dist'
$DesktopProject = Join-Path $Root 'src\KyPdks.Desktop\KyPdks.Desktop.csproj'
$AgentProject = Join-Path $Root 'src\KyPdks.Agent\KyPdks.Agent.csproj'
$SharedProject = Join-Path $Root 'src\KyPdks.Shared\KyPdks.Shared.csproj'
$TestProject = Join-Path $Root 'src\KyPdks.Tests\KyPdks.Tests.csproj'
$DesktopOut = Join-Path $Dist 'desktop'
$AgentOut = Join-Path $Dist 'agent'
$InstallerOut = Join-Path $Dist 'setup'

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label başarısız oldu. Hata kodu: $LASTEXITCODE"
    }
}

Write-Host 'KY PDKS Windows build başlıyor...' -ForegroundColor Cyan

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET 8 SDK bulunamadı.' }

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item $DesktopOut -ItemType Directory -Force | Out-Null
New-Item $AgentOut -ItemType Directory -Force | Out-Null
New-Item $InstallerOut -ItemType Directory -Force | Out-Null

Write-Host '1/5 Restore ve derleme...' -ForegroundColor Cyan
Invoke-Native 'Shared restore' { dotnet restore $SharedProject }
Invoke-Native 'Agent restore' { dotnet restore $AgentProject }
Invoke-Native 'Desktop restore' { dotnet restore $DesktopProject }
if (Test-Path $TestProject) { Invoke-Native 'Test restore' { dotnet restore $TestProject } }

Invoke-Native 'Shared build' { dotnet build $SharedProject -c Release --no-restore }
Invoke-Native 'Agent build' { dotnet build $AgentProject -c Release --no-restore }
Invoke-Native 'Desktop build' { dotnet build $DesktopProject -c Release --no-restore }

if (-not $SkipTests -and (Test-Path $TestProject)) {
    Write-Host '2/5 Testler...' -ForegroundColor Cyan
    Invoke-Native 'xUnit test' { dotnet test $TestProject -c Release --no-restore }
} else {
    Write-Host '2/5 Testler atlandı.' -ForegroundColor Yellow
}

Write-Host '3/5 Self-contained Windows publish...' -ForegroundColor Cyan
Invoke-Native 'Desktop publish' { dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $DesktopOut }
Invoke-Native 'Agent publish' { dotnet publish $AgentProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $AgentOut }

$DesktopExe = Join-Path $DesktopOut 'KY PDKS.exe'
$AgentExe = Join-Path $AgentOut 'KYERP.PDKS.Agent.exe'
if (-not (Test-Path $DesktopExe)) { throw "Masaüstü uygulama oluşmadı: $DesktopExe" }
if (-not (Test-Path $AgentExe)) { throw "Agent oluşmadı: $AgentExe" }

Write-Host '4/5 Inno Setup...' -ForegroundColor Cyan
$ProgramFilesX86 = ${env:ProgramFiles(x86)}
$InnoCandidates = @(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe' }),
    $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 'Inno Setup 6\ISCC.exe' }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe' })
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $InnoCandidates) {
    throw 'Inno Setup 6 bulunamadı. Setup.exe üretilemedi.'
}

$env:KY_PDKS_DIST = $Dist
$env:KY_PDKS_SETUP_OUT = $InstallerOut
$InnoExe = $InnoCandidates[0]
$InnoScript = Join-Path $Root 'installer\KY-PDKS.iss'
Invoke-Native 'Inno Setup' { & $InnoExe $InnoScript }

$Setup = Get-ChildItem $InstallerOut -Filter 'KY-PDKS-Setup-1.3.0.exe' | Select-Object -First 1
if (-not $Setup) { throw 'KY-PDKS-Setup-1.3.0.exe oluşmadı.' }

Write-Host '5/5 Bütünlük özeti...' -ForegroundColor Cyan
$Hash = (Get-FileHash $Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$HashFile = "$($Setup.FullName).sha256.txt"
"$Hash  $($Setup.Name)" | Set-Content -Path $HashFile -Encoding ascii

$BuildInfo = [ordered]@{
    product = 'KY PDKS'
    version = '1.3.0'
    builtAt = (Get-Date).ToString('o')
    setup = $Setup.Name
    sha256 = $Hash
    desktop = (Get-Item $DesktopExe).Length
    agent = (Get-Item $AgentExe).Length
}
$BuildInfo | ConvertTo-Json | Set-Content (Join-Path $InstallerOut 'build-info.json') -Encoding utf8

Write-Host ''
Write-Host 'KY PDKS Windows 1.3.0 paketi hazır.' -ForegroundColor Green
Write-Host "Setup : $($Setup.FullName)" -ForegroundColor Cyan
Write-Host "SHA256: $Hash" -ForegroundColor Cyan