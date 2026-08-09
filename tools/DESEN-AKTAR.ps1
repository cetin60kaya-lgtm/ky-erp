$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'KY ERP - Desen Bulut Aktarimi'

Write-Host ''
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host '   KY ERP - DESEN BULUT AKTARIMI (R2 + D1)' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host ''

$candidates = @(
  'D:\onedrive\KY-ERP-MERKEZ\STORAGE\desen\modeller',
  'D:\Onedrive-Hkn\OneDrive\KY-ERP-MERKEZ\STORAGE\desen\modeller',
  'D:\KYERP-CODEX\STORAGE\desen\modeller'
)

$defaultSource = $null
foreach ($candidate in $candidates) {
  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $defaultSource = $candidate
    break
  }
}

if ($defaultSource) {
  Write-Host "Bulunan kaynak: $defaultSource" -ForegroundColor Green
  $answer = Read-Host 'Bu klasoru kullanayim mi? (E/h)'
  if ([string]::IsNullOrWhiteSpace($answer) -or $answer.Trim().ToLowerInvariant() -eq 'e') {
    $source = $defaultSource
  }
}

if (-not $source) {
  $source = Read-Host 'Desenlerin bulundugu klasorun tam yolunu yazin'
}

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "Klasor bulunamadi: $source"
}

$username = Read-Host 'KY ERP kullanici adi'
$securePassword = Read-Host 'KY ERP sifre' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$env:KYERP_DESEN_SOURCE = $source
$env:KYERP_USER = $username
$env:KYERP_PASSWORD = $plainPassword
$env:KYERP_API_URL = 'https://api.kyerp.net'
$env:KYERP_COMPANY = 'mecit-hakan'
$env:KYERP_DESEN_BATCH = '3'
$env:KYERP_DESEN_PROCESS = '1'

$scriptPath = Join-Path $PSScriptRoot 'desen-r2-import.mjs'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Aktarim motoru bulunamadi: $scriptPath"
}

try {
  node --version | Out-Null
} catch {
  throw 'Node.js bulunamadi. KY ERP gelistirme bilgisayarinda Node.js kurulu olmali.'
}

Write-Host ''
Write-Host 'Aktarim basliyor. Pencereyi kapatmayin...' -ForegroundColor Yellow
Write-Host 'Dosyalar R2 bulut deposuna, model kartlari D1 indeksine kaydedilecek.' -ForegroundColor DarkGray
Write-Host ''

try {
  & node $scriptPath $source
  $exitCode = $LASTEXITCODE
} finally {
  Remove-Item Env:KYERP_PASSWORD -ErrorAction SilentlyContinue
  $plainPassword = $null
}

Write-Host ''
if ($exitCode -eq 0) {
  Write-Host 'DESEN AKTARIMI TAMAMLANDI.' -ForegroundColor Green
  Write-Host "Rapor: $(Join-Path $source 'KYERP-DESEN-AKTARIM-RAPORU.json')" -ForegroundColor Green
} else {
  Write-Host 'Aktarim bazi dosyalarda hata ile tamamlandi. Raporu kontrol edin; tekrar calistirinca basarili dosyalar atlanir.' -ForegroundColor Yellow
}
Write-Host ''
Read-Host 'Kapatmak icin Enter'
exit $exitCode
