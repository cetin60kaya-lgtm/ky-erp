# KY PDKS — portable native Windows menu QA release, no Cloud deployment.
# Never writes or copies production Firebird FDB, annual TNF, RAW or credentials.
[CmdletBinding()]
param(
  [string]$RepoRoot='',
  [string]$OutputRoot='',
  [switch]$DesktopShortcut
)
$ErrorActionPreference='Stop'
function Check([string]$stage) {
  if($LASTEXITCODE -ne 0){throw ($stage+' FAILED exit='+$LASTEXITCODE)}
}
if(!$RepoRoot){$RepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))}
$RepoRoot=[IO.Path]::GetFullPath($RepoRoot)
if(!(Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))){throw 'REPO_ROOT_REQUIRED'}
if(!$OutputRoot){$OutputRoot='D:\KYERP\PDKS_TEST_RELEASES'}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
if($OutputRoot -match '(?i)Hedef500|KYERP-PDKS-MASAUSTU|PDKS_COPY_STAGE|KY-ERP-MERKEZ\\DATA'){
  throw 'QA_OUTPUT_CANNOT_USE_PRODUCTION_DATA_FOLDER'
}
$frontend=Join-Path $RepoRoot 'APP\app\ky-erp-frontend'
$project=Join-Path $RepoRoot 'APP\pdks-unified\windows\KyPdks.UnifiedHost.csproj'
$sample=Join-Path $RepoRoot 'APP\pdks-unified\windows\qa\ORNEK_TERMINAL_TANI_RAPORU.json'
if(!(Test-Path -LiteralPath (Join-Path $frontend 'node_modules\vite\bin\vite.js'))){
  throw 'NPM_DEPENDENCIES_MISSING'
}
$release=Join-Path $OutputRoot ('KY-PDKS-MENU-TEST-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $release){throw 'QA_RELEASE_ALREADY_EXISTS'}
New-Item -ItemType Directory -Force -Path $release|Out-Null
$oldFlag=$env:VITE_KY_PDKS_QA_BUILD
try {
  Write-Output 'STEP=BUILD_ISOLATED_QA_WEB'
  $env:VITE_KY_PDKS_QA_BUILD='1'
  Push-Location $frontend
  try {
    & cmd.exe /d /c 'npm.cmd run build 2>&1'
    Check 'QA_FRONTEND_BUILD'
  } finally {Pop-Location}
  $web=Join-Path $release 'web'
  New-Item -ItemType Directory -Force -Path $web|Out-Null
  Copy-Item -Path (Join-Path $frontend 'dist\*') -Destination $web -Recurse -Force
  if(!(Test-Path -LiteralPath (Join-Path $web 'index.html'))){throw 'QA_WEB_ASSETS_MISSING'}
  Write-Output 'PASS=BUILD_ISOLATED_QA_WEB'

  Write-Output 'STEP=PUBLISH_PORTABLE_WINDOWS_EXE'
  & dotnet.exe publish $project -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:PublishTrimmed=false -p:DebugType=None -o $release --nologo
  Check 'QA_WINDOWS_PUBLISH'
  $exe=Join-Path $release 'KY.PDKS.Unified.exe'
  if(!(Test-Path -LiteralPath $exe)){throw 'QA_EXE_MISSING'}
  Move-Item -LiteralPath $exe -Destination (Join-Path $release 'KY-PDKS-MENU-TEST.exe')
  Set-Content -LiteralPath (Join-Path $release 'KY-PDKS-MENU-TEST.marker') -Value 'ISOLATED_QA_STATIC_ASSETS_ONLY; NO PRODUCTION DATA' -Encoding ASCII
  Write-Output 'PASS=PUBLISH_PORTABLE_WINDOWS_EXE'

  New-Item -ItemType Directory -Path (Join-Path $release 'TEST_VERISI') -Force|Out-Null
  Copy-Item -LiteralPath $sample -Destination (Join-Path $release 'TEST_VERISI\ORNEK_TERMINAL_TANI_RAPORU.json')
  $readme=@'
KY PDKS — YEREL MENÜ TEST SÜRÜMÜ (Windows 11 x64)
=================================================

1. KY-PDKS-MENU-TEST.exe dosyasına çift tıkla.
2. Sol menüdeki 9 bölüm / 49 alt menüyü ve tema düğmesini kontrol et.
3. Cihaz & Senkron > Aktarım Merkezi menüsüne gir.
4. Terminal koduna: test-terminal-01 yaz.
5. TEST_VERISI\ORNEK_TERMINAL_TANI_RAPORU.json dosyasını seç.
6. Günlük kayıt, eşleşen, bulunamayan, çakışma ve hata
   filtrelerini kontrol et. Görülen örnek kayıtlar gerçekte var değildir.
7. Günlük Aktarımlar, Veri Mutabakatı, TNF Arşivi ve Hata Merkezi
   ekranlarında ortak rapor sayacını ve CSV dışa aktarmayı kontrol et.
8. Cihaz & Senkron > Terminaller içinde marka/model, QR/kart,
   protokol ve bağlantı formunu kontrol et.
9. Cloud Senkron ekranı bilinçli olarak yalnız önizlemedir;
   bu QA paketinde internet veya canlı Cloud D1 kullanılmaz.

CANLI PERSONEL VERİSİ, ŞİRKET HESAPLARI VE FİZİKSEL CİHAZLAR
BU PAKETE DAHİL DEĞİLDİR.
Test ekranları salt okunur; gerçek PDKS/FDB/TNF işlemleri kapalıdır.
Bazı yönetim/puantaj/bordro menüleri henüz canlı işlem kabulünden
geçmedi. Menü açılması üretim işlevinin tamamlandığı anlamına gelmez.

Gereksinimler: .NET 8 Desktop Runtime (x64) ve Microsoft Edge
WebView2 Runtime. Windows 11'de WebView2 çoğunlukla ön yüklüdür.
Bu paket kurulum gerektirmez; açmak için klasörü ZIP'ten çıkar.

Sürüm çıktısı geliştirici PC üzerinde ve izole ortamda üretilir.
Herhangi bir kurumsal kaynak, gizli anahtar veya veri tabanı içermez.
'@
  Set-Content -LiteralPath (Join-Path $release 'ILK_BURAYI_OKU.txt') -Value $readme -Encoding UTF8
  $head=(& git -C $RepoRoot rev-parse HEAD).Trim()
  Check 'QA_RELEASE_HEAD'
  $manifest=[ordered]@{
    title='KY PDKS LOCAL MENU TEST'
    gitHead=$head
    producedAt=(Get-Date).ToString('o')
    buildMode='OFFLINE_WEBVIEW2_QA'
    model='9 sections, 49 tabs'
    physicalDeviceCertified=$false
    productionDataIncluded=$false
    cloudApiEnabled=$false
    firebirdWriteEnabled=$false
    tnfWriteEnabled=$false
    androidIphoneBuild=$false
  }
  $manifest|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $release 'qa-build-info.json') -Encoding UTF8
  $zip=$release+'.zip'
  Compress-Archive -LiteralPath $release -DestinationPath $zip -CompressionLevel Optimal
  if(!(Test-Path -LiteralPath $zip)){throw 'QA_ZIP_MISSING'}
  $digest=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
  Set-Content -LiteralPath ($zip+'.sha256.txt') -Value ($digest+'  '+[IO.Path]::GetFileName($zip)) -Encoding ASCII
  if($DesktopShortcut){
    $desktop=[Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
    if($desktop -and (Test-Path -LiteralPath $desktop)){
      $shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'KY PDKS - MENU TEST.lnk'))
      $shortcut.TargetPath=Join-Path $release 'KY-PDKS-MENU-TEST.exe'
      $shortcut.WorkingDirectory=$release
      $shortcut.Description='Isolated KY PDKS 49-menu QA; no live personnel data'
      $shortcut.Save()
      Write-Output ('DESKTOP_SHORTCUT='+$shortcut.FullName)
    }
  }
  Write-Output 'RESULT=PASS_PORTABLE_QA_RELEASE'
  Write-Output ('QA_EXE='+ (Join-Path $release 'KY-PDKS-MENU-TEST.exe'))
  Write-Output ('QA_ZIP='+$zip)
  Write-Output ('QA_SHA256='+$digest)
  Write-Output ('QA_HEAD='+$head)
} finally {
  $env:VITE_KY_PDKS_QA_BUILD=$oldFlag
}
