param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Version = '1.9.0'
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
$ErpDesktopOut = Join-Path $Dist 'erp-desktop'
$PdksDesktopOut = Join-Path $Dist 'pdks-desktop'
$AgentOut = Join-Path $Dist 'agent'
$FileAgentOut = Join-Path $Dist 'file-agent'
$InstallerOut = Join-Path $Dist 'setup'

function Invoke-Native {
    param([Parameter(Mandatory=$true)][string]$Label,[Parameter(Mandatory=$true)][scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Label başarısız oldu. Hata kodu: $LASTEXITCODE" }
}

Write-Host "KY ERP Desktop + KY PDKS Pro $Version dual build başlıyor..." -ForegroundColor Cyan

$Dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
$Npm = Get-Command npm -ErrorAction SilentlyContinue
$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Dotnet) { throw '.NET 8 SDK bulunamadı.' }
if (-not $Npm -or -not $Node) { throw 'Node/npm bulunamadı.' }
if (-not (Test-Path $FrontendRoot)) { throw "Frontend klasörü bulunamadı: $FrontendRoot" }
if (-not (Test-Path $FileAgentSource)) { throw "KY File Agent kaynağı bulunamadı: $FileAgentSource" }

$DeclaredVersion = (Get-Content (Join-Path $Root 'VERSION') -Raw).Trim()
if ($DeclaredVersion -ne $Version) { throw "VERSION uyuşmuyor. Beklenen=$Version Bulunan=$DeclaredVersion" }

$DesktopWindowSource = Join-Path $Root 'src\KyPdks.Desktop\KyErpDesktopWindow.xaml.cs'
$DesktopWindowText = Get-Content $DesktopWindowSource -Raw
if ($DesktopWindowText -notmatch 'https://app\.kyerp\.net/index\.html') { throw 'Tam ERP Desktop canonical app.kyerp.net/index.html kullanmıyor.' }
if ($DesktopWindowText -notmatch 'DesktopVersion = "1\.9\.0"') { throw 'Desktop bridge sürümü 1.9.0 değil.' }
if ($DesktopWindowText -notmatch 'AddScriptToExecuteOnDocumentCreatedAsync') { throw 'Desktop product işareti React başlamadan enjekte edilmiyor.' }
if ($DesktopWindowText -notmatch 'window\.__KYERP_DESKTOP_PRODUCT') { throw 'Standalone PDKS ürün işareti eksik.' }

$ProjectText = Get-Content $DesktopProject -Raw
if ($ProjectText -notmatch 'ProductMode') { throw 'Desktop project dual ProductMode içermiyor.' }
if ($ProjectText -notmatch 'PDKS_ONLY') { throw 'PDKS-only compile constant eksik.' }
if ($ProjectText -notmatch 'Compile Remove="KyErpShellWindow.xaml.cs"') { throw 'PDKS-only build eski ERP shell code-behind dosyasını dışlamıyor.' }
if ($ProjectText -notmatch 'Page Remove="KyErpShellWindow.xaml"') { throw 'PDKS-only build eski ERP shell XAML dosyasını dışlamıyor.' }
if ($ProjectText -notmatch 'BaseIntermediateOutputPath') { throw 'ERP/PDKS ayrı MSBuild ara klasörleri tanımlı değil.' }
if ($ProjectText -notmatch 'BaseOutputPath') { throw 'ERP/PDKS ayrı MSBuild çıktı klasörleri tanımlı değil.' }

$ErpInstallerText = Get-Content (Join-Path $Root 'installer\KY-ERP.iss') -Raw
$PdksInstallerText = Get-Content (Join-Path $Root 'installer\KY-PDKS.iss') -Raw
if ($ErpInstallerText -match 'KYERP\.PDKS\.Agent') { throw 'KY ERP Desktop installer PDKS Agent servisini sahiplenmemeli.' }
if ($ErpInstallerText -match '\\agent\\\*') { throw 'KY ERP Desktop installer PDKS Agent binary paketlememeli.' }
if ($PdksInstallerText -notmatch 'KYERP\.PDKS\.Agent') { throw 'KY PDKS Pro installer PDKS Agent servisini içermiyor.' }
if ($PdksInstallerText -notmatch '\\agent\\\*') { throw 'KY PDKS Pro installer PDKS Agent binary paketlemiyor.' }

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in @($ErpDesktopOut,$PdksDesktopOut,$AgentOut,$FileAgentOut,$InstallerOut)) { New-Item $dir -ItemType Directory -Force | Out-Null }

Write-Host '1/8 Güncel KY ERP frontend...' -ForegroundColor Cyan
Push-Location $FrontendRoot
try {
    Invoke-Native 'Frontend npm ci' { npm ci }
    Invoke-Native 'Frontend test' { npm test }
    Invoke-Native 'Frontend lint' { npm run lint }
    Invoke-Native 'Frontend build' { npm run build }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $FrontendDist 'index.html'))) { throw 'Frontend dist/index.html oluşmadı.' }

Write-Host '2/8 .NET restore...' -ForegroundColor Cyan
foreach ($project in @($SharedProject,$AgentProject,$DesktopProject)) { Invoke-Native "Restore $project" { dotnet restore $project } }
if (Test-Path $TestProject) { Invoke-Native 'Test restore' { dotnet restore $TestProject } }

Write-Host '3/8 .NET test...' -ForegroundColor Cyan
if (-not $SkipTests -and (Test-Path $TestProject)) { Invoke-Native 'xUnit test' { dotnet test $TestProject -c Release --no-restore } }

Write-Host '4/8 İki ayrı Windows publish...' -ForegroundColor Cyan
Invoke-Native 'KY ERP Desktop publish' {
    dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:ProductMode=ERP -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $ErpDesktopOut
}
Invoke-Native 'KY PDKS Pro publish' {
    dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:ProductMode=PDKS -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $PdksDesktopOut
}
Invoke-Native 'PDKS Agent publish' {
    dotnet publish $AgentProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $AgentOut
}

$ErpWeb = Join-Path $ErpDesktopOut 'web'
$PdksWeb = Join-Path $PdksDesktopOut 'web'
foreach ($web in @($ErpWeb,$PdksWeb)) {
    New-Item $web -ItemType Directory -Force | Out-Null
    Copy-Item (Join-Path $FrontendDist '*') $web -Recurse -Force
}
if (-not (Test-Path (Join-Path $ErpWeb 'index.html'))) { throw 'Tam ERP Desktop web/index.html oluşmadı.' }
if (-not (Test-Path (Join-Path $PdksWeb 'index.html'))) { throw 'KY PDKS Pro canonical web/index.html oluşmadı.' }

Write-Host '5/8 KY File Agent + gömülü Node runtime...' -ForegroundColor Cyan
Copy-Item (Join-Path $FileAgentSource '*') $FileAgentOut -Recurse -Force
$RuntimeOut = Join-Path $FileAgentOut 'runtime'
New-Item $RuntimeOut -ItemType Directory -Force | Out-Null
Copy-Item $Node.Source (Join-Path $RuntimeOut 'node.exe') -Force
foreach ($required in @('file-hub-agent.mjs','accounting-archive-worker.mjs','start-file-hub-agent.cmd','start-file-hub-agent-hidden.vbs','install-file-hub-agent.ps1')) {
    if (-not (Test-Path (Join-Path $FileAgentOut $required))) { throw "KY File Agent paketi eksik: $required" }
}
if (-not (Test-Path (Join-Path $RuntimeOut 'node.exe'))) { throw 'KY File Agent gömülü node.exe eksik.' }
$FileAgentStartText = Get-Content (Join-Path $FileAgentOut 'start-file-hub-agent.cmd') -Raw
if ($FileAgentStartText -notmatch 'runtime\\node\.exe') { throw 'KY File Agent launcher gömülü Node runtime kullanmıyor.' }
$FileAgentInstallText = Get-Content (Join-Path $FileAgentOut 'install-file-hub-agent.ps1') -Raw
if ($FileAgentInstallText -notmatch 'runtime\\node\.exe') { throw 'KY File Agent installer gömülü Node runtime kullanmıyor.' }

$ErpExe = Join-Path $ErpDesktopOut 'KY ERP Desktop.exe'
$PdksExe = Join-Path $PdksDesktopOut 'KY PDKS Pro.exe'
$PdksAgentExe = Join-Path $AgentOut 'KYERP.PDKS.Agent.exe'
foreach ($exe in @($ErpExe,$PdksExe,$PdksAgentExe)) { if (-not (Test-Path $exe)) { throw "Beklenen EXE oluşmadı: $exe" } }

$ErpVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($ErpExe).ProductVersion
$PdksVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($PdksExe).ProductVersion
$AgentVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($PdksAgentExe).ProductVersion
foreach ($actual in @($ErpVersion,$PdksVersion,$AgentVersion)) {
    if (-not ([string]$actual).StartsWith($Version)) { throw "Ürün sürümü yanlış: $actual" }
}

Write-Host '6/8 Inno Setup ile iki kurulum paketi...' -ForegroundColor Cyan
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
Invoke-Native 'KY ERP Setup' { & $InnoExe (Join-Path $Root 'installer\KY-ERP.iss') }
Invoke-Native 'KY PDKS Setup' { & $InnoExe (Join-Path $Root 'installer\KY-PDKS.iss') }

Write-Host '7/8 Kurulum paketlerini doğrula...' -ForegroundColor Cyan
$ErpSetupName = "KY-ERP-Desktop-Setup-$Version.exe"
$PdksSetupName = "KY-PDKS-Pro-Setup-$Version.exe"
$ErpSetup = Get-ChildItem $InstallerOut -Filter $ErpSetupName | Select-Object -First 1
$PdksSetup = Get-ChildItem $InstallerOut -Filter $PdksSetupName | Select-Object -First 1
if (-not $ErpSetup) { throw "$ErpSetupName oluşmadı." }
if (-not $PdksSetup) { throw "$PdksSetupName oluşmadı." }

$ErpHash = (Get-FileHash $ErpSetup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$PdksHash = (Get-FileHash $PdksSetup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$ErpHash  $($ErpSetup.Name)" | Set-Content -Path "$($ErpSetup.FullName).sha256.txt" -Encoding ascii
"$PdksHash  $($PdksSetup.Name)" | Set-Content -Path "$($PdksSetup.FullName).sha256.txt" -Encoding ascii

Write-Host '8/8 Build bilgisi...' -ForegroundColor Cyan
$BuildInfo = [ordered]@{
    version = $Version
    frontendOrigin = 'https://app.kyerp.net'
    liveApi = 'https://api.kyerp.net'
    products = @(
        [ordered]@{
            product = 'KY ERP Desktop'
            scope = 'FULL_ERP_DESKTOP'
            setup = $ErpSetup.Name
            sha256 = $ErpHash
            exe = 'KY ERP Desktop.exe'
            version = [string]$ErpVersion
            includesFileHubAgent = $true
            includesPdksAgent = $false
            includesWebView = $true
        },
        [ordered]@{
            product = 'KY PDKS Pro'
            scope = 'PDKS_STANDALONE_CANONICAL_UI'
            setup = $PdksSetup.Name
            sha256 = $PdksHash
            exe = 'KY PDKS Pro.exe'
            version = [string]$PdksVersion
            includesFileHubAgent = $false
            includesPdksAgent = $true
            includesWebView = $true
            includesCanonicalFrontend = $true
            standaloneProduct = 'PDKS'
            denetimWriteControls = 'HIDDEN'
        }
    )
    pdksAgentVersion = [string]$AgentVersion
    builtAt = (Get-Date).ToString('o')
}
$BuildInfo | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $InstallerOut 'build-info.json') -Encoding utf8

Write-Host "KY ERP Desktop hazır: $($ErpSetup.FullName)" -ForegroundColor Green
Write-Host "KY PDKS Pro hazır: $($PdksSetup.FullName)" -ForegroundColor Green
Write-Host "ERP SHA256 : $ErpHash" -ForegroundColor Cyan
Write-Host "PDKS SHA256: $PdksHash" -ForegroundColor Cyan
