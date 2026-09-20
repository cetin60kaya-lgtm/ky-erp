$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifacts = Join-Path $root "artifacts"
$solution = Join-Path $root "KYERP.PDKS.sln"
$native = Join-Path $root "src\HKN.Personel.Native\HKN.Personel.Native.csproj"

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

Write-Host "KYERP PDKS - Solution build" -ForegroundColor Cyan
dotnet restore $solution
dotnet build $solution -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Solution build basarisiz." }

dotnet run --project (Join-Path $root "tools\ContractTests\ContractTests.csproj") -c Release --no-build
if ($LASTEXITCODE -ne 0) { throw "Contract testleri basarisiz." }

$personelOut = Join-Path $artifacts "Personel"
if (Test-Path $personelOut) { Remove-Item $personelOut -Recurse -Force }
dotnet publish $native -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $personelOut
if ($LASTEXITCODE -ne 0) { throw "Native publish basarisiz." }
if (-not (Test-Path (Join-Path $personelOut "KYERP.PDKS.exe"))) { throw "KYERP.PDKS.exe publish edilmedi." }

Write-Host "KYERP PDKS BUILD OK" -ForegroundColor Green
