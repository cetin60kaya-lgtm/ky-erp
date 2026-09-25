$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifacts = Join-Path $root "artifacts"
$solution = Join-Path $root "KYERP.PDKS.sln"
$native = Join-Path $root "src\HKN.Personel.Native\HKN.Personel.Native.csproj"
$dotnetCommand = Get-Command dotnet.exe -ErrorAction SilentlyContinue
$dotnet = if ($dotnetCommand) { $dotnetCommand.Source } else { "C:\Program Files\dotnet\dotnet.exe" }
if (-not (Test-Path $dotnet)) { throw ".NET 8 SDK bulunamadi." }

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

Write-Host "KYERP PDKS - Solution build" -ForegroundColor Cyan
& $dotnet restore $solution
& $dotnet build $solution -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Solution build basarisiz." }

& $dotnet run --project (Join-Path $root "tools\ContractTests\ContractTests.csproj") -c Release --no-build
if ($LASTEXITCODE -ne 0) { throw "Contract testleri basarisiz." }

& $dotnet run --project (Join-Path $root "tools\ShellSmokeTest\ShellSmokeTest.csproj") -c Release --no-build
if ($LASTEXITCODE -ne 0) { throw "Native shell smoke testi basarisiz." }

$personelOut = Join-Path $artifacts "Personel"
if (Test-Path $personelOut) { Remove-Item $personelOut -Recurse -Force }
& $dotnet publish $native -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $personelOut
if ($LASTEXITCODE -ne 0) { throw "Native publish basarisiz." }
if (-not (Test-Path (Join-Path $personelOut "KYERP.PDKS.exe"))) { throw "KYERP.PDKS.exe publish edilmedi." }
if (-not (Test-Path (Join-Path $personelOut "KYERP.TerminalBridge.exe"))) { throw "KYERP.TerminalBridge.exe publish edilmedi." }

$terminalSdkSource = "D:\Hedef500\Hedef500\Terminal Bilgi Aktar\support"
if (Test-Path (Join-Path $terminalSdkSource "FP_CLOCK.ocx")) {
    $terminalSdkOut = Join-Path $personelOut "TerminalSdk"
    New-Item -ItemType Directory -Force -Path $terminalSdkOut | Out-Null
    foreach ($name in @("FP_CLOCK.ocx","TMPCCOMM.dll","CH375DLL.DLL","MFC42.DLL")) {
        $source = Join-Path $terminalSdkSource $name
        if (Test-Path $source) { Copy-Item $source $terminalSdkOut -Force }
    }
} else {
    Write-Warning "Fiziksel terminal SDK kaynagi bulunamadi; cihaz ActiveX dosyalari pakete eklenmedi."
}

Write-Host "KYERP PDKS BUILD OK" -ForegroundColor Green
