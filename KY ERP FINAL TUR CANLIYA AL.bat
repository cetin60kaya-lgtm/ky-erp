@echo off
setlocal EnableExtensions
title KY ERP - FINAL TUR CANLIYA AL

set "ROOT=D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ"
set "SCRIPT=%ROOT%\DEPLOY\KYERP_FINAL_ROUND_RELEASE_20260901_V2.ps1"

echo.
echo ============================================================
echo   KY ERP - FINAL TUR CANLIYA AL
echo ============================================================
echo   Mail + MFA + Oturum + IsNet tenant + Worker + Pages
echo   D1 reset YOK / git reset YOK / git clean YOK
echo ============================================================
echo.

if not exist "%ROOT%\.git" (
  echo [HATA] KY ERP repo bulunamadi: %ROOT%
  goto :FAIL
)
if not exist "%SCRIPT%" (
  echo [HATA] Final release scripti bulunamadi: %SCRIPT%
  goto :FAIL
)
where pwsh >nul 2>&1
if errorlevel 1 (
  echo [HATA] PowerShell 7 ^(pwsh^) bulunamadi.
  goto :FAIL
)

cd /d "%ROOT%"
pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo [HATA] Final release tamamlanamadi. Cikis kodu: %RC%
  goto :FAIL
)

echo.
echo ============================================================
echo   KY ERP FINAL TUR BASARILI
echo ============================================================
echo.
pause
exit /b 0

:FAIL
echo.
echo Pencere kapanmayacak. Yukaridaki ilk HATA satirini kontrol edin.
pause
exit /b 1
