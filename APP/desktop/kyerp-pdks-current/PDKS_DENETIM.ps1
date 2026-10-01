$ErrorActionPreference = 'Stop'
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

Set-Location $repoRoot
$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()
if ($branch -ne 'codex/kyerp-pdks-full-app-prep') { throw "Wrong branch: $branch" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check failed' }
$summary.Add("PASS|GIT|$branch|$head")
Set-Location $projectRoot
Run-Step '01_RESTORE' { dotnet restore .\KYERP.PDKS.sln }
Run-Step '02_BUILD' { dotnet build .\KYERP.PDKS.sln -c Release --no-restore }
Run-Step '03_CONTRACT' { dotnet run --project .\tools\ContractTests\ContractTests.csproj -c Release --no-build }
Run-Step '04_SHELL_SMOKE' { dotnet run --project .\tools\ShellSmokeTest\ShellSmokeTest.csproj -c Release --no-build }
Run-Step '05_UI_AUDIT' { dotnet run --project .\tools\UiAudit\UiAudit.csproj -c Release }
Run-Step '06_V4_SHELL' { dotnet run --project .\tools\V4ShellSmoke\V4ShellSmoke.csproj -c Release }

$summary.Add("INFO|Workspace=$workspaceRoot")
$summary.Add("INFO|Project=$projectRoot")
$summary.Add("INFO|Completed=" + (Get-Date).ToString('s'))
$summary | Set-Content -LiteralPath (Join-Path $testRoot 'RESULT.txt') -Encoding UTF8
Write-Host "PDKS_DENETIM_PASS" -ForegroundColor Green
Write-Host "RESULT=$testRoot"
