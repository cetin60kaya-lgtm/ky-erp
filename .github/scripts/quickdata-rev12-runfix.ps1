$ErrorActionPreference='Stop'
$src=Join-Path $PSScriptRoot 'quickdata-rev12-dbfirst.ps1'
$text=Get-Content $src -Raw

# Temp script changes $PSScriptRoot, so pin the verified REV9 base script to its real repo path.
$rev9=(Join-Path $PSScriptRoot 'quickdata-rev9-final2-build.ps1').Replace("'","''")
$baseCall='& "$PSScriptRoot/quickdata-rev9-final2-build.ps1"'
if(-not $text.Contains($baseCall)){throw 'REV12 base-script marker not found.'}
$text=$text.Replace($baseCall,"& '$rev9'")

# REV8 already moved sync settings to SettingsFile(); make REV12 add fields after that marker.
$oldSettings=@'
$oldFields = '    readonly string settingsPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HKN-PDKS", "TNF_FORMAT_AYAR.json");'
if (-not $s.Contains($oldFields)) { $oldFields = '    readonly string settingsPath = Path.Combine(AppContext.BaseDirectory, "TNF_FORMAT_AYAR.json");' }
$newFields = $oldFields + "`r`n    DateTime? auditStartOverride;`r`n    DateTime? auditEndOverride;"
if (-not $s.Contains($oldFields)) { throw 'REV12 settings field marker not found.' }
$s = $s.Replace($oldFields, $newFields)
'@
$newSettings=@'
$oldFields = '    readonly string settingsPath = SettingsFile();'
$newFields = $oldFields + "`r`n    DateTime? auditStartOverride;`r`n    DateTime? auditEndOverride;"
if (-not $s.Contains($oldFields)) { throw 'REV12 settings field marker not found.' }
$s = $s.Replace($oldFields, $newFields)
'@
if(-not $text.Contains($oldSettings)){throw 'REV12 settings-generator marker not found.'}
$text=$text.Replace($oldSettings,$newSettings)

# Repair the one PowerShell quoting line in the REV12 generator without modifying its generated C# text.
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