$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifacts = Join-Path $root "artifacts"
$native = Join-Path $root "src\HKN.Personel.Native\HKN.Personel.Native.csproj"
$bridge = Join-Path $root "src\HKN.Personel.Bridge\HKN.Personel.Bridge.csproj"

New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

Write-Host "KYERP PDKS - Native build" -ForegroundColor Cyan
dotnet restore $native
dotnet build $native -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Native build basarisiz." }

Write-Host "KYERP PDKS - Bridge build" -ForegroundColor Cyan
dotnet restore $bridge
dotnet build $bridge -c Release --no-restore
if ($LASTEXITCODE -ne 0) { throw "Bridge build basarisiz." }

dotnet publish $native -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o (Join-Path $artifacts "Personel")
if ($LASTEXITCODE -ne 0) { throw "Native publish basarisiz." }

dotnet publish $bridge -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o (Join-Path $artifacts "Bridge")
if ($LASTEXITCODE -ne 0) { throw "Bridge publish basarisiz." }

Write-Host "KYERP PDKS BUILD OK" -ForegroundColor Green
