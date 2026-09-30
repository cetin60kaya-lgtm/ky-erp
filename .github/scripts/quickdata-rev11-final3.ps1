$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'quickdata-rev11-final.ps1'
$text = Get-Content $sourcePath -Raw
$rev10 = (Join-Path $PSScriptRoot 'quickdata-rev10-clean-person.ps1').Replace("'","''")
$text = $text.Replace('& "$PSScriptRoot/quickdata-rev10-clean-person.ps1"', "& '$rev10'")
$text = $text.Replace('$s2 = [regex]::Replace($s, $warnPattern, $warnReplacement)', '$rxWarn = [System.Text.RegularExpressions.Regex]::new([string]$warnPattern); $s2 = $rxWarn.Replace([string]$s, [string]$warnReplacement)')
$old = @'
$s2 = [regex]::Replace($s, $cleanPattern, $cleanReplacement)
if ($s2 -eq $s) { throw 'REV11 cleanup replacement failed.' }
$s = $s2
'@
$new = @'
$cleanStartMarker = "    void CleanSelectedPersonPeriod()"
$cleanEndMarker = "    void ListTnf()"
$cleanStart = ([string]$s).IndexOf($cleanStartMarker, [System.StringComparison]::Ordinal)
if ($cleanStart -lt 0) { throw 'REV11 cleanup start marker not found.' }
$cleanEnd = ([string]$s).IndexOf($cleanEndMarker, $cleanStart, [System.StringComparison]::Ordinal)
if ($cleanEnd -lt 0) { throw 'REV11 cleanup end marker not found.' }
$s = ([string]$s).Substring(0, $cleanStart) + [string]$cleanReplacement + ([string]$s).Substring($cleanEnd + $cleanEndMarker.Length)
'@
if (-not $text.Contains($old)) { throw 'REV11 FINAL3 patch marker missing.' }
$text = $text.Replace($old, $new)
$tmp = Join-Path $env:RUNNER_TEMP 'quickdata-rev11-final3-runtime.ps1'
Set-Content $tmp $text -Encoding UTF8
& $tmp
