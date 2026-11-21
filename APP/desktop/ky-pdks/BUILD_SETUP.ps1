param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Version = '1.5.1'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $Root 'dist'
$DesktopProject = Join-Path $Root 'src\KyPdks.Desktop\KyPdks.Desktop.csproj'
$AgentProject = Join-Path $Root 'src\KyPdks.Agent\KyPdks.Agent.csproj'
$SharedProject = Join-Path $Root 'src\KyPdks.Shared\KyPdks.Shared.csproj'
$TestProject = Join-Path $Root 'src\KyPdks.Tests\KyPdks.Tests.csproj'
$DesktopOut = Join-Path $Dist 'desktop'
$AgentOut = Join-Path $Dist 'agent'
$InstallerOut = Join-Path $Dist 'setup'
$IntegrationOut = Join-Path $Dist 'integrations'
$RepoRoot = (Resolve-Path (Join-Path $Root '..\..\..')).Path

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

Write-Host "KY ERP Masaüstü $Version build başlıyor..." -ForegroundColor Cyan
Write-Host "Ürün kapsamı: tüm KY ERP modülleri + İK/PDKS cihaz katmanı" -ForegroundColor DarkCyan

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET 8 SDK bulunamadı.' }

$VersionFile = Join-Path $Root 'VERSION'
if (-not (Test-Path $VersionFile)) { throw 'VERSION dosyası bulunamadı.' }
$DeclaredVersion = (Get-Content $VersionFile -Raw).Trim()
if ($DeclaredVersion -ne $Version) { throw "VERSION uyuşmuyor. Beklenen=$Version Bulunan=$DeclaredVersion" }

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item $DesktopOut -ItemType Directory -Force | Out-Null
New-Item $AgentOut -ItemType Directory -Force | Out-Null
New-Item $InstallerOut -ItemType Directory -Force | Out-Null
New-Item (Join-Path $IntegrationOut 'bin') -ItemType Directory -Force | Out-Null
New-Item (Join-Path $IntegrationOut 'file-hub-agent') -ItemType Directory -Force | Out-Null
New-Item (Join-Path $IntegrationOut 'isnet') -ItemType Directory -Force | Out-Null
New-Item (Join-Path $IntegrationOut 'isnet-archive') -ItemType Directory -Force | Out-Null

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

$DesktopCandidate = @(Get-ChildItem -LiteralPath $DesktopOut -Filter '*.exe' -File | Where-Object { $_.Name.StartsWith('KY ERP ', [StringComparison]::OrdinalIgnoreCase) })
if ($DesktopCandidate.Count -ne 1) { throw "KY ERP Desktop EXE sayisi beklenenden farkli: $($DesktopCandidate.Count)" }
$DesktopExe = $DesktopCandidate[0].FullName
$AgentExe = Join-Path $AgentOut 'KYERP.PDKS.Agent.exe'
if (-not (Test-Path $AgentExe)) { throw "PDKS cihaz agentı oluşmadı: $AgentExe" }

$DesktopVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($DesktopExe).ProductVersion
$AgentVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($AgentExe).ProductVersion
if (-not ([string]$DesktopVersion).StartsWith($Version)) { throw "Desktop sürümü yanlış: $DesktopVersion" }
if (-not ([string]$AgentVersion).StartsWith($Version)) { throw "Agent sürümü yanlış: $AgentVersion" }

Write-Host '3a/5 KY ERP entegrasyon paketini ekle...' -ForegroundColor Cyan
$NodeTool = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $NodeTool) { throw 'Kurulum derlemesinde Node >= 22 bulunmalı; kullanıcı bilgisayarında ayrıca Node kurulmayacak.' }
$NodeExe = [string]$NodeTool.Source
$NodeVersion = [version]((& $NodeExe --version).Trim().TrimStart('v'))
if ($NodeVersion.Major -lt 22) { throw "Entegrasyon paketi Node 22+ gerektirir: $NodeVersion" }
$NodeLicense = Join-Path (Split-Path -Parent $NodeExe) 'LICENSE'
$EmbeddedLicense = Join-Path $IntegrationOut 'bin\NODE-LICENSE.txt'
Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $IntegrationOut 'bin\node.exe') -Force
if (Test-Path -LiteralPath $NodeLicense) {
    Copy-Item -LiteralPath $NodeLicense -Destination $EmbeddedLicense -Force
} else {
    # The Windows MSI can install node.exe without its LICENSE file. Fetch
    # the matching version's official open-source notices from Node's repo.
    $NodeTag = 'v' + $NodeVersion.ToString()
    $LicenseUri = "https://raw.githubusercontent.com/nodejs/node/$NodeTag/LICENSE"
    try { Invoke-WebRequest -UseBasicParsing -Uri $LicenseUri -OutFile $EmbeddedLicense -TimeoutSec 25 }
    catch { throw "Node $NodeTag resmî lisans metni indirilemedi; Setup paketlenmedi." }
    if ((Get-Item $EmbeddedLicense).Length -lt 1500) { throw 'Node lisans dosyası eksik veya geçersiz.' }
}
$HubSources = @('file-hub-agent.mjs','local-folder-authorization.mjs',
    'accounting-archive-worker.mjs','psd-preview-worker.mjs','psd-composite-preview.mjs')
foreach ($file in $HubSources) {
    $source = Join-Path $RepoRoot "tools\file-hub-agent\$file"
    if (-not (Test-Path -LiteralPath $source)) { throw "File Hub dosyası eksik: $file" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $IntegrationOut "file-hub-agent\$file") -Force
    Invoke-Native "Node kontrol: $file" { & $NodeExe --check $source }
}
$PortalSource = Join-Path $RepoRoot 'TOOLS\isnet-portal-adapter\server.mjs'
if (-not (Test-Path -LiteralPath $PortalSource)) { throw 'İşNet yerel portal adaptörü bulunamadı.' }
Copy-Item -LiteralPath $PortalSource -Destination (Join-Path $IntegrationOut 'isnet\server.mjs') -Force
Invoke-Native 'İşNet adaptör Node kontrolü' { & $NodeExe --check $PortalSource }
# Latest 8791 four-way archive engine. It uses an explicitly approved
# KY_ISNET_ARCHIVE_ROOT and is never started during Setup installation.
foreach ($file in @('isnet-drive-yerel.mjs','sync-core.mjs')) {
    $source = Join-Path $RepoRoot "TOOLS\isnet-drive-archive\$file"
    if (-not (Test-Path -LiteralPath $source)) { throw "İşNet arşiv motoru eksik: $file" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $IntegrationOut "isnet-archive\$file") -Force
    Invoke-Native "İşNet arşiv Node kontrolü: $file" { & $NodeExe --check $source }
}

foreach ($file in @('start-kyerp-integrations.ps1','start-kyerp-integrations-hidden.vbs')) {
    $source = Join-Path $Root "integrations\$file"
    if (-not (Test-Path -LiteralPath $source)) { throw "Başlatıcı eksik: $file" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $IntegrationOut $file) -Force
}
# No .env, tenant secret, Windows credential or browser session is packaged.

Write-Host '4/5 Inno Setup...' -ForegroundColor Cyan
$ProgramFilesX86 = ${env:ProgramFiles(x86)}
$InnoCandidates = @(
    @(
        $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe' }),
        $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 'Inno Setup 6\ISCC.exe' }),
        $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe' })
    ) | Where-Object { $_ -and (Test-Path $_) }
)

if ($InnoCandidates.Count -eq 0) { throw 'Inno Setup 6 bulunamadı. Setup.exe üretilemedi.' }

$env:KY_PDKS_DIST = $Dist
$env:KY_PDKS_SETUP_OUT = $InstallerOut
$InnoExe = [string]$InnoCandidates[0]
$InnoScript = Join-Path $Root 'installer\KY-PDKS.iss'
Write-Host "Inno Setup: $InnoExe" -ForegroundColor DarkGray
Invoke-Native 'Inno Setup' { & $InnoExe $InnoScript }

$ExpectedSetupName = "KY-ERP-Masaustu-Setup-$Version.exe"
$Setup = Get-ChildItem $InstallerOut -Filter $ExpectedSetupName | Select-Object -First 1
if (-not $Setup) { throw "$ExpectedSetupName oluşmadı." }

Write-Host '5/5 Bütünlük özeti...' -ForegroundColor Cyan
$Hash = (Get-FileHash $Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$HashFile = "$($Setup.FullName).sha256.txt"
"$Hash  $($Setup.Name)" | Set-Content -Path $HashFile -Encoding ascii

$BuildInfo = [ordered]@{
    product = 'KY ERP Masaüstü'
    productScope = 'FULL_ERP'
    pdksRole = 'IK_MODULE_DEVICE_AGENT'
    version = $Version
    builtAt = (Get-Date).ToString('o')
    setup = $Setup.Name
    sha256 = $Hash
    desktopVersion = [string]$DesktopVersion
    agentVersion = [string]$AgentVersion
    embeddedNodeVersion = $NodeVersion.ToString()
    integrationModules = @('ISNET_PORTAL', 'ISNET_DRIVE_ARCHIVE', 'FILE_HUB', 'ACCOUNTING_ARCHIVE', 'PSD_PREVIEW')
    folderGrantsRequired = $true
    desktop = (Get-Item $DesktopExe).Length
    agent = (Get-Item $AgentExe).Length
}
$BuildInfo | ConvertTo-Json | Set-Content (Join-Path $InstallerOut 'build-info.json') -Encoding utf8

Write-Host ''
Write-Host "KY ERP Masaüstü $Version tam ERP paketi hazır." -ForegroundColor Green
Write-Host "Setup : $($Setup.FullName)" -ForegroundColor Cyan
Write-Host "SHA256: $Hash" -ForegroundColor Cyan
