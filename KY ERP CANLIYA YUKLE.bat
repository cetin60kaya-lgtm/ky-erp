@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title KY ERP - CANLIYA YUKLE

set "ROOT=%~dp0"
set "BRANCH=codex/model-uretim-kontrol-merkezi-final"

cd /d "%ROOT%"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   KY ERP - CANONICAL TEK TIK PRODUCTION
echo ============================================================
echo   Site   : https://kyerp.net/
echo   ERP    : https://app.kyerp.net/
echo   Mail   : KY ERP ^<admin@kyerp.net^>
echo   Branch : %BRANCH%
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [HATA] Git bulunamadi.
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. Windows production standardi Node 22 LTS.
  goto :fail
)
for /f "delims=" %%V in ('node --version') do set "NODE_VER=%%V"
for /f "tokens=1 delims=." %%M in ("!NODE_VER:v=!") do set "NODE_MAJOR=%%M"
if not "!NODE_MAJOR!"=="22" (
  echo [HATA] Node 22 LTS gerekli. Mevcut: !NODE_VER!
  goto :fail
)
echo [OK] Node !NODE_VER!

set "PWSH="
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined PWSH set "PWSH=%%P"
if not defined PWSH (
  echo [HATA] PowerShell 7 bulunamadi.
  goto :fail
)

where wrangler >nul 2>&1
if errorlevel 1 (
  echo [HATA] Wrangler bulunamadi.
  goto :fail
)

git config --global --add safe.directory "%ROOT:~0,-1%" >nul 2>&1
git config --local gc.auto 0 >nul 2>&1
git config --local maintenance.auto false >nul 2>&1
git config --local fetch.writeCommitGraph false >nul 2>&1

set "DIRTY="
for /f "delims=" %%S in ('git status --porcelain --untracked-files^=no') do set "DIRTY=%%S"
if defined DIRTY (
  echo.
  echo [HATA] Tracked yerel degisiklik var. Otomatik reset yapilmadi:
  git status --short
  goto :fail
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "ORIGIN=%%R"
echo !ORIGIN! | findstr /i /l "cetin60kaya-lgtm/ky-erp" >nul
if errorlevel 1 (
  echo [HATA] Yanlis Git origin: !ORIGIN!
  goto :fail
)

echo [GIT] Production kaynak guncelleniyor...
git -c gc.auto=0 -c maintenance.auto=false -c fetch.writeCommitGraph=false fetch origin
if errorlevel 1 goto :fail

git checkout "%BRANCH%"
if errorlevel 1 goto :fail

git -c gc.auto=0 -c maintenance.auto=false -c fetch.writeCommitGraph=false pull --ff-only origin "%BRANCH%"
if errorlevel 1 goto :fail

for /f "delims=" %%S in ('git rev-parse HEAD') do set "LOCAL_SHA=%%S"
for /f "delims=" %%S in ('git rev-parse "origin/%BRANCH%"') do set "REMOTE_SHA=%%S"
if /i not "!LOCAL_SHA!"=="!REMOTE_SHA!" (
  echo [HATA] Local ve origin production SHA ayni degil.
  goto :fail
)
echo [OK] Production SHA: !LOCAL_SHA!

if not exist "%ROOT%DEPLOY\KYERP_RESEND_BOOTSTRAP.ps1" (
  echo [HATA] Resend bootstrap scripti bulunamadi.
  goto :fail
)
if not exist "%ROOT%DEPLOY\KYERP_RESEND_BOOTSTRAP_SAFE.ps1" (
  echo [HATA] Resend versioned Worker uyumluluk scripti bulunamadi.
  goto :fail
)
if not exist "%ROOT%DEPLOY\KYERP_DIRECT_PRODUCTION.ps1" (
  echo [HATA] Canonical deploy scripti bulunamadi.
  goto :fail
)

echo.
echo [MAIL] admin@kyerp.net production mail on-kosulu kontrol ediliyor...
"!PWSH!" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%DEPLOY\KYERP_RESEND_BOOTSTRAP_SAFE.ps1"
set "MAIL_RC=!ERRORLEVEL!"
if not "!MAIL_RC!"=="0" (
  echo.
  echo [HATA] Resend/admin@kyerp.net hazir olmadan production deploy baslatilmadi.
  goto :fail
)

echo.
echo [DEPLOY] Canonical production basliyor...
"!PWSH!" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%DEPLOY\KYERP_DIRECT_PRODUCTION.ps1"
set "RC=!ERRORLEVEL!"
if not "!RC!"=="0" (
  echo.
  echo [HATA] Production deploy hata kodu: !RC!
  goto :fail
)

echo.
echo ============================================================
echo   KY ERP PRODUCTION BASARILI
echo   Site : https://kyerp.net/
echo   ERP  : https://app.kyerp.net/
echo   Mail : KY ERP ^<admin@kyerp.net^>
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo Islem durdu. Yukaridaki ilk HATA satirini kontrol edin.
echo.
pause
exit /b 1
