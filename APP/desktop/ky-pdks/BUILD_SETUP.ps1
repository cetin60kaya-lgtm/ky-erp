param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Version = '1.7.1'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $Root '..\..\..')).Path
$Dist = Join-Path $Root 'dist'
$DesktopProject = Join-Path $Root 'src\KyPdks.Desktop\KyPdks.Desktop.csproj'
$AgentProject = Join-Path $Root 'src\KyPdks.Agent\KyPdks.Agent.csproj'
$SharedProject = Join-Path $Root 'src\KyPdks.Shared\KyPdks.Shared.csproj'
$TestProject = Join-Path $Root 'src\KyPdks.Tests\KyPdks.Tests.csproj'
$FrontendRoot = Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$FrontendDist = Join-Path $FrontendRoot 'dist'
$FileAgentSource = Join-Path $RepoRoot 'tools\file-hub-agent'
$DesktopOut = Join-Path $Dist 'desktop'
$AgentOut = Join-Path $Dist 'agent'
$FileAgentOut = Join-Path $Dist 'file-agent'
$InstallerOut = Join-Path $Dist 'setup'

function Invoke-Native {
    param([Parameter(Mandatory=$true)][string]$Label,[Parameter(Mandatory=$true)][scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label başarısız oldu. Hata kodu: $LASTEXITCODE" }
}

Write-Host "KY ERP Desktop $Version build başlıyor..." -ForegroundColor Cyan
Write-Host "Tam ürün: güncel KY ERP frontend + canlı API + PDKS cihaz servisi + KY File Agent." -ForegroundColor DarkCyan

$Dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
$Npm = Get-Command npm -ErrorAction SilentlyContinue
$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Dotnet) { throw '.NET 8 SDK bulunamadı.' }
if (-not $Npm -or -not $Node) { throw 'Node/npm bulunamadı.' }
if (-not (Test-Path $FrontendRoot)) { throw "Frontend klasörü bulunamadı: $FrontendRoot" }
if (-not (Test-Path $FileAgentSource)) { throw "KY File Agent kaynağı bulunamadı: $FileAgentSource" }

$VersionFile = Join-Path $Root 'VERSION'
$DeclaredVersion = (Get-Content $VersionFile -Raw).Trim()
if ($DeclaredVersion -ne $Version) { throw "VERSION uyuşmuyor. Beklenen=$Version Bulunan=$DeclaredVersion" }

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in @($DesktopOut,$AgentOut,$FileAgentOut,$InstallerOut)) { New-Item $dir -ItemType Directory -Force | Out-Null }

Write-Host '1/7 Güncel KY ERP frontend...' -ForegroundColor Cyan
Push-Location $FrontendRoot
try {
    Invoke-Native 'Frontend npm ci' { npm ci }
    Invoke-Native 'Frontend build' { npm run build }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $FrontendDist 'index.html'))) { throw 'Frontend dist/index.html oluşmadı.' }

Write-Host '2/7 .NET restore ve derleme...' -ForegroundColor Cyan
foreach ($project in @($SharedProject,$AgentProject,$DesktopProject)) { Invoke-Native "Restore $project" { dotnet restore $project } }
if (Test-Path $TestProject) { Invoke-Native 'Test restore' { dotnet restore $TestProject } }
foreach ($project in @($SharedProject,$AgentProject,$DesktopProject)) { Invoke-Native "Build $project" { dotnet build $project -c Release --no-restore } }

Write-Host '3/7 Testler...' -ForegroundColor Cyan
if (-not $SkipTests -and (Test-Path $TestProject)) { Invoke-Native 'xUnit test' { dotnet test $TestProject -c Release --no-restore } }

Write-Host '4/7 Windows publish...' -ForegroundColor Cyan
Invoke-Native 'Desktop publish' { dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $DesktopOut }
Invoke-Native 'PDKS Agent publish' { dotnet publish $AgentProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $AgentOut }

$DesktopWeb = Join-Path $DesktopOut 'web'
New-Item $DesktopWeb -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $FrontendDist '*') $DesktopWeb -Recurse -Force
if (-not (Test-Path (Join-Path $DesktopWeb 'index.html'))) { throw 'Paketlenmiş Desktop web/index.html bulunamadı.' }

Write-Host '5/7 KY File Agent + gömülü Node runtime...' -ForegroundColor Cyan
Copy-Item (Join-Path $FileAgentSource '*') $FileAgentOut -Recurse -Force
$RuntimeOut = Join-Path $FileAgentOut 'runtime'
New-Item $RuntimeOut -ItemType Directory -Force | Out-Null
Copy-Item $Node.Source (Join-Path $RuntimeOut 'node.exe') -Force
foreach ($required in @('file-hub-agent.mjs','accounting-archive-worker.mjs','start-file-hub-agent.cmd','start-file-hub-agent-hidden.vbs','install-file-hub-agent.ps1')) {
    if (-not (Test-Path (Join-Path $FileAgentOut $required))) { throw "KY File Agent paketi eksik: $required" }
}
if (-not (Test-Path (Join-Path $RuntimeOut 'node.exe'))) { throw 'KY File Agent gömülü Node runtime oluşmadı.' }

$DesktopExe = Join-Path $DesktopOut 'KY ERP Desktop.exe'
$PdksAgentExe = Join-Path $AgentOut 'KYERP.PDKS.Agent.exe'
if (-not (Test-Path $DesktopExe)) { throw "Desktop uygulaması oluşmadı: $DesktopExe" }
if (-not (Test-Path $PdksAgentExe)) { throw "PDKS cihaz agentı oluşmadı: $PdksAgentExe" }
$DesktopVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($DesktopExe).ProductVersion
$PdksAgentVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($PdksAgentExe).ProductVersion
if (-not ([string]$DesktopVersion).StartsWith($Version)) { throw "Desktop sürümü yanlış: $DesktopVersion" }
if (-not ([string]$PdksAgentVersion).StartsWith($Version)) { throw "PDKS Agent sürümü yanlış: $PdksAgentVersion" }

Write-Host '6/7 Inno Setup...' -ForegroundColor Cyan
$ProgramFilesX86 = ${env:ProgramFiles(x86)}
$InnoCandidates = @(@(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe' }),
    $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 'Inno Setup 6\ISCC.exe' }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe' })
) | Where-Object { $_ -and (Test-Path $_) })
if ($InnoCandidates.Count -eq 0) { throw 'Inno Setup 6 bulunamadı.' }
$env:KY_PDKS_DIST = $Dist
$env:KY_PDKS_SETUP_OUT = $InstallerOut
$InnoExe = [string]$InnoCandidates[0]
$InnoScript = Join-Path $Root 'installer\KY-PDKS.iss'
Invoke-Native 'Inno Setup' { & $InnoExe $InnoScript }

Write-Host '7/7 Paket doğrulama...' -ForegroundColor Cyan
$ExpectedSetupName = "KY-ERP-Desktop-Setup-$Version.exe"
$Setup = Get-ChildItem $InstallerOut -Filter $ExpectedSetupName | Select-Object -First 1
if (-not $Setup) { throw "$ExpectedSetupName oluşmadı." }
$Hash = (Get-FileHash $Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  $($Setup.Name)" | Set-Content -Path "$($Setup.FullName).sha256.txt" -Encoding ascii

$BuildInfo = [ordered]@{
    product = 'KY ERP Desktop'
    productScope = 'FULL_ERP_DESKTOP'
    frontendMode = 'CANONICAL_WEB_UI_BUNDLED_LIVE_API'
    liveApi = 'https://api.kyerp.net'
    version = $Version
    setup = $Setup.Name
    sha256 = $Hash
    desktopVersion = [string]$DesktopVersion
    pdksAgentVersion = [string]$PdksAgentVersion
    pdksAgent = 'WINDOWS_SERVICE'
    fileHubAgent = 'BUNDLED_NODE_AGENT_SCHEDULED_TASK'
    fileHubAgentRuntime = 'BUNDLED_NODE'
    fileHubProviders = @('GOOGLE_DRIVE','ONEDRIVE','SHAREPOINT','LOCAL_FOLDER','NAS')
    agentCredential = 'TENANT_SCOPED_FROM_EXISTING_FILE_HUB_UI'
    builtAt = (Get-Date).ToString('o')
    desktopBytes = (Get-Item $DesktopExe).Length
    pdksAgentBytes = (Get-Item $PdksAgentExe).Length
    fileAgentNodeBytes = (Get-Item (Join-Path $RuntimeOut 'node.exe')).Length
}
$BuildInfo | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $InstallerOut 'build-info.json') -Encoding utf8
Write-Host "KY ERP Desktop $Version paketi hazır: $($Setup.FullName)" -ForegroundColor Green
Write-Host "SHA256: $Hash" -ForegroundColor Cyan