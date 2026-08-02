param(
    [switch]$Reset,
    [string]$RenkKayitFile = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

try { chcp 65001 | Out-Null } catch {}
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $Utf8
[Console]::OutputEncoding = $Utf8
$OutputEncoding = $Utf8

$BaseScript = Join-Path $PSScriptRoot "KYERP_URETIM_YEREL_TEST.ps1"
$ImportScript = Join-Path $PSScriptRoot "KYERP_BOYAHANE_RENK_KAYIT_IMPORT.ps1"

if (-not (Test-Path -LiteralPath $BaseScript)) {
    throw "Ana yerel test betiği bulunamadı: $BaseScript"
}
if (-not (Test-Path -LiteralPath $ImportScript)) {
    throw "Renk Kayıt aktarım betiği bulunamadı: $ImportScript"
}

$Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $BaseScript,
    "-Page", "Boyahane"
)
if ($Reset) {
    $Arguments += "-Reset"
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor DarkCyan
Write-Host " KY ERP BOYAHANE TAM YEREL KONTROL" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor DarkCyan

& powershell @Arguments
if ($LASTEXITCODE -ne 0) {
    throw "Ana Boyahane yerel ortamı başlatılamadı."
}

$ImportArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $ImportScript,
    "-ApiBase", "http://127.0.0.1:8788",
    "-CompanySlug", "mecit-hakan"
)
if ($RenkKayitFile) {
    $ImportArguments += @("-FilePath", $RenkKayitFile)
}

& powershell @ImportArguments
if ($LASTEXITCODE -ne 0) {
    throw "Renk Kayıt reçeteleri yerel Boyahane ortamına aktarılamadı."
}

Start-Process "http://localhost:5173/boyahane/uretim-gecmisi"

Write-Host ""
Write-Host "Boyahane yerel kontrolü hazır." -ForegroundColor Green
Write-Host "Tam Excel bulunduysa 967 gerçek reçete aktarılmış olmalıdır." -ForegroundColor Green
Write-Host "Tarayıcıda Ctrl + 0 ve ardından Ctrl + F5 yapın." -ForegroundColor Cyan
