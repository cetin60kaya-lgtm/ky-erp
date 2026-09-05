param(
  [ValidateSet('audit','observe','enforce')]
  [string]$Mode = 'audit',
  [string]$Zone = 'kyerp.net'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Tool = Join-Path $Root 'tools\cloudflare\kyerp-pro-security.mjs'

function Fail([string]$Message) {
  Write-Host "HATA: $Message" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $Tool)) {
  Fail "Cloudflare araci bulunamadi: $Tool"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js bulunamadi.'
}

$ownedToken = $false

if (-not $env:CLOUDFLARE_MANAGEMENT_TOKEN) {
  Write-Host 'Cloudflare management token degerini girin. Deger ekranda gorunmez ve dosyaya yazilmaz.' -ForegroundColor Yellow
  $secure = Read-Host -AsSecureString 'CLOUDFLARE_MANAGEMENT_TOKEN'
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

  try {
    $env:CLOUDFLARE_MANAGEMENT_TOKEN =
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $ownedToken = $true
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

try {
  Write-Host "KY ERP Cloudflare Pro Security - mode=$Mode zone=$Zone" -ForegroundColor Cyan
  & node $Tool --mode $Mode --zone $Zone

  if ($LASTEXITCODE -ne 0) {
    Fail "Cloudflare guvenlik araci hata kodu: $LASTEXITCODE"
  }
}
finally {
  if ($ownedToken) {
    Remove-Item Env:CLOUDFLARE_MANAGEMENT_TOKEN -ErrorAction SilentlyContinue
  }
}
