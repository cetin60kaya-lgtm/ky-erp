param(
  [string]$DesenRoot = ""
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'KY ERP - Desen Sistemi Kurulumu'

function Add-Candidate([System.Collections.Generic.List[string]]$list, [string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return }
  try { $full = [IO.Path]::GetFullPath($value) } catch { return }
  if (-not $list.Contains($full)) { $list.Add($full) }
}

Write-Host ''
Write-Host '===============================================' -ForegroundColor Cyan
Write-Host '   KY ERP - DESEN KOPRUSU TEMIZ KURULUM V2' -ForegroundColor Cyan
Write-Host '===============================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Eski desen dosyalari TASINMAZ ve SILINMEZ.' -ForegroundColor Yellow
Write-Host 'Yeni sistem sadece "gelen" klasorunu izler.' -ForegroundColor DarkGray
Write-Host ''

$candidates = New-Object 'System.Collections.Generic.List[string]'
if ($DesenRoot) { Add-Candidate $candidates $DesenRoot }
foreach ($oneDriveRoot in @($env:OneDriveConsumer, $env:OneDrive, $env:OneDriveCommercial)) {
  if ($oneDriveRoot) {
    Add-Candidate $candidates (Join-Path $oneDriveRoot 'KY-ERP-MERKEZ\STORAGE\desen')
  }
}
Add-Candidate $candidates 'D:\onedrive\KY-ERP-MERKEZ\STORAGE\desen'
Add-Candidate $candidates 'D:\Onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\STORAGE\desen'
Add-Candidate $candidates 'D:\KYERP-CODEX\STORAGE\desen'

$selected = $null
foreach ($candidate in $candidates) {
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $selected = $candidate
    break
  }
}

if (-not $selected) {
  Write-Host 'Mevcut STORAGE\desen klasoru otomatik bulunamadi.' -ForegroundColor Yellow
  $selected = Read-Host 'STORAGE\desen klasorunun tam yolunu yazin'
}
if ([string]::IsNullOrWhiteSpace($selected)) { throw 'Desen klasoru secilmedi.' }
$selected = [IO.Path]::GetFullPath($selected)

$folders = @(
  $selected,
  (Join-Path $selected 'gelen'),
  (Join-Path $selected 'modeller'),
  (Join-Path $selected 'hata'),
  (Join-Path $selected 'islenemeyen'),
  (Join-Path $selected '.kyerp')
)
foreach ($folder in $folders) {
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

$localRoot = Join-Path $env:LOCALAPPDATA 'KYERP\DesenSync'
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
$configPath = Join-Path $localRoot 'config.json'
$credentialPath = Join-Path $localRoot 'credential.xml'

$config = [ordered]@{
  version = 2
  desenRoot = $selected
  incomingFolder = (Join-Path $selected 'gelen')
  modelsFolder = (Join-Path $selected 'modeller')
  errorFolder = (Join-Path $selected 'hata')
  unprocessedFolder = (Join-Path $selected 'islenemeyen')
  apiUrl = 'https://api.kyerp.net'
  companySlug = 'mecit-hakan'
  installedAt = (Get-Date).ToString('o')
}
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configPath -Encoding UTF8

Write-Host "Desen kok klasoru: $selected" -ForegroundColor Green
Write-Host ''
Write-Host 'Koprunun KY ERP hesabina baglanmasi icin kendi kullanici bilginizi bir kez girin.' -ForegroundColor Cyan
Write-Host 'Sifre Windows DPAPI ile bu bilgisayarda/sadece bu Windows kullanicisi icin sifreli saklanir.' -ForegroundColor DarkGray
$credential = Get-Credential -Message 'KY ERP Desen Sync girisi'
if (-not $credential.UserName) { throw 'KY ERP kullanici adi zorunludur.' }
$credential | Export-Clixml -LiteralPath $credentialPath

$syncDir = Join-Path $PSScriptRoot 'desen-sync'
if (-not (Test-Path -LiteralPath (Join-Path $syncDir 'package.json'))) {
  throw "Desen Sync paketi bulunamadi: $syncDir"
}

Write-Host ''
Write-Host 'Kucuk gorsel motoru kuruluyor (sharp)...' -ForegroundColor Yellow
Push-Location $syncDir
try {
  npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install basarisiz oldu.' }
} finally {
  Pop-Location
}

$marker = @"
KY ERP DESEN SISTEMI V2

UXP / Photoshop hedef klasoru:
$(Join-Path $selected 'gelen')

Kurallar:
- Yeni dosyalar sadece GELEN klasorune birakilir.
- Onerilen ad: MODEL__ON.png, MODEL__ARKA.png, MODEL__ENSE.png
- Canliya orijinal gitmez; 1600px WebP preview + 420px WebP thumb gider.
- Basarili orijinal yerelde MODELLER klasorune tasinir.
- Hata: HATA klasoru. Desteklenmeyen: ISLENEMEYEN klasoru.
- Eski dosyalar otomatik taranmaz.
"@
$markerPath = Join-Path $selected '.kyerp\UXP-HEDEF-KLASORU.txt'
$marker | Set-Content -LiteralPath $markerPath -Encoding UTF8

$startupDir = [Environment]::GetFolderPath('Startup')
$startupCmd = Join-Path $startupDir 'KYERP-DESEN-SYNC.cmd'
$runner = Join-Path $PSScriptRoot 'DESEN-SYNC-CALISTIR.ps1'
$cmd = "@echo off`r`nstart `"KY ERP Desen Sync`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`"`r`n"
Set-Content -LiteralPath $startupCmd -Value $cmd -Encoding ASCII

Write-Host ''
Write-Host 'Kurulum testi yapiliyor...' -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -Once
if ($LASTEXITCODE -ne 0) { throw 'Desen Sync ilk baglanti testi basarisiz oldu.' }

Write-Host ''
Write-Host 'Otomatik izleyici baslatiliyor...' -ForegroundColor Yellow
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"' + $runner + '"')
)

Write-Host ''
Write-Host '===============================================' -ForegroundColor Green
Write-Host '   KY ERP DESEN SISTEMI HAZIR' -ForegroundColor Green
Write-Host '===============================================' -ForegroundColor Green
Write-Host "UXP hedefi : $(Join-Path $selected 'gelen')" -ForegroundColor White
Write-Host "Yerel arsiv: $(Join-Path $selected 'modeller')" -ForegroundColor White
Write-Host 'Canli depo  : Cloudflare R2 (yalniz kucuk WebP)' -ForegroundColor White
Write-Host 'Model index : Cloudflare D1' -ForegroundColor White
Write-Host 'Windows acilisinda otomatik calisma: AKTIF' -ForegroundColor White
Write-Host ''
Write-Host 'Eski modeller klasorune dokunulmadi.' -ForegroundColor DarkGray
Write-Host 'Bundan sonra istediginiz eski/yeni gorseli GELEN klasorune koymaniz yeterli.' -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Kapatmak icin Enter'
