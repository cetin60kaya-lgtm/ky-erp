# KY PDKS — safe automated test and coding coordinator. Production write forbidden.
[CmdletBinding()]
param(
 [ValidateSet('Status','Auto','Tests','TestsCandidate','DeviceCheck','Code','InstallCodex')]
 [string]$Mode='Status',
 [string]$RepoRoot='D:\KYERP\_TEMP\PDKS_SAFE_VERIFY_20261008_02\web',
 [string]$StageDbPath='D:\KYERP\_TEMP\PDKS_COPY_STAGE_20261008_213329\KY_PDKS_STAGE.FDB',
 [ValidatePattern('^[0-9]{5}$')][string]$StageCardNo='00003'
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$branch='feature/ky-pdks-unified-product-shell-20261008'
$work='D:\KYERP\_TEMP\PDKS_DEV_COORDINATOR'
$control='D:\GoogleDrive\Hakan Emp\OTOMASYON\KY-CONTROL'
$mutex=[Threading.Mutex]::new($false,'Local\KY_PDKS_DEV_COORDINATOR')
$locked=$false
function Gate([string]$code){throw $code}
function Git([string[]]$arguments){
  $lines=& git.exe -C $RepoRoot @arguments 2>&1
  if($LASTEXITCODE -ne 0){Gate 'GIT_OPERATION_FAILED'}
  return $lines
}
function Receipt([string]$status,[string]$code,[string]$head=''){
  $row=[ordered]@{service='KY_PDKS_DEV_COORDINATOR';at=(Get-Date).ToString('o')
    status=$status;code=$code;head=$head;mode=$Mode
    liveDataWritten=$false;terminalModified=$false;cloudDeployed=$false}
  $json=$row|ConvertTo-Json -Depth 6
  $local=Join-Path $work 'latest-status.json'
  [IO.File]::WriteAllText(($local+'.new'),$json,[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath ($local+'.new') -Destination $local -Force
  $out=Join-Path $control 'OUTBOX'
  if(Test-Path -LiteralPath $out -PathType Container){
    $folder=Join-Path $out 'PDKS_COORDINATOR'
    New-Item -ItemType Directory -Force -Path $folder|Out-Null
    $target=Join-Path $folder 'latest-status.json'
    [IO.File]::WriteAllText(($target+'.new'),$json,[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath ($target+'.new') -Destination $target -Force
  }
  Write-Output ('RESULT='+$status+' CODE='+$code)
  if($head){Write-Output ('HEAD='+$head)}
}
function ChangedOutsideGenerated {
  # The native .NET acceptance build creates ordinary untracked bin/obj
  # outputs in this pre-existing safe checkout. Preserve them, never clean.
  $state=@(Git @('status','--porcelain'))
  return @($state|Where-Object {
    $_ -notmatch '^\?\? APP/pdks-unified/windows/(bin|obj)/
function GetHead {return ([string](Git @('rev-parse','HEAD'))).Trim()}
function RefreshHead {
  CleanCheckout
  [void](Git @('fetch','--quiet','origin',$branch))
  $remote=([string](Git @('rev-parse','FETCH_HEAD'))).Trim()
  if($remote -notmatch '^[a-f0-9]{40}$'){Gate 'INVALID_GIT_REF'}
  if((GetHead) -ne $remote){[void](Git @('checkout','--quiet','--detach',$remote))}
  return $remote
}
function RunFullTests([string]$head){
  $f=[IO.Path]::GetFullPath($StageDbPath)
  if($f -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$' -or
     !(Test-Path -LiteralPath $f -PathType Leaf)){Gate 'ISOLATED_STAGE_FDB_REQUIRED'}
  if(((Get-Item -LiteralPath $f).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
    Gate 'STAGE_REPARSE_POINT_REJECTED'
  }
  $script=Join-Path $RepoRoot 'APP\pdks-unified\windows\tools\Test-UnifiedProductAcceptance.ps1'
  $log=Join-Path $work ('acceptance-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
  Write-Output ('PRIVATE_TEST_LOG='+$log)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -RepoRoot $RepoRoot -StageDbPath $f -StageCardNo $StageCardNo *> $log
  if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'FULL_TEST_GATE_FAILED' $head;return}
  if(!(Select-String -LiteralPath $log -Pattern '^RESULT=PASS_COMPLETE_ISOLATED_PDKS_PREVIEW_AND_SYNC_ACCEPTANCE$' -Quiet)){
    Gate 'TEST_PROOF_MARKER_MISSING'
  }
  [IO.File]::WriteAllText((Join-Path $work 'last-pass.txt'),$head,[Text.UTF8Encoding]::new($false))
  Receipt 'PASS' 'CLOUD_WINDOWS_FIREBIRD_49_TAB' $head
}
try {
  if([IO.Path]::GetFullPath($RepoRoot) -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_SAFE_VERIFY_[^\\]+\\web$'){
    Gate 'EXISTING_ISOLATED_CHECKOUT_ONLY'
  }
  if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){Gate 'CHECKOUT_NOT_FOUND'}
  if(([string](Git @('remote','get-url','origin'))) -notmatch 'cetin60kaya-lgtm/ky-erp'){
    Gate 'WRONG_GITHUB_REPO'
  }
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $locked=$mutex.WaitOne(0)
  if(!$locked){Write-Output 'RESULT=SKIPPED OTHER_WORKER_RUNNING';return}
  $head=GetHead
  if($Mode -eq 'Status'){
    $cli=Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue|Select-Object -First 1
    Write-Output ('CODEX_INSTALLED='+[bool]$cli)
    Write-Output ('KY_CONTROL_INSTALLED='+[bool](Test-Path -LiteralPath (Join-Path $control 'PAYLOAD\PDKS_AGENT_TOOLKIT.ps1')))
    Write-Output ('STAGE_FDB_AVAILABLE='+[bool](Test-Path -LiteralPath $StageDbPath))
    Receipt 'INFO' 'SAFE_COORDINATOR_AVAILABLE' $head;return
  }
  if($Mode -eq 'InstallCodex'){
    if(!(Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue)){
      & npm.cmd install -g '@openai/codex@latest'
      if($LASTEXITCODE -ne 0){Gate 'CODEX_NPM_INSTALL_FAILED'}
    }
    Receipt 'READY' 'CODEX_INSTALLED_LOGIN_REQUIRED' $head
    Write-Output 'NEXT=codex login (interactive account authorization)';return
  }
  if($Mode -eq 'DeviceCheck'){
    $tool=Join-Path $control 'PAYLOAD\PDKS_AGENT_TOOLKIT.ps1'
    if(!(Test-Path -LiteralPath $tool)){Gate 'KY_CONTROL_TOOLKIT_MISSING'}
    $text=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tool -Mode terminal-check
    if($LASTEXITCODE -ne 0){Gate 'TERMINAL_PROBE_FAILED'}
    $o=($text -join [Environment]::NewLine)|ConvertFrom-Json
    $summary=[ordered]@{at=(Get-Date).ToString('o');tcp=[bool]$o.tcp
      sdkAvailable=[bool]$o.sdk;bridgeAvailable=[bool]$o.bridge
      personDetailsShared=$false;deviceModified=$false}
    $summary|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $work 'device-check.json') -Encoding UTF8
    Receipt 'PASS' 'REAL_TERMINAL_NETWORK_METADATA_CHECKED' $head
    Write-Output ('REACHABLE='+[bool]$o.tcp+' SDK='+[bool]$o.sdk+' BRIDGE='+[bool]$o.bridge)
    return
  }
  if($Mode -eq 'Auto'){
    $remote=RefreshHead
    $last=Join-Path $work 'last-pass.txt'
    if((Test-Path -LiteralPath $last) -and ([IO.File]::ReadAllText($last)).Trim() -eq $remote){
      Receipt 'SKIPPED' 'HEAD_ALREADY_ACCEPTED' $remote;return
    }
    RunFullTests $remote;return
  }
  if($Mode -eq 'Tests'){
    RunFullTests (RefreshHead);return
  }
  if($Mode -eq 'TestsCandidate'){
    ValidateCodeCandidate
    $before=GetHead
    RunFullTests $before
    # A code candidate is not published and must be reviewed; prevent its
    # clean HEAD from being treated as a published fully tested release.
    $last=Join-Path $work 'last-pass.txt'
    if(Test-Path -LiteralPath $last){Remove-Item -LiteralPath $last -Force}
    Receipt 'REVIEW' 'CODEX_WORKTREE_ACCEPTANCE_NOT_PUBLISHED' $before
    return
  }
  if($Mode -eq 'Code'){
    $remote=RefreshHead
    $cli=Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue|Select-Object -First 1
    if(!$cli){Receipt 'BLOCKED' 'CODEX_NOT_INSTALLED' $remote;return}
    & $cli.Source login status *> $null
    if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'CODEX_CHATGPT_LOGIN_REQUIRED' $remote;return}
    $mission=Join-Path $RepoRoot 'APP\pdks-unified\PDKS_CODING_AGENT_MISSION.md'
    if(!(Test-Path -LiteralPath $mission)){Gate 'PDKS_AGENT_MISSION_MISSING'}
    $answer=Join-Path $work ('codex-result-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.txt')
    $trace=Join-Path $work ('codex-private-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
    $prompt=(Get-Content -LiteralPath $mission -Raw -Encoding UTF8)+[Environment]::NewLine+
      'SADECE BIR ONCELIKLI PDKS GOREVI KODLA. Yalniz mevcut izole checkoutu degistir. Commit push merge deploy yapma. Uretim verisini okumaya calisma. Sonra yalniz kod ve test kaniti ozeti ver.'
    $secrets=@{}
    try {
      Get-ChildItem Env:|Where-Object {$_.Name -match '^(KY_|CLOUDFLARE_|CF_|FIREBIRD_|ISC_|AWS_|GOOGLE_|OPENAI_API_KEY$)'}|ForEach-Object {
        $secrets[$_.Name]=$_.Value
        [Environment]::SetEnvironmentVariable($_.Name,$null,'Process')
      }
      $prompt | & $cli.Source exec --sandbox workspace-write -C $RepoRoot --output-last-message $answer - *> $trace
      if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'CODEX_EXEC_FAILED' $remote;return}
    } finally {
      foreach($key in $secrets.Keys){[Environment]::SetEnvironmentVariable($key,$secrets[$key],'Process')}
    }
    [void](Git @('diff','--check'))
    $changed=@(ChangedOutsideGenerated)
    $outside=@($changed|Where-Object {$_ -notmatch '^.. (APP/pdks-unified/|APP/app/ky-erp-frontend/src/pages/pdksUnified/|APP/cloud/ky-erp-api/src/ik-pdks-)'})
    if($outside.Count){Receipt 'BLOCKED' 'CODEX_CHANGED_OUTSIDE_PDKS' $remote;return}
    Receipt 'REVIEW' 'CODEX_CHANGESET_READY_UNCOMMITTED' $remote
    Write-Output ('MODIFIED_FILES='+$changed.Count);return
  }
} catch {
  Write-Output 'ERROR=SAFE_COORDINATOR_BLOCKED'
  if(Test-Path -LiteralPath $work){Receipt 'BLOCKED' 'SAFE_GUARD_OR_RUNTIME_ERROR'}
  exit 1
} finally {
  if($locked){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}

  })
}
function CleanCheckout {
  if((ChangedOutsideGenerated).Count -gt 0){Gate 'DIRTY_SOURCE_CHECKOUT_PRESERVED'}
}
function ValidateCodeCandidate {
  $outside=@((ChangedOutsideGenerated)|Where-Object {
    $_ -notmatch '^.. (APP/pdks-unified/|APP/app/ky-erp-frontend/src/pages/pdksUnified/|APP/cloud/ky-erp-api/src/ik-pdks-)'
  })
  if($outside.Count -gt 0){Gate 'CANDIDATE_OUTSIDE_PDKS_SCOPE'}
}
function GetHead {return ([string](Git @('rev-parse','HEAD'))).Trim()}
function RefreshHead {
  CleanCheckout
  [void](Git @('fetch','--quiet','origin',$branch))
  $remote=([string](Git @('rev-parse','FETCH_HEAD'))).Trim()
  if($remote -notmatch '^[a-f0-9]{40}$'){Gate 'INVALID_GIT_REF'}
  if((GetHead) -ne $remote){[void](Git @('checkout','--quiet','--detach',$remote))}
  return $remote
}
function RunFullTests([string]$head){
  $f=[IO.Path]::GetFullPath($StageDbPath)
  if($f -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_COPY_STAGE_[^\\]+\\KY_PDKS_STAGE\.FDB$' -or
     !(Test-Path -LiteralPath $f -PathType Leaf)){Gate 'ISOLATED_STAGE_FDB_REQUIRED'}
  if(((Get-Item -LiteralPath $f).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){
    Gate 'STAGE_REPARSE_POINT_REJECTED'
  }
  $script=Join-Path $RepoRoot 'APP\pdks-unified\windows\tools\Test-UnifiedProductAcceptance.ps1'
  $log=Join-Path $work ('acceptance-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
  Write-Output ('PRIVATE_TEST_LOG='+$log)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -RepoRoot $RepoRoot -StageDbPath $f -StageCardNo $StageCardNo *> $log
  if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'FULL_TEST_GATE_FAILED' $head;return}
  if(!(Select-String -LiteralPath $log -Pattern '^RESULT=PASS_COMPLETE_ISOLATED_PDKS_PREVIEW_AND_SYNC_ACCEPTANCE$' -Quiet)){
    Gate 'TEST_PROOF_MARKER_MISSING'
  }
  [IO.File]::WriteAllText((Join-Path $work 'last-pass.txt'),$head,[Text.UTF8Encoding]::new($false))
  Receipt 'PASS' 'CLOUD_WINDOWS_FIREBIRD_49_TAB' $head
}
try {
  if([IO.Path]::GetFullPath($RepoRoot) -notmatch '(?i)^D:\\KYERP\\_TEMP\\PDKS_SAFE_VERIFY_[^\\]+\\web$'){
    Gate 'EXISTING_ISOLATED_CHECKOUT_ONLY'
  }
  if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){Gate 'CHECKOUT_NOT_FOUND'}
  if(([string](Git @('remote','get-url','origin'))) -notmatch 'cetin60kaya-lgtm/ky-erp'){
    Gate 'WRONG_GITHUB_REPO'
  }
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $locked=$mutex.WaitOne(0)
  if(!$locked){Write-Output 'RESULT=SKIPPED OTHER_WORKER_RUNNING';return}
  $head=GetHead
  if($Mode -eq 'Status'){
    $cli=Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue|Select-Object -First 1
    Write-Output ('CODEX_INSTALLED='+[bool]$cli)
    Write-Output ('KY_CONTROL_INSTALLED='+[bool](Test-Path -LiteralPath (Join-Path $control 'PAYLOAD\PDKS_AGENT_TOOLKIT.ps1')))
    Write-Output ('STAGE_FDB_AVAILABLE='+[bool](Test-Path -LiteralPath $StageDbPath))
    Receipt 'INFO' 'SAFE_COORDINATOR_AVAILABLE' $head;return
  }
  if($Mode -eq 'InstallCodex'){
    if(!(Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue)){
      & npm.cmd install -g '@openai/codex@latest'
      if($LASTEXITCODE -ne 0){Gate 'CODEX_NPM_INSTALL_FAILED'}
    }
    Receipt 'READY' 'CODEX_INSTALLED_LOGIN_REQUIRED' $head
    Write-Output 'NEXT=codex login (interactive account authorization)';return
  }
  if($Mode -eq 'DeviceCheck'){
    $tool=Join-Path $control 'PAYLOAD\PDKS_AGENT_TOOLKIT.ps1'
    if(!(Test-Path -LiteralPath $tool)){Gate 'KY_CONTROL_TOOLKIT_MISSING'}
    $text=& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tool -Mode terminal-check
    if($LASTEXITCODE -ne 0){Gate 'TERMINAL_PROBE_FAILED'}
    $o=($text -join [Environment]::NewLine)|ConvertFrom-Json
    $summary=[ordered]@{at=(Get-Date).ToString('o');tcp=[bool]$o.tcp
      sdkAvailable=[bool]$o.sdk;bridgeAvailable=[bool]$o.bridge
      personDetailsShared=$false;deviceModified=$false}
    $summary|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $work 'device-check.json') -Encoding UTF8
    Receipt 'PASS' 'REAL_TERMINAL_NETWORK_METADATA_CHECKED' $head
    Write-Output ('REACHABLE='+[bool]$o.tcp+' SDK='+[bool]$o.sdk+' BRIDGE='+[bool]$o.bridge)
    return
  }
  if($Mode -eq 'Auto'){
    $remote=RefreshHead
    $last=Join-Path $work 'last-pass.txt'
    if((Test-Path -LiteralPath $last) -and ([IO.File]::ReadAllText($last)).Trim() -eq $remote){
      Receipt 'SKIPPED' 'HEAD_ALREADY_ACCEPTED' $remote;return
    }
    RunFullTests $remote;return
  }
  if($Mode -eq 'Tests'){
    RunFullTests (RefreshHead);return
  }
  if($Mode -eq 'Code'){
    $remote=RefreshHead
    $cli=Get-Command codex.cmd,codex.exe -ErrorAction SilentlyContinue|Select-Object -First 1
    if(!$cli){Receipt 'BLOCKED' 'CODEX_NOT_INSTALLED' $remote;return}
    & $cli.Source login status *> $null
    if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'CODEX_CHATGPT_LOGIN_REQUIRED' $remote;return}
    $mission=Join-Path $RepoRoot 'APP\pdks-unified\PDKS_CODING_AGENT_MISSION.md'
    if(!(Test-Path -LiteralPath $mission)){Gate 'PDKS_AGENT_MISSION_MISSING'}
    $answer=Join-Path $work ('codex-result-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.txt')
    $trace=Join-Path $work ('codex-private-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
    $prompt=(Get-Content -LiteralPath $mission -Raw -Encoding UTF8)+[Environment]::NewLine+
      'SADECE BIR ONCELIKLI PDKS GOREVI KODLA. Yalniz mevcut izole checkoutu degistir. Commit push merge deploy yapma. Uretim verisini okumaya calisma. Sonra yalniz kod ve test kaniti ozeti ver.'
    $secrets=@{}
    try {
      Get-ChildItem Env:|Where-Object {$_.Name -match '^(KY_|CLOUDFLARE_|CF_|FIREBIRD_|ISC_|AWS_|GOOGLE_|OPENAI_API_KEY$)'}|ForEach-Object {
        $secrets[$_.Name]=$_.Value
        [Environment]::SetEnvironmentVariable($_.Name,$null,'Process')
      }
      $prompt | & $cli.Source exec --sandbox workspace-write -C $RepoRoot --output-last-message $answer - *> $trace
      if($LASTEXITCODE -ne 0){Receipt 'BLOCKED' 'CODEX_EXEC_FAILED' $remote;return}
    } finally {
      foreach($key in $secrets.Keys){[Environment]::SetEnvironmentVariable($key,$secrets[$key],'Process')}
    }
    [void](Git @('diff','--check'))
    $changed=@(Git @('status','--porcelain'))
    $outside=@($changed|Where-Object {$_ -notmatch '^.. (APP/pdks-unified/|APP/app/ky-erp-frontend/src/pages/pdksUnified/|APP/cloud/ky-erp-api/src/ik-pdks-)'})
    if($outside.Count){Receipt 'BLOCKED' 'CODEX_CHANGED_OUTSIDE_PDKS' $remote;return}
    Receipt 'REVIEW' 'CODEX_CHANGESET_READY_UNCOMMITTED' $remote
    Write-Output ('MODIFIED_FILES='+$changed.Count);return
  }
} catch {
  Write-Output 'ERROR=SAFE_COORDINATOR_BLOCKED'
  if(Test-Path -LiteralPath $work){Receipt 'BLOCKED' 'SAFE_GUARD_OR_RUNTIME_ERROR'}
  exit 1
} finally {
  if($locked){$mutex.ReleaseMutex()}
  $mutex.Dispose()
}
