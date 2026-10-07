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
& $dotnet publish $native -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $personelOut
if ($LASTEXITCODE -ne 0) { throw "Native publish basarisiz." }
if (-not (Test-Path (Join-Path $personelOut "KYERP.PDKS.exe"))) { throw "KYERP.PDKS.exe publish edilmedi." }
if (-not (Test-Path (Join-Path $personelOut "KYERP.TerminalBridge.exe"))) { throw "KYERP.TerminalBridge.exe publish edilmedi." }

$terminalSdkCandidates = @(
    "D:\Hedef500\Hedef500\Terminal Bilgi Aktar\support",
    "C:\Hedef500\Terminal Bilgi Aktar\support",
    "C:\Hedef500\Hedef500\Terminal Bilgi Aktar\support"
)
$terminalSdkSource = $terminalSdkCandidates | Where-Object { Test-Path (Join-Path $_ "FP_CLOCK.ocx") } | Select-Object -First 1
if ($terminalSdkSource) {
    $terminalSdkOut = Join-Path $personelOut "TerminalSdk"
    New-Item -ItemType Directory -Force -Path $terminalSdkOut | Out-Null
    foreach ($name in @("FP_CLOCK.ocx","TMPCCOMM.dll","CH375DLL.DLL","MFC42.DLL")) {
        $source = Join-Path $terminalSdkSource $name
        if (Test-Path $source) { Copy-Item $source $terminalSdkOut -Force }
    }
    $missing = @("FP_CLOCK.ocx","TMPCCOMM.dll","CH375DLL.DLL","MFC42.DLL") | Where-Object { -not (Test-Path (Join-Path $terminalSdkOut $_)) }
    if ($missing.Count -gt 0) { throw "TerminalSdk eksik: $($missing -join ', ')" }
    Write-Host "Terminal SDK eklendi: $terminalSdkSource" -ForegroundColor Green
} else {
    Write-Warning "Fiziksel terminal SDK kaynagi bulunamadi; cihaz ActiveX dosyalari pakete eklenmedi."
}

$ps2000Candidates = @(
    "D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL\PAYLOAD\PS2000_ANALIZ",
    "D:\Googledrive\Hakan Emp\OTOMASYON\KY-CONTROL\PAYLOAD\PS2000_ANALIZ",
    "C:\Users\DESEN\Desktop\KY PDKS TEST 01-10-2026\TerminalSdkPS2000"
)
$ps2000Source = $ps2000Candidates | Where-Object {
    (Test-Path (Join-Path $_ "SBXPC.ocx")) -and
    (Test-Path (Join-Path $_ "SBXPCDLL.dll")) -and
    (Test-Path (Join-Path $_ "SBPCCOMM.dll")) -and
    (Test-Path (Join-Path $_ "GEN_FONT.dll"))
} | Select-Object -First 1
if ($ps2000Source) {
    $ps2000Out = Join-Path $personelOut "TerminalSdkPS2000"
    New-Item -ItemType Directory -Force -Path $ps2000Out | Out-Null
    foreach ($name in @("SBXPC.ocx","SBXPCDLL.dll","SBPCCOMM.dll","GEN_FONT.dll")) {
        Copy-Item (Join-Path $ps2000Source $name) $ps2000Out -Force
    }
    Write-Host "PS-2000 SDK eklendi: $ps2000Source" -ForegroundColor Green
} else {
    Write-Warning "PS-2000 / SBXPC SDK bulunamadi; yeni A3 terminal pakete eklenmedi."
}

Write-Host "KYERP PDKS BUILD OK" -ForegroundColor Green
