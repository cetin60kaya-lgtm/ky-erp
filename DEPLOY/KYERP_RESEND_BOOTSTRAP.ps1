$ErrorActionPreference = "Stop"

$ROOT = Split-Path $PSScriptRoot -Parent
$WORKER_DIR = Join-Path $ROOT "APP\cloud\ky-erp-api"
$WRANGLER_CONFIG = Join-Path $WORKER_DIR "wrangler.jsonc"
$DOMAIN = "kyerp.net"
$FROM_ADDRESS = "KY ERP <admin@kyerp.net>"
$RESEND_BASE = "https://api.resend.com"

$script:ResendKey = ""
$script:CfToken = ""
$script:CfZoneId = ""

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    throw $Message
}

function Read-SecretPlain([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    if ($null -eq $secure -or $secure.Length -eq 0) { return "" }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-ResendApi([string]$Method, [string]$Path, $Body = $null) {
    if (-not $script:ResendKey) { Fail "Resend API anahtari hazir degil." }
    $headers = @{ Authorization = "Bearer $($script:ResendKey)"; Accept = "application/json" }
    $uri = "$RESEND_BASE$Path"
    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 12 -Compress
            return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 40
        }
        return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec 40
    } catch {
        $detail = $_.Exception.Message
        try {
            $stream = $_.Exception.Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            if ($stream) { $detail = "$detail | $stream" }
        } catch {}
        Fail "Resend API istegi basarisiz [$Method $Path]: $detail"
    }
}

function Invoke-CfApi([string]$Method, [string]$Path, $Body = $null) {
    if (-not $script:CfToken) { Fail "Cloudflare tokeni hazir degil." }
    $headers = @{ Authorization = "Bearer $($script:CfToken)" }
    $uri = "https://api.cloudflare.com/client/v4$Path"
    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 12 -Compress
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -ContentType "application/json" -Body $json -TimeoutSec 40
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -TimeoutSec 40
        }
    } catch {
        $message = $_.Exception.Message
        if ($message -match "403|Forbidden|permission") { throw "CF_DNS_PERMISSION_REQUIRED" }
        Fail "Cloudflare API istegi basarisiz [$Method $Path]: $message"
    }
    if ($null -ne $response.success -and -not [bool]$response.success) {
        $errors = try { $response.errors | ConvertTo-Json -Depth 8 -Compress } catch { "" }
        if ($errors -match "permission|auth|forbidden") { throw "CF_DNS_PERMISSION_REQUIRED" }
        Fail "Cloudflare API basarisiz [$Method $Path]: $errors"
    }
    return $response
}

function Initialize-CloudflareContext {
    $raw = (& wrangler auth token --json 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $raw) { Fail "Wrangler oturumu yok. Once wrangler login yapilmalidir." }
    try { $auth = $raw | ConvertFrom-Json } catch { Fail "Wrangler auth token JSON okunamadi." }
    $token = [string]$auth.token
    if (-not $token) { Fail "Wrangler OAuth/API tokeni okunamadi." }
    $script:CfToken = $token

    $zones = Invoke-CfApi "GET" "/zones?name=$DOMAIN"
    $rows = @($zones.result)
    if ($rows.Count -ne 1) { Fail "$DOMAIN Cloudflare zone kaydi tekil bulunamadi." }
    $script:CfZoneId = [string]$rows[0].id
    if (-not $script:CfZoneId) { Fail "Cloudflare zone kimligi okunamadi." }
}

function Normalize-DnsName([string]$Name) {
    $n = $Name.Trim().TrimEnd('.')
    if (-not $n -or $n -eq "@") { return $DOMAIN }
    if ($n.ToLowerInvariant() -eq $DOMAIN) { return $DOMAIN }
    if ($n.ToLowerInvariant().EndsWith(".$DOMAIN")) { return $n }
    return "$n.$DOMAIN"
}

function Normalize-DnsContent([string]$Type, [string]$Value) {
    $content = $Value.Trim()
    if ($Type -eq "TXT" -and $content.Length -ge 2 -and $content.StartsWith('"') -and $content.EndsWith('"')) {
        $content = $content.Substring(1, $content.Length - 2)
    }
    if ($Type -in @("MX","CNAME")) { $content = $content.TrimEnd('.') }
    return $content
}

function Dns-ContentEqual([string]$Type, [string]$Left, [string]$Right) {
    return (Normalize-DnsContent $Type $Left).ToLowerInvariant() -eq (Normalize-DnsContent $Type $Right).ToLowerInvariant()
}

function Ensure-CloudflareDnsRecord($Record) {
    $type = ([string]$Record.type).Trim().ToUpperInvariant()
    if ($type -notin @("TXT","MX","CNAME")) { return }
    if (([string]$Record.record).Trim().ToLowerInvariant() -eq "tracking") { return }

    $name = Normalize-DnsName ([string]$Record.name)
    $content = Normalize-DnsContent $type ([string]$Record.value)
    if (-not $content) { return }

    $safeType = [uri]::EscapeDataString($type)
    $safeName = [uri]::EscapeDataString($name)
    $existingResponse = Invoke-CfApi "GET" "/zones/$($script:CfZoneId)/dns_records?type=$safeType&name=$safeName&per_page=100"
    $existing = @($existingResponse.result)
    $priority = if ($type -eq "MX") { [int]($Record.priority ?? 10) } else { $null }

    $match = @($existing | Where-Object {
        (Dns-ContentEqual $type ([string]$_.content) $content) -and ($type -ne "MX" -or [int]$_.priority -eq $priority)
    }) | Select-Object -First 1
    if ($null -ne $match) {
        Write-Host "DNS hazir: $type $name" -ForegroundColor DarkGreen
        return
    }

    $payload = @{ type = $type; name = $name; content = $content; ttl = 1 }
    if ($type -eq "MX") { $payload.priority = $priority }
    if ($type -eq "CNAME") { $payload.proxied = $false }

    $replaceCandidate = $null
    if ($existing.Count -eq 1) {
        if ($type -eq "CNAME") { $replaceCandidate = $existing[0] }
        elseif ($type -eq "TXT" -and (([string]$Record.record).Trim().ToUpperInvariant() -in @("SPF","DKIM"))) { $replaceCandidate = $existing[0] }
        elseif ($type -eq "MX") { $replaceCandidate = $existing[0] }
    }

    if ($null -ne $replaceCandidate) {
        $id = [uri]::EscapeDataString([string]$replaceCandidate.id)
        Invoke-CfApi "PUT" "/zones/$($script:CfZoneId)/dns_records/$id" $payload | Out-Null
        Write-Host "DNS guncellendi: $type $name" -ForegroundColor Green
    } else {
        Invoke-CfApi "POST" "/zones/$($script:CfZoneId)/dns_records" $payload | Out-Null
        Write-Host "DNS eklendi: $type $name" -ForegroundColor Green
    }
}

function Ensure-ResendDomain {
    Write-Step "RESEND DOMAIN"
    $list = Invoke-ResendApi "GET" "/domains"
    $domain = @($list.data | Where-Object { ([string]$_.name).Trim().ToLowerInvariant() -eq $DOMAIN }) | Select-Object -First 1
    if ($null -eq $domain) {
        Write-Host "$DOMAIN Resend hesabina ekleniyor..." -ForegroundColor Yellow
        $domain = Invoke-ResendApi "POST" "/domains" @{
            name = $DOMAIN
            region = "eu-west-1"
            capabilities = @{ sending = "enabled"; receiving = "disabled" }
        }
    }
    $domainId = [string]$domain.id
    if (-not $domainId) { Fail "Resend domain kimligi alinmadi." }
    $detail = Invoke-ResendApi "GET" "/domains/$domainId"
    return $detail
}

function Ensure-ResendDns($DomainDetail) {
    Write-Step "RESEND DNS -> CLOUDFLARE"
    Initialize-CloudflareContext
    $records = @($DomainDetail.records | Where-Object { ([string]$_.record).Trim().ToLowerInvariant() -ne "tracking" })
    if ($records.Count -eq 0) { Fail "Resend SPF/DKIM kayitlari bulunamadi." }

    try {
        foreach ($record in $records) { Ensure-CloudflareDnsRecord $record }
    } catch {
        if ([string]$_ -notmatch "CF_DNS_PERMISSION_REQUIRED") { throw }
        Write-Host "Wrangler OAuth oturumunda DNS duzenleme izni yok." -ForegroundColor Yellow
        Write-Host "Cloudflare yeniden yetkilendirilecek. Acilan ekranda DNS duzenleme iznini kapatmayin." -ForegroundColor Yellow
        & wrangler login
        if ($LASTEXITCODE -ne 0) { Fail "Cloudflare yeniden yetkilendirme tamamlanmadi." }
        Initialize-CloudflareContext
        foreach ($record in $records) { Ensure-CloudflareDnsRecord $record }
    }
}

function Wait-ResendVerification([string]$DomainId) {
    Write-Step "RESEND DOMAIN DOGRULAMA"
    Invoke-ResendApi "POST" "/domains/$DomainId/verify" | Out-Null
    for ($attempt = 1; $attempt -le 180; $attempt++) {
        $detail = Invoke-ResendApi "GET" "/domains/$DomainId"
        $status = ([string]$detail.status).Trim().ToLowerInvariant()
        Write-Host "[$attempt/180] Resend domain durumu: $status"
        if ($status -eq "verified") {
            Write-Host "$DOMAIN Resend: VERIFIED" -ForegroundColor Green
            return $detail
        }
        if ($status -in @("failed","failure","blocked")) {
            $bad = @($detail.records | Where-Object { ([string]$_.status).Trim().ToLowerInvariant() -notin @("verified","success") })
            $summary = try { $bad | ConvertTo-Json -Depth 6 -Compress } catch { "" }
            Fail "Resend domain dogrulamasi basarisiz: $summary"
        }
        Start-Sleep -Seconds 5
    }
    Fail "Resend domain 15 dakika icinde VERIFIED olmadi. DNS yayilimi tamamlanmadan production mail aktif sayilmadi."
}

function Install-WorkerResendSecret {
    Write-Step "WORKER RESEND SECRET"
    Push-Location $WORKER_DIR
    try {
        $script:ResendKey | & wrangler secret put RESEND_API_KEY --config $WRANGLER_CONFIG
        if ($LASTEXITCODE -ne 0) { Fail "RESEND_API_KEY Worker secret olarak kaydedilemedi." }
    } finally { Pop-Location }
    Write-Host "RESEND_API_KEY Cloudflare Worker secret olarak kaydedildi." -ForegroundColor Green
}

function Get-OwnerEmail {
    Push-Location $WORKER_DIR
    try {
        $sql = "SELECT COALESCE(s.email,'') AS email FROM auth_users u LEFT JOIN auth_user_security s ON s.user_id=u.id WHERE u.is_active=1 AND COALESCE(s.email,'')<>'' AND (UPPER(COALESCE(s.role_override,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN') ORDER BY u.created_at LIMIT 1;"
        $raw = (& wrangler d1 execute ky-erp-db --remote --config $WRANGLER_CONFIG --command $sql --json 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $raw) { return "" }
        try { $data = $raw | ConvertFrom-Json } catch { return "" }
        $groups = @($data)
        foreach ($group in $groups) {
            foreach ($row in @($group.results)) {
                $email = ([string]$row.email).Trim()
                if ($email -match '^[^\s@]+@[^\s@]+\.[^\s@]+$') { return $email }
            }
        }
        return ""
    } finally { Pop-Location }
}

function Send-OwnerTestMail {
    Write-Step "GERCEK TEST MAILI"
    $ownerEmail = Get-OwnerEmail
    if (-not $ownerEmail) { Fail "Aktif uygulama sahibinin kayitli e-posta adresi D1'den bulunamadi; test maili atlanmadi, kurulum durduruldu." }
    $sent = Invoke-ResendApi "POST" "/emails" @{
        from = $FROM_ADDRESS
        to = @($ownerEmail)
        subject = "KY ERP sistem e-posta testi"
        text = "KY ERP sistem e-posta kanali aktif. Bu ileti admin@kyerp.net sistem gondericisinin gercek Resend testi olarak olusturuldu."
    }
    $id = [string]$sent.id
    if (-not $id) { Fail "Resend test maili kabul kimligi donmedi." }
    Write-Host "Test alicisi : $ownerEmail" -ForegroundColor Green
    Write-Host "Resend ID    : $id" -ForegroundColor Green
    Write-Host "Gonderici    : $FROM_ADDRESS" -ForegroundColor Green
}

try {
    Write-Host "KY ERP - RESEND / admin@kyerp.net OTOMATIK KURULUM" -ForegroundColor Cyan
    if (-not (Test-Path $WRANGLER_CONFIG)) { Fail "Worker wrangler config bulunamadi: $WRANGLER_CONFIG" }
    if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) { Fail "Wrangler bulunamadi." }

    Push-Location $WORKER_DIR
    try {
        $secretRaw = (& wrangler secret list --config $WRANGLER_CONFIG --format json 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $secretRaw) {
            try {
                $secretRows = @($secretRaw | ConvertFrom-Json)
                if (@($secretRows | Where-Object { ([string]$_.name).Trim() -eq "RESEND_API_KEY" }).Count -gt 0) {
                    Write-Host "RESEND_API_KEY Worker'da zaten mevcut. Anahtar guvenlik geregi geri okunamaz." -ForegroundColor Green
                    Write-Host "Mevcut secret silinmedi veya degistirilmedi." -ForegroundColor Green
                    exit 0
                }
            } catch {}
        }
    } finally { Pop-Location }

    Write-Host "Resend API anahtari Worker'da henuz yok." -ForegroundColor Yellow
    Write-Host "Resend hesabinda bir API key olusturun. Anahtar ekranda gorundugunde buraya yapistirin." -ForegroundColor Yellow
    $script:ResendKey = Read-SecretPlain "RESEND API KEY"
    if (-not $script:ResendKey -or -not $script:ResendKey.StartsWith("re_")) { Fail "Gecerli Resend API key girilmedi." }

    $domain = Ensure-ResendDomain
    Ensure-ResendDns $domain
    $domain = Wait-ResendVerification ([string]$domain.id)
    Install-WorkerResendSecret
    Send-OwnerTestMail

    Write-Host ""
    Write-Host "RESEND KURULUMU TAMAM" -ForegroundColor Green
    Write-Host "Domain       : $DOMAIN / VERIFIED" -ForegroundColor Green
    Write-Host "Gonderici    : $FROM_ADDRESS" -ForegroundColor Green
    Write-Host "Worker secret: RESEND_API_KEY / HAZIR" -ForegroundColor Green
    exit 0
} catch {
    Write-Host ""
    Write-Host "RESEND KURULUM HATASI: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    $script:ResendKey = ""
    $script:CfToken = ""
}
