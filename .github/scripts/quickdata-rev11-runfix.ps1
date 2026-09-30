$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'quickdata-rev11-smart-window.ps1'
$text = Get-Content $src -Raw

# The patched copy runs from RUNNER_TEMP, so pin the original scripts folder first.
$literal = '$PSScriptRoot/quickdata-rev10-clean-person.ps1'
$actual = (Join-Path $PSScriptRoot 'quickdata-rev10-clean-person.ps1').Replace('\','/')
$text = $text.Replace($literal, $actual)

$old = '$s2 = [regex]::Replace($s, $cleanPattern, $cleanReplacement)`nif ($s2 -eq $s) { throw ''REV11 cleanup replacement failed.'' }`n$s = $s2'
$new = @'
$cleanStart = $s.IndexOf('    void CleanSelectedPersonPeriod()')
$listMarker = '    void ListTnf()'
$listStart = $s.IndexOf($listMarker, $cleanStart)
if ($cleanStart -lt 0 -or $listStart -le $cleanStart) { throw 'REV11 cleanup block not found.' }
$s = $s.Substring(0, $cleanStart) + [string]$cleanReplacement + $s.Substring($listStart + $listMarker.Length)
'@
if (-not $text.Contains($old)) {
  $pattern = '(?ms)\$s2 = \[regex\]::Replace\(\$s, \$cleanPattern, \$cleanReplacement\)\s*if \(\$s2 -eq \$s\) \{ throw ''REV11 cleanup replacement failed\.'' \}\s*\$s = \$s2'
  $text2 = [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $new })
  if ($text2 -eq $text) { throw 'REV11 failing replacement block not found.' }
  $text = $text2
} else {
  $text = $text.Replace($old, $new)
}
$tmp = Join-Path $env:RUNNER_TEMP 'quickdata-rev11-smart-window-fixed.ps1'
Set-Content $tmp $text -Encoding UTF8 -NoNewline
& $tmp
