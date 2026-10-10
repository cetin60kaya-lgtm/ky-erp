[CmdletBinding()]
param([string]$RepoRoot='', [string]$OutputRoot='')
$ErrorActionPreference='Stop'
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
if(!(Test-Path (Join-Path $RepoRoot '.git'))){throw 'REPO_ROOT_REQUIRED'}
if(!$OutputRoot){$OutputRoot=Join-Path $RepoRoot 'APP\pdks-unified\windows\dist'}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
if($OutputRoot -match '(?i)Hedef500|KY-ERP-MERKEZ\\DATA|PDKS_PRIVATE_SNAPSHOTS'){throw 'DATA_ROOT_PROHIBITED'}
$frontend=Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$project=Join-Path $RepoRoot 'APP\pdks-unified\windows\KyPdks.UnifiedHost.csproj'
if(!(Get-Command dotnet.exe -ErrorAction SilentlyContinue)){throw 'DOTNET_SDK_MISSING'}
if(!(Get-Command npm.cmd -ErrorAction SilentlyContinue)){throw 'NPM_MISSING'}
$pf86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$inno=@($pf86,$env:ProgramFiles,$env:LOCALAPPDATA)|Where-Object {$_}|ForEach-Object {
  @( (Join-Path $_ 'Inno Setup 6\ISCC.exe'),(Join-Path $_ 'Programs\Inno Setup 6\ISCC.exe') )
}|Where-Object {Test-Path $_}|Select-Object -First 1
if(!$inno){throw 'INNO_SETUP_6_MISSING'}
& (Join-Path $PSScriptRoot 'Check-UnifiedRuntime.ps1') -FailIfMissing
if(!(Test-Path (Join-Path $frontend 'node_modules\vite\bin\vite.js'))){throw 'NPM_DEPENDENCIES_MISSING'}
$release=Join-Path $OutputRoot ('Unified-'+(Get-Date -Format yyyyMMdd-HHmmss)+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
$publish=Join-Path $release 'publish'
$setup=Join-Path $release 'setup'
New-Item -ItemType Directory -Force $publish,$setup|Out-Null
$previous=$env:VITE_KY_PDKS_QA_BUILD
try {
  $env:VITE_KY_PDKS_QA_BUILD=''
  & npm.cmd --prefix $frontend test
  if($LASTEXITCODE -ne 0){throw 'NODE_TEST_FAILED'}
  & npm.cmd --prefix $frontend run build
  if($LASTEXITCODE -ne 0){throw 'FRONTEND_BUILD_FAILED'}
  & dotnet.exe build $project -c Release
  if($LASTEXITCODE -ne 0){throw 'DOTNET_BUILD_FAILED'}
  & dotnet.exe run --project $project -c Release --no-build -- --agent-safety-selftest
  if($LASTEXITCODE -ne 0){throw 'AGENT_SELFTEST_FAILED'}
  & dotnet.exe publish $project -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:PublishTrimmed=false -o $publish
  if($LASTEXITCODE -ne 0){throw 'WIN_X64_PUBLISH_FAILED'}
  if(!(Test-Path (Join-Path $publish 'KY.PDKS.Unified.exe'))){throw 'EXE_NOT_FOUND'}
  New-Item -ItemType Directory -Force (Join-Path $publish 'web')|Out-Null
  Copy-Item (Join-Path $frontend 'dist\*') (Join-Path $publish 'web') -Recurse -Force
  if(!(Test-Path (Join-Path $publish 'web\index.html'))){throw 'WEB_MISSING'}
  $env:KY_PDKS_UNIFIED_PUBLISH=$publish
  $env:KY_PDKS_UNIFIED_SETUP_OUT=$setup
  & $inno (Join-Path $RepoRoot 'APP\pdks-unified\windows\installer\KY-PDKS-Unified.iss')
  if($LASTEXITCODE -ne 0){throw 'INNO_FAILED'}
  $exe=Get-ChildItem $setup -Filter 'KY-PDKS-Unified-Setup-*.exe'|Select-Object -First 1
  if(!$exe){throw 'SETUP_NOT_FOUND'}
  $sha=(Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$sha  $($exe.Name)"|Set-Content "$($exe.FullName).sha256.txt" -Encoding ASCII
  [ordered]@{gitHead=(& git -C $RepoRoot rev-parse HEAD).Trim();sha256=$sha
    setup=$exe.Name;selfContained=$false;x64=$true;autoServiceInstall=$false
    productionDeployed=$false;legacyWpfMixed=$false
  }|ConvertTo-Json|Set-Content (Join-Path $setup 'build-info.json') -Encoding UTF8
  Write-Output "SETUP_READY=$($exe.FullName)"
} finally {
  $env:VITE_KY_PDKS_QA_BUILD=$previous
  Remove-Item Env:KY_PDKS_UNIFIED_PUBLISH -ErrorAction SilentlyContinue
  Remove-Item Env:KY_PDKS_UNIFIED_SETUP_OUT -ErrorAction SilentlyContinue
}
