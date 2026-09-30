$ErrorActionPreference='Stop'
$src=Join-Path $PSScriptRoot 'quickdata-rev12-dbfirst.ps1'
$text=Get-Content $src -Raw
$bad='$newBtn = "        bar.Controls.Add(B(\"Kontrol Et\", LoadAudit, 105));`r`n        bar.Controls.Add(B(\"SON TAM KONTROL\", FinalFullAudit, 145));"'
$good=@"
`$newBtn = @'
        bar.Controls.Add(B("Kontrol Et", LoadAudit, 105));
        bar.Controls.Add(B("SON TAM KONTROL", FinalFullAudit, 145));
'@
"@
if(-not $text.Contains($bad)){throw 'REV12 quote-fix marker not found.'}
$text=$text.Replace($bad,$good)
$tmp=Join-Path $env:RUNNER_TEMP 'quickdata-rev12-dbfirst-fixed.ps1'
Set-Content $tmp $text -Encoding UTF8 -NoNewline
& $tmp