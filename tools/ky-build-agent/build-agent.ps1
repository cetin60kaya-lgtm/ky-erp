param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Join-Path $env:LOCALAPPDATA 'KY ERP\BuildAgent'
$ConfigPath = Join-Path $Root 'config.json'
$TokenPath = Join-Path $Root 'token.dat'
$AgentLog = Join-Path $Root 'agent.log'
$WorkRoot = Join-Path $Root 'work'

New-Item $Root -ItemType Directory -Force | Out-Null
New-Item $WorkRoot -ItemType Directory -Force | Out-Null

function Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $AgentLog -Value $line -Encoding UTF8
}
function Load-Config {
  if (-not (Test-Path $ConfigPath)) { throw "Build Agent config bulunamadı: $ConfigPath" }
  return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}
function Load-Token {
  if (-not (Test-Path $TokenPath)) { throw "Build Agent token bulunamadı: $TokenPath" }
  $secure = Get-Content $TokenPath -Raw | ConvertTo-SecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Headers($Token,$AgentId,$AgentName) {
  return @{
    'X-KYERP-Build-Agent-Token' = $Token
    'X-KYERP-Build-Agent-Id' = $AgentId
    'X-KYERP-Build-Agent' = $AgentName
    'Accept' = 'application/json'
  }
}
function Api-Json($Method,$Url,$Headers,$Body=$null) {
  $params = @{ Method=$Method; Uri=$Url; Headers=$Headers; UseBasicParsing=$true; TimeoutSec=120 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }
  $response = Invoke-RestMethod @params
  if ($response.ok -ne $true) { throw ($response.error.message | Out-String) }
  return $response.data
}
function Progress($Base,$Token,$AgentId,$AgentName,$JobId,$Status,$Percent,$Message,$CommitSha='') {
  try {
    Api-Json POST "$Base/api/build-agent/jobs/$JobId/progress" (Headers $Token $AgentId $AgentName) @{
      status=$Status;progress=$Percent;message=$Message;commitSha=$CommitSha;agentName=$AgentName
    } | Out-Null
    return $true
  } catch {
    Log "Progress reddedildi/gönderilemedi: $($_.Exception.Message)"
    return $false
  }
}
function Upload-SmallFile($Base,$Token,$AgentId,$AgentName,$JobId,$Kind,$Path) {
  if (-not (Test-Path $Path)) { return }
  $name = [IO.Path]::GetFileName($Path)
  $uri = "$Base/api/build-agent/jobs/$JobId/file/$Kind?fileName=$([uri]::EscapeDataString($name))"
  Invoke-WebRequest -Method Put -Uri $uri -Headers (Headers $Token $AgentId $AgentName) -InFile $Path -ContentType 'application/octet-stream' -UseBasicParsing -TimeoutSec 300 | Out-Null
}
function Upload-Artifact($Base,$Token,$AgentId,$AgentName,$JobId,$Path) {
  $name = [IO.Path]::GetFileName($Path)
  $size = (Get-Item $Path).Length
  $sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  $start = Api-Json POST "$Base/api/build-agent/jobs/$JobId/multipart/start" (Headers $Token $AgentId $AgentName) @{
    fileName=$name;contentType='application/octet-stream';totalBytes=$size;sha256=$sha256
  }
  $key = [string]$start.key
  $uploadId = [string]$start.uploadId
  $parts = New-Object System.Collections.Generic.List[object]
  $chunkSize = 8MB
  $buffer = New-Object byte[] $chunkSize
  $stream = [IO.File]::OpenRead($Path)
  try {
    $partNumber = 1
    while (($read = $stream.Read($buffer,0,$buffer.Length)) -gt 0) {
      $body = New-Object byte[] $read
      [Buffer]::BlockCopy($buffer,0,$body,0,$read)
      $uri = "$Base/api/build-agent/jobs/$JobId/multipart/part?key=$([uri]::EscapeDataString($key))&uploadId=$([uri]::EscapeDataString($uploadId))&partNumber=$partNumber"
      $resp = Invoke-RestMethod -Method Put -Uri $uri -Headers (Headers $Token $AgentId $AgentName) -Body $body -ContentType 'application/octet-stream' -TimeoutSec 600
      if ($resp.ok -ne $true) { throw "Artifact part $partNumber yüklenemedi." }
      $parts.Add([pscustomobject]@{partNumber=[int]$resp.data.partNumber;etag=[string]$resp.data.etag})
      $partNumber++
    }
    Api-Json POST "$Base/api/build-agent/jobs/$JobId/multipart/complete" (Headers $Token $AgentId $AgentName) @{
      key=$key;uploadId=$uploadId;parts=$parts
    } | Out-Null
  } catch {
    try { Api-Json POST "$Base/api/build-agent/jobs/$JobId/multipart/abort" (Headers $Token $AgentId $AgentName) @{key=$key;uploadId=$uploadId} | Out-Null } catch {}
    throw
  } finally {
    $stream.Dispose()
  }
}
function Invoke-Build($Config,$Token,$AgentId,$AgentName,$Job) {
  $id = [string]$Job.id
  $jobRoot = Join-Path $WorkRoot $id
  if (Test-Path $jobRoot) { Remove-Item $jobRoot -Recurse -Force }
  New-Item $jobRoot -ItemType Directory -Force | Out-Null
  $repoDir = Join-Path $jobRoot 'repo'
  $buildLog = Join-Path $jobRoot 'build.log'
  $base = [string]$Config.apiBase

  try {
    if(-not (Progress $base $Token $AgentId $AgentName $id 'BUILDING' 5 'Kaynak alınıyor.')) { throw 'Build artık aktif değil veya state güncellenemedi.' }
    & git -c core.longpaths=true clone --depth 1 --single-branch --branch ([string]$Job.branch) ([string]$Config.repoUrl) $repoDir *>&1 | Tee-Object -FilePath $buildLog
    if ($LASTEXITCODE -ne 0) { throw "Git clone başarısız. Kod=$LASTEXITCODE" }
    $commit = (& git -C $repoDir rev-parse HEAD).Trim()
    if(-not (Progress $base $Token $AgentId $AgentName $id 'TESTING' 15 'Test + build zinciri başladı.' $commit)) { throw 'Build test aşamasına geçirilemedi.' }

    $script = Join-Path $repoDir ([string]$Job.buildScript)
    if (-not (Test-Path $script)) { throw "Build script bulunamadı: $script" }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script *>&1 | Tee-Object -FilePath $buildLog -Append
    if ($LASTEXITCODE -ne 0) { throw "Build script başarısız. Kod=$LASTEXITCODE" }

    if(-not (Progress $base $Token $AgentId $AgentName $id 'PACKAGING' 80 'Setup doğrulanıyor.' $commit)) { throw 'Build paketleme aşamasına geçirilemedi.' }
    $artifact = Join-Path $repoDir ([string]$Job.artifactRelativePath)
    $shaFile = Join-Path $repoDir ([string]$Job.sha256RelativePath)
    $infoFile = Join-Path $repoDir ([string]$Job.buildInfoRelativePath)
    if (-not (Test-Path $artifact)) { throw "Setup artifact oluşmadı: $artifact" }

    if(-not (Progress $base $Token $AgentId $AgentName $id 'UPLOADING' 88 'Setup R2’ye yükleniyor.' $commit)) { throw 'Build upload aşamasına geçirilemedi.' }
    Upload-SmallFile $base $Token $AgentId $AgentName $id 'LOG' $buildLog
    Upload-SmallFile $base $Token $AgentId $AgentName $id 'SHA256' $shaFile
    Upload-SmallFile $base $Token $AgentId $AgentName $id 'BUILDINFO' $infoFile
    Upload-Artifact $base $Token $AgentId $AgentName $id $artifact

    if(-not (Progress $base $Token $AgentId $AgentName $id 'SUCCESS' 100 'Setup hazır ve R2’ye yüklendi.' $commit)) { throw 'Build başarı durumu kaydedilemedi.' }
    Log "Build SUCCESS id=$id commit=$commit"
  } catch {
    $message = $_.Exception.Message
    Log "Build FAILED id=$id $message"
    try { Upload-SmallFile $base $Token $AgentId $AgentName $id 'LOG' $buildLog } catch {}
    [void](Progress $base $Token $AgentId $AgentName $id 'FAILED' 100 $message)
  } finally {
    try { Remove-Item $jobRoot -Recurse -Force -ErrorAction SilentlyContinue } catch {}
  }
}

$mutex = New-Object Threading.Mutex($false,'Local\KYERP_BUILD_AGENT_SINGLETON')
if (-not $mutex.WaitOne(0,$false)) { exit 0 }

try {
  $config = Load-Config
  $token = Load-Token
  $agentId = [string]$config.agentId
  if ([string]::IsNullOrWhiteSpace($agentId)) { throw 'Build Agent kimliği config içinde yok.' }
  $agentName = if ($config.agentName) { [string]$config.agentName } else { "BUILD-" + $env:COMPUTERNAME }
  $base = ([string]$config.apiBase).TrimEnd('/')
  $poll = [Math]::Max(10,[int]$config.pollSeconds)
  Log "KY Build Agent başladı. Agent=$agentName API=$base"

  while ($true) {
    try {
      $job = Api-Json GET "$base/api/build-agent/next?agent=$([uri]::EscapeDataString($agentName))" (Headers $token $agentId $agentName)
      if ($null -ne $job -and $job.id) { Invoke-Build $config $token $agentId $agentName $job }
    } catch {
      Log "Poll hata: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $poll
  }
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
