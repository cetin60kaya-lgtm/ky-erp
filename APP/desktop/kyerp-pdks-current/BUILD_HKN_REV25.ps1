param(
    [string]$OutputRoot = (Join-Path $PSScriptRoot 'artifacts\HKN-PDKS-REV25')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Join-Path $root 'tools\HknPdksRev17\QuickDataTool.csproj'
$tests = Join-Path $root 'tools\HknRev17Tests\SyncTests.csproj'
$publish = Join-Path $OutputRoot 'publish'
$package = Join-Path $OutputRoot 'package'
$finalExe = Join-Path $package 'HKN-PDKS-REV25-FINAL.exe'
$zip = Join-Path $OutputRoot 'HKN-PDKS-REV25-FINAL.zip'

if (-not (Test-Path $project)) { throw "REV25 proje dosyası bulunamadı: $project" }
if (-not (Test-Path $tests)) { throw "REV25 test projesi bulunamadı: $tests" }

$verifier = Join-Path $env:LOCALAPPDATA 'HKN-PDKS\REV15_PASSWORD_GATE.json'
if (-not (Test-Path $verifier)) {
    throw "Özel açılış şifresi doğrulayıcısı bulunamadı: $verifier"
}

if (Test-Path $OutputRoot) { Remove-Item $OutputRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $publish,$package | Out-Null

Write-Host 'REV25 testleri çalışıyor...' -ForegroundColor Cyan
dotnet run --project $tests -c Release
if ($LASTEXITCODE -ne 0) { throw 'REV25 testleri başarısız.' }

Write-Host 'REV25 tek EXE publish...' -ForegroundColor Cyan
dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $publish
if ($LASTEXITCODE -ne 0) { throw 'REV25 publish başarısız.' }

$publishedExe = Join-Path $publish 'QuickDataTool.exe'
if (-not (Test-Path $publishedExe)) { throw 'QuickDataTool.exe oluşmadı.' }
Copy-Item $publishedExe $finalExe -Force

$hash = (Get-FileHash $finalExe -Algorithm SHA256).Hash
$head = $env:GITHUB_SHA
$branchName = $env:GITHUB_REF_NAME
if (Test-Path (Join-Path $root '.git')) {
    try {
        $head = (git -C $root rev-parse HEAD 2>$null).Trim()
        $branchName = (git -C $root branch --show-current 2>$null).Trim()
    } catch {}
}
if ([string]::IsNullOrWhiteSpace($head)) { $head = 'source-snapshot' }
if ([string]::IsNullOrWhiteSpace($branchName)) { $branchName = 'codex/kyerp-pdks-full-app-prep' }

$info = @(
    'HKN PDKS REV25 FINAL'
    'Ürün: HKN PDKS Hızlı Veri'
    'Runtime: win-x64 / .NET 8 / self-contained / single-file'
    'Kural: DB ana kaynak; TNF DB normal hareketlerinin bire bir aynasıdır.'
    'E kayıtları DB içinde kalır, TNF dosyasına yazılmaz.'
    'Saat üretimi sabit değildir; Hedef DB çalışma aralığı kullanılır.'
    'Ana menü tek sahibidir; eski runtime injector sekmeleri yoktur.'
    'Bordro override + ay kilidi + personel kilidi korunur.'
    "Branch: $branchName"
    "Commit: $head"
    "Build: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))"
    "SHA256: $hash"
)
$info | Set-Content (Join-Path $package 'BUILD_INFO.txt') -Encoding UTF8
"$hash  HKN-PDKS-REV25-FINAL.exe" | Set-Content (Join-Path $package 'HKN-PDKS-REV25-FINAL.exe.sha256.txt') -Encoding ASCII

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $package '*') -DestinationPath $zip -Force
$zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash
"$zipHash  HKN-PDKS-REV25-FINAL.zip" | Set-Content "$zip.sha256.txt" -Encoding ASCII

Write-Host "REV25 FINAL EXE: $finalExe" -ForegroundColor Green
Write-Host "REV25 FINAL ZIP: $zip" -ForegroundColor Green
Write-Host "EXE SHA256: $hash" -ForegroundColor Green
Write-Host "ZIP SHA256: $zipHash" -ForegroundColor Green
