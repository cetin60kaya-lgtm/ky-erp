param(
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Version = '1.9.0'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $Root '..\..\..')).Path
$Dist = Join-Path $Root 'dist-pdks'
$DesktopProject = Join-Path $Root 'src\KyPdks.Desktop\KyPdks.Desktop.csproj'
$AgentProject = Join-Path $Root 'src\KyPdks.Agent\KyPdks.Agent.csproj'
$DeviceBridgeProject = Join-Path $Root 'src\KyPdks.DeviceBridge.x86\KyPdks.DeviceBridge.x86.csproj'
$SharedProject = Join-Path $Root 'src\KyPdks.Shared\KyPdks.Shared.csproj'
$TestProject = Join-Path $Root 'src\KyPdks.Tests\KyPdks.Tests.csproj'
$FrontendRoot = Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$FrontendDist = Join-Path $FrontendRoot 'dist'
$CloudRoot = Join-Path $RepoRoot 'APP\cloud\ky-erp-api'
$PdksDesktopOut = Join-Path $Dist 'pdks-desktop'
$AgentOut = Join-Path $Dist 'agent'
$DeviceBridgeOut = Join-Path $Dist 'device-bridge'
$InstallerOut = Join-Path $Dist 'setup'
$WebViewOut = Join-Path $Dist 'webview2'

function Invoke-Native {
    param(
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][scriptblock]$Command
    )
    Write-Host ""
    Write-Host ">>> $Label" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label başarısız oldu. Hata kodu: $LASTEXITCODE"
    }
}

function Require-File {
    param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$Message)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw $Message }
}

Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host "KY PDKS Pro $Version · tam Windows paket zinciri" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor DarkCyan

$Dotnet = @(Get-Command dotnet -ErrorAction SilentlyContinue) | Select-Object -First 1
$Npm = @(Get-Command npm -ErrorAction SilentlyContinue) | Select-Object -First 1
$Node = @(Get-Command node.exe -ErrorAction SilentlyContinue) | Select-Object -First 1
if (-not $Node) { $Node = @(Get-Command node -ErrorAction SilentlyContinue) | Select-Object -First 1 }
if (-not $Dotnet) { throw '.NET 8 SDK bulunamadı.' }
if (-not $Npm -or -not $Node) { throw 'Node/npm bulunamadı.' }

$DeclaredVersion = (Get-Content (Join-Path $Root 'VERSION') -Raw).Trim()
if ($DeclaredVersion -ne $Version) { throw "VERSION uyuşmuyor. Beklenen=$Version Bulunan=$DeclaredVersion" }

$DesktopWindowSource = Join-Path $Root 'src\KyPdks.Desktop\KyErpDesktopWindow.xaml.cs'
$DesktopWindowText = Get-Content $DesktopWindowSource -Raw
if ($DesktopWindowText -notmatch 'DesktopVersion = "1\.9\.0"') { throw 'Desktop bridge sürümü 1.9.0 değil.' }
if ($DesktopWindowText -notmatch 'sessionStorage\.getItem') { throw 'Owner/MFA sessionStorage token köprüsü eksik.' }
if ($DesktopWindowText -notmatch 'EnsurePdksAgentEnrollmentAsync') { throw 'PDKS Agent cihaz enrollment akışı eksik.' }
if ($DesktopWindowText -notmatch 'PdksTerminalSetupWindow') { throw 'PDKS terminal sihirbazı canonical Windows kabuğuna bağlı değil.' }

$ProjectText = Get-Content $DesktopProject -Raw
if ($ProjectText -notmatch 'ProductMode') { throw 'Desktop project ProductMode içermiyor.' }
if ($ProjectText -notmatch 'PDKS_ONLY') { throw 'PDKS-only compile constant eksik.' }
if ($ProjectText -notmatch 'KY PDKS Pro') { throw 'KY PDKS Pro exe adı projectte doğrulanamadı.' }

$PdksInstaller = Join-Path $Root 'installer\KY-PDKS.iss'
$PdksInstallerText = Get-Content $PdksInstaller -Raw
if ($PdksInstallerText -notmatch 'KY PDKS Pro') { throw 'PDKS installer ürün adı yanlış.' }
if ($PdksInstallerText -notmatch 'install-pdks-agent\.ps1') { throw 'Doğrulanmış Agent servis installer eksik.' }
if ($PdksInstallerText -notmatch 'MicrosoftEdgeWebview2Setup\.exe') { throw 'WebView2 prerequisite installer zincirine bağlı değil.' }
if ($PdksInstallerText -notmatch '\\agent\\\*') { throw 'PDKS Agent binary pakete alınmıyor.' }

$ServiceInstaller = Join-Path $Root 'installer\install-pdks-agent.ps1'
$ServiceInstallerText = Get-Content $ServiceInstaller -Raw
if ($ServiceInstallerText -notmatch 'Wait-ServiceGone') { throw 'Agent servis marked-for-deletion bekleme koruması eksik.' }
if ($ServiceInstallerText -notmatch "Status -eq 'Running'") { throw 'Agent servis Running doğrulaması eksik.' }

Remove-Item $Dist -Recurse -Force -ErrorAction SilentlyContinue
foreach ($dir in @($PdksDesktopOut,$AgentOut,$DeviceBridgeOut,$InstallerOut,$WebViewOut)) {
    New-Item $dir -ItemType Directory -Force | Out-Null
}

Write-Host ""
Write-Host "1/8 Cloud Worker unit + typecheck + dry-run" -ForegroundColor Cyan
Push-Location $CloudRoot
try {
    Invoke-Native 'Cloud npm ci' { npm ci }
    if (-not $SkipTests) { Invoke-Native 'Cloud unit tests' { npm run test:unit } }
    Invoke-Native 'Cloud TypeScript typecheck' { npm run typecheck }
    Invoke-Native 'Cloud Wrangler dry-run' { npm run build }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "2/8 Frontend test + lint + production build" -ForegroundColor Cyan
Push-Location $FrontendRoot
try {
    Invoke-Native 'Frontend npm ci' { npm ci }
    if (-not $SkipTests) { Invoke-Native 'Frontend test' { npm test } }
    if (-not $SkipTests) { Invoke-Native 'Frontend lint' { npm run lint } }
    Invoke-Native 'Frontend build' { npm run build }
} finally {
    Pop-Location
}
Require-File (Join-Path $FrontendDist 'index.html') 'Frontend dist/index.html oluşmadı.'

Write-Host ""
Write-Host "3/8 .NET restore + xUnit" -ForegroundColor Cyan
foreach ($project in @($SharedProject,$AgentProject,$DesktopProject,$DeviceBridgeProject)) {
    Invoke-Native "Restore $project" { dotnet restore $project }
}
if (Test-Path $TestProject) {
    Invoke-Native 'Test restore' { dotnet restore $TestProject }
    if (-not $SkipTests) { Invoke-Native 'xUnit test' { dotnet test $TestProject -c Release --no-restore } }
}

Write-Host ""
Write-Host "4/8 KY PDKS Pro + Agent win-x64 publish" -ForegroundColor Cyan
Invoke-Native 'KY PDKS Pro publish' {
    dotnet publish $DesktopProject -c Release -r win-x64 --self-contained true -p:ProductMode=PDKS -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $PdksDesktopOut
}
Invoke-Native 'KY PDKS Agent publish' {
    dotnet publish $AgentProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $AgentOut
}

Invoke-Native 'FP_CLOCK x86 bridge build' {
    dotnet build $DeviceBridgeProject -c Release --no-restore -p:PlatformTarget=x86
}

$BridgeBin = Join-Path $Root 'src\KyPdks.DeviceBridge.x86\bin\Release\net48'
Require-File (Join-Path $BridgeBin 'KY.PDKS.DeviceBridge.x86.exe') 'FP_CLOCK x86 DeviceBridge exe oluşmadı.'
Copy-Item (Join-Path $BridgeBin '*') $DeviceBridgeOut -Force

function Resolve-FpRuntimeFile {
    param([string]$EnvName,[string[]]$Candidates)
    $fromEnv = [Environment]::GetEnvironmentVariable($EnvName)
    if ($fromEnv -and (Test-Path -LiteralPath $fromEnv -PathType Leaf)) { return (Resolve-Path -LiteralPath $fromEnv).Path }
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    return $null
}

$FpClockOcx = Resolve-FpRuntimeFile 'KY_PDKS_FP_CLOCK_OCX' @(
    'D:\personel yedek son\Terminal Bilgi Aktar\support\FP_CLOCK.ocx',
    'C:\Hedef500\Terminal Bilgi Aktar\support\FP_CLOCK.ocx'
)
$TmpCommDll = Resolve-FpRuntimeFile 'KY_PDKS_TMPCCOMM_DLL' @(
    'D:\personel yedek son\Terminal Bilgi Aktar\support\TMPCCOMM.dll',
    'C:\Hedef500\Terminal Bilgi Aktar\support\TMPCCOMM.dll'
)
$Ch375Dll = Resolve-FpRuntimeFile 'KY_PDKS_CH375_DLL' @(
    'C:\Program Files\SAi\SAi Production Suite 21\Program\CH375DLL.DLL',
    'C:\Program Files (x86)\SAi\SAi Production Suite 21\Program\CH375DLL.DLL'
)
$FpRuntimeReady = $false
$FpRuntime = Join-Path $DeviceBridgeOut 'runtime'
if ($FpClockOcx -and $TmpCommDll) {
    New-Item $FpRuntime -ItemType Directory -Force | Out-Null
    Copy-Item $FpClockOcx (Join-Path $FpRuntime 'FP_CLOCK.ocx') -Force
    Copy-Item $TmpCommDll (Join-Path $FpRuntime 'TMPCCOMM.dll') -Force
    if ($Ch375Dll) { Copy-Item $Ch375Dll (Join-Path $FpRuntime 'CH375DLL.DLL') -Force }
    else { Write-Warning 'CH375DLL.DLL build makinesinde bulunamadı; ağ bağlantılı FP_CLOCK için opsiyonel bırakıldı.' }
    $FpRuntimeReady = $true
} else {
    Write-Warning 'FP_CLOCK runtime build makinesinde yok; Setup hedef PC üzerindeki mevcut üretici support klasöründen tek seferlik runtime migration yapacak.'
}

$AgentBridge = Join-Path $AgentOut 'DeviceBridge'
New-Item $AgentBridge -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $DeviceBridgeOut '*') $AgentBridge -Recurse -Force
$PdksWeb = Join-Path $PdksDesktopOut 'web'
New-Item $PdksWeb -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $FrontendDist '*') $PdksWeb -Recurse -Force

$PdksExe = Join-Path $PdksDesktopOut 'KY PDKS Pro.exe'
$AgentExe = Join-Path $AgentOut 'KYERP.PDKS.Agent.exe'
Require-File $PdksExe 'KY PDKS Pro.exe oluşmadı.'
Require-File $AgentExe 'KYERP.PDKS.Agent.exe oluşmadı.'
Require-File (Join-Path $PdksWeb 'index.html') 'Bundled canonical frontend web/index.html oluşmadı.'

$PdksVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($PdksExe).ProductVersion
$AgentVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($AgentExe).ProductVersion
foreach ($actual in @($PdksVersion,$AgentVersion)) {
    if (-not ([string]$actual).StartsWith($Version)) { throw "Ürün sürümü yanlış: $actual" }
}

Write-Host ""
Write-Host "5/8 Microsoft WebView2 prerequisite" -ForegroundColor Cyan
$WebViewBootstrap = Join-Path $WebViewOut 'MicrosoftEdgeWebview2Setup.exe'
Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $WebViewBootstrap
Require-File $WebViewBootstrap 'Microsoft WebView2 bootstrapper indirilemedi.'
if ((Get-Item $WebViewBootstrap).Length -lt 100000) { throw 'Microsoft WebView2 bootstrapper beklenenden küçük/bozuk.' }

Write-Host ""
Write-Host "6/8 Inno Setup 6 ile tek PDKS Setup.exe" -ForegroundColor Cyan
$ProgramFilesX86 = ${env:ProgramFiles(x86)}
$InnoCandidates = @(
    $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe' }),
    $(if ($ProgramFilesX86) { Join-Path $ProgramFilesX86 'Inno Setup 6\ISCC.exe' }),
    $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe' })
) | Where-Object { $_ -and (Test-Path $_) }
$InnoCandidates = @($InnoCandidates)
if ($InnoCandidates.Count -eq 0) { throw 'Inno Setup 6 bulunamadı.' }

$env:KY_PDKS_DIST = $Dist
$env:KY_PDKS_SETUP_OUT = $InstallerOut
$InnoExe = [string]$InnoCandidates[0]
Invoke-Native 'KY PDKS Pro Setup' { & $InnoExe $PdksInstaller }

Write-Host ""
Write-Host "7/8 Paket bütünlüğü + SHA256" -ForegroundColor Cyan
$SetupName = "KY-PDKS-Pro-Setup-$Version.exe"
$Setup = @(Get-ChildItem $InstallerOut -Filter $SetupName -File -ErrorAction SilentlyContinue) | Select-Object -First 1
if (-not $Setup) { throw "$SetupName oluşmadı." }
if ($Setup.Length -lt 5MB) { throw "Setup beklenenden küçük: $($Setup.Length) bayt" }

$Hash = (Get-FileHash $Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  $($Setup.Name)" | Set-Content -Path "$($Setup.FullName).sha256.txt" -Encoding ascii

$BuildInfo = [ordered]@{
    version = $Version
    product = 'KY PDKS Pro'
    scope = 'PDKS_STANDALONE_CANONICAL_UI'
    setup = $Setup.Name
    sha256 = $Hash
    exe = 'KY PDKS Pro.exe'
    executableVersion = [string]$PdksVersion
    agentVersion = [string]$AgentVersion
    includesPdksAgent = $true
    includesFpClockDirectBridge = $true
    includesFpClockRuntime = [bool]$FpRuntimeReady
    supportsFpClockRuntimeMigration = $true
    includesCanonicalFrontend = $true
    includesWebView2Bootstrapper = $true
    sourceBranch = 'codex/pdks-desktop-1.8.1-device-final-20260907'
    builtAt = (Get-Date).ToString('o')
}
$BuildInfo | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $InstallerOut 'build-info-pdks.json') -Encoding utf8

Write-Host ""
Write-Host "8/8 TAMAMLANDI" -ForegroundColor Green
Write-Host "Setup  : $($Setup.FullName)" -ForegroundColor Green
Write-Host "SHA256 : $Hash" -ForegroundColor Cyan
Write-Host "Sürüm  : $PdksVersion" -ForegroundColor Cyan
Write-Host "Agent  : $AgentVersion" -ForegroundColor Cyan
