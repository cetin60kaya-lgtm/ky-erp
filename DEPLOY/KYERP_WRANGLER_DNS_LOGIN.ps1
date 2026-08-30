$ErrorActionPreference = "Stop"

Write-Host "KY ERP - CLOUDFLARE / WRANGLER DNS YETKI YENILEME" -ForegroundColor Cyan
Write-Host "Bu islem yalniz Wrangler OAuth oturumunu gerekli production + DNS scope'lariyla yeniler." -ForegroundColor DarkGray
Write-Host ""

$scopes = @(
  "account:read",
  "user:read",
  "zone:read",
  "dns:read",
  "dns:write",
  "workers:write",
  "workers_kv:write",
  "workers_routes:write",
  "workers_scripts:write",
  "workers_tail:read",
  "d1:write",
  "pages:write",
  "ssl_certs:write",
  "email_routing:write",
  "email_sending:write",
  "offline_access"
) -join " "

Write-Host "Wrangler mevcut OAuth oturumu kapatiliyor..." -ForegroundColor Yellow
& wrangler logout
if ($LASTEXITCODE -ne 0) {
  Write-Host "Wrangler logout hata kodu: $LASTEXITCODE" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Wrangler DNS Write dahil yetkilerle tekrar aciliyor..." -ForegroundColor Yellow
& wrangler login --scopes $scopes
if ($LASTEXITCODE -ne 0) {
  throw "Wrangler yeniden yetkilendirme tamamlanmadi."
}

Write-Host ""
Write-Host "Wrangler OAuth yenilendi." -ForegroundColor Green
Write-Host "Beklenen kritik scope'lar: zone:read + dns:read + dns:write + workers/pages/d1 write" -ForegroundColor Green
Write-Host ""
Write-Host "Simdi KY ERP CANLIYA YUKLE.bat dosyasini yeniden calistirin." -ForegroundColor Cyan
