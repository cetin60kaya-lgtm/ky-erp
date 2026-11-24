# Chrome extension preparation only. No browser security changes, no automatic install.
$ErrorActionPreference='Stop'
$base='https://raw.githubusercontent.com/cetin60kaya-lgtm/ky-erp/5797127ae7f30864203fe3037e676e5f4a972e90/TOOLS/isnet-browser-bridge'
$folder=Join-Path $env:LOCALAPPDATA 'KYERP\NetteFaturaChrome'
New-Item -ItemType Directory -Force -Path $folder|Out-Null
foreach($f in @('manifest.json','core.js','background.js','content.js','panel.css','README.md')){
 Invoke-WebRequest -UseBasicParsing -Uri "$base/$f" -OutFile (Join-Path $folder $f) -TimeoutSec 40
}
$m=Get-Content (Join-Path $folder 'manifest.json') -Raw|ConvertFrom-Json
if($m.manifest_version -ne 3 -or $m.version -ne '0.1.0' -or $m.host_permissions.Count -ne 1 -or $m.host_permissions[0] -ne 'https://nettefatura.isnet.net.tr/*'){throw 'Extension manifest scope mismatch'}
foreach($f in @('core.js','background.js','content.js')){ & node --check (Join-Path $folder $f);if($LASTEXITCODE -ne 0){throw "Syntax check failed: $f"} }
Write-Output 'KY_EXTENSION_FILES_READY=True'
Write-Output ('EXTENSION_FOLDER='+$folder)
Write-Output 'Chrome: chrome://extensions > Developer mode > Load unpacked > EXTENSION_FOLDER'
