$ErrorActionPreference = "Stop"

$SOURCE = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP.ps1"
$RUNTIME = Join-Path $PSScriptRoot "KYERP_RESEND_BOOTSTRAP_RUNTIME.ps1"

if (-not (Test-Path $SOURCE)) {
    Write-Host "RESEND KURULUM HATASI: Ana Resend bootstrap bulunamadi: $SOURCE" -ForegroundColor Red
    exit 1
}

try {
    $sourceText = Get-Content -LiteralPath $SOURCE -Raw

    $legacy = '$script:ResendKey | & wrangler secret put RESEND_API_KEY --config $WRANGLER_CONFIG'
    $versioned = '$script:ResendKey | & wrangler versions secret put RESEND_API_KEY --config $WRANGLER_CONFIG'

    if ($sourceText.Contains($legacy)) {
        $sourceText = $sourceText.Replace($legacy, $versioned)
    } elseif (-not $sourceText.Contains($versioned)) {
        Write-Host "RESEND KURULUM HATASI: Worker secret komutu beklenen formatta bulunamadi; otomatik tahmin yapilmadi." -ForegroundColor Red
        exit 1
    }

    Set-Content -LiteralPath $RUNTIME -Value $sourceText -Encoding utf8NoBOM
    & $RUNTIME
    exit $LASTEXITCODE
} finally {
    Remove-Item -LiteralPath $RUNTIME -Force -ErrorAction SilentlyContinue
}
