$ErrorActionPreference = 'Stop'
$env:MSBUILDDISABLENODEREUSE = '1'
$env:KYERP_PDKS_BUILD_ROOT = 'D:\KYERP\PDKS\BUILD\DENETIM'
New-Item -ItemType Directory -Force -Path $env:KYERP_PDKS_BUILD_ROOT | Out-Null
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $projectRoot '..\..\..')).Path
$workspaceRoot = [Environment]::GetEnvironmentVariable('KYERP_PDKS_ROOT','User')
if ([string]::IsNullOrWhiteSpace($workspaceRoot)) { $workspaceRoot = 'D:\Googledrive\KYERP-PDKS-MASAUSTU' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$testRoot = Join-Path $workspaceRoot ("08_TEST\DENETIM\" + $stamp)
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
$summary = New-Object System.Collections.Generic.List[string]

function Run-Step([string]$name, [scriptblock]$action) {
    Write-Host "== $name ==" -ForegroundColor Cyan
    $log = Join-Path $testRoot ($name + '.log')
    & $action 2>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) { throw "$name failed with exit code $LASTEXITCODE" }
    $summary.Add("PASS|$name")
}

function Import-UserEnvironment([string[]]$keys) {
    foreach ($key in $keys) {
        if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($key))) { continue }
        $value = [Environment]::GetEnvironmentVariable($key,'User')
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            [Environment]::SetEnvironmentVariable($key,$value,'Process')
        }
    }
}

Set-Location $repoRoot
$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()
if ($branch -ne 'codex/kyerp-pdks-full-app-prep') { throw "Wrong branch: $branch" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
$summary.Add("PASS|GIT|$branch|$head")

Set-Location $projectRoot
Run-Step '01_RESTORE' {
    dotnet restore .\KYERP.PDKS.sln
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    dotnet restore .\tools\FunctionAudit\FunctionAudit.csproj
}
Run-Step '02_BUILD' {
    dotnet build .\KYERP.PDKS.sln -c Release --no-restore /m:1 /nr:false
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    dotnet build .\tools\FunctionAudit\FunctionAudit.csproj -c Release --no-restore /m:1 /nr:false
}
Run-Step '03_CONTRACT' { dotnet run --project .\tools\ContractTests\ContractTests.csproj -c Release --no-build }

$bridge = Get-ChildItem -LiteralPath $env:KYERP_PDKS_BUILD_ROOT -Recurse -Filter 'KYERP.TerminalBridge.exe' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($bridge) {
    [Environment]::SetEnvironmentVariable('KY_PDKS_TERMINAL_BRIDGE',$bridge.FullName,'Process')
    $summary.Add("INFO|TerminalBridge=" + $bridge.FullName)
}

Import-UserEnvironment @('KY_PDKS_DB_HOST','KY_PDKS_DB_PORT','KY_PDKS_DB_USER','KY_PDKS_DB_PASSWORD')
$canonicalDb = Join-Path $workspaceRoot '03_DATA\Hakan Emprime\KY_PDKS_DATA.FDB'
if (-not (Test-Path -LiteralPath $canonicalDb)) {
    $canonicalDb = [Environment]::GetEnvironmentVariable('KY_PDKS_DB_PATH','User')
}
if ([string]::IsNullOrWhiteSpace($canonicalDb) -or -not (Test-Path -LiteralPath $canonicalDb)) {
    throw 'Canonical PDKS database not found for functional audit.'
}
$testDb = Join-Path $testRoot 'KY_PDKS_TEST.FDB'
Copy-Item -LiteralPath $canonicalDb -Destination $testDb -Force
$oldDbPath = [Environment]::GetEnvironmentVariable('KY_PDKS_DB_PATH','Process')
try {
    [Environment]::SetEnvironmentVariable('KY_PDKS_DB_PATH',$testDb,'Process')
    [Environment]::SetEnvironmentVariable('KY_PDKS_SMOKE_LOG',(Join-Path $testRoot '04_CRUD_SMOKE_DETAIL.log'),'Process')
    Run-Step '04_CRUD_SMOKE' { dotnet run --project .\tools\SmokeTest\SmokeTest.csproj -c Release --no-build }
    Run-Step '05_FUNCTION_AUDIT' { dotnet run --project .\tools\FunctionAudit\FunctionAudit.csproj -c Release --no-build }
}
finally {
    [Environment]::SetEnvironmentVariable('KY_PDKS_DB_PATH',$oldDbPath,'Process')
}

Run-Step '06_SHELL_SMOKE' { dotnet run --project .\tools\ShellSmokeTest\ShellSmokeTest.csproj -c Release --no-build }
Run-Step '07_UI_AUDIT' { dotnet run --project .\tools\UiAudit\UiAudit.csproj -c Release }
Run-Step '08_V4_SHELL' { dotnet run --project .\tools\V4ShellSmoke\V4ShellSmoke.csproj -c Release }

$summary.Add("INFO|Workspace=$workspaceRoot")
$summary.Add("INFO|Project=$projectRoot")
$summary.Add("INFO|FunctionalTestDb=$testDb")
$summary.Add("INFO|Completed=" + (Get-Date).ToString('s'))
$summary | Set-Content -LiteralPath (Join-Path $testRoot 'RESULT.txt') -Encoding UTF8
Write-Host "PDKS_DENETIM_PASS" -ForegroundColor Green
Write-Host "RESULT=$testRoot"
