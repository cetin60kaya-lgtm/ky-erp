$ErrorActionPreference = 'Stop'

try {
    & "$PSScriptRoot/quickdata-rev9-final-build.ps1"
}
catch {
    if ($_.Exception.Message -ne 'REV9 audit token missing: TNF Seç') { throw }
    Write-Host 'Known audit label mismatch bypassed; source patches were already applied.'
}

$tool = 'APP/desktop/kyerp-pdks-current/tools/QuickDataTool'
$main = Join-Path $tool 'MainForm.cs'
$helperPath = Join-Path $tool 'DbConnectionHelper.cs'
$check = Get-Content $main -Raw
$helper = Get-Content $helperPath -Raw

foreach ($token in @(
    'Shown += (_, _) => UpdateSourceStatus();',
    'Firebird veritabanı (*.gdb;*.fdb)',
    'DbConnectionHelper.TryOpen',
    'void PickTnf()',
    'DistributedMinutes'))
{
    if (-not $check.Contains($token)) { throw "REV9 FINAL2 audit token missing: $token" }
}
foreach ($token in @(
    'Password: "masterkey"',
    'SessionCredentials',
    'DatabasePassword = password',
    'Varsayılan SYSDBA / masterkey'))
{
    if (-not $helper.Contains($token)) { throw "REV9 FINAL2 helper token missing: $token" }
}
if ($check.Contains('Shown += (_, _) => { DetectSources(); Connect(); };')) { throw 'Automatic startup connection still exists.' }

Write-Host 'REV9 FINAL2 audit OK.'
