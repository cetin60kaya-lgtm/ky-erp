# KY PDKS isolated real-data menu test, one-shot operator launch.
# Does not write to production Firebird, TNF, RAW, Cloudflare or git main.
[CmdletBinding()]
param(
 [string]$RepoRoot='D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web',
 [string]$StageDbPath='D:\KYERP\_TEMP\PDKS_COPY_STAGE_20261008_213329\KY_PDKS_STAGE.FDB'
)
$ErrorActionPreference='Stop'
function Check([string]$phase){
 if($LASTEXITCODE -ne 0){throw ($phase+' FAILED EXIT='+$LASTEXITCODE)}
}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
$StageDbPath=[IO.Path]::GetFullPath($StageDbPath)
if($RepoRoot -match '(?i)Hedef500|KYERP-PDKS-MASAUSTU|\\KY-ERP-MERKEZ\\DATA'){
 throw 'PRODUCTION_REPO_FORBIDDEN'
}
if($StageDbPath -cnotmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$' -or
 !(Test-Path -LiteralPath $StageDbPath -PathType Leaf)){
 throw 'ONLY_GBAK_RESTORED_COPY_FDB_ALLOWED'
}
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){throw 'GIT_WORKTREE_REQUIRED'}
$branch='feature/ky-pdks-unified-product-shell-20261008'
$tracked=& git -C $RepoRoot status --porcelain --untracked-files=no
Check 'GIT_STATUS'
if($tracked){throw 'LOCAL_TRACKED_EDITS_PRESENT_NO_AUTO_DISCARD'}
Write-Output 'STEP=FETCH_EXISTING_PDKS_PR_BRANCH'
& git -C $RepoRoot fetch origin $branch
Check 'GIT_FETCH'
& git -C $RepoRoot checkout --detach FETCH_HEAD
Check 'CHECKOUT_SAFE'
$head=(& git -C $RepoRoot rev-parse HEAD).Trim()
Check 'READ_HEAD'
Write-Output ('HEAD='+$head)
$logroot='D:\KYERP\_TEMP\PDKS_QA_GATE_LOGS'
New-Item -ItemType Directory -Force -Path $logroot|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$log=Join-Path $logroot ('QA_GATE_'+$stamp+'.log')
$gate=Join-Path $RepoRoot 'APP\pdks-unified\windows\tools\Test-UnifiedProductAcceptance.ps1'
Write-Output 'STEP=FULL_49_MENU_WINDOWS_CLOUD_FDB_COPY_GATE'
# Child PowerShell writes some failure diagnostics to STDERR. PowerShell 5
# would treat that as NativeCommandError with Stop and hide the real reason.
# Isolate both streams; use the child's real exit code, never ignore failure.
$gateErr=Join-Path $logroot ('QA_GATE_'+$stamp+'.stderr.log')
$gateArgs='-NoProfile -ExecutionPolicy Bypass -File "'+$gate+'" -RepoRoot "'+$RepoRoot+'" -StageDbPath "'+$StageDbPath+'" -StageCardNo "00003"'
# -Wait can wait on orphaned Chrome descendants after the acceptance
# subprocess has already exited. Wait for the actual child PID only.
$gateProcess=Start-Process -FilePath 'powershell.exe' -ArgumentList $gateArgs -PassThru -NoNewWindow -RedirectStandardOutput $log -RedirectStandardError $gateErr
$gateProcess.WaitForExit()
if($gateProcess.ExitCode -ne 0){
 Write-Output ('FAILED_GATE_EXIT='+$gateProcess.ExitCode)
 Write-Output ('FAILED_GATE_LOG='+$log)
 Write-Output ('FAILED_GATE_STDERR='+$gateErr)
 Write-Output 'LAST_STDOUT_LINES:'
 Get-Content -LiteralPath $log -Tail 60
 if((Get-Item -LiteralPath $gateErr).Length -gt 0){
   Write-Output 'LAST_STDERR_LINES:'
   Get-Content -LiteralPath $gateErr -Tail 20
 }
 throw 'AUTOMATED_TEST_FAILED_NO_NEW_QA_RELEASE_CREATED'
}
Write-Output 'PASS=FULL_49_MENU_WINDOWS_CLOUD_FDB_COPY_GATE'
Write-Output ('EVIDENCE_LOG='+$log)
$builder=Join-Path $RepoRoot 'APP\pdks-unified\windows\tools\Build-KyPdks-MenuTest.ps1'
Write-Output 'STEP=PUBLISH_OFFLINE_REAL_COPY_MENU_QA'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $builder -RepoRoot $RepoRoot -OutputRoot 'D:\KYERP\PDKS_TEST_RELEASES' -DesktopShortcut
Check 'QA_PACKAGE_BUILD'
Write-Output 'RESULT=PASS_PDKS_MENU_TEST_READY_FOR_OPERATOR'
Write-Output ('QA_SOURCE_HEAD='+$head)
Write-Output 'INFO=IMPORT_LOCAL_COPY_JSON_FROM_D_KYERP_TEMP_PDKS_PRIVATE_SNAPSHOTS'
