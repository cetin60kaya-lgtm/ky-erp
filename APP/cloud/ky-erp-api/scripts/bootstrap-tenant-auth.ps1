Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw "CLOUDFLARE_API_TOKEN ortam değişkeni bulunamadı."
}

function Read-PlainPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$adminPassword = Read-PlainPassword "Admin için yeni şifre"
$adminConfirm = Read-PlainPassword "Admin şifresini tekrar girin"
if ($adminPassword -cne $adminConfirm) { throw "Admin şifreleri eşleşmiyor." }
if ($adminPassword.Length -lt 6 -or $adminPassword -notmatch '[A-Za-zÇĞİÖŞÜçğıöşü]' -or $adminPassword -notmatch '\d') {
  throw "Admin şifresi en az 6 karakter, bir harf ve bir rakam içermelidir."
}

$hknPassword = Read-PlainPassword "HKN için tam 6 rakamlı yeni şifre"
$hknConfirm = Read-PlainPassword "HKN şifresini tekrar girin"
if ($hknPassword -cne $hknConfirm) { throw "HKN şifreleri eşleşmiyor." }
if ($hknPassword -notmatch '^\d{6}$') { throw "HKN şifresi tam 6 rakam olmalıdır." }

$payload = @{ adminPassword = $adminPassword; hknPassword = $hknPassword } | ConvertTo-Json -Compress
try {
  $payload | node "$PSScriptRoot\bootstrap-tenant-auth.mjs"
  if ($LASTEXITCODE -ne 0) { throw "Hesap hazırlama işlemi başarısız oldu." }
}
finally {
  $adminPassword = $null
  $adminConfirm = $null
  $hknPassword = $null
  $hknConfirm = $null
  $payload = $null
}
