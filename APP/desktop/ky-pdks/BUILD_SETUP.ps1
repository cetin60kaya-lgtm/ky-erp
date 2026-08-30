$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $Root 'dist'
$DesktopProject = Join-Path $Root 'src\KyPdks.Desktop\KyPdks.Desktop.csproj'
$AgentProject = Join-Path $Root 'src\KyPdks.Agent\KyPdks.Agent.csproj'
$DesktopOut = Join-Path $Dist 'desktop'
$AgentOut = Join-Path $Dist 'agent'
$InstallerOut = Join-Path $Dist 'setup'

Write-Host 'KY PDKS Windows build basliyor...' -ForegroundColor Cyan

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw '.NET 8 SDK bulunamadi. https://dotnet.microsoft.com/download/dotnet/8.0 adresinden SDK kurun.'
}

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item $DesktopOut -ItemType Directory -Force | Out-Null
New-Item $AgentOut -ItemType Directory -Force | Out-Null
New-Item $InstallerOut -ItemType Directory -Force | Out-Null

dotnet restore $DesktopProject
dotnet restore $AgentProject

dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $DesktopOut
dotnet publish $AgentProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $AgentOut

$InnoCandidates = @(
    "$env:ProgramFiles(x86)\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) }

if (-not $InnoCandidates) {
    Write-Host ''
    Write-Host 'Desktop ve Agent publish tamamlandi.' -ForegroundColor Green
    Write-Host 'Inno Setup 6 bulunamadigi icin Setup.exe uretilmedi.' -ForegroundColor Yellow
    Write-Host 'Inno Setup kurulduktan sonra bu script tekrar calistirilinca setup otomatik uretilir.' -ForegroundColor Yellow
    Write-Host "Ciktilar: $Dist" -ForegroundColor Cyan
    exit 0
}

$env:KY_PDKS_DIST = $Dist
$env:KY_PDKS_SETUP_OUT = $InstallerOut
& $InnoCandidates[0] (Join-Path $Root 'installer\KY-PDKS.iss')
if ($LASTEXITCODE -ne 0) { throw "Inno Setup hata kodu: $LASTEXITCODE" }

$Setup = Get-ChildItem $InstallerOut -Filter 'KY-PDKS-Setup*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $Setup) { throw 'Setup.exe olusmadi.' }

Write-Host ''
Write-Host 'KY PDKS Windows paketi hazir.' -ForegroundColor Green
Write-Host "Setup: $($Setup.FullName)" -ForegroundColor Cyan
