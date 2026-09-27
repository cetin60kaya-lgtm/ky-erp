$ErrorActionPreference = "Stop"

$SOURCE = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP_RUNTIME.ps1"

if (-not (Test-Path $SOURCE)) {
    Write-Host "RESEND KURULUM HATASI: Ana Resend bootstrap bulunamadi: $SOURCE" -ForegroundColor Red
    exit 1
}

try {
    $sourceText = Get-Content -LiteralPath $SOURCE -Raw

    # KRITIK: Secret aktif Worker'a standart `wrangler secret put` ile yazilir.
    # `wrangler versions secret put` yalniz yeni bir version'a stage eder ve aktif
    # deployment'in secret'i gormemesine yol acabilir. Ana bootstrap'taki standart
    # komuta dokunma; yalniz beklenen komutun mevcut oldugunu dogrula.
    $liveSecretCommand = '$script:ResendKey | & wrangler secret put RESEND_API_KEY --config $WRANGLER_CONFIG'
    if (-not $sourceText.Contains($liveSecretCommand)) {
        Write-Host "RESEND KURULUM HATASI: Canli Worker secret komutu beklenen formatta bulunamadi; otomatik tahmin yapilmadi." -ForegroundColor Red
        exit 1
    }

    # Domain daha once VERIFIED olduysa DNS tokenini tekrar isteme.
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
