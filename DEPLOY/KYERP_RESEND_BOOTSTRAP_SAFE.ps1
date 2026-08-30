$ErrorActionPreference = "Stop"

$SOURCE = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP_RUNTIME.ps1"

if (-not (Test-Path $SOURCE)) {
    Write-Host "RESEND KURULUM HATASI: Ana Resend bootstrap bulunamadi: $SOURCE" -ForegroundColor Red
    exit 1
}

try {
    $sourceText = Get-Content -LiteralPath $SOURCE -Raw

    # Wrangler 4.x versioned Worker durumunda klasik `secret put`, son yuklenen
    # versiyon deploy edilmemisse bilerek reddedilir. Secret'i latest version'a
    # stage et; canonical production deploy hemen arkasindan bu versiyonu canliya alir.
    $legacy = '$script:ResendKey | & wrangler secret put RESEND_API_KEY --config $WRANGLER_CONFIG'
    $versioned = '$script:ResendKey | & wrangler versions secret put RESEND_API_KEY --config $WRANGLER_CONFIG'

    if ($sourceText.Contains($legacy)) {
        $sourceText = $sourceText.Replace($legacy, $versioned)
    } elseif (-not $sourceText.Contains($versioned)) {
        Write-Host "RESEND KURULUM HATASI: Worker secret komutu beklenen formatta bulunamadi; otomatik tahmin yapilmadi." -ForegroundColor Red
        exit 1
    }

    # Domain bir onceki denemede VERIFIED olduysa DNS tokenini tekrar isteme.
    # DNS sadece domain verified degilse yazilir/dogrulanir.
    $dnsPattern = '(?m)^\s*\$domain = Ensure-ResendDomain\r?\n\s*Ensure-ResendDns \$domain\r?\n\s*\$domain = Wait-ResendVerification \(\[string\]\$domain\.id\)\s*$'
    $dnsReplacement = @'
    $domain = Ensure-ResendDomain
    $domainStatus = ([string]$domain.status).Trim().ToLowerInvariant()
    if ($domainStatus -eq "verified") {
        Write-Host "kyerp.net Resend domain zaten VERIFIED; DNS tokeni tekrar istenmeyecek." -ForegroundColor Green
    } else {
        Ensure-ResendDns $domain
        $domain = Wait-ResendVerification ([string]$domain.id)
    }
'@

    if ([regex]::IsMatch($sourceText, $dnsPattern)) {
        $sourceText = [regex]::Replace($sourceText, $dnsPattern, $dnsReplacement, 1)
    } elseif (-not $sourceText.Contains('DNS tokeni tekrar istenmeyecek')) {
        Write-Host "RESEND KURULUM HATASI: Resend DNS akisi beklenen formatta bulunamadi; otomatik tahmin yapilmadi." -ForegroundColor Red
        exit 1
    }

    Set-Content -LiteralPath $RUNTIME -Value $sourceText -Encoding utf8NoBOM
    & $RUNTIME
    exit $LASTEXITCODE
} finally {
    Remove-Item -LiteralPath $RUNTIME -Force -ErrorAction SilentlyContinue
}
