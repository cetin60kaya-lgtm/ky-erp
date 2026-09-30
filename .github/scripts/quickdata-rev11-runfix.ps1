$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'quickdata-rev11-smart-window.ps1'
$text = Get-Content $src -Raw
$old = '$s2 = [regex]::Replace($s, $cleanPattern, $cleanReplacement)`nif ($s2 -eq $s) { throw ''REV11 cleanup replacement failed.'' }`n$s = $s2'
$new = @'
$cleanStart = $s.IndexOf('    void CleanSelectedPersonPeriod()')
$listMarker = '    void ListTnf()'
$listStart = $s.IndexOf($listMarker, $cleanStart)
if ($cleanStart -lt 0 -or $listStart -le $cleanStart) { throw 'REV11 cleanup block not found.' }
$s = $s.Substring(0, $cleanStart) + [string]$cleanReplacement + $s.Substring($listStart + $listMarker.Length)
'@
if (-not $text.Contains($old)) {
  # Handle CRLF or normalized line endings.
  $text2 = $text -replace '(?ms)\$s2 = \[regex\]::Replace\(\$s, \$cleanPattern, \$cleanReplacement\)\s*if \(\$s2 -eq \$s\) \{ throw ''REV11 cleanup replacement failed\.'' \}\s*\$s = \$s2', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $new }
  if ($text2 -eq $text) { throw 'REV11 failing replacement block not found.' }
  $text = $text2
} else {
  $text = $text.Replace($old, $new)
}
$tmp = Join-Path $env:RUNNER_TEMP 'quickdata-rev11-smart-window-fixed.ps1'
Set-Content $tmp $text -Encoding UTF8 -NoNewline
& $tmp
