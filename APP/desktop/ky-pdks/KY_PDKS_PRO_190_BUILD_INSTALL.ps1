param(
    [switch]$BuildOnly
)

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8

$Version='1.9.0'
$Branch='codex/pdks-desktop-1.8.1-device-final-20260907'
$RepoUrl='https://github.com/cetin60kaya-lgtm/ky-erp.git'
$Stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$Work=Join-Path $env:TEMP "KYERP-PDKS-PRO-190-$Stamp"
$Desktop=[Environment]::GetFolderPath('Desktop')
$Delivery=Join-Path $Desktop 'KY PDKS Pro 1.9.0 Kurulum'
$Log=Join-Path $Desktop "KY-PDKS-Pro-1.9.0-Build-$Stamp.log"

function Is-Administrator {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if(-not (Is-Administrator)){
    $quotedPath='"' + $PSCommandPath + '"'
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$quotedPath)
    if($BuildOnly){$args+='-BuildOnly'}
    Start-Process powershell.exe -Verb RunAs -ArgumentList $args
    exit
}

function Refresh-Path {
    $machine=[Environment]::GetEnvironmentVariable('Path','Machine')
    $user=[Environment]::GetEnvironmentVariable('Path','User')
    $env:Path="$machine;$user"
}

function Command-Exists([string]$Name) {
    return @((Get-Command $Name -ErrorAction SilentlyContinue)).Count -gt 0
}

function Ensure-Package {
    param([string]$Command,[string]$PackageId,[string]$Label)
    Refresh-Path
    if(Command-Exists $Command){return}
    if(-not (Command-Exists 'winget')){
        throw "Windows Package Manager (winget) bulunamadı. Windows App Installer güncel olmalıdır."
    }
    Write-Host "$Label kuruluyor..." -ForegroundColor Yellow
    & winget install --id $PackageId -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if($LASTEXITCODE -ne 0){throw "$Label kurulamadı. winget kodu=$LASTEXITCODE"}
    Refresh-Path
    if(-not (Command-Exists $Command)){throw "$Label kuruldu ancak komut PATH üzerinde bulunamadı: $Command"}
}

function Invoke-Checked {
    param([string]$Label,[scriptblock]$Command)
    Write-Host ""
    Write-Host ">>> $Label" -ForegroundColor Cyan
    & $Command
    if($LASTEXITCODE -ne 0){throw "$Label başarısız. Kod=$LASTEXITCODE"}
}

New-Item $Delivery -ItemType Directory -Force | Out-Null
Start-Transcript -Path $Log -Force | Out-Null

try{
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host "KY PDKS Pro $Version · TAM BUILD + KURULUM" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor DarkCyan

    Ensure-Package -Command 'git.exe' -PackageId 'Git.Git' -Label 'Git'
    Ensure-Package -Command 'dotnet.exe' -PackageId 'Microsoft.DotNet.SDK.8' -Label '.NET 8 SDK'
    Ensure-Package -Command 'node.exe' -PackageId 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS'

    $innoCandidates=@(
        $(if($env:LOCALAPPDATA){Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'}),
        $(if(${env:ProgramFiles(x86)}){Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'}),
        $(if($env:ProgramFiles){Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'})
    ) | Where-Object {$_ -and (Test-Path $_)}
    $innoCandidates=@($innoCandidates)
    if($innoCandidates.Count -eq 0){
        if(-not (Command-Exists 'winget')){throw 'Inno Setup 6 bulunamadı ve winget yok.'}
        & winget install --id JRSoftware.InnoSetup -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
        if($LASTEXITCODE -ne 0){throw "Inno Setup 6 kurulamadı. winget kodu=$LASTEXITCODE"}
        Refresh-Path
    }

    Write-Host "Git    : $(& git --version)" -ForegroundColor DarkGray
    Write-Host ".NET   : $(& dotnet --version)" -ForegroundColor DarkGray
    Write-Host "Node   : $(& node --version)" -ForegroundColor DarkGray
    Write-Host "npm    : $(& npm --version)" -ForegroundColor DarkGray

    if(Test-Path $Work){Remove-Item $Work -Recurse -Force}
    Invoke-Checked 'Güncel KY PDKS Pro feature kaynağı alınıyor' {
        git -c core.longpaths=true clone --depth 1 --single-branch --branch $Branch $RepoUrl $Work
    }

    $Commit=(& git -C $Work rev-parse HEAD).Trim()
    if(-not $Commit){throw 'Kaynak commit SHA alınamadı.'}
    Write-Host "Kaynak commit: $Commit" -ForegroundColor DarkGray

    $PdksRoot=Join-Path $Work 'APP\desktop\ky-pdks'
    $BuildScript=Join-Path $PdksRoot 'BUILD_PDKS_PRO_SETUP.ps1'
    if(-not (Test-Path $BuildScript)){throw "PDKS build script bulunamadı: $BuildScript"}

    Invoke-Checked 'Frontend + .NET test + publish + Setup zinciri' {
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildScript
    }

    $SetupSource=Join-Path $PdksRoot "dist-pdks\setup\KY-PDKS-Pro-Setup-$Version.exe"
    $HashSource="$SetupSource.sha256.txt"
    $InfoSource=Join-Path $PdksRoot 'dist-pdks\setup\build-info-pdks.json'
    if(-not (Test-Path $SetupSource)){throw "Setup oluşmadı: $SetupSource"}
    if(-not (Test-Path $HashSource)){throw 'SHA256 dosyası oluşmadı.'}
    if(-not (Test-Path $InfoSource)){throw 'build-info-pdks.json oluşmadı.'}

    $SetupDest=Join-Path $Delivery (Split-Path $SetupSource -Leaf)
    Copy-Item $SetupSource $SetupDest -Force
    Copy-Item $HashSource "$SetupDest.sha256.txt" -Force
    Copy-Item $InfoSource (Join-Path $Delivery 'build-info-pdks.json') -Force

    $ExpectedHash=((Get-Content "$SetupDest.sha256.txt" -Raw).Trim().Split(' ')[0]).ToLowerInvariant()
    $ActualHash=(Get-FileHash $SetupDest -Algorithm SHA256).Hash.ToLowerInvariant()
    if($ExpectedHash -ne $ActualHash){throw "Setup SHA256 uyuşmuyor. Beklenen=$ExpectedHash Gerçek=$ActualHash"}

    if($BuildOnly){
        Write-Host ""
        Write-Host "BUILD TAMAM. Kurulum yapılmadı (-BuildOnly)." -ForegroundColor Green
        Write-Host $SetupDest -ForegroundColor Green
        return
    }

    Write-Host ""
    Write-Host "KY PDKS Pro kuruluyor..." -ForegroundColor Cyan
    $setupProcess=Start-Process -FilePath $SetupDest -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS="desktopicon"' -Wait -PassThru
    if($setupProcess.ExitCode -ne 0){throw "PDKS Setup hata kodu: $($setupProcess.ExitCode)"}

    Start-Sleep -Seconds 2
    $service=Get-Service -Name 'KYERP.PDKS.Agent' -ErrorAction SilentlyContinue
    if(-not $service){throw 'KYERP.PDKS.Agent servisi kurulum sonrası bulunamadı.'}
    if($service.Status -ne 'Running'){
        Start-Service -Name 'KYERP.PDKS.Agent'
        $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
        $service=Get-Service -Name 'KYERP.PDKS.Agent'
    }
    if($service.Status -ne 'Running'){throw "PDKS Agent çalışmıyor. Durum=$($service.Status)"}

    $appPath=''
    $uninstallRoots=@(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach($root in $uninstallRoots){
        $row=Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -eq 'KY PDKS Pro'} | Select-Object -First 1
        if($row -and $row.InstallLocation){
            $candidate=Join-Path $row.InstallLocation 'KY PDKS Pro.exe'
            if(Test-Path $candidate){$appPath=$candidate;break}
        }
    }
    if(-not $appPath){
        foreach($candidate in @(
            (Join-Path $env:ProgramFiles 'KY ERP\PDKS Pro\KY PDKS Pro.exe'),
            (Join-Path $env:ProgramFiles 'KY ERP\PDKS Desktop\KY PDKS Pro.exe')
        )){
            if(Test-Path $candidate){$appPath=$candidate;break}
        }
    }
    if(-not $appPath){throw 'KY PDKS Pro.exe kurulum sonrası bulunamadı.'}

    $configPath=Join-Path $env:ProgramData 'KY ERP\PDKS\config.json'
    $dataPath=Join-Path $env:ProgramData 'KY ERP\PDKS\Data\pdks.db'
    $setupMarker=Join-Path $env:ProgramData 'KY ERP\PDKS\setup.completed'
    $report=Join-Path $Delivery 'KURULUM_RAPORU.txt'
    @(
        "KY PDKS Pro $Version",
        "Kaynak commit : $Commit",
        "Setup SHA256  : $ActualHash",
        "Uygulama      : $appPath",
        "Agent         : $($service.Status)",
        "Config        : $configPath",
        "Yerel DB      : $dataPath",
        "İlk sihirbaz  : $(if(Test-Path $setupMarker){'Tamamlanmış'}else{'Giriş sonrası otomatik açılacak'})",
        "Build log     : $Log",
        "Kurulum zamanı: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    ) | Set-Content $report -Encoding UTF8

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkGreen
    Write-Host "KY PDKS PRO 1.9.0 KURULDU" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor DarkGreen
    Write-Host "Agent : RUNNING" -ForegroundColor Green
    Write-Host "Setup : $SetupDest" -ForegroundColor Green
    Write-Host "Rapor : $report" -ForegroundColor Cyan
    Write-Host "Uygulama açılıyor. Girişten sonra ilk terminal sihirbazı otomatik gelir." -ForegroundColor Cyan

    Start-Process -FilePath $appPath
}
catch{
    Write-Host ""
    Write-Host "HATA: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Kaynak/build klasörü korundu: $Work" -ForegroundColor Yellow
    Write-Host "Log: $Log" -ForegroundColor Yellow
    throw
}
finally{
    try{Stop-Transcript | Out-Null}catch{}
}
