# KY PDKS - supervised local Codex worker. One run, no production mutation.
[CmdletBinding()]
param(
 [string]$RepoRoot='D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web',
 [string]$AgentRoot='D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL',
 [switch]$PrepareOnly
)
$ErrorActionPreference='Stop'
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){throw 'PDKS_WORKTREE_REQUIRED'}
if($RepoRoot -match '(?i)\\Hedef500\\|KYERP-PDKS-MASAUSTU|\\KY-ERP-MERKEZ\\DATA'){throw 'LIVE_DIRECTORY_FORBIDDEN'}
if(!(Test-Path -LiteralPath $AgentRoot)){throw 'EXISTING_AGENT_ROOT_REQUIRED'}
$branch='feature/ky-pdks-unified-product-shell-20261008'
$task=Join-Path $RepoRoot 'APP\pdks-unified\windows\tools\PDKS_LOCAL_AGENT_GOREV.md'
if(!(Test-Path -LiteralPath $task)){throw 'TASK_FILE_REQUIRED'}
$inbox=Join-Path $AgentRoot 'INBOX'
$outbox=Join-Path $AgentRoot 'OUTBOX'
New-Item -ItemType Directory -Force -Path $inbox,$outbox|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$taskCopy=Join-Path $inbox ('PDKS_REAL_DATA_READONLY_'+$stamp+'.md')
Copy-Item -LiteralPath $task -Destination $taskCopy
Write-Output ('TASK_READY='+$taskCopy)
Write-Output ('REPO='+$RepoRoot)
Write-Output ('OUTPUT='+$outbox)
if($PrepareOnly){Write-Output 'RESULT=TASK_PREPARED_NO_AGENT_EXECUTION';return}
$codex=(Get-Command codex.cmd -ErrorAction SilentlyContinue)
if(!$codex){$codex=Get-Command codex.exe -ErrorAction SilentlyContinue}
if(!$codex){throw 'CODEX_CLI_NOT_INSTALLED'}
$dirty=& git -C $RepoRoot status --porcelain --untracked-files=no
if($LASTEXITCODE -ne 0){throw 'GIT_STATUS_FAILED'}
if($dirty){throw 'TRACKED_CHANGES_EXIST_STOP_BEFORE_CODEX'}
$prompt=@"
Read the task at $taskCopy and the repository README at APP/pdks-unified/README.md.
Proceed only in the isolated checkout $RepoRoot.
Do the read-only evidence audit and code improvements in the task.
Do not operate production databases, devices, Cloudflare, or push/deploy.
Run tests where feasible. Place a short result report in $outbox.
"@
$report=Join-Path $outbox ('PDKS_CODEX_REPORT_'+$stamp+'.txt')
Write-Output ('CODEX_REPORT='+$report)
Push-Location $RepoRoot
try{
  # Explicitly disable approval prompts: workspace-only filesystem scope.
  # This does not authorize writes to external/live directories.
  & $codex.Source exec --sandbox workspace-write --skip-git-repo-check -C $RepoRoot -o $report $prompt
  if($LASTEXITCODE -ne 0){throw ('CODEX_EXEC_FAILED='+$LASTEXITCODE)}
}finally{Pop-Location}
Write-Output 'RESULT=CODEX_WORKSPACE_WORK_FINISHED_REVIEW_REQUIRED'
