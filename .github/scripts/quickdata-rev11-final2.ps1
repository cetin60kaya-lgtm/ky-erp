$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'quickdata-rev11-final.ps1'
$text = Get-Content $sourcePath -Raw
$rev10 = (Join-Path $PSScriptRoot 'quickdata-rev10-clean-person.ps1').Replace("'","''")
$text = $text.Replace('& "$PSScriptRoot/quickdata-rev10-clean-person.ps1"', "& '$rev10'")
$text = $text.Replace('$s2 = [regex]::Replace($s, $warnPattern, $warnReplacement)', '$rxWarn = [System.Text.RegularExpressions.Regex]::new([string]$warnPattern); $s2 = $rxWarn.Replace([string]$s, [string]$warnReplacement)')
$text = $text.Replace('$s2 = [regex]::Replace($s, $cleanPattern, $cleanReplacement)', '$rxClean = [System.Text.RegularExpressions.Regex]::new([string]$cleanPattern); $s2 = $rxClean.Replace([string]$s, [string]$cleanReplacement)')
$tmp = Join-Path $env:RUNNER_TEMP 'quickdata-rev11-final-runtime.ps1'
Set-Content $tmp $text -Encoding UTF8
& $tmp
